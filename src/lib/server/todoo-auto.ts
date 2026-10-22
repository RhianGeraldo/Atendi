/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fillQuickMessageVariables } from "@/lib/quick-message-vars";
import { getPhoneVariants } from "@/lib/utils";
import { sendPlatformMessage } from "./message-sender";

/**
 * Envio automático da cadência do Todoo.
 *
 * O banco decide quem sai (todoo_auto_claim: um contato por unidade, no intervalo, no
 * horário e nos dias da unidade, já conferindo se a cliente respondeu). Aqui só abre a
 * conversa no número do envio automático, envia e devolve o resultado
 * (todoo_auto_complete), que avança o card como envio automático.
 */

interface ClaimedSend {
  queue_id: string;
  lead_id: string;
  company_id: string;
  unit_id: string;
  unit_name: string | null;
  instance_id: string;
  contact_id: string | null;
  contact_name: string;
  contact_phone: string;
  campaign_title: string | null;
  consultant_name: string | null;
  referrer_name: string | null;
  message_id: string;
  content: string | null;
  media_type: "image" | "video" | "audio" | "document" | null;
  media_url: string | null;
  media_name: string | null;
}

const TIME_ZONE = "America/Sao_Paulo";

/** Saudação, data e hora no horário de Brasília (o servidor roda em UTC). */
function localNow() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  return {
    greeting: hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite",
    date: new Date().toLocaleDateString("pt-BR", { timeZone: TIME_ZONE }),
    time: new Date().toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }),
  };
}

/** Mesmas variáveis das mensagens rápidas, mais {{consultora}} e {{indicadora}}. */
async function fillVariables(item: ClaimedSend, instanceName: string) {
  const [{ data: company }, { data: unit }] = await Promise.all([
    supabaseAdmin.from("companies").select("name, custom_variables").eq("id", item.company_id).maybeSingle(),
    supabaseAdmin.from("units").select("name, custom_variables").eq("id", item.unit_id).maybeSingle(),
  ]);
  const now = localNow();
  const consultant = item.consultant_name?.trim() || "";
  let text = (item.content || "")
    .replace(/\{\{saudacao\}\}/gi, now.greeting)
    .replace(/\{\{data\}\}/gi, now.date)
    .replace(/\{\{hora\}\}/gi, now.time)
    .replace(/\{\{consultora\}\}/gi, consultant.split(/\s+/)[0] || "")
    .replace(/\{\{indicadora\}\}/gi, item.referrer_name?.trim() || "uma amiga");
  text = fillQuickMessageVariables(text, {
    clientName: item.contact_name,
    phone: item.contact_phone,
    agentName: consultant || null,
    companyName: (company as any)?.name,
    unitName: (unit as any)?.name ?? item.unit_name,
    instanceName,
    companyVariables: (company as any)?.custom_variables,
    unitVariables: (unit as any)?.custom_variables,
  });
  return text.trim();
}

/**
 * Mídia salva em base64 na variação: sobe uma vez para o Storage e grava a URL na
 * variação, para os próximos envios não subirem o mesmo arquivo de novo.
 */
async function resolveMediaUrl(item: ClaimedSend): Promise<string | null> {
  const url = item.media_url;
  if (!url || !url.startsWith("data:")) return url;
  const match = url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!match) return url;
  const [, mimeType, base64] = match;
  const ext = mimeType.split("/")[1]?.split("+")[0] || "bin";
  const path = `todoo-auto/${item.company_id}/${item.message_id}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(path, Buffer.from(base64, "base64"), { contentType: mimeType, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`Não foi possível subir a mídia: ${error.message}`);
  const publicUrl = supabaseAdmin.storage.from("media").getPublicUrl(path).data.publicUrl;
  await (supabaseAdmin.from("todoo_auto_messages") as any).update({ media_url: publicUrl }).eq("id", item.message_id);
  return publicUrl;
}

/**
 * Conversa do contato no número do envio automático. Conversa nova nasce resolvida:
 * a mensagem automática não entra na fila do Atendimento; quando a cliente responder,
 * o webhook reabre como "aguardando", como qualquer conversa resolvida.
 */
async function ensureConversation(item: ClaimedSend, instance: { id: string; unit_id: string | null }) {
  let phone = item.contact_phone.replace(/\D/g, "");
  if (!phone.startsWith("55")) phone = `55${phone}`;

  const { data: existing } = await supabaseAdmin
    .from("contacts")
    .select("id, merged_into_id")
    .eq("company_id", item.company_id)
    .in("phone", getPhoneVariants(phone));

  let contactIds = (existing || []).map((c: any) => c.merged_into_id || c.id);
  if (contactIds.length === 0) {
    const { data: created, error } = await supabaseAdmin
      .from("contacts")
      .insert({
        company_id: item.company_id,
        unit_id: instance.unit_id,
        name: item.contact_name?.trim() || phone,
        phone,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Não foi possível criar o contato: ${error?.message}`);
    contactIds = [created.id];
  }

  const { data: latest } = await supabaseAdmin
    .from("conversations")
    .select("id, status")
    .in("contact_id", contactIds)
    .eq("whatsapp_instance_id", instance.id)
    .order("started_at", { ascending: false })
    .limit(1);
  if (latest && latest.length > 0) return { id: latest[0].id as string, status: latest[0].status as string };

  const now = new Date().toISOString();
  const { data: conv, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      unit_id: instance.unit_id,
      contact_id: contactIds[0],
      channel: "whatsapp",
      status: "resolved",
      resolved_at: now,
      whatsapp_instance_id: instance.id,
      last_message_at: now,
    } as any)
    .select("id")
    .single();
  if (error || !conv) throw new Error(`Não foi possível criar a conversa: ${error?.message}`);
  return { id: conv.id as string, status: "resolved" };
}

