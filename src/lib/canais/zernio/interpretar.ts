/**
 * Tradução dos eventos brutos da Zernio em estruturas normalizadas do sistema.
 *
 * Base de referência: ZERNIO-IMPLEMENTACAO.md (§8 - Tradução dos eventos)
 *
 * FUNÇÃO PURA: sem banco, sem rede. Testável determinísticamente.
 */

export type EventoZernioTraduzido =
  | {
      tipo: "mensagem";
      threadId: string;
      accountId: string;
      rede: "whatsapp" | "instagram";
      platformMessageId: string;
      direcao: "entrada" | "saida";
      origem: "cloud_api" | "whatsapp_business_app" | "outro";
      remetente: {
        identificador: string; // fone (E.164 limpo) ou IGSID
        nome?: string;
        username?: string; // @ do Instagram
        bsuid?: string;
        fotoPerfil?: string;
      };
      texto?: string;
      anexo?: {
        tipo: "image" | "video" | "audio" | "document" | "sticker";
        url: string; // url bruta
        prefixo: "auth:" | "open:"; // auth: (WhatsApp) ou open: (Instagram)
        mimeType?: string;
        nomeArquivo?: string;
      };
      citandoMessageId?: string;
      anuncioReferral?: {
        adId?: string;
        titulo?: string;
        corpo?: string;
        fonte?: string;
      };
      perfilInstagram?: {
        isFollower?: boolean;
        isFollowing?: boolean;
        followerCount?: number;
      };
      raw: any;
    }
  | {
      tipo: "recibo";
      accountId: string;
      threadId: string;
      platformMessageId: string;
      status: "entregue" | "lida" | "falhou";
      detalhe?: string;
      raw: any;
    }
  | {
      tipo: "reacao";
      accountId: string;
      threadId: string;
      platformMessageId: string;
      emoji?: string; // vazio se desfeita
      minha: boolean; // se partiu da nossa conta ou do cliente
      raw: any;
    }
  | {
      tipo: "status_template";
      accountId: string;
      templateName: string;
      status: string;
      reason?: string;
      raw: any;
    }
  | {
      tipo: "descarte";
      motivo: string;
      raw: any;
    };

