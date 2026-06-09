import { T as TSS_SERVER_FUNCTION, a as createServerFn } from "./server-BpYW9gSM.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-CS_vbDu-.mjs";
import { s as supabaseAdmin } from "./index.mjs";
import "../_libs/seroval.mjs";
import "../_libs/react.mjs";
import { o as objectType, s as stringType, e as enumType } from "../_libs/zod.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:stream";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "fs";
var createServerRpc = (serverFnMeta, splitImportFn) => {
  const url = "/_serverFn/" + serverFnMeta.id;
  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
async function sendEvogoText({
  host,
  token,
  instanceName,
  number,
  text,
  delay = 1e3,
  quoted
}) {
  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/text`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      number,
      text,
      delay,
      ...quoted && { quoted }
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoGo API Error:", errorText);
    throw new Error(`Failed to send message via EvoGo: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function sendEvogoMedia({
  host,
  token,
  instanceName,
  number,
  base64,
  mediatype,
  caption = "",
  delay = 1e3,
  quoted
}) {
  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/media`;
  const rawBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
  const body = {
    number,
    url: rawBase64,
    media: rawBase64,
    // fallback for older Evolution API
    caption,
    type: mediatype,
    mediatype,
    // fallback
    mimetype: mediatype === "audio" ? "audio/ogg" : mediatype === "image" ? "image/jpeg" : mediatype === "video" ? "video/mp4" : "application/pdf",
    delay,
    ...quoted && { quoted }
  };
  if (mediatype === "document" || mediatype === "audio") {
    body.filename = mediatype === "audio" ? "audio.ogg" : "document.pdf";
    body.fileName = body.filename;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoGo Media API Error:", errorText);
    throw new Error(`Failed to send media via EvoGo: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function sendEvogoReaction({
  host,
  token,
  number,
  remoteMsgId,
  emoji,
  fromMe
}) {
  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/react`;
  const body = {
    number: number.includes("@") ? number : `${number}@s.whatsapp.net`,
    id: remoteMsgId,
    reaction: emoji,
    ...fromMe !== void 0 ? { fromMe } : {}
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoGo Reaction API Error:", errorText);
    throw new Error(`Failed to send reaction via EvoGo: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function editEvogoMessage({
  host,
  token,
  number,
  remoteMsgId,
  message
}) {
  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/edit`;
  const body = {
    chat: number.includes("@") ? number : `${number}@s.whatsapp.net`,
    messageId: remoteMsgId,
    message
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoGo Edit API Error:", errorText);
    throw new Error(`Failed to edit message via EvoGo: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
const sendMessageAction_createServerFn_handler = createServerRpc({
  id: "dd9203253ba64f3cb87006b18c1b323e9106f73b8e284aca47f898f557392cbc",
  name: "sendMessageAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => sendMessageAction.__executeServer(opts));
const sendMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  text: stringType().optional(),
  mediaType: enumType(["image", "video", "audio", "document", "text"]).optional(),
  mediaBase64: stringType().optional(),
  quotedMessageId: stringType().optional(),
  quotedParticipant: stringType().optional(),
  quotedInternalId: stringType().uuid().optional(),
  quotedContent: stringType().optional()
})).handler(sendMessageAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    data: conv,
    error: convErr
  } = await supabase.from("conversations").select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)").eq("id", data.conversationId).single();
  if (convErr || !conv) {
    throw new Error("Conversation not found or access denied.");
  }
  const phone = conv.contacts?.phone;
  if (!phone) {
    throw new Error("Contact has no phone number.");
  }
  let host, token, instanceName;
  if (conv.whatsapp_instance_id) {
    const {
      data: instance
    } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("id", conv.whatsapp_instance_id).single();
    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
    }
  }
  if (!host && conv.unit_id) {
    const {
      data: unitData
    } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
    if (unitData) {
      const {
        data: companyInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", unitData.company_id).limit(1).maybeSingle();
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
  const {
    data: userProfile
  } = await supabase.from("profiles").select("name, use_signature").eq("id", userId).single();
  let textToSend = data.text || "";
  if (userProfile?.use_signature && userProfile?.name) {
    textToSend = textToSend.trim() ? `*${userProfile.name}*:
${textToSend}` : `*${userProfile.name}*:`;
  }
  let evogoResponse;
  let finalParticipant = data.quotedParticipant;
  let finalMessageId = data.quotedMessageId;
  if (data.quotedInternalId) {
    const {
      data: qMsg
    } = await supabaseAdmin.from("messages").select("remote_msg_id, sender_type").eq("id", data.quotedInternalId).single();
    if (!finalMessageId && qMsg?.remote_msg_id) {
      finalMessageId = qMsg.remote_msg_id;
    }
  }
  if (!finalParticipant && conv.contacts?.phone && !conv.contacts.phone.includes("-")) {
    finalParticipant = `${conv.contacts.phone}@s.whatsapp.net`;
  }
  const quoted = finalMessageId ? {
    messageId: finalMessageId,
    ...finalParticipant && {
      participant: finalParticipant
    }
  } : void 0;
  console.log("[sendMessageAction] Sending message:", {
    host,
    token: token.substring(0, 5) + "...",
    instanceName,
    number: phone,
    text: textToSend,
    quoted,
    originalQuotedMessageId: data.quotedMessageId,
    finalMessageId,
    originalQuotedParticipant: data.quotedParticipant,
    finalParticipant
  });
  if (data.mediaBase64 && data.mediaType && data.mediaType !== "text") {
    evogoResponse = await sendEvogoMedia({
      host,
      token,
      instanceName,
      number: phone,
      base64: data.mediaBase64,
      mediatype: data.mediaType,
      caption: textToSend,
      quoted
    });
  } else {
    evogoResponse = await sendEvogoText({
      host,
      token,
      instanceName,
      number: phone,
      text: textToSend,
      quoted
    });
  }
  const remoteMsgId = evogoResponse?.data?.Info?.ID || evogoResponse?.key?.id || evogoResponse?.id || null;
  const {
    data: msg,
    error: msgErr
  } = await supabase.from("messages").insert({
    conversation_id: data.conversationId,
    sender_type: "agent",
    sender_id: userId,
    content: textToSend || null,
    media_type: data.mediaType || "text",
    media_url: data.mediaBase64 || null,
    remote_msg_id: remoteMsgId,
    quoted_message_id: data.quotedInternalId,
    quoted_content: data.quotedContent,
    participant_jid: evogoResponse?.data?.Info?.Sender || null
  }).select().single();
  if (msgErr) {
    console.error("Failed to save message in DB:", msgErr);
    throw new Error("Message sent but failed to save in history.");
  }
  await supabaseAdmin.from("conversations").update({
    last_message_at: (/* @__PURE__ */ new Date()).toISOString(),
    status: "active"
  }).eq("id", data.conversationId);
  return {
    success: true,
    message: msg
  };
});
const sendProactiveMessageAction_createServerFn_handler = createServerRpc({
  id: "c76aca24d249742fd3ad7e0d8ca6a4db1643e994b9dfcd0cfce4fb020e7bd732",
  name: "sendProactiveMessageAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => sendProactiveMessageAction.__executeServer(opts));
const sendProactiveMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  phone: stringType().min(10),
  text: stringType().min(1),
  instanceName: stringType().min(1),
  companyId: stringType().uuid()
})).handler(sendProactiveMessageAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    data: instance,
    error: instanceErr
  } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, unit_id, companies(evogo_host)").eq("instance_name", data.instanceName).eq("company_id", data.companyId).single();
  if (instanceErr || !instance) {
    throw new Error("Instance not found or access denied.");
  }
  const host = instance.companies?.evogo_host;
  const token = instance.evogo_api_key;
  const instanceName = instance.instance_name;
  let unitId = instance.unit_id;
  if (!unitId) {
    const {
      data: fallbackUnit
    } = await supabaseAdmin.from("units").select("id").eq("company_id", data.companyId).order("created_at").limit(1).maybeSingle();
    if (!fallbackUnit) throw new Error("No units available in this company.");
    unitId = fallbackUnit.id;
  }
  if (!host || !token) {
    throw new Error("EvoGo is not fully configured for this instance.");
  }
  let rawPhone = data.phone.replace(/\D/g, "");
  if (!rawPhone.startsWith("55")) rawPhone = "55" + rawPhone;
  const {
    data: userProfile
  } = await supabase.from("profiles").select("name, use_signature").eq("id", userId).single();
  let textToSend = data.text;
  if (userProfile?.use_signature && userProfile?.name) {
    textToSend = textToSend?.trim() ? `*${userProfile.name}*:
${textToSend}` : `*${userProfile.name}*:`;
  }
  await sendEvogoText({
    host,
    token,
    instanceName,
    number: rawPhone,
    text: textToSend
  });
  let contactId;
  const {
    data: existingContact
  } = await supabaseAdmin.from("contacts").select("id").eq("company_id", data.companyId).eq("phone", rawPhone).limit(1).maybeSingle();
  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const {
      data: newContact,
      error: contactErr
    } = await supabaseAdmin.from("contacts").insert({
      company_id: data.companyId,
      name: "Desconhecido",
      // They can edit later
      phone: rawPhone
    }).select().single();
    if (contactErr) throw new Error("Failed to create contact.");
    contactId = newContact.id;
  }
  let conversationId;
  const {
    data: latestConvs
  } = await supabaseAdmin.from("conversations").select("id, status").eq("unit_id", unitId).eq("contact_id", contactId).order("last_message_at", {
    ascending: false
  }).limit(1);
  if (latestConvs && latestConvs.length > 0) {
    const conv = latestConvs[0];
    conversationId = conv.id;
    const updatePayload = {
      last_message_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (conv.status === "resolved") {
      updatePayload.status = "active";
      updatePayload.assigned_agent_id = userId;
    }
    await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);
  } else {
    const {
      data: newConv,
      error: convErr
    } = await supabaseAdmin.from("conversations").insert({
      unit_id: unitId,
      contact_id: contactId,
      channel: "whatsapp",
      status: "active",
      // Since we started it, it's active
      last_message_at: (/* @__PURE__ */ new Date()).toISOString(),
      assigned_agent_id: userId
    }).select().single();
    if (convErr) throw new Error("Failed to create conversation.");
    conversationId = newConv.id;
  }
  const {
    error: msgErr
  } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "agent",
    sender_id: userId,
    content: textToSend,
    media_type: "text"
  });
  if (msgErr) {
    console.error("Failed to save message in DB:", msgErr);
  } else {
    await supabaseAdmin.from("conversations").update({
      last_message_at: (/* @__PURE__ */ new Date()).toISOString(),
      status: "active"
    }).eq("id", conversationId);
  }
  return {
    success: true,
    conversationId
  };
});
const fetchContactInfoAction_createServerFn_handler = createServerRpc({
  id: "5a253eb843f2f83595cc554479fa955a0127b5e77219ec35522be34171eb2e36",
  name: "fetchContactInfoAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => fetchContactInfoAction.__executeServer(opts));
const fetchContactInfoAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  contactId: stringType().uuid(),
  unitId: stringType().uuid().optional().nullable(),
  whatsappInstanceId: stringType().uuid().optional().nullable()
})).handler(fetchContactInfoAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase
  } = context;
  let whatsappInstanceId = data.whatsappInstanceId;
  if (!whatsappInstanceId) {
    const {
      data: convData
    } = await supabaseAdmin.from("conversations").select("whatsapp_instance_id").eq("contact_id", data.contactId).order("last_message_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (convData?.whatsapp_instance_id) whatsappInstanceId = convData.whatsapp_instance_id;
  }
  const {
    data: contact
  } = await supabase.from("contacts").select("phone").eq("id", data.contactId).single();
  if (!contact?.phone) return null;
  let host, token;
  if (whatsappInstanceId) {
    const {
      data: instance
    } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("id", whatsappInstanceId).single();
    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instance.instance_name;
    }
  } else {
    const {
      data: contactFull
    } = await supabase.from("contacts").select("company_id").eq("id", data.contactId).single();
    if (contactFull?.company_id) {
      const {
        data: compInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", contactFull.company_id).limit(1).maybeSingle();
      if (compInstance) {
        host = compInstance.companies?.evogo_host;
        token = compInstance.evogo_api_key;
        compInstance.instance_name;
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
        "apikey": token
      },
      body: JSON.stringify({
        number: contact.phone,
        preview: false
      })
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
const syncLabelsAction_createServerFn_handler = createServerRpc({
  id: "377fa883f3eced871b848252e227566e53f70fb19b65bff5a94781cc59d63023",
  name: "syncLabelsAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => syncLabelsAction.__executeServer(opts));
const syncLabelsAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid()
})).handler(syncLabelsAction_createServerFn_handler, async ({
  data,
  context
}) => {
  return {
    success: true,
    count: 0
  };
});
const createLabelAction_createServerFn_handler = createServerRpc({
  id: "64a1b9e14505d6b4ee4bee0a6923cb1a51d15cf8b9ebc17afe5eb23aaa2c8658",
  name: "createLabelAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => createLabelAction.__executeServer(opts));
const createLabelAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid(),
  name: stringType().min(1),
  color: stringType().optional()
})).handler(createLabelAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase
  } = context;
  const {
    data: instance
  } = await supabaseAdmin.from("whatsapp_instances").select("company_id").eq("unit_id", data.unitId).limit(1).maybeSingle();
  if (!instance?.company_id) return {
    success: false,
    error: "Empresa não encontrada"
  };
  const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
  const newLabel = {
    company_id: instance.company_id,
    name: data.name,
    color: data.color || randomColor,
    external_id: crypto.randomUUID()
    // using local UUID as external_id for consistency
  };
  const {
    data: label,
    error
  } = await supabaseAdmin.from("labels").insert(newLabel).select().single();
  if (error) {
    console.error("Failed to create label:", error);
    return {
      success: false,
      error: "Falha ao criar etiqueta"
    };
  }
  return {
    success: true,
    label
  };
});
const toggleContactLabelAction_createServerFn_handler = createServerRpc({
  id: "ffb31e8d05e09f6a4d00f6fb88d119d2abe6a6c4f0ad1d314106b46aa87038d5",
  name: "toggleContactLabelAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => toggleContactLabelAction.__executeServer(opts));
const toggleContactLabelAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid(),
  contactId: stringType().uuid(),
  labelId: stringType().uuid(),
  action: enumType(["add", "remove"])
})).handler(toggleContactLabelAction_createServerFn_handler, async ({
  data,
  context
}) => {
  if (data.action === "add") {
    const {
      error
    } = await supabaseAdmin.from("contact_labels").upsert({
      contact_id: data.contactId,
      label_id: data.labelId
    }, {
      onConflict: "contact_id, label_id"
    });
    if (error) {
      console.error("Failed to insert contact_label locally:", error);
      return {
        success: false
      };
    }
  } else {
    const {
      error
    } = await supabaseAdmin.from("contact_labels").delete().eq("contact_id", data.contactId).eq("label_id", data.labelId);
    if (error) {
      console.error("Failed to delete contact_label locally:", error);
      return {
        success: false
      };
    }
  }
  return {
    success: true
  };
});
const reactToMessageAction_createServerFn_handler = createServerRpc({
  id: "3e8bb2d1a87c1330c1ef34045f829dfae6a0d3c56f3e84628806bc966828fb41",
  name: "reactToMessageAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => reactToMessageAction.__executeServer(opts));
const reactToMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  messageId: stringType().uuid(),
  emoji: stringType()
})).handler(reactToMessageAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    data: conv
  } = await supabase.from("conversations").select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)").eq("id", data.conversationId).single();
  if (!conv || !conv.contacts?.phone) throw new Error("Conversation not found");
  const {
    data: msg
  } = await supabase.from("messages").select("remote_msg_id, sender_type, reactions").eq("id", data.messageId).single();
  if (!msg) throw new Error("Message not found");
  if (!msg.remote_msg_id) throw new Error("Cannot react to a message without a remote ID");
  let host, token, instanceName;
  if (conv.whatsapp_instance_id) {
    const {
      data: instance
    } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("id", conv.whatsapp_instance_id).single();
    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
    }
  }
  if (!host && conv.unit_id) {
    const {
      data: unitData
    } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
    if (unitData) {
      const {
        data: companyInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", unitData.company_id).limit(1).maybeSingle();
      if (companyInstance) {
        host = companyInstance.companies?.evogo_host;
        token = companyInstance.evogo_api_key;
        instanceName = companyInstance.instance_name;
      }
    }
  }
  if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");
  try {
    await sendEvogoReaction({
      host,
      token,
      number: conv.contacts.phone,
      remoteMsgId: msg.remote_msg_id,
      emoji: data.emoji,
      fromMe: msg.sender_type === "agent"
    });
  } catch (err) {
    console.warn("EvoGo Reaction failed, likely incorrect endpoint or unconfigured API. Still updating DB.", err);
  }
  const newReactions = data.emoji ? {
    [data.emoji]: 1
  } : {};
  await supabaseAdmin.from("messages").update({
    reactions: newReactions
  }).eq("id", data.messageId);
  return {
    success: true
  };
});
const assignConversationAction_createServerFn_handler = createServerRpc({
  id: "edfe9db65e87bec0d92954c633b7a848f42fb8da908308f89216148e724c7219",
  name: "assignConversationAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => assignConversationAction.__executeServer(opts));
const assignConversationAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid()
})).handler(assignConversationAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    data: userProfile
  } = await supabaseAdmin.from("profiles").select("department_id").eq("id", userId).limit(1).maybeSingle();
  const updateData = {
    assigned_agent_id: userId,
    status: "active"
  };
  if (userProfile?.department_id) {
    updateData.department_id = userProfile.department_id;
  }
  const {
    error
  } = await supabaseAdmin.from("conversations").update(updateData).eq("id", data.conversationId);
  if (error) {
    console.error("Failed to assign conversation:", error);
    throw new Error("Falha ao puxar atendimento.");
  }
  return {
    success: true
  };
});
const transferConversationAction_createServerFn_handler = createServerRpc({
  id: "897d74e9b4bf6c60c8ed905fbec4d92cbbab52e898844a511cc852b73ce9fa8d",
  name: "transferConversationAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => transferConversationAction.__executeServer(opts));
const transferConversationAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  targetType: enumType(["department", "agent"]),
  targetId: stringType().uuid()
})).handler(transferConversationAction_createServerFn_handler, async ({
  data
}) => {
  const updateData = {};
  if (data.targetType === "department") {
    updateData.department_id = data.targetId;
    updateData.assigned_agent_id = null;
    updateData.status = "waiting";
  } else {
    updateData.assigned_agent_id = data.targetId;
    updateData.status = "waiting";
    const {
      data: userProfile
    } = await supabaseAdmin.from("profiles").select("department_id").eq("id", data.targetId).limit(1).maybeSingle();
    if (userProfile?.department_id) {
      updateData.department_id = userProfile.department_id;
    }
  }
  const {
    error
  } = await supabaseAdmin.from("conversations").update(updateData).eq("id", data.conversationId);
  if (error) {
    console.error("Failed to transfer conversation:", error);
    throw new Error("Falha ao transferir atendimento.");
  }
  return {
    success: true
  };
});
const updateContactFromWhatsappAction_createServerFn_handler = createServerRpc({
  id: "3939cb512fb25d2bfc6fa2cc62824508d4d5622d2202c92cad447a73b94229c0",
  name: "updateContactFromWhatsappAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => updateContactFromWhatsappAction.__executeServer(opts));
const updateContactFromWhatsappAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  contactId: stringType().uuid(),
  unitId: stringType().uuid().optional().nullable(),
  whatsappInstanceId: stringType().uuid().optional().nullable()
})).handler(updateContactFromWhatsappAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase
  } = context;
  let whatsappInstanceId = data.whatsappInstanceId;
  if (!whatsappInstanceId) {
    const {
      data: convData
    } = await supabaseAdmin.from("conversations").select("whatsapp_instance_id").eq("contact_id", data.contactId).order("last_message_at", {
      ascending: false
    }).limit(1).maybeSingle();
    if (convData?.whatsapp_instance_id) whatsappInstanceId = convData.whatsapp_instance_id;
  }
  const {
    data: contact
  } = await supabase.from("contacts").select("phone").eq("id", data.contactId).single();
  if (!contact?.phone) throw new Error("Contato sem telefone.");
  let host, token, instanceName;
  if (whatsappInstanceId) {
    const {
      data: instance
    } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("id", whatsappInstanceId).single();
    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
    }
  } else {
    const {
      data: contactFull
    } = await supabase.from("contacts").select("company_id").eq("id", data.contactId).single();
    if (contactFull?.company_id) {
      const {
        data: compInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", contactFull.company_id).limit(1).maybeSingle();
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": token
      },
      body: JSON.stringify({
        number: contact.phone
      }),
      signal: AbortSignal.timeout(5e3)
    });
    if (resInfo.ok) {
      const jsonInfo = await resInfo.json();
      pushName = jsonInfo.name || jsonInfo.pushName || jsonInfo.pushname || jsonInfo.contactName || null;
    } else {
      const resProfile = await fetch(`${host}/chat/fetchProfile/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": token
        },
        body: JSON.stringify({
          number: contact.phone
        }),
        signal: AbortSignal.timeout(5e3)
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
    const resAvatar = await fetch(`${host}/user/avatar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": token
      },
      body: JSON.stringify({
        number: contact.phone,
        preview: false
      }),
      signal: AbortSignal.timeout(5e3)
    });
    if (resAvatar.ok) {
      const jsonAvatar = await resAvatar.json();
      avatarUrl = jsonAvatar.url || jsonAvatar.profilePictureUrl || jsonAvatar.picture || null;
    }
  } catch (e) {
    console.warn("Failed to fetch avatar:", e);
  }
  if (pushName) {
    await supabaseAdmin.from("contacts").update({
      name: pushName
    }).eq("id", data.contactId);
    return {
      success: true,
      updatedName: pushName,
      avatarFound: !!avatarUrl
    };
  } else if (avatarUrl) {
    return {
      success: true,
      updatedName: "Foto Encontrada",
      avatarFound: true,
      message: "Foto de perfil atualizada!"
    };
  } else {
    return {
      success: false,
      message: "Nenhum nome público ou foto encontrados no WhatsApp."
    };
  }
});
const editMessageAction_createServerFn_handler = createServerRpc({
  id: "715a4427d813845ac7bac0ffe3a0d811a573bd838936cb32984228eb37967546",
  name: "editMessageAction",
  filename: "src/lib/api/chat.functions.ts"
}, (opts) => editMessageAction.__executeServer(opts));
const editMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  messageId: stringType().uuid(),
  newContent: stringType().min(1)
})).handler(editMessageAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    data: conv
  } = await supabase.from("conversations").select("whatsapp_instance_id, unit_id, contact_id, contacts(phone)").eq("id", data.conversationId).single();
  if (!conv || !conv.contacts?.phone) throw new Error("Conversation not found");
  const {
    data: msg
  } = await supabase.from("messages").select("remote_msg_id, sender_type, sender_id, media_type").eq("id", data.messageId).single();
  if (!msg) throw new Error("Message not found");
  if (!msg.remote_msg_id) throw new Error("Cannot edit a message without a remote ID");
  if (msg.sender_type !== "agent") throw new Error("You can only edit messages sent by an agent");
  if (msg.media_type && msg.media_type !== "text") throw new Error("Only text messages can be edited");
  let textToSend = data.newContent;
  const {
    data: userProfile
  } = await supabase.from("profiles").select("name, use_signature").eq("id", userId).single();
  if (userProfile?.use_signature && userProfile?.name) {
    textToSend = textToSend.trim() ? `*${userProfile.name}*:
${textToSend}` : `*${userProfile.name}*:`;
  }
  let host, token, instanceName;
  if (conv.whatsapp_instance_id) {
    const {
      data: instance
    } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("id", conv.whatsapp_instance_id).single();
    if (instance) {
      host = instance.companies?.evogo_host;
      token = instance.evogo_api_key;
      instanceName = instance.instance_name;
    }
  }
  if (!host && conv.unit_id) {
    const {
      data: unitData
    } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
    if (unitData) {
      const {
        data: companyInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", unitData.company_id).limit(1).maybeSingle();
      if (companyInstance) {
        host = companyInstance.companies?.evogo_host;
        token = companyInstance.evogo_api_key;
        instanceName = companyInstance.instance_name;
      }
    }
  }
  if (!host || !token || !instanceName) throw new Error("EvoGo is not configured");
  try {
    await editEvogoMessage({
      host,
      token,
      number: conv.contacts.phone,
      remoteMsgId: msg.remote_msg_id,
      message: textToSend
    });
  } catch (err) {
    console.error("EvoGo Edit failed:", err);
    throw new Error(`Failed to edit message in WhatsApp: ${err.message || String(err)}`);
  }
  const {
    error: updateErr
  } = await supabaseAdmin.from("messages").update({
    content: textToSend,
    is_edited: true
  }).eq("id", data.messageId);
  if (updateErr) {
    console.error("Failed to update edited message in DB", updateErr);
  }
  return {
    success: true
  };
});
export {
  assignConversationAction_createServerFn_handler,
  createLabelAction_createServerFn_handler,
  editMessageAction_createServerFn_handler,
  fetchContactInfoAction_createServerFn_handler,
  reactToMessageAction_createServerFn_handler,
  sendMessageAction_createServerFn_handler,
  sendProactiveMessageAction_createServerFn_handler,
  syncLabelsAction_createServerFn_handler,
  toggleContactLabelAction_createServerFn_handler,
  transferConversationAction_createServerFn_handler,
  updateContactFromWhatsappAction_createServerFn_handler
};
