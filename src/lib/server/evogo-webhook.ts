import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { conferirPorta } from "./webhook-auth";
import { getPhoneVariants } from "@/lib/utils";
import { enqueueAiMessage } from "./ai-queue";
import { syncContactProfile } from "@/lib/api/chat.functions";
import { extractExternalAdReply, processAndCacheAdPreview } from "./ad-preview-cache";
import { dispatchAutomationEvent } from "./automation-engine";
import { sendMetaCapiEvent } from "./meta-capi";
import { withWebhookLock } from "./webhook-lock";

// Called by server.ts - reads body and processes in background, returns 200 immediately
export async function handleEvogoWebhook(request: Request): Promise<Response> {
  try {
    /**
     * A tranca. O Evogo não assina o corpo, então a única que serve é o
     * segredo na URL: `?k=<EVOGO_WEBHOOK_SECRET>`.
     *
     * Enquanto a variável não estiver definida a porta segue aberta, com um
     * aviso por processo — fechar antes de trocar a URL no painel do provedor
     * derrubaria o atendimento de todos os clientes de uma vez.
     */
    const porta = await conferirPorta(request, {
      provedor: "evogo",
      segredoDaUrl: process.env.EVOGO_WEBHOOK_SECRET,
    });
    if (!porta.ok) return porta.resposta;

    const body = JSON.parse(porta.corpoBruto);

    // In serverless environments like Vercel, we MUST await the processing
    // otherwise the function is killed the moment we return the Response.
    // The previous timeout issue was largely due to blocking fs/console logging
    // which has been removed.
    await processEvogoWebhookBody(body);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook parse/process error:", err);
    return new Response("OK", { status: 200 });
  }
}

import * as fs from "fs";

function parseThumbnailBase64(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("base64");
  if (Array.isArray(raw)) return Buffer.from(raw).toString("base64");
  if (typeof raw === "object" && Array.isArray((raw as any).data)) {
    return Buffer.from((raw as any).data).toString("base64");
  }
  return null;
}