export function interpretarEventoZernio(payload: any): EventoZernioTraduzido {
  if (!payload || typeof payload !== "object") {
    return { tipo: "descarte", motivo: "payload_invalido", raw: payload };
  }

  const eventName = payload.event || "";
  const account = payload.account || {};
  const accountId = String(account.accountId || account.id || "");
  const conversation = payload.conversation || {};
  const threadId = String(conversation.id || "");

  // 1. Ordem importa: template status não tem bloco message (§8.3, §8.6)
  if (eventName === "whatsapp.template.status_updated" || payload.template) {
    const tmpl = payload.template || {};
    const reason = tmpl.reason === "NONE" ? undefined : tmpl.reason;
    return {
      tipo: "status_template",
      accountId,
      templateName: tmpl.name || "",
      status: tmpl.status || "",
      reason,
      raw: payload,
    };
  }

  // 2. Reação (§8.5)
  if (eventName === "reaction.received" || payload.reaction) {
    const rx = payload.reaction || {};
    const msgId = rx.platformMessageId;
    if (!msgId) {
      return { tipo: "descarte", motivo: "reacao_sem_platformMessageId", raw: payload };
    }
    const emoji = rx.action === "removed" ? undefined : rx.emoji || undefined;
    // Se reaction.sender.id !== conversation.participantId, fomos nós que reagimos
    const participantId = conversation.participantId;
    const minha = Boolean(rx.sender?.id && participantId && rx.sender.id !== participantId);

    return {
      tipo: "reacao",
      accountId,
      threadId,
      platformMessageId: msgId,
      emoji,
      minha,
      raw: payload,
    };
  }

  // 3. Recibos de entrega e leitura (§8.3)
  if (
    eventName === "message.delivered" ||
    eventName === "message.read" ||
    eventName === "message.failed"
  ) {
    const msg = payload.message || {};
    const platformMsgId = msg.platformMessageId || payload.messageId;
    if (!platformMsgId) {
      return { tipo: "descarte", motivo: "recibo_sem_id", raw: payload };
    }

    let status: "entregue" | "lida" | "falhou" = "entregue";
    if (eventName === "message.read") status = "lida";
    if (eventName === "message.failed") status = "falhou";

    const err = payload.error || msg.error;
    const detalhe = err ? err.explanation || err.message || err.title : undefined;

    return {
      tipo: "recibo",
      accountId,
      threadId,
      platformMessageId: platformMsgId,
      status,
      detalhe,
      raw: payload,
    };
  }

  // 4. Mensagens (recebidas ou enviadas) (§8.7)
  if (eventName === "message.received" || eventName === "message.sent" || payload.message) {
    const msg = payload.message || {};
    const metadata = payload.metadata || msg.metadata || {};

    // 4.1. Descarte 1: Eco do que nós mesmos acabamos de enviar pela Cloud API (§8.7)
    if (eventName === "message.sent" && msg.source === "cloud_api") {
      return {
        tipo: "descarte",
        motivo: "eco_cloud_api_descartado",
        raw: payload,
      };
    }

    // 4.2. Descarte 2: Tipo não suportado pela Meta (§8.7, armadilha 16)
    if (metadata.unsupported) {
      return {
        tipo: "descarte",
        motivo: "mensagem_unsupported_meta",
        raw: payload,
      };
    }

    // 4.3. Rede
    const redeRaw = (msg.platform || account.platform || conversation.platform || "").toLowerCase();
    const rede: "whatsapp" | "instagram" = redeRaw === "instagram" ? "instagram" : "whatsapp";

    // 4.4. Direção e Remetente
    const saindo = msg.direction === "outgoing";
    const direcao = saindo ? "saida" : "entrada";
    const source = msg.source || (saindo ? "cloud_api" : "outro");

    let identificador = "";
    let nome = "";
    let username: string | undefined;
    let bsuid: string | undefined;

    if (saindo) {
      identificador = conversation.participantId || "";
      nome = conversation.participantName || "";
      username = conversation.participantUsername;
    } else {
      const sender = msg.sender || {};
      nome = sender.name || conversation.participantName || "";
      username = conversation.participantUsername || sender.username || sender.whatsappUsername;

      if (rede === "instagram") {
        identificador = sender.id || conversation.participantId || "";
      } else {
        const phone = sender.phoneNumber ? sender.phoneNumber.replace(/\D/g, "") : "";
        bsuid = sender.businessScopedUserId;
        identificador = phone || sender.id || conversation.participantId || "";
      }
    }

    if (!identificador) {
      return { tipo: "descarte", motivo: "sem_identificador_remetente", raw: payload };
    }

    // 4.5. Conteúdo textual
    let texto = msg.text || "";
    if (!texto) {
      const escolha =
        metadata.postbackTitle ||
        metadata.interactiveId ||
        metadata.buttonPayload ||
        metadata.quickReplyPayload ||
        metadata.postbackPayload ||
        metadata.callbackData;
      if (escolha) texto = String(escolha);
    }

    // 4.6. Anexo
    let anexo: any = undefined;
    const attachments = msg.attachments || [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      const att = attachments[0];
      const mediaUrl = att.refreshUrl || att.url;
      if (mediaUrl) {
        let tipoAnexo: "image" | "video" | "audio" | "document" | "sticker" = "document";
        if (att.type === "image") tipoAnexo = "image";
        else if (att.type === "video") tipoAnexo = "video";
        else if (att.type === "audio") tipoAnexo = "audio";
        else if (att.type === "sticker") tipoAnexo = "sticker";

        const prefixo = rede === "whatsapp" ? "auth:" : "open:";
        anexo = {
          tipo: tipoAnexo,
          url: mediaUrl,
          prefixo,
          mimeType: att.payload?.mime_type || att.payload?.mimeType,
          nomeArquivo: att.filename,
        };
      }
    }

    // Se não tem texto nem anexo -> descarta bolha vazia
    if (!texto && !anexo) {
      return { tipo: "descarte", motivo: "bolha_vazia_sem_conteudo", raw: payload };
    }

    // 4.7. Referral de Anúncio
    let anuncioReferral: any = undefined;
    const referral = metadata.referral || payload.referral;
    if (referral) {
      anuncioReferral = {
        adId: referral.ad_id || referral.source_id,
        titulo: referral.ads_context_data?.ad_title || referral.headline,
        corpo: referral.body,
        fonte: rede === "whatsapp" ? "WhatsApp Ads" : "Instagram Ads",
      };
    }

    // 4.8. Perfil Instagram
    let perfilInstagram: any = undefined;
    if (rede === "instagram" && !saindo && msg.sender?.instagramProfile) {
      const p = msg.sender.instagramProfile;
      perfilInstagram = {
        isFollower: p.isFollower,
        isFollowing: p.isFollowing,
        followerCount: p.followerCount,
      };
    }

    return {
      tipo: "mensagem",
      threadId,
      accountId,
      rede,
      platformMessageId: msg.platformMessageId || payload.messageId || `zernio_${Date.now()}`,
      direcao,
      origem: source,
      remetente: {
        identificador,
        nome,
        username,
        bsuid,
      },
      texto,
      anexo,
      citandoMessageId: metadata.quotedMessageId,
      anuncioReferral,
      perfilInstagram,
      raw: payload,
    };
  }

  return { tipo: "descarte", motivo: `evento_desconhecido_${eventName}`, raw: payload };
}
