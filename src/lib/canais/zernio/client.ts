/**
 * Cliente HTTP da Zernio — WhatsApp & Instagram.
 *
 * Base de referência: ZERNIO-IMPLEMENTACAO.md (§3, §6, §11)
 *
 * Características críticas:
 *  - Header `Authorization: Bearer <apiKey>`
 *  - Base URL configurável por empresa (default: https://zernio.com/api) sem barra final
 *  - Timeout de 30 s para suportar upload de anexos
 *  - Erro tipado guardando status, code e required_group
 *  - NUNCA fixar Content-Type manualmente em FormData (deixar o boundary automático)
 */

export class ZernioError extends Error {
  status: number;
  code?: string;
  requiredGroup?: string;
  raw?: any;

  constructor(message: string, status: number, code?: string, requiredGroup?: string, raw?: any) {
    super(message);
    this.name = "ZernioError";
    this.status = status;
    this.code = code;
    this.requiredGroup = requiredGroup;
    this.raw = raw;
  }
}

/** Tradução amigável dos erros da Zernio para a equipe de atendimento/suporte (§3.3). */
export function traduzirErroZernio(err: ZernioError): string {
  if (err.status === 401) {
    return "A chave de API da Zernio é inválida ou foi revogada.";
  }

  if (err.status === 403) {
    if (err.code === "insufficient_permissions" && err.requiredGroup) {
      return `A chave da Zernio não tem a permissão '${err.requiredGroup}'. Crie uma chave com esse grupo habilitado no painel da Zernio.`;
    }
    if (err.code === "insufficient_permissions") {
      return `A Zernio recusou esta operação para esta chave: ${err.message}`;
    }
    if (err.message && !err.message.toLowerCase().includes("forbidden")) {
      return `A Zernio recusou: ${err.message}`;
    }
    return "A Zernio recusou o acesso ao Inbox. Verifique se o add-on Inbox está ativo no plano da sua conta Zernio.";
  }

  if (err.code === "PLATFORM_LIMITATION") {
    return `Esta rede não suporta esta ação: ${err.message}`;
  }

  if (err.code === "MISSING_PARTICIPANT") {
    return "A Zernio não identificou o participante para envio nesta conversa.";
  }

  if (err.code === "TEMPLATE_REQUIRED") {
    return "Passaram mais de 24 horas desde a última mensagem do cliente. Só é possível enviar mensagem com um modelo (template) aprovado pela Meta.";
  }

  return err.message || "Erro desconhecido ao comunicar com a Zernio.";
}

export interface ZernioClientConfig {
  apiKey: string;
  baseUrl?: string | null;
}

export interface ZernioAccount {
  id: string;
  platform: "whatsapp" | "instagram" | string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  isActive: boolean;
  needsReconnection: boolean;
  metadata?: {
    displayPhoneNumber?: string;
    qualityRating?: string;
    messagingLimitTier?: string;
  };
}

export interface ZernioButton {
  type: "url";
  title: string;
  url: string;
}

