import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { enqueueAiMessage } from './ai-queue';
import { v4 as uuidv4 } from 'uuid';

export async function handleWhatsappCloudWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. Verificação do Webhook (GET request da Meta)
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      // Verifica se existe alguma instância com esse verify_token no banco
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id')
        .eq('oficial_verify_token', token)
        .limit(1)
        .maybeSingle();

      if (instance) {
        console.log(`[Whatsapp Cloud] Webhook verificado com sucesso para a instância ${instance.id}`);
        // A Meta exige que retorne APENAS o challenge como texto puro (ou numero), status 200
        return new Response(challenge, { status: 200 });
      } else {
        console.log(`[Whatsapp Cloud] Falha na verificação: verify_token '${token}' não encontrado.`);
        return new Response('Forbidden', { status: 403 });
      }
    }
    return new Response('Invalid request', { status: 400 });
  }

  // 2. Recebimento de mensagens (POST request)
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      
      // Responde com 200 imediatamente para a Meta (exigido) e processa em background se não for Edge Runtime
      // Em Vercel Edge Runtime, talvez precisemos usar waitUntil() ou await. Vamos aguardar pra não derrubar.
      await processWhatsappCloudWebhookBody(body);
      
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('[Whatsapp Cloud] Erro no parsing do webhook POST:', err);
      return new Response('ERROR', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processWhatsappCloudWebhookBody(body: any): Promise<void> {
  // Apenas processa webhooks do WhatsApp
  if (body.object !== 'whatsapp_business_account') return;

  if (body.entry && body.entry.length > 0) {
    for (const entry of body.entry) {
      const changes = entry.changes;
      if (!changes || changes.length === 0) continue;

      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const metadata = value.metadata;
        if (!metadata || !metadata.phone_number_id) continue;

        const phoneNumberId = metadata.phone_number_id;

        // Buscar instância no banco usando o phone_number_id
        const { data: instance } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, company_id, name, oficial_access_token')
          .eq('oficial_phone_number_id', phoneNumberId)
          .limit(1)
          .maybeSingle();

        if (!instance) {
          console.log(`[Whatsapp Cloud] Recebido webhook para phoneNumberId ${phoneNumberId}, mas nenhuma instância foi encontrada.`);
          continue;
        }

        // Processar Atualizações de Status da Mensagem
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await handleMessageStatus(status, instance.id);
          }
        }

        // Processar Erros de Sistema/Conta
        if (value.errors && value.errors.length > 0) {
          for (const errorObj of value.errors) {
            console.error(`[Whatsapp Cloud] Erro recebido da Meta para a instância ${instance.name} (${phoneNumberId}):`, {
              code: errorObj.code,
              title: errorObj.title,
              message: errorObj.message,
              details: errorObj.error_data?.details
            });
            // Dependendo do código do erro (ex: banimento), você poderia atualizar o status da instância aqui.
          }
        }

        // Processar Novas Mensagens
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            // Se for mensagem de sistema ou enviada pelo proprio business mas sem ID que fomos nós (menos comum na API Oficial receber as próprias msgs assim sem ser echo, mas tratamos)
            const isFromMe = false; // Na Meta Cloud, as mensagens vindas aqui são do cliente
            const contactPhone = message.from; 
            const messageId = message.id;
            const timestamp = parseInt(message.timestamp) * 1000;
            const messageType = message.type;
            
            let contactName = 'Desconhecido';
            // Tenta pegar o nome pelo profile no webhook
            if (value.contacts && value.contacts.length > 0) {
              const contactMatch = value.contacts.find((c: any) => c.wa_id === contactPhone);
              if (contactMatch && contactMatch.profile && contactMatch.profile.name) {
                contactName = contactMatch.profile.name;
              }
            }

            let textContent = '';
            let mediaType = 'text';
            let mediaUrl = null;
            let metaMediaId = null;
            let interactiveData = null;
            let audioData = null;
            let stickerData = null;
            let systemData = null;

            if (messageType === 'text') {
              textContent = message.text?.body || '';
            } else if (messageType === 'button') {
              textContent = message.button?.text || '';
              mediaType = 'button_response';
            } else if (messageType === 'interactive') {
              const intType = message.interactive?.type;
              if (intType === 'button_reply') {
                textContent = message.interactive?.button_reply?.title || '';
              } else if (intType === 'list_reply') {
                textContent = message.interactive?.list_reply?.title || '';
              }
              interactiveData = message.interactive;
              mediaType = 'interactive_response';
            } else if (messageType === 'image') {
              mediaType = 'image';
              textContent = message.image?.caption || '🖼️ Imagem';
              metaMediaId = message.image?.id;
            } else if (messageType === 'audio') {
              mediaType = 'audio';
              const isVoice = message.audio?.voice === true;
              textContent = isVoice ? '🎤 Mensagem de Voz' : '🎵 Arquivo de Áudio';
              metaMediaId = message.audio?.id;
              audioData = message.audio;
            } else if (messageType === 'video') {
              mediaType = 'video';
              textContent = '📹 Vídeo';
              metaMediaId = message.video?.id;
            } else if (messageType === 'document') {
              mediaType = 'document';
              textContent = message.document?.filename || '📄 Documento';
              metaMediaId = message.document?.id;
            } else if (messageType === 'sticker') {
              mediaType = 'sticker';
              const isAnimated = message.sticker?.animated === true;
              textContent = isAnimated ? '🧩 Figurinha Animada' : '🧩 Figurinha';
              metaMediaId = message.sticker?.id;
              stickerData = message.sticker;
            } else if (messageType === 'system') {
              mediaType = 'system';
              textContent = message.system?.body || '⚠️ Mensagem de Sistema';
              systemData = message.system;
            } else {
              textContent = `[Mensagem não suportada: ${messageType}]`;
            }

            // Ignorar mensagens vazias se não for mídia
            if (!textContent && mediaType === 'text') continue;

            if (metaMediaId && instance.oficial_access_token) {
              mediaUrl = await downloadCloudMedia(metaMediaId, instance.oficial_access_token, instance.company_id);
            }
            
            const messageContext = message.context;
            const messageReferral = message.referral;

            // Lógica de Contato e Conversa 
            await processIncomingMessage({
              companyId: instance.company_id,
              instanceId: instance.id,
              contactPhone,
              contactName,
              messageId,
              textContent,
              mediaType,
              mediaUrl,
              timestamp,
              isFromMe,
              messageContext,
              messageReferral,
              interactiveData,
              audioData,
              stickerData,
              systemData
            });
          }
        }
      }
    }
  }
}

