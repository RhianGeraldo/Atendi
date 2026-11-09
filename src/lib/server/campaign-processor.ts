/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderCampaignMessage } from "../campaign-template";
import { getPhoneVariants } from "../utils";
import { sendPlatformMessage } from "./message-sender";

const TIME_ZONE = "America/Sao_Paulo";

/**
 * Retorna as informações de data, dia da semana e hora no Horário de Brasília
 */
function getSaoPauloDateInfo() {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const dayOfWeekMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayStr = dayFormatter.format(now);
  const timeStr = timeFormatter.format(now); // "09:30"
  const dayNumber = dayOfWeekMap[dayStr] ?? 1;

  return { dayNumber, timeStr };
}

/**
 * Valida se o momento atual está dentro da janela de envio permitida
 */
function isWithinAllowedSchedule(settings: any): boolean {
  if (!settings) return true;

  const { dayNumber, timeStr } = getSaoPauloDateInfo();

  // Dias permitidos (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  if (Array.isArray(settings.allowed_days) && settings.allowed_days.length > 0) {
    if (!settings.allowed_days.includes(dayNumber)) {
      return false;
    }
  }

  // Horários permitidos (ex: "08:00" até "20:00")
  const start = settings.allowed_start_time || "08:00";
  const end = settings.allowed_end_time || "20:00";

  if (timeStr < start || timeStr > end) {
    return false;
  }

  return true;
}

/**
 * Garante ou localiza o contato e a conversa vinculada à instância
 * Inicializa a conversa como 'resolved' para não poluir a fila dos atendentes
 */
async function ensureCampaignConversation({
  companyId,
  unitId,
  instanceId,
  phone,
  name,
}: {
  companyId: string;
  unitId: string | null;
  instanceId: string;
  phone: string;
  name: string | null;
}) {
  let cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone.startsWith("55") && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
    cleanPhone = `55${cleanPhone}`;
  }

  // 1. Localiza ou cria o contato
  const phoneVariants = getPhoneVariants(cleanPhone);
  const { data: existingContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, merged_into_id")
    .eq("company_id", companyId)
    .in("phone", phoneVariants);

  let contactId: string;
  if (existingContacts && existingContacts.length > 0) {
    contactId = existingContacts[0].merged_into_id || existingContacts[0].id;
  } else {
    const { data: newContact, error: createContactErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        company_id: companyId,
        unit_id: unitId,
        name: name?.trim() || cleanPhone,
        phone: cleanPhone,
        tags: ["campanha"],
      })
      .select("id")
      .single();

    if (createContactErr) {
      // Se falhou por unicidade concorrente, reconsulta
      const { data: retryContacts } = await supabaseAdmin
        .from("contacts")
        .select("id, merged_into_id")
        .eq("company_id", companyId)
        .in("phone", phoneVariants);

      if (retryContacts && retryContacts.length > 0) {
        contactId = retryContacts[0].merged_into_id || retryContacts[0].id;
      } else {
        throw new Error(`Falha ao criar contato para campanha: ${createContactErr?.message}`);
      }
    } else if (!newContact) {
      throw new Error("Falha ao criar contato para campanha.");
    } else {
      contactId = newContact.id;
    }
  }

  // 2. Localiza conversa existente nesta instância
  const { data: existingConv } = await supabaseAdmin
    .from("conversations")
    .select("id, status")
    .eq("contact_id", contactId)
    .eq("whatsapp_instance_id", instanceId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    return { conversationId: existingConv.id, contactId };
  }

  // 3. Cria conversa mantendo status 'resolved'
  const now = new Date().toISOString();
  const { data: newConv, error: createConvErr } = await supabaseAdmin
    .from("conversations")
    .insert({
      unit_id: unitId,
      contact_id: contactId,
      channel: "whatsapp",
      status: "resolved",
      resolved_at: now,
      whatsapp_instance_id: instanceId,
      last_message_at: now,
    } as any)
    .select("id")
    .single();

  if (createConvErr || !newConv) {
    throw new Error(`Falha ao criar conversa para campanha: ${createConvErr?.message}`);
  }

  return { conversationId: newConv.id, contactId };
}