async function sendOne(item: ClaimedSend) {
  try {
    const { data: instance, error: instErr } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, name, unit_id")
      .eq("id", item.instance_id)
      .single();
    if (instErr || !instance) throw new Error("Número do envio automático não encontrado");

    const conversation = await ensureConversation(item, instance as any);
    const text = await fillVariables(item, (instance as any).name || "");
    const mediaUrl = item.media_type ? await resolveMediaUrl(item) : null;
    const startedAt = new Date().toISOString();
    const metadata = { todoo_auto: true, todoo_queue_id: item.queue_id, todoo_lead_id: item.lead_id };

    // Mesma ordem do envio manual: áudio não tem legenda (vai o áudio e depois o texto)
    if (mediaUrl && item.media_type === "audio") {
      await sendPlatformMessage({
        conversationId: conversation.id,
        mediaType: "audio",
        mediaBase64: mediaUrl,
        keepStatus: true,
        metadata,
      });
      if (text) {
        await sendPlatformMessage({ conversationId: conversation.id, text, keepStatus: true, metadata });
      }
    } else if (mediaUrl && item.media_type) {
      await sendPlatformMessage({
        conversationId: conversation.id,
        text,
        mediaType: item.media_type,
        mediaBase64: mediaUrl,
        keepStatus: true,
        metadata,
      });
    } else {
      await sendPlatformMessage({ conversationId: conversation.id, text, keepStatus: true, metadata });
    }

    // O eco da nossa própria mensagem pode chegar antes de ela ser gravada e reabrir a
    // conversa resolvida como "aguardando": se a cliente não escreveu nada, volta a resolvida
    if (conversation.status === "resolved") {
      const { data: reply } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("sender_type", "contact")
        .gte("created_at", startedAt)
        .limit(1);
      if (!reply || reply.length === 0) {
        await supabaseAdmin
          .from("conversations")
          .update({ status: "resolved", resolved_at: new Date().toISOString(), unread_count: 0 } as any)
          .eq("id", conversation.id)
          .neq("status", "resolved");
      }
    }

    const { error } = await (supabaseAdmin.rpc as any)("todoo_auto_complete", {
      p_queue_id: item.queue_id,
      p_ok: true,
      p_conversation_id: conversation.id,
      p_content: [item.media_name && `[${item.media_name}]`, text].filter(Boolean).join(" "),
    });
    if (error) console.error("[todoo-auto] Enviado, mas a baixa falhou:", item.queue_id, error.message);
    return true;
  } catch (err: any) {
    console.error("[todoo-auto] Falha no envio:", item.queue_id, err?.message || err);
    await (supabaseAdmin.rpc as any)("todoo_auto_complete", {
      p_queue_id: item.queue_id,
      p_ok: false,
      p_error: String(err?.message || err),
    });
    return false;
  }
}

/** Uma rodada: põe os vencidos na fila e envia o próximo contato de cada unidade liberada. */
export async function runTodooAutoSend(): Promise<{ queued: number; sent: number; failed: number }> {
  const { data: queued, error: enqueueErr } = await (supabaseAdmin.rpc as any)("todoo_auto_enqueue_all");
  if (enqueueErr) console.error("[todoo-auto] Erro ao montar a fila:", enqueueErr.message);

  const { data: claimed, error: claimErr } = await (supabaseAdmin.rpc as any)("todoo_auto_claim");
  if (claimErr) {
    console.error("[todoo-auto] Erro ao pegar a fila:", claimErr.message);
    return { queued: queued ?? 0, sent: 0, failed: 0 };
  }

  const items = ((claimed || []) as any[]).map((row) => (row?.todoo_auto_claim ?? row) as ClaimedSend);
  // Unidades diferentes saem juntas; cada unidade manda um contato por rodada
  const results = await Promise.all(items.map(sendOne));
  const sent = results.filter(Boolean).length;
  if (items.length > 0) {
    console.log(`[todoo-auto] ${sent} enviados, ${items.length - sent} com erro (${queued ?? 0} entraram na fila)`);
  }
  return { queued: queued ?? 0, sent, failed: items.length - sent };
}
