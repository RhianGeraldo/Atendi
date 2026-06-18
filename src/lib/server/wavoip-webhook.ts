import { supabaseAdmin } from '@/integrations/supabase/client.server';

export async function handleWavoipWebhook(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    console.log('[wavoip-webhook] Received payload:', JSON.stringify(body));

    // O Wavoip manda {"type": "RECORD", "action": "UPDATE", "record_status": "READY", "whatsapp_call_id": "...", "record_url": "..."}
    if (body.type === 'RECORD' && body.record_status === 'READY' && body.whatsapp_call_id && body.record_url) {
      await processWavoipRecording(body);
    } else if (body.type === 'CALL' && body.whatsapp_call_id) {
      await processWavoipCallEvent(body);
    } else {
      console.log('[wavoip-webhook] Ignorando evento não relacionado a gravação ou chamada ativa:', body.type, body.status || body.record_status);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[wavoip-webhook] Error:', err);
    return new Response('Error', { status: 500 });
  }
}

async function processWavoipCallEvent(body: any) {
  const { whatsapp_call_id, status, caller, receiver, direction, duration } = body;

  console.log(`[wavoip-webhook] Processando evento de chamada ${whatsapp_call_id} (${status})`);

  // 1. Determinar quem é o cliente (peer) e quem é a nossa instância (device)
  const isOutgoing = direction === 'OUTCOMING' || direction === 'OUTGOING';
  const peerPhone = isOutgoing ? receiver : caller;
  const devicePhone = isOutgoing ? caller : receiver;

  // Limpar os números para fazer buscas seguras
  const cleanPeerPhone = peerPhone.replace(/\D/g, "");
  const cleanDevicePhone = devicePhone.replace(/\D/g, "");

  // 2. Encontrar a instância correspondente
  // Vamos buscar por owner_jid contendo o cleanDevicePhone, ou buscar pelo wavoip_token
  const { data: instances } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, company_id, unit_id')
    .or(`owner_jid.ilike.%${cleanDevicePhone}%,instance_name.ilike.%${cleanDevicePhone}%`);

  let instance = instances && instances.length > 0 ? instances[0] : null;
  let companyId = instance?.company_id;
  let unitId = instance?.unit_id;

  // 3. Encontrar o contato pelo peerPhone
  const phoneSuffix = cleanPeerPhone.slice(-8);
  let contact = null;
  
  if (companyId) {
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, unit_id')
      .eq('company_id', companyId)
      .ilike('phone', `%${phoneSuffix}%`)
      .limit(1);
    if (contacts && contacts.length > 0) {
      contact = contacts[0];
      if (contact.unit_id) unitId = contact.unit_id;
    }
  } else {
    // Se não temos a company_id ainda, busca o contato de forma global para descobrir a empresa
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, company_id, unit_id')
      .ilike('phone', `%${phoneSuffix}%`)
      .limit(1);
    if (contacts && contacts.length > 0) {
      contact = contacts[0];
      companyId = contact.company_id;
      unitId = contact.unit_id;
      
      // Se não tínhamos a instância, tenta buscar a instância na mesma empresa
      if (!instance) {
        const { data: companyInstances } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id')
          .eq('company_id', companyId)
          .limit(1);
        if (companyInstances && companyInstances.length > 0) {
          instance = companyInstances[0];
        }
      }
    }
  }

  if (!companyId) {
    console.warn(`[wavoip-webhook] Não foi possível determinar a company_id para a chamada ${whatsapp_call_id}. Ignorando.`);
    return;
  }

  // 4. Mapear status do Wavoip para o ENUM do banco ('RINGING', 'CALLING', 'NOT_ANSWERED', 'ACTIVE', 'ENDED', 'REJECTED', 'FAILED', 'DISCONNECTED')
  let dbStatus: 'RINGING' | 'CALLING' | 'NOT_ANSWERED' | 'ACTIVE' | 'ENDED' | 'REJECTED' | 'FAILED' | 'DISCONNECTED' = 'CALLING';
  if (status === 'CALLING') dbStatus = 'CALLING';
  else if (status === 'RINGING') dbStatus = 'RINGING';
  else if (status === 'ACTIVE') dbStatus = 'ACTIVE';
  else if (status === 'ENDED') dbStatus = 'ENDED';
  else if (status === 'REJECTED') dbStatus = 'REJECTED';
  else if (status === 'NOT_ANSWERED') dbStatus = 'NOT_ANSWERED';
  else if (status === 'FAILED') dbStatus = 'FAILED';
  else if (status === 'DISCONNECTED') dbStatus = 'DISCONNECTED';

  // 5. Montar payload do call_logs (sem unit_id que não existe no banco na call_logs!)
  const callLogPayload: any = {
    wavoip_call_id,
    company_id: companyId,
    direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
    status: dbStatus,
    peer_number: cleanPeerPhone
  };

  if (instance?.id) callLogPayload.whatsapp_instance_id = instance.id;
  if (contact?.id) callLogPayload.contact_id = contact.id;

  if (status === 'CALLING' || status === 'RINGING') {
    callLogPayload.started_at = new Date().toISOString();
  } else if (dbStatus === 'ENDED' || dbStatus === 'NOT_ANSWERED' || dbStatus === 'REJECTED' || dbStatus === 'FAILED' || dbStatus === 'DISCONNECTED') {
    callLogPayload.ended_at = new Date().toISOString();
    if (duration) {
      callLogPayload.duration_seconds = Math.round(duration);
    }
  }

  // 6. Fazer upsert no call_logs
  const { data: existingCall } = await supabaseAdmin
    .from('call_logs')
    .select('id, started_at')
    .eq('wavoip_call_id', whatsapp_call_id)
    .single();

  if (existingCall) {
    const updatePayload: any = { status: dbStatus };
    if (callLogPayload.ended_at) updatePayload.ended_at = callLogPayload.ended_at;
    if (callLogPayload.duration_seconds) updatePayload.duration_seconds = callLogPayload.duration_seconds;
    
    const { error: updateErr } = await supabaseAdmin
      .from('call_logs')
      .update(updatePayload)
      .eq('id', existingCall.id);
      
    if (updateErr) {
      console.error(`[wavoip-webhook] Erro ao atualizar call_log:`, updateErr);
    } else {
      console.log(`[wavoip-webhook] Call log atualizado com sucesso no DB. ID: ${existingCall.id}`);
    }
  } else {
    // Insere novo
    const { data: newCall, error: insertErr } = await supabaseAdmin
      .from('call_logs')
      .insert(callLogPayload)
      .select('id')
      .single();
      
    if (insertErr) {
      console.error(`[wavoip-webhook] Erro ao inserir call_log:`, insertErr);
    } else {
      console.log(`[wavoip-webhook] Novo call log inserido com sucesso no DB. ID: ${newCall.id}`);
    }
  }
}

