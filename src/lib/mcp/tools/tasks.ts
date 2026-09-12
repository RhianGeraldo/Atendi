import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const tasksTools: McpToolDefinition[] = [
  {
    name: "listar_tarefas",
    description: "Lista tarefas de follow-up, reuniões e lembretes da equipe ou filial.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Status das tarefas: 'all', 'pending' (pendente), 'completed' (concluída). Padrão: 'pending'.",
          enum: ["all", "pending", "completed"],
          default: "pending",
        },
        contato_id: {
          type: "string",
          description: "Filtrar tarefas vinculadas a um contato específico.",
        },
        unidade_id: {
          type: "string",
          description: "Filtrar tarefas de uma unidade/filial específica. Opcional para chave Matriz.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de tarefas a retornar (padrão 20).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 50);
      const targetStatus = args?.status || "pending";
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("tasks")
        .select(`
          id,
          title,
          description,
          due_date,
          priority,
          status,
          task_type,
          created_at,
          unit_id,
          contacts(id, name, phone),
          units(name, slug),
          profiles(name)
        `)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (targetStatus !== "all") {
        query = query.eq("status", targetStatus);
      }

      if (args?.contato_id) {
        query = query.eq("contact_id", args.contato_id);
      }

      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      } else {
        // Obter todas as unidades da empresa
        const { data: companyUnits } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId);

        const unitIds = (companyUnits || []).map((u) => u.id);
        if (unitIds.length > 0) {
          query = query.or(`unit_id.is.null,unit_id.in.(${unitIds.join(",")})`);
        }
      }

      const { data: tasks, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar tarefas: ${error.message}`);
      }

      return {
        total: tasks?.length || 0,
        tarefas: (tasks || []).map((t: any) => ({
          id: t.id,
          titulo: t.title,
          descricao: t.description,
          vencimento: t.due_date,
          prioridade: t.priority,
          status: t.status,
          tipo: t.task_type,
          contato: t.contacts ? { id: t.contacts.id, nome: t.contacts.name, telefone: t.contacts.phone } : null,
          unidade: t.units?.name || "Geral",
          responsavel: t.profiles?.name || "Não atribuído",
        })),
      };
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma nova tarefa ou follow-up vinculado a um contato, oportunidade ou filial.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Título da tarefa (ex: 'Ligar para confirmar avaliação', 'Enviar orçamento detalhado').",
        },
        descricao: {
          type: "string",
          description: "Descrição detalhada do que deve ser feito (opcional).",
        },
        data_vencimento: {
          type: "string",
          description: "Data e hora prevista para a conclusão (formato ISO 8601 ou YYYY-MM-DD HH:mm).",
        },
        prioridade: {
          type: "string",
          description: "Prioridade: 'low', 'medium', 'high', 'urgent'. Padrão: 'medium'.",
          enum: ["low", "medium", "high", "urgent"],
          default: "medium",
        },
        contato_id: {
          type: "string",
          description: "ID do contato relacionado (opcional).",
        },
        oportunidade_id: {
          type: "string",
          description: "ID da oportunidade relacionada (opcional).",
        },
        unidade_id: {
          type: "string",
          description: "ID da unidade/filial (opcional para chave restrita).",
        },
      },
      required: ["titulo"],
    },
    handler: async (args: any, context: McpContext) => {
      const title = String(args.titulo).trim();
      const targetUnitId = context.unitId || args.unidade_id || null;
      const priority = args.prioridade || "medium";

      const { data: created, error } = await supabaseAdmin
        .from("tasks")
        .insert({
          title,
          description: args.descricao ? String(args.descricao).trim() : null,
          due_date: args.data_vencimento ? new Date(args.data_vencimento).toISOString() : null,
          priority,
          status: "pending",
          task_type: "follow_up",
          contact_id: args.contato_id || null,
          opportunity_id: args.oportunidade_id || null,
          unit_id: targetUnitId,
        })
        .select("*, contacts(name), units(name)")
        .single();

      if (error || !created) {
        throw new Error(`Erro ao criar tarefa: ${error?.message}`);
      }

      return {
        sucesso: true,
        tarefa: created,
      };
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa existente como concluída.",
    inputSchema: {
      type: "object",
      properties: {
        tarefa_id: {
          type: "string",
          description: "ID (UUID) da tarefa.",
        },
      },
      required: ["tarefa_id"],
    },
    handler: async (args: any, _context: McpContext) => {
      const taskId = args.tarefa_id;

      const { data: updated, error } = await supabaseAdmin
        .from("tasks")
        .update({ status: "completed" })
        .eq("id", taskId)
        .select("*, contacts(name)")
        .single();

      if (error || !updated) {
        throw new Error(`Erro ao concluir tarefa: ${error?.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Tarefa concluída com sucesso!",
        tarefa: updated,
      };
    },
  },
];
