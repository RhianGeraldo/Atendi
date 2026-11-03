import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPhoneVariants } from "@/lib/utils";

export async function handleAtendiCallsWebhook(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    console.log("[atendicalls-webhook] Evento recebido:", JSON.stringify(body));

    if (body.event === "call.ended") {
      await processCallEndedEvent(body);
    } else {
      console.log(`[atendicalls-webhook] Evento ignorado ou não suportado: ${body.event}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[atendicalls-webhook] Erro ao processar webhook:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function processCallEndedEvent(payload: {
  event: string;
  callId: string;
  sessionId?: string;
  reason?: string;
  peer: string;
  durationSec?: number;
  transcript?: string;
  timestamp?: number;
}) {
  const { callId, sessionId, reason, peer, durationSec = 0, transcript, timestamp } = payload;
  const cleanPeerPhone = (peer || "").replace(/\D/g, "");

  if (!callId) {
    console.warn("[atendicalls-webhook] Chamada sem callId. Ignorando.");
    return;
  }

  console.log(
    `[atendicalls-webhook] Processando fim da chamada ${callId} (${reason || "completed"}) para ${cleanPeerPhone}. Duração: ${durationSec}s`
  );

  // 1. Tentar encontrar a instância pelo sessionId / token
  let instance: any = null;
  let companyId: string | null = null;
  let unitId: string | null = null;

  if (sessionId) {
    const { data: instList } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, company_id, unit_id")
      .or(`atendicalls_token.eq.${sessionId},wavoip_token.eq.${sessionId}`)
      .limit(1);

    if (instList && instList.length > 0) {
      instance = instList[0];
      companyId = instance.company_id;
      unitId = instance.unit_id;
    }
  }

  // 2. Localizar o contato pelo telefone (usando variações)
  const phoneVariants = cleanPeerPhone ? getPhoneVariants(cleanPeerPhone) : [];
  let contact: any = null;

  if (phoneVariants.length > 0) {
    let contactQuery = supabaseAdmin
      .from("contacts")
      .select("id, company_id, unit_id, name")
      .in("phone", phoneVariants);

    if (companyId) {
      contactQuery = contactQuery.eq("company_id", companyId);
    }

    const { data: foundContacts } = await contactQuery.limit(1);
    if (foundContacts && foundContacts.length > 0) {
      contact = foundContacts[0];
      if (!companyId) companyId = contact.company_id;
      if (!unitId && contact.unit_id) unitId = contact.unit_id;
    }
  }

  // 3. Fallback: se ainda não temos empresa nem instância, busca a primeira empresa com AtendiCalls ativo
  if (!companyId) {
    const { data: defaultCompany } = await supabaseAdmin
      .from("companies")
      .select("id")
      .limit(1)
      .single();
    companyId = defaultCompany?.id || null;
  }

  if (!companyId) {
    console.warn(`[atendicalls-webhook] Não foi possível determinar a company_id para a chamada ${callId}. Abortando.`);
    return;
  }

  // Se não localizou a instância exata, vincula à primeira instância conectada da empresa
  if (!instance) {
    const { data: compInstances } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, unit_id")
      .eq("company_id", companyId)
      .order("status", { ascending: false })
      .limit(1);

    if (compInstances && compInstances.length > 0) {
      instance = compInstances[0];
      if (!unitId && instance.unit_id) unitId = instance.unit_id;
    }
  }

  // 4. Mapear status para o ENUM da tabela call_logs
  // ('RINGING', 'CALLING', 'NOT_ANSWERED', 'ACTIVE', 'ENDED', 'REJECTED', 'FAILED', 'DISCONNECTED')
  let dbStatus: "ENDED" | "NOT_ANSWERED" | "REJECTED" | "FAILED" = "ENDED";
  const r = (reason || "").toLowerCase();

  if (r.includes("not_answered") || r.includes("no_answer") || r.includes("timeout") || r.includes("busy")) {
    dbStatus = "NOT_ANSWERED";
  } else if (r.includes("reject") || r.includes("declined")) {
    dbStatus = "REJECTED";
  } else if (r.includes("fail") || r.includes("error")) {
    dbStatus = "FAILED";
  } else {
    dbStatus = "ENDED";
  }

  const endedTime = timestamp ? new Date(timestamp) : new Date();
  const startedTime = new Date(endedTime.getTime() - Math.max(0, durationSec) * 1000);
  const recordingProxyUrl = `/api/calls/${callId}/audio`;

  // 5. Upsert no call_logs
  const callPayload: any = {
    call_id: callId,
    wavoip_call_id: callId, // Mantém compatibilidade com trigger e queries legadas
    company_id: companyId,
    direction: "OUTGOING",
    status: dbStatus,
    peer_number: cleanPeerPhone,
    duration_seconds: Math.round(durationSec),
    recording_url: recordingProxyUrl,
    transcription: transcript || null,
    started_at: startedTime.toISOString(),
    ended_at: endedTime.toISOString(),
    provider: "atendicalls",
    metadata: {
      reason,
      sessionId,
      transcript,
    },
  };

  if (instance?.id) callPayload.whatsapp_instance_id = instance.id;
  if (contact?.id) callPayload.contact_id = contact.id;

  const { data: existingCall } = await supabaseAdmin
    .from("call_logs")
    .select("id")
    .or(`call_id.eq.${callId},wavoip_call_id.eq.${callId}`)
    .maybeSingle();

  let callLogId = existingCall?.id;

  if (existingCall) {
    const { error: updErr } = await supabaseAdmin
      .from("call_logs")
      .update(callPayload)
      .eq("id", existingCall.id);

    if (updErr) {
      console.error("[atendicalls-webhook] Erro ao atualizar call_log:", updErr);
    } else {
      console.log(`[atendicalls-webhook] Call log atualizado: ${existingCall.id}`);
    }
  } else {
    const { data: newCall, error: insErr } = await supabaseAdmin
      .from("call_logs")
      .insert(callPayload)
      .select("id")
      .single();

    if (insErr) {
      console.error("[atendicalls-webhook] Erro ao inserir call_log:", insErr);
    } else {
      callLogId = newCall.id;
      console.log(`[atendicalls-webhook] Novo call log inserido: ${newCall.id}`);
    }
  }

  // 6. Atualizar a mensagem no chat com o áudio e a transcrição pronta
  if (contact?.id && instance?.id) {
    await injectRecordingAndTranscriptIntoChat({
      callId,
      contactId: contact.id,
      instanceId: instance.id,
      companyId,
      unitId,
      recordingUrl: recordingProxyUrl,
      transcript: transcript || null,
      durationSec,
      dbStatus,
    });
  }

  // 7. Se o contato está no Todoo, registra o evento na timeline do lead
  if (contact?.id && companyId) {
    await registerTodooCallEvent({
      contactId: contact.id,
      companyId,
      callId,
      durationSec,
      dbStatus,
      transcript,
    });
  }
}

/**
 * Garante que a mensagem no chat contenha o player de áudio e a transcrição formatada
 */
async function injectRecordingAndTranscriptIntoChat(params: {
  callId: string;
  contactId: string;
  instanceId: string;
  companyId: string;
  unitId?: string | null;
  recordingUrl: string;
  transcript: string | null;
  durationSec: number;
  dbStatus: string;
}) {
  const { callId, contactId, instanceId, companyId, unitId, recordingUrl, transcript, durationSec, dbStatus } = params;

  // Localiza conversa
  let conversationId: string | null = null;
  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("whatsapp_instance_id", instanceId)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (convs && convs.length > 0) {
    conversationId = convs[0].id;
  } else {
    const { data: newConv } = await supabaseAdmin
      .from("conversations")
      .insert({
        company_id: companyId,
        unit_id: unitId || null,
        whatsapp_instance_id: instanceId,
        contact_id: contactId,
        channel: "whatsapp",
        status: "waiting",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (newConv) conversationId = newConv.id;
  }

  if (!conversationId) return;

  // Busca mensagem correspondente à chamada
  const { data: existingMsg } = await supabaseAdmin
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .or(`metadata->>call_id.eq.${callId},metadata->>wavoip_call_id.eq.${callId}`)
    .maybeSingle();

  const msgMetadata: any = {
    ...(existingMsg?.metadata as any || {}),
    type: "call",
    call_id: callId,
    wavoip_call_id: callId,
    duration: durationSec,
    recording_url: recordingUrl,
    provider: "atendicalls",
  };

  if (existingMsg) {
    await supabaseAdmin
      .from("messages")
      .update({
        media_url: recordingUrl,
        metadata: msgMetadata,
        transcription: transcript,
      })
      .eq("id", existingMsg.id);
  } else {
    // Insere como mensagem do tipo call
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "agent",
      is_internal: false,
      media_type: "text",
      content: dbStatus === "ENDED" ? "📞 Ligação de voz com IA" : "📞 Ligação não atendida",
      media_url: recordingUrl,
      transcription: transcript,
      metadata: msgMetadata,
      created_at: new Date().toISOString(),
    });
  }

  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/**
 * Se o contato estiver no Todoo, registra o evento da ligação no histórico do lead
 */
async function registerTodooCallEvent(params: {
  contactId: string;
  companyId: string;
  callId: string;
  durationSec: number;
  dbStatus: string;
  transcript?: string;
}) {
  const { contactId, companyId, callId, durationSec, dbStatus, transcript } = params;

  try {
    const { data: todooLeads } = await supabaseAdmin
      .from("todoo_leads")
      .select("id, campaign_id, assigned_user_id")
      .eq("contact_id", contactId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (todooLeads && todooLeads.length > 0) {
      const lead = todooLeads[0];
      const preview = transcript
        ? transcript.slice(0, 300) + (transcript.length > 300 ? "..." : "")
        : `Chamada ${dbStatus === "ENDED" ? "concluída" : "não atendida"} (${durationSec}s)`;

      await (supabaseAdmin.from("todoo_events") as any).insert({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        company_id: companyId,
        user_id: lead.assigned_user_id || null,
        event_type: "call_attempted",
        notes: `Ligação AtendiCalls: ${preview}`,
        metadata: {
          call_id: callId,
          duration_seconds: durationSec,
          status: dbStatus,
          provider: "atendicalls",
        },
      });
      console.log(`[atendicalls-webhook] Evento do Todoo registrado para o lead ${lead.id}`);
    }
  } catch (err: any) {
    console.warn("[atendicalls-webhook] Falha não crítica ao registrar evento Todoo:", err?.message);
  }
}
