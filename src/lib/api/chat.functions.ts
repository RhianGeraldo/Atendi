import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { abrirCanal, destinatarioDe } from "@/lib/canais/motor";
import type { CanalAberto, Destinatario } from "@/lib/canais/tipos";
import {
  sendEvogoText,
  sendEvogoLink,
  sendEvogoMedia,
  sendEvogoReaction,
  editEvogoMessage,
  deleteEvogoMessage,
  checkEvogoUser,
} from "../evogo";
import {
  sendStevoText,
  sendStevoLink,
  sendStevoMedia,
  sendStevoReaction,
  editStevoMessage,
  deleteStevoMessage,
  checkStevoUser,
} from "../stevo";
import { getPhoneVariants } from "@/lib/utils";
import { getCompanyPlaybookSummary } from "./training.functions";
import { ZernioClient } from "../canais/zernio/client";
import { persistirAvatarContatoNoStorage } from "../avatar-storage";

const chatJidCache = new Map<string, { jid: string; expiresAt: number }>();

async function resolveWhatsAppChatJid({
  conversationId,
  channel,
  remoteId,
  rawPhone,
  messageMetadata,
  host,
  token,
  provider,
}: {
  conversationId: string;
  channel?: string | null;
  remoteId?: string | null;
  rawPhone?: string | null;
  messageMetadata?: any;
  host?: string | null;
  token?: string | null;
  provider?: string | null;
}): Promise<string> {
  // 1. Group checks: always use group JID
  const isGroup =
    channel === "whatsapp_group" ||
    (remoteId && remoteId.includes("@g.us")) ||
    (rawPhone && rawPhone.includes("@g.us"));

  if (isGroup) {
    if (remoteId && remoteId.includes("@g.us")) return remoteId;
    if (rawPhone && rawPhone.includes("@g.us")) return rawPhone;
    if (rawPhone) return `${rawPhone.replace(/\D/g, "")}@g.us`;
    if (remoteId) return `${remoteId}@g.us`;
  }

  // Check in-memory cache for fast repeated sends (TTL 15 min)
  if (conversationId && !isGroup) {
    const cached = chatJidCache.get(conversationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.jid;
    }
  }

  const cacheAndReturn = (jid: string): string => {
    if (conversationId && !isGroup && jid && jid.includes("@")) {
      chatJidCache.set(conversationId, { jid, expiresAt: Date.now() + 15 * 60 * 1000 });
    }
    return jid;
  };

  // 2. Direct metadata on the message being edited/deleted/reacted/quoted
  if (messageMetadata && typeof messageMetadata === "object" && messageMetadata.chat_jid) {
    return cacheAndReturn(String(messageMetadata.chat_jid));
  }

  // 3. If remoteId is already an explicit WhatsApp user JID or LID
  if (remoteId && (remoteId.includes("@s.whatsapp.net") || remoteId.includes("@lid"))) {
    return cacheAndReturn(remoteId.replace(/:\d+@/, "@"));
  }

  // 4. Query messages in the conversation for participant_jid from 'contact'
  // When contacts send messages, WhatsApp records their exact session JID (e.g. without 9th digit)
  const { data: contactMsg } = await supabaseAdmin
    .from("messages")
    .select("participant_jid")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "contact")
    .not("participant_jid", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactMsg?.participant_jid && !contactMsg.participant_jid.includes("-")) {
    return cacheAndReturn(contactMsg.participant_jid.replace(/:\d+@/, "@"));
  }

  // 5. Query any recent message in the conversation that has chat_jid in metadata
  const { data: metaMsgs } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("conversation_id", conversationId)
    .not("metadata", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (metaMsgs && metaMsgs.length > 0) {
    for (const m of metaMsgs) {
      if (m.metadata && typeof m.metadata === "object" && (m.metadata as any).chat_jid) {
        return cacheAndReturn(String((m.metadata as any).chat_jid));
      }
    }
  }

  // 6. Query WhatsApp servers via /user/check using EvoGo/Stevo
  const cleanPhone = (rawPhone || "").replace(/\D/g, "");
  if (host && token && cleanPhone) {
    try {
      const variants = getPhoneVariants(cleanPhone);
      const queryList = variants.length > 0 ? variants : [cleanPhone];
      let checkData: any = null;

      if (provider === "stevo") {
        checkData = await checkStevoUser({ host, token, numbers: queryList });
      } else {
        checkData = await checkEvogoUser({ host, token, numbers: queryList });
      }

      const users = checkData?.data?.Users;
      if (Array.isArray(users) && users.length > 0) {
        const found = users.find((u: any) => u.IsInWhatsapp && (u.JID || u.RemoteJID));
        if (found?.JID) return cacheAndReturn(String(found.JID).replace(/:\d+@/, "@"));
        if (found?.RemoteJID) return cacheAndReturn(String(found.RemoteJID).replace(/:\d+@/, "@"));
      }
    } catch (e) {
      console.warn("[resolveWhatsAppChatJid] /user/check failed, falling back to clean phone:", e);
    }
  }

  // 7. Fallback: clean phone + @s.whatsapp.net
  const fallback = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : `${rawPhone}@s.whatsapp.net`;
  return cacheAndReturn(fallback);
}