export async function processEvogoWebhookBody(body: any): Promise<void> {
  try {
    // Log webhook without base64 to avoid blocking Node.js with huge strings
    const logBody = JSON.parse(JSON.stringify(body));
    if (logBody?.data?.Message?.base64)
      logBody.data.Message.base64 = `[base64 ~${Math.round(logBody.data.Message.base64.length / 1024)}kB omitted]`;
    if (logBody?.data?.base64)
      logBody.data.base64 = `[base64 ~${Math.round(logBody.data.base64.length / 1024)}kB omitted]`;
    console.log(new Date().toISOString() + " WEBHOOK IN: " + JSON.stringify(logBody) + "\n");
    console.log("EvoGo Webhook received:", JSON.stringify(logBody, null, 2));

    // Dump to file for debugging
    try {
      // fs.writeFileSync('webhook-debug.json', JSON.stringify(logBody, null, 2));
    } catch (e) {
      console.error("Failed to write webhook-debug.json", e);
    }
    // --- Handle PushName (CTWA LID Resolution) ---
    if (body.event === "PushName") {
      const instanceName = body.instance || body.instanceName;
      const jid = body.data?.JID;
      const jidAlt = body.data?.JIDAlt;
      const newPushName = body.data?.NewPushName;

      if (
        instanceName &&
        jid &&
        jidAlt &&
        jid.includes("@lid") &&
        jidAlt.includes("@s.whatsapp.net")
      ) {
        const lidNumber = jid.split("@")[0];
        const realNumber = jidAlt.split("@")[0];

        const { data: instance } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("company_id")
          .eq("instance_name", instanceName)
          .single();

        if (instance) {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("id, phone")
            .eq("company_id", instance.company_id)
            .or(`phone.eq.${lidNumber},whatsapp_lid.eq.${lidNumber}`)
            .maybeSingle();

          if (contact) {
            const updatePayload: any = {
              whatsapp_lid: lidNumber,
              phone: realNumber,
            };
            if (newPushName && newPushName !== "Desconhecido") {
              updatePayload.name = newPushName;
            }
            await supabaseAdmin.from("contacts").update(updatePayload).eq("id", contact.id);
            console.log(
              `[evogo-webhook] CTWA LID Unificado: LID ${lidNumber} -> Real ${realNumber}`,
            );
          }
        }
      }
      return;
    }

    // Handle message.upsert (Baileys/Evolution API format) or Message/SendMessage (WhatsMeow/EvoGo format)
    if (
      body.event === "messages.upsert" ||
      body.event === "messages.update" ||
      body.event === "Message" ||
      body.event === "SendMessage"
    ) {
      const instanceName = body.instance || body.instanceName;

      let messageData;
      let isFromMe = false;
      let remoteJid = "";
      let pushName = "Desconhecido";
      let textContent = "";
      let phoneNumber: string | null = "";
      let mediaType = "text";
      let mediaUrl: string | null = null;
      let audioBase64: string | null = null;
      let remoteMsgId: string | null = null;
      let quotedStanzaId: string | null = null;
      let quotedContent: string | null = null;
      let actualGroupName: string | null = null;
      let extractedLid: string | null = null;

      const metadata: any = {};

      if (body.event === "Message" || body.event === "SendMessage") {
        // WhatsMeow / EvoGo native format
        const info = body.data?.Info;
        const msg = body.data?.Message;

        if (!info || !msg) return;

        // Ignorar mensagens de grupos, status/broadcasts e newsletters
        if (
          info.IsGroup ||
          info.Chat?.includes("@g.us") ||
          info.RecipientAlt?.includes("@g.us") ||
          info.Sender?.includes("@g.us") ||
          info.Chat?.includes("@broadcast") ||
          info.Chat?.includes("@newsletter")
        ) {
          console.log(
            `[evogo-webhook] Ignorando mensagem de grupo/broadcast (${info.Chat || info.Sender})`,
          );
          return;
        }

        isFromMe = info.IsFromMe;

        const getPhone = (jids: (string | undefined)[]) => {
          const real = jids.find((j) => j && j.includes("@s.whatsapp.net"));
          if (real) return real.split("@")[0];

          const fallback = jids.find(
            (j) =>
              j &&
              !j.includes("@lid") &&
              !j.includes("@g.us") &&
              !j.includes("@broadcast") &&
              !j.includes("@newsletter") &&
              j.trim() !== "",
          );
          if (fallback) return fallback.split("@")[0];
          return null;
        };

        const getLid = (jids: (string | undefined)[]) => {
          const lid = jids.find((j) => j && j.includes("@lid"));
          if (lid) return lid.split("@")[0];
          return null;
        };

        if (isFromMe) {
          remoteJid = info.Chat || info.RecipientAlt;
          phoneNumber = getPhone([info.Chat, info.RecipientAlt]);
          extractedLid = getLid([info.Chat, info.RecipientAlt]);
        } else {
          remoteJid = info.Chat || info.Sender || info.SenderAlt;
          phoneNumber = getPhone([info.Chat, info.Sender, info.SenderAlt]);
          extractedLid = getLid([info.Chat, info.Sender, info.SenderAlt]);
        }
        pushName = info.PushName || "Desconhecido";
        remoteMsgId = info.ID;

        if (body.data?.groupData?.Name) {
          actualGroupName = body.data.groupData.Name;
        }

        // Parse quoted messages and external ad reply
        const rawContextInfo =
          msg.extendedTextMessage?.contextInfo ||
          msg.imageMessage?.contextInfo ||
          msg.videoMessage?.contextInfo ||
          msg.audioMessage?.contextInfo ||
          msg.documentMessage?.contextInfo ||
          msg.stickerMessage?.contextInfo ||
          msg.ptvMessage?.contextInfo;

        if (body.data?.isQuoted && body.data?.quoted) {
          quotedStanzaId = body.data.quoted.stanzaID || body.data.quoted.stanzaId;
          const qm = body.data.quoted.quotedMessage;
          quotedContent =
            qm?.conversation ||
            qm?.extendedTextMessage?.text ||
            qm?.imageMessage?.caption ||
            (qm?.audioMessage
              ? "🎵 Áudio"
              : qm?.videoMessage || qm?.ptvMessage
                ? "🎥 Vídeo"
                : qm?.documentMessage
                  ? "📄 Documento"
                  : qm?.stickerMessage
                    ? "🖼️ Figurinha"
                    : null);
        } else if (rawContextInfo?.stanzaID || rawContextInfo?.stanzaId) {
          quotedStanzaId = rawContextInfo.stanzaID || rawContextInfo.stanzaId;
          const qm = rawContextInfo.quotedMessage;
          quotedContent =
            qm?.conversation ||
            qm?.extendedTextMessage?.text ||
            qm?.imageMessage?.caption ||
            (qm?.audioMessage
              ? "🎵 Áudio"
              : qm?.videoMessage || qm?.ptvMessage
                ? "🎥 Vídeo"
                : qm?.documentMessage
                  ? "📄 Documento"
                  : qm?.stickerMessage
                    ? "🖼️ Figurinha"
                    : null);
        }

        const ci = msg.extendedTextMessage?.contextInfo;
        if (ci) {
          if (ci.externalAdReply) metadata.externalAdReply = ci.externalAdReply;
          if (ci.conversionSource) metadata.conversionSource = ci.conversionSource;
          if (ci.conversionData) metadata.conversionData = ci.conversionData;
          if (ci.ctwaPayload) metadata.ctwaPayload = ci.ctwaPayload;
          if (ci.ctwaSignals) metadata.ctwaSignals = ci.ctwaSignals;
          if (ci.entryPointConversionApp)
            metadata.entryPointConversionApp = ci.entryPointConversionApp;
          if (ci.entryPointConversionSource)
            metadata.entryPointConversionSource = ci.entryPointConversionSource;
        }

        if (!metadata.externalAdReply) {
          const fallbackAd = extractExternalAdReply(msg, body.data);
          if (fallbackAd) metadata.externalAdReply = fallbackAd;
        }

        // 1. Handle Protocol Messages (Edit, Ephemeral, Revoke)
        if (msg.protocolMessage) {
          if (msg.protocolMessage.type === 14 || msg.protocolMessage.type === "MESSAGE_EDIT") {
            const targetId = msg.protocolMessage.key?.ID || msg.protocolMessage.key?.id;
            const editedMsg = msg.protocolMessage.editedMessage;
            const newText = editedMsg?.conversation || editedMsg?.extendedTextMessage?.text;

            if (targetId && newText) {
              console.log(
                `[evogo-webhook] Updating message ${targetId} with edited text: ${newText}`,
              );
              await supabaseAdmin
                .from("messages")
                .update({
                  content: `✏️ *Editado:* ${newText}`,
                  is_edited: true,
                })
                .eq("remote_msg_id", targetId);
            } else if (targetId) {
              console.log(
                `[evogo-webhook] Marking message ${targetId} as edited (protocolMessage without decrypted text)`,
              );
              await supabaseAdmin
                .from("messages")
                .update({ is_edited: true })
                .eq("remote_msg_id", targetId);
            }
            return;
          } else if (
            msg.protocolMessage.type === 3 ||
            msg.protocolMessage.type === "EPHEMERAL_SETTING"
          ) {
            textContent = "⏱️ *Aviso:* Configuração de mensagens temporárias alterada.";
          } else if (msg.protocolMessage.type === 0 || msg.protocolMessage.type === "REVOKE") {
            const targetId = msg.protocolMessage.key?.id || msg.protocolMessage.key?.ID;
            if (targetId) {
              console.log("[evogo-webhook] Revoking message ID:", targetId);
              const { error } = await supabaseAdmin
                .from("messages")
                .update({ is_deleted: true })
                .eq("remote_msg_id", targetId);
              if (error) console.error("[evogo-webhook] Error revoking message:", error);
            }
            return;
          } else {
            return;
          }
        }

        // 2. Handle secretEncryptedMessage / Edit events without decrypted text
        if (msg.secretEncryptedMessage || info?.Edit === "1" || body.data?.IsEdit) {
          const targetId =
            msg.secretEncryptedMessage?.targetMessageKey?.ID ||
            msg.secretEncryptedMessage?.targetMessageKey?.id;

          if (targetId) {
            console.log(
              `[evogo-webhook] Marking target message ${targetId} as edited (secretEncryptedMessage/Edit)`,
            );
            await supabaseAdmin
              .from("messages")
              .update({ is_edited: true })
              .eq("remote_msg_id", targetId);
          } else {
            console.log("[evogo-webhook] Ignoring secretEncryptedMessage without targetId");
          }
          return;
        }

        // 3. Handle Reactions
        if (info?.Type === "reaction" || msg.reactionMessage) {
          const targetId = msg.reactionMessage?.key?.ID || msg.reactionMessage?.key?.id;
          const emoji = msg.reactionMessage?.text || "";
          if (targetId) {
            return await handleReaction(targetId, emoji);
          }
          return;
        }

        // 4. Standard Message Types
        const incomingBase64 = msg.base64 || body.data?.base64 || body.base64 || body.data?.message?.base64;

        if (msg.conversation) {
          textContent = msg.conversation;
        } else if (msg.extendedTextMessage?.text) {
          textContent = msg.extendedTextMessage.text;
        } else if (msg.imageMessage) {
          mediaType = "image";
          textContent = msg.imageMessage.caption || "📷 Imagem";
          // EvoGo provides decrypted base64 - prefer it over thumbnail for full quality
          if (incomingBase64) {
            mediaUrl = `data:${msg.imageMessage.mimetype || "image/jpeg"};base64,${incomingBase64}`;
          } else {
            const thumb = parseThumbnailBase64(msg.imageMessage.jpegThumbnail || msg.imageMessage.JPEGThumbnail);
            if (thumb) {
              mediaUrl = `data:image/jpeg;base64,${thumb}`;
            }
          }
        } else if (msg.videoMessage) {
          mediaType = "video";
          textContent = msg.videoMessage.caption || "🎥 Vídeo";
          if (incomingBase64) {
            mediaUrl = `data:${msg.videoMessage.mimetype || "video/mp4"};base64,${incomingBase64}`;
          } else {
            const thumb = parseThumbnailBase64(msg.videoMessage.jpegThumbnail || msg.videoMessage.JPEGThumbnail);
            if (thumb) {
              // Show thumbnail as image preview for videos
              mediaUrl = `data:image/jpeg;base64,${thumb}`;
            }
          }
        } else if (msg.audioMessage) {
          mediaType = "audio";
          textContent = "🎵 Áudio";
          if (incomingBase64) {
            audioBase64 = incomingBase64;
            mediaUrl = `data:${msg.audioMessage.mimetype || "audio/ogg"};base64,${incomingBase64}`;
          }
        } else if (msg.ptvMessage) {
          mediaType = "video";
          textContent = "🎥 Vídeo Instantâneo";
          metadata.is_ptv = true;
          if (incomingBase64) {
            mediaUrl = `data:${msg.ptvMessage.mimetype || "video/mp4"};base64,${incomingBase64}`;
          } else {
            const thumb = parseThumbnailBase64(msg.ptvMessage.jpegThumbnail || msg.ptvMessage.JPEGThumbnail);
            if (thumb) {
              mediaUrl = `data:image/jpeg;base64,${thumb}`;
            }
          }
        } else if (msg.documentMessage) {
          mediaType = "document";
          textContent = msg.documentMessage.fileName || "📄 Documento";
          if (incomingBase64) {
            mediaUrl = `data:${msg.documentMessage.mimetype || "application/pdf"};base64,${incomingBase64}`;
          }
        } else if (msg.stickerMessage) {
          mediaType = "image";
          textContent = "🖼️ Figurinha";
          if (incomingBase64) {
            mediaUrl = `data:${msg.stickerMessage.mimetype || "image/webp"};base64,${incomingBase64}`;
          } else {
            const thumb = parseThumbnailBase64(msg.stickerMessage.jpegThumbnail || msg.stickerMessage.JPEGThumbnail);
            if (thumb) {
              mediaUrl = `data:image/jpeg;base64,${thumb}`;
            }
          }
        } else if (msg.contactMessage || msg.contactsArrayMessage) {
          mediaType = "text";
          textContent = "👤 Contato(s) recebido(s)";

          let contactsList = [];
          if (msg.contactMessage) {
            contactsList.push(msg.contactMessage);
          } else if (msg.contactsArrayMessage?.contacts) {
            contactsList = msg.contactsArrayMessage.contacts;
          }

          const parsedContacts = [];
          for (const c of contactsList) {
            if (c.vcard) {
              const nameMatch = c.vcard.match(/FN:(.+)/);
              const waidMatch = c.vcard.match(/waid=(\d+)/);
              const phoneMatch = c.vcard.match(/TEL.*:(.+)/);
              const photoMatch = c.vcard.match(/PHOTO.*?BASE64:([^\n\r]+)/i);

              const name = nameMatch ? nameMatch[1].trim() : c.displayName;
              const waid = waidMatch ? waidMatch[1].trim() : null;
              const phone = phoneMatch ? phoneMatch[1].trim() : null;
              const photo = photoMatch ? photoMatch[1].trim() : null;

              if (name || waid || phone) {
                parsedContacts.push({ name, waid, phone, photo });
              }
            }
          }
          if (parsedContacts.length > 0) {
            metadata.contacts = parsedContacts;
          }
        } else if (msg.locationMessage || msg.liveLocationMessage) {
          mediaType = "text";
          textContent = "📍 Localização recebida";
          const locMsg = msg.locationMessage || msg.liveLocationMessage;
          if (locMsg.degreesLatitude && locMsg.degreesLongitude) {
            metadata.location = {
              lat: locMsg.degreesLatitude,
              lng: locMsg.degreesLongitude,
            };
            if (locMsg.name) metadata.location.name = locMsg.name;
            if (locMsg.address) metadata.location.address = locMsg.address;
            if (locMsg.jpegThumbnail || locMsg.JPEGThumbnail)
              metadata.location.thumbnail = locMsg.jpegThumbnail || locMsg.JPEGThumbnail;
          }
        } else if (
          msg.pollCreationMessage ||
          msg.pollCreationMessageV2 ||
          msg.pollCreationMessageV3
        ) {
          mediaType = "text";
          const pollObj =
            msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
          textContent = "📊 Enquete: " + (pollObj?.name || "Votação");
          if (pollObj?.options) {
            metadata.poll = {
              name: pollObj.name || "Votação",
              options: pollObj.options.map((o: any) => o.optionName),
              messageSecret: msg.messageContextInfo?.messageSecret || null,
            };
          }
        } else if (msg.pollUpdateMessage) {
          return;
        } else if (
          info?.Type === "call" ||
          msg.messageStubType === "CALL_MISSED_VOICE" ||
          msg.messageStubType === "CALL_MISSED_VIDEO" ||
          msg.messageStubType === 40 ||
          msg.messageStubType === 41
        ) {
          mediaType = "text";
          textContent = "📞 Chamada de voz/vídeo perdida";
        } else if (msg.albumMessage) {
          // albumMessage is just an album cover notification - images arrive as separate imageMessage events
          return;
        } else if (info?.Type === "text" && !msg.conversation && !msg.extendedTextMessage) {
          // Ignore empty text messages (like PushName or system events sent as messages)
          console.log("[evogo-webhook] Ignoring empty text message");
          return;
        }

        // Native decryption fallback if mediaUrl is missing, or if it's a video that only got a thumbnail preview
        const needsFullMedia = !mediaUrl || (mediaType === "video" && mediaUrl.startsWith("data:image/"));
        if (needsFullMedia && mediaType !== "text") {
          const mediaObj =
            msg.ptvMessage ||
            msg.videoMessage ||
            msg.imageMessage ||
            msg.audioMessage ||
            msg.documentMessage ||
            msg.stickerMessage;

          const downloadUrl =
            mediaObj?.URL ||
            mediaObj?.url ||
            (mediaObj?.directPath ? `https://mmg.whatsapp.net${mediaObj.directPath}` : null) ||
            (mediaObj?.DirectPath ? `https://mmg.whatsapp.net${mediaObj.DirectPath}` : null);

          const rawMediaKey = mediaObj?.mediaKey || mediaObj?.MediaKey;

          if (mediaObj && downloadUrl && rawMediaKey) {
            try {
              const { decryptWhatsAppMedia } = await import("./whatsapp-decrypt");

              let typeKey: 'video' | 'image' | 'audio' | 'document' | 'ptv' = "document";
              if (msg.ptvMessage) typeKey = "ptv";
              else if (msg.videoMessage) typeKey = "video";
              else if (msg.imageMessage || msg.stickerMessage) typeKey = "image";
              else if (msg.audioMessage) typeKey = "audio";

              console.log(`[webhook] Native decrypting ${typeKey} for ${remoteJid}...`);
              const decryptedBuf = await decryptWhatsAppMedia(
                downloadUrl,
                rawMediaKey,
                typeKey,
              );

              const mime =
                mediaObj.mimetype ||
                (typeKey === "video" || typeKey === "ptv"
                  ? "video/mp4"
                  : typeKey === "image"
                    ? "image/jpeg"
                    : typeKey === "audio"
                      ? "audio/ogg"
                      : "application/pdf");
              mediaUrl = `data:${mime};base64,${decryptedBuf.toString("base64")}`;

              if (typeKey === "audio") {
                audioBase64 = decryptedBuf.toString("base64");
              }
              console.log(`[webhook] Native decryption successful (${decryptedBuf.length} bytes)`);
            } catch (err) {
              console.error("[webhook] Native decryption failed:", err);
            }
          }
        }
      } else {
        // Baileys format
        const messageData = body.data?.message || body.message || body;
        isFromMe = messageData.key?.fromMe || false;
        remoteJid = messageData.key?.remoteJid || "";
        pushName = messageData.pushName || "Desconhecido";

        // Ignorar mensagens de grupos, status/broadcasts e newsletters
        if (
          remoteJid.includes("@g.us") ||
          remoteJid.includes("@broadcast") ||
          remoteJid.includes("@newsletter") ||
          Boolean(messageData.key?.participant)
        ) {
          console.log(`[evogo-webhook] Ignorando mensagem de grupo/broadcast (${remoteJid})`);
          return;
        }

        phoneNumber = remoteJid ? remoteJid.split("@")[0] : null;
        remoteMsgId = messageData.key?.id || null;

        const msgType = messageData.message;
        const base64Content = body.base64 || messageData.base64;

        const rawContextInfo2 =
          msgType?.extendedTextMessage?.contextInfo ||
          msgType?.imageMessage?.contextInfo ||
          msgType?.videoMessage?.contextInfo ||
          msgType?.audioMessage?.contextInfo ||
          msgType?.documentMessage?.contextInfo ||
          msgType?.stickerMessage?.contextInfo ||
          msgType?.ptvMessage?.contextInfo;

        if (rawContextInfo2?.stanzaID || rawContextInfo2?.stanzaId) {
          quotedStanzaId = rawContextInfo2.stanzaID || rawContextInfo2.stanzaId;
          const qm = rawContextInfo2.quotedMessage;
          quotedContent =
            qm?.conversation ||
            qm?.extendedTextMessage?.text ||
            qm?.imageMessage?.caption ||
            (qm?.audioMessage
              ? "🎵 Áudio"
              : qm?.videoMessage || qm?.ptvMessage
                ? "🎥 Vídeo"
                : qm?.documentMessage
                  ? "📄 Documento"
                  : qm?.stickerMessage
                    ? "🖼️ Figurinha"
                    : null);
        }

        const ci2 = msgType?.extendedTextMessage?.contextInfo;
        if (ci2) {
          if (ci2.externalAdReply) metadata.externalAdReply = ci2.externalAdReply;
          if (ci2.conversionSource) metadata.conversionSource = ci2.conversionSource;
          if (ci2.conversionData) metadata.conversionData = ci2.conversionData;
          if (ci2.ctwaPayload) metadata.ctwaPayload = ci2.ctwaPayload;
          if (ci2.ctwaSignals) metadata.ctwaSignals = ci2.ctwaSignals;
          if (ci2.entryPointConversionApp)
            metadata.entryPointConversionApp = ci2.entryPointConversionApp;
          if (ci2.entryPointConversionSource)
            metadata.entryPointConversionSource = ci2.entryPointConversionSource;
        }

        if (!metadata.externalAdReply) {
          const fallbackAd = extractExternalAdReply(msgType, body.data);
          if (fallbackAd) metadata.externalAdReply = fallbackAd;
        }

        if (msgType) {
          if (msgType.conversation) {
            textContent = msgType.conversation;
          } else if (msgType.extendedTextMessage?.text) {
            textContent = msgType.extendedTextMessage.text;
          } else if (msgType.imageMessage) {
            mediaType = "image";
            textContent = msgType.imageMessage.caption || "📷 Imagem";
            if (base64Content) {
              mediaUrl = `data:${msgType.imageMessage.mimetype || "image/jpeg"};base64,${base64Content}`;
            } else {
              const thumb = parseThumbnailBase64(msgType.imageMessage.jpegThumbnail || msgType.imageMessage.JPEGThumbnail);
              if (thumb) {
                mediaUrl = `data:image/jpeg;base64,${thumb}`;
              }
            }
          } else if (msgType.videoMessage) {
            mediaType = "video";
            textContent = msgType.videoMessage.caption || "🎥 Vídeo";
            if (base64Content) {
              mediaUrl = `data:${msgType.videoMessage.mimetype || "video/mp4"};base64,${base64Content}`;
            } else {
              const thumb = parseThumbnailBase64(msgType.videoMessage.jpegThumbnail || msgType.videoMessage.JPEGThumbnail);
              if (thumb) {
                mediaUrl = `data:image/jpeg;base64,${thumb}`;
              }
            }
          } else if (msgType.audioMessage) {
            mediaType = "audio";
            textContent = "🎵 Áudio";
            if (base64Content) {
              audioBase64 = base64Content;
              mediaUrl = `data:${msgType.audioMessage.mimetype || "audio/ogg"};base64,${base64Content}`;
            }
          } else if (msgType.ptvMessage) {
            mediaType = "video";
            textContent = "🎥 Vídeo Instantâneo";
            metadata.is_ptv = true;
            if (base64Content) {
              mediaUrl = `data:${msgType.ptvMessage.mimetype || "video/mp4"};base64,${base64Content}`;
            } else {
              const thumb = parseThumbnailBase64(msgType.ptvMessage.jpegThumbnail || msgType.ptvMessage.JPEGThumbnail);
              if (thumb) {
                mediaUrl = `data:image/jpeg;base64,${thumb}`;
              }
            }
          } else if (msgType.documentMessage) {
            mediaType = "document";
            textContent = msgType.documentMessage.fileName || "📄 Documento";
            if (base64Content) {
              mediaUrl = `data:${msgType.documentMessage.mimetype || "application/pdf"};base64,${base64Content}`;
            }
          } else if (msgType.stickerMessage) {
            mediaType = "image";
            textContent = "🖼️ Figurinha";
            if (base64Content) {
              mediaUrl = `data:${msgType.stickerMessage.mimetype || "image/webp"};base64,${base64Content}`;
            } else {
              const thumb = parseThumbnailBase64(msgType.stickerMessage.jpegThumbnail || msgType.stickerMessage.JPEGThumbnail);
              if (thumb) {
                mediaUrl = `data:image/jpeg;base64,${thumb}`;
              }
            }
          }

          const needsFullMediaF2 = !mediaUrl || (mediaType === "video" && mediaUrl.startsWith("data:image/"));
          if (needsFullMediaF2 && mediaType !== "text") {
            const mtObj =
              msgType.ptvMessage ||
              msgType.videoMessage ||
              msgType.imageMessage ||
              msgType.audioMessage ||
              msgType.documentMessage ||
              msgType.stickerMessage;

            const downloadUrl =
              mtObj?.URL ||
              mtObj?.url ||
              (mtObj?.directPath ? `https://mmg.whatsapp.net${mtObj.directPath}` : null) ||
              (mtObj?.DirectPath ? `https://mmg.whatsapp.net${mtObj.DirectPath}` : null);

            const rawMediaKey = mtObj?.mediaKey || mtObj?.MediaKey;

            if (mtObj && downloadUrl && rawMediaKey) {
              try {
                const { decryptWhatsAppMedia } = await import("./whatsapp-decrypt");

                let typeKey: 'video' | 'image' | 'audio' | 'document' | 'ptv' = "document";
                if (msgType.ptvMessage) typeKey = "ptv";
                else if (msgType.videoMessage) typeKey = "video";
                else if (msgType.imageMessage || msgType.stickerMessage) typeKey = "image";
                else if (msgType.audioMessage) typeKey = "audio";

                console.log(`[webhook] Native decrypting (msgType) ${typeKey} for ${remoteJid}...`);
                const decryptedBuf = await decryptWhatsAppMedia(downloadUrl, rawMediaKey, typeKey);

                const mime =
                  mtObj.mimetype ||
                  (typeKey === "video" || typeKey === "ptv"
                    ? "video/mp4"
                    : typeKey === "image"
                      ? "image/jpeg"
                      : typeKey === "audio"
                        ? "audio/ogg"
                        : "application/pdf");
                mediaUrl = `data:${mime};base64,${decryptedBuf.toString("base64")}`;

                if (typeKey === "audio") {
                  audioBase64 = decryptedBuf.toString("base64");
                }
              } catch (err) {
                console.error("[webhook] Native decryption (msgType) failed:", err);
              }
            }
          }

          if (msgType.locationMessage || msgType.liveLocationMessage) {
            mediaType = "text";
            textContent = "📍 Localização recebida";
            const locMsg = msgType.locationMessage || msgType.liveLocationMessage;
            if (locMsg.degreesLatitude && locMsg.degreesLongitude) {
              metadata.location = {
                lat: locMsg.degreesLatitude,
                lng: locMsg.degreesLongitude,
              };
              if (locMsg.name) metadata.location.name = locMsg.name;
              if (locMsg.address) metadata.location.address = locMsg.address;
              if (locMsg.jpegThumbnail || locMsg.JPEGThumbnail)
                metadata.location.thumbnail = locMsg.jpegThumbnail || locMsg.JPEGThumbnail;
            }
          } else if (msgType.contactMessage || msgType.contactsArrayMessage) {
            mediaType = "text";
            textContent = "👤 Contato(s) recebido(s)";

            let contactsList = [];
            if (msgType.contactMessage) {
              contactsList.push(msgType.contactMessage);
            } else if (msgType.contactsArrayMessage?.contacts) {
              contactsList = msgType.contactsArrayMessage.contacts;
            }

            const parsedContacts = [];
            for (const c of contactsList) {
              if (c.vcard) {
                const nameMatch = c.vcard.match(/FN:(.+)/);
                const waidMatch = c.vcard.match(/waid=(\d+)/);
                const phoneMatch = c.vcard.match(/TEL.*:(.+)/);
                const photoMatch = c.vcard.match(/PHOTO.*?BASE64:([^\n\r]+)/i);

                const name = nameMatch ? nameMatch[1].trim() : c.displayName;
                const waid = waidMatch ? waidMatch[1].trim() : null;
                const phone = phoneMatch ? phoneMatch[1].trim() : null;
                const photo = photoMatch ? photoMatch[1].trim() : null;

                if (name || waid || phone) {
                  parsedContacts.push({ name, waid, phone, photo });
                }
              }
            }
            if (parsedContacts.length > 0) {
              metadata.contacts = parsedContacts;
            }
          } else if (
            msgType.pollCreationMessage ||
            msgType.pollCreationMessageV2 ||
            msgType.pollCreationMessageV3
          ) {
            mediaType = "text";
            const pollObj =
              msgType.pollCreationMessage ||
              msgType.pollCreationMessageV2 ||
              msgType.pollCreationMessageV3;
            textContent = "📊 Enquete: " + (pollObj?.name || "Votação");
            if (pollObj?.options) {
              metadata.poll = {
                name: pollObj.name || "Votação",
                options: pollObj.options.map((o: any) => o.optionName),
                messageSecret: msgType.messageContextInfo?.messageSecret || null,
              };
            }
          } else if (msgType.pollUpdateMessage) {
            return;
          } else if (msgType.reactionMessage) {
            const targetId = msgType.reactionMessage?.key?.id || msgType.reactionMessage?.key?.ID;
            const emoji = msgType.reactionMessage?.text || "";
            if (targetId) {
              return await handleReaction(targetId, emoji);
            }
          } else if (msgType.protocolMessage) {
            if (
              msgType.protocolMessage.type === 14 ||
              msgType.protocolMessage.type === "MESSAGE_EDIT"
            ) {
              const editedMsg = msgType.protocolMessage.editedMessage;
              if (editedMsg) {
                textContent =
                  editedMsg.conversation ||
                  editedMsg.extendedTextMessage?.text ||
                  "[Mensagem Editada]";
                textContent = `✏️ *Editado:* ${textContent}`;
              } else {
                return;
              }
            } else if (
              msgType.protocolMessage.type === 3 ||
              msgType.protocolMessage.type === "EPHEMERAL_SETTING"
            ) {
              textContent = "⏱️ *Aviso:* Configuração de mensagens temporárias alterada.";
            } else if (
              msgType.protocolMessage.type === 0 ||
              msgType.protocolMessage.type === "REVOKE"
            ) {
              const targetId = msgType.protocolMessage.key?.id || msgType.protocolMessage.key?.ID;
              if (targetId) {
                console.log("[evogo-webhook] Revoking message ID:", targetId);
                const { error } = await supabaseAdmin
                  .from("messages")
                  .update({ is_deleted: true })
                  .eq("remote_msg_id", targetId);
                if (error) console.error("[evogo-webhook] Error revoking message:", error);
              }
              return;
            } else {
              return;
            }
          } else if (msgType.secretEncryptedMessage) {
            console.log(
              "[evogo-webhook] Ignoring secretEncryptedMessage/Edit without decrypted content",
            );
            return;
          }
        }
      }

      if (!instanceName) {
        return;
      }

      // Trava final: grupos, broadcasts, canais e IDs de grupo jamais abrem atendimento
      if (
        remoteJid.includes("@g.us") ||
        remoteJid.includes("@broadcast") ||
        remoteJid.includes("@newsletter") ||
        phoneNumber.includes("-") ||
        phoneNumber.startsWith("120363")
      ) {
        console.log(
          `[evogo-webhook] Trava de segurança: ignorando grupo/broadcast (${remoteJid || phoneNumber})`,
        );
        return;
      }

      if (!phoneNumber) {
        return;
      }

      if (!textContent) {
        textContent = "[Mídia/Mensagem não suportada]";
      }

      // 1. Find the instance in the DB
      const { data: instance, error: instanceErr } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, unit_id, company_id")
        .eq("instance_name", instanceName)
        .single();

      if (instanceErr || !instance) {
        console.error("Instance not found for webhook:", instanceName);
        return;
      }

      const { id: instance_id, company_id, unit_id } = instance;
      // Se não tem unit_id, significa que é da Empresa Mãe (Matriz), o que é perfeitamente válido.
      // Mantemos unit_id como null ou undefined.

      const lockKey = `${instance_id}:${phoneNumber}`;

      let conversationId: string | undefined;
      let newMessage: any = null;
      let aiActive = false;
      let contactId: string = "";

      await withWebhookLock(lockKey, async () => {
        // 2. Find or create Contact
        let activeConv: any = null;

        const phoneVariants = getPhoneVariants(phoneNumber || "");
        const { data: existingContacts } = await supabaseAdmin
          .from("contacts")
          .select("id, name, whatsapp_lid, merged_into_id, profile_picture_url, created_at")
          .eq("company_id", company_id)
          .or(
            `phone.in.(${phoneVariants.join(",")})${extractedLid ? `,whatsapp_lid.eq.${extractedLid}` : ""}`,
          )
          .order("created_at", { ascending: true });

        if (existingContacts && existingContacts.length > 0) {
          // Collect all known contact IDs for this person
          const allContactIds = Array.from(
            new Set([
              ...existingContacts.map((c) => c.id),
              ...(existingContacts.map((c) => c.merged_into_id).filter(Boolean) as string[]),
            ]),
          );

          // Find if ANY of these contacts has an active or waiting conversation on this instance
          const { data: convs } = await supabaseAdmin
            .from("conversations")
            .select("id, status, ai_active, ai_agent_id, contact_id")
            .in("contact_id", allContactIds)
            .eq("whatsapp_instance_id", instance_id)
            .in("status", ["waiting", "active"])
            .order("started_at", { ascending: false })
            .limit(1);

          // Pick canonical contact: prefer one with profile picture and real name, or first created
          const canonicalContact =
            existingContacts.find(
              (c) =>
                c.profile_picture_url &&
                c.name &&
                c.name !== phoneNumber &&
                c.name !== "Desconhecido",
            ) ||
            existingContacts.find((c) => c.profile_picture_url) ||
            existingContacts[0];

          if (convs && convs.length > 0) {
            activeConv = convs[0];
          }

          contactId = canonicalContact.merged_into_id || canonicalContact.id;

          // Auto-heal duplicate contacts in background: mark merged_into_id to canonical
          const duplicateContacts = existingContacts.filter(
            (c) => c.id !== contactId && c.merged_into_id !== contactId,
          );
          if (duplicateContacts.length > 0) {
            const dupeIds = duplicateContacts.map((c) => c.id);
            supabaseAdmin
              .from("contacts")
              .update({ merged_into_id: contactId })
              .in("id", dupeIds)
              .then();
          }

          const updates: any = {};

          // Update contact name
          if (remoteJid.includes("@g.us")) {
            if (
              actualGroupName &&
              canonicalContact.name !== actualGroupName &&
              canonicalContact.name === "Grupo do WhatsApp"
            ) {
              updates.name = actualGroupName;
            }
          } else {
            if (!isFromMe && pushName && pushName !== "Desconhecido") {
              const currentName = canonicalContact.name;
              if (currentName === phoneNumber || currentName === "Desconhecido") {
                updates.name = pushName;
              }
            }
          }

          // Lock in the LID if we discovered it
          if (extractedLid && canonicalContact.whatsapp_lid !== extractedLid) {
            updates.whatsapp_lid = extractedLid;
          }

          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("contacts").update(updates).eq("id", contactId);
          }
        } else {
          // Double check before creating to prevent race condition
          const { data: secondCheck } = await supabaseAdmin
            .from("contacts")
            .select("id, name, whatsapp_lid, merged_into_id")
            .eq("company_id", company_id)
            .or(
              `phone.in.(${phoneVariants.join(",")})${extractedLid ? `,whatsapp_lid.eq.${extractedLid}` : ""}`,
            )
            .order("created_at", { ascending: true })
            .limit(1);

        let isBrandNewContact = false;
        let brandNewContactName = pushName;
        if (secondCheck && secondCheck.length > 0) {
          contactId = secondCheck[0].merged_into_id || secondCheck[0].id;
        } else {
          // Create new contact
          isBrandNewContact = true;
          const groupDefaultName = actualGroupName || "Grupo do WhatsApp";
          let newContactName = pushName;
          if (remoteJid.includes("@g.us")) {
            newContactName = groupDefaultName;
          } else if (isFromMe || !pushName || pushName === "Desconhecido") {
            newContactName = phoneNumber || "Desconhecido";
          }
          brandNewContactName = newContactName;

            const { data: newContact, error: contactErr } = await supabaseAdmin
              .from("contacts")
              .insert({
                company_id: company_id,
                unit_id: unit_id,
                name: newContactName,
                phone: phoneNumber,
                whatsapp_lid: extractedLid || null,
              })
              .select()
              .single();

            if (contactErr) throw contactErr;
            contactId = newContact.id;

            // Auto-sync profile picture (MUST await in Vercel so the serverless function doesn't die)
            if (!remoteJid.includes("@g.us")) {
              try {
                await syncContactProfile(contactId, instance_id);
              } catch (err) {
                console.error("[evogo-webhook] syncContactProfile failed:", err);
              }
            }
          }
        }

        // 3. Find latest conversation for this contact in THIS EXACT INSTANCE
        let convsData = activeConv ? [activeConv] : null;

        const searchContactIds = Array.from(
          new Set([
            ...(existingContacts?.map((c) => c.id) || []),
            ...(existingContacts?.map((c) => c.merged_into_id).filter(Boolean) as string[]),
            contactId,
          ]),
        );

        if (!activeConv) {
          // 3a. First check for active or waiting conversation across ANY known contact ID
          const { data: openConvs } = await supabaseAdmin
            .from("conversations")
            .select("id, status, ai_active, ai_agent_id, contact_id")
            .in("contact_id", searchContactIds)
            .eq("whatsapp_instance_id", instance_id)
            .in("status", ["waiting", "active"])
            .order("started_at", { ascending: false })
            .limit(1);

          if (openConvs && openConvs.length > 0) {
            convsData = openConvs;
          } else {
            // 3b. If no active/waiting, look for ANY conversation on this instance (e.g. resolved)
            const { data: anyConvs } = await supabaseAdmin
              .from("conversations")
              .select("id, status, ai_active, ai_agent_id, contact_id")
              .in("contact_id", searchContactIds)
              .eq("whatsapp_instance_id", instance_id)
              .order("started_at", { ascending: false })
              .limit(1);

            convsData = anyConvs;
          }
        }

        const latestConvs = convsData;

        console.log(
          `[evogo-webhook] Lookup conversation: instance_id=${instance_id}, contact_id=${contactId}, result=${JSON.stringify(latestConvs)}`,
        );

        if (latestConvs && latestConvs.length > 0) {
          const conv = latestConvs[0];
          conversationId = conv.id;

          // Ensure conversation is linked to primary canonical contact
          if (conv.contact_id !== contactId) {
            await supabaseAdmin
              .from("conversations")
              .update({ contact_id: contactId })
              .eq("id", conversationId);
          }

          if (conv.ai_active) {
            if (conv.ai_agent_id) {
              aiActive = true;
            } else {
              // Find agent mapped to this instance, or any active agent
              const { data: fallbackAgents } = await supabaseAdmin
                .from("ai_agents")
                .select("id")
                .eq("company_id", company_id)
                .eq("is_active", true)
                .order("instance_id", { ascending: false })
                .limit(1);

              if (fallbackAgents && fallbackAgents.length > 0) {
                aiActive = true;
                await supabaseAdmin
                  .from("conversations")
                  .update({ ai_agent_id: fallbackAgents[0].id })
                  .eq("id", conversationId);
              }
            }
          }

          // 3.5 Dedup: skip if we already have this remote_msg_id in the DB
          if (remoteMsgId && conversationId) {
            const { data: existingMsg } = await supabaseAdmin
              .from("messages")
              .select("id, metadata")
              .eq("remote_msg_id", remoteMsgId)
              .eq("conversation_id", conversationId)
              .maybeSingle();

            if (existingMsg) {
              // Already saved - just update conversation timestamp
              await supabaseAdmin
                .from("conversations")
                .update({ last_message_at: new Date().toISOString(), ai_followup_count: 0 })
                .eq("id", conversationId);

              // Update metadata if the new payload has metadata that might have been missing initially
              if (Object.keys(metadata).length > 0) {
                const currentMeta =
                  typeof existingMsg.metadata === "object" && existingMsg.metadata !== null
                    ? existingMsg.metadata
                    : {};
                const newMetadata = { ...currentMeta, ...metadata };
                await supabaseAdmin
                  .from("messages")
                  .update({ metadata: newMetadata })
                  .eq("id", existingMsg.id);
              }
              return;
            }
          }

          const updatePayload: any = {
            last_message_at: new Date().toISOString(),
            ai_followup_count: 0,
            remote_id: extractedLid || phoneNumber,
          };

          // Se a conversa estava na fila de espera e o atendente respondeu (isFromMe):
          // Transiciona automaticamente para andamento (active)
          if (conv.status === "waiting" && isFromMe) {
            updatePayload.status = "active";
          }

          // Se a conversa estava resolvida:
          // Reabre como active se for mensagem enviada pelo atendente (isFromMe),
          // ou como waiting/active se for recebida do contato (!isFromMe)
          if (conv.status === "resolved") {
            console.log(`[evogo-webhook] Reopening resolved conversation: ${conversationId}, isFromMe=${isFromMe}`);

            const previouslyAiActive = conv.ai_active ?? false;
            let resolvedAgentId = conv.ai_agent_id ?? null;

            if (!resolvedAgentId && !isFromMe) {
              const { data: defaultAgents } = await supabaseAdmin
                .from("ai_agents")
                .select("id, active_by_default")
                .eq("company_id", company_id)
                .eq("is_active", true)
                .or("is_main_agent.eq.true,active_by_default.eq.true")
                .order("is_main_agent", { ascending: false })
                .limit(1);
              resolvedAgentId = defaultAgents?.[0]?.id ?? null;
            }

            updatePayload.status = isFromMe ? "active" : previouslyAiActive ? "active" : "waiting";
            updatePayload.ai_active = isFromMe ? false : previouslyAiActive;
            updatePayload.ai_agent_id = isFromMe ? conv.ai_agent_id : resolvedAgentId;
            updatePayload.assigned_agent_id = isFromMe ? conv.assigned_agent_id : null;
            updatePayload.resolved_at = null;

            aiActive = isFromMe ? false : previouslyAiActive;

            // Abre um novo ticket (sessão)
            let sessionId = null;
            let { data: existingSession } = await supabaseAdmin
              .from("conversation_sessions")
              .select("id")
              .eq("conversation_id", conversationId)
              .is("resolved_at", null)
              .maybeSingle();

            if (existingSession) {
              sessionId = existingSession.id;
            } else {
              const { data: newSession, error: sessionErr } = await supabaseAdmin
                .from("conversation_sessions")
                .insert({
                  conversation_id: conversationId,
                  contact_id: contactId,
                  whatsapp_instance_id: instance_id,
                  started_at: new Date().toISOString(),
                })
                .select()
                .single();

              if (sessionErr) {
                if (sessionErr.code === "23505") {
                  const { data: concSession } = await supabaseAdmin
                    .from("conversation_sessions")
                    .select("id")
                    .eq("conversation_id", conversationId)
                    .is("resolved_at", null)
                    .maybeSingle();
                  if (concSession) sessionId = concSession.id;
                  existingSession = concSession;
                } else {
                  console.error("[evogo-webhook] Error creating session:", sessionErr);
                }
              } else if (newSession) {
                sessionId = newSession.id;
              }
            }

            if (sessionId) {
              updatePayload.current_session_id = sessionId;
              if (!existingSession) {
                const events: any[] = [{ session_id: sessionId, event_type: "started" }];
                if (aiActive && resolvedAgentId) {
                  const { data: agentData } = await supabaseAdmin
                    .from("ai_agents")
                    .select("name")
                    .eq("id", resolvedAgentId)
                    .single();
                  events.push({
                    session_id: sessionId,
                    event_type: "assigned",
                    metadata: {
                      by_ai: true,
                      ai_agent_id: resolvedAgentId,
                      ai_agent_name: agentData?.name || "IA",
                    },
                  });
                }
                await supabaseAdmin.from("session_events").insert(events);
              }
            }
          } else {
            console.log(`[evogo-webhook] Found active/waiting conversation: ${conversationId}`);
          }

          await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);
        } else {
          console.log(`[evogo-webhook] No existing conversation found. Checking race condition before creating.`);

          // Double check race condition across searchContactIds
          const { data: raceCheck } = await supabaseAdmin
            .from("conversations")
            .select("id, status, ai_active, ai_agent_id")
            .in("contact_id", searchContactIds)
            .eq("whatsapp_instance_id", instance_id)
            .order("started_at", { ascending: false })
            .limit(1);

          if (raceCheck && raceCheck.length > 0) {
            conversationId = raceCheck[0].id;
            aiActive = raceCheck[0].ai_active ?? false;
            await supabaseAdmin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversationId);
          } else {
            // Check for default AI agent
            const { data: defaultAgents } = await supabaseAdmin
              .from("ai_agents")
              .select("id, is_main_agent, active_by_default")
              .eq("company_id", company_id)
              .eq("is_active", true)
              .eq("is_main_agent", true)
              .limit(1);
            const defaultAgentId =
              defaultAgents && defaultAgents.length > 0 ? defaultAgents[0].id : null;
            const isActiveByDefault =
              defaultAgents && defaultAgents.length > 0 ? defaultAgents[0].active_by_default : false;
            if (isActiveByDefault) aiActive = true;

            // Create new conversation (always active or waiting, NEVER pre-resolved)
            const { data: newConv, error: convErr } = await supabaseAdmin
              .from("conversations")
              .insert({
                unit_id: unit_id,
                whatsapp_instance_id: instance_id,
                contact_id: contactId,
                channel: "whatsapp",
                remote_id: extractedLid || phoneNumber,
                status: isFromMe ? "active" : isActiveByDefault ? "active" : "waiting",
                last_message_at: new Date().toISOString(),
                resolved_at: null,
                ai_active: isFromMe ? false : isActiveByDefault,
                ai_agent_id: defaultAgentId,
              })
              .select()
              .single();

            if (convErr) {
              console.warn(
                "[evogo-webhook] Conversation insert failed, checking for race condition:",
                convErr.message,
              );
              const { data: racedConv } = await supabaseAdmin
                .from("conversations")
                .select("id, status, ai_active, ai_agent_id")
                .in("contact_id", searchContactIds)
                .eq("whatsapp_instance_id", instance_id)
                .order("started_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (racedConv) {
                conversationId = racedConv.id;
                aiActive = racedConv.ai_active ?? false;
                await supabaseAdmin
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString(), ai_followup_count: 0 })
                  .eq("id", conversationId);
              } else {
                throw convErr;
              }
            } else {
              conversationId = newConv.id;
            }

            // Abre um novo ticket (sessão)
            if (conversationId) {
              let sessionId = null;
              let { data: existingSession } = await supabaseAdmin
                .from("conversation_sessions")
                .select("id")
                .eq("conversation_id", conversationId)
                .is("resolved_at", null)
                .maybeSingle();

              if (existingSession) {
                sessionId = existingSession.id;
              } else {
                const { data: newSession, error: sessionErr } = await supabaseAdmin
                  .from("conversation_sessions")
                  .insert({
                    conversation_id: conversationId,
                    contact_id: contactId,
                    whatsapp_instance_id: instance_id,
                    started_at: new Date().toISOString(),
                  })
                  .select()
                  .single();

                if (sessionErr) {
                  if (sessionErr.code === "23505") {
                    const { data: concSession } = await supabaseAdmin
                      .from("conversation_sessions")
                      .select("id")
                      .eq("conversation_id", conversationId)
                      .is("resolved_at", null)
                      .maybeSingle();
                    if (concSession) sessionId = concSession.id;
                    existingSession = concSession;
                  } else {
                    console.error("[evogo-webhook] Error creating session:", sessionErr);
                  }
                } else if (newSession) {
                  sessionId = newSession.id;
                }
              }

              if (sessionId) {
                await supabaseAdmin
                  .from("conversations")
                  .update({ current_session_id: sessionId })
                  .eq("id", conversationId);
                if (!existingSession) {
                  const events: any[] = [{ session_id: sessionId, event_type: "started" }];
                  if (isActiveByDefault && defaultAgentId) {
                    const { data: defaultAgentData } = await supabaseAdmin
                      .from("ai_agents")
                      .select("name")
                      .eq("id", defaultAgentId)
                      .single();
                    events.push({
                      session_id: sessionId,
                      event_type: "assigned",
                      metadata: {
                        by_ai: true,
                        ai_agent_id: defaultAgentId,
                        ai_agent_name: defaultAgentData?.name || "IA",
                      },
                    });
                  }
                  await supabaseAdmin.from("session_events").insert(events);
                }
              }
            }
          }
        }

        // Dispara automação de novo contato criado se for o primeiro contato
        if (isBrandNewContact && contactId) {
          dispatchAutomationEvent({
            companyId: company_id,
            unitId: unit_id || null,
            contactId: contactId,
            conversationId: conversationId || null,
            triggerType: "contact_created",
            metadata: {
              name: brandNewContactName,
              phone: phoneNumber,
            },
          }).catch((err) => console.error("[evogo-webhook] contact_created automation error:", err));
        }

        // 4. Resolve quoted message internal ID
        let quotedInternalId = null;
        if (quotedStanzaId) {
          const { data: quotedMsg } = await supabaseAdmin
            .from("messages")
            .select("id, content, media_type")
            .eq("remote_msg_id", quotedStanzaId)
            .maybeSingle();
          if (quotedMsg) {
            quotedInternalId = quotedMsg.id;
            if (!quotedContent || quotedContent === "Anexo") {
              quotedContent =
                quotedMsg.content ||
                (quotedMsg.media_type ? `[${quotedMsg.media_type}]` : "Anexo");
            }
          }
        }

        // 5.5 Check for externalAdReply and cache thumbnail (with deduplication)
        if (metadata.externalAdReply && !isFromMe) {
          await processAndCacheAdPreview({
            companyId: company_id,
            metadata,
          });
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
          sender_type: isFromMe ? "agent" : "contact",
          content: textContent,
          media_type: mediaType,
          media_url: mediaUrl,
          remote_msg_id: remoteMsgId,
          quoted_message_id: quotedInternalId,
          quoted_content: quotedContent,
          participant_jid: participantJid,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };

        const { error: msgErr, data: insertedMsg } = await supabaseAdmin
          .from("messages")
          .insert(insertPayload)
          .select()
          .single();

        newMessage = insertedMsg;

        if (msgErr) {
          if (msgErr.code === "23505") {
            console.log(
              "[evogo-webhook] Duplicate remote_msg_id during insert. Updating metadata if present:",
              remoteMsgId,
            );
            if (Object.keys(metadata).length > 0 && remoteMsgId && conversationId) {
              const { data: existing } = await supabaseAdmin
                .from("messages")
                .select("id, metadata")
                .eq("remote_msg_id", remoteMsgId)
                .eq("conversation_id", conversationId)
                .maybeSingle();

              if (existing) {
                const currentMeta =
                  typeof existing.metadata === "object" && existing.metadata !== null
                    ? existing.metadata
                    : {};
                const newMetadata = { ...currentMeta, ...metadata };
                await supabaseAdmin
                  .from("messages")
                  .update({ metadata: newMetadata })
                  .eq("id", existing.id);
              }
            }
            return;
          }

          // Fallback without new columns in case migration hasn't run yet
          console.error("Insert failed with new columns, falling back...", msgErr);
          const { data: fallbackMsg } = await supabaseAdmin
            .from("messages")
            .insert({
              conversation_id: conversationId,
              sender_type: isFromMe ? "agent" : "contact",
              content: textContent,
              media_type: mediaType,
              media_url: mediaUrl,
            })
            .select()
            .single();

          newMessage = fallbackMsg;

          if (fallbackMsg && mediaType === "audio" && audioBase64 && instance.company_id) {
            await triggerAudioTranscription(fallbackMsg.id, audioBase64, instance.company_id);
          }
        } else if (newMessage && mediaType === "audio" && audioBase64 && instance.company_id) {
          await triggerAudioTranscription(newMessage.id, audioBase64, instance.company_id);
        }
      });

      // 6.5. Check for Ad Lead and save to ad_leads table
      if (Object.keys(metadata).length > 0 && metadata.externalAdReply && !isFromMe) {
        try {
          // Utiliza source_id do ad ou fallback para ctwaClid/URL
          const sourceId = metadata.externalAdReply.sourceID || metadata.externalAdReply.sourceURL || metadata.externalAdReply.ctwaClid || `ad_${contactId}`;

          if (sourceId) {
            const { data: existingAdLead } = await supabaseAdmin
              .from("ad_leads")
              .select("id")
              .eq("contact_id", contactId)
              .eq("source_id", sourceId)
              .maybeSingle();

            if (!existingAdLead) {
              await supabaseAdmin.from("ad_leads").insert({
                company_id: company_id,
                unit_id: unit_id || null,
                contact_id: contactId,
                ad_title: metadata.externalAdReply.title || null,
                ad_body: metadata.externalAdReply.body || null,
                source_url: metadata.externalAdReply.sourceURL || null,
                thumbnail_url:
                  metadata.externalAdReply.thumbnailURL ||
                  metadata.externalAdReply.originalImageURL ||
                  null,
                source_id: sourceId,
                ctwa_clid: metadata.externalAdReply.ctwaClid || null,
                conversion_source: metadata.conversionSource || null,
                conversion_data: metadata.conversionData || null,
                ctwa_payload: metadata.ctwaPayload || null,
                source_app:
                  metadata.externalAdReply.sourceApp || metadata.entryPointConversionApp || null,
                media_type: metadata.externalAdReply.mediaType || null,
              });
              console.log(
                `[evogo-webhook] Registered new ad lead for contact ${contactId} and ad ${sourceId}`,
              );

              // Dispara automações desacopladas (ManyChat / BotConversa style)
              dispatchAutomationEvent({
                companyId: company_id,
                unitId: unit_id || null,
                contactId: contactId,
                conversationId: conversationId || null,
                triggerType: "ad_lead_first_message",
                metadata: {
                  sourceId,
                  ad: metadata.externalAdReply,
                },
              }).catch((err) => console.error("[evogo-webhook] automation event error:", err));

              // Dispara evento CAPI da Meta para lead de anúncio (CTWA)
              if (metadata.externalAdReply.ctwaClid) {
                sendMetaCapiEvent({
                  companyId: company_id,
                  contactId: contactId,
                  eventName: "Lead",
                  ctwaClid: metadata.externalAdReply.ctwaClid,
                  actionSource: "chat",
                  contentName: metadata.externalAdReply.title || "Click to WhatsApp Ad Lead",
                }).catch((capiErr) => console.error("[evogo-webhook] Meta CAPI error:", capiErr));
              }
            }
          }
        } catch (e) {
          console.error("[evogo-webhook] Failed to register ad lead:", e);
        }
      }

      // 7. Check if we need to queue AI response
      if (aiActive && newMessage && !isFromMe) {
        // Enqueue the AI message generator to allow for 10s buffer
        console.log(
          `[evogo-webhook] Queueing AI response for conversation ${conversationId}, message ${newMessage.id}`,
        );
        await enqueueAiMessage(conversationId, newMessage.id, instance.company_id);
      }

      return;
    }

    // --- Handle Labels Webhooks ---
    if (
      body.event === "labels.edit" ||
      body.event === "labels.upsert" ||
      body.event === "labels.update"
    ) {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;

      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("company_id")
        .eq("instance_name", instanceName)
        .single();

      if (!instance) return;

      const labelsData = Array.isArray(body.data) ? body.data : [body.data];

      for (const label of labelsData) {
        if (!label.id || !label.name) continue;

        // Upsert label
        await supabaseAdmin
          .from("labels")
          .upsert(
            {
              external_id: label.id,
              company_id: instance.company_id,
              name: label.name,
              color: label.color ? String(label.color) : null,
            },
            { onConflict: "company_id, external_id" },
          )
          .select("id")
          .maybeSingle();
      }
      return;
    }

    if (body.event === "labels.association" || body.event === "labels.add") {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;

      const { data: instance } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("company_id")
        .eq("instance_name", instanceName)
        .single();

      if (!instance) return;

      const association = body.data;
      if (!association?.labelId || !association?.number) return;

      const phone = association.number.split("@")[0];

      // 1. Find Label
      const { data: labelInfo } = await supabaseAdmin
        .from("labels")
        .select("id")
        .eq("external_id", association.labelId)
        .eq("company_id", instance.company_id)
        .maybeSingle();

      if (!labelInfo) return; // Label not sync'd yet

      // 2. Find Contact
      const phoneVariants = getPhoneVariants(phone);

      const { data: contactInfo } = await supabaseAdmin
        .from("contacts")
        .select("id, whatsapp_lid, name")
        .eq("company_id", instance.company_id)
        .or(`phone.in.(${phoneVariants.join(",")}),whatsapp_lid.eq.${phone}`)
        .limit(1)
        .maybeSingle();

      if (!contactInfo) return;

      // 3. Insert association
      if (association.action === "add" || body.event === "labels.association") {
        await supabaseAdmin.from("contact_labels").upsert(
          {
            contact_id: contactInfo.id,
            label_id: labelInfo.id,
          },
          { onConflict: "contact_id, label_id" },
        );
      } else if (association.action === "remove") {
        await supabaseAdmin
          .from("contact_labels")
          .delete()
          .eq("contact_id", contactInfo.id)
          .eq("label_id", labelInfo.id);
      }

      return;
    }

    if (body.event === "JoinedGroup") {
      console.log(
        `[evogo-webhook] Evento JoinedGroup ignorado para atendimento (grupos não abrem ticket no CRM).`,
      );
      return;
    }

    return;
  } catch (err) {
    console.log(new Date().toISOString() + " ERROR: " + String(err) + "\n");
    console.error("Webhook error:", err);
    // Return 200 to acknowledge receipt and prevent endless retries from EvoGo
    return;
  }
}

