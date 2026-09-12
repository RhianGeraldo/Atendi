/**
 * Handler de recepção do Webhook da Zernio (WhatsApp e Instagram).
 *
 * Base de referência: ZERNIO-IMPLEMENTACAO.md (§7, §8, §11, §12)
 *
 * Regras essenciais:
 *  - Validação das duas trancas via conferirPorta (?k= e HMAC condicional)
 *  - Retorno 200 IMEDIATO para não estourar o timeout de 5s da Zernio
 *  - Processamento em background após envio do 200
 *  - Resolução da instância pelo zernio_account_id
 *  - Atualização obrigatória de provider_thread_id na conversa
 *  - Download de mídia assíncrono para o bucket do Supabase
 *  - Enfileiramento da IA quando ativa
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { conferirPorta } from "./webhook-auth";
import { interpretarEventoZernio, type EventoZernioTraduzido } from "../canais/zernio/interpretar";
import { downloadZernioMedia } from "../canais/zernio/client";
import { enqueueAiMessage } from "./ai-queue";
import { getPhoneVariants } from "@/lib/utils";

export async function handleZernioWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. Extrair companyId da URL (ex: /api/webhooks/zernio/:companyId) ou segredo ?k=
  const pathParts = url.pathname.split("/").filter(Boolean);
  let companyId = pathParts.length >= 4 ? pathParts[3] : null; // /api/webhooks/zernio/:companyId
  const urlSecret = url.searchParams.get("k");

  let company: any = null;

  if (companyId) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, zernio_api_key, zernio_base_url, zernio_webhook_secret, zernio_signature_secret")
      .eq("id", companyId)
      .maybeSingle();
    company = data;
  } else if (urlSecret) {
    // Buscar empresa pelo segredo da URL ?k=
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, zernio_api_key, zernio_base_url, zernio_webhook_secret, zernio_signature_secret")
      .eq("zernio_webhook_secret", urlSecret)
      .limit(1)
      .maybeSingle();
    company = data;
    if (company) {
      companyId = company.id;
    }
  }

  // 2. Conferir trancas da porta (URL e Assinatura)
  const porta = await conferirPorta(request, {
    provedor: "zernio",
    segredoDaUrl: company?.zernio_webhook_secret || null,
    segredoDaAssinatura: company?.zernio_signature_secret || null,
    exigirAssinatura: false, // Zernio às vezes entrega sem cabeçalho (§7.1)
  });

  if (!porta.ok) {
    return porta.resposta;
  }

  let body: any;
  try {
    body = JSON.parse(porta.corpoBruto);
  } catch (e) {
    console.error("[zernio:webhook] Erro ao fazer parse do JSON bruto:", e);
    return new Response(JSON.stringify({ ok: true, note: "invalid_json_ignored" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Se não localizou a empresa pelas chaves, tenta encontrar pela instância informada no corpo
  if (!company) {
    const accId = body.account?.accountId || body.account?.id;
    if (accId) {
      const { data: inst } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("company_id")
        .eq("zernio_account_id", String(accId))
        .limit(1)
        .maybeSingle();

      if (inst?.company_id) {
        companyId = inst.company_id;
        const { data: compData } = await supabaseAdmin
          .from("companies")
          .select("id, zernio_api_key, zernio_base_url, zernio_webhook_secret, zernio_signature_secret")
          .eq("id", companyId)
          .single();
        company = compData;
      }
    }
  }

  // 3. RETORNAR 200 IMEDIATO (§7.2, §7.3)
  // O Zernio aborta requisições após ~5 segundos; processamos em background
  const processPromise = processarPayloadZernio(body, company).catch((err) => {
    console.error("[zernio:webhook] Erro no processamento assíncrono:", err);
  });

  // Em ambientes Node.js com processamento assíncrono desatrelado
  if (typeof (request as any).waitUntil === "function") {
    (request as any).waitUntil(processPromise);
  }

  return new Response(JSON.stringify({ ok: true, status: "received" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Processamento completo do evento Zernio em background.
 */
