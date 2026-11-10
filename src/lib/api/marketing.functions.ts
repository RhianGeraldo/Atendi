/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Valida se o usuário pertence à empresa
 */
async function assertCompanyAccess(userId: string, companyId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .single();

  if (!profile || (profile.company_id !== companyId && profile.role !== "super_admin")) {
    throw new Error("Acesso negado: você não pertence a esta empresa.");
  }
  return profile;
}

export interface MarketingKpis {
  total_leads: number;
  total_opportunities: number;
  total_won_deals: number;
  total_won_revenue: number;
  conversion_rate: number;
  ticket_medio: number;
}

export interface MarketingAdItem {
  source_id: string;
  ad_title: string;
  ad_body: string;
  thumbnail_url: string;
  source_url: string;
  source_app: string;
  campaign_name: string | null;
  adset_name: string | null;
  leads_count: number;
  opportunities_count: number;
  won_count: number;
  won_revenue: number;
  conversion_rate: number;
  ticket_medio: number;
  first_lead_at: string;
  last_lead_at: string;
}

export interface MarketingAdContact {
  lead_id: string;
  lead_created_at: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  unit_name: string | null;
  conversation_id: string | null;
  opportunity_id: string | null;
  opportunity_status: string | null;
  opportunity_value: number;
}

/**
 * Retorna as métricas agregadas de Tráfego Pago e ROI por criativo
 */
export const getMarketingAnalyticsAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().optional().nullable(),
      startDate: z.string().optional().nullable(),
      endDate: z.string().optional().nullable(),
      sourceApp: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const unitIdParam = data.unitId && data.unitId !== "all" ? data.unitId : null;
    const sourceAppParam = data.sourceApp && data.sourceApp !== "all" ? data.sourceApp : null;

    const { data: result, error } = await (supabaseAdmin.rpc as any)(
      "get_marketing_roi_analytics",
      {
        p_company_id: data.companyId,
        p_unit_id: unitIdParam,
        p_start_date: data.startDate || null,
        p_end_date: data.endDate || null,
        p_source_app: sourceAppParam,
      },
    );

    if (error) {
      console.error("[getMarketingAnalyticsAction] RPC error:", error);
      throw new Error(`Falha ao calcular métricas de marketing: ${error.message}`);
    }

    const typedResult = result as { kpis: MarketingKpis; ads: MarketingAdItem[] };
    return {
      kpis: typedResult?.kpis || {
        total_leads: 0,
        total_opportunities: 0,
        total_won_deals: 0,
        total_won_revenue: 0,
        conversion_rate: 0,
        ticket_medio: 0,
      },
      ads: typedResult?.ads || [],
    };
  });

/**
 * Lista os contatos que entraram através de um anúncio específico
 */
export const getAdContactsAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      sourceId: z.string().min(1),
      unitId: z.string().optional().nullable(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const unitIdParam = data.unitId && data.unitId !== "all" ? data.unitId : null;

    const { data: contacts, error } = await (supabaseAdmin.rpc as any)("get_ad_contacts", {
      p_company_id: data.companyId,
      p_source_id: data.sourceId,
      p_unit_id: unitIdParam,
      p_limit: data.limit,
      p_offset: data.offset,
    });

    if (error) {
      console.error("[getAdContactsAction] RPC error:", error);
      throw new Error(`Falha ao buscar contatos do anúncio: ${error.message}`);
    }

    return (contacts || []) as MarketingAdContact[];
  });

/**
 * Tenta enriquecer dados do anúncio com a Meta Graph API (se houver token com permissão ads_read)
 */
export const syncMetaAdDetailsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      adId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    // Busca token de marketing da empresa ou token oficial do WhatsApp/Instagram
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("meta_settings")
      .eq("id", data.companyId)
      .single();

    const marketingToken = (company as any)?.meta_settings?.marketing_access_token;
    if (!marketingToken) {
      return { success: false, message: "Token da Meta Marketing API não configurado na empresa." };
    }

    try {
      const graphUrl = `https://graph.facebook.com/v21.0/${data.adId}?fields=id,name,status,campaign{id,name,status},adset{id,name,status},creative{id,name,title,body,image_url}&access_token=${marketingToken}`;
      const res = await fetch(graphUrl);
      const adData = await res.json();

      if (adData.error) {
        console.warn("[syncMetaAdDetailsAction] Meta Graph API error:", adData.error);
        return { success: false, error: adData.error.message };
      }

      const upsertPayload = {
        ad_id: data.adId,
        company_id: data.companyId,
        ad_name: adData.name || null,
        ad_body: adData.creative?.body || null,
        thumbnail_url: adData.creative?.image_url || null,
        campaign_id: adData.campaign?.id || null,
        campaign_name: adData.campaign?.name || null,
        adset_id: adData.adset?.id || null,
        adset_name: adData.adset?.name || null,
        status: adData.status || "ACTIVE",
        last_synced_at: new Date().toISOString(),
      };

      await supabaseAdmin.from("meta_ads_cache").upsert(upsertPayload, { onConflict: "ad_id" });

      return { success: true, data: upsertPayload };
    } catch (e: any) {
      console.error("[syncMetaAdDetailsAction] Exception:", e);
      return { success: false, error: e.message || String(e) };
    }
  });
