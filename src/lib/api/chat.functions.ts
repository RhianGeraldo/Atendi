import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEvogoText, sendEvogoLink, sendEvogoMedia, sendEvogoReaction, editEvogoMessage, deleteEvogoMessage } from "../evogo";
import { sendStevoText, sendStevoLink, sendStevoMedia, sendStevoReaction, editStevoMessage, deleteStevoMessage } from "../stevo";
import { getPhoneVariants } from "@/lib/utils";

export const sendMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    text: z.string().optional(),
    mediaType: z.enum(["text", "image", "video", "audio", "document"]).optional().default("text"),
    mediaBase64: z.string().optional(),
    quotedMessageId: z.string().optional(),
    quotedParticipant: z.string().optional(),
    quotedInternalId: z.string().optional(),
    quotedContent: z.string().optional(),
    isInternal: z.boolean().optional().default(false)
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("status, channel, whatsapp_instance_id, unit_id, contact_id, remote_id, contacts(phone, whatsapp_lid, company_id)")
      .eq("id", data.conversationId)
      .single();

    if (convErr || !conv) {
      throw new Error("Conversation not found or access denied.");
    }

    const targetConversationId = data.conversationId;

    // O identificador final será resolvido após descobrir o provedor

    // 2. Get configuration for the conversation's instance based on channel
    let host: string | null = null;
    let token: string | null = null;
    let instanceName: string | null = null;
    let provider: string = 'evogo';
    let resolvedInstanceId = conv.whatsapp_instance_id;

    if ((conv.channel as string) === 'instagram') {
      provider = 'instagram';
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("id", resolvedInstanceId)
          .eq("provider", "instagram")
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
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
            .select("id")
            .eq("company_id", unitData.company_id)
            .eq("provider", "instagram")
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (!instance && conv.contacts?.company_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("company_id", conv.contacts.company_id)
          .eq("provider", "instagram")
          .limit(1)
          .maybeSingle();
        instance = data;
      }

      if (instance) {
        resolvedInstanceId = instance.id;
      }
    } else if ((conv.channel as string) === 'messenger') {
      provider = 'messenger';
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("id", resolvedInstanceId)
          .eq("provider", "messenger")
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
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
            .select("id")
            .eq("company_id", unitData.company_id)
            .eq("provider", "messenger")
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (!instance && conv.contacts?.company_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id")
          .eq("company_id", conv.contacts.company_id)
          .eq("provider", "messenger")
          .limit(1)
          .maybeSingle();
        instance = data;
      }

      if (instance) {
        resolvedInstanceId = instance.id;
      }
    } else {
      // WhatsApp channel
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
          .eq("id", resolvedInstanceId)
          .in("provider", ["evogo", "oficial", "stevo"])
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
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
            .select("id, instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
            .eq("company_id", unitData.company_id)
            .in("provider", ["evogo", "oficial", "stevo"])
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (instance) {
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
        provider = instance.provider || 'evogo';
        resolvedInstanceId = instance.id;
      }
    }

    // Auto-repair conversation whatsapp_instance_id
    if (resolvedInstanceId && conv.whatsapp_instance_id !== resolvedInstanceId) {
      await supabaseAdmin.from("conversations").update({ whatsapp_instance_id: resolvedInstanceId }).eq("id", targetConversationId);
    }

    if (!data.isInternal && provider !== 'oficial' && provider !== 'instagram' && provider !== 'messenger' && (!host || !token || !instanceName)) {
      throw new Error("EvoGo is not configured for this conversation.");
    }

    let phone = "";
    if (provider === 'instagram' || provider === 'messenger') {
      phone = conv.remote_id || conv.contacts?.whatsapp_lid || conv.contacts?.phone || "";
    } else {
      // Para WhatsApp (oficial e evogo), o identificador prioritário é o telefone real.
      phone = conv.contacts?.phone || conv.remote_id || conv.contacts?.whatsapp_lid || "";
    }

    if (!phone) {
      throw new Error("Contact has no remote_id or phone number.");
    }

    // 3. Get user profile for signature
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("name, use_signature")
      .eq("id", userId)
      .single();

    let textToSend = data.text || '';
    if (!data.isInternal && userProfile?.use_signature && userProfile?.name) {
      textToSend = textToSend.trim() ? `*${userProfile.name}*:\n${textToSend}` : `*${userProfile.name}*:`;
    }

    // 4. Send message via EvoGo
    let evogoResponse: any = null;
    let mediaUrlToSend = data.mediaBase64;
    let finalParticipant = data.quotedParticipant;
    let finalMessageId = data.quotedMessageId;
    
    // Fallback: If UI forgot to send the remote_msg_id, but sent the internal ID, fetch it from the DB!
    let quotedSenderType = "contact";
    if (data.quotedInternalId) {
      const { data: qMsg } = await supabaseAdmin
        .from('messages')
        .select('remote_msg_id, sender_type')
        .eq('id', data.quotedInternalId)
        .single();
        
      if (!finalMessageId && qMsg?.remote_msg_id) {
        finalMessageId = qMsg.remote_msg_id;
      }
      if (qMsg?.sender_type) {
        quotedSenderType = qMsg.sender_type;
      }
    }

    // Injetar o JID do contato SOMENTE se a mensagem original foi enviada pelo contato
    if (!finalParticipant && quotedSenderType === "contact" && conv.contacts?.phone && !conv.contacts.phone.includes('-')) {
      finalParticipant = `${conv.contacts.phone}@s.whatsapp.net`;
    }

    const quoted = finalMessageId ? {
      messageId: finalMessageId,
      ...(finalParticipant && { participant: finalParticipant })
    } : undefined;

    if (!data.isInternal) {
      if (data.mediaBase64 && data.mediaType && data.mediaType !== 'text') {
        try {
          if (data.mediaBase64.startsWith('data:')) {
            const match = data.mediaBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = mimeType.split('/')[1] || 'bin';
              const fileName = `${targetConversationId}/${Date.now()}.${ext}`;
              
              const { data: uploadData, error: uploadError } = await supabaseAdmin
                .storage
                .from('media')
                .upload(fileName, buffer, {
                  contentType: mimeType,
                  upsert: false,
                  cacheControl: '31536000, must-revalidate'
                });
                
              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse or upload base64 to Supabase', e);
        }
      }

      if (provider === 'oficial') {
        const { sendCloudApiMessage } = await import('../server/whatsapp-cloud-api');
        try {
          const msgId = await sendCloudApiMessage(
            resolvedInstanceId!,
            phone,
            textToSend || '',
            data.mediaType,
            mediaUrlToSend,
            finalMessageId
          );
          evogoResponse = { id: msgId };
        } catch (cloudErr: any) {
          console.error('[chat.functions] sendCloudApiMessage failed:', cloudErr);
          throw new Error(`Falha API Oficial: ${cloudErr.message || 'Erro desconhecido'}`);
        }
      } else if (provider === 'instagram') {
        const { data: instance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("oficial_phone_number_id, oficial_waba_id, oficial_access_token")
          .eq("id", resolvedInstanceId!)
          .single();

        if (!instance || !instance.oficial_phone_number_id || !instance.oficial_access_token) {
          throw new Error("Instagram Account ID ou Token faltando");
        }

        const payload: any = {
          recipient: { id: phone },
          messaging_type: "RESPONSE",
          message: {}
        };

        if (data.mediaBase64 && data.mediaType !== 'text' && mediaUrlToSend) {
          let igMediaType = 'image';
          if (data.mediaType === 'video') igMediaType = 'video';
          else if (data.mediaType === 'audio') igMediaType = 'audio';
          else if (data.mediaType === 'document') igMediaType = 'file';

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
          payload.message = { text: textToSend || '' };
        }

        if (finalMessageId) {
          payload.reply_to = { mid: finalMessageId };
        }

        const isDirectToken = instance.oficial_access_token.startsWith('IGA');
        const pageId = instance.oficial_waba_id || 'me';
        const endpoint = isDirectToken 
          ? `https://graph.instagram.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`
          : `https://graph.facebook.com/v20.0/${pageId}/messages?access_token=${instance.oficial_access_token}`;

        let igRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let result = await igRes.json();
        
        // Se a API da Meta recusar o reply_to (ex: respondendo a menções de story, mensagens expiradas, etc), refaz sem o reply_to
        if (!igRes.ok && result.error?.code === 100 && payload.reply_to) {
          console.warn("[chat.functions] Instagram rejected reply_to (possibly story mention or unsupported). Retrying without reply_to...");
          delete payload.reply_to;
          
          igRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          result = await igRes.json();
        }

        if (!igRes.ok) {
          console.error("[chat.functions] Instagram sending error:", result);
          throw new Error(`Instagram Error: ${result.error?.message || 'Unknown error'}`);
        }

        evogoResponse = { id: result.message_id, isInstagram: true, participant: instance.oficial_phone_number_id };

      } else if (provider === 'messenger') {
        const { data: instance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("oficial_phone_number_id, oficial_access_token") // oficial_phone_number_id guarda o Page ID para Messenger
          .eq("id", resolvedInstanceId!)
          .single();

        if (!instance || !instance.oficial_phone_number_id || !instance.oficial_access_token) {
          throw new Error("Facebook Page ID ou Token faltando");
        }

        const payload: any = {
          recipient: { id: phone },
          messaging_type: "RESPONSE",
          message: {}
        };

        if (data.mediaBase64 && data.mediaType !== 'text' && mediaUrlToSend) {
          let fbMediaType = 'image';
          if (data.mediaType === 'video') fbMediaType = 'video';
          else if (data.mediaType === 'audio') fbMediaType = 'audio';
          else if (data.mediaType === 'document') fbMediaType = 'file';

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
          payload.message = { text: textToSend || '' };
        }

        if (finalMessageId) {
          payload.reply_to = { mid: finalMessageId };
        }

        // Messenger utiliza o Page ID diretamente (oficial_phone_number_id armazena o Page ID)
        let fbRes = await fetch(`https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let result = await fbRes.json();

        // Se a API da Meta recusar o reply_to (ex: respondendo a mensagens expiradas), refaz sem o reply_to
        if (!fbRes.ok && result.error?.code === 100 && payload.reply_to) {
          console.warn("[chat.functions] Messenger rejected reply_to. Retrying without reply_to...");
          delete payload.reply_to;
          
          fbRes = await fetch(`https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          result = await fbRes.json();
        }

        if (!fbRes.ok) {
          console.error("[chat.functions] Messenger sending error:", result);
          throw new Error(`Messenger Error: ${result.error?.message || 'Unknown error'}`);
        }

        evogoResponse = { id: result.message_id, isMessenger: true, participant: instance.oficial_phone_number_id };

      } else {
        if (data.mediaBase64 && data.mediaType && data.mediaType !== 'text') {

          evogoResponse = await sendEvogoMedia({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phone,
            base64: mediaUrlToSend!,
            mediatype: data.mediaType as any,
            caption: textToSend,
            quoted,
          });
        } else if (textToSend.match(/https?:\/\//)) {
          evogoResponse = await sendEvogoLink({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phone,
            text: textToSend,
            quoted,
          });
        } else {
          evogoResponse = await sendEvogoText({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phone,
            text: textToSend,
            quoted,
          });
        }
      }
    }

    // Extract remote message id if available
    const remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;

    // 4. Save message in DB
    const insertPayload: any = {
      conversation_id: targetConversationId,
      sender_id: userId,
      sender_type: "agent",
      content: textToSend || null,
      media_type: data.mediaType || "text",
      media_url: mediaUrlToSend || null,
      is_internal: data.isInternal,
    };

    if (remoteMsgId && !data.isInternal) insertPayload.remote_msg_id = remoteMsgId;
    if (data.quotedInternalId) insertPayload.quoted_message_id = data.quotedInternalId;
    if (data.quotedContent) insertPayload.quoted_content = data.quotedContent;
    if (evogoResponse?.data?.Info?.Sender) insertPayload.participant_jid = evogoResponse.data.Info.Sender;
    if (evogoResponse?.isInstagram && evogoResponse?.participant) insertPayload.participant_jid = evogoResponse.participant;

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert(insertPayload)
      .select()
      .single();

    if (msgErr) {
      console.error("Failed to save message in DB:", msgErr);
      throw new Error("Message sent but failed to save in history.");
    }

    // 5. Update conversation last_message_at and reopen if resolved
    const convUpdate: any = { last_message_at: new Date().toISOString() };
    if (conv.status === 'resolved') {
      convUpdate.status = 'active';
      convUpdate.assigned_agent_id = userId;
      convUpdate.resolved_at = null;
    } else if (conv.status === 'waiting') {
      convUpdate.status = 'active';
      convUpdate.assigned_agent_id = userId;
    }
    await supabaseAdmin
      .from("conversations")
      .update(convUpdate)
      .eq("id", targetConversationId);

    return { success: true, message: msg };
  });

export const sendProactiveMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    phone: z.string().min(10),
    text: z.string().optional(),
    instanceName: z.string().min(1),
    companyId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Get instance config
    const { data: instance, error: instanceErr } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, instance_name, evogo_api_key, unit_id, companies(evogo_host)")
      .eq("instance_name", data.instanceName)
      .eq("company_id", data.companyId)
      .single();

    if (instanceErr || !instance) {
      throw new Error("Instance not found or access denied.");
    }

    const host = instance.companies?.evogo_host;
    const token = instance.evogo_api_key;
    const instanceName = instance.instance_name;
    let unitId = instance.unit_id;

    if (!unitId) {
      const { data: fallbackUnit } = await supabaseAdmin.from('units').select('id').eq('company_id', data.companyId).order('created_at').limit(1).maybeSingle();
      if (!fallbackUnit) throw new Error("No units available in this company.");
      unitId = fallbackUnit.id;
    }

    if (!host || !token) {
      throw new Error("EvoGo is not fully configured for this instance.");
    }

    // 2. Format phone
    let rawPhone = data.phone.replace(/\D/g, "");
    if (!rawPhone.startsWith("55")) rawPhone = "55" + rawPhone; // basic br fallback

    // 3. Get user profile for signature
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("name, use_signature, department_id")
      .eq("id", userId)
      .single();

    let textToSend = data.text;
    if (textToSend && userProfile?.use_signature && userProfile?.name) {
      textToSend = textToSend?.trim() ? `*${userProfile.name}*:\n${textToSend}` : `*${userProfile.name}*:`;
    }

    // 4. Send message via EvoGo
    if (textToSend) {
      await sendEvogoText({
        host,
        token,
        instanceName,
        number: rawPhone,
        text: textToSend,
      });
    }

    // 4. Find or create Contact
    let contactIds: string[] = [];
    const phoneVariants = getPhoneVariants(rawPhone);
    const { data: existingContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, merged_into_id')
      .eq('company_id', data.companyId)
      .in('phone', phoneVariants);

    if (existingContacts && existingContacts.length > 0) {
      contactIds = existingContacts.map(c => c.merged_into_id || c.id);
    } else {
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from('contacts')
        .insert({
          company_id: data.companyId,
          name: rawPhone, // They can edit later
          phone: rawPhone,
        })
        .select()
        .single();
      if (contactErr) throw new Error("Failed to create contact.");
      contactIds = [newContact.id];
      
      // Auto-sync profile picture (MUST await in Vercel)
      try {
        await syncContactProfile(newContact.id, instance.id);
      } catch (err) {
        console.error('[sendProactiveMessage] syncContactProfile failed:', err);
      }
    }

    const contactId = contactIds[0];

    // 5. Find or create Conversation
    let conversationId;
    const { data: latestConvs } = await supabaseAdmin
      .from('conversations')
      .select('id, status, assigned_agent_id, assigned_agent:profiles!conversations_assigned_agent_id_fkey(name)')
      .in('contact_id', contactIds)
      .eq('whatsapp_instance_id', instance.id)
      .order('started_at', { ascending: false })
      .limit(1);

    if (latestConvs && latestConvs.length > 0) {
      const conv = latestConvs[0];
      conversationId = conv.id;
      
      if (conv.status === 'active') {
        if (conv.assigned_agent_id === userId) {
          // Already with me, update last message time and ensure department is set
          const updatePayload: any = { 
            last_message_at: new Date().toISOString(),
            department_id: userProfile?.department_id || null
          };
          await supabaseAdmin.from('conversations').update(updatePayload).eq('id', conversationId);
        } else if (conv.assigned_agent_id) {
          // With another agent
          throw new Error(`Este contato já está em andamento com o(a) usuário(a) ${(conv as any).assigned_agent?.name || 'Desconhecido'} nesta instância. Peça a ele(a) para te transferir.`);
        } else {
          // Active but no agent
          const updatePayload: any = { 
            last_message_at: new Date().toISOString(),
            assigned_agent_id: userId,
            department_id: userProfile?.department_id || null,
          };
          await supabaseAdmin.from('conversations').update(updatePayload).eq('id', conversationId);
        }
      } else {
        // waiting or resolved -> reopen and assign
        const updatePayload: any = { 
          last_message_at: new Date().toISOString(),
          status: 'active',
          assigned_agent_id: userId,
          department_id: userProfile?.department_id || null,
          resolved_at: null 
        };

        const { data: convData } = await supabaseAdmin.from('conversations').select('current_session_id').eq('id', conversationId).single();
        let currentSessionId = convData?.current_session_id;
        
        // Force new session if resolved, or if missing session
        if (conv.status === 'resolved' || !currentSessionId) {
          const { data: newSession } = await supabaseAdmin.from('conversation_sessions').insert({
            conversation_id: conversationId,
            contact_id: contactId,
            whatsapp_instance_id: instance.id,
            assigned_agent_id: userId,
            department_id: userProfile?.department_id || null,
            started_at: new Date().toISOString()
          }).select().single();

          if (newSession) {
            updatePayload.current_session_id = newSession.id;
            await supabaseAdmin.from('session_events').insert([
              { session_id: newSession.id, event_type: 'started', actor_id: userId },
              { session_id: newSession.id, event_type: 'assigned', actor_id: userId, metadata: { assigned_to: userId } }
            ]);
          }
        } else if (currentSessionId && conv.status === 'waiting') {
          // Record assignment event for existing waiting session
          await supabaseAdmin.from('session_events').insert({
             session_id: currentSessionId,
             event_type: 'assigned',
             actor_id: userId,
             metadata: { assigned_to: userId }
          });
        }
        
        await supabaseAdmin.from('conversations').update(updatePayload).eq('id', conversationId);
      }
    } else {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          unit_id: unitId,
          contact_id: contactId,
          channel: 'whatsapp',
          status: 'active',
          whatsapp_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
          assigned_agent_id: userId,
          department_id: userProfile?.department_id || null,
        })
        .select()
        .single();
      if (convErr) throw new Error("Failed to create conversation.");
      conversationId = newConv.id;
      
      let sessionId = null;
      const { data: existingSession } = await supabaseAdmin.from('conversation_sessions').select('id').eq('conversation_id', conversationId).is('resolved_at', null).maybeSingle();
      if (existingSession) {
         sessionId = existingSession.id;
      } else {
         const { data: newSession } = await supabaseAdmin.from('conversation_sessions').insert({
            conversation_id: conversationId, contact_id: contactId, whatsapp_instance_id: instance.id,
            assigned_agent_id: userId, department_id: userProfile?.department_id || null, started_at: new Date().toISOString()
         }).select().single();
         if (newSession) sessionId = newSession.id;
      }
      
      if (sessionId) {
         await supabaseAdmin.from('conversations').update({ current_session_id: sessionId }).eq('id', conversationId);
         await supabaseAdmin.from('session_events').insert({ session_id: sessionId, event_type: 'started', actor_id: userId });
      }
    }

    // 6. Save message in DB
    if (textToSend) {
      const { error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_type: "agent",
          sender_id: userId,
          content: textToSend,
          media_type: "text"
        });

      if (msgErr) {
        console.error("Failed to save message in DB:", msgErr);
      } else {
        await supabaseAdmin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString(), status: 'active' })
          .eq("id", conversationId);
      }
    }

    return { success: true, conversationId };
  });

