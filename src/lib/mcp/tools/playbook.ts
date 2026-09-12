import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCompanyPlaybookSummary } from "@/lib/api/training.functions";
import type { McpContext, McpToolDefinition } from "../types";

export const playbookTools: McpToolDefinition[] = [
  {
    name: "consultar_playbook",
    description: "Retorna a base de conhecimento consolidada do Playbook Comercial da empresa (procedimentos, explicações técnicas, regras de preço e scripts de contorno de objeções).",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const summary = await getCompanyPlaybookSummary(context.companyId);
      return {
        empresa: context.companyName,
        playbook_resumo: summary || "Nenhum procedimento cadastrado no Playbook da empresa até o momento.",
      };
    },
  },
  {
    name: "listar_procedimentos",
    description: "Lista os procedimentos e conteúdos cadastrados no Playbook Comercial com filtros por categoria.",
    inputSchema: {
      type: "object",
      properties: {
        categoria: {
          type: "string",
          description: "Categoria: 'all', 'procedure' (procedimentos/serviços), 'faq' (perguntas frequentes), 'pricing' (preços e condições), 'objection_script' (scripts de objeção), 'policy' (políticas).",
          enum: ["all", "procedure", "faq", "pricing", "objection_script", "policy"],
        },
        busca: {
          type: "string",
          description: "Palavra-chave para pesquisar no título ou conteúdo.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("sales_playbook_procedures")
        .select("id, title, category, content, key_points, target_audience, is_active, updated_at")
        .eq("company_id", context.companyId)
        .order("title", { ascending: true });

      if (args?.categoria && args.categoria !== "all") {
        query = query.eq("category", args.categoria);
      }

      if (args?.busca && typeof args.busca === "string" && args.busca.trim()) {
        const term = args.busca.trim();
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }

      const { data: procs, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar procedimentos: ${error.message}`);
      }

      return {
        total: procs?.length || 0,
        procedimentos: procs || [],
      };
    },
  },
  {
    name: "salvar_procedimento",
    description: "Cadastra ou atualiza um procedimento, FAQ, regra de preço ou script comercial no Playbook Oficial da empresa.",
    inputSchema: {
      type: "object",
      properties: {
        procedimento_id: {
          type: "string",
          description: "ID do procedimento caso queira atualizar um existente. Deixe vazio para criar um novo.",
        },
        titulo: {
          type: "string",
          description: "Título do procedimento ou tópico (ex: 'Harmonização Facial', 'Formas de Pagamento e Parcelamento').",
        },
        conteudo: {
          type: "string",
          description: "Explicação detalhada, passo a passo ou script comercial.",
        },
        categoria: {
          type: "string",
          description: "Categoria do item.",
          enum: ["procedure", "faq", "pricing", "objection_script", "policy"],
          default: "procedure",
        },
        pontos_chave: {
          type: "array",
          items: { type: "string" },
          description: "Lista de benefícios principais, diferenciais ou gatilhos mentais.",
        },
        publico_alvo: {
          type: "string",
          description: "Indicação ou público recomendado (opcional).",
        },
      },
      required: ["titulo", "conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      const title = String(args.titulo).trim();
      const content = String(args.conteudo).trim();
      const category = args.categoria || "procedure";
      const keyPoints = Array.isArray(args.pontos_chave) ? args.pontos_chave : [];
      const targetAudience = args.publico_alvo ? String(args.publico_alvo).trim() : null;

      if (args.procedimento_id) {
        const { data: updated, error } = await supabaseAdmin
          .from("sales_playbook_procedures")
          .update({
            title,
            content,
            category,
            key_points: keyPoints,
            target_audience: targetAudience,
            updated_at: new Date().toISOString(),
          })
          .eq("id", args.procedimento_id)
          .eq("company_id", context.companyId)
          .select()
          .single();

        if (error || !updated) {
          throw new Error(`Erro ao atualizar procedimento: ${error?.message}`);
        }

        return {
          sucesso: true,
          mensagem: "Procedimento atualizado no Playbook!",
          procedimento: updated,
        };
      } else {
        const { data: created, error } = await supabaseAdmin
          .from("sales_playbook_procedures")
          .insert({
            company_id: context.companyId,
            title,
            content,
            category,
            key_points: keyPoints,
            target_audience: targetAudience,
            is_active: true,
          })
          .select()
          .single();

        if (error || !created) {
          throw new Error(`Erro ao criar procedimento: ${error?.message}`);
        }

        return {
          sucesso: true,
          mensagem: "Procedimento adicionado ao Playbook com sucesso!",
          procedimento: created,
        };
      }
    },
  },
];
