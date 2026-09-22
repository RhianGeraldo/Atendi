/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getMetaCapiConfig, sendMetaCapiEvent, type MetaCapiSettings } from "../server/meta-capi";

/**
 * 1. Consulta as configurações da Meta CAPI da empresa
 */
export const getMetaCapiConfigAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;
    const { config, effectiveToken } = await getMetaCapiConfig(companyId);

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("meta_system_user_token")
      .eq("id", companyId)
      .single();

    return {
      config,
      hasMetaSystemUserToken: !!company?.meta_system_user_token,
      effectiveTokenPreview: effectiveToken
        ? `${effectiveToken.slice(0, 8)}...${effectiveToken.slice(-4)}`
        : null,
    };
  });

/**
 * 2. Salva as configurações da Meta CAPI da empresa
 */
export const saveMetaCapiConfigAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      config: z.object({
        enabled: z.boolean(),
        pixel_id: z.string().trim(),
        access_token: z.string().trim().optional(),
        test_event_code: z.string().trim().optional(),
        track_ctwa_leads: z.boolean().default(true),
        track_stage_moves: z.boolean().default(true),
        track_won_purchases: z.boolean().default(true),
        default_lead_value: z.number().optional().nullable(),
        currency: z.string().default("BRL"),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, config } = data;

    // Tentar atualizar primeiramente a coluna meta_capi_settings se ela já foi migrada
    let updateSuccess = false;

    try {
      const { error: colErr } = await (supabaseAdmin.from("companies") as any)
        .update({
          meta_capi_settings: config,
        })
        .eq("id", companyId);

      if (!colErr) {
        updateSuccess = true;
      } else if (colErr.code !== "42703") {
        // Se for outro erro além de 'coluna inexistente', reporta
        throw colErr;
      }
    } catch (err: any) {
      if (err?.code !== "42703") {
        console.warn("[saveMetaCapiConfigAction] Tentativa de coluna meta_capi_settings:", err);
      }
    }

    // Fallback garantido: salvar dentro de custom_variables.meta_capi
    const { data: comp } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    const currentVars = (comp?.custom_variables as Record<string, any>) || {};
    const updatedVars = {
      ...currentVars,
      meta_capi: config,
    };

    const { error: varsErr } = await supabaseAdmin
      .from("companies")
      .update({
        custom_variables: updatedVars,
      })
      .eq("id", companyId);

    if (varsErr && !updateSuccess) {
      console.error("[saveMetaCapiConfigAction] Erro ao salvar configurações:", varsErr);
      throw new Error(`Falha ao salvar configurações da Meta CAPI: ${varsErr.message}`);
    }

    return {
      success: true,
      config,
    };
  });

/**
 * 3. Testa envio de evento de teste para o Pixel da Meta
 */
export const testMetaCapiEventAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      testEventCode: z.string().optional(),
      eventName: z.string().default("Lead"),
      contactId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, testEventCode, eventName, contactId } = data;

    const result = await sendMetaCapiEvent({
      companyId,
      contactId,
      eventName,
      testEventCode,
      value: 100,
      currency: "BRL",
      contentName: "Teste Meta Conversions API (Atendi)",
      actionSource: "system_generated",
    });

    return result;
  });

/**
 * 4. Lista os últimos logs de envio da Meta CAPI para auditoria
 */
export const listMetaCapiLogsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(30),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, limit } = data;

    try {
      const { data: logs, error } = await (supabaseAdmin.from("meta_capi_logs") as any)
        .select(
          `
          id,
          event_name,
          event_id,
          ctwa_clid,
          value,
          currency,
          status,
          test_code,
          error_message,
          created_at,
          contacts ( name, phone )
        `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        if (error.code === "42P01") {
          // Tabela ainda não migrada
          return { logs: [] };
        }
        console.error("[listMetaCapiLogsAction] Erro:", error);
        return { logs: [] };
      }

      return { logs: logs || [] };
    } catch (err: any) {
      if (err?.code !== "42P01") {
        console.warn("[listMetaCapiLogsAction] Exceção:", err);
      }
      return { logs: [] };
    }
  });

/**
 * 5. Dispara evento de CAPI relacionado a movimentação de funil ou vitória no CRM
 */
export const triggerOpportunityCapiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      opportunityId: z.string().uuid(),
      triggerType: z.enum(["stage_change", "won"]),
      stageId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, opportunityId, triggerType, stageId } = data;

    const { config } = await getMetaCapiConfig(companyId);
    if (!config.enabled) {
      return { skipped: true, reason: "Meta CAPI desativada" };
    }

    if (triggerType === "won") {
      if (!config.track_won_purchases) {
        return { skipped: true, reason: "Rastreamento de compras ganhas desativado" };
      }

      return await sendMetaCapiEvent({
        companyId,
        opportunityId,
        eventName: "Purchase",
        eventId: `won_${opportunityId}`,
        actionSource: "system_generated",
      });
    }

    if (triggerType === "stage_change") {
      if (!config.track_stage_moves || !stageId) {
        return { skipped: true, reason: "Rastreamento de etapas desativado ou sem etapa" };
      }

      // Buscar evento meta configurado na etapa
      const { data: stage } = await (supabaseAdmin.from("pipeline_stages") as any)
        .select("name, meta_event_name")
        .eq("id", stageId)
        .single();

      const metaEvent = stage?.meta_event_name;
      if (!metaEvent || metaEvent === "none" || metaEvent === "") {
        return { skipped: true, reason: "Etapa sem evento Meta mapeado" };
      }

      return await sendMetaCapiEvent({
        companyId,
        opportunityId,
        eventName: metaEvent,
        eventId: `stage_${opportunityId}_${stageId}_${Date.now()}`,
        actionSource: "system_generated",
      });
    }

    return { skipped: true, reason: "Tipo de trigger desconhecido" };
  });
