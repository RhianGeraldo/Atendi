/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const quickMessagesTools: McpToolDefinition[] = [
  {
    name: "listar_mensagens_rapidas",
    description:
      "Lista todas as mensagens rápidas e atalhos (/comando) cadastrados na empresa, com pastas e mídias anexadas.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Pesquisar por atalho (ex: /preco), nome ou texto da mensagem.",
        },
        pasta_id: {
          type: "string",
          description: "Filtrar atalhos de uma pasta específica.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      // 1. Buscar pastas
      const { data: folders } = await supabaseAdmin
        .from("quick_message_folders")
        .select("id, name")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      const folderMap = new Map((folders || []).map((f) => [f.id, f.name]));

      // 2. Buscar mensagens rápidas
      let query = supabaseAdmin
        .from("quick_messages")
        .select("id, name, shortcut, content, media_url, media_type, folder_id, created_at")
        .eq("company_id", context.companyId)
        .order("shortcut", { ascending: true });

      if (args?.pasta_id) {
        query = query.eq("folder_id", args.pasta_id);
      }

      if (args?.busca && typeof args.busca === "string" && args.busca.trim()) {
        const q = args.busca.trim();
        query = query.or(`shortcut.ilike.%${q}%,name.ilike.%${q}%,content.ilike.%${q}%`);
      }

      const { data: messages, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar mensagens rápidas: ${error.message}`);
      }

      return {
        total_pastas: folders?.length || 0,
        pastas: folders || [],
        total_mensagens: messages?.length || 0,
        mensagens: (messages || []).map((m: any) => ({
          id: m.id,
          atalho: m.shortcut,
          nome: m.name,
          pasta: m.folder_id ? folderMap.get(m.folder_id) || "Sem Pasta" : "Raiz (Início)",
          conteudo: m.content,
          possui_midia: !!m.media_url,
          tipo_midia: m.media_type,
        })),
      };
    },
  },
  {
    name: "consultar_mensagem_rapida",
    description:
      "Recupera o texto exato e mídia de uma mensagem rápida a partir do atalho digitado (ex: /saudacao) ou pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        atalho: {
          type: "string",
          description: "O comando do atalho (ex: '/saudacao', '/pix', '/endereco').",
        },
        id: {
          type: "string",
          description: "ID (UUID) da mensagem rápida caso conhecido.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("quick_messages")
        .select("id, name, shortcut, content, media_url, media_type, folder_id")
        .eq("company_id", context.companyId);

      if (args.id) {
        query = query.eq("id", args.id);
      } else if (args.atalho) {
        let clean = String(args.atalho).trim();
        if (!clean.startsWith("/")) clean = "/" + clean;
        query = query.eq("shortcut", clean);
      } else {
        throw new Error("Informe 'atalho' ou 'id' para consultar a mensagem rápida.");
      }

      const { data: msg, error } = await query.maybeSingle();
      if (error || !msg) {
        throw new Error("Mensagem rápida não encontrada com os critérios fornecidos.");
      }

      return {
        id: msg.id,
        nome: msg.name,
        atalho: msg.shortcut,
        conteudo: msg.content,
        media_url: msg.media_url,
        media_type: msg.media_type,
        instrucoes_variaveis:
          "Substitua tags como {{cliente}} pelo nome do cliente e {{atendente}} pelo seu nome antes de enviar.",
      };
    },
  },
  {
    name: "criar_mensagem_rapida",
    description:
      "Cadastra um novo atalho de mensagem rápida no sistema do Atendi para a equipe usar no chat.",
    inputSchema: {
      type: "object",
      properties: {
        atalho: {
          type: "string",
          description: "Comando de disparo que começa com barra (ex: /tabela-precos, /horarios).",
        },
        nome: {
          type: "string",
          description: "Título descritivo da mensagem rápida.",
        },
        conteudo: {
          type: "string",
          description:
            "Texto padrão da mensagem (suporta tags {{cliente}}, {{atendente}}, {{empresa}}).",
        },
        pasta_id: {
          type: "string",
          description: "ID (UUID) da pasta para categorizar (opcional).",
        },
      },
      required: ["atalho", "conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      let cleanShortcut = String(args.atalho).trim().replace(/\s+/g, "");
      if (!cleanShortcut.startsWith("/")) {
        cleanShortcut = "/" + cleanShortcut;
      }
      if (cleanShortcut.length <= 1) {
        throw new Error("Defina um atalho válido (ex: /saudacao).");
      }

      const { data, error } = await supabaseAdmin
        .from("quick_messages")
        .insert({
          company_id: context.companyId,
          shortcut: cleanShortcut,
          name: args.nome?.trim() || cleanShortcut,
          content: String(args.conteudo).trim(),
          folder_id: args.pasta_id || null,
        })
        .select("id, shortcut, name")
        .single();

      if (error) {
        throw new Error(`Erro ao criar mensagem rápida: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Atalho ${data.shortcut} criado com sucesso!`,
        atalho: data,
      };
    },
  },
];
