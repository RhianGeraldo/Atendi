/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "@/lib/server/message-sender";
import type { McpContext, McpToolDefinition } from "../types";

export const conversationsTools: McpToolDefinition[] = [
  {
    name: "listar_conversas",
    description:
      "Lista as conversas/atendimentos de WhatsApp e Instagram da empresa ou filial, com status e última mensagem.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Status da conversa: 'all', 'waiting' (aguardando), 'active' (em atendimento), 'resolved' (resolvida/finalizada). Padrão: 'active'.",
          enum: ["all", "waiting", "active", "resolved"],
          default: "active",
        },
        canal: {
          type: "string",
          description:
            "Canal da conversa: 'all', 'whatsapp', 'instagram', 'messenger'. Padrão: 'all'.",
          enum: ["all", "whatsapp", "instagram", "messenger"],
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade/filial para filtrar. Opcional para chave Matriz.",
        },
        busca: {
          type: "string",
          description: "Buscar por nome do contato ou telefone.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima a retornar (padrão 20, máx 50).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 50);
      const targetStatus = args?.status || "active";
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("conversations")
        .select(
          `
          id,
          status,
          channel,
          last_message,
          last_message_at,
          unread_count,
          ai_active,
          unit_id,
          contacts!inner(id, name, phone, company_id),
          units(name, slug),
          profiles(name)
        `,
        )
        .eq("contacts.company_id", context.companyId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (targetStatus !== "all") {
        query = query.eq("status", targetStatus);
      }

      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      }

      if (args?.canal && args.canal !== "all") {
        query = query.eq("channel", args.canal);
      }

      if (args?.busca && typeof args.busca === "string" && args.busca.trim()) {
        const term = args.busca.trim();
        query = query.or(`contacts.name.ilike.%${term}%,contacts.phone.ilike.%${term}%`);
      }

      const { data: convs, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar conversas: ${error.message}`);
      }

      return {
        total: convs?.length || 0,
        conversas: (convs || []).map((c: any) => ({
          id: c.id,
          status: c.status,
          canal: c.channel,
          contato: {
            id: c.contacts?.id,
            nome: c.contacts?.name,
            telefone: c.contacts?.phone,
          },
          unidade: c.units?.name || "Geral",
          atendente: c.profiles?.name || (c.ai_active ? "IA Atendi" : "Não atribuído"),
          ultima_mensagem: c.last_message,
          data_ultima_mensagem: c.last_message_at,
          nao_lidas: c.unread_count || 0,
        })),
      };
    },
  },
  {
    name: "consultar_conversa",
    description:
      "Recupera o histórico completo de mensagens trocadas em um atendimento específico no WhatsApp ou Instagram.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser consultada.",
        },
        limite_mensagens: {
          type: "number",
          description: "Número de mensagens a retornar do histórico recente (padrão 25, máx 100).",
          default: 25,
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const msgLimit = Math.min(Math.max(Number(args.limite_mensagens) || 25, 1), 100);

      // Verificar permissão da conversa
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, unit_id, ai_active, contacts!inner(id, name, phone, company_id), units(name)",
        )
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // Buscar mensagens
      const { data: messages, error: msgErr } = await supabaseAdmin
        .from("messages")
        .select(
          "id, sender_type, content, media_type, media_url, transcription, created_at, profiles(name)",
        )
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(msgLimit);

      if (msgErr) {
        throw new Error(`Erro ao buscar mensagens: ${msgErr.message}`);
      }

      const sortedMessages = (messages || []).reverse().map((m: any) => ({
        id: m.id,
        remetente:
          m.sender_type === "contact"
            ? "Cliente"
            : m.sender_type === "system"
              ? "Sistema"
              : "Atendente",
        nome_atendente: m.profiles?.name || null,
        conteudo:
          m.content || (m.transcription ? `[Áudio]: ${m.transcription}` : `[${m.media_type}]`),
        tipo_midia: m.media_type,
        data_hora: m.created_at,
      }));

      return {
        conversa_id: conv.id,
        status: conv.status,
        canal: conv.channel,
        contato: {
          id: conv.contacts?.id,
          nome: conv.contacts?.name,
          telefone: conv.contacts?.phone,
        },
        unidade: (conv.units as any)?.name || "Geral",
        total_mensagens: sortedMessages.length,
        mensagens: sortedMessages,
      };
    },
  },
  {
    name: "enviar_mensagem_whatsapp",
    description:
      "Envia uma mensagem de texto real para o cliente pelo WhatsApp ou Instagram Direct da conversa selecionada.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa ativa para enviar a mensagem.",
        },
        mensagem: {
          type: "string",
          description: "Texto da mensagem a ser enviada ao cliente.",
        },
      },
      required: ["conversa_id", "mensagem"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const text = String(args.mensagem).trim();

      if (!text) {
        throw new Error("O texto da mensagem não pode ser vazio.");
      }

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // Enviar via sendPlatformMessage
      await sendPlatformMessage({
        conversationId: convId,
        text,
        senderType: "agent",
      });

      return {
        sucesso: true,
        mensagem: "Mensagem enviada com sucesso ao cliente!",
        conversa_id: convId,
      };
    },
  },
  {
    name: "assumir_conversa",
    description:
      "Atribui a conversa a um atendente humano específico ou ativa o agente de IA do Atendi para conduzir o atendimento.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser atribuída.",
        },
        atendente_id: {
          type: "string",
          description: "ID (UUID) do perfil/atendente humano que assumirá a conversa.",
        },
        ativar_ia: {
          type: "boolean",
          description:
            "Se true, ativa o robô/agente de IA do Atendi para atender este cliente. Padrão: false.",
          default: false,
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const updatePayload: any = {
        status: "active",
      };

      if (args.ativar_ia) {
        updatePayload.ai_active = true;
      } else {
        updatePayload.ai_active = false;
        if (args.atendente_id) {
          updatePayload.assigned_agent_id = args.atendente_id;
        }
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", convId);

      if (error) {
        throw new Error(`Erro ao atribuir conversa: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: args.ativar_ia
          ? "Conversa transferida com sucesso para o Agente de IA do Atendi."
          : "Conversa atribuída com sucesso ao atendente.",
        conversa_id: convId,
        ai_active: !!args.ativar_ia,
      };
    },
  },
  {
    name: "transferir_conversa",
    description:
      "Transfere o atendimento para outro departamento/fila, outro atendente humano ou outra filial da empresa.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser transferida.",
        },
        tipo_destino: {
          type: "string",
          enum: ["departamento", "atendente", "unidade"],
          description:
            "Tipo do destino: 'departamento' (fila do setor), 'atendente' (membro da equipe) ou 'unidade' (outra filial).",
        },
        destino_id: {
          type: "string",
          description: "ID (UUID) do departamento, atendente ou unidade de destino.",
        },
      },
      required: ["conversa_id", "tipo_destino", "destino_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const { tipo_destino, destino_id } = args;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const updatePayload: any = {};
      if (tipo_destino === "departamento") {
        updatePayload.department_id = destino_id;
        updatePayload.status = "waiting";
        updatePayload.assigned_agent_id = null;
      } else if (tipo_destino === "atendente") {
        updatePayload.assigned_agent_id = destino_id;
        updatePayload.status = "active";
      } else if (tipo_destino === "unidade") {
        updatePayload.unit_id = destino_id;
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", convId);

      if (error) {
        throw new Error(`Erro ao transferir conversa: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Conversa transferida com sucesso para ${tipo_destino}.`,
        conversa_id: convId,
        tipo_destino,
        destino_id,
      };
    },
  },
  {
    name: "adicionar_nota_interna",
    description:
      "Insere uma nota interna nos bastidores da conversa. Visível para toda a equipe no painel do Atendi, mas invisível para o cliente no WhatsApp/Instagram.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa onde a anotação será salva.",
        },
        conteudo: {
          type: "string",
          description:
            "Texto da anotação interna (ex: 'Cliente solicitou proposta B2B, preferência de contato após as 14h').",
        },
      },
      required: ["conversa_id", "conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const content = String(args.conteudo).trim();

      if (!content) {
        throw new Error("O conteúdo da nota interna não pode ser vazio.");
      }

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const { data: noteMsg, error } = await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: convId,
          sender_type: "agent",
          content,
          is_internal: true,
          media_type: "text",
        })
        .select("id, created_at")
        .single();

      if (error) {
        throw new Error(`Erro ao salvar nota interna: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Nota interna adicionada com sucesso aos bastidores da conversa!",
        nota_id: noteMsg?.id,
        conversa_id: convId,
      };
    },
  },
  {
    name: "listar_motivos_encerramento",
    description:
      "Lista todos os motivos de finalização/encerramento de atendimento cadastrados na empresa (ex: Venda Concluída, Dúvida Sanada, Sem Interesse).",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data, error } = await supabaseAdmin
        .from("resolution_reasons")
        .select("id, name, description, is_active, created_at")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error) {
        throw new Error(`Erro ao listar motivos de encerramento: ${error.message}`);
      }

      return {
        total: data?.length || 0,
        motivos: data || [],
      };
    },
  },
  {
    name: "encerrar_atendimento",
    description:
      "Encerra o ticket/atendimento da conversa, marcando o status como 'resolved' e registrando o motivo de encerramento e observações.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser encerrada.",
        },
        motivo_id: {
          type: "string",
          description:
            "ID (UUID) do motivo de resolução (obtido via 'listar_motivos_encerramento'). Opcional.",
        },
        observacao: {
          type: "string",
          description: "Resumo ou observação final sobre o atendimento.",
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const reasonId = args.motivo_id || null;
      const observation = args.observacao?.trim() || null;
      const resolvedAt = new Date().toISOString();

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // 1. Atualizar conversa
      const { error: updErr } = await supabaseAdmin
        .from("conversations")
        .update({
          status: "resolved",
          resolved_at: resolvedAt,
          current_session_id: null,
          assigned_agent_id: null,
        } as any)
        .eq("id", convId);

      if (updErr) {
        throw new Error(`Erro ao encerrar conversa: ${updErr.message}`);
      }

      // 2. Atualizar sessões abertas
      await supabaseAdmin
        .from("conversation_sessions")
        .update({
          resolved_at: resolvedAt,
          resolution_reason_id: reasonId,
          resolution_observation: observation,
        })
        .eq("conversation_id", convId)
        .is("resolved_at", null);

      return {
        sucesso: true,
        mensagem: "Atendimento encerrado com sucesso!",
        conversa_id: convId,
        encerrado_em: resolvedAt,
      };
    },
  },
];
