/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMetaCapiEvent } from "@/lib/server/meta-capi";
import { getQuestionDisqualification, parseAnswerValue } from "@/types/crm-qualification";
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
    description:
      "Lista as etapas (colunas do Kanban) do funil de vendas ordenadas por posição, com eventos Meta CAPI mapeados.",
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
        .select("id, name, color, order, pipeline_id, unit_id, meta_event_name, units(name)")
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
        etapas: (stages || []).map((s: any) => ({
          ...s,
          evento_meta_capi: s.meta_event_name || null,
        })),
      };
    },
  },
  {
    name: "listar_oportunidades",
    description:
      "Lista negócios e oportunidades em andamento no CRM, com filtros por status, etapa e unidade.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Status da oportunidade: 'all', 'open' (em aberto), 'won' (ganha), 'lost' (perdida). Padrão: 'open'.",
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
        .select(
          `
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
        `,
        )
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
    description:
      "Cria uma nova oportunidade de venda no funil do CRM vinculada a um contato e a uma unidade.",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato/lead.",
        },
        titulo: {
          type: "string",
          description:
            "Título da oportunidade (ex: 'Procedimento X - Avaliação', 'Venda Pacote Premium').",
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
          description:
            "ID da unidade responsável pela oportunidade (opcional para chave restrita).",
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
        .select(
          "id, title, value, stage_id, unit_id, contact_id, contacts!inner(company_id), pipeline_stages(name)",
        )
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || (opp.contacts as any)?.company_id !== context.companyId) {
        throw new Error("Oportunidade não encontrada ou acesso negado.");
      }

      if (context.unitId && opp.unit_id && opp.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a oportunidade pertence a outra filial.");
      }

      // Buscar dados da nova etapa
      const { data: newStage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, meta_event_name")
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
        description:
          `Movida de "${opp.pipeline_stages?.name || "Início"}" para "${newStage?.name || "Nova Etapa"}". ${args.motivo ? `Motivo: ${args.motivo}` : ""}`.trim(),
      });

      // Disparar evento Meta CAPI se a etapa tiver mapeamento de evento (ex: Schedule, Contact)
      let eventoMetaEnviado: string | null = null;
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
          if (capiRes.success) {
            eventoMetaEnviado = newStage.meta_event_name;
          }
        } catch (capiErr) {
          console.error(
            "[pipelineTools] Falha ao enviar evento Meta CAPI na movimentação:",
            capiErr,
          );
        }
      }

      return {
        sucesso: true,
        mensagem: `Oportunidade movida para a etapa "${newStage?.name || "Nova Etapa"}".`,
        evento_meta_capi_enviado: eventoMetaEnviado,
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
        .select("id, value, contact_id, unit_id, contacts!inner(company_id)")
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || (opp.contacts as any)?.company_id !== context.companyId) {
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
          description: `Status alterado para "${args.status === "won" ? "Ganha (Venda Fechada)" : args.status === "lost" ? "Perdida" : "Em Aberto"}"`,
        });

        // Se marcada como ganha ('won'), dispara evento Purchase na Meta Conversions API
        if (args.status === "won") {
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
            console.error("[pipelineTools] Falha ao enviar evento Purchase Meta CAPI:", capiErr);
          }
        }
      }

      return {
        sucesso: true,
        oportunidade: updated,
      };
    },
  },
  {
    name: "listar_passos_etapa",
    description:
      "Lista os critérios, perguntas e passos de qualificação (checklist) configurados para uma etapa específica do funil de vendas (CRM).",
    inputSchema: {
      type: "object",
      properties: {
        etapa_id: {
          type: "string",
          description: "ID (UUID) da etapa do funil.",
        },
      },
      required: ["etapa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const stageId = args.etapa_id;

      const { data: items, error } = await supabaseAdmin
        .from("stage_checklist_items")
        .select(
          "id, stage_id, title, description, response_type, options, is_required, order_index",
        )
        .eq("stage_id", stageId)
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: true });

      if (error) {
        throw new Error(`Erro ao listar passos da etapa: ${error.message}`);
      }

      const { data: stage } = await supabaseAdmin
        .from("pipeline_stages")
        .select("id, name, color, meta_event_name")
        .eq("id", stageId)
        .maybeSingle();

      return {
        etapa: stage?.name || stageId,
        etapa_id: stageId,
        evento_meta: stage?.meta_event_name || null,
        total_passos: items?.length || 0,
        passos: (items || []).map((i: any) => ({
          id: i.id,
          titulo: i.title,
          descricao: i.description,
          tipo_resposta: i.response_type, // 'checkbox' | 'select' | 'text'
          obrigatorio: i.is_required,
          opcoes: i.options,
          ordem: i.order_index,
        })),
      };
    },
  },
  {
    name: "consultar_qualificacao_oportunidade",
    description:
      "Consulta o status de qualificação e preenchimento dos passos da etapa atual de uma oportunidade no CRM (perguntas respondidas, pendências obrigatórias e critérios de avanço).",
    inputSchema: {
      type: "object",
      properties: {
        oportunidade_id: {
          type: "string",
          description: "ID (UUID) da oportunidade.",
        },
      },
      required: ["oportunidade_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const oppId = args.oportunidade_id;

      // 1. Obter oportunidade
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
          contacts!inner(id, name, phone, company_id),
          pipeline_stages(id, name, color, order, pipeline_id, meta_event_name)
        `,
        )
        .eq("id", oppId)
        .single();

      if (oppErr || !opp || (opp.contacts as any)?.company_id !== context.companyId) {
        throw new Error("Oportunidade não encontrada.");
      }

      if (context.unitId && opp.unit_id && opp.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a oportunidade pertence a outra filial.");
      }

      const currentStageId = opp.stage_id;
      if (!currentStageId) {
        return {
          oportunidade: opp.title,
          status: opp.status,
          mensagem: "A oportunidade não está associada a nenhuma etapa de funil.",
        };
      }

      // 2. Buscar passos da etapa atual
      const { data: items } = await supabaseAdmin
        .from("stage_checklist_items")
        .select("id, title, description, response_type, options, is_required, order_index")
        .eq("stage_id", currentStageId)
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: true });

      // 3. Buscar respostas já cadastradas para esta oportunidade
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
      };
    },
  },
  {
    name: "preencher_qualificacao_oportunidade",
    description:
      "Registra a resposta de um critério/passo da etapa da oportunidade. Valida regras eliminatórias (desqualificação) e avança automaticamente a oportunidade se todos os requisitos da etapa forem cumpridos.",
    inputSchema: {
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
    handler: async (args: any, context: McpContext) => {
      const oppId = args.oportunidade_id;
      const itemId = args.item_id;
      const completed = args.completado !== false;
      const selectedOption = args.resposta ? String(args.resposta).trim() : "";
      const obs = args.observacao ? String(args.observacao).trim() : "";

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
        throw new Error("Oportunidade não encontrada.");
      }

      if (context.unitId && opp.unit_id && opp.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a oportunidade pertence a outra filial.");
      }

      // 2. Obter item do checklist
      const { data: item, error: itemErr } = await supabaseAdmin
        .from("stage_checklist_items")
        .select("*")
        .eq("id", itemId)
        .eq("company_id", context.companyId)
        .single();

      if (itemErr || !item) {
        throw new Error("Critério de qualificação não encontrado.");
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
        throw new Error(`Erro ao salvar resposta: ${ansErr.message}`);
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
              sucesso: true,
              desqualificado: true,
              acao: "marcada_perdida",
              motivo: reasonText,
              item: item.title,
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
              sucesso: true,
              desqualificado: true,
              acao: "movida_etapa_descarte",
              etapa_destino_id: disq.target_stage_id,
              motivo: reasonText,
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
          // Busca a próxima etapa do funil em ordem
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

              // Dispara evento Meta CAPI se configurado na nova etapa
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
                  console.error("[pipelineTools] Erro ao enviar CAPI no avanço automático:", cErr);
                }
              }
            }
          }
        }
      }

      return {
        sucesso: true,
        mensagem: "Resposta de qualificação registrada com sucesso!",
        item_id: itemId,
        completado,
        valor_salvo: formattedValue || null,
        avanco_automatico_etapa: avancouEtapa,
        nova_etapa: novaEtapaNome,
      };
    },
  },
];