async function processarPayloadZernio(payload: any, company: any) {
  const eventos = Array.isArray(payload) ? payload : [payload];

  for (const item of eventos) {
    const traduzido = interpretarEventoZernio(item);

    if (traduzido.tipo === "descarte") {
      continue;
    }

    if (traduzido.tipo === "reacao") {
      await processarReacao(traduzido);
      continue;
    }

    if (traduzido.tipo === "recibo") {
      await processarRecibo(traduzido);
      continue;
    }

    if (traduzido.tipo === "mensagem") {
      await processarMensagem(traduzido, company);
      continue;
    }
  }
}

/**
 * Processa reação com emoji.
 */
async function processarReacao(evento: Extract<EventoZernioTraduzido, { tipo: "reacao" }>) {
  try {
    const { data: msg } = await supabaseAdmin
      .from("messages")
      .select("id, reactions")
      .eq("remote_msg_id", evento.platformMessageId)
      .maybeSingle();

    if (!msg) return;

    const reactions: Record<string, number> = msg.reactions || {};
    if (evento.emoji) {
      reactions[evento.emoji] = (reactions[evento.emoji] || 0) + 1;
    }

    await supabaseAdmin.from("messages").update({ reactions }).eq("id", msg.id);
  } catch (err) {
    console.error("[zernio:reacao] Erro ao atualizar reação:", err);
  }
}

/**
 * Processa recibo de entrega/leitura.
 */
async function processarRecibo(evento: Extract<EventoZernioTraduzido, { tipo: "recibo" }>) {
  try {
    const updateData: any = {};
    if (evento.status === "lida") {
      updateData.read_at = new Date().toISOString();
    }
    if (evento.status === "falhou" && evento.detalhe) {
      updateData.metadata = { error: evento.detalhe };
    }

    if (Object.keys(updateData).length > 0) {
      await supabaseAdmin
        .from("messages")
        .update(updateData)
        .eq("remote_msg_id", evento.platformMessageId);
    }
  } catch (err) {
    console.error("[zernio:recibo] Erro ao atualizar recibo:", err);
  }
}

/**
 * Ingestão completa de mensagem (WhatsApp ou Instagram).
 */
