/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const tasksActions: CopilotAction[] = [
  {
    name: "criar_tarefa",
    label: "Criar Tarefa ou Lembrete",
    description:
      "Cria uma nova tarefa ou lembrete para um atendente ou para si mesmo (ex: retornar ligação, enviar proposta, cobrar feedback).",
    minRole: "agent",
    requiredMenu: "tasks",
    parameters: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description:
            "Descrição ou título da tarefa (ex: 'Ligar para Carlos confirmar agendamento').",
        },
        data_vencimento: {
          type: "string",
          description:
            "Data e hora de vencimento no formato ISO ou YYYY-MM-DDTHH:mm:ss. Se omitido, define para as próximas 24 horas.",
        },
        prioridade: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Nível de prioridade da tarefa.",
          default: "medium",
        },
        contato_id: {
          type: "string",
          description:
            "UUID do contato vinculado (opcional). IMPORTANTE: use buscar_contato primeiro para obter o ID correto. Nunca passe o nome do contato aqui, somente o UUID.",
        },
        unidade_nome: {
          type: "string",
          description:
            "Nome da unidade onde criar a tarefa (ex: 'Serra', 'Linhares'). Use quando o usuário especificar a unidade.",
        },
        oportunidade_id: {
          type: "string",
          description: "ID da oportunidade vinculada (opcional).",
        },
      },
      required: ["titulo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      let dueDate = params.data_vencimento;
      const now = new Date();

      if (dueDate) {
        let parsed = new Date(dueDate);
        if (isNaN(parsed.getTime())) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          dueDate = tomorrow.toISOString();
        } else {
          // Se o LLM passou ano do passado (ex: 2023, 2024), corrigir para o ano corrente
          if (parsed.getFullYear() < now.getFullYear()) {
            parsed.setFullYear(now.getFullYear());
            if (parsed.getTime() < now.getTime()) {
              parsed = new Date();
              parsed.setDate(parsed.getDate() + 1);
              parsed.setHours(10, 0, 0, 0);
            }
          }
          dueDate = parsed.toISOString();
        }
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        dueDate = tomorrow.toISOString();
      }

      // Validar ou resolver contato_id de forma inteligente (evita falha de maybeSingle quando há múltiplos homônimos)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let contactNameFound: string | null = null;
      let searchTerm = "";

      if (params.contato_id && !uuidRegex.test(params.contato_id)) {
        searchTerm = String(params.contato_id).trim();
      } else if (!params.contato_id && params.titulo) {
        // Tentar extrair nome do título (ex: "Ligar para Rhian Geraldo", "Entrar em contato com Rhian Geraldo")
        const match = params.titulo.match(
          /(?:para|com|ao|cliente)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
        );
        if (match) {
          searchTerm = match[1].trim();
        }
      }

      if (searchTerm) {
        const searchVariants: string[] = [`name.ilike.%${searchTerm}%`];
        const sLower = searchTerm.toLowerCase();
        if (sLower.includes("rian")) {
          searchVariants.push(`name.ilike.%${sLower.replace(/rian/gi, "rhian")}%`);
          searchVariants.push(`name.ilike.%${sLower.replace(/rian/gi, "ryan")}%`);
        } else if (sLower.includes("rhian")) {
          searchVariants.push(`name.ilike.%${sLower.replace(/rhian/gi, "rian")}%`);
          searchVariants.push(`name.ilike.%${sLower.replace(/rhian/gi, "ryan")}%`);
        }
        const sDigits = sLower.replace(/\D/g, "");
        if (sDigits.length >= 8) {
          searchVariants.push(`phone.ilike.%${sDigits}%`);
        }

        const { data: foundList } = await supabaseAdmin
          .from("contacts")
          .select("id, name, phone, unit_id, merged_into_id")
          .eq("company_id", context.companyId)
          .or(Array.from(new Set(searchVariants)).join(","))
          .order("phone", { ascending: false, nullsFirst: false })
          .limit(10);

        if (foundList && foundList.length > 0) {
          // Priorizar contatos com telefone preenchido
          const sorted = [...foundList].sort((a: any, b: any) => {
            const aPhone = a.phone ? 1 : 0;
            const bPhone = b.phone ? 1 : 0;
            return bPhone - aPhone;
          });
          const best = sorted[0];
          params.contato_id = best.merged_into_id || best.id;
          contactNameFound = best.name;
        } else {
          params.contato_id = null;
        }
      } else if (params.contato_id && uuidRegex.test(params.contato_id)) {
        const { data: c } = await supabaseAdmin
          .from("contacts")
          .select("name, unit_id")
          .eq("id", params.contato_id)
          .maybeSingle();
        if (c) contactNameFound = c.name;
      }

      // Determinar unidade: 1) Nome solicitado pelo usuário > 2) Unidade do contato > 3) Unidade do contexto > 4) Primeira ativa
      let unitId: string | null = null;

      if (params.unidade_nome) {
        const { data: unit } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${params.unidade_nome}%`)
          .maybeSingle();
        if (unit) unitId = unit.id;
      }

      if (!unitId && params.contato_id) {
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("unit_id")
          .eq("id", params.contato_id)
          .maybeSingle();
        if (contact?.unit_id) unitId = contact.unit_id;
      }

      if (!unitId && context.unitId) {
        unitId = context.unitId;
      }

      if (!unitId) {
        const { data: unit } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .eq("active", true)
          .order("name", { ascending: true })
          .limit(1)
          .maybeSingle();
        unitId = unit?.id || null;
      }

      if (!unitId) {
        return {
          success: false,
          message: "Não foi possível determinar a unidade para criar a tarefa.",
        };
      }

      const { data: task, error } = await supabaseAdmin
        .from("tasks")
        .insert({
          unit_id: unitId,
          title: params.titulo.trim(),
          due_date: new Date(dueDate).toISOString(),
          priority: params.prioridade || "medium",
          status: "pending",
          task_type: "follow_up",
          contact_id: params.contato_id || null,
          opportunity_id: params.oportunidade_id || null,
          assigned_to: context.userId,
        })
        .select("id, title, due_date, priority, status, contacts(name), units(name)")
        .single();

      if (error) return { success: false, message: `Erro ao criar tarefa: ${error.message}` };

      const contactName = (task as any).contacts?.name;
      const unitName = (task as any).units?.name;

      return {
        success: true,
        message: `Tarefa "${task.title}" agendada para ${new Date(task.due_date!).toLocaleString("pt-BR")}${contactName ? ` — contato: ${contactName}` : ""}${unitName ? ` (${unitName})` : ""}!`,
        data: task,
      };
    },
  },
  {
    name: "listar_tarefas",
    label: "Listar Tarefas Pendentes",
    description: "Lista as tarefas em aberto da empresa ou de um contato específico.",
    minRole: "agent",
    requiredMenu: "tasks",
    parameters: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "Filtrar tarefas de um contato específico (opcional).",
        },
        todas_da_equipe: {
          type: "boolean",
          description: "Se true e o usuário for gestor/admin, lista de toda a equipe.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      // Buscar unit_ids da empresa para filtrar (tasks não tem company_id)
      const { data: companyUnits } = await supabaseAdmin
        .from("units")
        .select("id")
        .eq("company_id", context.companyId);

      const unitIds = (companyUnits || []).map((u: any) => u.id);

      let query = supabaseAdmin
        .from("tasks")
        .select(
          "id, title, description, due_date, priority, status, task_type, contact:contacts(name, phone), unit:units(name)",
        )
        .eq("status", "pending")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(15);

      if (unitIds.length > 0) {
        query = query.in("unit_id", unitIds);
      }

      if (params.contato_id) {
        query = query.eq("contact_id", params.contato_id);
      }

      const { data: tasks, error } = await query;
      if (error) return { success: false, message: `Erro ao buscar tarefas: ${error.message}` };

      return {
        success: true,
        message: `${tasks?.length || 0} tarefas pendentes encontradas.`,
        data: (tasks || []).map((t: any) => ({
          id: t.id,
          titulo: t.title,
          descricao: t.description,
          vencimento: t.due_date,
          prioridade: t.priority,
          status: t.status,
          contato: t.contact ? { nome: t.contact.name, telefone: t.contact.phone } : null,
          unidade: t.unit?.name || null,
        })),
      };
    },
  },
  {
    name: "concluir_tarefa",
    label: "Concluir Tarefa",
    description: "Marca uma tarefa como finalizada/concluída.",
    minRole: "agent",
    requiredMenu: "tasks",
    parameters: {
      type: "object",
      properties: {
        tarefa_id: { type: "string", description: "ID da tarefa a ser concluída." },
      },
      required: ["tarefa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      // Verificar se a tarefa pertence à empresa via unit_id → units.company_id
      const { data: task, error: tErr } = await supabaseAdmin
        .from("tasks")
        .select("id, title, unit_id, units!inner(company_id)")
        .eq("id", params.tarefa_id)
        .single();

      if (tErr || !task) {
        return { success: false, message: "Tarefa não encontrada." };
      }

      if ((task.units as any)?.company_id !== context.companyId) {
        return { success: false, message: "Acesso negado: tarefa não pertence à sua empresa." };
      }

      const { data: updated, error } = await supabaseAdmin
        .from("tasks")
        .update({ status: "done" })
        .eq("id", params.tarefa_id)
        .select("id, title, status")
        .single();

      if (error) return { success: false, message: `Erro ao concluir tarefa: ${error.message}` };

      return {
        success: true,
        message: `Tarefa "${updated.title}" marcada como concluída! ✅`,
        data: updated,
      };
    },
  },
  {
    name: "reagendar_tarefa",
    label: "Reagendar Tarefa",
    description: "Atualiza a data de vencimento de uma tarefa existente para uma nova data/hora.",
    minRole: "agent",
    requiredMenu: "tasks",
    parameters: {
      type: "object",
      properties: {
        tarefa_id: {
          type: "string",
          description: "ID (UUID) da tarefa a reagendar. Use listar_tarefas para obter o ID.",
        },
        nova_data: {
          type: "string",
          description:
            "Nova data e hora de vencimento no formato ISO ou YYYY-MM-DDTHH:mm:ss (ex: 2024-12-25T10:00:00).",
        },
      },
      required: ["tarefa_id", "nova_data"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: task, error: tErr } = await supabaseAdmin
        .from("tasks")
        .select("id, title, due_date, units!inner(company_id)")
        .eq("id", params.tarefa_id)
        .single();

      if (tErr || !task) return { success: false, message: "Tarefa não encontrada." };
      if ((task.units as any)?.company_id !== context.companyId) {
        return { success: false, message: "Acesso negado: tarefa não pertence à sua empresa." };
      }

      const newDate = new Date(params.nova_data);
      if (isNaN(newDate.getTime())) {
        return {
          success: false,
          message: "Data inválida. Use o formato ISO (ex: 2024-12-25T10:00:00).",
        };
      }

      const { data: updated, error } = await supabaseAdmin
        .from("tasks")
        .update({ due_date: newDate.toISOString() })
        .eq("id", params.tarefa_id)
        .select("id, title, due_date")
        .single();

      if (error) return { success: false, message: `Erro ao reagendar: ${error.message}` };

      return {
        success: true,
        message: `Tarefa "${updated.title}" reagendada para ${newDate.toLocaleString("pt-BR")}! 📅`,
        data: updated,
      };
    },
  },
];
