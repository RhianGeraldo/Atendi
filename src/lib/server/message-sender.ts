import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEvogoText, sendEvogoMedia, sendEvogoLink } from "../evogo";

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
    .select("status, channel, whatsapp_instance_id, unit_id, contact_id, contacts(phone)")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) throw new Error("Conversation not found");

  const phone = conv.contacts?.phone;
  let remoteMsgId = null;
  let participantJid = null;
  let mediaUrlToSend = mediaBase64;

  if (conv.channel === 'whatsapp') {
    let provider = 'evogo';

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies(evogo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
        instanceName = instance.instance_name;
        provider = instance.provider || 'evogo';
      }
    }

    let evogoResponse;

    if (provider === 'oficial') {
      const { sendCloudApiMessage } = await import('./whatsapp-cloud-api');
      const msgId = await sendCloudApiMessage(
        conv.whatsapp_instance_id!,
        phone,
        text || '',
        mediaType,
        mediaUrlToSend,
        finalMessageId
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
                .upload(fileName, buffer, { contentType: mimeType, upsert: false });
                
              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse or upload base64 to Supabase', e);
        }

        evogoResponse = await sendEvogoMedia({
          host, token, instanceName, number: phone,
          base64: mediaUrlToSend!, mediatype: mediaType as any, caption: text,
        });
      } else {
      const messageText = text || '';
      // Regex to detect if there's any URL in the text, avoiding trailing punctuation or markdown chars like *, ), ], }
      const hasUrl = /(https?:\/\/[^\s*()\[\]{}]+)/g.test(messageText);

      if (hasUrl) {
        try {
          evogoResponse = await sendEvogoLink({
            host, token, instanceName, number: phone, text: messageText,
          });
        } catch (linkErr) {
          console.warn('[message-sender] sendEvogoLink failed (possibly invalid URL format), falling back to text:', linkErr);
          evogoResponse = await sendEvogoText({
            host, token, instanceName, number: phone, text: messageText,
          });
        }
      } else {
        evogoResponse = await sendEvogoText({
          host, token, instanceName, number: phone, text: messageText,
        });
      }
    }
    remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;
    participantJid = evogoResponse?.data?.Info?.Sender || null;
  }
    
  } else if (conv.channel === 'instagram') {
    // Implement Instagram sending logic here in the future
    console.log("[sendPlatformMessage] Instagram channel not implemented yet.");
    throw new Error("Instagram channel not fully integrated yet.");
  }

  // Save to DB
  const { data: msg, error: dbErr } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      sender_id: senderId,
      content: text || null,
      media_type: mediaType,
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
