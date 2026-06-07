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
    
    // 1. Get conversation to find contact_id and unit_id
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("unit_id, contact_id, contacts(phone)")
      .eq("id", data.conversationId)
      .single();

    if (convErr || !conv) {
      throw new Error("Conversation not found or access denied.");
    }

    const phone = conv.contacts?.phone;
    if (!phone) {
      throw new Error("Contact has no phone number.");
    }

    // 2. Get evogo configuration for the unit/company
    const { data: instance, error: instanceErr } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name, evogo_api_key, companies(evogo_host)")
      .eq("unit_id", conv.unit_id)
      .limit(1)
      .maybeSingle();

    let host = instance?.companies?.evogo_host;
    let token = instance?.evogo_api_key;
    let instanceName = instance?.instance_name;

    // If unit has no specific instance, fallback to company level instance
    if (!instance) {
      // Find company id for this unit
      const { data: unitData } = await supabaseAdmin
        .from("units")
        .select("company_id")
        .eq("id", conv.unit_id)
        .single();
        
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .is("unit_id", null)
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
      throw new Error("EvoGo is not configured for this unit/company.");
    }

    // 3. Send message via EvoGo
    let evogoResponse;
    if (data.mediaBase64 && data.mediaType && data.mediaType !== 'text') {
      evogoResponse = await sendEvogoMedia({
        host,
        token,
        instanceName,
        number: phone,
        base64: data.mediaBase64,
        mediatype: data.mediaType as any,
        caption: data.text || '',
      });
    } else {
      evogoResponse = await sendEvogoText({
        host,
        token,
        instanceName,
        number: phone,
        text: data.text || '',
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
        content: data.text || null,
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

    // 3. Send message via EvoGo
    await sendEvogoText({
      host,
      token,
      instanceName,
      number: rawPhone,
      text: data.text,
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
    const { data: activeConv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('unit_id', unitId)
      .eq('contact_id', contactId)
      .in('status', ['waiting', 'active'])
      .limit(1)
      .maybeSingle();

    if (activeConv) {
      conversationId = activeConv.id;
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
        content: data.text,
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
      .select("unit_id, contact_id, contacts(phone)")
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
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("instance_name, evogo_api_key, companies(evogo_host)")
      .eq("unit_id", conv.unit_id)
      .limit(1)
      .maybeSingle();

    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
    } else {
      const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
      if (unitData) {
        const { data: companyInstance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name, evogo_api_key, companies(evogo_host)")
          .eq("company_id", unitData.company_id)
          .is("unit_id", null)
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
