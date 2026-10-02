/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMetaCapiEvent } from "@/lib/server/meta-capi";
import type { CopilotAction, CopilotContext } from "../types";

export const intelligenceActions: CopilotAction[] = [
  // ─── Consultar Análise do Sales Coach ──────────────────────────────────────
  {
    name: "consultar_analise_sales_coach",
    label: "Consultar Avaliação Sales Coach",
    description:
      "Recupera as avaliações de qualidade de atendimento geradas pela IA (Sales Coach) para uma conversa específica, incluindo notas, pontos fortes, falhas e recomendações.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser consultada.",
        },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const convId = params.conversa_id;

      // 1. Validar conversa e empresa
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id, name)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      // 2. Buscar análises do Sales Coach
      const { data: analyses, error } = await supabaseAdmin
        .from("sales_coach_analyses")
        .select("id, analysis_markdown, created_at, created_by, profiles(name)")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          success: false,
          message: `Erro ao buscar análises do Sales Coach: ${error.message}`,
        };
      }

      if (!analyses || analyses.length === 0) {
        return {
          success: true,
          message: `Nenhuma análise do Sales Coach foi encontrada para a conversa do cliente "${(conv.contacts as any)?.name}".`,
          data: { total: 0, analises: [] },
        };
      }

      return {
        success: true,
        message: `${analyses.length} análise(s) do Sales Coach encontrada(s) para ${(conv.contacts as any)?.name}.`,
        data: {
          conversa_id: convId,
          cliente: (conv.contacts as any)?.name,
          total_analises: analyses.length,
          analises: analyses.map((a: any) => ({
            id: a.id,
            data_analise: a.created_at,
            avaliador: a.profiles?.name || "IA Sales Coach Automático",
            conteudo_analise: a.analysis_markdown,
          })),
        },
      };
    },
  },

  // ─── Consultar Origem de Anúncio Pago ──────────────────────────────────────
  {
    name: "consultar_origem_anuncio_lead",
    label: "Consultar Origem de Anúncio Pago (Meta Ads)",
    description:
      "Recupera os metadados do anúncio de tráfego pago (Meta Ads / Instagram / Facebook) que gerou o contato ou lead, como título do anúncio, campanha e ctwa_clid.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato a ser consultado.",
        },
      },
      required: ["contato_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const contactId = params.contato_id;

      const { data: contact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone, company_id")
        .eq("id", contactId)
        .eq("company_id", context.companyId)
        .single();

      if (cErr || !contact) {
        return { success: false, message: "Contato não encontrado ou acesso negado." };
      }

      const { data: adLeads, error } = await supabaseAdmin
        .from("ad_leads")
        .select(
          "id, ad_title, ad_body, source_url, source_app, ctwa_clid, conversion_source, created_at",
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      if (error) {
        return { success: false, message: `Erro ao consultar dados de anúncio: ${error.message}` };
      }

      const hasPaid = (adLeads && adLeads.length > 0) || false;

      return {
        success: true,
        message: hasPaid
          ? `Origem de tráfego pago identificada para ${contact.name}! 🎯`
          : `Contato ${contact.name} não possui registro de tráfego pago direto (veio de busca orgânica, indicação ou entrada direta).`,
        data: {
          contato: {
            id: contact.id,
            nome: contact.name,
            telefone: contact.phone,
          },
          possui_origem_paga: hasPaid,
          anuncios: adLeads || [],
        },
      };
    },
  },

  // ─── Minerar Objeções da Empresa ──────────────────────────────────────────
  {
    name: "minerar_objecoes_empresa",
    label: "Minerar Objeções de Vendas da Empresa",
    description:
      "Consulta o mapeamento consolidado de objeções mais frequentes identificadas pela IA nas conversas com clientes da empresa.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: insight, error } = await supabaseAdmin
        .from("sales_objection_insights")
        .select("*")
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { success: false, message: `Erro ao buscar insights de objeções: ${error.message}` };
      }

      if (!insight) {
        return {
          success: true,
          message: "Ainda não foram mineradas objeções consolidadas para esta empresa.",
          data: { status: "sem_dados" },
        };
      }

      return {
        success: true,
        message: `Insights de objeções recuperados com sucesso (${insight.conversations_analyzed} conversas analisadas)! 💡`,
        data: {
          status: "sucesso",
          data_minada: insight.created_at,
          conversas_analisadas: insight.conversations_analyzed,
          principais_objecoes: insight.objections_json,
          analise_estrategica: insight.insights_markdown,
        },
      };
    },
  },

  // ─── Enviar Evento de Conversão Meta CAPI ──────────────────────────────────
  {
    name: "enviar_evento_conversao_meta",
    label: "Enviar Evento de Conversão Meta CAPI",
    description:
      "Envia um evento de conversão server-side para a Meta Conversions API (CAPI v21.0), associando o contato, ctwa_clid de anúncio e/ou oportunidade ao Pixel da Meta da empresa.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        nome_evento: {
          type: "string",
          description:
            "Nome do evento de conversão da Meta. Exemplos comuns: 'Lead', 'Schedule', 'Contact', 'SubmitApplication', 'QualifiedLead', 'Purchase'.",
        },
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato que gerou a conversão.",
        },
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade associada no CRM (opcional).",
        },
        valor: {
          type: "number",
          description: "Valor financeiro da conversão (ex: valor da venda ou proposta). Opcional.",
        },
        moeda: {
          type: "string",
          description: "Código da moeda (ISO 4217). Padrão: 'BRL'.",
          default: "BRL",
        },
      },
      required: ["nome_evento"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const eventName = params.nome_evento;
      const contactId = params.contato_id;
      const opportunityId = params.oportunidade_id;
      const value = params.valor !== undefined ? Number(params.valor) : undefined;
      const currency = params.moeda || "BRL";

      // Validar acesso do contato se informado
      if (contactId) {
        const { data: contact, error: cErr } = await supabaseAdmin
          .from("contacts")
          .select("id, name, phone, company_id")
          .eq("id", contactId)
          .eq("company_id", context.companyId)
          .single();

        if (cErr || !contact) {
          return { success: false, message: "Contato não encontrado ou acesso negado." };
        }
      }

      const result = await sendMetaCapiEvent({
        companyId: context.companyId,
        contactId,
        opportunityId,
        eventName,
        value,
        currency,
        actionSource: "chat",
      });

      if (!result.success) {
        if (result.skipped) {
          return {
            success: true,
            message: `Evento CAPI ignorado: ${result.reason}`,
            data: { status: "ignorado", motivo: result.reason },
          };
        }
        return { success: false, message: `Falha ao despachar evento Meta CAPI: ${result.error}` };
      }

      return {
        success: true,
        message: `Evento de conversão "${eventName}" enviado com sucesso para a Meta Conversions API! 🚀`,
        data: {
          status: "sucesso",
          evento: eventName,
          event_id: result.eventId,
          fbtrace_id: result.fbtraceId,
        },
      };
    },
  },
];
