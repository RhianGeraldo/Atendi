/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const quickMessagesActions: CopilotAction[] = [
  // ─── Listar mensagens rápidas ─────────────────────────────────────────────
  {
    name: "listar_mensagens_rapidas",
    label: "Listar Mensagens Rápidas",
    description:
      "Lista todos os atalhos de mensagens rápidas cadastrados na empresa (ex: /saudacao, /preco, /horarios). Pode filtrar por texto ou atalho.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Pesquisar por atalho, nome ou texto da mensagem. Opcional.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      let query = supabaseAdmin
        .from("quick_messages")
        .select("id, name, shortcut, content, media_url, media_type, folder_id")
        .eq("company_id", context.companyId)
        .order("shortcut", { ascending: true });

      if (params.busca && typeof params.busca === "string" && params.busca.trim()) {
        const q = params.busca.trim();
        query = query.or(`shortcut.ilike.%${q}%,name.ilike.%${q}%,content.ilike.%${q}%`);
      }

      const { data: messages, error } = await query.limit(30);
      if (error) return { success: false, message: `Erro: ${error.message}` };

      return {
        success: true,
        message: `${messages?.length || 0} mensagem(ns) rápida(s) encontrada(s).`,
        data: (messages || []).map((m: any) => ({
          id: m.id,
          atalho: m.shortcut,
          nome: m.name,
          conteudo: m.content,
          possui_midia: !!m.media_url,
        })),
      };
    },
  },

  // ─── Consultar mensagem rápida por atalho ─────────────────────────────────
  {
    name: "consultar_mensagem_rapida",
    label: "Consultar Mensagem Rápida por Atalho",
    description:
      "Recupera o texto completo de uma mensagem rápida pelo atalho (ex: /saudacao). Útil para saber o conteúdo antes de enviar.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        atalho: {
          type: "string",
          description:
            "O atalho da mensagem (ex: '/saudacao', '/pix', '/preco'). A barra '/' é adicionada automaticamente se não informada.",
        },
      },
      required: ["atalho"],
    },
    execute: async (params: any, context: CopilotContext) => {
      let clean = String(params.atalho).trim();
      if (!clean.startsWith("/")) clean = "/" + clean;

      const { data: msg, error } = await supabaseAdmin
        .from("quick_messages")
        .select("id, name, shortcut, content, media_url, media_type")
        .eq("company_id", context.companyId)
        .ilike("shortcut", clean)
        .maybeSingle();

      if (error || !msg) {
        return { success: false, message: `Mensagem rápida "${clean}" não encontrada.` };
      }

      return {
        success: true,
        message: `Mensagem rápida ${msg.shortcut} encontrada.`,
        data: {
          id: msg.id,
          atalho: msg.shortcut,
          nome: msg.name,
          conteudo: msg.content,
          media_url: msg.media_url,
          media_type: msg.media_type,
          variaveis_suportadas: [
            "{{cliente}}",
            "{{primeiro_nome}}",
            "{{atendente}}",
            "{{saudacao}}",
            "{{empresa}}",
            "{{unidade}}",
            "{{telefone}}",
            "{{protocolo}}",
            "{{data}}",
            "{{hora}}",
          ],
        },
      };
    },
  },

  // ─── Criar mensagem rápida ────────────────────────────────────────────────
  {
    name: "criar_mensagem_rapida",
    label: "Criar Novo Atalho de Mensagem Rápida",
    description:
      "Cadastra um novo atalho de mensagem rápida para a equipe usar no chat. Suporta variáveis: {{cliente}}, {{primeiro_nome}}, {{atendente}}, {{saudacao}}, {{empresa}}, {{unidade}}, {{telefone}}, {{protocolo}}, {{data}}, {{hora}}.",
    minRole: "manager",
    parameters: {
      type: "object",
      properties: {
        atalho: {
          type: "string",
          description:
            "Atalho que começa com '/' (ex: /tabela-precos, /horarios). A barra é adicionada automaticamente.",
        },
        conteudo: {
          type: "string",
          description:
            "Texto padrão da mensagem. Pode usar variáveis como {{cliente}}, {{atendente}}, etc.",
        },
        nome: {
          type: "string",
          description: "Título descritivo (opcional). Se omitido, usa o atalho.",
        },
      },
      required: ["atalho", "conteudo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      let cleanShortcut = String(params.atalho).trim().replace(/\s+/g, "");
      if (!cleanShortcut.startsWith("/")) cleanShortcut = "/" + cleanShortcut;
      if (cleanShortcut.length <= 1) {
        return { success: false, message: "Defina um atalho válido (ex: /saudacao)." };
      }

      const { data, error } = await supabaseAdmin
        .from("quick_messages")
        .insert({
          company_id: context.companyId,
          shortcut: cleanShortcut,
          name: params.nome?.trim() || cleanShortcut,
          content: String(params.conteudo).trim(),
        })
        .select("id, shortcut, name")
        .single();

      if (error) return { success: false, message: `Erro ao criar: ${error.message}` };

      return {
        success: true,
        message: `Atalho ${data.shortcut} criado com sucesso! ⚡ A equipe já pode usar digitando "${data.shortcut}" no chat.`,
        data,
      };
    },
  },
];
