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

      default:
        console.warn(`[automation-engine] Tipo de ação desconhecido: ${action.type}`);
    }
  } catch (err) {
    console.error(`[automation-engine] Erro ao executar ação ${action?.type}:`, err);
  }
}
