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
 * Ensures that an ad lead contact has their source recorded as "Tráfego Pago"
 * and is tagged with the "Tráfego Pago" label (created automatically if missing).
 */
export async function ensureAdLeadSourceAndLabel({
  companyId,
  contactId,
  adTitle,
  sourceId,
}: {
  companyId: string;
  contactId: string;
  adTitle?: string | null;
  sourceId?: string | null;
}) {
  try {
    // 1. Atualiza origem e detalhes do contato na tabela contacts
    const updatePayload: Record<string, any> = {
      source: "Tráfego Pago",
    };
    if (adTitle && adTitle.trim()) {
      updatePayload.source_details = adTitle.trim();
    } else if (sourceId && sourceId.trim()) {
      updatePayload.source_details = `Anúncio ID: ${sourceId.trim()}`;
    }

    const { error: contactErr } = await supabaseAdmin
      .from("contacts")
      .update(updatePayload)
      .eq("id", contactId);

    if (contactErr) {
      console.error(`[automation-engine] Erro ao atualizar origem do contato ${contactId}:`, contactErr);
    }

    // 2. Busca ou cria a etiqueta "Tráfego Pago" para a empresa
    let labelId: string | null = null;

    const { data: existingLabels } = await supabaseAdmin
      .from("labels")
      .select("id, name")
      .eq("company_id", companyId)
      .ilike("name", "Tráfego Pago")
      .limit(1);

    if (existingLabels && existingLabels.length > 0) {
      labelId = existingLabels[0].id;
    } else {
      // Cria a etiqueta "Tráfego Pago" automaticamente com badge roxo (#8b5cf6)
      const { data: newLabel, error: labelErr } = await supabaseAdmin
        .from("labels")
        .insert({
          company_id: companyId,
          name: "Tráfego Pago",
          color: "#8b5cf6",
          external_id: crypto.randomUUID(),
        })
        .select("id")
        .single();

      if (labelErr) {
        console.error(`[automation-engine] Erro ao criar etiqueta 'Tráfego Pago' para empresa ${companyId}:`, labelErr);
      } else if (newLabel) {
        labelId = newLabel.id;
      }
    }

    // 3. Vincula a etiqueta ao contato (idempotente)
    if (labelId) {
      const { error: linkErr } = await supabaseAdmin
        .from("contact_labels")
        .upsert(
          { contact_id: contactId, label_id: labelId },
          { onConflict: "contact_id, label_id" }
        );

      if (linkErr) {
        console.error(`[automation-engine] Erro ao vincular etiqueta 'Tráfego Pago' ao contato ${contactId}:`, linkErr);
      } else {
        console.log(`[automation-engine] Etiqueta 'Tráfego Pago' (${labelId}) vinculada com sucesso ao contato ${contactId}`);
      }
    }
  } catch (err) {
    console.error("[automation-engine] Falha inesperada em ensureAdLeadSourceAndLabel:", err);
  }
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

    // Se o evento for de lead vindo de anúncio (CTWA / Meta Ads),
    // garante automaticamente a origem 'Tráfego Pago' e a etiqueta correspondente
    if (event.triggerType === "ad_lead_first_message") {
      const adTitle =
        event.metadata?.ad?.title ||
        event.metadata?.ad?.body ||
        event.metadata?.referral?.headline ||
        event.metadata?.referral?.body ||
        null;
      const sourceId = event.metadata?.sourceId || null;

      await ensureAdLeadSourceAndLabel({
        companyId: event.companyId,
        contactId: event.contactId,
        adTitle,
        sourceId,
      });
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
        let labelId = action.params?.label_id;

        // Se a ação for para a etiqueta de origem de tráfego pago
        if (action.params?.use_source_label || labelId === "source_traffic_label" || labelId === "traffic_source") {
          const { data: existingLabels } = await supabaseAdmin
            .from("labels")
            .select("id")
            .eq("company_id", event.companyId)
            .ilike("name", "Tráfego Pago")
            .limit(1);

          if (existingLabels && existingLabels.length > 0) {
            labelId = existingLabels[0].id;
          } else {
            const { data: newLabel } = await supabaseAdmin
              .from("labels")
              .insert({
                company_id: event.companyId,
                name: "Tráfego Pago",
                color: "#8b5cf6",
                external_id: crypto.randomUUID(),
              })
              .select("id")
              .single();
            if (newLabel) labelId = newLabel.id;
          }
        }

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
        const stageId = action.params?.stage_id;
        const pipelineId = action.params?.pipeline_id;
        if (!stageId) {
          console.warn('[automation-engine] create_opportunity ignorado: stage_id não especificado.');
          break;
        }

        // 1. Prevenção de duplicidades (idempotência):
        // Se prevent_duplicates não for false, verifica se o contato já possui oportunidade aberta no funil/etapa
        const preventDuplicates = action.params?.prevent_duplicates !== false;
        if (preventDuplicates) {
          let existingQuery = supabaseAdmin
            .from('opportunities')
            .select('id, status, stage_id')
            .eq('contact_id', event.contactId)
            .eq('status', 'open');

          if (pipelineId) {
            const { data: pStages } = await supabaseAdmin
              .from('pipeline_stages')
              .select('id')
              .eq('pipeline_id', pipelineId);
            const pStageIds = (pStages || []).map((s: any) => s.id);
            if (pStageIds.length > 0) {
              existingQuery = existingQuery.in('stage_id', pStageIds);
            } else {
              existingQuery = existingQuery.eq('stage_id', stageId);
            }
          } else {
            existingQuery = existingQuery.eq('stage_id', stageId);
          }

          const { data: existingOpps } = await existingQuery.limit(1);
          if (existingOpps && existingOpps.length > 0) {
            console.log(`[automation-engine] Contato ${event.contactId} já possui oportunidade aberta (${existingOpps[0].id}) no funil. Ignorando criação duplicada.`);
            break;
          }
        }

        // 2. Busca informações do contato
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('id, name, phone, unit_id, company_id')
          .eq('id', event.contactId)
          .single();

        const contactName = contact?.name && contact.name !== 'Desconhecido' ? contact.name : (contact?.phone || 'Novo Lead');
        let title = action.params?.title_template || '{{contact_name}}';
        title = title
          .replace(/\{\{contact_name\}\}/gi, contactName)
          .replace(/\{\{phone\}\}/gi, contact?.phone || '');
        if (!title.trim()) {
          title = contactName;
        }

        const effectiveUnitId = event.unitId || contact?.unit_id || null;
        const effectiveCompanyId = event.companyId || contact?.company_id;
        const rawValue = action.params?.value ?? action.params?.default_value ?? 0;
        const oppValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(',', '.')) || 0;

        // 3. Cria a oportunidade
        const { data: newOpp, error: oppError } = await supabaseAdmin
          .from('opportunities')
          .insert({
            company_id: effectiveCompanyId,
            unit_id: effectiveUnitId,
            contact_id: event.contactId,
            stage_id: stageId,
            title: title,
            value: oppValue,
            status: 'open',
            owner_id: action.params?.owner_id || null,
            conversation_id: event.conversationId || null,
          })
          .select('id, title')
          .single();

        if (oppError) {
          console.error(`[automation-engine] Falha ao criar oportunidade para contato ${event.contactId}:`, oppError);
          break;
        }

        console.log(`[automation-engine] Oportunidade criada com sucesso: "${newOpp?.title}" (${newOpp?.id})`);

        // 4. Registra histórico da oportunidade
        if (newOpp?.id) {
          await supabaseAdmin
            .from('opportunity_history')
            .insert({
              opportunity_id: newOpp.id,
              action_type: 'created',
              description: `Oportunidade criada automaticamente via Automação de Atendimento`
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