export const fetchContactInfoAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    contactId: z.string().uuid(),
    unitId: z.string().uuid().optional().nullable(),
    whatsappInstanceId: z.string().uuid().optional().nullable()
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    let whatsappInstanceId = data.whatsappInstanceId;
    if (!whatsappInstanceId) {
      const { data: convData } = await supabaseAdmin.from('conversations').select('whatsapp_instance_id').eq('contact_id', data.contactId).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
      if (convData?.whatsapp_instance_id) whatsappInstanceId = convData.whatsapp_instance_id;
    }

    // Get contact phone
    const { data: contact } = await supabase.from('contacts').select('phone').eq('id', data.contactId).single();
    if (!contact?.phone) return null;

    let host, token, instanceName;
    if (whatsappInstanceId) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", whatsappInstanceId)
        .single();

      if (instance) {
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    } else {
      // Fallback for old conversations
      const { data: contactFull } = await supabase.from('contacts').select('company_id').eq('id', data.contactId).single();
      if (contactFull?.company_id) {
        const { data: compInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", contactFull.company_id)
          .limit(1)
          .maybeSingle();
        if (compInstance) {
          host = compInstance.companies?.evogo_host;
          token = compInstance.evogo_api_key;
          instanceName = compInstance.instance_name;
        }
      }
    }

    if (!host || !token) return null;

    try {
      const url = `${host}/user/avatar`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': token
        },
        body: JSON.stringify({ number: contact.phone, preview: false })
      });
      if (response.ok) {
        const json = await response.json();
        return json.url || json.profilePictureUrl || null;
      }
    } catch (e) {
      console.warn("Failed to fetch profile picture:", e);
    }
    return null;
  });

