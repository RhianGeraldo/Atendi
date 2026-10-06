/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const recordActivityHeartbeatAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      status: z.enum(["active", "idle", "background", "offline"]),
      intervalSeconds: z.number().int().min(1).max(300).default(30),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { status, intervalSeconds } = data;

    // Obtém a empresa do usuário autenticado
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (profErr || !profile || !profile.company_id) {
      return { success: false, error: "Perfil ou empresa não encontrados" };
    }

    // Executa a função RPC atômica no banco de dados
    const { error: rpcErr } = await (supabaseAdmin.rpc as any)("record_user_heartbeat", {
      p_user_id: userId,
      p_company_id: profile.company_id,
      p_status: status,
      p_interval_seconds: intervalSeconds,
    });

    if (rpcErr) {
      console.error("[ActivityHeartbeat] Erro ao registrar heartbeat:", rpcErr);
      return { success: false, error: rpcErr.message };
    }

    return { success: true };
  });

export const getUserActivityReportAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      startDate: z.string().optional(), // YYYY-MM-DD
      endDate: z.string().optional(),   // YYYY-MM-DD
      userId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, startDate, endDate, userId } = data;

    let query = supabaseAdmin
      .from("user_daily_activity")
      .select(`
        id,
        user_id,
        company_id,
        date,
        total_logged_seconds,
        total_active_seconds,
        total_idle_seconds,
        total_background_seconds,
        current_status,
        last_heartbeat_at,
        profiles!user_daily_activity_user_id_fkey(id, name, email, avatar_url, role)
      `)
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error("[getUserActivityReportAction] Erro:", error);
      throw new Error("Falha ao carregar relatório de atividades");
    }

    return (records || []).map((r: any) => {
      const logged = r.total_logged_seconds || 0;
      const active = r.total_active_seconds || 0;
      const activeRatio = logged > 0 ? Math.round((active / logged) * 100) : 0;

      return {
        ...r,
        active_ratio: activeRatio,
      };
    });
  });
