/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeTicketWithAI } from "@/lib/server/ticket-ai";

/**
 * 1. Lista alertas do Radar com filtros flexíveis e dados enriquecidos
 */
export const getRadarAlertsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
      status: z
        .enum(["all", "pending", "in_review", "ticket_created", "dismissed", "resolved"])
        .optional(),
      category: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, unitId, status, category, severity, limit, offset } = data;

    let query = (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select(
        `
        id,
        company_id,
        unit_id,
        conversation_id,
        contact_id,
        category,
        severity,
        trigger_message,
        ai_summary,
        suggested_action,
        status,
        ticket_id,
        created_at,
        resolved_at,
        contact:contacts!contact_id(id, name, phone, email, avatar_url:profile_picture_url),
        unit:units!unit_id(id, name),
        ticket:tickets!ticket_id(id, ticket_number, title, status, priority, origin, tags)
      `,
        { count: "exact" },
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unitId) {
      query = query.eq("unit_id", unitId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (severity && severity !== "all") {
      query = query.eq("severity", severity);
    }

    const { data: alerts, count, error } = await query;

    if (error) {
      console.error("[radar.functions] Erro ao buscar alertas:", error);
      throw new Error(`Falha ao buscar alertas do radar: ${error.message}`);
    }

    return {
      alerts: alerts || [],
      total: count || 0,
    };
  });

/**
 * 2. Obtém métricas consolidadas do Radar para o painel gerencial
 */
export const getRadarMetricsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, unitId } = data;

    let baseQuery = (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select("id, status, category, severity, ticket_id, created_at")
      .eq("company_id", companyId);

    if (unitId) {
      baseQuery = baseQuery.eq("unit_id", unitId);
    }

    const { data: alerts, error } = await baseQuery;

    if (error) {
      console.error("[radar.functions] Erro ao buscar métricas:", error);
      return {
        total: 0,
        pending: 0,
        churnRisks: 0,
        criticalIssues: 0,
        ticketsCreated: 0,
      };
    }

    const all = alerts || [];
    const pending = all.filter(
      (a: any) => a.status === "pending" || a.status === "in_review",
    ).length;
    const churnRisks = all.filter(
      (a: any) => a.category === "churn" && a.status !== "dismissed",
    ).length;
    const criticalIssues = all.filter(
      (a: any) => a.severity === "critical" && a.status !== "dismissed",
    ).length;
    const ticketsCreated = all.filter(
      (a: any) => a.ticket_id !== null || a.status === "ticket_created",
    ).length;

    return {
      total: all.length,
      pending,
      churnRisks,
      criticalIssues,
      ticketsCreated,
    };
  });

/**
 * 3. Descarta um alerta (falso positivo ou não acionável)
 */
export const dismissRadarAlertAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      alertId: z.string().uuid(),
      conversationId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { alertId, conversationId } = data;
    const userId = (context as any)?.user?.id || null;

    const { error } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .update({
        status: "dismissed",
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) {
      throw new Error(`Falha ao descartar alerta: ${error.message}`);
    }

    // Verifica se restam outros alertas pendentes na conversa
    const { data: remaining } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select("id")
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "in_review", "ticket_created"])
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await (supabaseAdmin as any)
        .from("conversations")
        .update({ radar_status: "dismissed" })
        .eq("id", conversationId);
    }

    return { success: true };
  });

/**
 * 4. Marca alerta como resolvido / tratado
 */
export const resolveRadarAlertAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      alertId: z.string().uuid(),
      conversationId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { alertId, conversationId } = data;
    const userId = (context as any)?.user?.id || null;

    const { error } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .update({
        status: "resolved",
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) {
      throw new Error(`Falha ao resolver alerta: ${error.message}`);
    }

    // Verifica se restam outros alertas pendentes na conversa
    const { data: remaining } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select("id")
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "in_review", "ticket_created"])
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await (supabaseAdmin as any)
        .from("conversations")
        .update({ radar_status: "resolved" })
        .eq("id", conversationId);
    }

    return { success: true };
  });

/**
 * 5. Cria chamado manualmente a partir de um alerta do radar (quando a auto-criação estava desligada)
 */
export const createTicketFromRadarAlertAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      alertId: z.string().uuid(),
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
      departmentId: z.string().uuid().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { alertId, companyId, unitId, departmentId, priority } = data;

    // Busca dados do alerta
    const { data: alert, error: alertErr } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select(
        `
        *,
        contact:contacts!contact_id(id, name)
      `,
      )
      .eq("id", alertId)
      .single();

    if (alertErr || !alert) {
      throw new Error("Alerta não encontrado.");
    }

    if (alert.ticket_id) {
      return { success: true, ticketId: alert.ticket_id, alreadyExists: true };
    }

    let targetUnitId = unitId || alert.unit_id || null;
    if (!targetUnitId) {
      const { data: firstUnit } = await (supabaseAdmin as any)
        .from("units")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstUnit) {
        targetUnitId = firstUnit.id;
      }
    }

    const priorityMap: Record<string, "low" | "medium" | "high" | "urgent"> = {
      low: "low",
      medium: "medium",
      high: "high",
      critical: "urgent",
    };

    const finalPriority = priority || priorityMap[alert.severity] || "high";
    const contactName = alert.contact?.name || "Cliente";

    const categoryTagMap: Record<string, string> = {
      churn: "CHURN",
      critical_issue: "INCIDENTE",
      legal_risk: "JURÍDICO",
      severe_dissatisfaction: "INSATISFAÇÃO",
      billing: "FINANCEIRO",
    };
    const categoryTag = categoryTagMap[alert.category] || alert.category?.toUpperCase() || "RISCO";
    const cleanSummary = alert.ai_summary?.replace(/\.$/, "") || "Alerta detectado";
    const formattedTitle = `[RADAR · ${categoryTag}] ${contactName} — ${cleanSummary}`;

    const { data: newTicket, error: ticketErr } = await (supabaseAdmin as any)
      .from("tickets")
      .insert({
        company_id: companyId,
        unit_id: targetUnitId,
        department_id: departmentId || null,
        scope: "external",
        origin: "radar",
        title: formattedTitle,
        description:
          `Chamado gerado a partir do Radar de Conversas:\n\n` +
          `🚨 Diagnóstico: ${alert.ai_summary}\n` +
          `💡 Sugestão de Contorno: ${alert.suggested_action || "Intervenção recomendada"}\n\n` +
          `💬 Trecho da Mensagem: "${alert.trigger_message}"`,
        status: "new",
        priority: finalPriority,
        requester_contact_id: alert.contact_id,
        conversation_id: alert.conversation_id,
        tags: ["radar-conversas", `radar-${alert.category}`, `severidade-${alert.severity}`],
      })
      .select("id, ticket_number, title")
      .single();

    if (ticketErr || !newTicket) {
      throw new Error(`Falha ao criar ticket: ${ticketErr?.message}`);
    }

    const ticketCode = `RAD-${String(newTicket.ticket_number).padStart(5, "0")}`;

    // Atualiza o alerta
    await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .update({
        ticket_id: newTicket.id,
        unit_id: targetUnitId,
        status: "ticket_created",
      })
      .eq("id", alertId);

    // Dispara análise IA do chamado
    analyzeTicketWithAI(newTicket.id, companyId).catch((err) =>
      console.warn(`[radar.functions] Erro ao analisar ticket #${newTicket.ticket_number}:`, err),
    );

    return {
      success: true,
      ticketId: newTicket.id,
      ticketNumber: newTicket.ticket_number,
      ticketCode,
    };
  });

/**
 * 6. Dispara uma varredura retroativa de conversas recentes da empresa
 */
export const scanRecentConversationsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
      daysBack: z.number().optional().default(15),
      limit: z.number().optional().default(100),
    }),
  )
  .handler(async ({ data }) => {
    const { scanRecentConversationsForRadar } = await import("@/lib/server/radar-engine");
    const result = await scanRecentConversationsForRadar({
      companyId: data.companyId,
      unitId: data.unitId,
      daysBack: data.daysBack,
      limit: data.limit,
    });
    return result;
  });