async function processarMensagem(
  evento: Extract<EventoZernioTraduzido, { tipo: "mensagem" }>,
  company: any
) {
  // 1. Encontrar instância pelo zernio_account_id
  const { data: instance, error: instErr } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, company_id, unit_id, provider, network, name")
    .eq("zernio_account_id", evento.accountId)
    .maybeSingle();

  if (instErr || !instance) {
    console.warn(`[zernio:webhook] Instância não encontrada para accountId: ${evento.accountId}`);
    return;
  }

  const companyId = instance.company_id;
  const unitId = instance.unit_id;
  const isFromMe = evento.direcao === "saida";
  const contactIdOrPhone = evento.remetente.identificador;
  const redeFinal: "whatsapp" | "instagram" =
    instance.network === "instagram" || evento.rede === "instagram" ? "instagram" : "whatsapp";

  // 2. Localizar ou criar Contato
  let contact: any = null;

  if (redeFinal === "instagram") {
    // Busca por instagram_id ou username
    let query = supabaseAdmin.from("contacts").select("*").eq("company_id", companyId);
    if (evento.remetente.username) {
      query = query.or(
        `instagram_id.eq.${contactIdOrPhone},instagram_username.eq.${evento.remetente.username}`
      );
    } else {
      query = query.eq("instagram_id", contactIdOrPhone);
    }

    const { data: foundContact } = await query.limit(1).maybeSingle();
    contact = foundContact;

    if (!contact) {
      const { data: newContact, error: createErr } = await supabaseAdmin
        .from("contacts")
        .insert({
          company_id: companyId,
          unit_id: unitId,
          name: evento.remetente.nome || (evento.remetente.username ? `@${evento.remetente.username}` : "Usuário Instagram"),
          instagram_id: contactIdOrPhone,
          instagram_username: evento.remetente.username || null,
          source: "instagram",
          source_details: "zernio",
          profile_picture_url: evento.remetente.fotoPerfil || null,
        })
        .select()
        .single();

      if (createErr) {
        console.error("[zernio:webhook] Erro ao criar contato Instagram:", createErr);
        return;
      }
      contact = newContact;
    } else if (evento.remetente.username && !contact.instagram_username) {
      // Atualizar username se faltava
      await supabaseAdmin
        .from("contacts")
        .update({ instagram_username: evento.remetente.username })
        .eq("id", contact.id);
    }
  } else {
    // WhatsApp: busca por variantes de telefone
    const variants = getPhoneVariants(contactIdOrPhone);
    const { data: foundContacts } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .in("phone", variants)
      .limit(1);

    contact = foundContacts?.[0];

    if (!contact) {
      const { data: newContact, error: createErr } = await supabaseAdmin
        .from("contacts")
        .insert({
          company_id: companyId,
          unit_id: unitId,
          name: evento.remetente.nome || contactIdOrPhone,
          phone: contactIdOrPhone,
          whatsapp_lid: evento.remetente.bsuid || null,
          source: "whatsapp",
          source_details: "zernio",
        })
        .select()
        .single();

      if (createErr) {
        console.error("[zernio:webhook] Erro ao criar contato WhatsApp:", createErr);
        return;
      }
      contact = newContact;
    }
  }

  if (contact.merged_into_id) {
    contact.id = contact.merged_into_id;
  }

  // 3. Localizar conversa ativa ou criar nova
  // Busca conversa pela instância e pelo contact_id OU pelo provider_thread_id
  let activeConv: any = null;

  if (evento.threadId) {
    const { data: convByThread } = await supabaseAdmin
      .from("conversations")
      .select("id, status, assigned_agent_id, contact_id, ai_active, provider_thread_id")
      .eq("whatsapp_instance_id", instance.id)
      .eq("provider_thread_id", evento.threadId)
      .maybeSingle();

    if (convByThread) {
      activeConv = convByThread;
    }
  }

  if (!activeConv) {
    const { data: convByContact } = await supabaseAdmin
      .from("conversations")
      .select("id, status, assigned_agent_id, contact_id, ai_active, provider_thread_id")
      .eq("whatsapp_instance_id", instance.id)
      .eq("contact_id", contact.id)
      .in("status", ["waiting", "active"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    activeConv = convByContact;
  }

  let conversationId: string;
  let aiActive = false;
  const nowIso = new Date().toISOString();
  const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const isSticker = evento.anexo?.tipo === "sticker";
  const validMediaType: "text" | "image" | "video" | "audio" | "document" = isSticker
    ? "image"
    : evento.anexo?.tipo === "image"
    ? "image"
    : evento.anexo?.tipo === "video"
    ? "video"
    : evento.anexo?.tipo === "audio"
    ? "audio"
    : evento.anexo
    ? "document"
    : "text";

  const messageDefaultLabel = isSticker
    ? "🖼️ Figurinha"
    : evento.anexo?.tipo === "image"
    ? "📷 Imagem"
    : evento.anexo?.tipo === "video"
    ? "🎥 Vídeo"
    : evento.anexo?.tipo === "audio"
    ? "🎵 Áudio"
    : evento.anexo
    ? "📄 Documento"
    : "";

  const messageContent = evento.texto || messageDefaultLabel;
  const previewText = (evento.texto || messageDefaultLabel || "Mensagem").substring(0, 50);

  if (activeConv) {
    conversationId = activeConv.id;
    aiActive = activeConv.ai_active ?? false;

    // Atualização obrigatória da thread e da janela de 24h (§4.3, §4.4)
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: previewText,
        provider_thread_id: evento.threadId || activeConv.provider_thread_id,
        remote_id: contactIdOrPhone,
        channel: redeFinal,
        has_window: true,
        window_expires_at: windowExpiry,
      })
      .eq("id", conversationId);
  } else {
    // Verificar agente de IA padrão da empresa
    const { data: defaultAgents } = await supabaseAdmin
      .from("ai_agents")
      .select("id, is_main_agent, active_by_default, name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .eq("is_main_agent", true)
      .limit(1);

    const defaultAgent = defaultAgents?.[0];
    const isAiDefault = defaultAgent?.active_by_default ?? false;
    aiActive = isAiDefault;

    const { data: newConv, error: newConvErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        contact_id: contact.id,
        whatsapp_instance_id: instance.id,
        unit_id: unitId,
        channel: redeFinal,
        status: isFromMe ? "resolved" : isAiDefault ? "active" : "waiting",
        started_at: nowIso,
        last_message_at: nowIso,
        last_message_preview: previewText,
        remote_id: contactIdOrPhone,
        provider_thread_id: evento.threadId || null,
        has_window: true,
        window_expires_at: windowExpiry,
        ai_active: aiActive,
        ai_agent_id: aiActive ? defaultAgent?.id : null,
      })
      .select("id")
      .single();

    if (newConvErr || !newConv) {
      console.error("[zernio:webhook] Erro ao criar conversa:", newConvErr);
      return;
    }
    conversationId = newConv.id;
  }

  // 4. Inserir Mensagem com Deduplicação por remote_msg_id
  const { data: existingMsg } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("remote_msg_id", evento.platformMessageId)
    .maybeSingle();

  if (existingMsg) {
    // Mensagem duplicada
    return;
  }

  const { data: insertedMsg, error: msgErr } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_type: isFromMe ? "agent" : "contact",
      content: messageContent,
      media_type: validMediaType,
      media_url: evento.anexo?.url || null,
      remote_msg_id: evento.platformMessageId,
      metadata: {
        zernio: true,
        is_sticker: isSticker,
        threadId: evento.threadId,
        referral: evento.anuncioReferral || null,
        attachments: evento.anexo ? [evento.anexo] : [],
      },
      created_at: nowIso,
    })
    .select("id")
    .single();

  if (msgErr || !insertedMsg) {
    console.error("[zernio:webhook] Erro ao inserir mensagem:", msgErr);
    return;
  }

  // 5. Download de Mídia em Background (§11)
  if (evento.anexo?.url) {
    let keyToUse = company?.zernio_api_key;
    if (!keyToUse && companyId) {
      const { data: c } = await supabaseAdmin
        .from("companies")
        .select("zernio_api_key")
        .eq("id", companyId)
        .maybeSingle();
      keyToUse = c?.zernio_api_key;
    }

    baixarEArmazenarMidiaZernio({
      messageId: insertedMsg.id,
      conversationId,
      mediaUrl: evento.anexo.url,
      isWhatsApp: redeFinal === "whatsapp",
      apiKey: keyToUse,
      accountId: evento.accountId,
    }).catch((err) => {
      console.error("[zernio:midia] Erro no download de mídia:", err);
    });
  }

  // 6. Enfileirar resposta da IA se conversa ativa e recebida do cliente
  if (!isFromMe && aiActive) {
    try {
      await enqueueAiMessage(conversationId, insertedMsg.id, companyId);
    } catch (aiErr) {
      console.error("[zernio:webhook] Erro ao enfileirar IA:", aiErr);
    }
  }
}

