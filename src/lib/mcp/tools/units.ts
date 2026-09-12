import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const unitsTools: McpToolDefinition[] = [
  {
    name: "listar_unidades",
    description: "Lista todas as unidades / filiais da empresa com seus IDs, nomes, slugs, endereços e horários de funcionamento.",
    inputSchema: {
      type: "object",
      properties: {
        somente_ativas: {
          type: "boolean",
          description: "Filtrar apenas unidades ativas. Padrão: true.",
          default: true,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const activeOnly = args?.somente_ativas !== false;

      let query = supabaseAdmin
        .from("units")
        .select("id, name, slug, address, business_hours, color, active, created_at")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (context.unitId) {
        // Escopo restrito da chave
        query = query.eq("id", context.unitId);
      } else if (activeOnly) {
        query = query.eq("active", true);
      }

      const { data: units, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar unidades: ${error.message}`);
      }

      return {
        empresa: context.companyName,
        escopo: context.unitId ? `Restrito à unidade ${context.unitName}` : "Matriz (Todas as Unidades)",
        total: units?.length || 0,
        unidades: units || [],
      };
    },
  },
  {
    name: "consultar_unidade",
    description: "Consulta os dados detalhados de uma unidade/filial específica (endereço, CNPJ, horários, variáveis locais personalizadas).",
    inputSchema: {
      type: "object",
      properties: {
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade a consultar. Se a chave for restrita a uma unidade, esse campo é opcional.",
        },
      },
      required: [],
    },
    handler: async (args: any, context: McpContext) => {
      const targetUnitId = context.unitId || args?.unidade_id;
      if (!targetUnitId) {
        throw new Error("unidade_id é obrigatório para chaves com visão Matriz / Global.");
      }

      const { data: unit, error } = await supabaseAdmin
        .from("units")
        .select("id, name, slug, address, business_hours, document, custom_variables, color, active")
        .eq("id", targetUnitId)
        .eq("company_id", context.companyId)
        .single();

      if (error || !unit) {
        throw new Error(`Unidade não encontrada ou sem permissão de acesso.`);
      }

      return { unidade: unit };
    },
  },
  {
    name: "listar_departamentos",
    description: "Lista os departamentos (setores) de atendimento das unidades (ex: Recepção, Comercial, Pós-Venda) com seus SLAs e limites.",
    inputSchema: {
      type: "object",
      properties: {
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade para filtrar os departamentos. Opcional para chave Matriz.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("departments")
        .select("id, name, description, max_agents, sla_minutes, active, unit_id, units(name, slug)")
        .order("name", { ascending: true });

      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      } else {
        // Obter todas as unidades da empresa
        const { data: companyUnits } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId);

        const unitIds = (companyUnits || []).map((u) => u.id);
        if (unitIds.length === 0) return { departamentos: [] };
        query = query.in("unit_id", unitIds);
      }

      const { data: depts, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar departamentos: ${error.message}`);
      }

      return {
        total: depts?.length || 0,
        departamentos: depts || [],
      };
    },
  },
];
