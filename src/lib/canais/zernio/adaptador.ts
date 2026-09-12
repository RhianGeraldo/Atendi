/**
 * Adaptador de envio e operações da Zernio no Atendi.
 *
 * Base de referência: ZERNIO-IMPLEMENTACAO.md (§10 - Envio — regras do adaptador)
 */

import { ZernioClient, ZernioError, traduzirErroZernio } from "./client";
import type { CanalAberto, Destinatario } from "../tipos";

export interface EnvioZernioParams {
  canal: CanalAberto;
  destinatario: Destinatario;
  threadId?: string | null;
  texto?: string;
  mediaType?: "text" | "image" | "video" | "audio" | "document";
  mediaBuffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  quotedMessageId?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: string[];
}

export interface ResultadoEnvioZernio {
  messageId?: string;
  threadId: string;
  raw: any;
}

export async function enviarMensagemZernio(
  params: EnvioZernioParams
): Promise<ResultadoEnvioZernio> {
  const {
    canal,
    destinatario,
    threadId,
    texto,
    mediaType = "text",
    mediaBuffer,
    fileName,
    mimeType,
    quotedMessageId,
    templateName,
    templateLanguage,
    templateParams,
  } = params;

  if (!canal.zernioApiKey) {
    throw new Error("Chave da Zernio não configurada para a empresa deste canal.");
  }

  const accountId = canal.zernioAccountId;
  if (!accountId) {
    throw new Error(
      "Esta conexão Zernio não possui uma conta vinculada (accountId). Conecte a conta em Configurações > Canais."
    );
  }

  const client = new ZernioClient({
    apiKey: canal.zernioApiKey,
    baseUrl: canal.zernioBaseUrl,
  });

  try {
    // Caso 1: Envio com modelo (Template) para abrir nova conversa ou passar das 24h
    if (templateName && canal.rede === "whatsapp") {
      const res = await client.sendTemplateMessage({
        accountId,
        phone: destinatario.identificador,
        templateName,
        templateLanguage,
        templateParams,
      });

      return {
        messageId: res.messageId,
        threadId: res.conversationId,
        raw: res.raw,
      };
    }

    // Caso 2: Não temos a thread e tentamos enviar mensagem livre
    if (!threadId) {
      if (canal.rede === "instagram") {
        throw new Error(
          "O Instagram só permite responder a quem escreveu primeiro — esta conversa ainda não tem mensagem do cliente recebida."
        );
      }
      throw new Error(
        "Esta conversa ainda não foi iniciada no WhatsApp pela Zernio. Para iniciar um contato ativo, envie um modelo (template) aprovado pela Meta."
      );
    }

    // Caso 3: Envio de Mídia com buffer multipart (§6.2, §10)
    if (mediaBuffer && mediaType !== "text") {
      const isAudioWhatsapp = canal.rede === "whatsapp" && mediaType === "audio";
      const finalFileName = fileName || `arquivo_${Date.now()}.${mimeType?.split("/")[1] || "bin"}`;

      const res = await client.sendMediaMessage({
        threadId,
        accountId,
        fileBuffer: mediaBuffer,
        fileName: finalFileName,
        mimeType: mimeType || "application/octet-stream",
        caption: texto,
        voiceNote: isAudioWhatsapp, // Transcodifica para PTT nativo com ondas
        replyTo: quotedMessageId,
      });

      return {
        messageId: res.messageId,
        threadId,
        raw: res.raw,
      };
    }

    // Caso 4: Envio de Texto simples
    const res = await client.sendTextMessage({
      threadId,
      accountId,
      message: texto || "",
      replyTo: quotedMessageId,
    });

    return {
      messageId: res.messageId,
      threadId,
      raw: res.raw,
    };
  } catch (err: any) {
    if (err instanceof ZernioError) {
      const traduzido = traduzirErroZernio(err);
      console.error(`[zernio:envio] Erro na Zernio (${err.status}): ${err.message} -> ${traduzido}`);
      throw new Error(traduzido);
    }
    throw err;
  }
}
