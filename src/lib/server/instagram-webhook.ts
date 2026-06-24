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
  if (body.object === 'instagram' || body.object === 'page') {
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        const accountId = entry.id; // Pode ser IG Account ID ou Facebook Page ID

        // Buscar a instância correspondente (checando tanto o ID do Instagram quanto o da Página)
        const { data: instance } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, company_id, unit_id, provider, oficial_phone_number_id, oficial_waba_id')
          .eq('provider', 'instagram')
          .or(`oficial_phone_number_id.eq.${accountId},oficial_waba_id.eq.${accountId}`)
          .limit(1)
          .maybeSingle();

        if (!instance) {
          console.log(`[Instagram Webhook] Instância não encontrada para a conta: ${accountId}`);
          continue;
        }

        const instagramAccountId = instance.oficial_phone_number_id;

        for (const webhookEvent of entry.messaging || []) {
          const senderId = webhookEvent.sender?.id;
          const recipientId = webhookEvent.recipient?.id;
          const timestamp = webhookEvent.timestamp;

          if (!senderId || !recipientId) continue;

          // Se for is_echo ou o remetente for a própria conta IG ou Página, foi enviado por nós
          const isFromMe = webhookEvent.message?.is_echo || senderId === instagramAccountId || senderId === accountId;
          const contactIgsid = isFromMe ? recipientId : senderId;

          if (webhookEvent.reaction) {
            await updateMessageReaction(webhookEvent.reaction.mid, webhookEvent.reaction.action, webhookEvent.reaction.emoji);
            continue;
          }

          if (webhookEvent.read) {
            await updateMessageReadStatus(webhookEvent.read.mid, timestamp);
            continue;
          }

          let messageId = null;
          let textContent = '';
          let mediaType = 'text';
          let mediaUrl = null;
          let isDeleted = false;
          let quotedMessageId = null;

          if (webhookEvent.postback) {
            messageId = webhookEvent.postback.mid || `pb_${timestamp}`;
            textContent = webhookEvent.postback.title || webhookEvent.postback.payload || 'Opção selecionada';
          } else if (webhookEvent.referral) {
            messageId = `ref_${timestamp}`;
            textContent = `[Referência] ${webhookEvent.referral.source}: ${webhookEvent.referral.ref || webhookEvent.referral.ad_id}`;
          } else if (webhookEvent.message) {
            messageId = webhookEvent.message.mid;
            textContent = webhookEvent.message.text || '';
            isDeleted = webhookEvent.message.is_deleted || false;
            
            if (webhookEvent.message.reply_to) {
              quotedMessageId = webhookEvent.message.reply_to.mid;
            }

            if (webhookEvent.message.is_unsupported) {
              textContent = "⚠️ Mensagem não suportada pelo Instagram";
              mediaType = 'text';
            } else if (isDeleted) {
              textContent = "🚫 Mensagem apagada";
              mediaType = 'text';
            } else if (webhookEvent.message.attachments && webhookEvent.message.attachments.length > 0) {
              const attachment = webhookEvent.message.attachments[0];
              const attType = attachment.type;
              mediaUrl = attachment.payload?.url;

              if (['image', 'sticker'].includes(attType)) {
                mediaType = 'image';
              } else if (attType === 'story_mention') {
                mediaType = 'image';
                const mentionText = isFromMe ? "✨ Você mencionou o contato em um story" : "✨ Mencionou você em um story";
                textContent = mentionText + (textContent ? `\n\n${textContent}` : '');
              } else if (attType === 'ephemeral') {
                mediaType = 'text';
                textContent = "📷 Mídia temporária (visualização única)";
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
          }

          if (!messageId) continue;
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
            isFromMe,
            isDeleted,
            quotedMessageId
          });
        }
      }
    }
  }
}

