/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";
import { analyzeTicketWithAI } from "@/lib/server/ticket-ai";

export const ticketsTools: McpToolDefinition[] = [
  {
    name: "listar_chamados",
    description:
      "Lista chamados/tickets de atendimento ou suporte interno/externo com opções de filtro por status, prioridade e escopo.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Status do chamado: 'all', 'new', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'. Padrão: 'all'.",
          enum: ["all", "new", "in_progress", "pending", "resolved", "closed", "cancelled"],
          default: "all",
        },
        prioridade: {
          type: "string",
          description: "Prioridade: 'low', 'medium', 'high', 'urgent'.",
          enum: ["low", "medium", "high", "urgent"],
        },
        escopo: {
          type: "string",
          description: "Escopo: 'all', 'internal' (colaboradores), 'external' (clientes). Padrão: 'all'.",
          enum: ["all", "internal", "external"],
          default: "all",
        },
        contato_id: {
          type: "string",
          description: "Filtrar por ID do contato solicitante.",
        },
        unidade_id: {
          type: "string",
          description: "Filtrar por unidade responsável.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de chamados a retornar (padrão 20, máx 50).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 50);
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("tickets")
        .select(
          `
          id,
          ticket_number,
          title,
          description,
          status,
          priority,
          scope,
          created_at,
          updated_at,
          tags,
          contacts!requester_contact_id(id, name, phone),
          profiles!requester_user_id(id, name),
          units!unit_id(id, name),
          departments!department_id(id, name)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (context.companyId) {
        query = query.eq("company_id", context.companyId);
      }
      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      }
      if (args?.status && args.status !== "all") {
        query = query.eq("status", args.status);
      }
      if (args?.prioridade) {
        query = query.eq("priority", args.prioridade);
      }
      if (args?.escopo && args.escopo !== "all") {
        query = query.eq("scope", args.escopo);
      }
      if (args?.contato_id) {
        query = query.eq("requester_contact_id", args.contato_id);
      }

      const { data, error } = await query;
      if (error) {
        return {
          content: [{ type: "text", text: `Erro ao buscar chamados: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: data?.length || 0,
                tickets: data || [],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
  {
    name: "consultar_chamado",
    description: "Consulta os detalhes de um chamado específico pelo ID ou número, incluindo mensagens e histórico.",
    inputSchema: {
      type: "object",
      properties: {
        ticket_id: {
          type: "string",
          description: "UUID do chamado.",
        },
        ticket_number: {
          type: "number",
          description: "Número amigável do chamado (ex: 1042).",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      if (!args?.ticket_id && !args?.ticket_number) {
        return {
          content: [{ type: "text", text: "Informe 'ticket_id' ou 'ticket_number'." }],
          isError: true,
        };
      }

      let query = supabaseAdmin
        .from("tickets")
        .select(
          `
          *,
          contacts!requester_contact_id(id, name, phone, email),
          profiles!requester_user_id(id, name, email),
          assigned:profiles!assigned_to_user_id(id, name),
          units!unit_id(id, name),
          departments!department_id(id, name),
          ticket_messages(
            id,
            content,
            is_internal_note,
            created_at,
            sender_user:profiles!sender_user_id(id, name),
            sender_contact:contacts!sender_contact_id(id, name)
          )
        `,
        );

      if (context.companyId) {
        query = query.eq("company_id", context.companyId);
      }
      if (args?.ticket_id) {
        query = query.eq("id", args.ticket_id);
      } else if (args?.ticket_number) {
        query = query.eq("ticket_number", args.ticket_number);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        return {
          content: [{ type: "text", text: `Erro ao consultar chamado: ${error.message}` }],
          isError: true,
        };
      }
      if (!data) {
        return {
          content: [{ type: "text", text: "Chamado não encontrado." }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  },
  {
    name: "criar_chamado",
    description: "Abre um novo chamado / ticket de suporte na plataforma.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Título ou assunto principal do chamado.",
        },
        descricao: {
          type: "string",
          description: "Detalhamento completo da solicitação ou problema.",
        },
        prioridade: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Prioridade: 'low', 'medium' (padrão), 'high', 'urgent'.",
          default: "medium",
        },
        escopo: {
          type: "string",
          enum: ["internal", "external"],
          description: "'external' para clientes/fornecedores, 'internal' para colaboradores.",
          default: "external",
        },
        contato_id: {
          type: "string",
          description: "ID do contato solicitante (quando escopo for 'external').",
        },
        unidade_id: {
          type: "string",
          description: "ID da unidade responsável. Se omitido, usará a unidade da sessão ou primeira disponível.",
        },
        departamento_id: {
          type: "string",
          description: "ID do departamento responsável.",
        },
      },
      required: ["titulo", "descricao"],
    },
    handler: async (args: any, context: McpContext) => {
      const companyId = context.companyId;
      if (!companyId) {
        return {
          content: [{ type: "text", text: "Empresa não identificada no contexto." }],
          isError: true,
        };
      }

      let unitId = args?.unidade_id || context.unitId;
      if (!unitId) {
        const { data: firstUnit } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", companyId)
          .limit(1)
          .maybeSingle();
        unitId = firstUnit?.id;
      }

      if (!unitId) {
        return {
          content: [{ type: "text", text: "Nenhuma unidade cadastrada encontrada para vincular o chamado." }],
          isError: true,
        };
      }

      const priority = ["low", "medium", "high", "urgent"].includes(args?.prioridade)
        ? args.prioridade
        : "medium";
      const scope = args?.escopo === "internal" ? "internal" : "external";

      const { data: newTicket, error } = await supabaseAdmin
        .from("tickets")
        .insert({
          company_id: companyId,
          unit_id: unitId,
          department_id: args?.departamento_id || null,
          title: args.titulo,
          description: args.descricao,
          priority,
          scope,
          status: "new",
          requester_contact_id: scope === "external" ? args?.contato_id || null : null,
          requester_user_id: scope === "internal" ? context.userId || null : null,
          tags: ["aberto-por-copilot"],
        })
        .select("id, ticket_number, title, status, priority")
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Erro ao criar chamado: ${error.message}` }],
          isError: true,
        };
      }

      // Disparar análise de IA em background
      analyzeTicketWithAI(newTicket.id, companyId).catch((aiErr) =>
        console.warn(`[mcp-tickets] Falha ao analisar ticket #${newTicket.ticket_number}:`, aiErr),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Chamado #${newTicket.ticket_number} criado com sucesso.`,
                ticket: newTicket,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
  {
    name: "adicionar_nota_chamado",
    description: "Adiciona uma nota interna ou resposta no histórico de um chamado.",
    inputSchema: {
      type: "object",
      properties: {
        ticket_id: {
          type: "string",
          description: "ID do chamado.",
        },
        conteudo: {
          type: "string",
          description: "Texto da nota ou mensagem.",
        },
        is_interna: {
          type: "boolean",
          description: "Se true, será visível apenas internamente para a equipe (padrão true).",
          default: true,
        },
      },
      required: ["ticket_id", "conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      const isInternal = args?.is_interna !== false;

      const { data, error } = await supabaseAdmin
        .from("ticket_messages")
        .insert({
          ticket_id: args.ticket_id,
          content: args.conteudo,
          is_internal_note: isInternal,
          sender_user_id: context.userId || null,
        })
        .select("id, created_at")
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Erro ao adicionar nota: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Nota adicionada ao chamado com sucesso.",
                message_id: data.id,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
  {
    name: "atualizar_status_chamado",
    description: "Atualiza o status de um chamado (ex: 'in_progress', 'resolved', 'closed', etc.).",
    inputSchema: {
      type: "object",
      properties: {
        ticket_id: {
          type: "string",
          description: "ID do chamado.",
        },
        status: {
          type: "string",
          enum: ["new", "in_progress", "pending", "resolved", "closed", "cancelled"],
          description: "Novo status do chamado.",
        },
        resolucao_resumo: {
          type: "string",
          description: "Resumo da solução (opcional, recomendado ao resolver/fechar).",
        },
      },
      required: ["ticket_id", "status"],
    },
    handler: async (args: any, context: McpContext) => {
      const updateData: any = {
        status: args.status,
        updated_at: new Date().toISOString(),
      };

      if (args.status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      } else if (args.status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from("tickets")
        .update(updateData)
        .eq("id", args.ticket_id)
        .select("id, ticket_number, status")
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Erro ao atualizar status: ${error.message}` }],
          isError: true,
        };
      }

      if (args.resolucao_resumo) {
        await supabaseAdmin.from("ticket_messages").insert({
          ticket_id: args.ticket_id,
          content: `📌 Resolução/Atualização: ${args.resolucao_resumo}`,
          is_internal_note: true,
          sender_user_id: context.userId || null,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Status do chamado #${data.ticket_number} atualizado para '${data.status}'.`,
                ticket: data,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
];