async function processWavoipRecording(body: any) {
  const { whatsapp_call_id, record_url } = body;

  console.log(`[wavoip-webhook] Processando gravação da chamada: ${whatsapp_call_id}`);

  // 1. Encontrar o registro da ligação no banco (removido unit_id inexistente)
  const { data: callLog, error: callErr } = await supabaseAdmin
    .from('call_logs')
    .select('id, whatsapp_instance_id, contact_id, assigned_agent_id, company_id')
    .eq('wavoip_call_id', whatsapp_call_id)
    .single();

  if (callErr || !callLog) {
    console.error(`[wavoip-webhook] Ligação não encontrada na tabela call_logs: ${whatsapp_call_id}`, callErr);
    return;
  }

  const { whatsapp_instance_id, contact_id, assigned_agent_id, company_id } = callLog;

  // Buscar unit_id do contato correspondente
  let unit_id = null;
  if (contact_id) {
    const { data: contactData } = await supabaseAdmin
      .from('contacts')
      .select('unit_id')
      .eq('id', contact_id)
      .single();
    unit_id = contactData?.unit_id || null;
  }

  // 2. Atualizar o call_log com a URL final
  await supabaseAdmin
    .from('call_logs')
    .update({ recording_url: record_url })
    .eq('id', callLog.id);

  if (!contact_id || !whatsapp_instance_id) {
    console.log(`[wavoip-webhook] Faltando contact_id ou instance_id para injetar no chat. Abortando injeção.`);
    return;
  }

  // 3. Detectar o formato de áudio da URL (Wavoip envia MP3/WAV, não OGG como o WhatsApp)
  const urlPath = new URL(record_url).pathname.toLowerCase();
  const audioFormat = urlPath.endsWith('.mp3') ? 'mp3'
    : urlPath.endsWith('.wav') ? 'wav'
    : urlPath.endsWith('.m4a') ? 'm4a'
    : 'mp3'; // fallback: Wavoip costuma usar mp3

  // 4. Fazer o download do arquivo de áudio para converter para Base64 (necessário para transcrição)
  let base64Audio = null;
  try {
    const audioRes = await fetch(record_url);
    if (!audioRes.ok) throw new Error(`Falha HTTP ao baixar áudio: ${audioRes.status}`);
    
    const arrayBuffer = await audioRes.arrayBuffer();
    base64Audio = Buffer.from(arrayBuffer).toString('base64');
    console.log(`[wavoip-webhook] Download da gravação concluído (${base64Audio.length} chars de base64, formato: ${audioFormat})`);
  } catch (e) {
    console.error(`[wavoip-webhook] Erro ao baixar arquivo de áudio de ${record_url}:`, e);
  }

  // 5. Encontrar a conversa ativa ou aguardando
  let conversationId;
  const { data: activeConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, status')
    .eq('contact_id', contact_id)
    .eq('whatsapp_instance_id', whatsapp_instance_id)
    .order('started_at', { ascending: false })
    .limit(1);

  if (activeConvs && activeConvs.length > 0) {
    conversationId = activeConvs[0].id;
    await supabaseAdmin.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);
  } else {
    // Cria uma conversa nova se não existir (raro, pois para ter ligação tem que ter contato/conversa)
    const { data: newConv } = await supabaseAdmin
      .from('conversations')
      .insert({
        company_id,
        unit_id,
        whatsapp_instance_id,
        contact_id,
        channel: 'whatsapp',
        status: 'waiting',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (newConv) conversationId = newConv.id;
  }

  if (!conversationId) {
    console.error('[wavoip-webhook] Não foi possível encontrar/criar uma conversa para injetar a gravação.');
    return;
  }

  // 6. Inserir a mensagem de áudio na conversa como mensagem interna
  const { data: newMsg, error: msgErr } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      is_internal: true, // Visível apenas no CRM!
      media_type: 'audio',
      media_url: record_url,
      content: '📞 Gravação da Ligação'
    })
    .select('id')
    .single();

  if (msgErr || !newMsg) {
    console.error('[wavoip-webhook] Erro ao injetar mensagem de gravação no chat:', msgErr);
    return;
  }

  console.log(`[wavoip-webhook] Gravação injetada no chat com sucesso! Msg ID: ${newMsg.id}`);

  // 7. Transcrever o áudio com o formato correto (MP3 do Wavoip, não OGG do WhatsApp)
  if (base64Audio && company_id) {
    console.log(`[wavoip-webhook] Iniciando transcrição de áudio via Whisper (formato: ${audioFormat})...`);
    await triggerAudioTranscription(newMsg.id, base64Audio, company_id, audioFormat, callLog.id);
  }
}

/**
 * Salva a transcrição no call_logs após persisti-la na messages.
 */
async function triggerAudioTranscription(
  messageId: string,
  base64Audio: string,
  companyId: string,
  audioFormat: string,
  callLogId: string
) {
  const { triggerAudioTranscription: baseTranscribe } = await import('./evogo-webhook');
  await baseTranscribe(messageId, base64Audio, companyId, audioFormat);

  // Após a transcrição ser salva na mensagem, copiar para o call_log também
  const { data: updatedMsg } = await supabaseAdmin
    .from('messages')
    .select('transcription')
    .eq('id', messageId)
    .single();

  if (updatedMsg?.transcription) {
    await supabaseAdmin
      .from('call_logs')
      .update({ transcription: updatedMsg.transcription })
      .eq('id', callLogId);
    console.log(`[wavoip-webhook] Transcrição salva no call_log ${callLogId}`);
  }
}