export const sendMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      text: z.string().optional(),
      mediaType: z.enum(["text", "image", "video", "audio", "document"]).optional().default("text"),
      mediaBase64: z.string().optional(),
      quotedMessageId: z.string().optional(),
      quotedParticipant: z.string().optional(),
      quotedInternalId: z.string().optional(),
      quotedContent: z.string().optional(),
      isInternal: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const targetConversationId = data.conversationId;

    // 1. Parallel fetch: conversation, user profile (signature), and quoted message (if replying)
    const convPromise = supabase
      .from("conversations")
      .select(
        "status, channel, whatsapp_instance_id, unit_id, contact_id, remote_id, assigned_agent_id, contacts(phone, whatsapp_lid, company_id, instagram_id, messenger_id)",
      )
      .eq("id", targetConversationId)
      .single();

    const profilePromise = supabase
      .from("profiles")
      .select("name, use_signature")
      .eq("id", userId)
      .single();

    const qMsgPromise = data.quotedInternalId
      ? supabaseAdmin
          .from("messages")
          .select("id, remote_msg_id, sender_type, participant_jid, content, media_type")
          .eq("id", data.quotedInternalId)
          .maybeSingle()
      : data.quotedMessageId
        ? supabaseAdmin
            .from("messages")
            .select("id, remote_msg_id, sender_type, participant_jid, content, media_type")
            .eq("remote_msg_id", data.quotedMessageId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

    const [convRes, profileRes, qMsgRes] = await Promise.all([
      convPromise,
      profilePromise,
      qMsgPromise,
    ]);

    const conv = convRes.data;
    if (convRes.error || !conv) {
      throw new Error("Conversation not found or access denied.");
    }

    if (
      !data.isInternal &&
      conv.status === "active" &&
      conv.assigned_agent_id &&
      conv.assigned_agent_id !== userId
    ) {
      throw new Error(
        "Esta conversa está em atendimento por outro atendente. Assuma o atendimento antes de enviar mensagens.",
      );
    }

    // 2. O canal, e só então o destinatário.
    let canal: CanalAberto | null = null;
    let destino: Destinatario | null = null;

    if (!data.isInternal) {
      canal = await abrirCanal({
        id: targetConversationId,
        channel: conv.channel as string,
        unit_id: conv.unit_id,
        whatsapp_instance_id: conv.whatsapp_instance_id,
      });
      destino = destinatarioDe(canal, conv, conv.contacts);
    }

    const provider = canal?.provedor ?? "evogo";
    const host = canal?.host ?? null;
    const token = canal?.token ?? null;
    const instanceName = canal?.instanceName ?? null;
    const resolvedInstanceId = canal?.id ?? conv.whatsapp_instance_id;
    const phone = destino?.identificador ?? "";

    const phoneToSend =
      !data.isInternal && (provider === "evogo" || provider === "stevo")
        ? await resolveWhatsAppChatJid({
            conversationId: targetConversationId,
            channel: conv.channel,
            remoteId: conv.remote_id,
            rawPhone: phone,
            host,
            token,
            provider,
          })
        : phone;

    // Os provedores de sessão precisam dos três; os da Meta, de nenhum deles.
    if (
      canal &&
      (canal.provedor === "evogo" || canal.provedor === "stevo") &&
      (!host || !token || !instanceName)
    ) {
      throw new Error(
        `A conexão ${canal.provedor === "stevo" ? "Stevo" : "EvoGo"} desta conversa está incompleta: ` +
          "falta host, token ou o nome da instância.",
      );
    }

    // 3. User signature
    const userProfile = profileRes.data;
    let textToSend = data.text || "";
    const shouldSign =
      !data.isInternal && userProfile?.use_signature !== false && !!userProfile?.name;
    if (shouldSign) {
      const signaturePrefix = `*${userProfile.name}*:`;
      if (!textToSend.startsWith(signaturePrefix)) {
        textToSend = textToSend.trim() ? `${signaturePrefix}\n${textToSend}` : signaturePrefix;
      }
    }

    // 4. Send message via EvoGo / Stevo
    let evogoResponse: any = null;
    let mediaUrlToSend = data.mediaBase64;
    let finalMessageId = data.quotedMessageId;
    let finalParticipant = data.quotedParticipant;
    let quotedContent = data.quotedContent;

    const qMsg = qMsgRes.data;
    let quotedSenderType = "contact";

    if (qMsg) {
      if (qMsg.remote_msg_id) {
        finalMessageId = qMsg.remote_msg_id;
      }
      if (qMsg.sender_type) {
        quotedSenderType = qMsg.sender_type;
      }
      if (!quotedContent) {
        quotedContent = qMsg.content || (qMsg.media_type ? `[${qMsg.media_type}]` : undefined);
      }
      if (!data.quotedInternalId) {
        data.quotedInternalId = qMsg.id;
      }
    }

    // 2. Determine correct participant JID for WhatsApp quote:
    // If quoting a message from a contact:
    // - In 1-on-1 chats: participant is ALWAYS the contact's canonical WhatsApp JID (phoneToSend, e.g. 554491529987@s.whatsapp.net)
    // - In group chats: participant is the specific member's JID (qMsg.participant_jid)
    if (quotedSenderType === "contact") {
      if (
        qMsg?.participant_jid &&
        qMsg.participant_jid.includes("@") &&
        !qMsg.participant_jid.includes("@s.whatsapp.net")
      ) {
        finalParticipant = qMsg.participant_jid.replace(/:\d+@/, "@");
      } else {
        finalParticipant = phoneToSend.includes("@")
          ? phoneToSend.replace(/:\d+@/, "@")
          : `${phoneToSend}@s.whatsapp.net`;
      }
    } else {
      // If quoting an agent / company message (fromMe):
      // On WhatsApp 1-on-1 chats, quoting your own message does NOT take a participant field!
      finalParticipant = undefined;
    }

    const quoted = finalMessageId
      ? {
          messageId: finalMessageId,
          ...(finalParticipant && { participant: finalParticipant }),
        }
      : undefined;

    if (!data.isInternal) {
      if (data.mediaBase64 && data.mediaType && data.mediaType !== "text") {
        try {
          if (data.mediaBase64.startsWith("data:")) {
            const match = data.mediaBase64.match(
              /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/,
            );
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              const buffer = Buffer.from(base64Data, "base64");
              const ext = mimeType.split("/")[1] || "bin";
              const fileName = `${targetConversationId}/${Date.now()}.${ext}`;

              const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
                .from("media")
                .upload(fileName, buffer, {
                  contentType: mimeType,
                  upsert: false,
                  cacheControl: "31536000, must-revalidate",
                });

              if (!uploadError && uploadData) {
                const { data: publicUrlData } = supabaseAdmin.storage
                  .from("media")
                  .getPublicUrl(uploadData.path);
                mediaUrlToSend = publicUrlData.publicUrl;
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse or upload base64 to Supabase", e);
        }
      }

      if (provider === "zernio") {
        const { enviarMensagemZernio } = await import("@/lib/canais/zernio/adaptador");

        let mediaBuffer: Buffer | undefined;
        let mimeType: string | undefined;
        let fileName: string | undefined;

        if (data.mediaBase64 && data.mediaType !== "text") {
          if (data.mediaBase64.startsWith("data:")) {
            const match = data.mediaBase64.match(
              /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/,
            );
            if (match) {
              mimeType = match[1];
              mediaBuffer = Buffer.from(match[2], "base64");
              const ext = mimeType.split("/")[1] || "bin";
              fileName = `${targetConversationId}_${Date.now()}.${ext}`;
            }
          }
        }

        const { data: convThread } = await supabaseAdmin
          .from("conversations")
          .select("provider_thread_id")
          .eq("id", targetConversationId)
          .single();

        const resZernio = await enviarMensagemZernio({
          canal: canal!,
          destinatario: destino!,
          threadId: convThread?.provider_thread_id || null,
          texto: textToSend || "",
          mediaType: (data.mediaType as any) || "text",
          mediaBuffer,
          fileName,
          mimeType,
          quotedMessageId: finalMessageId,
        });

        evogoResponse = { id: resZernio.messageId };

        if (resZernio.threadId && resZernio.threadId !== convThread?.provider_thread_id) {
          await supabaseAdmin
            .from("conversations")
            .update({ provider_thread_id: resZernio.threadId })
            .eq("id", targetConversationId);
        }
      } else if (provider === "oficial") {
        const { sendCloudApiMessage } = await import("../server/whatsapp-cloud-api");
        try {
          const msgId = await sendCloudApiMessage(
            resolvedInstanceId!,
            phone,
            textToSend || "",
            data.mediaType,
            mediaUrlToSend,
            finalMessageId,
          );
          evogoResponse = { id: msgId };
        } catch (cloudErr: any) {
          console.error("[chat.functions] sendCloudApiMessage failed:", cloudErr);
          throw new Error(`Falha API Oficial: ${cloudErr.message || "Erro desconhecido"}`);
        }
      } else if (provider === "instagram") {
        // As credenciais vieram com o canal; esta consulta repetia a de `abrirCanal`.
        if (!canal?.contaId || !canal?.contaToken) {
          throw new Error("Instagram Account ID ou Token faltando");
        }
        const instance = {
          oficial_phone_number_id: canal.contaId,
          oficial_access_token: canal.contaToken,
          oficial_waba_id: canal.contaPaiId,
        };

        const payload: any = {
          recipient: { id: phone },
          messaging_type: "RESPONSE",
          message: {},
        };

        if (data.mediaBase64 && data.mediaType !== "text" && mediaUrlToSend) {
          let igMediaType = "image";
          if (data.mediaType === "video") igMediaType = "video";
          else if (data.mediaType === "audio") igMediaType = "audio";
          else if (data.mediaType === "document") igMediaType = "file";

          payload.message = {
            attachment: {
              type: igMediaType,
              payload: {
                url: mediaUrlToSend,
                is_reusable: false,
              },
            },
          };
        } else {
          payload.message = { text: textToSend || "" };
        }

        if (finalMessageId) {
          payload.reply_to = { mid: finalMessageId };
        }

        const isDirectToken = instance.oficial_access_token.startsWith("IGA");
        const pageId = instance.oficial_waba_id || "me";
        const endpoint = isDirectToken
          ? `https://graph.instagram.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`
          : `https://graph.facebook.com/v20.0/${pageId}/messages?access_token=${instance.oficial_access_token}`;

        let igRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let result = await igRes.json();

        // Se a API da Meta recusar o reply_to (ex: respondendo a menções de story, mensagens expiradas, etc), refaz sem o reply_to
        if (!igRes.ok && result.error?.code === 100 && payload.reply_to) {
          console.warn(
            "[chat.functions] Instagram rejected reply_to (possibly story mention or unsupported). Retrying without reply_to...",
          );
          delete payload.reply_to;

          igRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          result = await igRes.json();
        }

        if (!igRes.ok) {
          console.error("[chat.functions] Instagram sending error:", result);
          throw new Error(`Instagram Error: ${result.error?.message || "Unknown error"}`);
        }

        evogoResponse = {
          id: result.message_id,
          isInstagram: true,
          participant: instance.oficial_phone_number_id,
        };
      } else if (provider === "messenger") {
        // `contaId` guarda o Page ID quando a rede é Messenger.
        if (!canal?.contaId || !canal?.contaToken) {
          throw new Error("Facebook Page ID ou Token faltando");
        }
        const instance = {
          oficial_phone_number_id: canal.contaId,
          oficial_access_token: canal.contaToken,
        };

        const payload: any = {
          recipient: { id: phone },
          messaging_type: "RESPONSE",
          message: {},
        };

        if (data.mediaBase64 && data.mediaType !== "text" && mediaUrlToSend) {
          let fbMediaType = "image";
          if (data.mediaType === "video") fbMediaType = "video";
          else if (data.mediaType === "audio") fbMediaType = "audio";
          else if (data.mediaType === "document") fbMediaType = "file";

          payload.message = {
            attachment: {
              type: fbMediaType,
              payload: {
                url: mediaUrlToSend,
                is_reusable: false,
              },
            },
          };
        } else {
          payload.message = { text: textToSend || "" };
        }

        if (finalMessageId) {
          payload.reply_to = { mid: finalMessageId };
        }

        // Messenger utiliza o Page ID diretamente (oficial_phone_number_id armazena o Page ID)
        let fbRes = await fetch(
          `https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        let result = await fbRes.json();

        // Se a API da Meta recusar o reply_to (ex: respondendo a mensagens expiradas), refaz sem o reply_to
        if (!fbRes.ok && result.error?.code === 100 && payload.reply_to) {
          console.warn(
            "[chat.functions] Messenger rejected reply_to. Retrying without reply_to...",
          );
          delete payload.reply_to;

          fbRes = await fetch(
            `https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}/messages?access_token=${instance.oficial_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          result = await fbRes.json();
        }

        if (!fbRes.ok) {
          console.error("[chat.functions] Messenger sending error:", result);
          throw new Error(`Messenger Error: ${result.error?.message || "Unknown error"}`);
        }

        evogoResponse = {
          id: result.message_id,
          isMessenger: true,
          participant: instance.oficial_phone_number_id,
        };
      } else if (provider === "stevo") {
        if (data.mediaBase64 && data.mediaType && data.mediaType !== "text") {
          evogoResponse = await sendStevoMedia({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phoneToSend,
            base64: mediaUrlToSend!,
            mediatype: data.mediaType as any,
            caption: textToSend,
            quoted,
          });
        } else if (textToSend.match(/https?:\/\//)) {
          evogoResponse = await sendStevoLink({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phoneToSend,
            text: textToSend,
            quoted,
          });
        } else {
          evogoResponse = await sendStevoText({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phoneToSend,
            text: textToSend,
            quoted,
          });
        }
      } else {
        if (data.mediaBase64 && data.mediaType && data.mediaType !== "text") {
          evogoResponse = await sendEvogoMedia({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phoneToSend,
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
            number: phoneToSend,
            text: textToSend,
            quoted,
          });
        } else {
          evogoResponse = await sendEvogoText({
            host: host!,
            token: token!,
            instanceName: instanceName!,
            number: phoneToSend,
            text: textToSend,
            quoted,
          });
        }
      }
    }

    // Extract remote message id if available
    const remoteMsgId =
      evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;

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
    if (quotedContent) insertPayload.quoted_content = quotedContent;
    if (evogoResponse?.data?.Info?.Sender)
      insertPayload.participant_jid = evogoResponse.data.Info.Sender;
    if (evogoResponse?.isInstagram && evogoResponse?.participant)
      insertPayload.participant_jid = evogoResponse.participant;
    const evogoChatJid = evogoResponse?.data?.Info?.Chat;
    if (evogoChatJid) {
      insertPayload.metadata = { chat_jid: evogoChatJid };
    } else if (phoneToSend && phoneToSend.includes("@")) {
      insertPayload.metadata = { chat_jid: phoneToSend };
    }

    // 5. Save message in DB and update conversation in parallel
    const convUpdate: any = { last_message_at: new Date().toISOString() };
    if (conv.status === "resolved") {
      convUpdate.status = "active";
      convUpdate.assigned_agent_id = userId;
      convUpdate.resolved_at = null;
    } else if (conv.status === "waiting") {
      convUpdate.status = "active";
      convUpdate.assigned_agent_id = userId;
    }

    const [msgRes] = await Promise.all([
      supabase.from("messages").insert(insertPayload).select().single(),
      supabaseAdmin.from("conversations").update(convUpdate).eq("id", targetConversationId),
    ]);

    if (msgRes.error) {
      console.error("Failed to save message in DB:", msgRes.error);
      throw new Error("Message sent but failed to save in history.");
    }

    return { success: true, message: msgRes.data };
  });

export const sendProactiveMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      phone: z.string().min(10),
      text: z.string().optional(),
      instanceName: z.string().min(1),
      companyId: z.string().uuid(),
    }),
  )
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
    const unitId = instance.unit_id || null;

    if (!host || !token) {
      throw new Error("EvoGo is not fully configured for this instance.");
    }

    // 2. Format phone
    let rawPhone = data.phone.replace(/\D/g, "");
    if (!rawPhone.startsWith("55")) rawPhone = "55" + rawPhone; // basic br fallback

    // 3. Get user profile for signature & role
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("name, use_signature, department_id, role")
      .eq("id", userId)
      .single();

    const isOpeningOnly = !data.text || data.text.trim() === "";
    const isAdminOrManager =
      userProfile?.role === "admin_company" ||
      userProfile?.role === "super_admin" ||
      userProfile?.role === "manager";

    let textToSend = data.text;
    const shouldSign = userProfile?.use_signature !== false && !!userProfile?.name;
    if (textToSend && shouldSign) {
      const signaturePrefix = `*${userProfile.name}*:`;
      if (!textToSend.startsWith(signaturePrefix)) {
        textToSend = textToSend.trim() ? `${signaturePrefix}\n${textToSend}` : signaturePrefix;
      }
    }

    // 4. Find or create Contact
    let contactIds: string[] = [];
    const phoneVariants = getPhoneVariants(rawPhone);
    const { data: existingContacts } = await supabaseAdmin
      .from("contacts")
      .select("id, merged_into_id")
      .eq("company_id", data.companyId)
      .in("phone", phoneVariants);

    if (existingContacts && existingContacts.length > 0) {
      contactIds = existingContacts.map((c) => c.merged_into_id || c.id);
    } else {
      const { data: newContact, error: contactErr } = await supabaseAdmin
        .from("contacts")
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
        console.error("[sendProactiveMessage] syncContactProfile failed:", err);
      }
    }

    const contactId = contactIds[0];

    // 5. Find or create Conversation
    let conversationId;
    const { data: latestConvs } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, status, assigned_agent_id, assigned_agent:profiles!conversations_assigned_agent_id_fkey(name)",
      )
      .in("contact_id", contactIds)
      .eq("whatsapp_instance_id", instance.id)
      .order("started_at", { ascending: false })
      .limit(1);

    if (latestConvs && latestConvs.length > 0) {
      const conv = latestConvs[0];
      conversationId = conv.id;

      if (conv.status === "active") {
        const isWithAnotherAgent = Boolean(
          conv.assigned_agent_id && conv.assigned_agent_id !== userId,
        );

        if (isWithAnotherAgent && !isAdminOrManager) {
          if (isOpeningOnly) {
            throw new Error(
              `Este contato já está em andamento com o(a) atendente ${(conv as any).assigned_agent?.name || "outro(a) atendente"} nesta instância. Apenas administradores podem abrir atendimentos de outros atendentes.`,
            );
          } else {
            throw new Error(
              `Este contato já está em andamento com o(a) atendente ${(conv as any).assigned_agent?.name || "outro(a) atendente"} nesta instância. Peça a ele(a) para te transferir.`,
            );
          }
        }

        if (!isOpeningOnly) {
          const updatePayload: any = {
            last_message_at: new Date().toISOString(),
          };
          if (!conv.assigned_agent_id) {
            updatePayload.assigned_agent_id = userId;
            updatePayload.department_id = userProfile?.department_id || null;
          }
          await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);
        }
        // Se isOpeningOnly e for admin, apenas retorna o conversationId para abrir
      } else {
        // waiting or resolved
        const isWithAnotherAgent = Boolean(
          conv.assigned_agent_id && conv.assigned_agent_id !== userId,
        );
        if (isWithAnotherAgent && !isAdminOrManager) {
          throw new Error(
            `Este contato já está atribuído ao(à) atendente ${(conv as any).assigned_agent?.name || "outro(a) atendente"}. Apenas administradores podem acessar.`,
          );
        }

        if (!isOpeningOnly) {
          // Se enviou mensagem e não tem ninguém com ela (ou é admin), reabre e atribui para o remetente
          const updatePayload: any = {
            last_message_at: new Date().toISOString(),
            status: "active",
            assigned_agent_id: userId,
            department_id: userProfile?.department_id || null,
            resolved_at: null,
          };

          const { data: convData } = await supabaseAdmin
            .from("conversations")
            .select("current_session_id")
            .eq("id", conversationId)
            .single();
          const currentSessionId = convData?.current_session_id;

          // Force new session if resolved, or if missing session
          if (conv.status === "resolved" || !currentSessionId) {
            const { data: newSession } = await supabaseAdmin
              .from("conversation_sessions")
              .insert({
                conversation_id: conversationId,
                contact_id: contactId,
                whatsapp_instance_id: instance.id,
                assigned_agent_id: userId,
                department_id: userProfile?.department_id || null,
                started_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (newSession) {
              updatePayload.current_session_id = newSession.id;
              await supabaseAdmin.from("session_events").insert([
                { session_id: newSession.id, event_type: "started", actor_id: userId },
                {
                  session_id: newSession.id,
                  event_type: "assigned",
                  actor_id: userId,
                  metadata: { assigned_to: userId },
                },
              ]);
            }
          } else if (currentSessionId && conv.status === "waiting") {
            // Record assignment event for existing waiting session
            await supabaseAdmin.from("session_events").insert({
              session_id: currentSessionId,
              event_type: "assigned",
              actor_id: userId,
              metadata: { assigned_to: userId },
            });
          }

          await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);
        }
      }
    } else {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          unit_id: unitId,
          contact_id: contactId,
          channel: "whatsapp",
          status: "active",
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
      const { data: existingSession } = await supabaseAdmin
        .from("conversation_sessions")
        .select("id")
        .eq("conversation_id", conversationId)
        .is("resolved_at", null)
        .maybeSingle();
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const { data: newSession } = await supabaseAdmin
          .from("conversation_sessions")
          .insert({
            conversation_id: conversationId,
            contact_id: contactId,
            whatsapp_instance_id: instance.id,
            assigned_agent_id: userId,
            department_id: userProfile?.department_id || null,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (newSession) sessionId = newSession.id;
      }

      if (sessionId) {
        await supabaseAdmin
          .from("conversations")
          .update({ current_session_id: sessionId })
          .eq("id", conversationId);
        await supabaseAdmin
          .from("session_events")
          .insert({ session_id: sessionId, event_type: "started", actor_id: userId });
      }
    }

    // 6. Send message via EvoGo and save in DB (only if text is provided and not just opening)
    if (!isOpeningOnly && textToSend) {
      await sendEvogoText({
        host,
        token,
        instanceName,
        number: rawPhone,
        text: textToSend,
      });

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: userId,
        content: textToSend,
        media_type: "text",
      });

      if (msgErr) {
        console.error("Failed to save message in DB:", msgErr);
      } else {
        await supabaseAdmin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString(), status: "active" })
          .eq("id", conversationId);
      }
    }

    return { success: true, conversationId };
  });