async function handleReaction(targetRemoteId: string, emoji: string): Promise<void> {
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, reactions")
    .eq("remote_msg_id", targetRemoteId)
    .single();

  if (!msg) {
    return;
  }

  // No WhatsApp 1:1, cada mensagem só tem no máximo 1 reação.
  // Então podemos simplesmente substituir o objeto inteiro.
  const reactions = emoji ? { [emoji]: 1 } : {};

  await supabaseAdmin.from("messages").update({ reactions }).eq("id", msg.id);

  return;
}

export async function triggerAudioTranscription(
  messageId: string,
  base64Audio: string,
  companyId: string,
  audioFormat: string = "ogg",
) {
  try {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    if (
      !company?.ai_settings?.engines?.transcription ||
      company.ai_settings.engines.transcription === "none"
    ) {
      return;
    }

    const provider = company.ai_settings.engines.transcription;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      console.warn(`[transcribeAudio] No API key found for provider: ${provider}`);
      return;
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
      console.log(
        `[transcribeAudio] Sending to OpenRouter for message ${messageId} (format: ${audioFormat})...`,
      );
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

      console.log(
        `[transcribeAudio] Sending to ${provider} for message ${messageId} (format: ${audioFormat})...`,
      );
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
      console.error("[transcribeAudio] API Error:", response.status, err);
      return;
    }

    const data = await response.json();
    if (data.text) {
      console.log(`[transcribeAudio] Success! Length: ${data.text.length}`);
      await supabaseAdmin.from("messages").update({ transcription: data.text }).eq("id", messageId);
    }
  } catch (error) {
    console.error("[transcribeAudio] Error:", error);
  }
}