async function downloadCloudMedia(mediaId: string, accessToken: string, companyId: string): Promise<string | null> {
  try {
    // 1. Get media URL
    const res = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();
    
    if (!data.url) {
      console.error('[Whatsapp Cloud] Erro ao obter URL da midia:', data);
      return null;
    }

    // 2. Download binary data
    const mediaRes = await fetch(data.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const buffer = await mediaRes.arrayBuffer();
    const mimeType = data.mime_type || mediaRes.headers.get('content-type') || 'application/octet-stream';
    
    // Extensão baseada no mimetype (simplificado)
    let ext = 'bin';
    if (mimeType.includes('jpeg')) ext = 'jpg';
    else if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('ogg') || mimeType.includes('audio')) ext = 'ogg';
    else if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('pdf')) ext = 'pdf';

    const filename = `${companyId}/${mediaId}_${Date.now()}.${ext}`;

    // 3. Upload to Supabase Storage (bucket 'chat_media')
    const { data: uploadData, error: uploadErr } = await supabaseAdmin
      .storage
      .from('chat_media')
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadErr) {
      console.error('[Whatsapp Cloud] Erro no upload para o storage:', uploadErr);
      return null;
    }

    // 4. Retornar URL pública
    const { data: publicUrlData } = supabaseAdmin
      .storage
      .from('chat_media')
      .getPublicUrl(filename);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('[Whatsapp Cloud] Exceção ao baixar mídia:', err);
    return null;
  }
}

async function handleMessageStatus(statusPayload: any, instanceId: string) {
  const wamid = statusPayload.id;
  const statusString = statusPayload.status; // 'sent', 'delivered', 'read', 'failed'
  
  // Atualizamos o metadata ou read_at dependendo do status. A tabela messages não possui coluna 'status'.
  const updateData: any = {};
  if (statusString === 'read') {
    updateData.read_at = new Date().toISOString();
  }
  
  // Opcional: salvar o status exato no metadata
  // updateData.metadata = { delivery_status: newStatus };

  const { error } = await supabaseAdmin
    .from('messages')
    .update(updateData)
    .eq('remote_msg_id', wamid);

  if (error) {
    console.error(`[Whatsapp Cloud] Falha ao atualizar status da msg ${wamid}:`, error);
  }
}