async function processIncomingMessage(params: any) {
  const { companyId, unitId, instanceId, contactIgsid, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe, isDeleted, quotedMessageId } = params;

  // 1. Encontrar ou criar o contato usando o IGSID (Instagram Scoped ID) no campo whatsapp_lid
  let { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, name, merged_into_id')
    .eq('company_id', companyId)
    .eq('whatsapp_lid', contactIgsid)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    let profileName = `Instagram User (${contactIgsid})`;
    let profilePic = null;
    let profileUsername = null;

    try {
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('oficial_access_token')
        .eq('id', instanceId)
        .single();

      if (instance?.oficial_access_token) {
        const isDirectToken = instance.oficial_access_token.startsWith('IGA');
        const endpoint = isDirectToken
          ? `https://graph.instagram.com/v20.0/${contactIgsid}?fields=name,username,profile_pic&access_token=${instance.oficial_access_token}`
          : `https://graph.facebook.com/v20.0/${contactIgsid}?fields=name,profile_pic&access_token=${instance.oficial_access_token}`;

        const profileRes = await fetch(endpoint);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (isDirectToken) {
            if (profileData.name || profileData.username) profileName = profileData.name || profileData.username;
            if (profileData.profile_pic) profilePic = profileData.profile_pic;
            if (profileData.username) profileUsername = profileData.username;
          } else {
            if (profileData.name) profileName = profileData.name;
            if (profileData.profile_pic) profilePic = profileData.profile_pic;
          }
        }
      }
    } catch (e) {
      console.error('[Instagram Webhook] Erro ao buscar perfil:', e);
    }

    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: companyId,
        unit_id: unitId,
        name: profileName,
        profile_picture_url: profilePic,
        instagram_username: profileUsername,
        instagram_id: contactIgsid,
        source: 'Instagram'
      })
      .select('id')
      .single();

    if (contactError) {
      console.error('[Instagram Webhook] Erro ao criar contato:', contactError);
      return;
    }
    contact = { ...newContact, name: profileName };
  } else if (contact.name && contact.name.startsWith('Instagram User (')) {
    // Tenta atualizar o nome genérico se ele mandar mensagem novamente
    try {
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('oficial_access_token')
        .eq('id', instanceId)
        .single();

      if (instance?.oficial_access_token) {
        const isDirectToken = instance.oficial_access_token.startsWith('IGA');
        const endpoint = isDirectToken
          ? `https://graph.instagram.com/v20.0/${contactIgsid}?fields=name,username,profile_pic&access_token=${instance.oficial_access_token}`
          : `https://graph.facebook.com/v20.0/${contactIgsid}?fields=name,profile_pic&access_token=${instance.oficial_access_token}`;

        const profileRes = await fetch(endpoint);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          let newName = contact.name;
          let newPic = null;

          if (isDirectToken) {
            if (profileData.name || profileData.username) newName = profileData.name || profileData.username;
            if (profileData.profile_pic) newPic = profileData.profile_pic;
          } else {
            if (profileData.name) newName = profileData.name;
            if (profileData.profile_pic) newPic = profileData.profile_pic;
          }

          if (newName !== contact.name) {
            await supabaseAdmin.from('contacts').update({ name: newName, profile_picture_url: newPic }).eq('id', contact.id);
            contact.name = newName;
          }
        }
      }
    } catch (e) {
      console.error('[Instagram Webhook] Erro ao atualizar perfil genérico:', e);
    }
  }

  // Se o contato estiver mesclado, usar o ID do contato pai
  if (contact.merged_into_id) {
    contact.id = contact.merged_into_id;
  }

  // 2. Encontrar conversa ativa na mesma instância (por contact_id ou remote_id)
  let { data: activeConv } = await supabaseAdmin
    .from('conversations')
    .select('id, status, assigned_agent_id, contact_id, ai_active')
    .eq('whatsapp_instance_id', instanceId)
    .or(`contact_id.eq.${contact.id},remote_id.eq.${contactIgsid}`)
    .in('status', ['waiting', 'active'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeConv) {
    // Se não tem conversa ativa, verifica se tem alguma resolvida com esse remote_id para herdar o contact_id correto (mesclado)
    let { data: resolvedConv } = await supabaseAdmin
      .from('conversations')
      .select('contact_id')
      .eq('whatsapp_instance_id', instanceId)
      .eq('remote_id', contactIgsid)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (resolvedConv && resolvedConv.contact_id !== contact.id) {
      contact.id = resolvedConv.contact_id;
    }
  } else if (activeConv.contact_id !== contact.id) {
    // Se encontrou conversa ativa pelo remote_id e o contact_id for diferente, usar o contact_id da conversa original!
    contact.id = activeConv.contact_id;
  }

  let conversationId;
  let aiActive = false;

  if (activeConv) {
    conversationId = activeConv.id;
    aiActive = activeConv.ai_active ?? false;
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50),
        remote_id: contactIgsid
      })
      .eq('id', conversationId);
  } else {
    // Busca se existe uma conversa resolvida para reaproveitar (manter histórico da IA)
    let { data: resolvedConv } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, assigned_agent_id, ai_active')
      .eq('contact_id', contact.id)
      .eq('whatsapp_instance_id', instanceId)
      .eq('status', 'resolved')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check for default AI agent
    const { data: defaultAgents } = await supabaseAdmin
      .from('ai_agents')
      .select('id, is_main_agent, active_by_default, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('is_main_agent', true)
      .limit(1);
    
    const defaultAgentId = defaultAgents && defaultAgents.length > 0 ? defaultAgents[0].id : null;
    const defaultAgentName = defaultAgents && defaultAgents.length > 0 ? defaultAgents[0].name : 'IA';
    const isActiveByDefault = defaultAgents && defaultAgents.length > 0 ? defaultAgents[0].active_by_default : false;
    
    if (resolvedConv) {
      conversationId = resolvedConv.id;
      aiActive = isActiveByDefault || (resolvedConv.ai_active ?? false);
      
      const updatePayload: any = {
        status: isFromMe ? 'resolved' : (isActiveByDefault ? 'active' : 'waiting'),
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50),
        remote_id: contactIgsid,
        resolved_at: isFromMe ? new Date(timestamp).toISOString() : null,
        ai_active: aiActive,
        ai_followup_count: 0
      };
      if (aiActive && defaultAgentId) updatePayload.ai_agent_id = defaultAgentId;

      await supabaseAdmin.from('conversations')
        .update(updatePayload)
        .eq('id', conversationId);
    } else {
      if (isActiveByDefault) aiActive = true;
      // Cria nova conversa
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({
          contact_id: contact.id,
          remote_id: contactIgsid,
          whatsapp_instance_id: instanceId,
          unit_id: unitId,
          status: isFromMe ? 'resolved' : (isActiveByDefault ? 'active' : 'waiting'),
          started_at: new Date(timestamp).toISOString(),
          last_message_at: new Date(timestamp).toISOString(),
          last_message_preview: textContent?.substring(0, 50),
          channel: 'instagram',
          ai_active: isActiveByDefault,
          ai_agent_id: defaultAgentId
        })
        .select('id')
        .single();

      if (convError) {
        console.error('[Instagram Webhook] Erro ao criar conversa:', convError);
        return;
      }
      conversationId = newConv.id;
    }
  }

  // Abre um novo ticket (sessão) se não for resolvido já na criação
  if (!isFromMe) {
    let sessionId = null;
    let { data: existingSession } = await supabaseAdmin.from('conversation_sessions').select('id').eq('conversation_id', conversationId).is('resolved_at', null).maybeSingle();
    
    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const { data: newSession, error: sessionErr } = await supabaseAdmin.from('conversation_sessions').insert({
        conversation_id: conversationId,
        contact_id: contact.id,
        whatsapp_instance_id: instanceId,
        started_at: new Date(timestamp).toISOString()
      }).select().single();
      
      if (sessionErr) {
        if (sessionErr.code === '23505') {
          const { data: concSession } = await supabaseAdmin.from('conversation_sessions').select('id').eq('conversation_id', conversationId).is('resolved_at', null).maybeSingle();
          if (concSession) sessionId = concSession.id;
          existingSession = concSession;
        } else {
          console.error('[Instagram Webhook] Erro ao criar sessão:', sessionErr);
        }
      } else if (newSession) {
        sessionId = newSession.id;
        await supabaseAdmin.from('conversations').update({ current_session_id: sessionId }).eq('id', conversationId);
      }
    }

    if (sessionId && !existingSession) {
      const events: any[] = [{ session_id: sessionId, event_type: 'started' }];
      if (aiActive) {
        events.push({ session_id: sessionId, event_type: 'assigned', metadata: { by_ai: true, ai_agent_name: 'IA' } });
      }
      await supabaseAdmin.from('session_events').insert(events);
    }
  }

  // 3. Verifica se a mensagem já existe
  const { data: existingMsg } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('remote_msg_id', messageId)
    .maybeSingle();

  if (existingMsg) return; // Duplicada

  // 3.5 Resolver UUID da mensagem citada (pois o webhook manda o mid remoto)
  let internalQuotedId = null;
  let quotedContent = null;
  if (quotedMessageId) {
    const { data: qMsg } = await supabaseAdmin
      .from('messages')
      .select('id, content, media_type')
      .eq('remote_msg_id', quotedMessageId)
      .maybeSingle();
      
    if (qMsg) {
      internalQuotedId = qMsg.id;
      quotedContent = qMsg.content ? qMsg.content.substring(0, 200) : `[${qMsg.media_type || 'Mídia'}]`;
    }
  }

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
      quoted_message_id: internalQuotedId,
      quoted_content: quotedContent,
      is_deleted: isDeleted,
      created_at: new Date(timestamp).toISOString()
    })
    .select('id')
    .single();

  if (msgError) {
    console.error('[Instagram Webhook] Erro ao inserir mensagem:', msgError);
    return;
  }

  // Se não for do dono da página, enqueue para IA se necessário
  if (!isFromMe && aiActive) {
    await enqueueAiMessage(conversationId, msgData.id, companyId);
  }
}

async function updateMessageReaction(messageId: string, action: string, emoji?: string) {
  try {
    const { data: msg } = await supabaseAdmin.from('messages').select('id, reactions').eq('remote_msg_id', messageId).maybeSingle();
    if (!msg) return;
    
    let reactions: Record<string, number> = msg.reactions || {};
    if (action === 'react' && emoji) {
      reactions[emoji] = (reactions[emoji] || 0) + 1;
    } else if (action === 'unreact' && emoji) {
      if (reactions[emoji]) reactions[emoji] -= 1;
      if (reactions[emoji] <= 0) delete reactions[emoji];
    }
    
    await supabaseAdmin.from('messages').update({ reactions }).eq('id', msg.id);
  } catch (e) {
    console.error('[Instagram Webhook] Erro ao atualizar reação:', e);
  }
}

async function updateMessageReadStatus(messageId: string, timestamp: number) {
  try {
    await supabaseAdmin.from('messages')
      .update({ read_at: new Date(timestamp).toISOString() })
      .eq('remote_msg_id', messageId);
  } catch (e) {
    console.error('[Instagram Webhook] Erro ao atualizar status de leitura:', e);
  }
}
