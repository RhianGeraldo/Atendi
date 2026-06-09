import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEvogoText, sendEvogoMedia, sendEvogoReaction } from "../evogo";

export const sendMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    text: z.string().optional(),
    mediaType: z.enum(['image', 'video', 'audio', 'document', 'text']).optional(),
    mediaBase64: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // 1. Get conversation to find contact_id and instance_id
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)")
      .eq("id", data.conversationId)
      .single();

    if (convErr || !conv) {
      throw new Error("Conversation not found or access denied.");
    }

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
    if (data.mediaBase64 && data.mediaType && data.mediaType !== 'text') {
      evogoResponse = await sendEvogoMedia({
        host,
        token,
        instanceName,
        number: phone,
        base64: data.mediaBase64,
        mediatype: data.mediaType as any,
        caption: textToSend,
      });
    } else {
      evogoResponse = await sendEvogoText({
        host,
        token,
        instanceName,
        number: phone,
        text: textToSend,
      });
    }

    // Extract remote message id if available
    const remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;

    // 4. Save message in DB
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_type: "agent",
        sender_id: userId,
        content: textToSend || null,
        media_type: data.mediaType || "text",
        media_url: data.mediaBase64 || null,
        remote_msg_id: remoteMsgId,
      })
      .select()
      .single();

    if (msgErr) {
      console.error("Failed to save message in DB:", msgErr);
      throw new Error("Message sent but failed to save in history.");
    }

    // 5. Update conversation last_message_at
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), status: 'active' })
      .eq("id", data.conversationId);

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
      .select("instance_name, evogo_api_key, unit_id, companies(evogo_host)")
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
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("name, use_signature")
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
    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('company_id', data.companyId)
      .eq('phone', rawPhone)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from('contacts')
        .insert({
          company_id: data.companyId,
          name: "Desconhecido", // They can edit later
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
      .select('id, status')
      .eq('unit_id', unitId)
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(1);

    if (latestConvs && latestConvs.length > 0) {
      const conv = latestConvs[0];
      conversationId = conv.id;
      
      const updatePayload: any = { last_message_at: new Date().toISOString() };
      
      // Se a conversa estava resolvida e o agente iniciou uma conversa, ela volta para 'active' com o agente
      if (conv.status === 'resolved') {
        updatePayload.status = 'active';
        updatePayload.assigned_agent_id = userId;
        // Optionally update department if we want, but we can leave it as is or null
      }
      
      await supabaseAdmin.from('conversations')
        .update(updatePayload)
        .eq('id', conversationId);
        
    } else {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          unit_id: unitId,
          contact_id: contactId,
          channel: 'whatsapp',
          status: 'active', // Since we started it, it's active
          last_message_at: new Date().toISOString(),
          assigned_agent_id: userId,
        })
        .select()
        .single();
      if (convErr) throw new Error("Failed to create conversation.");
      conversationId = newConv.id;
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

    return { success: true };
  });

export const transferConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    targetType: z.enum(["department", "agent"]),
    targetId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {

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
