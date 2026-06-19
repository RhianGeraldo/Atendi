import { supabaseAdmin } from '@/integrations/supabase/client.server';

import { enqueueAiMessage } from './ai-queue';

export async function handleMessengerWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      console.log(`[Messenger Webhook] Verificado com token: ${token}`);
      return new Response(challenge, { status: 200 });
    }
    return new Response('Invalid request', { status: 400 });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      await processMessengerWebhookBody(body);
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('[Messenger Webhook] Erro:', err);
      return new Response('ERROR', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processMessengerWebhookBody(body: any): Promise<void> {
  if (body.object === 'messenger' || body.object === 'page') {
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        const accountId = entry.id; // Pode ser IG Account ID ou Facebook Page ID

        // Buscar a instância correspondente (checando tanto o ID do Messenger quanto o da Página)
        const { data: instance } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, company_id, unit_id, provider, oficial_phone_number_id, oficial_waba_id')
          .eq('provider', 'messenger')
          .or(`oficial_phone_number_id.eq.${accountId},oficial_waba_id.eq.${accountId}`)
          .limit(1)
          .maybeSingle();

        if (!instance) {
          console.log(`[Messenger Webhook] Instância não encontrada para a conta: ${accountId}`);
          continue;
        }

        const messengerAccountId = instance.oficial_phone_number_id;

        for (const webhookEvent of entry.messaging || []) {
          const senderId = webhookEvent.sender?.id;
          const recipientId = webhookEvent.recipient?.id;
          const timestamp = webhookEvent.timestamp;

          if (!senderId || !recipientId) continue;

          // Se for is_echo ou o remetente for a própria conta IG ou Página, foi enviado por nós
          const isFromMe = webhookEvent.message?.is_echo || senderId === messengerAccountId || senderId === accountId;
          const contactPsid = isFromMe ? recipientId : senderId;

          if (webhookEvent.message) {
            const messageId = webhookEvent.message.mid;
            let textContent = webhookEvent.message.text || '';
            let mediaType = 'text';
            let mediaUrl = null;

            if (webhookEvent.message.attachments && webhookEvent.message.attachments.length > 0) {
              const attachment = webhookEvent.message.attachments[0];
              const attType = attachment.type;
              mediaUrl = attachment.payload?.url;

              if (['image', 'sticker'].includes(attType)) {
                mediaType = 'image';
              } else if (['video', 'reel', 'ig_reel'].includes(attType)) {
                mediaType = 'video';
              } else if (attType === 'audio') {
                mediaType = 'audio';
              } else if (attType === 'file') {
                mediaType = 'document';
              } else if (['post', 'ig_post', 'fallback'].includes(attType)) {
                mediaType = 'text';
                const attTitle = attachment.payload?.title || '';
                const attUrl = attachment.payload?.url || '';
                textContent = `${textContent}\n${attTitle} ${attUrl}`.trim();
              } else {
                mediaType = 'text';
                textContent = `${textContent}\n[Anexo ${attType}]`.trim();
              }
            }

            if (!textContent && mediaType === 'text') continue;

            await processIncomingMessage({
              companyId: instance.company_id,
              unitId: instance.unit_id,
              instanceId: instance.id,
              contactPsid,
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
  const { companyId, unitId, instanceId, contactPsid, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe } = params;

  // 1. Encontrar ou criar o contato usando o IGSID (Messenger Scoped ID) no campo whatsapp_lid
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('whatsapp_lid', contactPsid)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    let profileName = `Messenger User (${contactPsid})`;
    let profilePic = null;

    try {
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('oficial_access_token')
        .eq('id', instanceId)
        .single();

      if (instance?.oficial_access_token) {
        const profileRes = await fetch(`https://graph.facebook.com/v20.0/${contactPsid}?fields=name,profile_pic&access_token=${instance.oficial_access_token}`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.name) profileName = profileData.name;
          if (profileData.profile_pic) profilePic = profileData.profile_pic;
        }
      }
    } catch (e) {
      console.error('[Messenger Webhook] Erro ao buscar perfil:', e);
    }

    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: companyId,
        unit_id: unitId,
        name: profileName,
        profile_picture_url: profilePic,
        phone: contactPsid, // Necessário colocar algo no phone para evitar restrições
        whatsapp_lid: contactPsid,
        source: 'Messenger'
      })
      .select('id')
      .single();

    if (contactError) {
      console.error('[Messenger Webhook] Erro ao criar contato:', contactError);
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
        channel: 'messenger'
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[Messenger Webhook] Erro ao criar conversa:', convError);
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
    console.error('[Messenger Webhook] Erro ao inserir mensagem:', msgError);
    return;
  }

  // Se não for do dono da página, enqueue para IA se necessário
  if (!isFromMe && (activeConv?.status === 'waiting' || !activeConv?.assigned_agent_id)) {
    await enqueueAiMessage(msgData.id, companyId, conversationId);
  }
}
