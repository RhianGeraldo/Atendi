import { supabaseAdmin } from '@/integrations/supabase/client.server';
import fs from 'fs';

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

export async function processEvogoWebhookBody(body: any): Promise<void> {
  try {
    // Log webhook without base64 to avoid blocking Node.js with huge strings
    const logBody = JSON.parse(JSON.stringify(body));
    if (logBody?.data?.Message?.base64) logBody.data.Message.base64 = `[base64 ~${Math.round(logBody.data.Message.base64.length / 1024)}kB omitted]`;
    if (logBody?.data?.base64) logBody.data.base64 = `[base64 ~${Math.round(logBody.data.base64.length / 1024)}kB omitted]`;
    fs.appendFileSync('webhook_logs.txt', new Date().toISOString() + ' WEBHOOK IN: ' + JSON.stringify(logBody) + '\n');
    console.log('EvoGo Webhook received:', JSON.stringify(logBody, null, 2));

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

      if (body.event === 'Message') {
        // WhatsMeow / EvoGo native format
        const info = body.data?.Info;
        const msg = body.data?.Message;
        
        if (!info || !msg) return;
        
        isFromMe = info.IsFromMe;
        
        const getPhone = (jids: (string | undefined)[]) => {
          const real = jids.find(j => j && j.includes('@s.whatsapp.net'));
          if (real) return real.split('@')[0];
          const fallback = jids.find(j => j && j.trim() !== '');
          if (fallback) return fallback.split('@')[0];
          return null;
        };

        if (isFromMe) {
          remoteJid = info.RecipientAlt || info.Chat;
          phoneNumber = getPhone([info.RecipientAlt, info.Chat]);
        } else {
          remoteJid = info.Sender || info.SenderAlt || info.Chat;
          phoneNumber = getPhone([info.Sender, info.SenderAlt, info.Chat]);
        }
        pushName = info.PushName || 'Desconhecido';
        remoteMsgId = info.ID;

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
        }
        
      } else {
        // Baileys format
        const messageData = body.data?.message || body.message || body;
        isFromMe = messageData.key?.fromMe || false;
        remoteJid = messageData.key?.remoteJid || '';
        pushName = messageData.pushName || 'Desconhecido';
        phoneNumber = remoteJid ? remoteJid.split('@')[0] : null;
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
          }
        }
      }

      if (!instanceName) {
        return;
      }

      if (!phoneNumber || remoteJid.includes('@g.us')) {
        return;
      }
      
      if (!textContent) {
        textContent = '[Mídia/Mensagem não suportada]';
      }

      // 1. Find the instance in the DB
      const { data: instance, error: instanceErr } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('unit_id, company_id')
        .eq('instance_name', instanceName)
        .single();

      if (instanceErr || !instance) {
        console.error('Instance not found for webhook:', instanceName);
        return;
      }

      let { company_id, unit_id } = instance;
      if (!unit_id) {
         // Fallback para a primeira unidade da empresa se a instância for global
         const { data: fallbackUnit } = await supabaseAdmin.from('units').select('id').eq('company_id', company_id).order('created_at').limit(1).maybeSingle();
         if (fallbackUnit) {
            unit_id = fallbackUnit.id;
         } else {
            fs.appendFileSync('webhook_logs.txt', 'Instance has no unit_id: ' + instanceName + '\n');
            console.error('Instance has no unit_id linked:', instanceName);
            return;
         }
      }

      // 2. Find or create Contact
      let contactId;
      const { data: existingContacts } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('company_id', company_id)
        .eq('phone', phoneNumber)
        .limit(1);

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
      } else {
        // Create new contact
        const { data: newContact, error: contactErr } = await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: company_id,
            name: pushName,
            phone: phoneNumber,
          })
          .select()
          .single();
          
        if (contactErr) throw contactErr;
        contactId = newContact.id;
      }

      // 3. Find active or waiting conversation
      let conversationId;
      const { data: activeConvs } = await supabaseAdmin
        .from('conversations')
        .select('id, status')
        .eq('unit_id', unit_id)
        .eq('contact_id', contactId)
        .in('status', ['waiting', 'active'])
        .limit(1);

      if (activeConvs && activeConvs.length > 0) {
        conversationId = activeConvs[0].id;
        
        // Update last_message_at
        await supabaseAdmin.from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);

      } else {
        // Create new conversation
        const { data: newConv, error: convErr } = await supabaseAdmin
          .from('conversations')
          .insert({
            unit_id: unit_id,
            contact_id: contactId,
            channel: 'whatsapp',
            status: 'waiting',
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
      const insertPayload: any = {
        conversation_id: conversationId,
        sender_type: isFromMe ? 'agent' : 'contact',
        content: textContent,
        media_type: mediaType,
        media_url: mediaUrl,
        remote_msg_id: remoteMsgId,
        quoted_message_id: quotedInternalId,
        quoted_content: quotedContent,
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

    return;
  } catch (err) {
    fs.appendFileSync('webhook_logs.txt', new Date().toISOString() + ' ERROR: ' + String(err) + '\n');
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
