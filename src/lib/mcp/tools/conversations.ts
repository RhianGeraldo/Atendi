import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "@/lib/server/message-sender";
import type { McpContext, McpToolDefinition } from "../types";

export const conversationsTools: McpToolDefinition[] = [
  {
    name: "listar_conversas",
    description: "Lista as conversas/atendimentos de WhatsApp e Instagram da empresa ou filial, com status e última mensagem.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Status da conversa: 'all', 'waiting' (aguardando), 'active' (em atendimento), 'resolved' (resolvida/finalizada). Padrão: 'active'.",
          enum: ["all", "waiting", "active", "resolved"],
          default: "active",
        },
        canal: {
          type: "string",
          description: "Canal da conversa: 'all', 'whatsapp', 'instagram', 'messenger'. Padrão: 'all'.",
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
        .select(`
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
        `)
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
    description: "Recupera o histórico completo de mensagens trocadas em um atendimento específico no WhatsApp ou Instagram.",
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
        .select("id, status, channel, unit_id, ai_active, contacts!inner(id, name, phone, company_id), units(name)")
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
        .select("id, sender_type, content, media_type, media_url, transcription, created_at, profiles(name)")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(msgLimit);

      if (msgErr) {
        throw new Error(`Erro ao buscar mensagens: ${msgErr.message}`);
      }

      const sortedMessages = (messages || []).reverse().map((m: any) => ({
        id: m.id,
        remetente: m.sender_type === "contact" ? "Cliente" : m.sender_type === "system" ? "Sistema" : "Atendente",
        nome_atendente: m.profiles?.name || null,
        conteudo: m.content || (m.transcription ? `[Áudio]: ${m.transcription}` : `[${m.media_type}]`),
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
    description: "Envia uma mensagem de texto real para o cliente pelo WhatsApp ou Instagram Direct da conversa selecionada.",
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
];
