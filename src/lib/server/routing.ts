/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assignDepartmentRoundRobin(
  companyId: string,
  departmentId: string,
  unitId: string | null = null,
): Promise<string | null> {
  try {
    // 1. Fetch config for this specific department
    let q = supabaseAdmin
      .from("lead_routing_configs")
      .select("*")
      .eq("company_id", companyId)
      .eq("department_id", departmentId)
      .eq("is_active", true);

    if (unitId) {
      q = q.eq("unit_id", unitId);
    } else {
      q = q.is("unit_id", null);
    }

    const { data: config, error: fetchErr } = await q.maybeSingle();

    if (fetchErr || !config) {
      return null; // Department round robin not active
    }

    // 2. Determine active agents dynamically for this department
    const { data: rawAgents, error: agentsErr } = await supabaseAdmin
      .from("profiles")
      .select("id, has_matriz_access, user_units(unit_id)")
      .eq("company_id", companyId)
      .eq("department_id", departmentId)
      .eq("active", true);

    if (agentsErr || !rawAgents || rawAgents.length === 0) {
      console.log(`[Routing] No active agents found for department ${departmentId}`);
      return null;
    }

    // Filter by unit if necessary
    const validAgents = rawAgents.filter((a) => {
      if (!unitId) return true; // Global scope
      if (a.has_matriz_access) return true;
      return a.user_units?.some((uu: any) => uu.unit_id === unitId);
    });

    if (validAgents.length === 0) {
      console.log(`[Routing] No valid agents after unit filter for unit ${unitId}`);
      return null;
    }

    // Sort deterministically to maintain sequence
    validAgents.sort((a, b) => a.id.localeCompare(b.id));

    const agentIds = validAgents.map((a) => a.id);

    // 3. Determine next agent
    const lastIndex =
      typeof config.last_assigned_index === "number" ? config.last_assigned_index : -1;
    const nextIndex = (lastIndex + 1) % agentIds.length;
    const nextAgentId = agentIds[nextIndex];

    // 4. Update the config with the new index
    await supabaseAdmin
      .from("lead_routing_configs")
      .update({ last_assigned_index: nextIndex })
      .eq("id", config.id);

    return nextAgentId;
  } catch (error) {
    console.error("[Routing] Error assigning department round robin:", error);
    return null;
  }
}

/**
 * Rotaciona uma conversa em andamento (status = 'active') para outro usuário ONLINE
 * quando a consultora atual excede o tempo limite de SLA (ex: 8 minutos).
 */
