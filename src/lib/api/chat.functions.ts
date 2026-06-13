import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEvogoText, sendEvogoLink, sendEvogoMedia, sendEvogoReaction, editEvogoMessage } from "../evogo";
import { getPhoneVariants } from "@/lib/utils";

export const sendMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    text: z.string().optional(),
    mediaType: z.enum(['image', 'video', 'audio', 'document', 'text']).optional(),
    mediaBase64: z.string().optional(),
    quotedMessageId: z.string().optional(),
    quotedParticipant: z.string().optional(),
    quotedInternalId: z.string().uuid().optional(),
    quotedContent: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("status, whatsapp_instance_id, unit_id, contact_id, contacts(phone)")
      .eq("id", data.conversationId)
      .single();

    if (convErr || !conv) {
      throw new Error("Conversation not found or access denied.");
    }

    const targetConversationId = data.conversationId;

    const phone = conv.contacts?.phone;
    if (!phone) {
      throw new Error("Contact has no phone number.");
    }

    // 2. Get evogo configuration for the conversation's instance
    let host, token, instanceName;

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    }

    if (!host && conv.unit_id) {
      // Fallback for old conversations
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .limit(1)
          .maybeSingle();
        if (companyInstance) {
          host = companyInstance.companies?.evogo_host;
          token = companyInstance.evogo_api_key;
          instanceName = companyInstance.instance_name;
        }
      }
    }

    if (!host || !token || !instanceName) {
      throw new Error("EvoGo is not configured for this conversation.");
    }

    // 3. Get user profile for signature
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("name, use_signature")
      .eq("id", userId)
      .single();

    let textToSend = data.text || '';
    if (userProfile?.use_signature && userProfile?.name) {
      textToSend = textToSend.trim() ? `*${userProfile.name}*:\n${textToSend}` : `*${userProfile.name}*:`;
    }

    // 4. Send message via EvoGo
    let evogoResponse;
    let finalParticipant = data.quotedParticipant;
    let finalMessageId = data.quotedMessageId;
    
    // Fallback: If UI forgot to send the remote_msg_id, but sent the internal ID, fetch it from the DB!
    if (data.quotedInternalId) {
      const { data: qMsg } = await supabaseAdmin
        .from('messages')
        .select('remote_msg_id, sender_type')
        .eq('id', data.quotedInternalId)
        .single();
        
      if (!finalMessageId && qMsg?.remote_msg_id) {
        finalMessageId = qMsg.remote_msg_id;
      }
    }

    if (!finalParticipant && conv.contacts?.phone && !conv.contacts.phone.includes('-')) {
      finalParticipant = `${conv.contacts.phone}@s.whatsapp.net`;
    }

    const quoted = finalMessageId ? {
      messageId: finalMessageId,
      ...(finalParticipant && { participant: finalParticipant })
    } : undefined;

    console.log('[sendMessageAction] Sending message:', {
      host,
      token: token.substring(0, 5) + '...',
      instanceName,
      number: phone,
      text: textToSend,
      quoted,
      originalQuotedMessageId: data.quotedMessageId,
      finalMessageId,
      originalQuotedParticipant: data.quotedParticipant,
      finalParticipant
    });

    let mediaUrlToSend = data.mediaBase64;

    if (data.mediaBase64 && data.mediaType && data.mediaType !== 'text') {
      // Tentar fazer o upload pro Supabase Storage antes de enviar
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
                upsert: false
              });
              
            if (!uploadError && uploadData) {
              const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(uploadData.path);
              mediaUrlToSend = publicUrlData.publicUrl;
              console.log('Successfully uploaded media to Supabase:', mediaUrlToSend);
            } else {
              console.error('Error uploading to Supabase:', uploadError);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse or upload base64 to Supabase', e);
      }

      evogoResponse = await sendEvogoMedia({
        host,
        token,
        instanceName,
        number: phone,
        base64: mediaUrlToSend!,
        mediatype: data.mediaType as any,
        caption: textToSend,
        quoted,
      });
    } else if (textToSend.match(/https?:\/\//)) {
      evogoResponse = await sendEvogoLink({
        host,
        token,
        instanceName,
        number: phone,
        text: textToSend,
        quoted,
      });
    } else {
      evogoResponse = await sendEvogoText({
        host,
        token,
        instanceName,
        number: phone,
        text: textToSend,
        quoted,
      });
    }

    // Extract remote message id if available
    const remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;

    // 4. Save message in DB
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: targetConversationId,
        sender_type: "agent",
        sender_id: userId,
        content: textToSend || null,
        media_type: data.mediaType || "text",
        media_url: mediaUrlToSend || null,
        remote_msg_id: remoteMsgId,
        quoted_message_id: data.quotedInternalId,
        quoted_content: data.quotedContent,
        participant_jid: evogoResponse?.data?.Info?.Sender || null,
      })
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
    text: z.string().min(1),
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
    if (userProfile?.use_signature && userProfile?.name) {
      textToSend = textToSend?.trim() ? `*${userProfile.name}*:\n${textToSend}` : `*${userProfile.name}*:`;
    }

    // 4. Send message via EvoGo
    await sendEvogoText({
      host,
      token,
      instanceName,
      number: rawPhone,
      text: textToSend,
    });

    // 4. Find or create Contact
    let contactId;
    const phoneVariants = getPhoneVariants(rawPhone);
    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('company_id', data.companyId)
      .in('phone', phoneVariants)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
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
      contactId = newContact.id;
    }

    // 5. Find or create Conversation
    let conversationId;
    const { data: latestConvs } = await supabaseAdmin
      .from('conversations')
      .select('id, status, assigned_agent_id, assigned_agent:profiles!conversations_assigned_agent_id_fkey(name)')
      .eq('unit_id', unitId)
      .eq('contact_id', contactId)
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
          throw new Error(`Essa conversa já está em andamento com o(a) atendente ${(conv as any).assigned_agent?.name || 'Desconhecido'}.`);
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
        if (!convData?.current_session_id) {
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
             updatePayload.current_session_id = sessionId;
             await supabaseAdmin.from('session_events').insert({ session_id: sessionId, event_type: 'started', actor_id: userId });
          }
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
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
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
      .select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)")
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

    // 2. Get evogo configuration
    let host, token, instanceName;

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    }

    if (!host && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .limit(1)
          .maybeSingle();
        if (companyInstance) {
          host = companyInstance.companies?.evogo_host;
          token = companyInstance.evogo_api_key;
          instanceName = companyInstance.instance_name;
        }
      }
    }

    if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");

    // 3. Send Reaction via EvoGo API
    try {
      await sendEvogoReaction({
        host,
        token,
        number: conv.contacts.phone,
        remoteMsgId: msg.remote_msg_id,
        emoji: data.emoji,
        fromMe: msg.sender_type === 'agent',
      });
    } catch (err) {
      console.warn("EvoGo Reaction failed, likely incorrect endpoint or unconfigured API. Still updating DB.", err);
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
      updateData.assigned_agent_id = null; // back to queue
      updateData.status = "waiting"; 
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

    return { success: true };
  });