let isCampaignProcessorRunning = false;

/**
 * Processador principal da fila de campanhas em massa.
 * Chamado ciclicamente pelo cron do Atendi (`cron.ts`).
 */
export async function processCampaignsQueue(): Promise<void> {
  if (isCampaignProcessorRunning) {
    return;
  }
  isCampaignProcessorRunning = true;

  try {
    const nowIso = new Date().toISOString();

    // 0. Auto-recupera destinatários travados em 'processing' há mais de 10 minutos (ex: reinício de servidor)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ status: "pending", updated_at: nowIso })
      .eq("status", "processing")
      .lt("updated_at", tenMinAgo);

    // 1. Ativa campanhas agendadas que chegaram na data/hora
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "running",
        started_at: nowIso,
        updated_at: nowIso,
      })
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso);

    // 2. Busca campanhas ativas em execução
    const { data: activeCampaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, company_id, unit_id, name, content, message_type, media_url, whatsapp_instance_ids, settings, stats")
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(5);

    if (campErr || !activeCampaigns || activeCampaigns.length === 0) {
      return;
    }

    for (const campaign of activeCampaigns) {
      try {
        const settings = campaign.settings || {};

        // Valida se está no horário/dias permitidos
        if (!isWithinAllowedSchedule(settings)) {
          console.log(`[campaigns] Campanha "${campaign.name}" (${campaign.id}) aguardando janela de horário comercial.`);
          continue;
        }

        // Valida instâncias disponíveis
        const instanceIds: string[] = campaign.whatsapp_instance_ids || [];
        if (instanceIds.length === 0) {
          console.error(`[campaigns] Campanha ${campaign.id} não possui instâncias de WhatsApp configuradas.`);
          await supabaseAdmin
            .from("campaigns")
            .update({ status: "failed", updated_at: nowIso })
            .eq("id", campaign.id);
          continue;
        }

        // Busca dados das instâncias no banco
        const { data: instances } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, name, instance_name, status, unit_id")
          .in("id", instanceIds);

        const connectedInstances = (instances || []).filter(
          (inst) => inst.status === "connected" || inst.status === "open"
        );

        if (connectedInstances.length === 0) {
          console.warn(`[campaigns] Nenhuma das instâncias da campanha ${campaign.id} está conectada no momento.`);
          continue;
        }

        // Busca lote de destinatários pendentes
        const batchSize = Math.min(Math.max(Number(settings.batch_size) || 15, 1), 50);

        const { data: pendingRecipients, error: recipErr } = await supabaseAdmin
          .from("campaign_recipients")
          .select("id, phone, name, custom_variables, contact_id")
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(batchSize);

        if (recipErr) {
          console.error(`[campaigns] Erro ao buscar destinatários da campanha ${campaign.id}:`, recipErr);
          continue;
        }

        if (!pendingRecipients || pendingRecipients.length === 0) {
          // Não há mais destinatários pendentes: recalcula e finaliza campanha
          await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: campaign.id });
          continue;
        }

        // Busca dados da empresa e unidade para variáveis
        const [{ data: companyData }, { data: unitData }] = await Promise.all([
          supabaseAdmin.from("companies").select("name").eq("id", campaign.company_id).maybeSingle(),
          campaign.unit_id
            ? supabaseAdmin.from("units").select("name").eq("id", campaign.unit_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const companyName = companyData?.name || "Empresa";
        const unitName = unitData?.name || "Unidade";

        // Processa cada destinatário do lote com rotação de instâncias (Round-Robin)
        for (let i = 0; i < pendingRecipients.length; i++) {
          const recipient = pendingRecipients[i];
          const instance = connectedInstances[i % connectedInstances.length];

          try {
            // Marca como em processamento
            await supabaseAdmin
              .from("campaign_recipients")
              .update({ status: "processing", updated_at: new Date().toISOString() })
              .eq("id", recipient.id);

            // Gera texto da mensagem com Spintax e Variáveis dinâmicas
            const renderedText = renderCampaignMessage(
              campaign.content,
              {
                clientName: recipient.name,
                phone: recipient.phone,
                companyName,
                unitName,
                customVariables: recipient.custom_variables as Record<string, unknown>,
              },
              true // Habilita Spintax
            );

            // Garante conversa silenciosa no Atendi
            const { conversationId, contactId } = await ensureCampaignConversation({
              companyId: campaign.company_id,
              unitId: instance.unit_id || campaign.unit_id || null,
              instanceId: instance.id,
              phone: recipient.phone,
              name: recipient.name,
            });

            // Dispara a mensagem através do motor unificado do Atendi
            const isMedia = campaign.message_type && campaign.message_type !== "text";
            const sentMsg = await sendPlatformMessage({
              conversationId,
              text: renderedText,
              mediaType: isMedia ? campaign.message_type : "text",
              mediaBase64: isMedia ? campaign.media_url || undefined : undefined,
              senderType: "agent",
              keepStatus: true, // Mantém conversa em 'resolved' para não poluir atendimento
              metadata: {
                campaign_id: campaign.id,
                recipient_id: recipient.id,
                is_campaign: true,
              },
            });

            // Registra sucesso do envio
            await supabaseAdmin
              .from("campaign_recipients")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                rendered_content: renderedText,
                whatsapp_instance_id: instance.id,
                conversation_id: conversationId,
                contact_id: contactId,
                message_id: (sentMsg as any)?.id || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", recipient.id);

            // Delay suave entre envios dentro do lote (simulação humana)
            const minDelay = Math.max(Number(settings.min_delay_seconds) || 1, 1);
            const maxDelay = Math.max(Number(settings.max_delay_seconds) || 3, minDelay);
            const jitterMs = Math.floor((Math.random() * (maxDelay - minDelay) + minDelay) * 1000);

            // Limita o delay síncrono para no máximo 3.5 segundos por iteração dentro do cron
            const stepDelayMs = Math.min(jitterMs, 3500);
            await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
          } catch (recipErr: any) {
            console.error(`[campaigns] Erro no envio para destinatário ${recipient.id}:`, recipErr);
            await supabaseAdmin
              .from("campaign_recipients")
              .update({
                status: "failed",
                error_message: recipErr?.message || "Erro desconhecido durante envio",
                updated_at: new Date().toISOString(),
              })
              .eq("id", recipient.id);
          }
        }

        // Recalcula métricas da campanha após finalizar o lote
        await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: campaign.id });
      } catch (campLoopErr) {
        console.error(`[campaigns] Erro ao processar campanha ${campaign.id}:`, campLoopErr);
      }
    }
  } catch (err) {
    console.error("[campaigns] Erro no loop de campanhas:", err);
  } finally {
    isCampaignProcessorRunning = false;
  }
}

/**
 * Marca que o contato respondeu a uma campanha recente quando uma mensagem do cliente chega
 */
export async function markCampaignRecipientReplied(conversationId: string): Promise<void> {
  try {
    if (!conversationId) return;

    // Busca o destinatário mais recente desta conversa que ainda não foi marcado como respondido
    const { data: recipient } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, replied_at, status")
      .eq("conversation_id", conversationId)
      .in("status", ["sent", "delivered", "read"])
      .is("replied_at", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recipient) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "replied",
          replied_at: now,
          updated_at: now,
        })
        .eq("id", recipient.id);

      // Recalcula estatísticas da campanha
      await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: recipient.campaign_id });
      console.log(`[campaigns] Destinatário ${recipient.id} marcado como 'replied' na campanha ${recipient.campaign_id}`);
    }
  } catch (e) {
    console.error("[campaigns] Erro ao marcar resposta do destinatário da campanha:", e);
  }
}
