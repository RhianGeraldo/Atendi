/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const playbookActions: CopilotAction[] = [
  {
    name: "consultar_playbook",
    label: "Consultar Procedimentos e Regras no Playbook",
    description:
      "Consulta o Playbook de vendas e suporte oficial da empresa (procedimentos, dúvidas frequentes, formas de pagamento, regras de cancelamento e scripts de negociação).",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        termo_busca: {
          type: "string",
          description:
            "Palavra-chave ou assunto da dúvida (ex: 'reembolso', 'parcelamento', 'garantia', 'harmonização').",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      let query = supabaseAdmin
        .from("sales_playbook_procedures")
        .select("id, title, category, content, key_points, updated_at")
        .eq("company_id", context.companyId)
        .order("title", { ascending: true })
        .limit(10);

      if (params.termo_busca?.trim()) {
        const term = params.termo_busca.trim();
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%,category.ilike.%${term}%`);
      }

      const { data: procedures, error } = await query;
      if (error) return { success: false, message: `Erro ao consultar Playbook: ${error.message}` };

      return {
        success: true,
        message: `${procedures?.length || 0} procedimentos encontrados no Playbook.`,
        data: procedures || [],
      };
    },
  },
  {
    name: "salvar_procedimento_playbook",
    label: "Salvar Novo Procedimento no Playbook",
    description:
      "Cadastra ou atualiza uma regra de negócio, roteiro ou FAQ oficial no Playbook da empresa. Exclusivo para administradores.",
    minRole: "admin_company",
    requiredMenu: "training",
    parameters: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "Título do tópico ou procedimento (ex: 'Política de Desconto Máximo').",
        },
        categoria: {
          type: "string",
          description: "Categoria do procedimento (ex: 'Vendas', 'Suporte', 'Financeiro').",
        },
        conteudo: { type: "string", description: "Texto completo com as instruções e diretrizes." },
      },
      required: ["titulo", "conteudo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: created, error } = await supabaseAdmin
        .from("sales_playbook_procedures")
        .insert({
          company_id: context.companyId,
          title: params.titulo.trim(),
          category: params.categoria?.trim() || "Geral",
          content: params.conteudo.trim(),
          is_active: true,
        })
        .select("id, title, category")
        .single();

      if (error) return { success: false, message: `Erro ao salvar no Playbook: ${error.message}` };

      return {
        success: true,
        message: `Procedimento "${created.title}" cadastrado com sucesso no Playbook oficial!`,
        data: created,
      };
    },
  },
  {
    name: "listar_procedimentos",
    label: "Listar Procedimentos do Playbook",
    description:
      "Lista os procedimentos e conteúdos cadastrados no Playbook Comercial com filtros por categoria e busca.",
    minRole: "agent",
    requiredMenu: "training",
    parameters: {
      type: "object",
      properties: {
        busca: { type: "string", description: "Termo de busca no título ou conteúdo." },
        categoria: { type: "string", description: "Categoria do procedimento." },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = playbookActions.find((a) => a.name === "consultar_playbook");
      if (action) return action.execute({ termo_busca: params.busca || params.categoria }, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
  {
    name: "salvar_procedimento",
    label: "Salvar Procedimento no Playbook",
    description:
      "Cadastra ou atualiza um procedimento, FAQ, regra de preço ou script comercial no Playbook Oficial da empresa.",
    minRole: "admin_company",
    requiredMenu: "training",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título do tópico ou procedimento." },
        categoria: { type: "string", description: "Categoria do procedimento." },
        conteudo: { type: "string", description: "Texto completo com as instruções." },
      },
      required: ["titulo", "conteudo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = playbookActions.find((a) => a.name === "salvar_procedimento_playbook");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
];