export const syncLabelsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ unitId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    // Legacy endpoint: now labels are local, we just return success
    return { success: true, count: 0 };
  });

export const createLabelAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    unitId: z.string().uuid(),
    name: z.string().min(1),
    color: z.string().optional()
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("company_id")
      .eq("unit_id", data.unitId)
      .limit(1)
      .maybeSingle();

    if (!instance?.company_id) return { success: false, error: "Empresa não encontrada" };

    const randomColor = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
    const newLabel = {
      company_id: instance.company_id,
      name: data.name,
      color: data.color || randomColor,
      external_id: crypto.randomUUID() // using local UUID as external_id for consistency
    };

    const { data: label, error } = await supabaseAdmin.from('labels').insert(newLabel).select().single();
    if (error) {
      console.error("Failed to create label:", error);
      return { success: false, error: "Falha ao criar etiqueta" };
    }

    return { success: true, label };
  });

export const toggleContactLabelAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    unitId: z.string().uuid(),
    contactId: z.string().uuid(),
    labelId: z.string().uuid(),
    action: z.enum(["add", "remove"])
  }))
  .handler(async ({ data, context }) => {
    // Local system labels management
    if (data.action === 'add') {
      const { error } = await supabaseAdmin.from('contact_labels').upsert({ contact_id: data.contactId, label_id: data.labelId }, { onConflict: 'contact_id, label_id' });
      if (error) {
        console.error("Failed to insert contact_label locally:", error);
        return { success: false };
      }
    } else {
      const { error } = await supabaseAdmin.from('contact_labels').delete().eq('contact_id', data.contactId).eq('label_id', data.labelId);
      if (error) {
        console.error("Failed to delete contact_label locally:", error);
        return { success: false };
      }
    }

    return { success: true };
  });

