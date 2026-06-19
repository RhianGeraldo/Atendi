import { supabaseAdmin } from '@/integrations/supabase/client.server';

import { enqueueAiMessage } from './ai-queue';

export async function handleInstagramWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      console.log(`[Instagram Webhook] Verificado com token: ${token}`);
      return new Response(challenge, { status: 200 });
    }
    return new Response('Invalid request', { status: 400 });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      await processInstagramWebhookBody(body);
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('[Instagram Webhook] Erro:', err);
      return new Response('ERROR', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processInstagramWebhookBody(body: any): Promise<void> {
  if (body.object === 'instagram') {
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        const instagramAccountId = entry.id; // O ID da conta do Instagram (página)

        // Buscar a instância correspondente
        const { data: instance } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, company_id, unit_id, provider')
          .eq('provider', 'instagram')
          .eq('oficial_phone_number_id', instagramAccountId)
          .limit(1)
          .maybeSingle();

        if (!instance) {
          console.log(`[Instagram Webhook] Instância não encontrada para a conta IG: ${instagramAccountId}`);
          continue;
        }

        for (const webhookEvent of entry.messaging || []) {
          const senderIgsid = webhookEvent.sender.id;
          const recipientIgsid = webhookEvent.recipient.id;
          const timestamp = webhookEvent.timestamp;

          // Se for is_echo, a mensagem foi enviada pelo dono da página (from me)
          const isFromMe = webhookEvent.message?.is_echo || senderIgsid === instagramAccountId;
          const contactIgsid = isFromMe ? recipientIgsid : senderIgsid;

          if (webhookEvent.message) {
            const messageId = webhookEvent.message.mid;
            const textContent = webhookEvent.message.text || '';
            let mediaType = 'text';
            let mediaUrl = null;

            if (webhookEvent.message.attachments && webhookEvent.message.attachments.length > 0) {
              const attachment = webhookEvent.message.attachments[0];
              mediaType = attachment.type; // 'image', 'video', 'audio', 'file'
              mediaUrl = attachment.payload?.url;
              if (attachment.payload?.sticker_id) mediaType = 'image';
            }

            if (!textContent && mediaType === 'text') continue;

            await processIncomingMessage({
              companyId: instance.company_id,
              unitId: instance.unit_id,
              instanceId: instance.id,
              contactIgsid,
              messageId,
              textContent,
              mediaType,
              mediaUrl,
              timestamp,
              isFromMe
            });
          }
        }
      }
    }
  }
}

async function processIncomingMessage(params: any) {
  const { companyId, unitId, instanceId, contactIgsid, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe } = params;

  // 1. Encontrar ou criar o contato usando o IGSID (Instagram Scoped ID) no campo whatsapp_lid
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('whatsapp_lid', contactIgsid)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: companyId,
        unit_id: unitId,
        name: `Instagram User (${contactIgsid})`, // Poderíamos buscar o perfil da Graph API
        phone: contactIgsid, // Necessário colocar algo no phone para evitar restrições
        whatsapp_lid: contactIgsid,
        source: 'Instagram'
      })
      .select('id')
      .single();

    if (contactError) {
      console.error('[Instagram Webhook] Erro ao criar contato:', contactError);
      return;
    }
    contact = newContact;
  }

  // 2. Encontrar conversa ativa na mesma instância
  let { data: activeConv } = await supabaseAdmin
    .from('conversations')
    .select('id, status, assigned_agent_id')
    .eq('contact_id', contact.id)
    .eq('whatsapp_instance_id', instanceId)
    .in('status', ['waiting', 'active'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId;

  if (activeConv) {
    conversationId = activeConv.id;
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50)
      })
      .eq('id', conversationId);
  } else {
    // Cria nova conversa
    const { data: newConv, error: convError } = await supabaseAdmin
      .from('conversations')
      .insert({
        contact_id: contact.id,
        whatsapp_instance_id: instanceId,
        unit_id: unitId,
        status: isFromMe ? 'resolved' : 'waiting',
        started_at: new Date(timestamp).toISOString(),
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50),
        channel: 'instagram'
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[Instagram Webhook] Erro ao criar conversa:', convError);
      return;
    }
    conversationId = newConv.id;
  }

  // 3. Verifica se a mensagem já existe
  const { data: existingMsg } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('remote_msg_id', messageId)
    .maybeSingle();

  if (existingMsg) return; // Duplicada

  // 4. Inserir mensagem
  const { data: msgData, error: msgError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: isFromMe ? 'agent' : 'contact',
      content: textContent || '',
      media_type: mediaType,
      media_url: mediaUrl,
      remote_msg_id: messageId,
      created_at: new Date(timestamp).toISOString()
    })
    .select('id')
    .single();

  if (msgError) {
    console.error('[Instagram Webhook] Erro ao inserir mensagem:', msgError);
    return;
  }

  // Se não for do dono da página, enqueue para IA se necessário
  if (!isFromMe && (activeConv?.status === 'waiting' || !activeConv?.assigned_agent_id)) {
    await enqueueAiMessage(msgData.id, companyId, conversationId);
  }
}
