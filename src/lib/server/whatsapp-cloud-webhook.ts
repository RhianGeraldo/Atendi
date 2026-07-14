import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { enqueueAiMessage } from './ai-queue';
import { syncCloudTemplates } from './whatsapp-cloud-api';
import { v4 as uuidv4 } from 'uuid';
import { getPhoneVariants } from '@/lib/utils';
import { assignTrafficLeadRoundRobin } from './routing';

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

        // Processar Webhooks de Templates (Eventos a nível de WABA, não possuem metadata.phone_number_id)
        if (
          change.field === 'message_template_components_update' ||
          change.field === 'message_template_status_update' ||
          change.field === 'message_template_quality_update' ||
          change.field === 'template_category_update'
        ) {
          await handleTemplateWebhook(entry.id);
          continue;
        }

        // Processar Webhooks de Alertas da Conta (WABA-level)
        if (change.field === 'account_alerts') {
          await handleAccountAlertWebhook(entry.id, value);
          continue;
        }

        // Processar Webhooks de Revisão da Conta (WABA-level)
        if (change.field === 'account_review_update') {
          await handleAccountReviewWebhook(entry.id, value);
          continue;
        }

        // Processar Webhooks de Atualizações Gerais da Conta (WABA-level)
        if (change.field === 'account_update') {
          await handleAccountUpdateWebhook(entry.id, value);
          continue;
        }

        // Processar Webhooks de Nome de Telefone (WABA-level mas atrelado a um numero)
        if (change.field === 'phone_number_name_update') {
          await handlePhoneNumberNameWebhook(entry.id, value);
          continue;
        }

        // Processar Webhooks de Qualidade/Limites do Telefone (WABA-level)
        if (change.field === 'phone_number_quality_update') {
          await handlePhoneNumberQualityWebhook(entry.id, value);
          continue;
        }

        const metadata = value.metadata;
        if (!metadata || !metadata.phone_number_id) continue;

        const phoneNumberId = metadata.phone_number_id;

        // Buscar instância no banco usando o phone_number_id
        const { data: instance } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, company_id, unit_id, name, oficial_access_token')
          .eq('oficial_phone_number_id', phoneNumberId)
          .limit(1)
          .maybeSingle();

        if (!instance) {
          console.log(`[Whatsapp Cloud] Recebido webhook para phoneNumberId ${phoneNumberId}, mas nenhuma instância foi encontrada.`);
          continue;
        }

        // Processar Webhooks de Sincronização de Contatos do App SMB
        if (change.field === 'smb_app_state_sync') {
          await handleStateSyncWebhook(instance.company_id, instance.unit_id, value);
          continue;
        }

        // Processar Webhooks de Preferências do Usuário (Opt-in / Opt-out de Marketing)
        if (change.field === 'user_preferences') {
          await handleUserPreferencesWebhook(instance.company_id, value);
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
            // Salvar no log da instância
            await supabaseAdmin.from('whatsapp_instances')
              .update({
                last_account_alert: {
                  code: errorObj.code,
                  title: errorObj.title,
                  message: errorObj.message,
                  details: errorObj.error_data?.details,
                  timestamp: new Date().toISOString()
                },
                last_account_update: new Date().toISOString()
              })
              .eq('id', instance.id);
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

            // Tratamento especial para edição de mensagem
            if (messageType === 'edit') {
              const originalMsgId = message.edit?.original_message_id;
              let newContent = '';
              const editMsg = message.edit?.message;
              if (editMsg) {
                if (editMsg.type === 'text') newContent = editMsg.text?.body || '';
                else if (editMsg.type === 'image') newContent = editMsg.image?.caption || '';
                else if (editMsg.type === 'video') newContent = editMsg.video?.caption || '';
                else if (editMsg.type === 'document') newContent = editMsg.document?.caption || editMsg.document?.filename || '';
              }
              
              if (originalMsgId && newContent) {
                if (!newContent.endsWith('(editado)')) newContent += ' (editado)';
                await supabaseAdmin.from('messages').update({ content: newContent }).eq('remote_msg_id', originalMsgId);
              }
              continue; // Interrompe para não inserir como nova mensagem
            }

            let textContent = '';
            let mediaType = 'text';
            let mediaUrl = null;
            let metaMediaId = null;
            let interactiveData = null;
            let audioData = null;
            let stickerData = null;
            let systemData = null;
            let contactsData = null;

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
              mediaType = 'text';
            } else if (messageType === 'image') {
              mediaType = 'image';
              textContent = message.image?.caption || '';
              metaMediaId = message.image?.id;
            } else if (messageType === 'audio') {
              mediaType = 'audio';
              textContent = '';
              metaMediaId = message.audio?.id;
              audioData = message.audio;
            } else if (messageType === 'video') {
              mediaType = 'video';
              textContent = message.video?.caption || '';
              metaMediaId = message.video?.id;
            } else if (messageType === 'document') {
              mediaType = 'document';
              textContent = message.document?.caption || message.document?.filename || '';
              metaMediaId = message.document?.id;
            } else if (messageType === 'sticker') {
              mediaType = 'image';
              textContent = '';
              metaMediaId = message.sticker?.id;
              stickerData = message.sticker;
            } else if (messageType === 'system') {
              mediaType = 'text';
              textContent = message.system?.body || '⚠️ Mensagem de Sistema';
              systemData = message.system;
            } else if (messageType === 'contacts') {
              mediaType = 'text';
              textContent = '👤 Contato(s) recebido(s)';
              const contactsList = message.contacts || [];
              const parsedContacts = [];
              for (const c of contactsList) {
                const name = c.name?.formatted_name || c.name?.first_name || null;
                const phoneObj = c.phones && c.phones.length > 0 ? c.phones[0] : null;
                const phone = phoneObj?.phone || null;
                const waid = phoneObj?.wa_id || null;
                if (name || phone || waid) {
                  parsedContacts.push({ name, phone, waid });
                }
              }
              if (parsedContacts.length > 0) {
                contactsData = parsedContacts;
              }
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
              unitId: instance.unit_id,
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
              systemData,
              contactsData
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
    const res = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
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

    // 3. Upload to Supabase Storage (bucket 'media')
    const { data: uploadData, error: uploadErr } = await supabaseAdmin
      .storage
      .from('media')
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
      .from('media')
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
  const { companyId, unitId, instanceId, contactPhone, contactName, messageId, textContent, mediaType, mediaUrl, timestamp, isFromMe, messageContext, messageReferral, interactiveData, audioData, stickerData, systemData, contactsData } = params;

  // 1. Encontrar ou criar o contato
  const phoneWithoutPlus = contactPhone.replace('+', '');
  const phoneVariants = getPhoneVariants(phoneWithoutPlus);
  
  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('id, unit_id, merged_into_id')
    .eq('company_id', companyId)
    .in('phone', phoneVariants);

  let contact = null;
  let activeConv = null;

  if (contacts && contacts.length > 0) {
    // Se encontrou contatos, tenta achar uma conversa ativa vinculada a QUALQUER um deles
    const contactIds = contacts.map(c => c.merged_into_id || c.id);
    
    const { data: convs } = await supabaseAdmin
      .from('conversations')
      .select('id, status, assigned_agent_id, contact_id, ai_active')
      .in('contact_id', contactIds)
      .eq('whatsapp_instance_id', instanceId)
      .in('status', ['waiting', 'active'])
      .order('started_at', { ascending: false })
      .limit(1);

    if (convs && convs.length > 0) {
      activeConv = convs[0];
      contact = contacts.find(c => (c.merged_into_id || c.id) === activeConv.contact_id) || contacts[0];
    } else {
      // Se não tem conversa ativa, pega o primeiro (preferencialmente o pai se mesclado)
      contact = contacts[0];
    }
    
    if (contact.merged_into_id) {
      contact.id = contact.merged_into_id;
    }
  } else {
    // Criar novo contato
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

  let conversationId;
  let aiActive = false;

  if (activeConv) {
    conversationId = activeConv.id;
    aiActive = activeConv.ai_active ?? false;
    // Atualiza a conversa
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50),
        remote_id: phoneWithoutPlus
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
    
    let targetAgentId = null;
    let targetDepartmentId = null;
    let targetStatus = 'waiting';
    let targetAiActive = false;

    if (isActiveByDefault) {
       targetAiActive = true;
       targetStatus = 'active';
    } else if (resolvedConv && resolvedConv.assigned_agent_id) {
       targetAgentId = resolvedConv.assigned_agent_id;
       targetStatus = 'waiting'; 
    }

    if (resolvedConv) {
      conversationId = resolvedConv.id;
      aiActive = targetAiActive;
      
      const updatePayload: any = {
        status: targetStatus,
        last_message_at: new Date(timestamp).toISOString(),
        last_message_preview: textContent?.substring(0, 50),
        remote_id: phoneWithoutPlus,
        resolved_at: null,
        ai_active: targetAiActive,
        ai_followup_count: 0
      };
      
      if (targetAiActive && defaultAgentId) updatePayload.ai_agent_id = defaultAgentId;
      if (targetAgentId) updatePayload.assigned_agent_id = targetAgentId;
      if (targetDepartmentId) updatePayload.department_id = targetDepartmentId;

      await supabaseAdmin.from('conversations')
        .update(updatePayload)
        .eq('id', conversationId);
    } else {
      aiActive = targetAiActive;
      // Cria nova conversa
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({
          contact_id: contact.id,
          remote_id: phoneWithoutPlus,
          whatsapp_instance_id: instanceId,
          unit_id: unitId,
          status: targetStatus,
          started_at: new Date(timestamp).toISOString(),
          last_message_at: new Date(timestamp).toISOString(),
          last_message_preview: textContent?.substring(0, 50),
          channel: 'whatsapp',
          ai_active: targetAiActive,
          ai_agent_id: targetAiActive ? defaultAgentId : null,
          assigned_agent_id: targetAgentId,
          department_id: targetDepartmentId || null
        })
        .select('id')
        .single();

      if (convError) {
        if (convError.code === '23505') {
          console.warn('[Whatsapp Cloud] Race condition detectada ao criar conversa. Buscando conversa existente.');
          const { data: racedConv } = await supabaseAdmin
            .from('conversations')
            .select('id, ai_active, ai_agent_id')
            .eq('contact_id', contact.id)
            .eq('whatsapp_instance_id', instanceId)
            .in('status', ['waiting', 'active'])
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (racedConv) {
            conversationId = racedConv.id;
            aiActive = racedConv.ai_active ?? false;
          } else {
            console.error('[Whatsapp Cloud] Erro fatal de race condition: ', convError);
            return;
          }
        } else {
          console.error('[Whatsapp Cloud] Erro ao criar conversa:', convError);
          return;
        }
      } else {
        conversationId = newConv.id;
      }
    }
  }

  // Abre um novo ticket (sessão) se não for resolvido já na criação
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
        console.error('[Whatsapp Cloud] Erro ao criar sessão:', sessionErr);
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

  // 3. Verifica se a mensagem já existe
  const { data: existingMsg } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('remote_msg_id', messageId)
    .maybeSingle();

  if (existingMsg) return; // Mensagem duplicada ignorada

  // 4. Resolver quoted message se existir context.id
  let quotedMessageId = null;
  let quotedContent = null;
  if (messageContext && messageContext.id) {
    const { data: quotedMsg } = await supabaseAdmin
      .from('messages')
      .select('id, content, media_type')
      .eq('remote_msg_id', messageContext.id)
      .maybeSingle();
    if (quotedMsg) {
      quotedMessageId = quotedMsg.id;
      quotedContent = quotedMsg.content || `[${quotedMsg.media_type}]`;
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
    const sourceId = messageReferral.source_id || messageReferral.source_url;
    let thumbUrl = messageReferral.thumbnail_url || messageReferral.image_url;

    if (sourceId && thumbUrl && thumbUrl.startsWith('http') && !thumbUrl.includes('supabase.co')) {
      try {
        const { data: existingAd } = await supabaseAdmin
          .from('ad_leads')
          .select('thumbnail_url')
          .eq('source_id', sourceId)
          .not('thumbnail_url', 'is', null)
          .limit(1)
          .maybeSingle();

        if (existingAd && existingAd.thumbnail_url && existingAd.thumbnail_url.includes('supabase.co')) {
          thumbUrl = existingAd.thumbnail_url;
          console.log(`[Whatsapp Cloud] Reusing cached ad thumbnail for sourceId: ${sourceId}`);
        } else {
          console.log(`[Whatsapp Cloud] Downloading ad thumbnail for sourceId: ${sourceId}`);
          const response = await fetch(thumbUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const ext = thumbUrl.includes('.png') ? 'png' : 'jpg';
            const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `ads/${companyId}/${safeSourceId}.${ext}`;
            
            const { error: uploadErr } = await supabaseAdmin.storage
              .from('media')
              .upload(fileName, arrayBuffer, {
                contentType: response.headers.get('content-type') || `image/${ext}`,
                upsert: true
              });
              
            if (!uploadErr) {
              const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(fileName);
              thumbUrl = publicUrlData.publicUrl;
              console.log(`[Whatsapp Cloud] Successfully cached ad thumbnail to: ${thumbUrl}`);
            } else {
              console.error('[Whatsapp Cloud] Error uploading ad thumbnail:', uploadErr);
            }
          }
        }
      } catch (e) {
        console.error('[Whatsapp Cloud] Error caching ad thumbnail:', e);
      }
    }

    metadata.externalAdReply = {
      title: messageReferral.headline,
      body: messageReferral.body,
      thumbnailURL: thumbUrl,
      sourceURL: messageReferral.source_url,
      sourceID: messageReferral.source_id,
      sourceApp: 'Meta',
      raw_referral: messageReferral
    };
    
    // Check for Ad Lead and save to ad_leads table (porting logic from evogo-webhook)
    if (sourceId && !isFromMe) {
      try {
        const { data: existingAdLead } = await supabaseAdmin
          .from('ad_leads')
          .select('id')
          .eq('contact_id', contact.id)
          .eq('source_id', sourceId)
          .maybeSingle();

        if (!existingAdLead) {
          await supabaseAdmin.from('ad_leads').insert({
            company_id: companyId,
            unit_id: unitId || null,
            contact_id: contact.id,
            ad_title: messageReferral.headline || null,
            ad_body: messageReferral.body || null,
            source_url: messageReferral.source_url || null,
            thumbnail_url: thumbUrl || null,
            source_id: sourceId,
            ctwa_clid: messageReferral.ctwa_clid || null,
            source_app: 'Meta',
            media_type: messageReferral.media_type || null,
          });
          console.log(`[Whatsapp Cloud] Registered new ad lead for contact ${contact.id} and ad ${sourceId}`);
        }
      } catch (e) {
        console.error('[Whatsapp Cloud] Failed to register ad lead:', e);
      }
    }
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
  if (systemData) {
    metadata.system = systemData;
  }
  if (contactsData) {
    metadata.contacts = contactsData;
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
      quoted_content: quotedContent,
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
  if (aiActive) {
    await enqueueAiMessage(conversationId, msgData.id, companyId);
  }
}

async function handleTemplateWebhook(wabaId: string): Promise<void> {
  // Encontra pelo menos UMA instância que use esse WABA ID
  const { data: instance } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id')
    .eq('oficial_waba_id', wabaId)
    .limit(1)
    .maybeSingle();

  if (!instance) {
    console.log(`[Whatsapp Cloud Webhook] Evento de template recebido para WABA ${wabaId}, mas não temos essa WABA configurada em nenhuma instância.`);
    return;
  }

  try {
    console.log(`[Whatsapp Cloud Webhook] Template atualizado para WABA ${wabaId}. Sincronizando via instância ${instance.id}...`);
    await syncCloudTemplates(instance.id);
    console.log(`[Whatsapp Cloud Webhook] Sincronização automática de templates concluída com sucesso.`);
  } catch (e: any) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao auto-sincronizar templates para WABA ${wabaId}:`, e.message);
  }
}

async function handleAccountAlertWebhook(wabaId: string, value: any): Promise<void> {
  if (!value || !value.alert_info) return;

  const alertInfo = value.alert_info;
  console.log(`[Whatsapp Cloud Webhook] Alerta de Conta recebido para WABA ${wabaId}:`, alertInfo.alert_type);

  // Atualiza TODAS as instâncias que pertencem a esse WABA com o último alerta
  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({ 
      last_account_alert: {
        entity_type: value.entity_type,
        entity_id: value.entity_id,
        severity: alertInfo.alert_severity,
        status: alertInfo.alert_status,
        type: alertInfo.alert_type,
        description: alertInfo.alert_description,
        received_at: new Date().toISOString()
      } 
    })
    .eq('oficial_waba_id', wabaId);

  if (error) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao salvar account_alert para WABA ${wabaId}:`, error.message);
  }
}

async function handleAccountReviewWebhook(wabaId: string, value: any): Promise<void> {
  if (!value || !value.decision) return;

  console.log(`[Whatsapp Cloud Webhook] Status de Revisão da Conta para WABA ${wabaId}:`, value.decision);

  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({ 
      waba_review_status: value.decision
    })
    .eq('oficial_waba_id', wabaId);

  if (error) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao salvar waba_review_status para WABA ${wabaId}:`, error.message);
  }
}

async function handleAccountUpdateWebhook(wabaId: string, value: any): Promise<void> {
  if (!value || !value.event) return;

  console.log(`[Whatsapp Cloud Webhook] Atualização de Conta recebida para WABA ${wabaId}:`, value.event);

  // Salva a atualização completa no JSONB
  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({ 
      last_account_update: {
        event: value.event,
        details: value,
        received_at: new Date().toISOString()
      }
    })
    .eq('oficial_waba_id', wabaId);

  if (error) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao salvar account_update para WABA ${wabaId}:`, error.message);
  }
}