export const reactToMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    emoji: z.string()
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Get conversation and message
    const { data: conv } = await supabase
      .from("conversations")
      .select("whatsapp_instance_id, unit_id, contact_id, channel, contacts(phone, whatsapp_lid)")
      .eq("id", data.conversationId)
      .single();

    if (!conv || !conv.contacts?.phone) throw new Error("Conversation not found");

    const { data: msg } = await supabase
      .from("messages")
      .select("remote_msg_id, sender_type, reactions")
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Message not found");
    if (!msg.remote_msg_id) throw new Error("Cannot react to a message without a remote ID");

    // 2. Obter instância
    let provider: string = 'coex';
    let host: string | null = null;
    let token: string | null = null;
    let instanceName: string | null = null;
    let oficialToken: string | null = null;
    let oficialPhoneId: string | null = null;
    let resolvedInstanceId = conv.whatsapp_instance_id;

    if ((conv.channel as string) === 'instagram') {
      provider = 'instagram';
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_access_token, oficial_phone_number_id")
          .eq("id", resolvedInstanceId)
          .eq("provider", "instagram")
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_access_token, oficial_phone_number_id")
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
            .select("id, oficial_access_token, oficial_phone_number_id")
            .eq("company_id", unitData.company_id)
            .eq("provider", "instagram")
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (instance) {
        resolvedInstanceId = instance.id;
        oficialToken = instance.oficial_access_token;
        oficialPhoneId = instance.oficial_phone_number_id;
      }
    } else if ((conv.channel as string) === 'messenger') {
      provider = 'messenger';
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_access_token, oficial_phone_number_id")
          .eq("id", resolvedInstanceId)
          .eq("provider", "messenger")
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, oficial_access_token, oficial_phone_number_id")
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
            .select("id, oficial_access_token, oficial_phone_number_id")
            .eq("company_id", unitData.company_id)
            .eq("provider", "messenger")
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (instance) {
        resolvedInstanceId = instance.id;
        oficialToken = instance.oficial_access_token;
        oficialPhoneId = instance.oficial_phone_number_id;
      }
    } else {
      // WhatsApp channel
      let instance = null;

      if (resolvedInstanceId) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, provider, instance_name, evogo_api_key, oficial_access_token, oficial_phone_number_id, companies(evogo_host)")
          .eq("id", resolvedInstanceId)
          .in("provider", ["evogo", "oficial", "stevo"])
          .maybeSingle();
        instance = data;
      }

      if (!instance && conv.unit_id) {
        const { data } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id, provider, instance_name, evogo_api_key, oficial_access_token, oficial_phone_number_id, companies(evogo_host)")
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
            .select("id, provider, instance_name, evogo_api_key, oficial_access_token, oficial_phone_number_id, companies(evogo_host)")
            .eq("company_id", unitData.company_id)
            .in("provider", ["evogo", "oficial", "stevo"])
            .limit(1)
            .maybeSingle();
          instance = data;
        }
      }

      if (instance) {
        resolvedInstanceId = instance.id;
        provider = instance.provider || 'coex';
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
        oficialToken = instance.oficial_access_token;
        oficialPhoneId = instance.oficial_phone_number_id;
      }
    }

    // Auto-repair conversation whatsapp_instance_id
    if (resolvedInstanceId && conv.whatsapp_instance_id !== resolvedInstanceId) {
      await supabaseAdmin.from("conversations").update({ whatsapp_instance_id: resolvedInstanceId }).eq("id", data.conversationId);
    }

    // 3. Enviar Reação conforme o provedor
    try {
      if (provider === 'instagram' || provider === 'messenger') {
        if (!oficialToken || !oficialPhoneId) throw new Error("Missing Meta tokens");
        const igsid = conv.contacts.whatsapp_lid;
        if (!igsid) throw new Error("Missing recipient scoped ID");

        const isDirectToken = oficialToken.startsWith('IGA');
        const endpoint = (provider === 'instagram' && isDirectToken)
          ? `https://graph.instagram.com/v20.0/${oficialPhoneId}/messages?access_token=${oficialToken}`
          : `https://graph.facebook.com/v20.0/me/messages?access_token=${oficialToken}`;

        const emojiMap: Record<string, string> = {
          '❤️': 'love', '👍': 'like', '😢': 'sad', '😠': 'angry', '😡': 'angry',
          '😮': 'wow', '😲': 'wow', '😂': 'laugh', '😆': 'laugh',
          '👍🏻': 'like', '👍🏼': 'like', '👍🏽': 'like', '👍🏾': 'like', '👍🏿': 'like'
        };

        const payload: any = {
          recipient: { id: igsid },
          sender_action: "react",
          payload: { message_id: msg.remote_msg_id }
        };

        if (data.emoji) {
          if (provider === 'messenger') {
            payload.payload.reaction = emojiMap[data.emoji] || 'like';
          } else {
            payload.payload.reaction = data.emoji; // Instagram exige o caractere do emoji exato
          }
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          console.error(`Meta API Reaction Error:`, await res.text());
        }

      } else if (provider === 'oficial') {
        if (!oficialToken || !oficialPhoneId) throw new Error("Missing Meta tokens");
        const endpoint = `https://graph.facebook.com/v20.0/${oficialPhoneId}/messages`;
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conv.contacts.phone,
          type: "reaction",
          reaction: {
            message_id: msg.remote_msg_id,
            emoji: data.emoji || ""
          }
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${oficialToken}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          console.error(`Cloud API Reaction Error:`, await res.text());
        }

      } else {
        // Evogo / Coex
        if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");
        if (provider === 'stevo') {
          await sendStevoReaction({
            host, token, number: conv.contacts.phone, remoteMsgId: msg.remote_msg_id, emoji: data.emoji
          });
        } else {
          await sendEvogoReaction({
            host,
            token,
            number: conv.contacts.phone,
            remoteMsgId: msg.remote_msg_id,
            emoji: data.emoji,
            fromMe: msg.sender_type === 'agent',
          });
        }
      }
    } catch (err) {
      console.warn("Reaction API failed, still updating DB.", err);
    }

    // 4. Update DB
    // No WhatsApp 1:1, a reação substitui a anterior
    const newReactions = data.emoji ? { [data.emoji]: 1 } : {};
    await supabaseAdmin
      .from("messages")
      .update({ reactions: newReactions })
      .eq("id", data.messageId);

    return { success: true };
  });

export const assignConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Get the user's main department
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("department_id")
      .eq("id", userId)
      .limit(1)
      .maybeSingle();

    // We don't strictly require a department, but we'll assign it if found.
    const updateData: any = {
      assigned_agent_id: userId,
      status: "active",
    };

    if (userProfile?.department_id) {
      updateData.department_id = userProfile.department_id;
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update(updateData)
      .eq("id", data.conversationId);

    if (error) {
      console.error("Failed to assign conversation:", error);
      throw new Error("Falha ao puxar atendimento.");
    }
    
    // Atualiza a sessão e gera evento na jornada
    const { data: conv } = await supabaseAdmin.from('conversations').select('current_session_id, contact_id, whatsapp_instance_id').eq('id', data.conversationId).single();
    if (conv?.current_session_id) {
       await supabaseAdmin.from('conversation_sessions').update({
          assigned_agent_id: userId, department_id: userProfile?.department_id || null
       }).eq('id', conv.current_session_id);
       await supabaseAdmin.from('session_events').insert({
          session_id: conv.current_session_id, event_type: 'assigned', actor_id: userId
       });
    } else if (conv) {
       // fallback caso a sessão não exista (retrocompatibilidade)
       let sessionId = null;
       const { data: existingSession } = await supabaseAdmin.from('conversation_sessions').select('id').eq('conversation_id', data.conversationId).is('resolved_at', null).maybeSingle();
       if (existingSession) {
          sessionId = existingSession.id;
       } else {
          const { data: newSession } = await supabaseAdmin.from('conversation_sessions').insert({
             conversation_id: data.conversationId, contact_id: conv.contact_id, whatsapp_instance_id: conv.whatsapp_instance_id,
             assigned_agent_id: userId, department_id: userProfile?.department_id || null, started_at: new Date().toISOString()
          }).select().single();
          if (newSession) sessionId = newSession.id;
       }
       if (sessionId) {
          await supabaseAdmin.from('conversations').update({ current_session_id: sessionId }).eq('id', data.conversationId);
          await supabaseAdmin.from('session_events').insert({ session_id: sessionId, event_type: 'assigned', actor_id: userId });
       }
    }

    return { success: true };
  });