export const fetchContactInfoAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      contactId: z.string().uuid(),
      unitId: z.string().uuid().optional().nullable(),
      whatsappInstanceId: z.string().uuid().optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let whatsappInstanceId = data.whatsappInstanceId;
    if (!whatsappInstanceId) {
      const { data: convData } = await supabaseAdmin
        .from("conversations")
        .select("whatsapp_instance_id")
        .eq("contact_id", data.contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (convData?.whatsapp_instance_id) whatsappInstanceId = convData.whatsapp_instance_id;
    }

    // Get contact phone
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone")
      .eq("id", data.contactId)
      .single();
    if (!contact?.phone) return null;

    let host, token, instanceName;
    if (whatsappInstanceId) {
      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("instance_name, evogo_api_key, companies(evogo_host)")
        .eq("id", whatsappInstanceId)
        .single();

      if (instance) {
        host =
          instance.custom_host ||
          (instance.provider === "stevo"
            ? instance.companies?.stevo_host
            : instance.companies?.evogo_host);
        token = instance.provider === "stevo" ? instance.stevo_api_key : instance.evogo_api_key;
        instanceName = instance.instance_name;
      }
    } else {
      // Fallback for old conversations
      const { data: contactFull } = await supabase
        .from("contacts")
        .select("company_id")
        .eq("id", data.contactId)
        .single();
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
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: token,
        },
        body: JSON.stringify({ number: contact.phone, preview: false }),
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
  .inputValidator(
    z.object({
      unitId: z.string().uuid(),
      name: z.string().min(1),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("company_id")
      .eq("unit_id", data.unitId)
      .limit(1)
      .maybeSingle();

    if (!instance?.company_id) return { success: false, error: "Empresa não encontrada" };

    const randomColor = `#${Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")}`;
    const newLabel = {
      company_id: instance.company_id,
      name: data.name,
      color: data.color || randomColor,
      external_id: crypto.randomUUID(), // using local UUID as external_id for consistency
    };

    const { data: label, error } = await supabaseAdmin
      .from("labels")
      .insert(newLabel)
      .select()
      .single();
    if (error) {
      console.error("Failed to create label:", error);
      return { success: false, error: "Falha ao criar etiqueta" };
    }

    return { success: true, label };
  });

export const toggleContactLabelAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      unitId: z.string().uuid(),
      contactId: z.string().uuid(),
      labelId: z.string().uuid(),
      action: z.enum(["add", "remove"]),
    }),
  )
  .handler(async ({ data, context }) => {
    // Local system labels management
    if (data.action === "add") {
      const { error } = await supabaseAdmin
        .from("contact_labels")
        .upsert(
          { contact_id: data.contactId, label_id: data.labelId },
          { onConflict: "contact_id, label_id" },
        );
      if (error) {
        console.error("Failed to insert contact_label locally:", error);
        return { success: false };
      }
    } else {
      const { error } = await supabaseAdmin
        .from("contact_labels")
        .delete()
        .eq("contact_id", data.contactId)
        .eq("label_id", data.labelId);
      if (error) {
        console.error("Failed to delete contact_label locally:", error);
        return { success: false };
      }
    }
  });

