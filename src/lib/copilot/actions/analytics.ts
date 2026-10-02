/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const analyticsActions: CopilotAction[] = [
  {
    name: "minha_agenda_hoje",
    label: "Minha Agenda de Hoje",
    description:
      "Exibe as tarefas pendentes do dia, conversas ativas atribuídas ao usuário logado e oportunidades abertas vinculadas a ele. Perfeito para o atendente ver o que precisa fazer hoje.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const hoje = new Date();
      const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
      const fimDia = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate(),
        23,
        59,
        59,
      ).toISOString();

      // Tarefas do usuário vencendo hoje ou atrasadas
      const { data: tasks } = await supabaseAdmin
        .from("tasks")
        .select("id, title, due_date, priority, status, contact:contacts(name)")
        .eq("assigned_to", context.userId)
        .eq("status", "pending")
        .lte("due_date", fimDia)
        .order("due_date", { ascending: true })
        .limit(10);

      // Conversas ativas atribuídas ao usuário
      const { data: convs } = await supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, last_message_at, contact:contacts(name, phone), unit:units(name)",
        )
        .eq("assigned_agent_id", context.userId)
        .in("status", ["active", "waiting"])
        .order("last_message_at", { ascending: false })
        .limit(10);

      const atrasadas = (tasks || []).filter((t: any) => t.due_date && new Date(t.due_date) < hoje);
      const hoje_tasks = (tasks || []).filter(
        (t: any) => t.due_date && new Date(t.due_date) >= new Date(inicioDia),
      );

      return {
        success: true,
        message: `Agenda: ${tasks?.length || 0} tarefa(s) pendente(s), ${convs?.length || 0} conversa(s) ativa(s).`,
        data: {
          tarefas_atrasadas: atrasadas.length,
          tarefas_hoje: hoje_tasks.length,
          tarefas: (tasks || []).map((t: any) => ({
            id: t.id,
            titulo: t.title,
            vencimento: t.due_date,
            prioridade: t.priority,
            contato: (t.contact as any)?.name || null,
            atrasada: t.due_date ? new Date(t.due_date) < hoje : false,
          })),
          conversas_ativas: (convs || []).map((c: any) => ({
            id: c.id,
            canal: c.channel,
            contato: (c.contact as any)?.name || null,
            telefone: (c.contact as any)?.phone || null,
            unidade: (c.unit as any)?.name || null,
            ultima_msg: c.last_message_at,
          })),
        },
      };
    },
  },
  {
    name: "consultar_metricas",
    label: "Consultar Métricas do Dashboard e Atendimento",
    description:
      "Retorna resumo de desempenho da empresa: conversas em espera, atendimentos ativos, volume e valor de oportunidades. Aceita filtro por período (hoje, semana, mes, tudo) e por unidade.",
    minRole: "manager",
    requiredMenu: "dashboard",
    parameters: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: ["hoje", "semana", "mes", "tudo"],
          description: "Período para filtrar conversas e oportunidades. Padrão: 'mes'.",
          default: "mes",
        },
        unidade_nome: {
          type: "string",
          description: "Filtrar por nome da unidade específica. Opcional.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const periodo = params.periodo || "mes";
      const agora = new Date();
      let dataInicio: Date;

      if (periodo === "hoje") {
        dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      } else if (periodo === "semana") {
        dataInicio = new Date(agora);
        dataInicio.setDate(agora.getDate() - 7);
      } else if (periodo === "mes") {
        dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      } else {
        dataInicio = new Date("2020-01-01");
      }

      // Resolver unit_id se fornecido filtro de unidade
      let unitId: string | null = null;
      if (params.unidade_nome) {
        const { data: u } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${params.unidade_nome}%`)
          .maybeSingle();
        unitId = u?.id || null;
      }

      // 1. Conversas aguardando
      let waitingQuery = supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "waiting");
      if (unitId) waitingQuery = waitingQuery.eq("unit_id", unitId);
      const { count: waitingCount } = await waitingQuery;

      // 2. Conversas ativas
      let activeQuery = supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "active");
      if (unitId) activeQuery = activeQuery.eq("unit_id", unitId);
      const { count: activeCount } = await activeQuery;

      // 3. Conversas encerradas no período
      let resolvedQuery = supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "resolved")
        .gte("resolved_at", dataInicio.toISOString());
      if (unitId) resolvedQuery = resolvedQuery.eq("unit_id", unitId);
      const { count: resolvedCount } = await resolvedQuery;

      // 4. Oportunidades no período
      let oppsQuery = supabaseAdmin
        .from("opportunities")
        .select("id, value, status, contacts!inner(company_id)")
        .eq("contacts.company_id", context.companyId)
        .gte("created_at", dataInicio.toISOString());
      if (unitId) oppsQuery = oppsQuery.eq("unit_id", unitId);
      const { data: opps } = await oppsQuery;

      const openOpps = (opps || []).filter((o) => o.status === "open");
      const wonOpps = (opps || []).filter((o) => o.status === "won");
      const totalValorAberto = openOpps.reduce((acc, cur) => acc + (Number(cur.value) || 0), 0);
      const totalValorGanho = wonOpps.reduce((acc, cur) => acc + (Number(cur.value) || 0), 0);

      // 5. Tarefas pendentes
      const { data: companyUnits } = await supabaseAdmin
        .from("units")
        .select("id")
        .eq("company_id", context.companyId);
      const unitIds = (companyUnits || []).map((u: any) => u.id);
      let tasksQuery = supabaseAdmin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (unitId) {
        tasksQuery = tasksQuery.eq("unit_id", unitId);
      } else if (unitIds.length > 0) {
        tasksQuery = tasksQuery.in("unit_id", unitIds);
      }
      const { count: pendingTasks } = await tasksQuery;

      return {
        success: true,
        message: `Métricas do período: ${periodo}${params.unidade_nome ? ` — Unidade: ${params.unidade_nome}` : ""}.`,
        data: {
          periodo,
          conversas_aguardando: waitingCount || 0,
          conversas_em_andamento: activeCount || 0,
          atendimentos_encerrados_no_periodo: resolvedCount || 0,
          tarefas_pendentes: pendingTasks || 0,
          oportunidades_abertas: openOpps.length,
          valor_em_aberto_reais: totalValorAberto,
          oportunidades_ganhas_no_periodo: wonOpps.length,
          valor_ganho_reais: totalValorGanho,
        },
      };
    },
  },
  {
    name: "consultar_metricas_dashboard",
    label: "Consultar Métricas do Dashboard",
    description:
      "Retorna indicadores de desempenho de vendas, atendimento e conformidade de SLA com visão consolidada da rede ou de uma filial específica.",
    minRole: "manager",
    requiredMenu: "dashboard",
    parameters: {
      type: "object",
      properties: {
        unidade_nome: {
          type: "string",
          description: "Filtrar por nome da unidade específica. Opcional.",
        },
        periodo: {
          type: "string",
          enum: ["hoje", "semana", "mes", "tudo"],
          description: "Período para filtrar. Padrão: 'mes'.",
          default: "mes",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      // Reutiliza a lógica de consultar_metricas
      const action = analyticsActions.find((a) => a.name === "consultar_metricas");
      if (action) {
        return action.execute(params, context);
      }
      return { success: false, message: "Ação não encontrada." };
    },
  },
];