export const transferConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    targetType: z.enum(["department", "agent"]),
    targetId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const updateData: any = {};

    if (data.targetType === "department") {
      updateData.department_id = data.targetId;
      updateData.status = "waiting"; 
      updateData.assigned_agent_id = null; // default to queue

      // Fetch company and unit info to check Round Robin
      const { data: convInfo } = await supabaseAdmin
        .from("conversations")
        .select("company_id, whatsapp_instances(unit_id)")
        .eq("id", data.conversationId)
        .limit(1)
        .maybeSingle();

      if (convInfo?.company_id) {
        const unitId = convInfo.whatsapp_instances?.[0]?.unit_id || null;
        const { assignDepartmentRoundRobin } = await import("../server/routing");
        const roundRobinAgent = await assignDepartmentRoundRobin(convInfo.company_id, data.targetId, unitId);
        
        if (roundRobinAgent) {
          updateData.assigned_agent_id = roundRobinAgent;
        }
      }
    } else {
      updateData.assigned_agent_id = data.targetId;
      updateData.status = "waiting";

      // Atualizar o departamento para o departamento do agente que vai receber
      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("department_id")
        .eq("id", data.targetId)
        .limit(1)
        .maybeSingle();

      if (userProfile?.department_id) {
        updateData.department_id = userProfile.department_id;
      }
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update(updateData)
      .eq("id", data.conversationId);

    if (error) {
      console.error("Failed to transfer conversation:", error);
      throw new Error("Falha ao transferir atendimento.");
    }
    
    // Atualiza a sessão e gera evento na jornada
    const { data: conv } = await supabaseAdmin.from('conversations').select('current_session_id').eq('id', data.conversationId).single();
    let targetName = null;
    if (data.targetType === "agent") {
       const { data: agent } = await supabaseAdmin.from('profiles').select('name').eq('id', data.targetId).single();
       if (agent) targetName = agent.name;
    } else if (data.targetType === "department") {
       const { data: dept } = await supabaseAdmin.from('departments').select('name').eq('id', data.targetId).single();
       if (dept) targetName = dept.name;
    }

    if (conv?.current_session_id) {
       await supabaseAdmin.from('conversation_sessions').update({
          assigned_agent_id: updateData.assigned_agent_id || null, department_id: updateData.department_id || null
       }).eq('id', conv.current_session_id);
       await supabaseAdmin.from('session_events').insert({
          session_id: conv.current_session_id, event_type: 'transferred',
          actor_id: userId,
          metadata: { targetType: data.targetType, targetId: data.targetId, targetName }
       });
    } else if (conv) {
       let sessionId = null;
       const { data: existingSession } = await supabaseAdmin.from('conversation_sessions').select('id').eq('conversation_id', data.conversationId).is('resolved_at', null).maybeSingle();
       if (existingSession) {
          sessionId = existingSession.id;
       } else {
          const { data: newSession } = await supabaseAdmin.from('conversation_sessions').insert({
             conversation_id: data.conversationId, contact_id: conv.contact_id, whatsapp_instance_id: conv.whatsapp_instance_id,
             assigned_agent_id: updateData.assigned_agent_id || null, department_id: updateData.department_id || null, started_at: new Date().toISOString()
          }).select().single();
          if (newSession) sessionId = newSession.id;
       }
       if (sessionId) {
          await supabaseAdmin.from('conversations').update({ current_session_id: sessionId }).eq('id', data.conversationId);
          await supabaseAdmin.from('session_events').insert({
             session_id: sessionId, event_type: 'transferred', actor_id: userId, metadata: { targetType: data.targetType, targetId: data.targetId, targetName }
          });
       }
    }

    // Criar notificação para o atendente recebendo
    if (data.targetType === "agent") {
      const { data: actorProfile } = await supabaseAdmin.from('profiles').select('name').eq('id', userId).single();
      const { data: convData } = await supabaseAdmin
        .from('conversations')
        .select('channel, contacts(company_id, name, phone)')
        .eq('id', data.conversationId)
        .single();
        
      if (convData && actorProfile && convData.contacts?.company_id) {
        const contactName = convData.contacts?.name || convData.contacts?.phone || 'um contato';
        await supabaseAdmin.from('notifications' as any).insert({
          company_id: convData.contacts.company_id,
          user_id: data.targetId,
          type: `transfer_${convData.channel || 'whatsapp'}`,
          title: 'Novo Atendimento',
          message: `${actorProfile.name} transferiu o contato ${contactName} para você.`,
          link: `/conversations?c=${data.conversationId}`,
        });
      }
    }

    return { success: true };
  });

export async function syncContactProfile(contactId: string, whatsappInstanceId?: string | null) {
  try {
    let instanceId = whatsappInstanceId;
    if (!instanceId) {
      const { data: convData } = await supabaseAdmin.from('conversations').select('whatsapp_instance_id').eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
      if (convData?.whatsapp_instance_id) instanceId = convData.whatsapp_instance_id;
    }
    
    const { data: contact } = await supabaseAdmin.from('contacts').select('phone, company_id').eq('id', contactId).single();
    if (!contact?.phone) return { success: false, message: "Contato sem telefone." };

    let host, token, instanceName;
    if (instanceId) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", instanceId)
        .single();

      if (instance) {
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    } else {
      // Fallback for old conversations
      if (contact?.company_id) {
        const { data: compInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", contact.company_id)
          .limit(1)
          .maybeSingle();
        if (compInstance) {
          host = compInstance.companies?.evogo_host;
          token = compInstance.evogo_api_key;
          instanceName = compInstance.instance_name;
        }
      }
    }

    if (!host || !token || !instanceName) {
      return { success: false, message: "EvoGo não configurado para esta unidade/empresa." };
    }
    
    let pushName = null;
    let avatarUrl = null;
    const jid = contact.phone.includes('@') ? contact.phone : `${contact.phone}@s.whatsapp.net`;

    try {
      console.log(`[syncContactProfile] Fetching info for ${jid} on ${host} (Instance: ${instanceName})`);
      const resInfo = await fetch(`${host}/user/info`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'apikey': token,
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ number: [jid] }),
        signal: AbortSignal.timeout(5000)
      });
      
      console.log(`[syncContactProfile] resInfo status: ${resInfo.status}`);
      if (resInfo.ok) {
        const jsonInfo = await resInfo.json();
        pushName = jsonInfo.name || jsonInfo.pushName || jsonInfo.pushname || jsonInfo.contactName || null;
      }
    } catch (e) {
      console.warn("[syncContactProfile] Failed to fetch user info:", e);
    }

    try {
      console.log(`[syncContactProfile] Fetching avatar for ${jid} (Instance: ${instanceName})`);
      const resAvatar = await fetch(`${host}/user/avatar`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'apikey': token,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ number: jid, preview: true }),
        signal: AbortSignal.timeout(10000)
      });
      console.log(`[syncContactProfile] resAvatar status: ${resAvatar.status}`);
      if (resAvatar.ok) {
        const jsonAvatar = await resAvatar.json();
        
        let finalUrl = jsonAvatar?.data?.url || jsonAvatar.url || jsonAvatar.profilePictureUrl || jsonAvatar.picture || null;
        
        let base64str = jsonAvatar.avatar;
        if (base64str && !finalUrl) {
          if (!base64str.startsWith('data:')) {
            const mimeType = base64str.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg';
            base64str = `data:${mimeType};base64,${base64str}`;
          }
          finalUrl = base64str;
        }
        
        avatarUrl = finalUrl;
      }
    } catch (e) {
      console.warn("[syncContactProfile] Failed to fetch avatar via /user/avatar:", e);
    }

    const updatePayload: any = {};
    if (pushName) updatePayload.name = pushName;
    if (avatarUrl) updatePayload.profile_picture_url = avatarUrl;

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from('contacts').update(updatePayload).eq('id', contactId);
    }

    if (pushName) {
      return { success: true, updatedName: pushName, avatarFound: !!avatarUrl };
    } else if (avatarUrl) {
      return { success: true, updatedName: "Foto Encontrada", avatarFound: true, message: "Foto de perfil atualizada!" };
    } else {
      return { success: false, message: "Nenhum nome público ou foto encontrados no WhatsApp." };
    }
  } catch (error: any) {
    console.error("[syncContactProfile] Error:", error);
    return { success: false, message: error.message };
  }
}

