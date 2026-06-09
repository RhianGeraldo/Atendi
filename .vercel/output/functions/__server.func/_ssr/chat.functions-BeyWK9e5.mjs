import { T as TSS_SERVER_FUNCTION, a as createServerFn } from "./server-BNDz7mE0.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-CeW4yW8O.mjs";
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
  delay = 1e3
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
      delay
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
  delay = 1e3
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
    delay
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
  emoji
}) {
  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/react`;
  const body = {
    number: number.includes("@") ? number : `${number}@s.whatsapp.net`,
    id: remoteMsgId,
    reaction: emoji
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
  mediaBase64: stringType().optional()
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
  } = await supabase.from("conversations").select("unit_id, contact_id, contacts(phone)").eq("id", data.conversationId).single();
  if (convErr || !conv) {
    throw new Error("Conversation not found or access denied.");
  }
  const phone = conv.contacts?.phone;
  if (!phone) {
    throw new Error("Contact has no phone number.");
  }
  const {
    data: instance,
    error: instanceErr
  } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("unit_id", conv.unit_id).limit(1).maybeSingle();
  let host = instance?.companies?.evogo_host;
  let token = instance?.evogo_api_key;
  let instanceName = instance?.instance_name;
  if (!instance) {
    const {
      data: unitData
    } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
    if (unitData) {
      const {
        data: companyInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", unitData.company_id).is("unit_id", null).limit(1).maybeSingle();
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
  const {
    data: userProfile
  } = await supabase.from("profiles").select("name, use_signature").eq("id", userId).single();
  let textToSend = data.text || "";
  if (userProfile?.use_signature && userProfile?.name) {
    textToSend = textToSend.trim() ? `*${userProfile.name}*:
${textToSend}` : `*${userProfile.name}*:`;
  }
  let evogoResponse;
  if (data.mediaBase64 && data.mediaType && data.mediaType !== "text") {
    evogoResponse = await sendEvogoMedia({
      host,
      token,
      instanceName,
      number: phone,
      base64: data.mediaBase64,
      mediatype: data.mediaType,
      caption: textToSend
    });
  } else {
    evogoResponse = await sendEvogoText({
      host,
      token,
      instanceName,
      number: phone,
      text: textToSend
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
    remote_msg_id: remoteMsgId
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
    data: activeConv
  } = await supabaseAdmin.from("conversations").select("id").eq("unit_id", unitId).eq("contact_id", contactId).in("status", ["waiting", "active"]).limit(1).maybeSingle();
  if (activeConv) {
    conversationId = activeConv.id;
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
  unitId: stringType().uuid()
})).handler(fetchContactInfoAction_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase
  } = context;
  const {
    data: contact
  } = await supabase.from("contacts").select("phone").eq("id", data.contactId).single();
  if (!contact?.phone) return null;
  const {
    data: instance
  } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("unit_id", data.unitId).limit(1).maybeSingle();
  if (!instance || !instance.evogo_api_key || !instance.companies?.evogo_host) return null;
  const host = instance.companies.evogo_host;
  const token = instance.evogo_api_key;
  instance.instance_name;
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
  } = await supabase.from("conversations").select("unit_id, contact_id, contacts(phone)").eq("id", data.conversationId).single();
  if (!conv || !conv.contacts?.phone) throw new Error("Conversation not found");
  const {
    data: msg
  } = await supabase.from("messages").select("remote_msg_id, sender_type, reactions").eq("id", data.messageId).single();
  if (!msg) throw new Error("Message not found");
  if (!msg.remote_msg_id) throw new Error("Cannot react to a message without a remote ID");
  let host, token, instanceName;
  const {
    data: instance
  } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("unit_id", conv.unit_id).limit(1).maybeSingle();
  if (instance) {
    host = instance.companies?.evogo_host;
    token = instance.evogo_api_key;
    instanceName = instance.instance_name;
  } else {
    const {
      data: unitData
    } = await supabaseAdmin.from("units").select("company_id").eq("id", conv.unit_id).single();
    if (unitData) {
      const {
        data: companyInstance
      } = await supabaseAdmin.from("whatsapp_instances").select("instance_name, evogo_api_key, companies(evogo_host)").eq("company_id", unitData.company_id).is("unit_id", null).limit(1).maybeSingle();
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
      emoji: data.emoji
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
export {
  createLabelAction_createServerFn_handler,
  fetchContactInfoAction_createServerFn_handler,
  reactToMessageAction_createServerFn_handler,
  sendMessageAction_createServerFn_handler,
  sendProactiveMessageAction_createServerFn_handler,
  syncLabelsAction_createServerFn_handler,
  toggleContactLabelAction_createServerFn_handler
};
