import { supabaseAdmin } from '@/integrations/supabase/client.server';


// Called by server.ts - reads body and processes in background, returns 200 immediately
export async function handleEvogoWebhook(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    
    // In serverless environments like Vercel, we MUST await the processing
    // otherwise the function is killed the moment we return the Response.
    // The previous timeout issue was largely due to blocking fs/console logging
    // which has been removed.
    await processEvogoWebhookBody(body);
    
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook parse/process error:', err);
    return new Response('OK', { status: 200 });
  }
}

import * as fs from 'fs';

export async function processEvogoWebhookBody(body: any): Promise<void> {
  try {
    // Log webhook without base64 to avoid blocking Node.js with huge strings
    const logBody = JSON.parse(JSON.stringify(body));
    if (logBody?.data?.Message?.base64) logBody.data.Message.base64 = `[base64 ~${Math.round(logBody.data.Message.base64.length / 1024)}kB omitted]`;
    if (logBody?.data?.base64) logBody.data.base64 = `[base64 ~${Math.round(logBody.data.base64.length / 1024)}kB omitted]`;
    console.log(new Date().toISOString() + ' WEBHOOK IN: ' + JSON.stringify(logBody) + '\n');
    console.log('EvoGo Webhook received:', JSON.stringify(logBody, null, 2));
    
    // Dump to file for debugging
    try {
      fs.writeFileSync('webhook-debug.json', JSON.stringify(logBody, null, 2));
    } catch (e) {
      console.error("Failed to write webhook-debug.json", e);
    }

    // Handle message.upsert (Baileys/Evolution API format) or Message (WhatsMeow/EvoGo format)
    if (body.event === 'messages.upsert' || body.event === 'messages.update' || body.event === 'Message') {
      const instanceName = body.instance || body.instanceName;
      
      let messageData;
      let isFromMe = false;
      let remoteJid = '';
      let pushName = 'Desconhecido';
      let textContent = '';
      let phoneNumber: string | null = '';
      let mediaType = 'text';
      let mediaUrl: string | null = null;
      let remoteMsgId: string | null = null;
      let quotedStanzaId: string | null = null;
      let quotedContent: string | null = null;
      let actualGroupName: string | null = null;

      if (body.event === 'Message') {
        // WhatsMeow / EvoGo native format
        const info = body.data?.Info;
        const msg = body.data?.Message;
        
        if (!info || !msg) return;
        
        isFromMe = info.IsFromMe;
        
        const getPhone = (jids: (string | undefined)[]) => {
          const group = jids.find(j => j && j.includes('@g.us'));
          if (group) return group.split('@')[0];

          const real = jids.find(j => j && j.includes('@s.whatsapp.net'));
          if (real) return real.split('@')[0];
          
          const fallback = jids.find(j => j && j.trim() !== '');
          if (fallback) return fallback.split('@')[0];
          return null;
        };

        if (isFromMe) {
          remoteJid = info.Chat || info.RecipientAlt;
          phoneNumber = getPhone([info.Chat, info.RecipientAlt]);
        } else {
          remoteJid = info.Chat || info.Sender || info.SenderAlt;
          phoneNumber = getPhone([info.Chat, info.Sender, info.SenderAlt]);
        }
        pushName = info.PushName || 'Desconhecido';
        remoteMsgId = info.ID;
        
        if (body.data?.groupData?.Name) {
          actualGroupName = body.data.groupData.Name;
        }

        // Parse quoted messages
        if (body.data?.isQuoted && body.data?.quoted) {
          quotedStanzaId = body.data.quoted.stanzaID;
          const qm = body.data.quoted.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || 'Anexo';
        } else if (msg.extendedTextMessage?.contextInfo?.stanzaId) {
          quotedStanzaId = msg.extendedTextMessage.contextInfo.stanzaId;
          const qm = msg.extendedTextMessage.contextInfo.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || 'Anexo';
        }
        
        if (msg.conversation) {
          textContent = msg.conversation;
        } else if (msg.extendedTextMessage?.text) {
          textContent = msg.extendedTextMessage.text;
        } else if (msg.imageMessage) {
          mediaType = 'image';
          textContent = msg.imageMessage.caption || '📷 Imagem';
          // EvoGo provides decrypted base64 - prefer it over thumbnail for full quality
          if (msg.base64) {
            mediaUrl = `data:${msg.imageMessage.mimetype || 'image/jpeg'};base64,${msg.base64}`;
          } else if (msg.imageMessage.jpegThumbnail) {
            mediaUrl = `data:image/jpeg;base64,${msg.imageMessage.jpegThumbnail}`;
          }
        } else if (msg.videoMessage) {
          mediaType = 'video';
          textContent = msg.videoMessage.caption || '🎥 Vídeo';
          if (msg.videoMessage.jpegThumbnail) {
            // Show thumbnail as image preview for videos
            mediaUrl = `data:image/jpeg;base64,${msg.videoMessage.jpegThumbnail}`;
          }
        } else if (msg.audioMessage || msg.ptvMessage) {
          mediaType = 'audio';
          textContent = '🎵 Áudio';
          const audioMsg = msg.audioMessage || msg.ptvMessage;
          if (msg.base64) {
            mediaUrl = `data:${audioMsg?.mimetype || 'audio/ogg'};base64,${msg.base64}`;
          }
        } else if (msg.documentMessage) {
          mediaType = 'document';
          textContent = msg.documentMessage.fileName || '📄 Documento';
          // No preview for documents, show filename as content
        } else if (msg.stickerMessage) {
          mediaType = 'image';
          textContent = '🖼️ Figurinha';
          if (msg.base64) {
            mediaUrl = `data:${msg.stickerMessage.mimetype || 'image/webp'};base64,${msg.base64}`;
          } else if (msg.stickerMessage.jpegThumbnail) {
            mediaUrl = `data:image/jpeg;base64,${msg.stickerMessage.jpegThumbnail}`;
          }
        } else if (info.Type === 'reaction' || msg.reactionMessage) {
          const targetId = msg.reactionMessage?.key?.ID || msg.reactionMessage?.key?.id;
          const emoji = msg.reactionMessage?.text || '';
          if (targetId) {
            return await handleReaction(targetId, emoji);
          }
        } else if (msg.albumMessage) {
          // albumMessage is just an album cover notification - images arrive as separate imageMessage events
          return;
        } else if (msg.protocolMessage && (msg.protocolMessage.type === 14 || msg.protocolMessage.type === 'MESSAGE_EDIT')) {
          // It's an edited message. The original ID is in msg.protocolMessage.key.id
          const editedMsg = msg.protocolMessage.editedMessage;
          if (editedMsg) {
            textContent = editedMsg.conversation || editedMsg.extendedTextMessage?.text || '[Mensagem Editada]';
            // Optionally, we could find the original message and update it, 
            // but for now we'll just insert it as a new message indicating it was edited
            textContent = `✏️ *Editado:* ${textContent}`;
          } else {
            return; // Ignore if no content
          }
        } else if (msg.secretEncryptedMessage || (info && info.Edit === "1" && !msg.conversation && !msg.extendedTextMessage)) {
          // Evogo sends edited messages as secretEncryptedMessage if it fails to decrypt them
          // We must ignore them to prevent "[Mídia/Mensagem não suportada]" spam
          console.log('[evogo-webhook] Ignoring secretEncryptedMessage/Edit without decrypted content');
          return;
        }
        
      } else {
        // Baileys format
        const messageData = body.data?.message || body.message || body;
        isFromMe = messageData.key?.fromMe || false;
        remoteJid = messageData.key?.remoteJid || '';
        pushName = messageData.pushName || 'Desconhecido';
        
        if (remoteJid.includes('@g.us')) {
          phoneNumber = remoteJid.split('@')[0];
        } else {
          phoneNumber = remoteJid ? remoteJid.split('@')[0] : null;
        }
        remoteMsgId = messageData.key?.id || null;

        const msgType = messageData.message;
        const base64Content = body.base64 || messageData.base64;
        
        if (msgType?.extendedTextMessage?.contextInfo?.stanzaId) {
          quotedStanzaId = msgType.extendedTextMessage.contextInfo.stanzaId;
          const qm = msgType.extendedTextMessage.contextInfo.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || 'Anexo';
        }

        if (msgType) {
          if (msgType.conversation) {
            textContent = msgType.conversation;
          } else if (msgType.extendedTextMessage?.text) {
            textContent = msgType.extendedTextMessage.text;
          } else if (msgType.imageMessage) {
            mediaType = 'image';
            textContent = msgType.imageMessage.caption || '📷 Imagem';
            if (base64Content) {
              mediaUrl = `data:${msgType.imageMessage.mimetype || 'image/jpeg'};base64,${base64Content}`;
            } else if (msgType.imageMessage.jpegThumbnail) {
              mediaUrl = `data:image/jpeg;base64,${msgType.imageMessage.jpegThumbnail}`;
            }
          } else if (msgType.videoMessage) {
            mediaType = 'video';
            textContent = msgType.videoMessage.caption || '🎥 Vídeo';
            if (base64Content) {
              mediaUrl = `data:${msgType.videoMessage.mimetype || 'video/mp4'};base64,${base64Content}`;
            } else if (msgType.videoMessage.jpegThumbnail) {
              mediaUrl = `data:image/jpeg;base64,${msgType.videoMessage.jpegThumbnail}`;
            }
          } else if (msgType.audioMessage || msgType.ptvMessage) {
            mediaType = 'audio';
            textContent = '🎵 Áudio';
            if (base64Content) {
              const audioMsg = msgType.audioMessage || msgType.ptvMessage;
              mediaUrl = `data:${audioMsg.mimetype || 'audio/ogg'};base64,${base64Content}`;
            }
          } else if (msgType.documentMessage) {
            mediaType = 'document';
            textContent = msgType.documentMessage.fileName || '📄 Documento';
            if (base64Content) {
              mediaUrl = `data:${msgType.documentMessage.mimetype || 'application/pdf'};base64,${base64Content}`;
            }
          } else if (msgType.stickerMessage) {
            mediaType = 'image';
            textContent = '🖼️ Figurinha';
            if (base64Content) {
              mediaUrl = `data:${msgType.stickerMessage.mimetype || 'image/webp'};base64,${base64Content}`;
            }
          } else if (msgType.reactionMessage) {
            const targetId = msgType.reactionMessage?.key?.id || msgType.reactionMessage?.key?.ID;
            const emoji = msgType.reactionMessage?.text || '';
            if (targetId) {
              return await handleReaction(targetId, emoji);
            }
          } else if (msgType.protocolMessage && (msgType.protocolMessage.type === 14 || msgType.protocolMessage.type === 'MESSAGE_EDIT')) {
            const editedMsg = msgType.protocolMessage.editedMessage;
            if (editedMsg) {
              textContent = editedMsg.conversation || editedMsg.extendedTextMessage?.text || '[Mensagem Editada]';
              textContent = `✏️ *Editado:* ${textContent}`;
            } else {
              return;
            }
          } else if (msgType.secretEncryptedMessage) {
            console.log('[evogo-webhook] Ignoring secretEncryptedMessage/Edit without decrypted content');
            return;
          }
        }
      }

      if (!instanceName) {
        return;
      }

      if (!phoneNumber) {
        return;
      }
      
      if (!textContent) {
        textContent = '[Mídia/Mensagem não suportada]';
      }

      // Prepend participant name for group messages
      if (remoteJid.includes('@g.us') && !isFromMe) {
        textContent = `${pushName}:\n${textContent}`;
      }

      // 1. Find the instance in the DB
      const { data: instance, error: instanceErr } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, unit_id, company_id')
        .eq('instance_name', instanceName)
        .single();

      if (instanceErr || !instance) {
        console.error('Instance not found for webhook:', instanceName);
        return;
      }

      let { id: instance_id, company_id, unit_id } = instance;
      // Se não tem unit_id, significa que é da Empresa Mãe (Matriz), o que é perfeitamente válido.
      // Mantemos unit_id como null ou undefined.

      // 2. Find or create Contact
      let contactId;
      const { data: existingContacts } = await supabaseAdmin
        .from('contacts')
        .select('id, name')
        .eq('company_id', company_id)
        .eq('phone', phoneNumber)
        .limit(1);

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        
        // Update contact name
        if (remoteJid.includes('@g.us')) {
          // If it's a group and we got the actual name, update it if it differs
          if (actualGroupName && existingContacts[0].name !== actualGroupName && existingContacts[0].name === 'Grupo do WhatsApp') {
            await supabaseAdmin
              .from('contacts')
              .update({ name: actualGroupName })
              .eq('id', contactId);
          }
        }
        // Removemos a atualização automática do nome de contatos diretos (pushName)
        // para não sobrescrever o nome que o usuário digitou manualmente no CRM!
      } else {
        // Create new contact
        const groupDefaultName = actualGroupName || 'Grupo do WhatsApp';
        const { data: newContact, error: contactErr } = await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: company_id,
            unit_id: unit_id,
            name: remoteJid.includes('@g.us') ? groupDefaultName : pushName,
            phone: phoneNumber,
          })
          .select()
          .single();
          
        if (contactErr) throw contactErr;
        contactId = newContact.id;
      }

      // 3. Find latest conversation for this contact in THIS EXACT INSTANCE
      let conversationId;
      let convQuery = supabaseAdmin
        .from('conversations')
        .select('id, status')
        .eq('contact_id', contactId)
        .eq('whatsapp_instance_id', instance_id)
        .order('started_at', { ascending: false })
        .limit(1);
        
      const { data: latestConvs } = await convQuery;

      console.log(`[evogo-webhook] Lookup conversation: instance_id=${instance_id}, contact_id=${contactId}, result=${JSON.stringify(latestConvs)}`);

      if (latestConvs && latestConvs.length > 0) {
        const conv = latestConvs[0];
        
        // Se a conversa estava resolvida, cria uma NOVA em vez de reabrir
        if (conv.status === 'resolved') {
          console.log(`[evogo-webhook] Latest conversation was resolved. Creating new ticket.`);
          const { data: newConv, error: convErr } = await supabaseAdmin
            .from('conversations')
            .insert({
              unit_id: unit_id,
              whatsapp_instance_id: instance_id,
              contact_id: contactId,
              channel: 'whatsapp',
              status: isFromMe ? 'active' : 'waiting',
              last_message_at: new Date().toISOString()
            })
            .select()
            .single();

          if (convErr) throw convErr;
          conversationId = newConv.id;
        } else {
          conversationId = conv.id;
          console.log(`[evogo-webhook] Found active/waiting conversation: ${conversationId}`);
          
          const updatePayload: any = { last_message_at: new Date().toISOString() };
          await supabaseAdmin.from('conversations')
            .update(updatePayload)
            .eq('id', conversationId);
        }
      } else {
        console.log(`[evogo-webhook] No existing conversation found. Creating new one.`);
        // Create new conversation
        const { data: newConv, error: convErr } = await supabaseAdmin
          .from('conversations')
          .insert({
            unit_id: unit_id,
            whatsapp_instance_id: instance_id,
            contact_id: contactId,
            channel: 'whatsapp',
            status: isFromMe ? 'active' : 'waiting',
            last_message_at: new Date().toISOString()
          })
          .select()
          .single();

        if (convErr) throw convErr;
        conversationId = newConv.id;
      }

      // 4. Resolve quoted message internal ID
      let quotedInternalId = null;
      if (quotedStanzaId) {
        const { data: quotedMsg } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('remote_msg_id', quotedStanzaId)
          .single();
        if (quotedMsg) {
          quotedInternalId = quotedMsg.id;
        }
      }

      // 5. Dedup: skip if we already have this remote_msg_id in the DB
      // This happens when we send from the platform - the EvoGo echo webhook arrives but we already saved it
      if (remoteMsgId) {
        const { data: existingMsg } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('remote_msg_id', remoteMsgId)
          .maybeSingle();
        
        if (existingMsg) {
          // Already saved - just update conversation timestamp
          await supabaseAdmin
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId);
          return;
        }
      }

      // 6. Insert message
      let participantJid: string | null = null;
      if (isFromMe && body.data?.message?.key?.participant) {
        participantJid = body.data.message.key.participant;
      } else if (isFromMe && messageData?.key?.participant) {
        participantJid = messageData.key.participant;
      } else if (!isFromMe) {
        participantJid = remoteJid;
      }

      const insertPayload: any = {
        conversation_id: conversationId,
        sender_type: isFromMe ? 'agent' : 'contact',
        content: textContent,
        media_type: mediaType,
        media_url: mediaUrl,
        remote_msg_id: remoteMsgId,
        quoted_message_id: quotedInternalId,
        quoted_content: quotedContent,
        participant_jid: participantJid,
      };

      const { error: msgErr } = await supabaseAdmin
        .from('messages')
        .insert(insertPayload);

      if (msgErr) {
        // Fallback without new columns in case migration hasn't run yet
        console.error("Insert failed with new columns, falling back...", msgErr);
        await supabaseAdmin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_type: isFromMe ? 'agent' : 'contact',
            content: textContent,
            media_type: mediaType,
            media_url: mediaUrl,
          });
      }

      return;
    }

    // --- Handle Labels Webhooks ---
    if (body.event === 'labels.edit' || body.event === 'labels.upsert' || body.event === 'labels.update') {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;

      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('company_id')
        .eq('instance_name', instanceName)
        .single();
      
      if (!instance) return;

      const labelsData = Array.isArray(body.data) ? body.data : [body.data];
      
      for (const label of labelsData) {
        if (!label.id || !label.name) continue;
        
        // Upsert label
        await supabaseAdmin.from('labels').upsert({
          external_id: label.id,
          company_id: instance.company_id,
          name: label.name,
          color: label.color ? String(label.color) : null,
        }, { onConflict: 'company_id, external_id' }).select('id').maybeSingle();
      }
      return;
    }

    if (body.event === 'labels.association' || body.event === 'labels.add') {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;
      
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('company_id')
        .eq('instance_name', instanceName)
        .single();
        
      if (!instance) return;

      const association = body.data;
      if (!association?.labelId || !association?.number) return;
      
      const phone = association.number.split('@')[0];
      
      // 1. Find Label
      const { data: labelInfo } = await supabaseAdmin
        .from('labels')
        .select('id')
        .eq('external_id', association.labelId)
        .eq('company_id', instance.company_id)
        .maybeSingle();
        
      if (!labelInfo) return; // Label not sync'd yet
      
      // 2. Find Contact
      const { data: contactInfo } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('phone', phone)
        .eq('company_id', instance.company_id)
        .maybeSingle();
        
      if (!contactInfo) return;

      // 3. Insert association
      if (association.action === 'add' || body.event === 'labels.association') {
        await supabaseAdmin.from('contact_labels').upsert({
          contact_id: contactInfo.id,
          label_id: labelInfo.id
        }, { onConflict: 'contact_id, label_id' });
      } else if (association.action === 'remove') {
        await supabaseAdmin.from('contact_labels')
          .delete()
          .eq('contact_id', contactInfo.id)
          .eq('label_id', labelInfo.id);
      }
      
      return;
    }

    if (body.event === 'JoinedGroup') {
      const instanceName = body.instance || body.instanceName;
      const jid = body.data?.JID;
      const groupName = body.data?.Name;
      
      if (!instanceName || !jid || !groupName) return;
      
      const phoneNumber = jid.split('@')[0];
      
      // 1. Find the instance in the DB
      const { data: instance } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, company_id, unit_id')
        .eq('instance_name', instanceName)
        .single();
        
      if (!instance) return;
      
      let { id: instance_id, company_id, unit_id } = instance;
      // Se não tem unit_id, significa que é da Empresa Mãe (Matriz).
      
      // 2. Find or create Contact
      let contactId;
      const { data: existingContacts } = await supabaseAdmin
        .from('contacts')
        .select('id, name')
        .eq('company_id', company_id)
        .eq('phone', phoneNumber)
        .limit(1);

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        
        if (groupName && existingContacts[0].name !== groupName) {
          await supabaseAdmin
            .from('contacts')
            .update({ name: groupName })
            .eq('id', contactId);
        }
      } else {
        const { data: newContact, error: contactErr } = await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: company_id,
            unit_id: unit_id,
            phone: phoneNumber,
            name: groupName || 'Grupo do WhatsApp',
          })
          .select()
          .single();
          
        if (contactErr || !newContact) {
          console.error("Failed to create contact for JoinedGroup", contactErr);
          return;
        }
        contactId = newContact.id;
      }
      
      // 3. Find or create waiting conversation
      let activeConvQuery = supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('whatsapp_instance_id', instance_id)
        .in('status', ['waiting', 'active'])
        .limit(1);

      const { data: activeConvs } = await activeConvQuery;

      if (!activeConvs || activeConvs.length === 0) {
        await supabaseAdmin
          .from('conversations')
          .insert({
            unit_id: unit_id,
            whatsapp_instance_id: instance_id,
            contact_id: contactId,
            channel: 'whatsapp',
            status: 'waiting',
            last_message_at: new Date().toISOString()
          });
      }
        
      return;
    }

    return;
  } catch (err) {
    console.log(new Date().toISOString() + ' ERROR: ' + String(err) + '\n');
    console.error('Webhook error:', err);
    // Return 200 to acknowledge receipt and prevent endless retries from EvoGo
    return;
  }
}

async function handleReaction(targetRemoteId: string, emoji: string): Promise<void> {
  const { data: msg } = await supabaseAdmin
    .from('messages')
    .select('id, reactions')
    .eq('remote_msg_id', targetRemoteId)
    .single();

  if (!msg) {
    return;
  }

  // No WhatsApp 1:1, cada mensagem só tem no máximo 1 reação.
  // Então podemos simplesmente substituir o objeto inteiro.
  const reactions = emoji ? { [emoji]: 1 } : {};

  await supabaseAdmin
    .from('messages')
    .update({ reactions })
    .eq('id', msg.id);

  return;
}