export const updateContactFromWhatsappAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    contactId: z.string().uuid(),
    unitId: z.string().uuid().optional().nullable(),
    whatsappInstanceId: z.string().uuid().optional().nullable()
  }))
  .handler(async ({ data }) => {
    const res = await syncContactProfile(data.contactId, data.whatsappInstanceId);
    if (!res.success) {
      throw new Error(res.message);
    }
    return res;
  });

export const editMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    newContent: z.string().min(1)
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Get conversation and message
    const { data: conv } = await supabase
      .from("conversations")
      .select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)")
      .eq("id", data.conversationId)
      .single();

    if (!conv || !conv.contacts?.phone) throw new Error("Conversation not found");

    const { data: msg } = await supabase
      .from("messages")
      .select("remote_msg_id, sender_type, sender_id, media_type")
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Message not found");
    if (!msg.remote_msg_id) throw new Error("Cannot edit a message without a remote ID");
    if (msg.sender_type !== "agent") throw new Error("You can only edit messages sent by an agent");
    if (msg.media_type && msg.media_type !== "text") throw new Error("Only text messages can be edited");

    // 2. Format content with signature if enabled
    let textToSend = data.newContent;
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("name, use_signature")
      .eq("id", userId)
      .single();

    if (userProfile?.use_signature && userProfile?.name) {
      textToSend = textToSend.trim() ? `*${userProfile.name}*:\n${textToSend}` : `*${userProfile.name}*:`;
    }

    // 3. Get evogo configuration
    let host, token, instanceName, provider;

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    }

    if (!host && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
          .eq("company_id", unitData.company_id)
          .limit(1)
          .maybeSingle();
        if (companyInstance) {
          host = companyInstance.custom_host || (companyInstance.provider === 'stevo' ? companyInstance.companies?.stevo_host : companyInstance.companies?.evogo_host);
          token = companyInstance.provider === 'stevo' ? companyInstance.stevo_api_key : companyInstance.evogo_api_key;
          instanceName = companyInstance.instance_name;
          provider = companyInstance.provider || 'evogo';
        }
      }
    }

    if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");

    // 4. Send Edit Request via EvoGo API
    try {
      if (provider === 'stevo') {
        await editStevoMessage({
          host,
          token,
          number: conv.contacts.phone,
          remoteMsgId: msg.remote_msg_id,
          message: textToSend,
        });
      } else {
        await editEvogoMessage({
          host,
          token,
          number: conv.contacts.phone,
          remoteMsgId: msg.remote_msg_id,
          message: textToSend,
        });
      }
    } catch (err: any) {
      console.error("EvoGo Edit failed:", err);
      throw new Error(`Failed to edit message in WhatsApp: ${err.message || String(err)}`);
    }

    // 5. Update DB
    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({
        content: textToSend,
        is_edited: true
      })
      .eq("id", data.messageId);

    if (updateErr) {
      console.error("Failed to update edited message in DB", updateErr);
    }

    return { success: true };
  });

export const deleteMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    messageId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Get message
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("*, conversations(*, contacts(*))")
      .eq("id", data.messageId)
      .single();

    if (!msg || msg.sender_id !== userId) {
      throw new Error("Message not found or access denied.");
    }

    if (!msg.remote_msg_id) {
      throw new Error("Cannot delete a message that was not sent via WhatsApp");
    }

    const conv = msg.conversations;
    if (!conv || !conv.contacts?.phone) throw new Error("Conversation or contact not found");

    // 2. Fetch EvoGo Credentials
    let host, token, instanceName, provider;

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);
        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    }

    if (!host && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")
          .eq("company_id", unitData.company_id)
          .limit(1)
          .maybeSingle();
        if (companyInstance) {
          host = companyInstance.custom_host || (companyInstance.provider === 'stevo' ? companyInstance.companies?.stevo_host : companyInstance.companies?.evogo_host);
          token = companyInstance.provider === 'stevo' ? companyInstance.stevo_api_key : companyInstance.evogo_api_key;
          instanceName = companyInstance.instance_name;
          provider = companyInstance.provider || 'evogo';
        }
      }
    }

    if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");

    // 3. Send Delete Request via EvoGo API
    try {
      if (provider === 'stevo') {
        await deleteStevoMessage({
          host,
          token,
          number: conv.contacts.phone,
          remoteMsgId: msg.remote_msg_id,
        });
      } else {
        await deleteEvogoMessage({
          host,
          token,
          number: conv.contacts.phone,
          remoteMsgId: msg.remote_msg_id,
        });
      }
    } catch (err: any) {
      console.error("EvoGo Delete failed:", err);
      throw new Error(`Failed to delete message in WhatsApp: ${err.message || String(err)}`);
    }

    // 4. Update DB
    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({
        is_deleted: true
      })
      .eq("id", data.messageId);

    if (updateErr) {
      console.error("Failed to update deleted message in DB", updateErr);
    }

    return { success: true };
  });

