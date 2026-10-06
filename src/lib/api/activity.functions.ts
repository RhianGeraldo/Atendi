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
      unitId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, startDate, endDate, userId, unitId } = data;

    // 1. Busca todos os usuários ativos da empresa
    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select(`
        id,
        name,
        email,
        avatar_url,
        role,
        active,
        online,
        current_status,
        last_seen_at,
        has_matriz_access,
        user_units(unit_id)
      `)
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (userId) {
      profilesQuery = profilesQuery.eq("id", userId);
    }

    const { data: allProfiles, error: profErr } = await profilesQuery;
    if (profErr) {
      console.error("[getUserActivityReportAction] Erro ao buscar perfis:", profErr);
      throw new Error("Falha ao carregar colaboradores");
    }

    // Filtra por unidade se fornecido
    const filteredProfiles = (allProfiles || []).filter((p: any) => {
      if (!unitId) return true;
      if (p.has_matriz_access || p.role === "admin_company" || p.role === "super_admin") return true;
      const userUnitIds = (p.user_units || []).map((u: any) => u.unit_id);
      return userUnitIds.includes(unitId);
    });

    const targetUserIds = filteredProfiles.map((p: any) => p.id);
    if (targetUserIds.length === 0) {
      return [];
    }

    // 2. Busca registros diários acumulados no período para os colaboradores
    let actQuery = supabaseAdmin
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
        last_heartbeat_at
      `)
      .eq("company_id", companyId)
      .in("user_id", targetUserIds);

    if (startDate) {
      actQuery = actQuery.gte("date", startDate);
    }
    if (endDate) {
      actQuery = actQuery.lte("date", endDate);
    }

    const { data: actRecords, error: actErr } = await actQuery;
    if (actErr) {
      console.error("[getUserActivityReportAction] Erro ao buscar atividades:", actErr);
      throw new Error("Falha ao carregar relatório de atividades");
    }

    // 3. Agrega as atividades do período por colaborador
    const activityMap = new Map<string, {
      total_logged_seconds: number;
      total_active_seconds: number;
      total_idle_seconds: number;
      total_background_seconds: number;
      current_status: string;
      last_heartbeat_at: string | null;
      days: Array<{
        date: string;
        logged_seconds: number;
        active_seconds: number;
        idle_seconds: number;
        background_seconds: number;
      }>;
    }>();

    (actRecords || []).forEach((r: any) => {
      if (!activityMap.has(r.user_id)) {
        activityMap.set(r.user_id, {
          total_logged_seconds: 0,
          total_active_seconds: 0,
          total_idle_seconds: 0,
          total_background_seconds: 0,
          current_status: r.current_status || "offline",
          last_heartbeat_at: r.last_heartbeat_at,
          days: [],
        });
      }
      const item = activityMap.get(r.user_id)!;
      item.total_logged_seconds += r.total_logged_seconds || 0;
      item.total_active_seconds += r.total_active_seconds || 0;
      item.total_idle_seconds += r.total_idle_seconds || 0;
      item.total_background_seconds += r.total_background_seconds || 0;
      item.days.push({
        date: r.date,
        logged_seconds: r.total_logged_seconds || 0,
        active_seconds: r.total_active_seconds || 0,
        idle_seconds: r.total_idle_seconds || 0,
        background_seconds: r.total_background_seconds || 0,
      });
      if (new Date(r.last_heartbeat_at) > new Date(item.last_heartbeat_at || 0)) {
        item.current_status = r.current_status;
        item.last_heartbeat_at = r.last_heartbeat_at;
      }
    });

    // 4. Retorna a lista COMPLETA de colaboradores
    return filteredProfiles.map((p: any) => {
      const act = activityMap.get(p.id);
      const totalLogged = act?.total_logged_seconds || 0;
      const totalActive = act?.total_active_seconds || 0;
      const totalIdle = act?.total_idle_seconds || 0;
      const totalBackground = act?.total_background_seconds || 0;
      const activeRatio = totalLogged > 0 ? Math.round((totalActive / totalLogged) * 100) : 0;
      const status = p.current_status || (p.online ? "active" : "offline");

      return {
        user_id: p.id,
        company_id: companyId,
        total_logged_seconds: totalLogged,
        total_active_seconds: totalActive,
        total_idle_seconds: totalIdle,
        total_background_seconds: totalBackground,
        current_status: status,
        last_heartbeat_at: p.last_seen_at || act?.last_heartbeat_at || null,
        active_ratio: activeRatio,
        days: (act?.days || []).sort((a, b) => b.date.localeCompare(a.date)),
        profiles: {
          id: p.id,
          name: p.name,
          email: p.email,
          avatar_url: p.avatar_url,
          role: p.role,
        },
      };
    });
  });
