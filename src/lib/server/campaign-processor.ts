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
    .select("id, merged_into_id, unit_id")
    .eq("company_id", companyId)
    .in("phone", phoneVariants);

  let contactId: string;
  if (existingContacts && existingContacts.length > 0) {
    contactId = existingContacts[0].merged_into_id || existingContacts[0].id;
    if (!existingContacts[0].unit_id && unitId) {
      await supabaseAdmin.from("contacts").update({ unit_id: unitId }).eq("id", contactId);
    }
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
 * Delay interruptível no padrão Avisei: dorme em fatias curtas (500ms)
 * e verifica se a campanha foi pausada, cancelada ou excluída.
 * Retorna false se o envio deve ser interrompido imediatamente.
 */
async function interruptibleDelay(delayMs: number, campaignId: string): Promise<boolean> {
  const sliceMs = 500;
  const slices = Math.max(1, Math.ceil(delayMs / sliceMs));

  for (let s = 0; s < slices; s++) {
    const currentWait = Math.min(sliceMs, delayMs - s * sliceMs);
    if (currentWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, currentWait));
    }

    const { data: campCheck } = await supabaseAdmin
      .from("campaigns")
      .select("status")
      .eq("id", campaignId)
      .maybeSingle();

    if (!campCheck || campCheck.status !== "running") {
      console.log(
        `[campaigns] Campanha ${campaignId} interrompida durante o delay (status atual: ${campCheck?.status ?? "excluída"}).`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Processador principal da fila de campanhas em massa.
 * Chamado ciclicamente pelo cron do Atendi (`cron.ts`) e por gatilhos de ação.
 */
export async function processCampaignsQueue(): Promise<void> {
  if (isCampaignProcessorRunning) {
    return;
  }
  isCampaignProcessorRunning = true;
  let hasMorePending = false;

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
      .select(
        "id, company_id, unit_id, name, content, message_type, media_url, whatsapp_instance_ids, settings, stats",
      )
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
          console.log(
            `[campaigns] Campanha "${campaign.name}" (${campaign.id}) aguardando janela de horário comercial.`,
          );
          continue;
        }

        // Valida instâncias disponíveis
        const instanceIds: string[] = campaign.whatsapp_instance_ids || [];
        if (instanceIds.length === 0) {
          console.error(
            `[campaigns] Campanha ${campaign.id} não possui instâncias de WhatsApp configuradas.`,
          );
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
          (inst) => inst.status === "connected" || inst.status === "open",
        );

        if (connectedInstances.length === 0) {
          console.warn(
            `[campaigns] Nenhuma das instâncias da campanha ${campaign.id} está conectada no momento.`,
          );
          continue;
        }

        // Busca lote de destinatários pendentes
        const batchSize = Math.min(Math.max(Number(settings.batch_size) || 15, 1), 50);

        // Busca variações cadastradas da campanha
        const { data: campaignVariations } = await (supabaseAdmin.from("campaign_messages") as any)
          .select("id, name, message_type, content, media_url, media_name, is_active")
          .eq("campaign_id", campaign.id)
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        const activeVariations = campaignVariations || [];

        const { data: pendingRecipients, error: recipErr } = await (
          supabaseAdmin.from("campaign_recipients") as any
        )
          .select("id, phone, name, custom_variables, contact_id, campaign_message_id, unit_id")
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(batchSize);

        if (recipErr) {
          console.error(
            `[campaigns] Erro ao buscar destinatários da campanha ${campaign.id}:`,
            recipErr,
          );
          continue;
        }

        if (!pendingRecipients || pendingRecipients.length === 0) {
          // Não há mais destinatários pendentes: recalcula e finaliza campanha
          await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: campaign.id });
          continue;
        }

        // Busca dados da empresa e de todas as unidades para interpolação dinâmica
        const [{ data: companyData }, { data: companyUnits }] = await Promise.all([
          supabaseAdmin
            .from("companies")
            .select("name")
            .eq("id", campaign.company_id)
            .maybeSingle(),
          supabaseAdmin.from("units").select("id, name").eq("company_id", campaign.company_id),
        ]);

        const companyName = companyData?.name || "Empresa";
        const unitsMap = new Map((companyUnits || []).map((u: any) => [u.id, u.name]));

        // Processa cada destinatário do lote com rotação de instâncias (Round-Robin) e variações
        for (let i = 0; i < pendingRecipients.length; i++) {
          // Checagem no padrão Avisei: se a campanha foi pausada ou cancelada, interrompe imediatamente
          const { data: currentCamp } = await supabaseAdmin
            .from("campaigns")
            .select("status")
            .eq("id", campaign.id)
            .maybeSingle();

          if (!currentCamp || currentCamp.status !== "running") {
            console.log(
              `[campaigns] Campanha ${campaign.id} não está mais 'running' (${currentCamp?.status ?? "excluída"}). Interrompendo envio do lote imediatamente.`,
            );
            // Reverte quaisquer destinatários em 'processing' para 'pending'
            await supabaseAdmin
              .from("campaign_recipients")
              .update({ status: "pending", updated_at: new Date().toISOString() })
              .eq("campaign_id", campaign.id)
              .eq("status", "processing");
            break;
          }

          const recipient = pendingRecipients[i];
          const instance = connectedInstances[i % connectedInstances.length];

          try {
            // Marca como em processamento
            await supabaseAdmin
              .from("campaign_recipients")
              .update({ status: "processing", updated_at: new Date().toISOString() })
              .eq("id", recipient.id);

            // Determina a variação de mensagem a ser enviada
            let chosenVariation = activeVariations.find(
              (v: any) => v.id === recipient.campaign_message_id,
            );
            if (!chosenVariation && activeVariations.length > 0) {
              chosenVariation = activeVariations[i % activeVariations.length];
            }

            const messageText = chosenVariation ? chosenVariation.content : campaign.content;
            const messageType = chosenVariation
              ? chosenVariation.message_type
              : campaign.message_type || "text";
            const mediaUrl = chosenVariation ? chosenVariation.media_url : campaign.media_url;
            const variationId = chosenVariation?.id || recipient.campaign_message_id || null;

            // Determina a unidade deste destinatário específico
            const targetUnitId = recipient.unit_id || campaign.unit_id || instance.unit_id || null;
            const unitName = targetUnitId ? unitsMap.get(targetUnitId) || "Unidade" : "Unidade";

            // Gera texto da mensagem com Spintax e Variáveis dinâmicas da unidade real
            const renderedText = renderCampaignMessage(
              messageText,
              {
                clientName: recipient.name,
                phone: recipient.phone,
                companyName,
                unitName,
                customVariables: recipient.custom_variables as Record<string, unknown>,
              },
              true, // Habilita Spintax
            );

            // Garante conversa silenciosa no Atendi na unidade correta
            const { conversationId, contactId } = await ensureCampaignConversation({
              companyId: campaign.company_id,
              unitId: targetUnitId,
              instanceId: instance.id,
              phone: recipient.phone,
              name: recipient.name,
            });

            // Dispara a mensagem através do motor unificado do Atendi
            const isMedia = messageType && messageType !== "text";
            const sentMsg = await sendPlatformMessage({
              conversationId,
              text: renderedText,
              mediaType: isMedia ? messageType : "text",
              mediaBase64: isMedia ? mediaUrl || undefined : undefined,
              senderType: "agent",
              keepStatus: true, // Mantém conversa em 'resolved' para não poluir atendimento
              metadata: {
                campaign_id: campaign.id,
                recipient_id: recipient.id,
                variation_id: variationId,
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
                campaign_message_id: variationId,
                message_id: (sentMsg as any)?.id || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", recipient.id);

            // Delay suave entre envios dentro do lote (simulação humana e respeito ao anti-ban)
            const minDelay = Math.max(Number(settings.min_delay_seconds) || 1, 1);
            const maxDelay = Math.max(Number(settings.max_delay_seconds) || 3, minDelay);
            const jitterMs = Math.floor((Math.random() * (maxDelay - minDelay) + minDelay) * 1000);
            const stepDelayMs = Math.min(jitterMs, 5000);

            // Sleep interruptível: verifica se a campanha foi pausada durante a espera
            const canContinue = await interruptibleDelay(stepDelayMs, campaign.id);
            if (!canContinue) {
              console.log(
                `[campaigns] Campanha ${campaign.id} pausada durante o intervalo. Encerrando lote.`,
              );
              break;
            }
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

    // Verifica se ainda existem destinatários pendentes em campanhas em execução
    for (const campaign of activeCampaigns) {
      const { data: checkCamp } = await supabaseAdmin
        .from("campaigns")
        .select("status")
        .eq("id", campaign.id)
        .maybeSingle();

      if (checkCamp?.status === "running") {
        const { count: remCount } = await supabaseAdmin
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");

        if (remCount && remCount > 0) {
          hasMorePending = true;
          break;
        }
      }
    }
  } catch (err) {
    console.error("[campaigns] Erro no loop de campanhas:", err);
  } finally {
    isCampaignProcessorRunning = false;

    // Se houver mais contatos para disparar em campanhas ativas, agenda o próximo lote
    if (hasMorePending) {
      setTimeout(() => {
        processCampaignsQueue().catch((e) =>
          console.error("[campaigns] Erro no ciclo contínuo da fila:", e),
        );
      }, 1000);
    }
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
      .select("id, campaign_id, replied_at, read_at, status")
      .eq("conversation_id", conversationId)
      .in("status", ["sent", "delivered", "read"])
      .is("replied_at", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recipient) {
      const now = new Date().toISOString();
      const updateData: any = {
        status: "replied",
        replied_at: now,
        updated_at: now,
      };

      // Se respondeu mas não tinha recebido o evento de read (ex: privacidade do WhatsApp desativada), infere a leitura
      if (!recipient.read_at) {
        updateData.read_at = now;
      }

      await supabaseAdmin.from("campaign_recipients").update(updateData).eq("id", recipient.id);

      // Recalcula estatísticas da campanha
      await supabaseAdmin.rpc("recalculate_campaign_stats", {
        p_campaign_id: recipient.campaign_id,
      });
      console.log(
        `[campaigns] Destinatário ${recipient.id} marcado como 'replied' na campanha ${recipient.campaign_id}`,
      );
    }
  } catch (e) {
    console.error("[campaigns] Erro ao marcar resposta do destinatário da campanha:", e);
  }
}

/**
 * Marca destinatários de campanha como lidos a partir de evento de Receipt do WhatsApp
 */
export async function markCampaignRecipientsRead(
  remoteMessageIds: string[],
  readTimestamp?: string | null,
): Promise<void> {
  try {
    if (!remoteMessageIds || !remoteMessageIds.length) return;

    const uniqueRemoteIds = Array.from(new Set(remoteMessageIds.filter(Boolean)));
    if (!uniqueRemoteIds.length) return;

    // 1. Encontra as mensagens enviadas correspondentes no banco
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("id, remote_msg_id")
      .in("remote_msg_id", uniqueRemoteIds);

    if (msgErr) {
      console.error("[campaigns] Erro ao buscar messages por remote_msg_id:", msgErr);
      return;
    }
    if (!messages || !messages.length) return;

    const messageIds = messages.map((m) => m.id);

    // 2. Busca destinatários de campanha vinculados a essas mensagens
    const { data: recipients, error: recErr } = await supabaseAdmin
      .from("campaign_recipients")
      .select("id, campaign_id, status, read_at")
      .in("message_id", messageIds);

    if (recErr) {
      console.error("[campaigns] Erro ao buscar campaign_recipients por message_id:", recErr);
      return;
    }
    if (!recipients || !recipients.length) return;

    // Normalização segura do timestamp (suporta ISO, epoch em segundos e epoch em ms)
    let timestampIso: string;
    try {
      if (readTimestamp) {
        const rawNum = Number(readTimestamp);
        const timeVal =
          !isNaN(rawNum) && rawNum > 0 && rawNum < 10000000000 ? rawNum * 1000 : readTimestamp;
        const d = new Date(timeVal);
        timestampIso = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } else {
        timestampIso = new Date().toISOString();
      }
    } catch {
      timestampIso = new Date().toISOString();
    }

    const affectedCampaignIds = new Set<string>();

    // Separa destinatários que de fato precisam ser atualizados (evita escrita e recálculo em duplicatas)
    const toMarkRead = recipients.filter(
      (r) => r.status !== "replied" && !(r.status === "read" && r.read_at),
    );
    const toMarkRepliedRead = recipients.filter((r) => r.status === "replied" && !r.read_at);

    if (toMarkRead.length === 0 && toMarkRepliedRead.length === 0) {
      // Todos já estavam processados como lidos
      return;
    }

    const nowIso = new Date().toISOString();

    // Atualização em lote para quem avança para status 'read'
    if (toMarkRead.length > 0) {
      const readIds = toMarkRead.map((r) => r.id);
      toMarkRead.forEach((r) => affectedCampaignIds.add(r.campaign_id));

      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          status: "read",
          read_at: timestampIso,
          updated_at: nowIso,
        })
        .in("id", readIds);
    }

    // Atualização em lote para quem já tinha respondido mas ainda não tinha 'read_at'
    if (toMarkRepliedRead.length > 0) {
      const repliedIds = toMarkRepliedRead.map((r) => r.id);
      toMarkRepliedRead.forEach((r) => affectedCampaignIds.add(r.campaign_id));

      await supabaseAdmin
        .from("campaign_recipients")
        .update({
          read_at: timestampIso,
          updated_at: nowIso,
        })
        .in("id", repliedIds);
    }

    // 3. Recalcula as estatísticas de cada campanha afetada
    for (const campaignId of affectedCampaignIds) {
      await supabaseAdmin.rpc("recalculate_campaign_stats", {
        p_campaign_id: campaignId,
      });
      console.log(
        `[campaigns] Taxa de leitura atualizada para a campanha ${campaignId} (${toMarkRead.length + toMarkRepliedRead.length} destinatário(s))`,
      );
    }
  } catch (e) {
    console.error("[campaigns] Erro ao processar leitura de destinatários da campanha:", e);
  }
}
