/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_SLA_SETTINGS, type SlaSettings } from "@/lib/sla";

/**
 * 1. Obtém as configurações de SLA da empresa
 */
export const getSlaSettingsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !company) {
      return DEFAULT_SLA_SETTINGS;
    }

    const customVars = (company.custom_variables as Record<string, any>) || {};
    const savedSla = customVars.sla as Partial<SlaSettings> | undefined;

    if (!savedSla || typeof savedSla !== "object") {
      return DEFAULT_SLA_SETTINGS;
    }

    return {
      enabled: savedSla.enabled !== undefined ? Boolean(savedSla.enabled) : DEFAULT_SLA_SETTINGS.enabled,
      first_response_limit_minutes:
        typeof savedSla.first_response_limit_minutes === "number"
          ? savedSla.first_response_limit_minutes
          : DEFAULT_SLA_SETTINGS.first_response_limit_minutes,
      response_limit_minutes:
        typeof savedSla.response_limit_minutes === "number"
          ? savedSla.response_limit_minutes
          : DEFAULT_SLA_SETTINGS.response_limit_minutes,
      resolution_limit_hours:
        typeof savedSla.resolution_limit_hours === "number"
          ? savedSla.resolution_limit_hours
          : DEFAULT_SLA_SETTINGS.resolution_limit_hours,
      warning_threshold_percent:
        typeof savedSla.warning_threshold_percent === "number"
          ? savedSla.warning_threshold_percent
          : DEFAULT_SLA_SETTINGS.warning_threshold_percent,
      count_business_hours_only:
        savedSla.count_business_hours_only !== undefined
          ? Boolean(savedSla.count_business_hours_only)
          : DEFAULT_SLA_SETTINGS.count_business_hours_only,
    };
  });

/**
 * 2. Salva as configurações de SLA da empresa
 */
export const saveSlaSettingsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      settings: z.object({
        enabled: z.boolean(),
        first_response_limit_minutes: z.number().min(1).max(1440),
        response_limit_minutes: z.number().min(1).max(1440),
        resolution_limit_hours: z.number().min(1).max(720),
        warning_threshold_percent: z.number().min(10).max(95),
        count_business_hours_only: z.boolean().default(false),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, settings } = data;

    // Busca custom_variables atual para preservar outras configurações (ex: meta_capi)
    const { data: company, error: fetchErr } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (fetchErr) {
      throw new Error(`Erro ao buscar dados da empresa: ${fetchErr.message}`);
    }

    const currentVars = (company?.custom_variables as Record<string, any>) || {};
    const updatedVars = {
      ...currentVars,
      sla: settings,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("companies")
      .update({
        custom_variables: updatedVars,
      })
      .eq("id", companyId);

    if (updateErr) {
      throw new Error(`Erro ao salvar configurações de SLA: ${updateErr.message}`);
    }

    return { success: true, settings };
  });