export class ZernioClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ZernioClientConfig) {
    if (!config.apiKey) {
      throw new Error("Chave de API da Zernio não fornecida.");
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl?.trim() || "https://zernio.com/api").replace(/\/+$/, "");
  }

  /**
   * Chamada HTTP de baixo nível com timeout de 30s e tratamento de erros tipados.
   */
  async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      query?: Record<string, string | number | boolean | undefined | null>;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const { method = "GET", body, query, timeoutMs = 30000 } = options;

    let fullUrl = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    if (query) {
      const parsedUrl = new URL(fullUrl);
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          parsedUrl.searchParams.set(k, String(v));
        }
      }
      fullUrl = parsedUrl.toString();
    }

    const isMultipart = typeof FormData !== "undefined" && body instanceof FormData;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (!isMultipart && body) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: isMultipart ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      let resData: any = null;

      if (contentType.includes("application/json")) {
        resData = await response.json();
      } else {
        const text = await response.text();
        try {
          resData = JSON.parse(text);
        } catch {
          resData = text;
        }
      }

      if (!response.ok) {
        const errorMsg =
          resData?.message ||
          resData?.error ||
          (typeof resData === "string" ? resData : response.statusText);
        const code = resData?.code || resData?.error_code;
        const requiredGroup = resData?.required_group || resData?.requiredGroup;

        throw new ZernioError(errorMsg, response.status, code, requiredGroup, resData);
      }

      return resData as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new ZernioError("Tempo limite excedido na requisição à Zernio (30s).", 408);
      }
      if (err instanceof ZernioError) {
        throw err;
      }
      throw new ZernioError(err.message || "Erro de conexão com a Zernio", 500);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Valida se a chave de API é autêntica (§6.1).
   */
  async verifyAuth(): Promise<{ valid: boolean }> {
    try {
      const res = await this.request("/v1/auth/verify");
      return { valid: res?.valid === true || res?.success === true };
    } catch (err: any) {
      return { valid: false };
    }
  }

  /**
   * Lista as contas sociais conectadas na Zernio (§6.1).
   * Filtra por whatsapp ou instagram.
   */
  async listAccounts(platform?: "whatsapp" | "instagram"): Promise<ZernioAccount[]> {
    const query = platform ? { platform } : undefined;
    const res = await this.request<{ accounts?: any[] }>("/v1/accounts", { query });
    const rawAccounts = res?.accounts || (Array.isArray(res) ? res : []);

    return rawAccounts
      .map((acc: any) => {
        const id = acc._id || acc.id;
        if (!id) return null;
        return {
          id: String(id),
          platform: acc.platform,
          username: acc.username,
          displayName: acc.displayName || acc.name,
          profilePicture: acc.profilePicture || acc.avatarUrl,
          isActive: acc.isActive !== false,
          needsReconnection: acc.needsReconnection === true,
          metadata: acc.metadata,
        } as ZernioAccount;
      })
      .filter((acc: ZernioAccount | null): acc is ZernioAccount => {
        if (!acc) return false;
        if (platform) return acc.platform === platform;
        return acc.platform === "whatsapp" || acc.platform === "instagram";
      });
  }

  /**
   * Obtém detalhes de uma conversa (incluindo participantPicture) (§6.8).
   */
  async getConversation(threadId: string, accountId: string): Promise<any> {
    try {
      const res = await this.request(
        `/v1/inbox/conversations/${encodeURIComponent(threadId)}`,
        {
          query: { accountId },
        }
      );
      return res?.data || res?.conversation || res || null;
    } catch (err) {
      console.warn(`[zernio] Falha ao consultar conversa ${threadId}:`, err);
      return null;
    }
  }

  /**
   * Lista conversas da caixa de entrada (§6.8).
   */
  async listConversations(params?: {
    accountId?: string;
    limit?: number;
    page?: number;
    platform?: "whatsapp" | "instagram";
  }): Promise<any[]> {
    try {
      const query: Record<string, any> = {};
      if (params?.accountId) query.accountId = params.accountId;
      if (params?.limit) query.limit = params.limit;
      if (params?.page) query.page = params.page;
      if (params?.platform) query.platform = params.platform;

      const res = await this.request<{ conversations?: any[]; data?: any[] }>(
        "/v1/inbox/conversations",
        { query }
      );
      return res?.conversations || res?.data || (Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn("[zernio] Falha ao listar conversas:", err);
      return [];
    }
  }

  /**
   * Envia mensagem de texto para a thread (§6.2).
   */
  async sendTextMessage(params: {
    threadId: string;
    accountId: string;
    message: string;
    replyTo?: string | null;
    buttons?: ZernioButton[];
  }): Promise<{ messageId?: string; raw: any }> {
    const { threadId, accountId, message, replyTo, buttons } = params;

    // Sanitizar botões: no máximo 3, tipo url, title <= 20 chars (§6.2)
    const validButtons = buttons
      ? buttons
          .filter((b) => b && b.type === "url" && b.title?.trim() && b.url?.trim())
          .slice(0, 3)
          .map((b) => ({
            type: "url" as const,
            title: b.title.trim().slice(0, 20),
            url: b.url.trim(),
          }))
      : undefined;

    const payload: Record<string, any> = {
      accountId,
      message,
    };

    if (replyTo) {
      payload.replyTo = replyTo;
    }

    if (validButtons && validButtons.length > 0) {
      payload.buttons = validButtons;
    }

    const res = await this.request(
      `/v1/inbox/conversations/${encodeURIComponent(threadId)}/messages`,
      {
        method: "POST",
        body: payload,
      }
    );

    const messageId = res?.data?.messageId || res?.messageId || res?.id || null;
    return { messageId, raw: res };
  }

  /**
   * Envia mensagem com mídia via multipart FormData (§6.2).
   * Para áudio no WhatsApp, passa voiceNote="true" para a Zernio transcodificar para onda PTT.
   */
  async sendMediaMessage(params: {
    threadId: string;
    accountId: string;
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    caption?: string | null;
    voiceNote?: boolean;
    replyTo?: string | null;
  }): Promise<{ messageId?: string; raw: any }> {
    const { threadId, accountId, fileBuffer, fileName, mimeType, caption, voiceNote, replyTo } =
      params;

    const formData = new FormData();
    formData.append("accountId", accountId);

    if (caption) {
      formData.append("message", caption);
    }

    if (replyTo) {
      formData.append("replyTo", replyTo);
    }

    if (voiceNote) {
      formData.append("voiceNote", "true");
    }

    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("attachment", blob, fileName);

    const res = await this.request(
      `/v1/inbox/conversations/${encodeURIComponent(threadId)}/messages`,
      {
        method: "POST",
        body: formData,
      }
    );

    const messageId = res?.data?.messageId || res?.messageId || res?.id || null;
    return { messageId, raw: res };
  }

  /**
   * Abre nova conversa ou envia modelo de WhatsApp (§6.2, §10.1).
   * Essencial para WhatsApp após 24h ou para contatos novos sem threadId.
   */
  async sendTemplateMessage(params: {
    accountId: string;
    phone: string;
    templateName: string;
    templateLanguage?: string;
    templateParams?: string[];
  }): Promise<{ messageId?: string; conversationId: string; raw: any }> {
    const { accountId, phone, templateName, templateLanguage = "pt_BR", templateParams = [] } =
      params;

    const cleanPhone = phone.replace(/\D/g, "");

    const res = await this.request("/v1/inbox/conversations", {
      method: "POST",
      body: {
        accountId,
        participantId: cleanPhone,
        templateName,
        templateLanguage,
        templateParams,
      },
    });

    const conversationId = res?.conversationId || res?.data?.conversationId || res?.id;
    const messageId = res?.messageId || res?.data?.messageId;

    if (!conversationId) {
      throw new Error("A Zernio não retornou o conversationId após envio do template.");
    }

    return { messageId, conversationId, raw: res };
  }

  /**
   * Envia ou remove reação de emoji em mensagem (§6.3).
   */
  async sendReaction(params: {
    threadId: string;
    messageId: string;
    accountId: string;
    emoji?: string | null;
  }): Promise<any> {
    const { threadId, messageId, accountId, emoji } = params;

    // Se emoji vazio ou nulo, é DELETE com accountId na query
    if (!emoji || !emoji.trim()) {
      return await this.request(
        `/v1/inbox/conversations/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/reactions`,
        {
          method: "DELETE",
          query: { accountId },
        }
      );
    }

    // Se tem emoji, é POST com accountId e emoji no corpo
    return await this.request(
      `/v1/inbox/conversations/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        body: { accountId, emoji: emoji.trim() },
      }
    );
  }

  /**
   * Lista modelos (templates) de WhatsApp (§6.7).
   */
  async listTemplates(accountId: string): Promise<any[]> {
    const res = await this.request("/v1/whatsapp/templates", {
      query: { accountId },
    });
    return res?.templates || res?.data || [];
  }

  /**
   * Registro idempotente do webhook na Zernio (§6.9, §9).
   */
  async registerWebhook(params: {
    webhookUrl: string;
    secret: string;
    events?: string[];
  }): Promise<{ registered: boolean; webhookId?: string }> {
    const { webhookUrl, secret, events } = params;

    const defaultEvents = [
      "message.received",
      "message.sent",
      "message.delivered",
      "message.read",
      "message.failed",
      "message.edited",
      "message.deleted",
      "reaction.received",
      "comment.received",
      "conversation.started",
      "referral.received",
      "account.connected",
      "account.disconnected",
      "whatsapp.template.status_updated",
    ];

    const currentWebhooks = await this.request<any[]>("/v1/webhooks/settings").catch(() => []);
    const list = Array.isArray(currentWebhooks)
      ? currentWebhooks
      : (currentWebhooks as any)?.data || [];

    // Reconhecer os nossos pela rota "/api/webhooks/zernio" (§9)
    const urlObj = new URL(webhookUrl);
    const basePath = urlObj.pathname;

    const existing = list.find((w: any) => w.url && w.url.includes(basePath));

    const payload: Record<string, any> = {
      name: "AtendiAI Omnichannel Webhook",
      url: webhookUrl,
      secret,
      events: events || defaultEvents,
      isActive: true,
    };

    let resultId: string | undefined;

    if (existing && (existing._id || existing.id)) {
      const id = existing._id || existing.id;
      // Atualizar é PUT com _id no corpo (§6.9, §9)
      const res = await this.request("/v1/webhooks/settings", {
        method: "PUT",
        body: { ...payload, _id: id },
      });
      resultId = res?._id || res?.id || id;
    } else {
      // Criar novo
      const res = await this.request("/v1/webhooks/settings", {
        method: "POST",
        body: payload,
      });
      resultId = res?._id || res?.id;
    }

    // Limpeza de sobras em melhor esforço (§9)
    const excess = list.filter(
      (w: any) => w.url && w.url.includes(basePath) && (w._id || w.id) !== resultId
    );
    for (const item of excess) {
      const id = item._id || item.id;
      if (id) {
        this.request("/v1/webhooks/settings", {
          method: "DELETE",
          query: { id },
        }).catch(() => {});
      }
    }

    return { registered: true, webhookId: resultId };
  }
}

/**
 * Função utilitária para baixar mídia (§11):
 * - WhatsApp: exige Bearer e accountId na query.
 * - Instagram: link público da CDN da Meta, recusa Bearer.
 */
export async function downloadZernioMedia(params: {
  mediaUrl: string;
  isWhatsApp: boolean;
  apiKey?: string | null;
  accountId?: string | null;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const { mediaUrl, isWhatsApp, apiKey, accountId } = params;

  try {
    let targetUrl = mediaUrl;
    const headers: Record<string, string> = {};

    if (isWhatsApp) {
      if (!apiKey) return null;
      headers["Authorization"] = `Bearer ${apiKey}`;

      if (accountId) {
        const parsed = new URL(targetUrl);
        if (!parsed.searchParams.has("accountId")) {
          parsed.searchParams.set("accountId", accountId);
          targetUrl = parsed.toString();
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[zernio] Falha ao baixar mídia (${res.status}): ${targetUrl}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;

    const mimeType = res.headers.get("content-type") || "application/octet-stream";
    const disposition = res.headers.get("content-disposition") || "";
    let fileName = `zernio_${Date.now()}`;
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
    if (filenameMatch) {
      fileName = filenameMatch[1];
    } else {
      const ext = mimeType.split("/")[1] || "bin";
      fileName = `${fileName}.${ext}`;
    }

    return { buffer, mimeType, fileName };
  } catch (err: any) {
    console.error("[zernio] Erro ao baixar mídia:", err);
    return null;
  }
}