export const reactToMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      messageId: z.string().uuid(),
      emoji: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    // 1. Get conversation and message
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, whatsapp_instance_id, unit_id, contact_id, channel, remote_id, contacts(phone, whatsapp_lid, instagram_id, messenger_id)",
      )
      .eq("id", data.conversationId)
      .single();

    if (!conv) throw new Error("Conversa não encontrada.");

    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("id, remote_msg_id, sender_type, participant_jid, reactions, metadata, is_internal")
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Mensagem não encontrada.");

    // Internal notes don't have remote WhatsApp reactions
    if (msg.is_internal || !msg.remote_msg_id) {
      const newReactions = data.emoji.trim() ? { [data.emoji.trim()]: 1 } : {};
      await supabaseAdmin
        .from("messages")
        .update({ reactions: newReactions })
        .eq("id", data.messageId);
      return { success: true };
    }

    // 2. Open canal
    const canal = await abrirCanal({
      id: conv.id,
      channel: conv.channel as string,
      unit_id: conv.unit_id,
      whatsapp_instance_id: conv.whatsapp_instance_id,
    });

    const provider = canal.provedor;
    const host = canal.host;
    const token = canal.token;
    const instanceName = canal.instanceName;

    // 3. Send Reaction based on provider
    try {
      if (provider === "instagram" || provider === "messenger") {
        const destino = destinatarioDe(canal, conv, conv.contacts);
        const recipientId = destino.identificador;
        const pageToken = canal.contaToken;
        const pageId = canal.contaId;

        if (!pageToken || !pageId) throw new Error("Credenciais do canal incompletas.");

        const isDirectToken = pageToken.startsWith("IGA");
        const endpoint =
          provider === "instagram" && isDirectToken
            ? `https://graph.instagram.com/v20.0/${pageId}/messages?access_token=${pageToken}`
            : `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`;

        const emojiMap: Record<string, string> = {
          "❤️": "love",
          "👍": "like",
          "😢": "sad",
          "😠": "angry",
          "😡": "angry",
          "😮": "wow",
          "😲": "wow",
          "😂": "laugh",
          "😆": "laugh",
          "👍🏻": "like",
          "👍🏼": "like",
          "👍🏽": "like",
          "👍🏾": "like",
          "👍🏿": "like",
        };

        const payload: any = {
          recipient: { id: recipientId },
          sender_action: "react",
          payload: { message_id: msg.remote_msg_id },
        };

        if (data.emoji.trim()) {
          if (provider === "messenger") {
            payload.payload.reaction = emojiMap[data.emoji.trim()] || "like";
          } else {
            payload.payload.reaction = data.emoji.trim();
          }
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error(`Meta API Reaction Error:`, await res.text());
        }
      } else if (provider === "oficial") {
        if (!canal.contaToken || !canal.contaId) throw new Error("Missing Meta tokens");
        const cleanPhone = (conv.contacts?.phone || "").replace(/\D/g, "");
        const endpoint = `https://graph.facebook.com/v20.0/${canal.contaId}/messages`;
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "reaction",
          reaction: {
            message_id: msg.remote_msg_id,
            emoji: data.emoji.trim(),
          },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${canal.contaToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error(`Cloud API Reaction Error:`, await res.text());
        }
      } else {
        // EvoGo / Stevo
        if (!host || !token || !instanceName) {
          throw new Error("A conexão WhatsApp desta conversa não está configurada.");
        }

        const chatJid = await resolveWhatsAppChatJid({
          conversationId: conv.id,
          channel: conv.channel,
          remoteId: conv.remote_id,
          rawPhone: conv.contacts?.phone,
          messageMetadata: msg.metadata,
          host,
          token,
          provider,
        });

        const fromMe = msg.sender_type !== "contact";
        const isGroup =
          conv.channel === "whatsapp_group" || (conv.remote_id && conv.remote_id.includes("@g.us"));
        const participant = isGroup ? msg.participant_jid || undefined : undefined;
        // In WhatsApp protocol, clearing a reaction is sending a space " "
        const reactionText = data.emoji.trim() ? data.emoji.trim() : " ";

        if (provider === "stevo") {
          await sendStevoReaction({
            host,
            token,
            number: chatJid,
            remoteMsgId: msg.remote_msg_id,
            emoji: reactionText,
            fromMe,
            participant,
          });
        } else {
          await sendEvogoReaction({
            host,
            token,
            number: chatJid,
            remoteMsgId: msg.remote_msg_id,
            emoji: reactionText,
            fromMe,
            participant,
          });
        }
      }
    } catch (err: any) {
      console.error("Reaction API failed:", err);
      throw new Error(`Falha ao reagir à mensagem no WhatsApp: ${err.message || String(err)}`);
    }

    // 4. Update DB
    // No WhatsApp 1:1, a reação substitui a anterior
    const newReactions = data.emoji.trim() ? { [data.emoji.trim()]: 1 } : {};
    await supabaseAdmin
      .from("messages")
      .update({ reactions: newReactions })
      .eq("id", data.messageId);

    return { success: true };
  });