async function processIncomingMessage(params: any) {
  const { companyId, instanceId, contactPhone, contactName, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe, messageContext, messageReferral, interactiveData, audioData, stickerData, systemData } = params;

  // 1. Encontrar ou criar o contato
  const phoneWithoutPlus = contactPhone.replace('+', '');
  
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, unit_id')
    .eq('company_id', companyId)
    .eq('phone', phoneWithoutPlus)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    let source = null;
    let sourceDetails = null;

    if (messageReferral && messageReferral.source_url) {
      source = messageReferral.source_url.includes('ig.me') || messageReferral.source_url.includes('instagram') ? 'Instagram Ads' : 'Facebook Ads';
      sourceDetails = messageReferral.headline || messageReferral.body || messageReferral.source_id;
    }

    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: companyId,
        name: contactName,
        phone: phoneWithoutPlus,
        whatsapp_lid: phoneWithoutPlus,
        source: source,
        source_details: sourceDetails
      })
      .select('id, unit_id')
      .single();

    if (contactError) {
      console.error('[Whatsapp Cloud] Erro ao criar contato:', contactError);
      return;
    }
    contact = newContact;
  }

  // 1.5 Processar Mudança de Número de Telefone
  if (systemData && systemData.type === 'user_changed_number' && systemData.wa_id) {
    const newPhone = systemData.wa_id.replace('+', '');
    const { error: updateError } = await supabaseAdmin
      .from('contacts')
      .update({ phone: newPhone, whatsapp_lid: newPhone })
      .eq('id', contact.id);
      
    if (updateError) {
      console.error(`[Whatsapp Cloud] Falha ao atualizar o número de telefone de ${contactPhone} para ${newPhone}:`, updateError);
    } else {
      console.log(`[Whatsapp Cloud] Número do contato ${contact.id} atualizado de ${contactPhone} para ${newPhone}.`);
    }
  }

  // 2. Encontrar conversa ativa
  let { data: activeConv } = await supabaseAdmin
    .from('conversations')
    .select('id, status, assigned_agent_id')
    .eq('contact_id', contact.id)
    .in('status', ['waiting', 'active'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId;

  if (activeConv) {
    conversationId = activeConv.id;
    // Atualiza a conversa
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_content: textContent?.substring(0, 50)
      })
      .eq('id', conversationId);
  } else {
    // Cria nova conversa
    const { data: newConv, error: convError } = await supabaseAdmin
      .from('conversations')
      .insert({
        company_id: companyId,
        contact_id: contact.id,
        whatsapp_instance_id: instanceId,
        unit_id: contact.unit_id,
        status: 'waiting',
        started_at: new Date(timestamp).toISOString(),
        last_message_at: new Date(timestamp).toISOString(),
        last_message_content: textContent?.substring(0, 50),
        channel: 'whatsapp'
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[Whatsapp Cloud] Erro ao criar conversa:', convError);
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

  if (existingMsg) return; // Mensagem duplicada ignorada

  // 4. Resolver quoted message se existir context.id
  let quotedMessageId = null;
  if (messageContext && messageContext.id) {
    const { data: quotedMsg } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('remote_msg_id', messageContext.id)
      .maybeSingle();
    if (quotedMsg) {
      quotedMessageId = quotedMsg.id;
    }
  }

  // 5. Preparar Metadata
  let metadata: any = {};
  if (messageContext && messageContext.referred_product) {
    metadata.referred_product = messageContext.referred_product;
  }
  if (messageContext && (messageContext.forwarded || messageContext.frequently_forwarded)) {
    metadata.is_forwarded = true;
    metadata.frequently_forwarded = messageContext.frequently_forwarded || false;
  }
  if (messageReferral) {
    metadata.referral = messageReferral;
  }
  if (interactiveData) {
    metadata.interactive_response = interactiveData;
  }
  if (audioData && audioData.voice === true) {
    metadata.is_voice_note = true;
  }
  if (stickerData && stickerData.animated === true) {
    metadata.is_animated = true;
  }

  // 6. Inserir mensagem
  const { data: msgData, error: msgError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'contact',
      content: textContent || '',
      media_type: mediaType,
      media_url: mediaUrl,
      remote_msg_id: messageId,
      quoted_message_id: quotedMessageId,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      created_at: new Date(timestamp).toISOString()
    })
    .select('id')
    .single();

  if (msgError) {
    console.error('[Whatsapp Cloud] Erro ao inserir mensagem:', msgError);
    return;
  }

  // Se o contato já for atendido por IA, enfileirar (Se for waiting, a cron/AI processa)
  if (activeConv?.status === 'waiting' || !activeConv?.assigned_agent_id) {
    await enqueueAiMessage(msgData.id, companyId, conversationId);
  }
}
