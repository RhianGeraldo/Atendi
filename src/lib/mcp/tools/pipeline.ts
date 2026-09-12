import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const pipelineTools: McpToolDefinition[] = [
  {
    name: "listar_funis",
    description: "Lista os funis de vendas (pipelines) configurados para a empresa.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: pipelines, error } = await supabaseAdmin
        .from("pipelines")
        .select("id, name, created_at")
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error(`Erro ao listar funis: ${error.message}`);
      }

      return {
        total: pipelines?.length || 0,
        funis: pipelines || [],
      };
    },
  },
  {
    name: "listar_etapas",
    description: "Lista as etapas (colunas do Kanban) do funil de vendas, ordenadas por posição.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline_id: {
          type: "string",
          description: "ID do funil (opcional). Se omitido, busca as etapas do funil principal.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, color, order, pipeline_id, unit_id, units(name)")
        .order("order", { ascending: true });

      if (args?.pipeline_id) {
        query = query.eq("pipeline_id", args.pipeline_id);
      } else {
        // Obter primeiro pipeline da empresa
        const { data: pips } = await supabaseAdmin
          .from("pipelines")
          .select("id")
          .eq("company_id", context.companyId)
          .limit(1);

        if (pips && pips.length > 0) {
          query = query.eq("pipeline_id", pips[0].id);
        }
      }

      if (context.unitId) {
        query = query.or(`unit_id.is.null,unit_id.eq.${context.unitId}`);
      }

      const { data: stages, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar etapas: ${error.message}`);
      }

      return {
        total: stages?.length || 0,
        etapas: stages || [],
      };
    },
  },
  {
    name: "listar_oportunidades",
    description: "Lista negócios e oportunidades em andamento no CRM, com filtros por status, etapa e unidade.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Status da oportunidade: 'all', 'open' (em aberto), 'won' (ganha), 'lost' (perdida). Padrão: 'open'.",
          enum: ["all", "open", "won", "lost"],
          default: "open",
        },
        etapa_id: {
          type: "string",
          description: "Filtrar por etapa específica do funil.",
        },
        unidade_id: {
          type: "string",
          description: "Filtrar por unidade/filial específica. Opcional para chave Matriz.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de oportunidades a retornar (padrão 25, máx 100).",
          default: 25,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 25, 1), 100);
      const targetStatus = args?.status || "open";
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("opportunities")
        .select(`
          id,
          title,
          value,
          status,
          created_at,
          stage_id,
          unit_id,
          contact_id,
          contacts!inner(id, name, phone, company_id),
          pipeline_stages(id, name, color),
          units(name, slug),
          profiles(name)
        `)
        .eq("contacts.company_id", context.companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (targetStatus !== "all") {
        query = query.eq("status", targetStatus);
      }

      if (args?.etapa_id) {
        query = query.eq("stage_id", args.etapa_id);
      }

      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      }

      const { data: opps, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar oportunidades: ${error.message}`);
      }

      return {
        total: opps?.length || 0,
        oportunidades: (opps || []).map((o: any) => ({
          id: o.id,
          titulo: o.title,
          valor: o.value,
          status: o.status,
          etapa: o.pipeline_stages?.name || "Sem etapa",
          etapa_id: o.stage_id,
          contato: {
            id: o.contacts?.id,
            nome: o.contacts?.name,
            telefone: o.contacts?.phone,
          },
          unidade: o.units?.name || "Geral",
          responsavel: o.profiles?.name || "Não atribuído",
          criada_em: o.created_at,
        })),
      };
    },
  },
  {
    name: "criar_oportunidade",
    description: "Cria uma nova oportunidade de venda no funil do CRM vinculada a um contato e a uma unidade.",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato/lead.",
        },
        titulo: {
          type: "string",
          description: "Título da oportunidade (ex: 'Procedimento X - Avaliação', 'Venda Pacote Premium').",
        },
        valor: {
          type: "number",
          description: "Valor estimado em reais (opcional).",
        },
        etapa_id: {
          type: "string",
          description: "ID da etapa do funil (se omitido, será usada a primeira etapa do funil).",
        },
        unidade_id: {
          type: "string",
          description: "ID da unidade responsável pela oportunidade (opcional para chave restrita).",
        },
      },
      required: ["contato_id", "titulo"],
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args.contato_id;
      const title = String(args.titulo).trim();
      const value = args.valor ? Number(args.valor) : 0;
      let stageId = args.etapa_id;
      const targetUnitId = context.unitId || args.unidade_id || null;

      // Validar contato
      const { data: contact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .select("id, unit_id, company_id")
        .eq("id", contactId)
        .eq("company_id", context.companyId)
        .single();

      if (contactErr || !contact) {
        throw new Error("Contato não encontrado na empresa.");
      }

      // Se não passou etapa, pegar a primeira etapa disponível
      if (!stageId) {
        const { data: stages } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id")
          .order("order", { ascending: true })
          .limit(1);

        stageId = stages?.[0]?.id || null;
      }

      const { data: created, error } = await supabaseAdmin
        .from("opportunities")
        .insert({
          contact_id: contactId,
          title,
          value,
          stage_id: stageId,
          unit_id: targetUnitId || contact.unit_id || null,
          status: "open",
        })
        .select("*, pipeline_stages(name), units(name)")
        .single();

      if (error || !created) {
        throw new Error(`Erro ao criar oportunidade: ${error?.message}`);
      }

      // Registrar histórico
      await supabaseAdmin.from("opportunity_history").insert({
        opportunity_id: created.id,
        action_type: "created",
        description: `Oportunidade criada via MCP com o título "${title}" e valor R$ ${value}`,
      });

      return {
        sucesso: true,
        oportunidade: created,
      };
    },
  },
  {
    name: "mover_oportunidade",
    description: "Move uma oportunidade de negócio para uma nova etapa do funil (Kanban).",
    inputSchema: {
      type: "object",
      properties: {
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade.",
        },
        nova_etapa_id: {
          type: "string",
          description: "ID da nova etapa do funil de vendas.",
        },
        motivo: {
          type: "string",
          description: "Comentário ou motivo da movimentação (opcional).",
        },
      },
      required: ["oportunidade_id", "nova_etapa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const oppId = args.oportunidade_id;
      const newStageId = args.nova_etapa_id;

      // Buscar oportunidade atual
      const { data: opp, error: oppErr } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, stage_id, unit_id, contacts!inner(company_id), pipeline_stages(name)")
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || opp.contacts?.company_id !== context.companyId) {
        throw new Error("Oportunidade não encontrada ou acesso negado.");
      }

      if (context.unitId && opp.unit_id && opp.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a oportunidade pertence a outra filial.");
      }

      // Buscar nome da nova etapa
      const { data: newStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("name")
        .eq("id", newStageId)
        .single();

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("opportunities")
        .update({ stage_id: newStageId })
        .eq("id", oppId)
        .select("*, pipeline_stages(name)")
        .single();

      if (updateErr) {
        throw new Error(`Erro ao mover oportunidade: ${updateErr.message}`);
      }

      // Registrar histórico
      await supabaseAdmin.from("opportunity_history").insert({
        opportunity_id: oppId,
        action_type: "stage_change",
        description: `Movida de "${opp.pipeline_stages?.name || 'Início'}" para "${newStage?.name || 'Nova Etapa'}". ${args.motivo ? `Motivo: ${args.motivo}` : ''}`.trim(),
      });

      return {
        sucesso: true,
        mensagem: `Oportunidade movida para a etapa "${newStage?.name || 'Nova Etapa'}".`,
        oportunidade: updated,
      };
    },
  },
  {
    name: "atualizar_oportunidade",
    description: "Atualiza o status (ganha/perdida/aberta), valor ou título de uma oportunidade.",
    inputSchema: {
      type: "object",
      properties: {
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade.",
        },
        status: {
          type: "string",
          description: "Novo status: 'open', 'won' (venda fechada/ganha), 'lost' (perdida).",
          enum: ["open", "won", "lost"],
        },
        valor: {
          type: "number",
          description: "Novo valor em reais.",
        },
        titulo: {
          type: "string",
          description: "Novo título.",
        },
      },
      required: ["oportunidade_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const oppId = args.oportunidade_id;
      const updateData: any = {};

      if (args.status) updateData.status = args.status;
      if (args.valor !== undefined) updateData.value = Number(args.valor);
      if (args.titulo) updateData.title = String(args.titulo).trim();

      const { data: opp, error: oppErr } = await supabaseAdmin
        .from("opportunities")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || opp.contacts?.company_id !== context.companyId) {
        throw new Error("Oportunidade não encontrada.");
      }

      if (context.unitId && opp.unit_id && opp.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a oportunidade pertence a outra filial.");
      }

      const { data: updated, error } = await supabaseAdmin
        .from("opportunities")
        .update(updateData)
        .eq("id", oppId)
        .select("*, pipeline_stages(name), units(name)")
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar oportunidade: ${error.message}`);
      }

      if (args.status) {
        await supabaseAdmin.from("opportunity_history").insert({
          opportunity_id: oppId,
          action_type: "status_change",
          description: `Status alterado para "${args.status === 'won' ? 'Ganha (Venda Fechada)' : args.status === 'lost' ? 'Perdida' : 'Em Aberto'}"`,
        });
      }

      return {
        sucesso: true,
        oportunidade: updated,
      };
    },
  },
];