export const assignConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
    }),
  )
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
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("current_session_id, contact_id, whatsapp_instance_id")
      .eq("id", data.conversationId)
      .single();
    if (conv?.current_session_id) {
      await supabaseAdmin
        .from("conversation_sessions")
        .update({
          assigned_agent_id: userId,
          department_id: userProfile?.department_id || null,
        })
        .eq("id", conv.current_session_id);
      await supabaseAdmin.from("session_events").insert({
        session_id: conv.current_session_id,
        event_type: "assigned",
        actor_id: userId,
      });
    } else if (conv) {
      // fallback caso a sessão não exista (retrocompatibilidade)
      let sessionId = null;
      const { data: existingSession } = await supabaseAdmin
        .from("conversation_sessions")
        .select("id")
        .eq("conversation_id", data.conversationId)
        .is("resolved_at", null)
        .maybeSingle();
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const { data: newSession } = await supabaseAdmin
          .from("conversation_sessions")
          .insert({
            conversation_id: data.conversationId,
            contact_id: conv.contact_id,
            whatsapp_instance_id: conv.whatsapp_instance_id,
            assigned_agent_id: userId,
            department_id: userProfile?.department_id || null,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (newSession) sessionId = newSession.id;
      }
      if (sessionId) {
        await supabaseAdmin
          .from("conversations")
          .update({ current_session_id: sessionId })
          .eq("id", data.conversationId);
        await supabaseAdmin
          .from("session_events")
          .insert({ session_id: sessionId, event_type: "assigned", actor_id: userId });
      }
    }

    return { success: true };
  });