/**
 * Baixa mídia do Zernio/Meta e sobe para o bucket do Supabase.
 */
async function baixarEArmazenarMidiaZernio(params: {
  messageId: string;
  conversationId: string;
  mediaUrl: string;
  isWhatsApp: boolean;
  apiKey?: string;
  accountId?: string;
}) {
  const { messageId, conversationId, mediaUrl, isWhatsApp, apiKey, accountId } = params;

  const result = await downloadZernioMedia({
    mediaUrl,
    isWhatsApp,
    apiKey,
    accountId,
  });

  if (!result) return;

  const { buffer, mimeType, fileName } = result;
  const storagePath = `zernio_${conversationId}/${Date.now()}_${fileName}`;

  let uploadData = null;
  let uploadErr = null;

  const uploadRes1 = await supabaseAdmin.storage
    .from("media")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "31536000, must-revalidate",
    });

  uploadData = uploadRes1.data;
  uploadErr = uploadRes1.error;

  if (uploadErr && uploadErr.message?.includes("Bucket not found")) {
    await supabaseAdmin.storage.createBucket("media", { public: true });
    const uploadRes2 = await supabaseAdmin.storage
      .from("media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
        cacheControl: "31536000, must-revalidate",
      });
    uploadData = uploadRes2.data;
    uploadErr = uploadRes2.error;
  }

  if (uploadErr) {
    console.error("[zernio:storage] Erro ao subir arquivo para o Storage:", uploadErr);
    return;
  }

  if (uploadData) {
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("media")
      .getPublicUrl(uploadData.path);

    await supabaseAdmin
      .from("messages")
      .update({ media_url: publicUrlData.publicUrl })
      .eq("id", messageId);
  }
}