export const updateContactFromWhatsappAction = createServerFn({ method: "POST" })
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
    
    const { data: contact } = await supabase.from('contacts').select('phone').eq('id', data.contactId).single();
    if (!contact?.phone) throw new Error("Contato sem telefone.");

    let host, token, instanceName;
    if (whatsappInstanceId) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", whatsappInstanceId)
        .single();

      if (instance) {
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
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

    if (!host || !token || !instanceName) {
      throw new Error("EvoGo não configurado para esta unidade/empresa.");
    }
    let pushName = null;

    try {
      const resInfo = await fetch(`${host}/user/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': token },
        body: JSON.stringify({ number: contact.phone }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (resInfo.ok) {
        const jsonInfo = await resInfo.json();
        pushName = jsonInfo.name || jsonInfo.pushName || jsonInfo.pushname || jsonInfo.contactName || null;
      } else {
        const resProfile = await fetch(`${host}/chat/fetchProfile/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': token },
          body: JSON.stringify({ number: contact.phone }),
          signal: AbortSignal.timeout(5000)
        });
        if (resProfile.ok) {
          const jsonProfile = await resProfile.json();
          pushName = jsonProfile.name || jsonProfile.pushName || jsonProfile.pushname || null;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch user info:", e);
      throw new Error("Falha ao buscar informações no WhatsApp.");
    }

    let avatarUrl = null;
    try {
      // Alguns endpoints Evolution usam /chat/fetchProfilePictureUrl/:instance ou similar. 
      // Vamos tentar /user/avatar primeiro com timeout curto
      const resAvatar = await fetch(`${host}/user/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': token },
        body: JSON.stringify({ number: contact.phone, preview: false }),
        signal: AbortSignal.timeout(5000)
      });
      if (resAvatar.ok) {
        const jsonAvatar = await resAvatar.json();
        avatarUrl = jsonAvatar.url || jsonAvatar.profilePictureUrl || jsonAvatar.picture || null;
      }
    } catch (e) {
      console.warn("Failed to fetch avatar:", e);
    }

    if (pushName) {
      await supabaseAdmin.from('contacts').update({ name: pushName }).eq('id', data.contactId);
      return { success: true, updatedName: pushName, avatarFound: !!avatarUrl };
    } else if (avatarUrl) {
      // Name not found, but avatar was! Return success so the UI gives a positive toast
      return { success: true, updatedName: "Foto Encontrada", avatarFound: true, message: "Foto de perfil atualizada!" };
    } else {
      return { success: false, message: "Nenhum nome público ou foto encontrados no WhatsApp." };
    }
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
    let host, token, instanceName;

    if (conv.whatsapp_instance_id) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", conv.whatsapp_instance_id)
        .single();

      if (instance) {
        host = instance.companies?.evogo_host;
        token = instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    }

    if (!host && conv.unit_id) {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .limit(1)
          .maybeSingle();
        if (companyInstance) {
          host = companyInstance.companies?.evogo_host;
          token = companyInstance.evogo_api_key;
          instanceName = companyInstance.instance_name;
        }
      }
    }

    if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");

    // 4. Send Edit Request via EvoGo API
    try {
      await editEvogoMessage({
        host,
        token,
        number: conv.contacts.phone,
        remoteMsgId: msg.remote_msg_id,
        message: textToSend,
      });
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

    const base64Audio = msg.media_url.split(',')[1];
    if (!base64Audio) {
       throw new Error("Áudio não possui formato base64 válido.");
    }

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
            format: 'ogg'
          }
        })
      });
    } else {
      const buffer = Buffer.from(base64Audio, 'base64');
      const blob = new Blob([buffer], { type: 'audio/ogg' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.ogg');
      
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