export const transferConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      targetType: z.enum(["department", "agent"]),
      targetId: z.string().uuid(),
    }),
  )
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
        const roundRobinAgent = await assignDepartmentRoundRobin(
          convInfo.company_id,
          data.targetId,
          unitId,
        );

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
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("current_session_id")
      .eq("id", data.conversationId)
      .single();
    let targetName = null;
    if (data.targetType === "agent") {
      const { data: agent } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", data.targetId)
        .single();
      if (agent) targetName = agent.name;
    } else if (data.targetType === "department") {
      const { data: dept } = await supabaseAdmin
        .from("departments")
        .select("name")
        .eq("id", data.targetId)
        .single();
      if (dept) targetName = dept.name;
    }

    if (conv?.current_session_id) {
      await supabaseAdmin
        .from("conversation_sessions")
        .update({
          assigned_agent_id: updateData.assigned_agent_id || null,
          department_id: updateData.department_id || null,
        })
        .eq("id", conv.current_session_id);
      await supabaseAdmin.from("session_events").insert({
        session_id: conv.current_session_id,
        event_type: "transferred",
        actor_id: userId,
        metadata: { targetType: data.targetType, targetId: data.targetId, targetName },
      });
    } else if (conv) {
      let sessionId = null;
      const { data: existingSession } = await supabaseAdmin
        .from("conversation_sessions")
        .select("id")
        .eq("conversation_id", data.conversationId)
        .is("resolved_at", null)
        .maybeSingle();
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const { data: newSession } = await supabaseAdmin
          .from("conversation_sessions")
          .insert({
            conversation_id: data.conversationId,
            contact_id: conv.contact_id,
            whatsapp_instance_id: conv.whatsapp_instance_id,
            assigned_agent_id: updateData.assigned_agent_id || null,
            department_id: updateData.department_id || null,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (newSession) sessionId = newSession.id;
      }
      if (sessionId) {
        await supabaseAdmin
          .from("conversations")
          .update({ current_session_id: sessionId })
          .eq("id", data.conversationId);
        await supabaseAdmin.from("session_events").insert({
          session_id: sessionId,
          event_type: "transferred",
          actor_id: userId,
          metadata: { targetType: data.targetType, targetId: data.targetId, targetName },
        });
      }
    }

    // Criar notificação para o atendente recebendo
    if (data.targetType === "agent") {
      const { data: actorProfile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();
      const { data: convData } = await supabaseAdmin
        .from("conversations")
        .select("channel, contacts(company_id, name, phone)")
        .eq("id", data.conversationId)
        .single();

      if (convData && actorProfile && convData.contacts?.company_id) {
        const contactName = convData.contacts?.name || convData.contacts?.phone || "um contato";
        await supabaseAdmin.from("notifications" as any).insert({
          company_id: convData.contacts.company_id,
          user_id: data.targetId,
          type: `transfer_${convData.channel || "whatsapp"}`,
          title: "Novo Atendimento",
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
    let convData: any = null;

    if (instanceId) {
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id, whatsapp_instance_id, provider_thread_id, channel")
        .eq("contact_id", contactId)
        .eq("whatsapp_instance_id", instanceId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      convData = conv;
    } else {
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id, whatsapp_instance_id, provider_thread_id, channel")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      convData = conv;
      if (conv?.whatsapp_instance_id) instanceId = conv.whatsapp_instance_id;
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone, instagram_id, instagram_username, company_id, profile_picture_url")
      .eq("id", contactId)
      .maybeSingle();

    if (contactErr || !contact) {
      return { success: false, message: "Contato não encontrado (talvez tenha sido excluído)." };
    }

    let instance: any = null;
    if (instanceId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select(
          "id, instance_name, provider, network, zernio_account_id, evogo_api_key, stevo_api_key, custom_host, companies(id, zernio_api_key, zernio_base_url, evogo_host, stevo_host)",
        )
        .eq("id", instanceId)
        .maybeSingle();
      instance = data;
    } else if (contact.company_id) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select(
          "id, instance_name, provider, network, zernio_account_id, evogo_api_key, stevo_api_key, custom_host, companies(id, zernio_api_key, zernio_base_url, evogo_host, stevo_host)",
        )
        .eq("company_id", contact.company_id)
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    // Caso A: Instância conectada via Zernio (WhatsApp ou Instagram)
    if (instance && instance.provider === "zernio") {
      const apiKey = instance.companies?.zernio_api_key;
      const baseUrl = instance.companies?.zernio_base_url;

      if (!apiKey) {
        return { success: false, message: "Chave da Zernio não configurada na empresa." };
      }

      const zClient = new ZernioClient({ apiKey, baseUrl });
      const isInstagram =
        instance.network === "instagram" ||
        convData?.channel === "instagram" ||
        Boolean(contact.instagram_id || contact.instagram_username);

      if (isInstagram) {
        let cData: any = null;

        if (convData?.provider_thread_id) {
          cData = await zClient.getConversation(
            convData.provider_thread_id,
            instance.zernio_account_id,
          );
        }

        if (!cData) {
          const list = await zClient.listConversations({
            accountId: instance.zernio_account_id,
            limit: 50,
          });
          cData = list.find((c: any) => {
            const pid = String(c.participantId || c.id || "");
            const puser = String(c.participantUsername || "").toLowerCase();
            return (
              (contact.instagram_id && pid === String(contact.instagram_id)) ||
              (contact.instagram_username && puser === contact.instagram_username.toLowerCase())
            );
          });
        }

        if (cData) {
          const pic = cData.participantPicture || cData.participantProfilePicture;
          let permanentUrl: string | null = null;
          if (pic) {
            permanentUrl = await persistirAvatarContatoNoStorage(contactId, pic);
          }

          const updatePayload: Record<string, any> = {};
          if (permanentUrl || pic) {
            updatePayload.profile_picture_url = permanentUrl || pic;
          }
          if (
            cData.participantName &&
            (!contact.name ||
              contact.name.startsWith("Usuário Instagram") ||
              contact.name.startsWith("Instagram User") ||
              contact.name === `@${contact.instagram_username}`)
          ) {
            updatePayload.name = cData.participantName;
          }
          if (cData.participantUsername && !contact.instagram_username) {
            updatePayload.instagram_username = cData.participantUsername;
          }

          if (Object.keys(updatePayload).length > 0) {
            await supabaseAdmin.from("contacts").update(updatePayload).eq("id", contactId);
          }

          return {
            success: true,
            updatedName: updatePayload.name || contact.name || "Foto Encontrada",
            avatarFound: Boolean(permanentUrl || pic),
            message:
              permanentUrl || pic
                ? "Foto e perfil do Instagram sincronizados com sucesso!"
                : "Perfil do Instagram sincronizado.",
          };
        }

        return {
          success: false,
          message: "Nenhuma conversa do Instagram encontrada na Zernio para este perfil.",
        };
      }

      // WhatsApp na Zernio (Meta Cloud API)
      let cData: any = null;
      if (convData?.provider_thread_id) {
        cData = await zClient.getConversation(
          convData.provider_thread_id,
          instance.zernio_account_id,
        );
      }

      const pic = cData?.participantPicture || cData?.participantProfilePicture;
      if (pic) {
        const permanentUrl = await persistirAvatarContatoNoStorage(contactId, pic);
        await supabaseAdmin
          .from("contacts")
          .update({ profile_picture_url: permanentUrl || pic })
          .eq("id", contactId);

        return {
          success: true,
          updatedName: cData.participantName || "Foto Encontrada",
          avatarFound: true,
          message: "Foto de perfil do WhatsApp atualizada!",
        };
      }

      return {
        success: false,
        message:
          "A API Oficial do WhatsApp (Meta Cloud API) não disponibiliza foto de perfil de clientes por motivos de privacidade da Meta.",
      };
    }

    // Caso B: Instâncias WhatsApp via EvoGo ou Stevo
    if (!contact.phone) {
      return {
        success: false,
        message: "Contato sem número de telefone para consulta no WhatsApp.",
      };
    }

    const host =
      instance?.custom_host ||
      (instance?.provider === "stevo"
        ? instance?.companies?.stevo_host
        : instance?.companies?.evogo_host);
    const token =
      instance?.provider === "stevo" ? instance?.stevo_api_key : instance?.evogo_api_key;
    const instanceName = instance?.instance_name;

    if (!host || !token || !instanceName) {
      return {
        success: false,
        message: "Provedor WhatsApp não configurado para esta unidade/empresa.",
      };
    }

    let pushName = null;
    let avatarUrl = null;
    const jid = contact.phone.includes("@") ? contact.phone : `${contact.phone}@s.whatsapp.net`;

    try {
      console.log(
        `[syncContactProfile] Fetching info for ${jid} on ${host} (Instance: ${instanceName})`,
      );
      const resInfo = await fetch(`${host}/user/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ number: [jid] }),
        signal: AbortSignal.timeout(5000),
      });

      if (resInfo.ok) {
        const jsonInfo = await resInfo.json();
        pushName =
          jsonInfo.name || jsonInfo.pushName || jsonInfo.pushname || jsonInfo.contactName || null;
      }
    } catch (e) {
      console.warn("[syncContactProfile] Failed to fetch user info:", e);
    }

    try {
      console.log(`[syncContactProfile] Fetching avatar for ${jid} (Instance: ${instanceName})`);
      const resAvatar = await fetch(`${host}/user/avatar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ number: jid, preview: true }),
        signal: AbortSignal.timeout(10000),
      });

      if (resAvatar.ok) {
        const jsonAvatar = await resAvatar.json();
        let finalUrl =
          jsonAvatar?.data?.url ||
          jsonAvatar.url ||
          jsonAvatar.profilePictureUrl ||
          jsonAvatar.picture ||
          null;

        let base64str = jsonAvatar.avatar;
        if (base64str && !finalUrl) {
          if (!base64str.startsWith("data:")) {
            const mimeType = base64str.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
            base64str = `data:${mimeType};base64,${base64str}`;
          }
          finalUrl = base64str;
        }

        avatarUrl = finalUrl;
      }
    } catch (e) {
      console.warn("[syncContactProfile] Failed to fetch avatar via /user/avatar:", e);
    }

    let permanentAvatarUrl: string | null = null;
    if (avatarUrl) {
      permanentAvatarUrl = await persistirAvatarContatoNoStorage(contactId, avatarUrl);
    }

    const updatePayload: any = {};
    if (pushName) updatePayload.name = pushName;
    if (permanentAvatarUrl || avatarUrl) {
      updatePayload.profile_picture_url = permanentAvatarUrl || avatarUrl;
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabaseAdmin.from("contacts").update(updatePayload).eq("id", contactId);
    }

    if (pushName) {
      return {
        success: true,
        updatedName: pushName,
        avatarFound: !!(permanentAvatarUrl || avatarUrl),
      };
    } else if (permanentAvatarUrl || avatarUrl) {
      return {
        success: true,
        updatedName: "Foto Encontrada",
        avatarFound: true,
        message: "Foto de perfil atualizada e salva permanentemente!",
      };
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
  .inputValidator(
    z.object({
      contactId: z.string().uuid(),
      unitId: z.string().uuid().optional().nullable(),
      whatsappInstanceId: z.string().uuid().optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const res = await syncContactProfile(data.contactId, data.whatsappInstanceId);
    if (!res.success) {
      throw new Error(res.message);
    }
    return res;
  });

export const editMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      messageId: z.string().uuid(),
      newContent: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Get conversation and message
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, channel, whatsapp_instance_id, unit_id, contact_id, remote_id, assigned_agent_id, contacts(phone, whatsapp_lid)",
      )
      .eq("id", data.conversationId)
      .single();

    if (!conv) throw new Error("Conversa não encontrada.");

    // 1. Get message
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select(
        "id, remote_msg_id, sender_type, sender_id, media_type, metadata, is_internal, content, conversation_id",
      )
      .eq("id", data.messageId)
      .single();

    if (!msg) throw new Error("Mensagem não encontrada.");
    if (msg.sender_type !== "agent")
      throw new Error("Você só pode editar mensagens enviadas por um atendente.");
    if (msg.media_type && msg.media_type !== "text")
      throw new Error("Apenas mensagens de texto podem ser editadas.");

    // Check user permission (author, admin/manager, or assigned agent for webhook messages)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, name, use_signature")
      .eq("id", userId)
      .single();

    const isAdminOrManager = ["admin_company", "super_admin", "manager"].includes(
      profile?.role || "",
    );
    const isAssignedAgent = Boolean(conv?.assigned_agent_id && conv.assigned_agent_id === userId);

    const canEdit =
      isAdminOrManager ||
      msg.sender_id === userId ||
      (isAssignedAgent && (msg.sender_id === null || !msg.sender_id));

    if (!canEdit) {
      throw new Error("Você não tem permissão para editar esta mensagem.");
    }

    // 2. Format content with signature if enabled
    let textToSend = data.newContent;
    const shouldSign = !msg.is_internal && profile?.use_signature !== false && !!profile?.name;
    if (shouldSign) {
      const signaturePrefix = `*${profile.name}*:`;
      if (!textToSend.startsWith(signaturePrefix)) {
        textToSend = textToSend.trim() ? `${signaturePrefix}\n${textToSend}` : signaturePrefix;
      }
    }

    // 3. If internal note or non-remote message, update only in DB
    if (msg.is_internal || !msg.remote_msg_id) {
      const { error: updateErr } = await supabaseAdmin
        .from("messages")
        .update({
          content: textToSend,
          is_edited: true,
        })
        .eq("id", data.messageId);

      if (updateErr) {
        console.error("Failed to update note in DB:", updateErr);
        throw new Error("Falha ao salvar edição no banco de dados.");
      }
      return { success: true };
    }

    // 4. Resolve Canal and Credentials
    const canal = await abrirCanal({
      id: conv.id,
      channel: conv.channel as string,
      unit_id: conv.unit_id,
      whatsapp_instance_id: conv.whatsapp_instance_id,
    });

    const host = canal.host;
    const token = canal.token;
    const instanceName = canal.instanceName;
    const provider = canal.provedor;

    if (!host || !token || !instanceName) {
      throw new Error("A conexão WhatsApp desta conversa não está configurada corretamente.");
    }

    // Resolve canonical WhatsApp Chat JID
    const chatJid = await resolveWhatsAppChatJid({
      conversationId: conv.id,
      channel: conv.channel,
      remoteId: conv.remote_id,
      rawPhone: conv.contacts?.phone,
      messageMetadata: msg.metadata,
      host,
      token,
      provider,
    });

    // 5. Send Edit Request via WhatsApp API
    try {
      if (provider === "stevo") {
        await editStevoMessage({
          host,
          token,
          number: chatJid,
          remoteMsgId: msg.remote_msg_id,
          message: textToSend,
        });
      } else {
        await editEvogoMessage({
          host,
          token,
          number: chatJid,
          remoteMsgId: msg.remote_msg_id,
          message: textToSend,
        });
      }
    } catch (err: any) {
      console.error("WhatsApp Edit failed:", err);
      throw new Error(`Falha ao editar mensagem no WhatsApp: ${err.message || String(err)}`);
    }

    // 6. Update DB with edited content and save chat_jid in metadata
    const updatedMetadata = {
      ...(typeof msg.metadata === "object" && msg.metadata !== null ? msg.metadata : {}),
      chat_jid: chatJid,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({
        content: textToSend,
        is_edited: true,
        metadata: updatedMetadata,
      })
      .eq("id", data.messageId);

    if (updateErr) {
      console.error("Failed to update edited message in DB", updateErr);
    }

    return { success: true };
  });

export const deleteMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      messageId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 1. Get message
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("*, conversations(*, contacts(*))")
      .eq("id", data.messageId)
      .single();

    if (!msg) {
      throw new Error("Mensagem não encontrada.");
    }

    const conv = msg.conversations as any;
    if (!conv) {
      throw new Error("Conversa associada não encontrada.");
    }

    // Check permissions: sender, admin/manager, or assigned agent
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const isAdminOrManager = ["admin_company", "super_admin", "manager"].includes(
      profile?.role || "",
    );
    const isAssignedAgent = Boolean(conv?.assigned_agent_id && conv.assigned_agent_id === userId);

    const canDelete =
      isAdminOrManager ||
      msg.sender_id === userId ||
      (isAssignedAgent && (msg.sender_id === null || !msg.sender_id));

    if (!canDelete) {
      throw new Error("Você não tem permissão para apagar esta mensagem.");
    }

    // 2. If internal note or non-remote message, update only in DB
    if (msg.is_internal || !msg.remote_msg_id) {
      const { error: updateErr } = await supabaseAdmin
        .from("messages")
        .update({
          is_deleted: true,
        })
        .eq("id", data.messageId);

      if (updateErr) {
        console.error("Failed to mark internal message as deleted:", updateErr);
        throw new Error("Falha ao apagar nota.");
      }
      return { success: true };
    }

    // 3. Resolve Canal and Credentials
    const canal = await abrirCanal({
      id: conv.id,
      channel: conv.channel as string,
      unit_id: conv.unit_id,
      whatsapp_instance_id: conv.whatsapp_instance_id,
    });

    const host = canal.host;
    const token = canal.token;
    const instanceName = canal.instanceName;
    const provider = canal.provedor;

    if (!host || !token || !instanceName) {
      throw new Error("A conexão WhatsApp desta conversa não está configurada.");
    }

    // Resolve canonical WhatsApp Chat JID
    const chatJid = await resolveWhatsAppChatJid({
      conversationId: conv.id,
      channel: conv.channel,
      remoteId: conv.remote_id,
      rawPhone: conv.contacts?.phone,
      messageMetadata: msg.metadata,
      host,
      token,
      provider,
    });

    // 4. Send Delete Request via WhatsApp API
    try {
      if (provider === "stevo") {
        await deleteStevoMessage({
          host,
          token,
          number: chatJid,
          remoteMsgId: msg.remote_msg_id,
        });
      } else {
        await deleteEvogoMessage({
          host,
          token,
          number: chatJid,
          remoteMsgId: msg.remote_msg_id,
        });
      }
    } catch (err: any) {
      console.error("WhatsApp Delete failed:", err);
      throw new Error(`Falha ao apagar mensagem no WhatsApp: ${err.message || String(err)}`);
    }

    // 5. Update DB
    const updatedMetadata = {
      ...(typeof msg.metadata === "object" && msg.metadata !== null ? msg.metadata : {}),
      chat_jid: chatJid,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({
        is_deleted: true,
        metadata: updatedMetadata,
      })
      .eq("id", data.messageId);

    if (updateErr) {
      console.error("Failed to update deleted message in DB", updateErr);
    }

    return { success: true };
  });

export const transcribeAudioAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      messageId: z.string().uuid(),
    }),
  )
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
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    if (
      !company?.ai_settings?.engines?.transcription ||
      company.ai_settings.engines.transcription === "none"
    ) {
      throw new Error("Transcrição de IA não está habilitada.");
    }

    const provider = company.ai_settings.engines.transcription;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // Detectar se é URL HTTP (gravação Wavoip) ou base64 inline (áudio WhatsApp)
    let base64Audio: string;
    let audioFormat = "ogg"; // padrão para WhatsApp

    if (msg.media_url.startsWith("http://") || msg.media_url.startsWith("https://")) {
      // URL HTTP direta — precisa fazer download (gravações Wavoip)
      const urlPath = new URL(msg.media_url).pathname.toLowerCase();
      audioFormat = urlPath.endsWith(".mp3")
        ? "mp3"
        : urlPath.endsWith(".wav")
          ? "wav"
          : urlPath.endsWith(".m4a")
            ? "m4a"
            : "mp3"; // fallback para Wavoip

      const audioRes = await fetch(msg.media_url);
      if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`);
      const arrayBuffer = await audioRes.arrayBuffer();
      base64Audio = Buffer.from(arrayBuffer).toString("base64");
    } else {
      // Base64 inline — áudio do WhatsApp (data:audio/ogg;base64,...)
      const extracted = msg.media_url.split(",")[1];
      if (!extracted) throw new Error("Áudio não possui formato base64 válido.");
      base64Audio = extracted;
      audioFormat = "ogg";
    }

    const mimeType =
      audioFormat === "mp3"
        ? "audio/mpeg"
        : audioFormat === "wav"
          ? "audio/wav"
          : audioFormat === "m4a"
            ? "audio/mp4"
            : "audio/ogg";
    const fileName = `audio.${audioFormat}`;

    let response;

    if (provider === "openrouter") {
      response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/whisper-1",
          input_audio: {
            data: base64Audio,
            format: audioFormat,
          },
        }),
      });
    } else {
      const buffer = Buffer.from(base64Audio, "base64");
      const blob = new Blob([buffer], { type: mimeType });
      const formData = new FormData();
      formData.append("file", blob, fileName);

      let baseUrl = "";
      if (provider === "groq") {
        baseUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
        formData.append("model", "whisper-large-v3-turbo");
      } else {
        baseUrl = "https://api.openai.com/v1/audio/transcriptions";
        formData.append("model", "whisper-1");
      }

      formData.append("language", "pt");
      formData.append("response_format", "json");

      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData as any,
      });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("[transcribeAudioAction] API Error:", response.status, err);
      throw new Error(`Falha na API de transcrição: ${response.status}`);
    }

    const apiData = await response.json();
    if (!apiData.text) {
      throw new Error("API retornou resposta sem texto.");
    }

    await supabaseAdmin
      .from("messages")
      .update({ transcription: apiData.text })
      .eq("id", data.messageId);

    return { success: true, text: apiData.text };
  });

export const fixMessageTextAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      text: z.string().min(1),
    }),
  )
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
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    const aiSettings = (company?.ai_settings as any) || {};

    // 1. Resolver o modelo desejado (personalizado > sales coach > chatbot ativo > fallback gpt-4o-mini)
    const resolvedModel = (
      aiSettings.text_correction_model ||
      aiSettings.sales_coach_model ||
      aiSettings.active_chatbot_model ||
      "openai/gpt-4o-mini"
    ).trim();

    // 2. Determinar o provedor configurado
    let configuredEngine = aiSettings.engines?.text;
    if (!configuredEngine || configuredEngine === "same_as_sales_coach") {
      // Usa o mesmo motor do chatbot/sales coach se configurado
      configuredEngine = aiSettings.engines?.chatbot;
    }

    // Lista ordenada de provedores a tentar com fallback automático
    const providerCandidates: ("openrouter" | "openai" | "groq")[] = [];

    if (
      configuredEngine &&
      configuredEngine !== "none" &&
      configuredEngine !== "same_as_sales_coach"
    ) {
      if (configuredEngine === "openrouter" && aiSettings.keys?.openrouter)
        providerCandidates.push("openrouter");
      if (configuredEngine === "openai" && aiSettings.keys?.openai)
        providerCandidates.push("openai");
      if (configuredEngine === "groq" && aiSettings.keys?.groq) providerCandidates.push("groq");
    }

    // Se o modelo especifica prefixo comum do OpenRouter ou se temos chave OpenRouter, colocar OpenRouter na lista
    if (aiSettings.keys?.openrouter && !providerCandidates.includes("openrouter")) {
      providerCandidates.push("openrouter");
    }
    if (aiSettings.keys?.openai && !providerCandidates.includes("openai")) {
      providerCandidates.push("openai");
    }
    if (aiSettings.keys?.groq && !providerCandidates.includes("groq")) {
      providerCandidates.push("groq");
    }

    if (providerCandidates.length === 0) {
      throw new Error("Nenhum provedor de IA com chave configurada para correção de texto.");
    }

    const systemPrompt =
      "Você é um revisor de texto de atendimento ao cliente. Reescreva o texto a seguir corrigindo erros gramaticais, de ortografia e de pontuação. Mantenha o texto amigável, profissional e com a mesma intenção original. Não adicione novas informações nem responda à mensagem, APENAS retorne o texto corrigido. Não coloque aspas no inicio e fim.";

    let correctedText = "";
    let lastError: any = null;

    for (const provider of providerCandidates) {
      try {
        const apiKey = aiSettings.keys?.[provider];
        if (!apiKey) continue;

        if (provider === "openrouter") {
          const modelName = resolvedModel.includes("/") ? resolvedModel : `openai/${resolvedModel}`;
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://atendi.app",
              "X-Title": "Atendi Chat",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: data.text },
              ],
              temperature: 0.2,
            }),
          });

          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error?.message || `OpenRouter erro HTTP ${response.status}`);
          }
          correctedText = json.choices?.[0]?.message?.content || "";
          if (correctedText) break;
        } else if (provider === "openai") {
          const directModel = resolvedModel.replace(/^openai\//, "");
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: directModel || "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: data.text },
              ],
              temperature: 0.2,
            }),
          });

          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error?.message || `OpenAI erro HTTP ${response.status}`);
          }
          correctedText = json.choices?.[0]?.message?.content || "";
          if (correctedText) break;
        } else if (provider === "groq") {
          const groqModel = resolvedModel.includes("llama") ? resolvedModel : "llama3-70b-8192";
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: groqModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: data.text },
              ],
              temperature: 0.2,
            }),
          });

          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error?.message || `Groq erro HTTP ${response.status}`);
          }
          correctedText = json.choices?.[0]?.message?.content || "";
          if (correctedText) break;
        }
      } catch (err: any) {
        console.warn(`[fixMessageTextAction] Falha com provedor ${provider}:`, err.message);
        lastError = err;
      }
    }

    if (!correctedText) {
      throw new Error(
        lastError?.message ||
          "Não foi possível corrigir o texto com os provedores de IA configurados.",
      );
    }

    let clean = correctedText.trim();
    clean = clean.replace(/^["'«»“](.*)["'«»”]$/s, "$1").trim();

    return { text: clean || data.text };
  });

export const transcribeCallAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      callId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    // 1. Buscar o call_log com a recording_url e company_id
    const { data: callLog } = await supabaseAdmin
      .from("call_logs")
      .select("id, recording_url, company_id")
      .eq("id", data.callId)
      .single();

    if (!callLog?.recording_url) {
      throw new Error("Gravação não disponível para esta chamada.");
    }

    // 2. Buscar configurações de IA da empresa
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("ai_settings")
      .eq("id", callLog.company_id)
      .single();

    if (
      !company?.ai_settings?.engines?.transcription ||
      company.ai_settings.engines.transcription === "none"
    ) {
      throw new Error("Transcrição de IA não está habilitada. Configure nas Configurações > IA.");
    }

    const provider = company.ai_settings.engines.transcription;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // 3. Detectar formato e fazer download
    const urlPath = new URL(callLog.recording_url).pathname.toLowerCase();
    const audioFormat = urlPath.endsWith(".mp3")
      ? "mp3"
      : urlPath.endsWith(".wav")
        ? "wav"
        : urlPath.endsWith(".m4a")
          ? "m4a"
          : "mp3";

    const audioRes = await fetch(callLog.recording_url);
    if (!audioRes.ok) throw new Error(`Falha ao baixar gravação: ${audioRes.status}`);
    const arrayBuffer = await audioRes.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    const mimeType =
      audioFormat === "mp3"
        ? "audio/mpeg"
        : audioFormat === "wav"
          ? "audio/wav"
          : audioFormat === "m4a"
            ? "audio/mp4"
            : "audio/ogg";
    const fileName = `audio.${audioFormat}`;

    // 4. Enviar para o Whisper
    let response;
    if (provider === "openrouter") {
      response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/whisper-1",
          input_audio: { data: base64Audio, format: audioFormat },
        }),
      });
    } else {
      const buffer = Buffer.from(base64Audio, "base64");
      const blob = new Blob([buffer], { type: mimeType });
      const formData = new FormData();
      formData.append("file", blob, fileName);

      let baseUrl = "";
      if (provider === "groq") {
        baseUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
        formData.append("model", "whisper-large-v3-turbo");
      } else {
        baseUrl = "https://api.openai.com/v1/audio/transcriptions";
        formData.append("model", "whisper-1");
      }
      formData.append("language", "pt");
      formData.append("response_format", "json");

      response = await fetch(baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData as any,
      });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("[transcribeCallAction] API Error:", response.status, err);
      throw new Error(`Falha na API de transcrição: ${response.status}`);
    }

    const apiData = await response.json();
    if (!apiData.text) throw new Error("API retornou resposta sem texto.");

    // 5. Salvar no call_log
    await supabaseAdmin
      .from("call_logs")
      .update({ transcription: apiData.text })
      .eq("id", data.callId);

    return { success: true, text: apiData.text };
  });

export const salesCoachAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
    }),
  )
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
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    const aiSettings = (company?.ai_settings as any) || {};
    let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text;

    if (!provider || provider === "none") {
      if (aiSettings.keys?.openai) provider = "openai";
      else if (aiSettings.keys?.openrouter) provider = "openrouter";
      else if (aiSettings.keys?.groq) provider = "groq";
    }

    if (!provider || provider === "none") {
      throw new Error("Geração de IA não está habilitada.");
    }

    const apiKey = aiSettings.keys?.[provider];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    // 3. Obter últimas mensagens
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, media_type")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (!messages || messages.length === 0) {
      throw new Error("Nenhuma mensagem para analisar.");
    }

    const formattedHistory = messages
      .reverse()
      .map((m) => {
        const role = m.sender_type === "contact" ? contactName : "Vendedor";
        const text = m.media_type === "text" ? m.content : `[Mídia: ${m.media_type}]`;
        return `${role}: ${text}`;
      })
      .join("\n");

    const playbookSummary = await getCompanyPlaybookSummary(companyId);

    let systemPrompt = aiSettings.sales_coach_prompt || "Você é um treinador de vendas de elite.";
    if (playbookSummary) {
      systemPrompt += `\n\n${playbookSummary}\n\nIMPORTANTE: Avalie se o atendimento do vendedor seguiu os procedimentos, explicações e regras oficiais do Playbook da empresa acima. Identifique se o vendedor deixou de usar os argumentos e benefícios oficiais da empresa.`;
    }
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
      if (provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: customModel || "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) throw new Error(`OpenAI Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === "groq") {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: customModel || "llama3-70b-8192",
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) throw new Error(`Groq Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === "openrouter") {
        const model = customModel || aiSettings.active_chatbot_model || "openai/gpt-oss-120b:free";
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter Erro: ${response.status} - ${errText}`);
        }
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      }
    } catch (e: any) {
      console.error("[salesCoachAction] Error:", e);
      throw new Error(`Falha ao gerar análise: ${e.message}`);
    }

    // 4. Salvar Análise no Banco
    const { error: insertError } = await supabaseAdmin.from("sales_coach_analyses").insert({
      conversation_id: data.conversationId,
      company_id: companyId,
      analysis_markdown: suggestion,
      created_by: userId,
    });

    if (insertError) {
      console.error("Erro ao salvar análise:", insertError);
    }

    return { success: true, suggestion: suggestion.trim() };
  });

