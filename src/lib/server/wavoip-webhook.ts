import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { triggerAudioTranscription } from './evogo-webhook';

export async function handleWavoipWebhook(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    console.log('[wavoip-webhook] Received payload:', JSON.stringify(body));

    // O Wavoip manda {"type": "RECORD", "action": "UPDATE", "record_status": "READY", "whatsapp_call_id": "...", "record_url": "..."}
    if (body.type === 'RECORD' && body.record_status === 'READY' && body.whatsapp_call_id && body.record_url) {
      await processWavoipRecording(body);
    } else {
      console.log('[wavoip-webhook] Ignorando evento não relacionado a gravação pronta:', body.type, body.record_status);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[wavoip-webhook] Error:', err);
    return new Response('Error', { status: 500 });
  }
}

async function processWavoipRecording(body: any) {
  const { whatsapp_call_id, record_url } = body;

  console.log(`[wavoip-webhook] Processando gravação da chamada: ${whatsapp_call_id}`);

  // 1. Encontrar o registro da ligação no banco
  const { data: callLog, error: callErr } = await supabaseAdmin
    .from('call_logs')
    .select('id, whatsapp_instance_id, contact_id, assigned_agent_id, company_id, unit_id')
    .eq('wavoip_call_id', whatsapp_call_id)
    .single();

  if (callErr || !callLog) {
    console.error(`[wavoip-webhook] Ligação não encontrada na tabela call_logs: ${whatsapp_call_id}`, callErr);
    return;
  }

  const { whatsapp_instance_id, contact_id, assigned_agent_id, company_id, unit_id } = callLog;

  // 2. Atualizar o call_log com a URL final
  await supabaseAdmin
    .from('call_logs')
    .update({ recording_url: record_url })
    .eq('id', callLog.id);

  if (!contact_id || !whatsapp_instance_id) {
    console.log(`[wavoip-webhook] Faltando contact_id ou instance_id para injetar no chat. Abortando injeção.`);
    return;
  }

  // 3. Fazer o download do arquivo de áudio para converter para Base64 (necessário para transcrição)
  let base64Audio = null;
  try {
    const audioRes = await fetch(record_url);
    if (!audioRes.ok) throw new Error(`Falha HTTP ao baixar áudio: ${audioRes.status}`);
    
    const arrayBuffer = await audioRes.arrayBuffer();
    base64Audio = Buffer.from(arrayBuffer).toString('base64');
    console.log(`[wavoip-webhook] Download da gravação concluído (${base64Audio.length} chars de base64)`);
  } catch (e) {
    console.error(`[wavoip-webhook] Erro ao baixar arquivo de áudio de ${record_url}:`, e);
    // Mesmo se falhar o download, vamos tentar registrar no chat
  }

  // 4. Encontrar a conversa ativa ou aguardando
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
    // Se estivesse resolvido, reabre para mostrar o áudio?
    // Melhor manter o status como está e apenas injetar
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

  // 5. Inserir a mensagem de áudio na conversa como mensagem interna
  const { data: newMsg, error: msgErr } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'system',
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

  // 6. Transcrever o áudio
  if (base64Audio && company_id) {
    console.log(`[wavoip-webhook] Iniciando transcrição de áudio via Whisper...`);
    await triggerAudioTranscription(newMsg.id, base64Audio, company_id);
  }
}
