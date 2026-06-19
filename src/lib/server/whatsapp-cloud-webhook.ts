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
              mediaType = 'interactive_response';
            } else if (messageType === 'image') {
              mediaType = 'image';
              textContent = message.image?.caption || '🖼️ Imagem';
              metaMediaId = message.image?.id;
            } else if (messageType === 'audio') {
              mediaType = 'audio';
              textContent = '🎵 Áudio';
              metaMediaId = message.audio?.id;
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
              textContent = '🧩 Figurinhas (Sticker)';
              metaMediaId = message.sticker?.id;
            } else {
              textContent = `[Mensagem não suportada: ${messageType}]`;
            }

            // Ignorar mensagens vazias se não for mídia
            if (!textContent && mediaType === 'text') continue;

            if (metaMediaId && instance.oficial_access_token) {
              mediaUrl = await downloadCloudMedia(metaMediaId, instance.oficial_access_token, instance.company_id);
            }
            
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
              isFromMe
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
    .eq('remote_message_id', wamid);

  if (error) {
    console.error(`[Whatsapp Cloud] Falha ao atualizar status da msg ${wamid}:`, error);
  }
}

async function processIncomingMessage(params: any) {
  const { companyId, instanceId, contactPhone, contactName, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe } = params;

  // 1. Encontrar ou criar o contato
  const phoneWithoutPlus = contactPhone.replace('+', '');
  
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, assigned_agent_id, unit_id')
    .eq('company_id', companyId)
    .eq('phone', phoneWithoutPlus)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: companyId,
        name: contactName,
        phone: phoneWithoutPlus,
        whatsapp_lid: phoneWithoutPlus
      })
      .select('id, assigned_agent_id, unit_id')
      .single();

    if (contactError) {
      console.error('[Whatsapp Cloud] Erro ao criar contato:', contactError);
      return;
    }
    contact = newContact;
  }

  // 2. Encontrar conversa ativa
  let { data: activeConv } = await supabaseAdmin
    .from('conversations')
    .select('id, status')
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
    .eq('remote_message_id', messageId)
    .maybeSingle();

  if (existingMsg) return; // Mensagem duplicada ignorada

  // 4. Inserir mensagem
  const { data: msgData, error: msgError } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'contact',
      content: textContent || '',
      media_type: mediaType,
      media_url: mediaUrl, // Vamos precisar converter isso de ID pra URL real dps
      remote_message_id: messageId,
      created_at: new Date(timestamp).toISOString()
    })
    .select('id')
    .single();

  if (msgError) {
    console.error('[Whatsapp Cloud] Erro ao inserir mensagem:', msgError);
    return;
  }

  // Se o contato já for atendido por IA, enfileirar (Se for waiting, a cron/AI processa)
  if (activeConv?.status === 'waiting' || !contact.assigned_agent_id) {
    await enqueueAiMessage(msgData.id, companyId, conversationId);
  }
}