export async function rotateActiveConversationRoundRobin({
  companyId,
  conversationId,
  currentAgentId,
  departmentId,
  unitId,
  timeoutMinutes,
}: {
  companyId: string;
  conversationId: string;
  currentAgentId: string;
  departmentId: string | null;
  unitId: string | null;
  timeoutMinutes: number;
}): Promise<{ success: boolean; newAgentId?: string; newAgentName?: string; reason?: string }> {
  try {
    // 1. Informações do agente atual (para exibir no histórico)
    const { data: currentAgent } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", currentAgentId)
      .maybeSingle();

    const currentAgentName = currentAgent?.name || "Consultor(a)";

    // 2. Buscar agentes ONLINE, ATIVOS e que NÃO sejam o agente atual
    let q = supabaseAdmin
      .from("profiles")
      .select("id, name, has_matriz_access, user_units(unit_id)")
      .eq("company_id", companyId)
      .eq("active", true)
      .eq("online", true)
      .neq("id", currentAgentId);

    if (departmentId) {
      q = q.eq("department_id", departmentId);
    }

    const { data: rawAgents, error: agentsErr } = await q;

    if (agentsErr || !rawAgents || rawAgents.length === 0) {
      console.log(
        `[Routing] SLA rotation skipped: no online agents found for company ${companyId} / department ${departmentId}`,
      );
      return { success: false, reason: "no_online_agents" };
    }

    // 3. Filtrar por unidade se houver restrição
    const validAgents = rawAgents.filter((a) => {
      if (!unitId) return true;
      if (a.has_matriz_access) return true;
      return a.user_units?.some((uu: any) => uu.unit_id === unitId);
    });

    if (validAgents.length === 0) {
      console.log(
        `[Routing] SLA rotation skipped: no online agents after unit filter for unit ${unitId}`,
      );
      return { success: false, reason: "no_online_agents_for_unit" };
    }

    // 4. Ordenar deterministicamente
    validAgents.sort((a, b) => a.id.localeCompare(b.id));

    // 5. Aplicar lógica de roleta (Round Robin)
    let nextAgent = validAgents[0];

    if (departmentId) {
      const { data: config } = await supabaseAdmin
        .from("lead_routing_configs")
        .select("id, last_assigned_index")
        .eq("company_id", companyId)
        .eq("department_id", departmentId)
        .maybeSingle();

      if (config) {
        const lastIndex =
          typeof config.last_assigned_index === "number" ? config.last_assigned_index : -1;
        const nextIndex = (lastIndex + 1) % validAgents.length;
        nextAgent = validAgents[nextIndex];

        await supabaseAdmin
          .from("lead_routing_configs")
          .update({ last_assigned_index: nextIndex })
          .eq("id", config.id);
      }
    }

    const nextAgentId = nextAgent.id;
    const nextAgentName = nextAgent.name || "Novo Atendente";

    // 6. Atualizar a conversa para o novo agente
    const { error: convErr } = await supabaseAdmin
      .from("conversations")
      .update({
        assigned_agent_id: nextAgentId,
        status: "active",
      })
      .eq("id", conversationId);

    if (convErr) {
      console.error("[Routing] Error reassigning conversation:", convErr);
      return { success: false, reason: convErr.message };
    }

    // 7. Atualizar a sessão atual e gerar evento de auditoria
    const { data: convData } = await supabaseAdmin
      .from("conversations")
      .select("current_session_id, channel, contacts(name, phone)")
      .eq("id", conversationId)
      .maybeSingle();

    if (convData?.current_session_id) {
      await supabaseAdmin
        .from("conversation_sessions")
        .update({ assigned_agent_id: nextAgentId })
        .eq("id", convData.current_session_id);

      await supabaseAdmin.from("session_events").insert({
        session_id: convData.current_session_id,
        event_type: "transferred",
        actor_id: nextAgentId,
        metadata: {
          reason: "sla_active_timeout",
          previous_agent_id: currentAgentId,
          previous_agent_name: currentAgentName,
          timeout_minutes: timeoutMinutes,
        },
      });
    }

    // 8. Inserir mensagem de sistema interna no histórico do chat
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "system",
      content: `🔄 [Roleta SLA] Atendimento transferido automaticamente de ${currentAgentName} para ${nextAgentName} (cliente aguardando retorno há mais de ${timeoutMinutes} min).`,
      is_internal: true,
    });

    // 9. Inserir notificação para o novo agente
    try {
      const contactLabel =
        (convData?.contacts as any)?.name || (convData?.contacts as any)?.phone || "um contato";
      await supabaseAdmin.from("notifications" as any).insert({
        company_id: companyId,
        user_id: nextAgentId,
        type: `transfer_${convData?.channel || "whatsapp"}`,
        title: "Atendimento Rotacionado (SLA)",
        message: `O atendimento de ${contactLabel} foi rotacionado para você porque o tempo de resposta excedeu ${timeoutMinutes} min.`,
        link: `/conversations?c=${conversationId}`,
      });
    } catch (notifErr) {
      console.warn("[Routing] Failed to insert notification for new agent:", notifErr);
    }

    console.log(
      `[Routing] SLA rotation: conversation ${conversationId} rotated from ${currentAgentName} (${currentAgentId}) to ${nextAgentName} (${nextAgentId})`,
    );

    return { success: true, newAgentId: nextAgentId, newAgentName: nextAgentName };
  } catch (error) {
    console.error("[Routing] Error in rotateActiveConversationRoundRobin:", error);
    return { success: false, reason: (error as Error).message };
  }
}
