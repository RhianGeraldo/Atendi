import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AutomationTriggerEvent {
  companyId: string;
  unitId?: string | null;
  contactId: string;
  conversationId?: string | null;
  triggerType: 'ad_lead_first_message' | 'contact_created' | 'message_received';
  metadata?: Record<string, any>;
}

/**
 * Dispatches an event to the automation engine.
 * Decoupled from webhooks and specific integrations.
 */
export async function dispatchAutomationEvent(event: AutomationTriggerEvent) {
  try {
    if (!event.companyId || !event.contactId || !event.triggerType) {
      return;
    }

    // 1. Busca automações ativas para a empresa e tipo de gatilho
    const { data: automations, error } = await supabaseAdmin
      .from('automations')
      .select('*')
      .eq('company_id', event.companyId)
      .eq('trigger_type', event.triggerType)
      .eq('is_active', true);

    if (error) {
      console.error('[automation-engine] Erro ao buscar automações:', error);
      return;
    }

    if (!automations || automations.length === 0) {
      return;
    }

    console.log(`[automation-engine] Disparando ${automations.length} automações para o evento ${event.triggerType} (contato ${event.contactId})`);

    // 2. Executa cada automação encontrada
    for (const auto of automations) {
      const actions = Array.isArray(auto.actions) ? auto.actions : [];
      for (const action of actions) {
        await executeAction(action, event);
      }
    }
  } catch (err) {
    console.error('[automation-engine] Erro inesperado ao processar automações:', err);
  }
}

async function executeAction(action: any, event: AutomationTriggerEvent) {
  try {
    switch (action.type) {
      case 'add_label': {
        const labelId = action.params?.label_id;
        if (!labelId) break;

        // Vincula a etiqueta ao contato (idempotente)
        const { error } = await supabaseAdmin
          .from('contact_labels')
          .upsert(
            { contact_id: event.contactId, label_id: labelId },
            { onConflict: 'contact_id, label_id' }
          );

        if (error) {
          console.error(`[automation-engine] Falha ao adicionar etiqueta ${labelId} ao contato ${event.contactId}:`, error);
        } else {
          console.log(`[automation-engine] Etiqueta ${labelId} adicionada com sucesso ao contato ${event.contactId}`);
        }
        break;
      }

      case 'remove_label': {
        const labelId = action.params?.label_id;
        if (!labelId) break;

        await supabaseAdmin
          .from('contact_labels')
          .delete()
          .eq('contact_id', event.contactId)
          .eq('label_id', labelId);
        break;
      }

      case 'create_opportunity': {
        const pipelineId = action.params?.pipeline_id;
        let stageId = action.params?.stage_id;
        const customTitle = action.params?.title;
        const oppValue = Number(action.params?.value) || 0;

        // Se stageId não foi passado diretamente mas temos pipelineId, busca a primeira etapa do funil
        if (!stageId && pipelineId) {
          const { data: firstStage } = await supabaseAdmin
            .from('pipeline_stages')
            .select('id, unit_id')
            .eq('pipeline_id', pipelineId)
            .order('order', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (firstStage) {
            stageId = firstStage.id;
          }
        }

        if (!stageId) {
          console.warn('[automation-engine] create_opportunity ignorado: etapa (stage_id) não encontrada ou não informada');
          break;
        }

        // Verifica se o contato já possui uma oportunidade aberta nesta etapa para evitar duplicações acidentais
        const { data: existingOpps } = await supabaseAdmin
          .from('opportunities')
          .select('id')
          .eq('contact_id', event.contactId)
          .eq('stage_id', stageId)
          .eq('status', 'open')
          .limit(1);

        if (existingOpps && existingOpps.length > 0) {
          console.log(`[automation-engine] Contato ${event.contactId} já possui oportunidade em aberto na etapa ${stageId}. Evitando duplicação.`);
          break;
        }

        // Busca dados do contato para formatar título e unidade
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('name, phone, unit_id')
          .eq('id', event.contactId)
          .single();

        let title = customTitle || '{{nome}}';
        title = title
          .replace(/\{\{nome\}\}/gi, contact?.name || 'Novo Lead')
          .replace(/\{\{telefone\}\}/gi, contact?.phone || '');
        if (!title.trim()) title = contact?.name || 'Novo Lead';

        // Determina a unidade apropriada
        let effectiveUnitId = event.unitId || contact?.unit_id || null;
        if (!effectiveUnitId) {
          const { data: stageData } = await supabaseAdmin
            .from('pipeline_stages')
            .select('unit_id')
            .eq('id', stageId)
            .maybeSingle();
          if (stageData?.unit_id) {
            effectiveUnitId = stageData.unit_id;
          }
        }

        const { data: newOpp, error: oppErr } = await supabaseAdmin
          .from('opportunities')
          .insert({
            title: title.trim(),
            value: oppValue,
            contact_id: event.contactId,
            stage_id: stageId,
            unit_id: effectiveUnitId,
            conversation_id: event.conversationId || null,
            status: 'open',
          })
          .select()
          .single();

        if (oppErr) {
          console.error('[automation-engine] Falha ao criar oportunidade via automação:', oppErr);
        } else {
          console.log(`[automation-engine] Oportunidade "${newOpp.title}" criada com sucesso para contato ${event.contactId}`);

          // Registra no histórico da oportunidade
          await supabaseAdmin
            .from('opportunity_history')
            .insert({
              opportunity_id: newOpp.id,
              action_type: 'creation',
              description: 'Oportunidade criada automaticamente pelo motor de automações.',
            });
        }
        break;
      }

      default:
        console.warn(`[automation-engine] Tipo de ação desconhecido: ${action.type}`);
    }
  } catch (err) {
    console.error(`[automation-engine] Erro ao executar ação ${action?.type}:`, err);
  }
}

