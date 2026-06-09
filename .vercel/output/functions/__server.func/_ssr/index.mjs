import { c as createClient } from "../_libs/supabase__supabase-js.mjs";
import * as fs from "fs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
let lastCapturedError;
const TTL_MS = 5e3;
function record(error) {
  lastCapturedError = { error, at: Date.now() };
}
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record(event.error ?? event));
  globalThis.addEventListener(
    "unhandledrejection",
    (event) => record(event.reason)
  );
}
function consumeLastCapturedError() {
  if (!lastCapturedError) return void 0;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = void 0;
    return void 0;
  }
  const { error } = lastCapturedError;
  lastCapturedError = void 0;
  return error;
}
function renderErrorPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [
      ...!SUPABASE_URL ? ["SUPABASE_URL"] : [],
      ...!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY"] : []
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      storage: void 0,
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
let _supabaseAdmin;
const supabaseAdmin = new Proxy({}, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  }
});
async function handleEvogoWebhook(request) {
  try {
    const body = await request.json();
    await processEvogoWebhookBody(body);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook parse/process error:", err);
    return new Response("OK", { status: 200 });
  }
}
async function processEvogoWebhookBody(body) {
  try {
    const logBody = JSON.parse(JSON.stringify(body));
    if (logBody?.data?.Message?.base64) logBody.data.Message.base64 = `[base64 ~${Math.round(logBody.data.Message.base64.length / 1024)}kB omitted]`;
    if (logBody?.data?.base64) logBody.data.base64 = `[base64 ~${Math.round(logBody.data.base64.length / 1024)}kB omitted]`;
    console.log((/* @__PURE__ */ new Date()).toISOString() + " WEBHOOK IN: " + JSON.stringify(logBody) + "\n");
    console.log("EvoGo Webhook received:", JSON.stringify(logBody, null, 2));
    try {
      fs.writeFileSync("webhook-debug.json", JSON.stringify(logBody, null, 2));
    } catch (e) {
      console.error("Failed to write webhook-debug.json", e);
    }
    if (body.event === "messages.upsert" || body.event === "messages.update" || body.event === "Message") {
      const instanceName = body.instance || body.instanceName;
      let messageData;
      let isFromMe = false;
      let remoteJid = "";
      let pushName = "Desconhecido";
      let textContent = "";
      let phoneNumber = "";
      let mediaType = "text";
      let mediaUrl = null;
      let remoteMsgId = null;
      let quotedStanzaId = null;
      let quotedContent = null;
      let actualGroupName = null;
      if (body.event === "Message") {
        const info = body.data?.Info;
        const msg = body.data?.Message;
        if (!info || !msg) return;
        isFromMe = info.IsFromMe;
        const getPhone = (jids) => {
          const group = jids.find((j) => j && j.includes("@g.us"));
          if (group) return group.split("@")[0];
          const real = jids.find((j) => j && j.includes("@s.whatsapp.net"));
          if (real) return real.split("@")[0];
          const fallback = jids.find((j) => j && j.trim() !== "");
          if (fallback) return fallback.split("@")[0];
          return null;
        };
        if (isFromMe) {
          remoteJid = info.Chat || info.RecipientAlt;
          phoneNumber = getPhone([info.Chat, info.RecipientAlt]);
        } else {
          remoteJid = info.Chat || info.Sender || info.SenderAlt;
          phoneNumber = getPhone([info.Chat, info.Sender, info.SenderAlt]);
        }
        pushName = info.PushName || "Desconhecido";
        remoteMsgId = info.ID;
        if (body.data?.groupData?.Name) {
          actualGroupName = body.data.groupData.Name;
        }
        if (body.data?.isQuoted && body.data?.quoted) {
          quotedStanzaId = body.data.quoted.stanzaID;
          const qm = body.data.quoted.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || "Anexo";
        } else if (msg.extendedTextMessage?.contextInfo?.stanzaId) {
          quotedStanzaId = msg.extendedTextMessage.contextInfo.stanzaId;
          const qm = msg.extendedTextMessage.contextInfo.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || "Anexo";
        }
        if (msg.conversation) {
          textContent = msg.conversation;
        } else if (msg.extendedTextMessage?.text) {
          textContent = msg.extendedTextMessage.text;
        } else if (msg.imageMessage) {
          mediaType = "image";
          textContent = msg.imageMessage.caption || "📷 Imagem";
          if (msg.base64) {
            mediaUrl = `data:${msg.imageMessage.mimetype || "image/jpeg"};base64,${msg.base64}`;
          } else if (msg.imageMessage.jpegThumbnail) {
            mediaUrl = `data:image/jpeg;base64,${msg.imageMessage.jpegThumbnail}`;
          }
        } else if (msg.videoMessage) {
          mediaType = "video";
          textContent = msg.videoMessage.caption || "🎥 Vídeo";
          if (msg.videoMessage.jpegThumbnail) {
            mediaUrl = `data:image/jpeg;base64,${msg.videoMessage.jpegThumbnail}`;
          }
        } else if (msg.audioMessage || msg.ptvMessage) {
          mediaType = "audio";
          textContent = "🎵 Áudio";
          const audioMsg = msg.audioMessage || msg.ptvMessage;
          if (msg.base64) {
            mediaUrl = `data:${audioMsg?.mimetype || "audio/ogg"};base64,${msg.base64}`;
          }
        } else if (msg.documentMessage) {
          mediaType = "document";
          textContent = msg.documentMessage.fileName || "📄 Documento";
        } else if (msg.stickerMessage) {
          mediaType = "image";
          textContent = "🖼️ Figurinha";
          if (msg.base64) {
            mediaUrl = `data:${msg.stickerMessage.mimetype || "image/webp"};base64,${msg.base64}`;
          } else if (msg.stickerMessage.jpegThumbnail) {
            mediaUrl = `data:image/jpeg;base64,${msg.stickerMessage.jpegThumbnail}`;
          }
        } else if (info.Type === "reaction" || msg.reactionMessage) {
          const targetId = msg.reactionMessage?.key?.ID || msg.reactionMessage?.key?.id;
          const emoji = msg.reactionMessage?.text || "";
          if (targetId) {
            return await handleReaction(targetId, emoji);
          }
        } else if (msg.albumMessage) {
          return;
        }
      } else {
        const messageData2 = body.data?.message || body.message || body;
        isFromMe = messageData2.key?.fromMe || false;
        remoteJid = messageData2.key?.remoteJid || "";
        pushName = messageData2.pushName || "Desconhecido";
        if (remoteJid.includes("@g.us")) {
          phoneNumber = remoteJid.split("@")[0];
        } else {
          phoneNumber = remoteJid ? remoteJid.split("@")[0] : null;
        }
        remoteMsgId = messageData2.key?.id || null;
        const msgType = messageData2.message;
        const base64Content = body.base64 || messageData2.base64;
        if (msgType?.extendedTextMessage?.contextInfo?.stanzaId) {
          quotedStanzaId = msgType.extendedTextMessage.contextInfo.stanzaId;
          const qm = msgType.extendedTextMessage.contextInfo.quotedMessage;
          quotedContent = qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || "Anexo";
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
            } else if (msgType.imageMessage.jpegThumbnail) {
              mediaUrl = `data:image/jpeg;base64,${msgType.imageMessage.jpegThumbnail}`;
            }
          } else if (msgType.videoMessage) {
            mediaType = "video";
            textContent = msgType.videoMessage.caption || "🎥 Vídeo";
            if (base64Content) {
              mediaUrl = `data:${msgType.videoMessage.mimetype || "video/mp4"};base64,${base64Content}`;
            } else if (msgType.videoMessage.jpegThumbnail) {
              mediaUrl = `data:image/jpeg;base64,${msgType.videoMessage.jpegThumbnail}`;
            }
          } else if (msgType.audioMessage || msgType.ptvMessage) {
            mediaType = "audio";
            textContent = "🎵 Áudio";
            if (base64Content) {
              const audioMsg = msgType.audioMessage || msgType.ptvMessage;
              mediaUrl = `data:${audioMsg.mimetype || "audio/ogg"};base64,${base64Content}`;
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
            }
          } else if (msgType.reactionMessage) {
            const targetId = msgType.reactionMessage?.key?.id || msgType.reactionMessage?.key?.ID;
            const emoji = msgType.reactionMessage?.text || "";
            if (targetId) {
              return await handleReaction(targetId, emoji);
            }
          }
        }
      }
      if (!instanceName) {
        return;
      }
      if (!phoneNumber) {
        return;
      }
      if (!textContent) {
        textContent = "[Mídia/Mensagem não suportada]";
      }
      if (remoteJid.includes("@g.us") && !isFromMe) {
        textContent = `*${pushName}:*
${textContent}`;
      }
      const { data: instance, error: instanceErr } = await supabaseAdmin.from("whatsapp_instances").select("unit_id, company_id").eq("instance_name", instanceName).single();
      if (instanceErr || !instance) {
        console.error("Instance not found for webhook:", instanceName);
        return;
      }
      let { company_id, unit_id } = instance;
      if (!unit_id) {
        const { data: fallbackUnit } = await supabaseAdmin.from("units").select("id").eq("company_id", company_id).order("created_at").limit(1).maybeSingle();
        if (fallbackUnit) {
          unit_id = fallbackUnit.id;
        } else {
          console.log("Instance has no unit_id: " + instanceName + "\n");
          console.error("Instance has no unit_id linked:", instanceName);
          return;
        }
      }
      let contactId;
      const { data: existingContacts } = await supabaseAdmin.from("contacts").select("id, name").eq("company_id", company_id).eq("phone", phoneNumber).limit(1);
      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        if (remoteJid.includes("@g.us")) {
          if (actualGroupName && existingContacts[0].name !== actualGroupName) {
            await supabaseAdmin.from("contacts").update({ name: actualGroupName }).eq("id", contactId);
          }
        } else if (pushName && pushName !== "Desconhecido" && existingContacts[0].name !== pushName) {
          await supabaseAdmin.from("contacts").update({ name: pushName }).eq("id", contactId);
        }
      } else {
        const groupDefaultName = actualGroupName || "Grupo do WhatsApp";
        const { data: newContact, error: contactErr } = await supabaseAdmin.from("contacts").insert({
          company_id,
          name: remoteJid.includes("@g.us") ? groupDefaultName : pushName,
          phone: phoneNumber
        }).select().single();
        if (contactErr) throw contactErr;
        contactId = newContact.id;
      }
      let conversationId;
      const { data: activeConvs } = await supabaseAdmin.from("conversations").select("id, status").eq("unit_id", unit_id).eq("contact_id", contactId).in("status", ["waiting", "active"]).limit(1);
      if (activeConvs && activeConvs.length > 0) {
        conversationId = activeConvs[0].id;
        await supabaseAdmin.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conversationId);
      } else {
        const { data: newConv, error: convErr } = await supabaseAdmin.from("conversations").insert({
          unit_id,
          contact_id: contactId,
          channel: "whatsapp",
          status: "waiting",
          last_message_at: (/* @__PURE__ */ new Date()).toISOString()
        }).select().single();
        if (convErr) throw convErr;
        conversationId = newConv.id;
      }
      let quotedInternalId = null;
      if (quotedStanzaId) {
        const { data: quotedMsg } = await supabaseAdmin.from("messages").select("id").eq("remote_msg_id", quotedStanzaId).single();
        if (quotedMsg) {
          quotedInternalId = quotedMsg.id;
        }
      }
      if (remoteMsgId) {
        const { data: existingMsg } = await supabaseAdmin.from("messages").select("id").eq("remote_msg_id", remoteMsgId).maybeSingle();
        if (existingMsg) {
          await supabaseAdmin.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conversationId);
          return;
        }
      }
      const insertPayload = {
        conversation_id: conversationId,
        sender_type: isFromMe ? "agent" : "contact",
        content: textContent,
        media_type: mediaType,
        media_url: mediaUrl,
        remote_msg_id: remoteMsgId,
        quoted_message_id: quotedInternalId,
        quoted_content: quotedContent
      };
      const { error: msgErr } = await supabaseAdmin.from("messages").insert(insertPayload);
      if (msgErr) {
        console.error("Insert failed with new columns, falling back...", msgErr);
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: isFromMe ? "agent" : "contact",
          content: textContent,
          media_type: mediaType,
          media_url: mediaUrl
        });
      }
      return;
    }
    if (body.event === "labels.edit" || body.event === "labels.upsert" || body.event === "labels.update") {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;
      const { data: instance } = await supabaseAdmin.from("whatsapp_instances").select("company_id").eq("instance_name", instanceName).single();
      if (!instance) return;
      const labelsData = Array.isArray(body.data) ? body.data : [body.data];
      for (const label of labelsData) {
        if (!label.id || !label.name) continue;
        await supabaseAdmin.from("labels").upsert({
          external_id: label.id,
          company_id: instance.company_id,
          name: label.name,
          color: label.color ? String(label.color) : null
        }, { onConflict: "company_id, external_id" }).select("id").maybeSingle();
      }
      return;
    }
    if (body.event === "labels.association" || body.event === "labels.add") {
      const instanceName = body.instance || body.instanceName;
      if (!instanceName) return;
      const { data: instance } = await supabaseAdmin.from("whatsapp_instances").select("company_id").eq("instance_name", instanceName).single();
      if (!instance) return;
      const association = body.data;
      if (!association?.labelId || !association?.number) return;
      const phone = association.number.split("@")[0];
      const { data: labelInfo } = await supabaseAdmin.from("labels").select("id").eq("external_id", association.labelId).eq("company_id", instance.company_id).maybeSingle();
      if (!labelInfo) return;
      const { data: contactInfo } = await supabaseAdmin.from("contacts").select("id").eq("phone", phone).eq("company_id", instance.company_id).maybeSingle();
      if (!contactInfo) return;
      if (association.action === "add" || body.event === "labels.association") {
        await supabaseAdmin.from("contact_labels").upsert({
          contact_id: contactInfo.id,
          label_id: labelInfo.id
        }, { onConflict: "contact_id, label_id" });
      } else if (association.action === "remove") {
        await supabaseAdmin.from("contact_labels").delete().eq("contact_id", contactInfo.id).eq("label_id", labelInfo.id);
      }
      return;
    }
    return;
  } catch (err) {
    console.log((/* @__PURE__ */ new Date()).toISOString() + " ERROR: " + String(err) + "\n");
    console.error("Webhook error:", err);
    return;
  }
}
async function handleReaction(targetRemoteId, emoji) {
  const { data: msg } = await supabaseAdmin.from("messages").select("id, reactions").eq("remote_msg_id", targetRemoteId).single();
  if (!msg) {
    return;
  }
  const reactions = emoji ? { [emoji]: 1 } : {};
  await supabaseAdmin.from("messages").update({ reactions }).eq("id", msg.id);
  return;
}
let serverEntryPromise;
async function getServerEntry() {
  if (!serverEntryPromise) {
    serverEntryPromise = import("./server-BNDz7mE0.mjs").then((n) => n.s).then(
      (m) => m.default ?? m
    );
  }
  return serverEntryPromise;
}
async function normalizeCatastrophicSsrResponse(response) {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
const server = {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/evogo/webhook" && request.method === "POST") {
        return await handleEvogoWebhook(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
  }
};
export {
  server as default,
  renderErrorPage as r,
  supabaseAdmin as s
};
