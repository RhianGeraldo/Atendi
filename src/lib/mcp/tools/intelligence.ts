/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const intelligenceTools: McpToolDefinition[] = [
  {
    name: "consultar_analise_sales_coach",
    description:
      "Recupera as avaliações de qualidade de atendimento geradas pela IA (Sales Coach) para uma conversa, incluindo pontos fortes, falhas e notas.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser consultada.",
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      // 1. Validar conversa e empresa
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id, name)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      // 2. Buscar análises do Sales Coach
      const { data: analyses, error } = await supabaseAdmin
        .from("sales_coach_analyses")
        .select("id, analysis_markdown, created_at, created_by, profiles(name)")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Erro ao buscar análises do Sales Coach: ${error.message}`);
      }

      return {
        conversa_id: convId,
        cliente: conv.contacts?.name,
        total_analises: analyses?.length || 0,
        analises: (analyses || []).map((a: any) => ({
          id: a.id,
          data_analise: a.created_at,
          avaliador: a.profiles?.name || "IA Sales Coach Automático",
          conteudo_analise: a.analysis_markdown,
        })),
      };
    },
  },
  {
    name: "consultar_origem_anuncio_lead",
    description:
      "Recupera os metadados do anúncio de tráfego pago (Meta Ads / Instagram / Facebook) que gerou o contato ou lead.",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato a ser consultado.",
        },
      },
      required: ["contato_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args.contato_id;

      const { data: contact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone, company_id")
        .eq("id", contactId)
        .eq("company_id", context.companyId)
        .single();

      if (cErr || !contact) {
        throw new Error("Contato não encontrado ou acesso negado.");
      }

      const { data: adLeads, error } = await supabaseAdmin
        .from("ad_leads")
        .select(
          "id, ad_title, ad_body, source_url, source_app, ctwa_clid, conversion_source, created_at",
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Erro ao consultar dados de anúncio: ${error.message}`);
      }

      return {
        contato: {
          id: contact.id,
          nome: contact.name,
          telefone: contact.phone,
        },
        possui_origem_paga: (adLeads && adLeads.length > 0) || false,
        anuncios: adLeads || [],
      };
    },
  },
  {
    name: "minerar_objecoes_empresa",
    description:
      "Consulta o mapeamento consolidado de objeções mais frequentes identificadas pela IA nas conversas com clientes da empresa.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: insight, error } = await supabaseAdmin
        .from("sales_objection_insights")
        .select("*")
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar insights de objeções: ${error.message}`);
      }

      if (!insight) {
        return {
          status: "sem_dados",
          mensagem: "Ainda não foram mineradas objeções consolidadas para esta empresa.",
        };
      }

      return {
        status: "sucesso",
        data_minada: insight.created_at,
        conversas_analisadas: insight.conversations_analyzed,
        principais_objecoes: insight.objections_json,
        analise_estrategica: insight.insights_markdown,
      };
    },
  },
];
