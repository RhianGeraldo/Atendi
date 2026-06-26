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
    .select("status, channel, whatsapp_instance_id, unit_id, contact_id, remote_id, contacts(phone, whatsapp_lid)")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) throw new Error("Conversation not found");

  const phone = conv.remote_id || conv.contacts?.phone;
  if (!phone) throw new Error("Phone number is missing.");
  const whatsapp_lid = conv.remote_id || conv.contacts?.whatsapp_lid;
  let remoteMsgId = null;
  let participantJid = null;
  let mediaUrlToSend = mediaBase64;

  let host: string | null = null;
  let token: string | null = null;
  let instanceName: string | null = null;
  let provider: string = 'evogo';
  let resolvedInstanceId = conv.whatsapp_instance_id;

  // Resolve instance details based on channel
  if ((conv.channel as string) === 'instagram') {
    provider = 'instagram';
    let instance = null;

    if (resolvedInstanceId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, oficial_phone_number_id, oficial_access_token")
        .eq("id", resolvedInstanceId)
        .eq("provider", "instagram")
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, oficial_phone_number_id, oficial_access_token")
        .eq("unit_id", conv.unit_id)
        .eq("provider", "instagram")
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_phone_number_id, oficial_access_token")
          .eq("company_id", unitData.company_id)
          .eq("provider", "instagram")
          .limit(1)
          .maybeSingle();
        instance = data;
      }
    }

    if (!instance) {
      throw new Error("Missing instance for Instagram");
    }

    if (resolvedInstanceId !== instance.id) {
      resolvedInstanceId = instance.id;
      await supabaseAdmin.from("conversations").update({ whatsapp_instance_id: instance.id }).eq("id", conversationId);
    }
  } else if ((conv.channel as string) === 'messenger') {
    provider = 'messenger';
    let instance = null;

    if (resolvedInstanceId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, oficial_phone_number_id, oficial_access_token")
        .eq("id", resolvedInstanceId)
        .eq("provider", "messenger")
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, oficial_phone_number_id, oficial_access_token")
        .eq("unit_id", conv.unit_id)
        .eq("provider", "messenger")
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_phone_number_id, oficial_access_token")
          .eq("company_id", unitData.company_id)
          .eq("provider", "messenger")
          .limit(1)
          .maybeSingle();
        instance = data;
      }
    }

    if (!instance) {
      throw new Error("Missing instance for Messenger");
    }

    if (resolvedInstanceId !== instance.id) {
      resolvedInstanceId = instance.id;
      await supabaseAdmin.from("conversations").update({ whatsapp_instance_id: instance.id }).eq("id", conversationId);
    }
  } else {
    // WhatsApp channel
    let instance = null;

    if (resolvedInstanceId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, instance_name, evogo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies(evogo_host)")
        .eq("id", resolvedInstanceId)
        .in("provider", ["evogo", "oficial", "stevo"])
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, instance_name, evogo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies(evogo_host)")
        .eq("unit_id", conv.unit_id)
        .in("provider", ["evogo", "oficial", "stevo"])
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, evogo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .in("provider", ["evogo", "oficial", "stevo"])
          .limit(1)
          .maybeSingle();
        instance = data;
      }
    }

    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
      provider = instance.provider || 'evogo';

      if (resolvedInstanceId !== instance.id) {
        resolvedInstanceId = instance.id;
        await supabaseAdmin.from("conversations").update({ whatsapp_instance_id: instance.id }).eq("id", conversationId);
      }
    }
  }

  if (conv.channel === 'whatsapp') {
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
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("oficial_phone_number_id, oficial_access_token")
      .eq("id", resolvedInstanceId!)
      .single();

    if (!instance || !instance.oficial_phone_number_id || !instance.oficial_access_token) {
      throw new Error("Instagram Account ID or Token missing");
    }

    const igsid = whatsapp_lid;
    if (!igsid) throw new Error("Missing Instagram Scoped ID (whatsapp_lid) for contact");

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
      : `https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`;

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

  } else if (conv.channel === 'messenger') {
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("oficial_phone_number_id, oficial_access_token")
      .eq("id", resolvedInstanceId!)
      .single();

    if (!instance || !instance.oficial_phone_number_id || !instance.oficial_access_token) {
      throw new Error("Facebook Page ID or Token missing");
    }

    const psid = whatsapp_lid;
    if (!psid) throw new Error("Missing Facebook Page Scoped ID (whatsapp_lid) for contact");

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
