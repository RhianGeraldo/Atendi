import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEvogoText, sendEvogoMedia, sendEvogoLink } from "../evogo";
import { sendStevoText, sendStevoMedia, sendStevoLink } from "../stevo";
import { abrirCanal, destinatarioDe } from "../canais/motor";

/**
 * Unified function to send messages across different channels (WhatsApp, Instagram, etc)
 * Used by both human agents (via API) and AI agents (via backend generator).
 */
export async function sendPlatformMessage({
  conversationId,
  text,
  mediaType = 'text',
  mediaBase64,
  senderType = 'agent',
  senderId = null,
  aiAgentId = null,
}: {
  conversationId: string;
  text?: string;
  mediaType?: string;
  mediaBase64?: string;
  senderType?: 'agent' | 'contact';
  senderId?: string | null;
  aiAgentId?: string | null;
}) {
  const { data: conv, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("status, channel, whatsapp_instance_id, unit_id, contact_id, remote_id, contacts(phone, whatsapp_lid)")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) throw new Error("Conversation not found");

  /**
   * O canal, e só então o destinatário.
   *
   * Era aqui que viviam ~150 linhas iguais às de `chat.functions.ts`, que
   * deduziam o provedor a partir do `channel` da conversa. Quem resolve agora é
   * `abrirCanal`, e ele parte da instância — ver `src/lib/canais/motor.ts`.
   */
  const canal = await abrirCanal({
    id: conversationId,
    channel: conv.channel as string,
    unit_id: conv.unit_id,
    whatsapp_instance_id: conv.whatsapp_instance_id,
  });

  const destino = destinatarioDe(canal, conv, conv.contacts);

  const provider = canal.provedor;
  const host = canal.host;
  const token = canal.token;
  const instanceName = canal.instanceName;
  const resolvedInstanceId = canal.id;
  const phone = destino.identificador;

  let remoteMsgId = null;
  let participantJid = null;
  let mediaUrlToSend = mediaBase64;

  if (canal.rede === 'whatsapp') {
    let evogoResponse;

    if (provider === 'oficial') {
      const { sendCloudApiMessage } = await import('./whatsapp-cloud-api');
      const msgId = await sendCloudApiMessage(
        resolvedInstanceId!,
        phone,
        text || '',
        mediaType,
        mediaUrlToSend
      );
      remoteMsgId = msgId;
      participantJid = null;
    } else {
      // Logic for Evogo
      if (!host || !token || !instanceName || !phone) {
        throw new Error("EvoGo is not configured or missing phone number for WhatsApp channel.");
      }

      if (mediaBase64 && mediaType !== 'text') {
        // Upload to Supabase se for base64 e não tiver link de storage (Evogo não gosta de mt URL, mas a logica tava com base64 e storage misto)
        // A lógica de upload fica idêntica para o evogo e ja tava aqui, ela sobe pro supabase e pega publicUrl
        try {
          if (mediaBase64.startsWith('data:')) {
            const match = mediaBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = mimeType.split('/')[1] || 'bin';
              const fileName = `${conversationId}/${Date.now()}.${ext}`;
              
              const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('media')
                .upload(fileName, buffer, { contentType: mimeType, upsert: false, cacheControl: '31536000, must-revalidate' });
                
              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse or upload base64 to Supabase', e);
        }

        if (provider === 'stevo') {
          evogoResponse = await sendStevoMedia({
            host, token, instanceName, number: phone,
            base64: mediaUrlToSend!, mediatype: mediaType as any, caption: text,
          });
        } else {
          evogoResponse = await sendEvogoMedia({
            host, token, instanceName, number: phone,
            base64: mediaUrlToSend!, mediatype: mediaType as any, caption: text,
          });
        }
      } else {
      const messageText = text || '';
      // Regex to detect if there's any URL in the text, avoiding trailing punctuation or markdown chars like *, ), ], }
      const hasUrl = /(https?:\/\/[^\s*()\[\]{}]+)/g.test(messageText);

      if (hasUrl) {
        try {
          if (provider === 'stevo') {
            evogoResponse = await sendStevoLink({
              host, token, instanceName, number: phone, text: messageText,
            });
          } else {
            evogoResponse = await sendEvogoLink({
              host, token, instanceName, number: phone, text: messageText,
            });
          }
        } catch (linkErr) {
          console.warn('[message-sender] sendLink failed (possibly invalid URL format), falling back to text:', linkErr);
          if (provider === 'stevo') {
            evogoResponse = await sendStevoText({
              host, token, instanceName, number: phone, text: messageText,
            });
          } else {
            evogoResponse = await sendEvogoText({
              host, token, instanceName, number: phone, text: messageText,
            });
          }
        }
      } else {
        if (provider === 'stevo') {
          evogoResponse = await sendStevoText({
            host, token, instanceName, number: phone, text: messageText,
          });
        } else {
          evogoResponse = await sendEvogoText({
            host, token, instanceName, number: phone, text: messageText,
          });
        }
      }
    }
    remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;
    participantJid = evogoResponse?.data?.Info?.Sender || null;
  }
    
  } else if (canal.rede === 'instagram') {
    // As credenciais já vieram com o canal: a consulta que estava aqui repetia
    // a que `abrirCanal` acabou de fazer.
    if (!canal.contaId || !canal.contaToken) {
      throw new Error("Instagram Account ID or Token missing");
    }
    const instance = { oficial_phone_number_id: canal.contaId, oficial_access_token: canal.contaToken };

    const igsid = destino.identificador;

    const payload: any = {
      recipient: { id: igsid },
      message: {}
    };

    if (mediaBase64 && mediaType !== 'text') {
       // Upload to Supabase to get a public URL for Meta
        try {
          if (mediaBase64.startsWith('data:')) {
            const match = mediaBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = mimeType.split('/')[1] || 'bin';
              const fileName = `ig_${conversationId}/${Date.now()}.${ext}`;
              
              const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('media')
                .upload(fileName, buffer, { contentType: mimeType, upsert: false, cacheControl: '31536000, must-revalidate' });
                
              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse or upload base64 to Supabase', e);
        }

        if (mediaUrlToSend) {
          let igMediaType = 'image';
          if (mediaType === 'video') igMediaType = 'video';
          else if (mediaType === 'audio') igMediaType = 'audio';
          else if (mediaType === 'document') igMediaType = 'file';

          payload.message = {
            attachment: {
              type: igMediaType,
              payload: {
                url: mediaUrlToSend,
                is_reusable: false
              }
            }
          };
        } else {
          payload.message = { text: text || '' };
        }
    } else {
      payload.message = { text: text || '' };
    }

    const isDirectToken = instance.oficial_access_token.startsWith('IGA');
    const endpoint = isDirectToken 
      ? `https://graph.instagram.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`
      : `https://graph.facebook.com/v20.0/me/messages?access_token=${instance.oficial_access_token}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("[sendPlatformMessage] Instagram sending error:", result);
      throw new Error(`Graph API Error: ${result.error?.message || 'Unknown error'}`);
    }

    remoteMsgId = result.message_id || null;
    participantJid = instance.oficial_phone_number_id;

  } else if (canal.rede === 'messenger') {
    if (!canal.contaId || !canal.contaToken) {
      throw new Error("Facebook Page ID or Token missing");
    }
    const instance = { oficial_phone_number_id: canal.contaId, oficial_access_token: canal.contaToken };

    const psid = destino.identificador;

    const payload: any = {
      recipient: { id: psid },
      message: {}
    };

    if (mediaBase64 && mediaType !== 'text') {
       // Upload to Supabase to get a public URL for Meta
        try {
          if (mediaBase64.startsWith('data:')) {
            const match = mediaBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = mimeType.split('/')[1] || 'bin';
              const fileName = `fb_${conversationId}/${Date.now()}.${ext}`;
              
              const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('media')
                .upload(fileName, buffer, { contentType: mimeType, upsert: false, cacheControl: '31536000, must-revalidate' });
                
              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse or upload base64 to Supabase', e);
        }

        if (mediaUrlToSend) {
          let fbMediaType = 'image';
          if (mediaType === 'video') fbMediaType = 'video';
          else if (mediaType === 'audio') fbMediaType = 'audio';
          else if (mediaType === 'document') fbMediaType = 'file';

          payload.message = {
            attachment: {
              type: fbMediaType,
              payload: {
                url: mediaUrlToSend,
                is_reusable: false
              }
            }
          };
        } else {
          payload.message = { text: text || '' };
        }
    } else {
      payload.message = { text: text || '' };
    }

    const response = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${instance.oficial_access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("[sendPlatformMessage] Messenger sending error:", result);
      throw new Error(`Graph API Error: ${result.error?.message || 'Unknown error'}`);
    }

    remoteMsgId = result.message_id || null;
    participantJid = instance.oficial_phone_number_id;
  }

  // Save to DB
  const { data: msg, error: dbErr } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content: text || null,
      media_type: mediaType as any,
      media_url: mediaUrlToSend || null,
      remote_msg_id: remoteMsgId,
      participant_jid: participantJid,
      metadata: aiAgentId ? { ai_generated: true, ai_agent_id: aiAgentId } : undefined
    })
    .select()
    .single();

  if (dbErr) {
    console.error("[sendPlatformMessage] Failed to save message to DB:", dbErr);
  }

  // Update conversation status
  const convUpdate: any = { last_message_at: new Date().toISOString() };
  if (conv.status === 'resolved') {
    convUpdate.status = 'active';
    convUpdate.resolved_at = null;
  } else if (conv.status === 'waiting') {
    convUpdate.status = 'active';
  }
  
  if (senderId) {
    convUpdate.assigned_agent_id = senderId;
  }

  await supabaseAdmin
    .from("conversations")
    .update(convUpdate)
    .eq("id", conversationId);

  return msg;
}
