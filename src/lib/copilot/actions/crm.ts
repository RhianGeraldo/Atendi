/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMetaCapiEvent } from "@/lib/server/meta-capi";
import { getQuestionDisqualification, parseAnswerValue } from "@/types/crm-qualification";
import type { CopilotAction, CopilotContext } from "../types";

export const crmActions: CopilotAction[] = [
  // ─── Listar funis ─────────────────────────────────────────────────────────
  {
    name: "listar_funis",
    label: "Listar Funis de Vendas",
    description: "Lista os funis de vendas (pipelines) configurados para a empresa.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: pipelines, error } = await supabaseAdmin
        .from("pipelines")
        .select("id, name, created_at")
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: true });

      if (error) return { success: false, message: `Erro ao listar funis: ${error.message}` };

      return {
        success: true,
        message: `${pipelines?.length || 0} funil(s) encontrado(s).`,
        data: pipelines || [],
      };
    },
  },

  // ─── Listar etapas do funil ───────────────────────────────────────────────
  {
    name: "listar_etapas_funil",
    label: "Listar Etapas do Funil",
    description:
      "Lista as etapas (colunas do Kanban) de um funil de vendas, ordenadas por posição. Se pipeline_id não for informado, usa o primeiro funil da empresa.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        pipeline_id: { type: "string", description: "ID do funil (opcional)." },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      let pipelineId = params.pipeline_id;

      if (!pipelineId) {
        const { data: pips } = await supabaseAdmin
          .from("pipelines")
          .select("id")
          .eq("company_id", context.companyId)
          .order("created_at", { ascending: true })
          .limit(1);
        pipelineId = pips?.[0]?.id;
      }

      if (!pipelineId) return { success: false, message: "Nenhum funil configurado na empresa." };

      const { data: stages, error } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, color, order, pipeline_id, unit_id, units(name)")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });

      if (error) return { success: false, message: `Erro: ${error.message}` };

      return {
        success: true,
        message: `${stages?.length || 0} etapa(s) encontrada(s).`,
        data: (stages || []).map((s: any) => ({
          id: s.id,
          nome: s.name,
          ordem: s.order,
          cor: s.color,
          unidade: (s.units as any)?.name || null,
        })),
      };
    },
  },

  // ─── Listar oportunidades ─────────────────────────────────────────────────
  {
    name: "listar_oportunidades",
    label: "Listar Oportunidades do CRM",
    description:
      "Lista negócios e oportunidades no CRM, com filtros por etapa (nome ou ID), unidade (filial), status e contato. Retorna as oportunidades detalhadas e o VALOR TOTAL consolidado em reais.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "open", "won", "lost"],
          description: "Status da oportunidade (padrão: 'open').",
          default: "open",
        },
        etapa_nome: {
          type: "string",
          description:
            "Nome da etapa do funil (ex: 'Orçamento Gerado', 'Fechamento', 'Novo Lead').",
        },
        etapa_id: { type: "string", description: "ID (UUID) da etapa específica ou nome." },
        unidade_nome: {
          type: "string",
          description:
            "Nome da unidade/filial para filtrar (ex: 'São Mateus', 'Serra', 'Linhares').",
        },
        contato_id: {
          type: "string",
          description: "Filtrar por contato específico (UUID ou nome).",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de oportunidades a detalhar (padrão 20, máx 50).",
          default: 20,
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const limit = Math.min(Math.max(Number(params.limite) || 20, 1), 50);
      const targetStatus = params.status || "open";
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // 1. Resolução inteligente de etapa (por etapa_nome ou etapa_id não-UUID)
      let stageId: string | null = null;
      let stageNameFound: string | null = null;
      const searchStage =
        params.etapa_nome ||
        (params.etapa_id && !uuidRegex.test(params.etapa_id) ? params.etapa_id : null);

      if (searchStage) {
        const { data: st } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id, name, pipeline:pipelines!inner(company_id)")
          .eq("pipeline.company_id", context.companyId)
          .ilike("name", `%${String(searchStage).trim()}%`)
          .limit(1);
        if (st && st.length > 0) {
          stageId = st[0].id;
          stageNameFound = st[0].name;
        }
      } else if (params.etapa_id && uuidRegex.test(params.etapa_id)) {
        stageId = params.etapa_id;
      }

      // 2. Resolução inteligente de unidade
      let unitId: string | null = null;
      let unitNameFound: string | null = null;
      if (params.unidade_nome) {
        const { data: u } = await supabaseAdmin
          .from("units")
          .select("id, name")
          .eq("company_id", context.companyId)
          .ilike("name", `%${String(params.unidade_nome).trim()}%`)
          .limit(1);
        if (u && u.length > 0) {
          unitId = u[0].id;
          unitNameFound = u[0].name;
        }
      }

      // 3. Resolução de contato_id se for nome
      let contactId = params.contato_id;
      if (contactId && !uuidRegex.test(contactId)) {
        const { data: c } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${String(contactId).trim()}%`)
          .limit(1);
        contactId = c?.[0]?.id || null;
      }

      // 4. Montar query base para cálculo do total e da soma
      let baseQuery = supabaseAdmin
        .from("opportunities")
        .select(
          "id, title, value, status, created_at, unit_id, stage_id, stage:pipeline_stages(id, name), contact:contacts!inner(id, name, phone, company_id), unit:units(name)",
        )
        .eq("contact.company_id", context.companyId);

      if (targetStatus !== "all") baseQuery = baseQuery.eq("status", targetStatus);
      if (stageId) baseQuery = baseQuery.eq("stage_id", stageId);
      if (unitId) baseQuery = baseQuery.eq("unit_id", unitId);
      if (contactId) baseQuery = baseQuery.eq("contact_id", contactId);

      const { data: allMatching, error } = await baseQuery.order("created_at", {
        ascending: false,
      });

      if (error)
        return { success: false, message: `Erro ao buscar oportunidades: ${error.message}` };

      const totalCount = allMatching?.length || 0;
      const totalValor = (allMatching || []).reduce(
        (acc, cur) => acc + (Number(cur.value) || 0),
        0,
      );
      const totalFormatado = totalValor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const sliced = (allMatching || []).slice(0, limit);

      const msgFiltro = [
        stageNameFound ? `na etapa "${stageNameFound}"` : "",
        unitNameFound ? `na unidade "${unitNameFound}"` : "",
        targetStatus !== "all" ? `(status: ${targetStatus})` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return {
        success: true,
        message: `${totalCount} oportunidade(s) encontrada(s)${msgFiltro ? " " + msgFiltro : ""} totalizando ${totalFormatado}.`,
        data: {
          total_oportunidades: totalCount,
          valor_total_reais: totalValor,
          valor_total_formatado: totalFormatado,
          etapa: stageNameFound,
          unidade: unitNameFound,
          oportunidades: sliced.map((o: any) => ({
            id: o.id,
            titulo: o.title,
            valor: Number(o.value) || 0,
            status: o.status,
            etapa: (o.stage as any)?.name || null,
            contato: (o.contact as any)?.name || null,
            telefone: (o.contact as any)?.phone || null,
            unidade: (o.unit as any)?.name || null,
            criado_em: o.created_at,
          })),
        },
      };
    },
  },

  // ─── Criar oportunidade ───────────────────────────────────────────────────
  {
    name: "criar_oportunidade",
    label: "Criar Oportunidade no CRM",
    description:
      "Cria um novo negócio/oportunidade no funil de vendas vinculado a um contato. Informe o título, etapa e valor estimado.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título/descrição da oportunidade." },
        contato_id: {
          type: "string",
          description:
            "UUID do contato vinculado. IMPORTANTE: use buscar_contato primeiro para obter o ID correto. Nunca passe o nome do contato aqui, somente o UUID.",
        },
        etapa_id: { type: "string", description: "ID da etapa do funil onde será criada." },
        valor: { type: "number", description: "Valor estimado da oportunidade (R$)." },
      },
      required: ["titulo", "contato_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      // Validar se contato_id é UUID válido; se não, tentar resolver pelo nome
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (params.contato_id && !uuidRegex.test(params.contato_id)) {
        const searchTerm = String(params.contato_id).trim();
        const { data: foundList } = await supabaseAdmin
          .from("contacts")
          .select("id, name, phone, merged_into_id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${searchTerm}%`)
          .order("phone", { ascending: false, nullsFirst: false })
          .limit(10);

        if (foundList && foundList.length > 0) {
          const sorted = [...foundList].sort((a: any, b: any) => {
            const aPhone = a.phone ? 1 : 0;
            const bPhone = b.phone ? 1 : 0;
            return bPhone - aPhone;
          });
          const best = sorted[0];
          params.contato_id = best.merged_into_id || best.id;
        } else {
          return {
            success: false,
            message: `Contato "${searchTerm}" não encontrado. Use buscar_contato para localizar o contato antes de criar a oportunidade.`,
          };
        }
      }

      // Se não informou etapa, pegar primeira etapa do primeiro funil
      let stageId = params.etapa_id;
      if (!stageId) {
        const { data: pips } = await supabaseAdmin
          .from("pipelines")
          .select("id")
          .eq("company_id", context.companyId)
          .order("created_at", { ascending: true })
          .limit(1);

        if (pips && pips.length > 0) {
          const { data: stages } = await supabaseAdmin
            .from("pipeline_stages")
            .select("id")
            .eq("pipeline_id", pips[0].id)
            .order("order", { ascending: true })
            .limit(1);
          stageId = stages?.[0]?.id;
        }
      }

      let unitId = context.unitId || null;
      if (!unitId && params.contato_id) {
        const { data: c } = await supabaseAdmin
          .from("contacts")
          .select("unit_id")
          .eq("id", params.contato_id)
          .maybeSingle();
        if (c?.unit_id) unitId = c.unit_id;
      }
      if (!unitId && stageId) {
        const { data: st } = await supabaseAdmin
          .from("pipeline_stages")
          .select("unit_id")
          .eq("id", stageId)
          .maybeSingle();
        if (st?.unit_id) unitId = st.unit_id;
      }

      const { data: opp, error } = await supabaseAdmin
        .from("opportunities")
        .insert({
          title: params.titulo.trim(),
          contact_id: params.contato_id,
          stage_id: stageId || null,
          unit_id: unitId || null,
          owner_id: context.userId,
          value: params.valor !== undefined ? Number(params.valor) : null,
          status: "open",
        })
        .select("id, title, value, status")
        .single();

      if (error || !opp)
        return { success: false, message: `Erro ao criar oportunidade: ${error?.message}` };

      return {
        success: true,
        message: `Oportunidade "${opp.title}" criada com sucesso no CRM! 🎯`,
        data: opp,
      };
    },
  },

  // ─── Mover oportunidade ───────────────────────────────────────────────────
  {
    name: "mover_oportunidade",
    label: "Mover Oportunidade de Etapa",
    description:
      "Move uma oportunidade para outra etapa do funil de vendas (ex: de 'Proposta' para 'Negociação'). Grava histórico e dispara eventos de conversão Meta CAPI se configurados.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        oportunidade_id: { type: "string", description: "ID da oportunidade." },
        etapa_id: { type: "string", description: "ID da etapa de destino." },
        motivo: { type: "string", description: "Motivo ou observação da mudança (opcional)." },
      },
      required: ["oportunidade_id", "etapa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: opp, error: oppErr } = await supabaseAdmin
        .from("opportunities")
        .select(
          "id, title, value, contact_id, stage_id, contact:contacts!inner(company_id), pipeline_stages(name)",
        )
        .eq("id", params.oportunidade_id)
        .eq("contact.company_id", context.companyId)
        .maybeSingle();

      if (oppErr || !opp) return { success: false, message: "Oportunidade não encontrada." };

      const { data: newStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, meta_event_name")
        .eq("id", params.etapa_id)
        .single();

      const { error } = await supabaseAdmin
        .from("opportunities")
        .update({ stage_id: params.etapa_id })
        .eq("id", params.oportunidade_id);

      if (error) return { success: false, message: `Erro: ${error.message}` };

      // Registrar histórico
      await supabaseAdmin.from("opportunity_history").insert({
        opportunity_id: params.oportunidade_id,
        action_type: "stage_change",
        description:
          `Movida de "${(opp as any).pipeline_stages?.name || "Início"}" para "${newStage?.name || "Nova Etapa"}". ${params.motivo ? `Motivo: ${params.motivo}` : ""}`.trim(),
      });

      // Disparar evento Meta CAPI se configurado
      let capiSent: string | null = null;
      if (newStage?.meta_event_name) {
        try {
          const capiRes = await sendMetaCapiEvent({
            companyId: context.companyId,
            contactId: opp.contact_id,
            opportunityId: opp.id,
            eventName: newStage.meta_event_name,
            value: opp.value ? Number(opp.value) : undefined,
            currency: "BRL",
            actionSource: "chat",
          });
          if (capiRes.success) capiSent = newStage.meta_event_name;
        } catch (capiErr) {
          console.error("[CopilotCRM] Falha ao enviar evento Meta CAPI na movimentação:", capiErr);
        }
      }

      return {
        success: true,
        message: `Oportunidade "${opp.title}" movida com sucesso para "${newStage?.name || "Nova Etapa"}"! 🚀${capiSent ? ` (Evento Meta CAPI '${capiSent}' disparado)` : ""}`,
      };
    },
  },

  // ─── Atualizar oportunidade ───────────────────────────────────────────────
  {
    name: "atualizar_oportunidade",
    label: "Atualizar Oportunidade",
    description:
      "Atualiza dados de uma oportunidade: título, valor ou status (open/won/lost). Dispara evento Purchase Meta CAPI quando ganha.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        oportunidade_id: { type: "string", description: "ID da oportunidade." },
        titulo: { type: "string", description: "Novo título." },
        valor: { type: "number", description: "Novo valor estimado (R$)." },
        status: {
          type: "string",
          enum: ["open", "won", "lost"],
          description: "Novo status.",
        },
        observacao: { type: "string", description: "Observação/motivo (ex: motivo da perda)." },
      },
      required: ["oportunidade_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: opp } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, value, contact_id, contact:contacts!inner(company_id)")
        .eq("id", params.oportunidade_id)
        .eq("contact.company_id", context.companyId)
        .maybeSingle();

      if (!opp) return { success: false, message: "Oportunidade não encontrada." };

      const updateData: any = {};
      if (params.titulo) updateData.title = String(params.titulo).trim();
      if (params.valor !== undefined) updateData.value = params.valor;
      if (params.status) updateData.status = params.status;
      if (params.observacao) updateData.notes = String(params.observacao).trim();
      if (params.status === "won" || params.status === "lost") {
        updateData.expected_close_date = new Date().toISOString().split("T")[0];
      }

      const { error } = await supabaseAdmin
        .from("opportunities")
        .update(updateData)
        .eq("id", params.oportunidade_id);

      if (error) return { success: false, message: `Erro: ${error.message}` };

      if (params.status) {
        await supabaseAdmin.from("opportunity_history").insert({
          opportunity_id: params.oportunidade_id,
          action_type: "status_change",
          description: `Status alterado para "${params.status === "won" ? "Ganha (Venda Fechada)" : params.status === "lost" ? "Perdida" : "Em Aberto"}"`,
        });

        // Se marcada como ganha ('won'), dispara evento Purchase na Meta Conversions API
        if (params.status === "won") {
          try {
            await sendMetaCapiEvent({
              companyId: context.companyId,
              contactId: opp.contact_id,
              opportunityId: opp.id,
              eventName: "Purchase",
              value: Number(updateData.value !== undefined ? updateData.value : opp.value) || 0,
              currency: "BRL",
              actionSource: "chat",
            });
          } catch (capiErr) {
            console.error("[CopilotCRM] Falha ao enviar evento Purchase Meta CAPI:", capiErr);
          }
        }
      }

      const statusMsg =
        params.status === "won"
          ? " 🏆 Marcada como GANHA!"
          : params.status === "lost"
            ? " ❌ Marcada como PERDIDA."
            : "";

      return {
        success: true,
        message: `Oportunidade "${opp.title}" atualizada!${statusMsg}`,
      };
    },
  },

  // ─── Criar etapa no funil ─────────────────────────────────────────────────
  {
    name: "criar_etapa_funil",
    label: "Criar Nova Etapa no Funil",
    description: "Cria uma nova etapa (coluna) em um funil de vendas existente.",
    minRole: "manager",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome da etapa (ex: 'Negociação', 'Proposta Enviada').",
        },
        pipeline_id: {
          type: "string",
          description: "ID do funil onde a etapa será criada (usa o primeiro se omitido).",
        },
        cor: { type: "string", description: "Cor da etapa em hex (ex: '#4CAF50'). Opcional." },
      },
      required: ["nome"],
    },
    execute: async (params: any, context: CopilotContext) => {
      let pipelineId = params.pipeline_id;

      if (!pipelineId) {
        const { data: pips } = await supabaseAdmin
          .from("pipelines")
          .select("id")
          .eq("company_id", context.companyId)
          .order("created_at", { ascending: true })
          .limit(1);
        pipelineId = pips?.[0]?.id;
      }

      if (!pipelineId) return { success: false, message: "Nenhum funil encontrado." };

      // Pegar maior ordem atual
      const { data: lastStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("order")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = ((lastStage as any)?.order || 0) + 1;

      const { data: stage, error } = await supabaseAdmin
        .from("pipeline_stages")
        .insert({
          pipeline_id: pipelineId,
          name: params.nome.trim(),
          color: params.cor || "#6366f1",
          order: nextOrder,
        })
        .select("id, name, order")
        .single();

      if (error || !stage) return { success: false, message: `Erro: ${error?.message}` };

      return {
        success: true,
        message: `Etapa "${stage.name}" criada na posição ${stage.order}! ✅`,
        data: stage,
      };
    },
  },

  // ─── Criar funil de vendas ────────────────────────────────────────────────
  {
    name: "criar_funil",
    label: "Criar Novo Funil de Vendas",
    description: "Cria um novo funil de vendas (pipeline de CRM) para a empresa.",
    minRole: "admin_company",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description:
            "Nome do funil de vendas (ex: 'Vendas Novos Clientes', 'Pós-Venda e Retenção', 'B2B').",
        },
      },
      required: ["nome"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const nome = params.nome?.trim();
      if (!nome) return { success: false, message: "O nome do funil é obrigatório." };

      const { data: created, error } = await supabaseAdmin
        .from("pipelines")
        .insert({
          company_id: context.companyId,
          name: nome,
        })
        .select("id, name, created_at")
        .single();

      if (error || !created) {
        return { success: false, message: `Erro ao criar funil de vendas: ${error?.message}` };
      }

      return {
        success: true,
        message: `Funil de vendas "${nome}" criado com sucesso! 📊`,
        data: created,
      };
    },
  },

  // ─── Listar passos e critérios da etapa ───────────────────────────────────
  {
    name: "listar_passos_etapa",
    label: "Listar Passos e Critérios da Etapa",
    description:
      "Lista os critérios, perguntas e passos de qualificação (checklist) configurados para uma etapa específica do funil de vendas (CRM).",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        etapa_id: {
          type: "string",
          description: "ID (UUID) da etapa do funil.",
        },
      },
      required: ["etapa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const stageId = params.etapa_id;

      const { data: items, error } = await supabaseAdmin
        .from("stage_checklist_items")
        .select(
          "id, stage_id, title, description, response_type, options, is_required, order_index",
        )
        .eq("stage_id", stageId)
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: true });

      if (error) {
        return { success: false, message: `Erro ao listar passos da etapa: ${error.message}` };
      }

      const { data: stage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, color, meta_event_name")
        .eq("id", stageId)
        .maybeSingle();

      return {
        success: true,
        message: `${items?.length || 0} passo(s) de qualificação configurado(s) para a etapa "${stage?.name || stageId}".`,
        data: {
          etapa: stage?.name || stageId,
          etapa_id: stageId,
          evento_meta: stage?.meta_event_name || null,
          total_passos: items?.length || 0,
          passos: (items || []).map((i: any) => ({
            id: i.id,
            titulo: i.title,
            descricao: i.description,
            tipo_resposta: i.response_type,
            obrigatorio: i.is_required,
            opcoes: i.options,
            ordem: i.order_index,
          })),
        },
      };
    },
  },

  // ─── Consultar qualificação da oportunidade ───────────────────────────────
  {
    name: "consultar_qualificacao_oportunidade",
    label: "Consultar Qualificação da Oportunidade",
    description:
      "Consulta o status de qualificação e preenchimento dos passos da etapa atual de uma oportunidade no CRM (perguntas respondidas, pendências obrigatórias e critérios de avanço).",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade.",
        },
      },
      required: ["oportunidade_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const oppId = params.oportunidade_id;

      const { data: opp, error: oppErr } = await supabaseAdmin
        .from("opportunities")
        .select(
          `
          id,
          title,
          value,
          status,
          stage_id,
          unit_id,
          contact_id,
          contacts!inner(id, name, phone, company_id),
          pipeline_stages(id, name, color, order, pipeline_id, meta_event_name)
        `,
        )
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || (opp.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Oportunidade não encontrada ou acesso negado." };
      }

      const currentStageId = opp.stage_id;
      if (!currentStageId) {
        return {
          success: true,
          message: "A oportunidade não está associada a nenhuma etapa de funil.",
          data: { oportunidade: opp.title, status: opp.status },
        };
      }

      const { data: items } = await supabaseAdmin
        .from("stage_checklist_items")
        .select("id, title, description, response_type, options, is_required, order_index")
        .eq("stage_id", currentStageId)
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: true });

      const { data: answers } = await supabaseAdmin
        .from("opportunity_stage_answers")
        .select("item_id, completed, value, answered_at")
        .eq("opportunity_id", oppId);

      const answerMap = new Map((answers || []).map((a) => [a.item_id, a]));

      const checklistStatus = (items || []).map((i: any) => {
        const ans = answerMap.get(i.id);
        return {
          item_id: i.id,
          titulo: i.title,
          descricao: i.description,
          tipo_resposta: i.response_type,
          obrigatorio: i.is_required,
          completado: ans ? ans.completed : false,
          resposta_registrada: ans?.value || null,
          data_resposta: ans?.answered_at || null,
          opcoes_disponiveis: i.options,
        };
      });

      const totalItems = checklistStatus.length;
      const totalRequired = checklistStatus.filter((c) => c.obrigatorio).length;
      const completedItems = checklistStatus.filter((c) => c.completado).length;
      const completedRequired = checklistStatus.filter((c) => c.obrigatorio && c.completado).length;
      const allRequiredMet =
        totalRequired === 0 ? completedItems === totalItems : completedRequired === totalRequired;

      return {
        success: true,
        message: `Qualificação de "${opp.title}": ${completedRequired}/${totalRequired} obrigatórios concluídos (${allRequiredMet ? "Apto a avançar! ✅" : "Pendências restantes ⚠️"}).`,
        data: {
          oportunidade: {
            id: opp.id,
            titulo: opp.title,
            valor: opp.value,
            status: opp.status,
            etapa_atual: (opp.pipeline_stages as any)?.name || "Sem nome",
            etapa_id: currentStageId,
            evento_meta: (opp.pipeline_stages as any)?.meta_event_name || null,
          },
          progresso_qualificacao: {
            total_passos: totalItems,
            passos_completados: completedItems,
            total_obrigatorios: totalRequired,
            obrigatorios_completados: completedRequired,
            todos_obrigatorios_atendidos: allRequiredMet,
          },
          passos: checklistStatus,
        },
      };
    },
  },

  // ─── Preencher critério de qualificação da oportunidade ───────────────────
  {
    name: "preencher_qualificacao_oportunidade",
    label: "Preencher Critério de Qualificação de Oportunidade",
    description:
      "Registra a resposta de um critério/passo da etapa da oportunidade. Valida regras eliminatórias (desqualificação) e avança automaticamente a oportunidade se todos os requisitos da etapa forem cumpridos.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade.",
        },
        item_id: {
          type: "string",
          description: "ID (UUID) do passo/critério de qualificação da etapa.",
        },
        completado: {
          type: "boolean",
          description: "Se o passo foi concluído/marcado. Padrão: true.",
          default: true,
        },
        resposta: {
          type: "string",
          description:
            "Opção selecionada ou resposta de texto (ex: 'Sim', 'Não', 'B2B', 'R$ 10.000').",
        },
        observacao: {
          type: "string",
          description: "Anotação explicativa ou justificativa complementar.",
        },
      },
      required: ["oportunidade_id", "item_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const oppId = params.oportunidade_id;
      const itemId = params.item_id;
      const completed = params.completado !== false;
      const selectedOption = params.resposta ? String(params.resposta).trim() : "";
      const obs = params.observacao ? String(params.observacao).trim() : "";

      let formattedValue = selectedOption;
      if (obs) {
        formattedValue = formattedValue ? `${formattedValue} — Obs: ${obs}` : obs;
      }

      // 1. Obter oportunidade e validar acesso
      const { data: opp, error: oppErr } = await supabaseAdmin
        .from("opportunities")
        .select(
          `
          id,
          title,
          value,
          status,
          stage_id,
          unit_id,
          contact_id,
          contacts!inner(company_id),
          pipeline_stages(id, name, order, pipeline_id, meta_event_name)
        `,
        )
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || (opp.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Oportunidade não encontrada ou acesso negado." };
      }

      // 2. Obter item do checklist
      const { data: item, error: itemErr } = await supabaseAdmin
        .from("stage_checklist_items")
        .select("*")
        .eq("id", itemId)
        .eq("company_id", context.companyId)
        .single();

      if (itemErr || !item) {
        return { success: false, message: "Critério de qualificação não encontrado." };
      }

      // 3. Salvar resposta (upsert)
      const { error: ansErr } = await supabaseAdmin.from("opportunity_stage_answers").upsert(
        {
          opportunity_id: oppId,
          item_id: itemId,
          completed,
          value: formattedValue || null,
          answered_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id,item_id" },
      );

      if (ansErr) {
        return { success: false, message: `Erro ao salvar resposta: ${ansErr.message}` };
      }

      // 4. Verificar se a pergunta possui regra de desqualificação ativa
      const disq = getQuestionDisqualification(item.options);
      if (completed && disq && disq.enabled) {
        const { selected } = parseAnswerValue(formattedValue);
        if (selected && selected.toLowerCase() === disq.trigger_value.toLowerCase()) {
          const reasonText = disq.reason || `Critério eliminatório na pergunta "${item.title}"`;

          if (disq.action === "mark_lost") {
            await supabaseAdmin.from("opportunities").update({ status: "lost" }).eq("id", oppId);

            await supabaseAdmin.from("opportunity_history").insert({
              opportunity_id: oppId,
              action_type: "status_change",
              description: `Oportunidade DESQUALIFICADA ❌ na pergunta "${item.title}" com resposta "${selected}". Motivo: ${reasonText}`,
            });

            return {
              success: true,
              message: `Oportunidade DESQUALIFICADA ❌: ${reasonText}`,
              data: {
                desqualificado: true,
                acao: "marcada_perdida",
                motivo: reasonText,
                item: item.title,
              },
            };
          } else if (disq.action === "move_to_stage" && disq.target_stage_id) {
            await supabaseAdmin
              .from("opportunities")
              .update({ stage_id: disq.target_stage_id })
              .eq("id", oppId);

            await supabaseAdmin.from("opportunity_history").insert({
              opportunity_id: oppId,
              action_type: "stage_change",
              description: `Oportunidade movida para descarte por desqualificação na pergunta "${item.title}".`,
            });

            return {
              success: true,
              message: `Oportunidade movida para etapa de descarte por desqualificação.`,
              data: {
                desqualificado: true,
                acao: "movida_etapa_descarte",
                etapa_destino_id: disq.target_stage_id,
                motivo: reasonText,
              },
            };
          }
        }
      }

      // 5. Verificar se todos os passos obrigatórios da etapa atual foram concluídos
      let avancouEtapa = false;
      let novaEtapaNome: string | null = null;

      if (completed && item.stage_id === opp.stage_id) {
        const { data: stageItems } = await supabaseAdmin
          .from("stage_checklist_items")
          .select("id, is_required")
          .eq("stage_id", opp.stage_id);

        const { data: allAnswers } = await supabaseAdmin
          .from("opportunity_stage_answers")
          .select("item_id, completed")
          .eq("opportunity_id", oppId);

        const currentAnswerMap = new Map((allAnswers || []).map((a) => [a.item_id, a.completed]));
        currentAnswerMap.set(itemId, completed);

        const requiredItems = (stageItems || []).filter((i) => i.is_required);
        const effectiveItems = requiredItems.length > 0 ? requiredItems : stageItems || [];

        const allDone = effectiveItems.every((i) => currentAnswerMap.get(i.id) === true);

        if (allDone && effectiveItems.length > 0) {
          const currentStage = opp.pipeline_stages as any;
          if (currentStage?.pipeline_id) {
            const { data: nextStages } = await supabaseAdmin
              .from("pipeline_stages")
              .select("id, name, meta_event_name")
              .eq("pipeline_id", currentStage.pipeline_id)
              .gt("order", currentStage.order || 0)
              .order("order", { ascending: true })
              .limit(1);

            if (nextStages && nextStages.length > 0) {
              const nextStage = nextStages[0];
              await supabaseAdmin
                .from("opportunities")
                .update({ stage_id: nextStage.id })
                .eq("id", oppId);

              await supabaseAdmin.from("opportunity_history").insert({
                opportunity_id: oppId,
                action_type: "stage_change",
                description: `Avanço automático para "${nextStage.name}" após cumprir todos os critérios de qualificação da etapa "${currentStage.name}".`,
              });

              avancouEtapa = true;
              novaEtapaNome = nextStage.name;

              if (nextStage.meta_event_name) {
                try {
                  await sendMetaCapiEvent({
                    companyId: context.companyId,
                    contactId: opp.contact_id,
                    opportunityId: opp.id,
                    eventName: nextStage.meta_event_name,
                    value: opp.value ? Number(opp.value) : undefined,
                    currency: "BRL",
                    actionSource: "chat",
                  });
                } catch (cErr) {
                  console.error("[CopilotCRM] Erro ao enviar CAPI no avanço automático:", cErr);
                }
              }
            }
          }
        }
      }

      return {
        success: true,
        message: avancouEtapa
          ? `Resposta salva para "${item.title}". 🎉 Todos os critérios foram cumpridos e a oportunidade avançou para "${novaEtapaNome}"!`
          : `Resposta registrada com sucesso para o critério "${item.title}". ✅`,
        data: {
          item_id: itemId,
          item_titulo: item.title,
          resposta: formattedValue,
          avancou_etapa: avancouEtapa,
          nova_etapa: novaEtapaNome,
        },
      };
    },
  },
  {
    name: "listar_etapas",
    label: "Listar Etapas do Funil",
    description:
      "Lista as etapas (colunas do Kanban) do funil de vendas ordenadas por posição, com eventos Meta CAPI mapeados.",
    minRole: "agent",
    requiredMenu: "crm",
    parameters: {
      type: "object",
      properties: {
        pipeline_id: {
          type: "string",
          description: "ID do funil (opcional). Se omitido, busca as etapas do funil principal.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = crmActions.find((a) => a.name === "listar_etapas_funil");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
];