async function handlePhoneNumberNameWebhook(wabaId: string, value: any): Promise<void> {
  if (!value || !value.display_phone_number) return;

  console.log(`[Whatsapp Cloud Webhook] Status do Nome para o telefone ${value.display_phone_number}:`, value.decision);

  // No banco podemos não ter o número exatamente como "+55 11...", então fazemos um like ou removemos os sinais.
  // Para ser seguro, atualizamos a instância do WABA que possuir a string do telefone nela.
  // Como o supabase não tem REPLACE nativo fácil no eq(), vamos usar ilike
  const cleanPhone = value.display_phone_number.replace(/\D/g, '');

  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({ 
      phone_name_status: value.decision,
      phone_name_rejection_reason: value.rejection_reason || null
    })
    .eq('oficial_waba_id', wabaId)
    .ilike('phone', `%${cleanPhone}%`);

  if (error) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao salvar phone_name_status para telefone ${cleanPhone}:`, error.message);
  }
}

async function handlePhoneNumberQualityWebhook(wabaId: string, value: any): Promise<void> {
  if (!value || !value.display_phone_number) return;

  const limit = value.max_daily_conversations_per_business || value.current_limit;
  console.log(`[Whatsapp Cloud Webhook] Novo limite de mensagens para o telefone ${value.display_phone_number}:`, limit);

  const cleanPhone = value.display_phone_number.replace(/\D/g, '');

  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({ 
      messaging_limit: limit
    })
    .eq('oficial_waba_id', wabaId)
    .ilike('phone', `%${cleanPhone}%`);

  if (error) {
    console.error(`[Whatsapp Cloud Webhook] Erro ao salvar messaging_limit para telefone ${cleanPhone}:`, error.message);
  }
}

async function handleStateSyncWebhook(companyId: string, unitId: string | null, value: any): Promise<void> {
  if (!value || !value.state_sync || !Array.isArray(value.state_sync)) return;

  for (const sync of value.state_sync) {
    if (sync.type === 'contact' && sync.action === 'add') {
      const contactData = sync.contact;
      if (!contactData || !contactData.phone_number) continue;

      const phone = contactData.phone_number;
      const name = contactData.full_name || contactData.first_name || 'Contato SMB';

      console.log(`[Whatsapp Cloud Webhook] Sincronizando contato SMB: ${phone} - ${name}`);

      // Tenta achar contato existente
      let { data: existingContact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();

      if (existingContact) {
        // Atualiza o nome se existir
        await supabaseAdmin
          .from('contacts')
          .update({ name: name })
          .eq('id', existingContact.id);
      } else {
        // Insere novo contato
        await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: companyId,
            unit_id: unitId,
            name: name,
            phone: phone,
            source: 'SMB App Sync'
          });
      }
    }
  }
}

async function handleUserPreferencesWebhook(companyId: string, value: any): Promise<void> {
  if (!value || !value.user_preferences || !Array.isArray(value.user_preferences)) return;

  for (const pref of value.user_preferences) {
    if (!pref.wa_id || !pref.value) continue;

    const phone = pref.wa_id;
    const isOptIn = pref.value === 'resume';

    console.log(`[Whatsapp Cloud Webhook] Preferência de Marketing para ${phone}: ${pref.value}`);

    // Atualiza o contato se ele existir
    const { error } = await supabaseAdmin
      .from('contacts')
      .update({ marketing_opt_in: isOptIn })
      .eq('company_id', companyId)
      .eq('phone', phone);

    if (error) {
      console.error(`[Whatsapp Cloud Webhook] Erro ao atualizar opt-in para ${phone}:`, error.message);
    }
  }
}