export const transcribeAudioAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    messageId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("id, media_url, conversations(contacts(company_id))")
      .eq("id", data.messageId)
      .single();

    if (!msg || !msg.media_url) {
      throw new Error("Mensagem de áudio não encontrada.");
    }

    const companyId = msg.conversations?.contacts?.company_id;
    if (!companyId) throw new Error("ID da empresa não encontrado.");

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', companyId)
      .single();

    if (!company?.ai_settings?.engines?.transcription || company.ai_settings.engines.transcription === 'none') {
      throw new Error("Transcrição de IA não está habilitada.");
    }

    const provider = company.ai_settings.engines.transcription;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // Detectar se é URL HTTP (gravação Wavoip) ou base64 inline (áudio WhatsApp)
    let base64Audio: string;
    let audioFormat = 'ogg'; // padrão para WhatsApp

    if (msg.media_url.startsWith('http://') || msg.media_url.startsWith('https://')) {
      // URL HTTP direta — precisa fazer download (gravações Wavoip)
      const urlPath = new URL(msg.media_url).pathname.toLowerCase();
      audioFormat = urlPath.endsWith('.mp3') ? 'mp3'
        : urlPath.endsWith('.wav') ? 'wav'
        : urlPath.endsWith('.m4a') ? 'm4a'
        : 'mp3'; // fallback para Wavoip

      const audioRes = await fetch(msg.media_url);
      if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`);
      const arrayBuffer = await audioRes.arrayBuffer();
      base64Audio = Buffer.from(arrayBuffer).toString('base64');
    } else {
      // Base64 inline — áudio do WhatsApp (data:audio/ogg;base64,...)
      const extracted = msg.media_url.split(',')[1];
      if (!extracted) throw new Error("Áudio não possui formato base64 válido.");
      base64Audio = extracted;
      audioFormat = 'ogg';
    }

    const mimeType = audioFormat === 'mp3' ? 'audio/mpeg'
      : audioFormat === 'wav' ? 'audio/wav'
      : audioFormat === 'm4a' ? 'audio/mp4'
      : 'audio/ogg';
    const fileName = `audio.${audioFormat}`;

    let response;

    if (provider === 'openrouter') {
      response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/whisper-1',
          input_audio: {
            data: base64Audio,
            format: audioFormat
          }
        })
      });
    } else {
      const buffer = Buffer.from(base64Audio, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, fileName);
      
      let baseUrl = '';
      if (provider === 'groq') {
        baseUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        formData.append('model', 'whisper-large-v3-turbo');
      } else {
        baseUrl = 'https://api.openai.com/v1/audio/transcriptions';
        formData.append('model', 'whisper-1');
      }

      formData.append('language', 'pt');
      formData.append('response_format', 'json');

      response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData as any
      });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('[transcribeAudioAction] API Error:', response.status, err);
      throw new Error(`Falha na API de transcrição: ${response.status}`);
    }

    const apiData = await response.json();
    if (!apiData.text) {
      throw new Error("API retornou resposta sem texto.");
    }

    await supabaseAdmin
      .from('messages')
      .update({ transcription: apiData.text })
      .eq('id', data.messageId);

    return { success: true, text: apiData.text };
  });

export const fixMessageTextAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    text: z.string().min(1),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("contacts(company_id)")
      .eq("id", data.conversationId)
      .single();

    const companyId = conv?.contacts?.company_id;
    if (!companyId) throw new Error("ID da empresa não encontrado.");

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', companyId)
      .single();

    const aiSettings = company?.ai_settings as any || {};
    let provider = aiSettings.engines?.text;

    if (!provider || provider === 'none') {
      if (aiSettings.keys?.openai) provider = 'openai';
      else if (aiSettings.keys?.openrouter) provider = 'openrouter';
      else if (aiSettings.keys?.groq) provider = 'groq';
    }

    if (!provider || provider === 'none') {
      throw new Error("Geração de IA não está habilitada.");
    }

    const apiKey = aiSettings.keys?.[provider];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    const systemPrompt = "Você é um revisor de texto de atendimento ao cliente. Reescreva o texto a seguir corrigindo erros gramaticais, de ortografia e de pontuação. Mantenha o texto amigável, profissional e com a mesma intenção original. Não adicione novas informações nem responda à mensagem, APENAS retorne o texto corrigido. Não coloque aspas no inicio e fim.";
    
    let correctedText = data.text;

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: data.text }
          ],
          temperature: 0.3
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Failed to fix text");
      correctedText = json.choices[0]?.message?.content || data.text;
    } else if (provider === 'openrouter') {
      const model = company.ai_settings.models?.text || 'openai/gpt-4o';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: data.text }
          ],
          temperature: 0.3
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Failed to fix text");
      correctedText = json.choices[0]?.message?.content || data.text;
    } else if (provider === 'groq') {
      const model = aiSettings.models?.text || 'llama3-70b-8192';
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: data.text }
          ],
          temperature: 0.3
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Failed to fix text");
      correctedText = json.choices[0]?.message?.content || data.text;
    }

    return { text: correctedText.trim() };
  });

export const transcribeCallAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    callId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    // 1. Buscar o call_log com a recording_url e company_id
    const { data: callLog } = await supabaseAdmin
      .from('call_logs')
      .select('id, recording_url, company_id')
      .eq('id', data.callId)
      .single();

    if (!callLog?.recording_url) {
      throw new Error("Gravação não disponível para esta chamada.");
    }

    // 2. Buscar configurações de IA da empresa
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', callLog.company_id)
      .single();

    if (!company?.ai_settings?.engines?.transcription || company.ai_settings.engines.transcription === 'none') {
      throw new Error("Transcrição de IA não está habilitada. Configure nas Configurações > IA.");
    }

    const provider = company.ai_settings.engines.transcription;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // 3. Detectar formato e fazer download
    const urlPath = new URL(callLog.recording_url).pathname.toLowerCase();
    const audioFormat = urlPath.endsWith('.mp3') ? 'mp3'
      : urlPath.endsWith('.wav') ? 'wav'
      : urlPath.endsWith('.m4a') ? 'm4a'
      : 'mp3';

    const audioRes = await fetch(callLog.recording_url);
    if (!audioRes.ok) throw new Error(`Falha ao baixar gravação: ${audioRes.status}`);
    const arrayBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    const mimeType = audioFormat === 'mp3' ? 'audio/mpeg'
      : audioFormat === 'wav' ? 'audio/wav'
      : audioFormat === 'm4a' ? 'audio/mp4'
      : 'audio/ogg';
    const fileName = `audio.${audioFormat}`;

    // 4. Enviar para o Whisper
    let response;
    if (provider === 'openrouter') {
      response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/whisper-1',
          input_audio: { data: base64Audio, format: audioFormat }
        })
      });
    } else {
      const buffer = Buffer.from(base64Audio, 'base64');
      const blob = new Blob([buffer], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, fileName);

      let baseUrl = '';
      if (provider === 'groq') {
        baseUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        formData.append('model', 'whisper-large-v3-turbo');
      } else {
        baseUrl = 'https://api.openai.com/v1/audio/transcriptions';
        formData.append('model', 'whisper-1');
      }
      formData.append('language', 'pt');
      formData.append('response_format', 'json');

      response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData as any
      });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('[transcribeCallAction] API Error:', response.status, err);
      throw new Error(`Falha na API de transcrição: ${response.status}`);
    }

    const apiData = await response.json();
    if (!apiData.text) throw new Error("API retornou resposta sem texto.");

    // 5. Salvar no call_log
    await supabaseAdmin
      .from('call_logs')
      .update({ transcription: apiData.text })
      .eq('id', data.callId);

    return { success: true, text: apiData.text };
  });

export const salesCoachAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Obter a empresa da conversa
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("contacts(company_id, name)")
      .eq("id", data.conversationId)
      .single();

    const companyId = conv?.contacts?.company_id;
    if (!companyId) throw new Error("ID da empresa não encontrado.");
    const contactName = conv?.contacts?.name || "Cliente";

    // 2. Obter configurações de IA
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', companyId)
      .single();

    const aiSettings = company?.ai_settings as any || {};
    let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text;

    if (!provider || provider === 'none') {
      if (aiSettings.keys?.openai) provider = 'openai';
      else if (aiSettings.keys?.openrouter) provider = 'openrouter';
      else if (aiSettings.keys?.groq) provider = 'groq';
    }

    if (!provider || provider === 'none') {
      throw new Error("Geração de IA não está habilitada.");
    }

    const apiKey = aiSettings.keys?.[provider];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // 3. Obter últimas mensagens
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('content, sender_type, media_type')
      .eq('conversation_id', data.conversationId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (!messages || messages.length === 0) {
      throw new Error("Nenhuma mensagem para analisar.");
    }

    const formattedHistory = messages.reverse().map(m => {
      const role = m.sender_type === 'contact' ? contactName : 'Vendedor';
      const text = m.media_type === 'text' ? m.content : `[Mídia: ${m.media_type}]`;
      return `${role}: ${text}`;
    }).join('\n');

    let systemPrompt = aiSettings.sales_coach_prompt || "Você é um treinador de vendas de elite.";
    systemPrompt += `
    
Abaixo está o histórico recente da conversa. Analise o atendimento e gere uma tabela de análise estruturada em Markdown com exatamente as seguintes colunas: Item, Avaliação, e Trechos de Referência.
Avalie rigorosamente: 1. Abertura, 2. Descoberta de necessidades, 3. Comunicação, 4. Técnicas de vendas, 5. Oportunidades perdidas, 6. Erros encontrados.
Depois, adicione "7. Notas (0-10)" para: Empatia, Qualificação, Comunicação, Persuasão, Condução, e Nota Geral.
Por fim, adicione "8. Sugestões de melhoria" em bullet points e "9. Resumo executivo".
Responda APENAS com o texto da tabela em markdown e nada mais.`;

    systemPrompt += `\n\nHistórico:\n\n${formattedHistory}`;

    let suggestion = "";

    try {
      const customModel = aiSettings.sales_coach_model;
      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: customModel || 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }]
          })
        });
        if (!response.ok) throw new Error(`OpenAI Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: customModel || 'llama3-70b-8192',
            messages: [{ role: 'system', content: systemPrompt }]
          })
        });
        if (!response.ok) throw new Error(`Groq Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === 'openrouter') {
        const model = customModel || aiSettings.active_chatbot_model || 'openai/gpt-oss-120b:free';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'system', content: systemPrompt }]
          })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter Erro: ${response.status} - ${errText}`);
        }
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      }
    } catch (e: any) {
      console.error('[salesCoachAction] Error:', e);
      throw new Error(`Falha ao gerar análise: ${e.message}`);
    }

    // 4. Salvar Análise no Banco
    const { error: insertError } = await supabaseAdmin
      .from('sales_coach_analyses')
      .insert({
        conversation_id: data.conversationId,
        company_id: companyId,
        analysis_markdown: suggestion,
        created_by: userId
      });
      
    if (insertError) {
      console.error("Erro ao salvar análise:", insertError);
    }

    return { success: true, suggestion: suggestion.trim() };
  });