export const salesCoachSuggestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
    }),
  )
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
      .from("sales_coach_analyses")
      .select("analysis_markdown")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestAnalysis) {
      throw new Error("Nenhuma análise encontrada. Gere a análise primeiro.");
    }

    // 2. Obter configurações de IA
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    const aiSettings = (company?.ai_settings as any) || {};
    let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text;

    if (!provider || provider === "none") {
      if (aiSettings.keys?.openai) provider = "openai";
      else if (aiSettings.keys?.openrouter) provider = "openrouter";
      else if (aiSettings.keys?.groq) provider = "groq";
    }

    if (!provider || provider === "none") {
      throw new Error("Geração de IA não está habilitada.");
    }

    const apiKey = aiSettings.keys?.[provider];
    if (!apiKey) throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);

    // 3. Obter últimas mensagens
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, media_type")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(5);

    const formattedHistory = (messages || [])
      .reverse()
      .map((m) => {
        const role = m.sender_type === "contact" ? contactName : "Vendedor";
        const text = m.media_type === "text" ? m.content : `[Mídia: ${m.media_type}]`;
        return `${role}: ${text}`;
      })
      .join("\n");

    const playbookSummary = await getCompanyPlaybookSummary(companyId);

    let systemPrompt =
      "Você é um treinador de vendas tático. Baseado na análise do atendimento e nas últimas mensagens abaixo, dê uma instrução RÁPIDA, TÁTICA e DIRETA para o vendedor sobre o que ele deve fazer agora.\n\n";
    if (playbookSummary) {
      systemPrompt += `${playbookSummary}\n\nDIRETRIZ OBRIGATÓRIA: Em "💬 Sugestão de fala", utilize EXATAMENTE os nomes dos procedimentos, diferenciais, formas de pagamento e argumentos oficiais da empresa listados no Playbook acima.\n\n`;
    }
    systemPrompt +=
      'Sua resposta deve obrigatoriamente seguir este formato em Markdown:\n**🎯 Objetivo:** [Qual o objetivo da próxima mensagem]\n**💡 Estratégia:** [Qual técnica de vendas usar]\n**💬 Sugestão de fala:** "[Uma ou duas frases bem curtas e naturais para o vendedor enviar]"\n\nNão escreva NADA fora desse formato.\n\n';
    systemPrompt += `=== ANÁLISE ===\n${latestAnalysis.analysis_markdown}\n\n`;
    systemPrompt += `=== ÚLTIMAS MENSAGENS ===\n${formattedHistory}`;

    let suggestion = "";

    try {
      const customModel = aiSettings.sales_coach_model;
      if (provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: customModel || "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) throw new Error(`OpenAI Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === "groq") {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: customModel || "llama3-70b-8192",
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) throw new Error(`Groq Erro: ${response.status}`);
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      } else if (provider === "openrouter") {
        const model = customModel || aiSettings.active_chatbot_model || "openai/gpt-oss-120b:free";
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "system", content: systemPrompt }],
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter Erro: ${response.status} - ${errText}`);
        }
        const json = await response.json();
        suggestion = json.choices[0].message.content;
      }
    } catch (e: any) {
      console.error("[salesCoachSuggestAction] Error:", e);
      throw new Error(`Falha ao gerar sugestão: ${e.message}`);
    }

    return { success: true, text: suggestion.trim() };
  });

// --- Shared Resolve Logic ---
export async function internalResolveConversation(
  conversationId: string,
  userId: string,
  reasonId?: string | null,
  observation?: string | null,
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
      assigned_agent_id: null,
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
      await supabaseAdmin
        .from("conversation_sessions")
        .update({
          resolved_at: resolvedAt,
          resolution_reason_id: reasonId || null,
          resolution_observation: observation?.trim() || null,
        })
        .eq("id", session.id);

      await supabaseAdmin.from("session_events").insert({
        session_id: session.id,
        event_type: "resolved",
        actor_id: userId,
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
      })
      .select()
      .single();

    if (newSession && !err) {
      await supabaseAdmin.from("session_events").insert({
        session_id: newSession.id,
        event_type: "resolved",
        actor_id: userId,
      });
    }
  }

  return { success: true };
}

export const resolveConversationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid(),
      reasonId: z.string().optional().nullable(),
      observation: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      await internalResolveConversation(
        data.conversationId,
        context.userId,
        data.reasonId,
        data.observation,
      );
      return { success: true };
    } catch (e: any) {
      console.error("[resolveConversationAction] Error:", e);
      throw new Error("Falha ao encerrar atendimento.");
    }
  });

export const blockContactAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      contactId: z.string().uuid(),
      reason: z.string().min(1, "O motivo é obrigatório"),
    }),
  )
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
  .inputValidator(
    z.object({
      contactId: z.string().uuid(),
    }),
  )
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