export const salesCoachSuggestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Obter a empresa e o último relatório
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("contacts(company_id, name)")
      .eq("id", data.conversationId)
      .single();

    const companyId = conv?.contacts?.company_id;
    if (!companyId) throw new Error("ID da empresa não encontrado.");
    const contactName = conv?.contacts?.name || "Cliente";

    const { data: latestAnalysis } = await supabaseAdmin
      .from('sales_coach_analyses')
      .select('analysis_markdown')
      .eq('conversation_id', data.conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestAnalysis) {
      throw new Error("Nenhuma análise encontrada. Gere a análise primeiro.");
    }

    // 2. Obter configurações de IA
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', companyId)
      .single();

    const aiSettings = company?.ai_settings as any || {};
    let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text;

    if (!provider || provider === 'none') {
      if (aiSettings.keys?.openai) provider = 'openai';
      else if (aiSettings.keys?.openrouter) provider = 'openrouter';
      else if (aiSettings.keys?.groq) provider = 'groq';
    }

    if (!provider || provider === 'none') {
      throw new Error("Geração de IA não está habilitada.");
    }

    const apiKey = aiSettings.keys?.[provider];
    if (!apiKey) throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);

    // 3. Obter últimas mensagens
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('content, sender_type, media_type')
      .eq('conversation_id', data.conversationId)
      .order('created_at', { ascending: false })
      .limit(5);

    const formattedHistory = (messages || []).reverse().map(m => {
      const role = m.sender_type === 'contact' ? contactName : 'Vendedor';
      const text = m.media_type === 'text' ? m.content : `[Mídia: ${m.media_type}]`;
      return `${role}: ${text}`;
    }).join('\n');

    let systemPrompt = "Você é um treinador de vendas tático. Baseado na análise do atendimento e nas últimas mensagens abaixo, dê uma instrução RÁPIDA, TÁTICA e DIRETA para o vendedor sobre o que ele deve fazer agora.\n\nSua resposta deve obrigatoriamente seguir este formato em Markdown:\n**🎯 Objetivo:** [Qual o objetivo da próxima mensagem]\n**💡 Estratégia:** [Qual técnica de vendas usar]\n**💬 Sugestão de fala:** \"[Uma ou duas frases bem curtas e naturais para o vendedor enviar]\"\n\nNão escreva NADA fora desse formato.\n\n";
    systemPrompt += `=== ANÁLISE ===\n${latestAnalysis.analysis_markdown}\n\n`;
    systemPrompt += `=== ÚLTIMAS MENSAGENS ===\n${formattedHistory}`;

    let suggestion = "";

    try {
      const customModel = aiSettings.sales_coach_model;
      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: customModel || 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }] })
        });
        if (!response.ok) throw new Error(`OpenAI Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: customModel || 'llama3-70b-8192', messages: [{ role: 'system', content: systemPrompt }] })
        });
        if (!response.ok) throw new Error(`Groq Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === 'openrouter') {
        const model = customModel || aiSettings.active_chatbot_model || 'openai/gpt-oss-120b:free';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model, messages: [{ role: 'system', content: systemPrompt }] })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter Erro: ${response.status} - ${errText}`);
        }
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      }
    } catch (e: any) {
      console.error('[salesCoachSuggestAction] Error:', e);
      throw new Error(`Falha ao gerar sugestão: ${e.message}`);
    }

    return { success: true, text: suggestion.trim() };
  });

// --- Shared Resolve Logic ---
export async function internalResolveConversation(
  conversationId: string, 
  userId: string, 
  reasonId?: string | null, 
  observation?: string | null
) {
  const resolvedAt = new Date().toISOString();

  // 1. Fetch conversation details to build a fallback session if needed
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, contact_id, whatsapp_instance_id, started_at, assigned_agent_id, department_id")
    .eq("id", conversationId)
    .single();

  if (!conv) return { success: false, error: "Conversation not found" };

  // 2. Update conversation status
  const { error: convErr } = await supabaseAdmin
    .from("conversations")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
      current_session_id: null,
      assigned_agent_id: null
    } as any)
    .eq("id", conversationId);
    
  if (convErr) throw convErr;

  // 3. Atualiza sessões em andamento
  const { data: openSessions } = await supabaseAdmin
    .from("conversation_sessions")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("resolved_at", null);

  if (openSessions && openSessions.length > 0) {
    for (const session of openSessions) {
      await supabaseAdmin.from("conversation_sessions").update({
        resolved_at: resolvedAt,
        resolution_reason_id: reasonId || null,
        resolution_observation: observation?.trim() || null,
      }).eq("id", session.id);
      
      await supabaseAdmin.from("session_events").insert({
        session_id: session.id,
        event_type: "resolved",
        actor_id: userId
      });
    }
  } else {
    // Fallback retrocompatibilidade para conversas sem sessão
    const { data: newSession, error: err } = await supabaseAdmin
      .from("conversation_sessions")
      .insert({
        conversation_id: conv.id, 
        contact_id: conv.contact_id, 
        whatsapp_instance_id: conv.whatsapp_instance_id,
        started_at: conv.started_at || new Date().toISOString(), 
        resolved_at: resolvedAt,
        assigned_agent_id: conv.assigned_agent_id, 
        department_id: conv.department_id,
        resolution_reason_id: reasonId || null, 
        resolution_observation: observation?.trim() || null,
      }).select().single();
      
    if (newSession && !err) {
      await supabaseAdmin.from("session_events").insert({ 
        session_id: newSession.id, 
        event_type: "resolved", 
        actor_id: userId 
      });
    }
  }

  return { success: true };
}

export const resolveConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    reasonId: z.string().optional().nullable(),
    observation: z.string().optional().nullable(),
  }))
  .handler(async ({ data, context }) => {
    try {
      await internalResolveConversation(data.conversationId, context.userId, data.reasonId, data.observation);
      return { success: true };
    } catch (e: any) {
      console.error("[resolveConversationAction] Error:", e);
      throw new Error("Falha ao encerrar atendimento.");
    }
  });

export const blockContactAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    contactId: z.string().uuid(),
    reason: z.string().min(1, "O motivo é obrigatório"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // Atualiza o contato marcando como bloqueado
    const { error } = await supabase
      .from("contacts")
      .update({ is_blocked: true, block_reason: data.reason })
      .eq("id", data.contactId);
      
    if (error) {
      console.error("Failed to block contact:", error);
      throw new Error("Não foi possível bloquear o contato.");
    }

    // Busca conversas ativas do contato
    const { data: activeConvs } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("contact_id", data.contactId)
      .neq("status", "resolved");

    if (activeConvs) {
      for (const conv of activeConvs) {
        // Encerra cada conversa formalmente usando a lógica centralizada
        await internalResolveConversation(conv.id, userId, null, data.reason);
      }
    }
    
    return { success: true };
  });

export const unblockContactAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    contactId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    const { error } = await supabase
      .from("contacts")
      .update({ is_blocked: false, block_reason: null })
      .eq("id", data.contactId);
      
    if (error) {
      console.error("Failed to unblock contact:", error);
      throw new Error("Não foi possível desbloquear o contato.");
    }
    
    return { success: true };
  });
