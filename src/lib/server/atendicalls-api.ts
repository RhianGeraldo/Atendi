import * as dns from "node:dns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export interface AtendiCallsAgentConfig {
  provider?: string; // "openrouter" | "gemini_live" | "openai"
  model?: string; // "google/gemini-2.0-flash-001" | "gemini-2.5-flash-native-audio-latest"
  voice?: string; // "alloy" | "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck"
  systemPrompt?: string;
  firstMessage?: string;
  variables?: Record<string, any>;
}

export interface AtendiCallsConfig {
  apiUrl: string;
  token: string;
}

const DEFAULT_API_URL = process.env.ATENDICALLS_URL || "https://calls.esteticaelaser.com.br";
const DEFAULT_FALLBACK_TOKEN = process.env.ATENDICALLS_TOKEN || "264ddb564614e930aadca44121650f03";

/**
 * Resolve as credenciais do AtendiCalls:
 * 1. Da instância específica (atendicalls_token ou wavoip_token legado)
 * 2. Da empresa (atendicalls_token)
 * 3. Das variáveis de ambiente / fallback global
 */
export async function resolveAtendiCallsConfig(
  instanceId?: string | null,
  companyId?: string | null,
): Promise<AtendiCallsConfig> {
  let apiUrl = DEFAULT_API_URL;
  let token = "";

  if (instanceId) {
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("atendicalls_token, atendicalls_url, wavoip_token, company_id")
      .eq("id", instanceId)
      .maybeSingle();

    if (inst) {
      if (inst.atendicalls_token) token = inst.atendicalls_token;
      else if (inst.wavoip_token) token = inst.wavoip_token;

      if (inst.atendicalls_url) apiUrl = inst.atendicalls_url;
      if (!companyId && inst.company_id) companyId = inst.company_id;
    }
  }

  if (!token && companyId) {
    const { data: comp } = await supabaseAdmin
      .from("companies")
      .select("atendicalls_token, atendicalls_url")
      .eq("id", companyId)
      .maybeSingle();

    if (comp) {
      if (comp.atendicalls_token) token = comp.atendicalls_token;
      if (comp.atendicalls_url) apiUrl = comp.atendicalls_url;
    }
  }

  if (!token && !instanceId) {
    token = DEFAULT_FALLBACK_TOKEN;
  }

  // Remove barra final se houver
  apiUrl = apiUrl.replace(/\/+$/, "");

  return { apiUrl, token };
}

/**
 * Cria uma nova instância de WhatsApp no motor AtendiCalls (VPS)
 * Retorna o token gerado e o QR Code em base64 PNG para pareamento imediato
 */
export async function createAtendiCallsInstance(params: {
  name: string;
  token?: string;
  apiUrl?: string;
  masterKey?: string;
}): Promise<{
  status: string;
  instance: {
    id: string;
    name: string;
    token: string;
    state?: string;
    paired?: boolean;
  };
  token: string;
  qrcode: {
    code?: string;
    base64?: string;
  } | null;
}> {
  const cleanUrl = (params.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const masterKey = params.masterKey || DEFAULT_FALLBACK_TOKEN;

  const res = await fetch(`${cleanUrl}/api/v1/instance/create`, {
    method: "POST",
    headers: {
      "X-API-Key": masterKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      ...(params.token ? { token: params.token } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Falha ao criar instância no AtendiCalls (${res.status}): ${errText || res.statusText}`,
    );
  }

  const data = await res.json();
  const qrcode = data.qrcode || null;
  const instance = data.instance || null;
  const token = instance?.token || params.token || "";

  return {
    status: data.status || "created",
    instance,
    token,
    qrcode,
  };
}

/**
 * Consulta o status da linha e busca o QR Code se estiver desconectada
 */
export async function getAtendiCallsConnectStatus(config: AtendiCallsConfig): Promise<{
  status: "connected" | "scan_qr_code" | "disconnected";
  isConnected: boolean;
  qrcode: string | null;
  instance: any;
}> {
  if (!config.token || !config.token.trim()) {
    return {
      status: "disconnected",
      isConnected: false,
      qrcode: null,
      instance: null,
    };
  }

  const url = `${config.apiUrl}/api/v1/instance/connect`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": config.token,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Erro ao conectar com AtendiCalls (${res.status}): ${errText || res.statusText}`,
    );
  }

  const data = await res.json();
  const isConnected =
    data.status === "connected" ||
    data.instance?.paired === true ||
    data.instance?.state === "open";
  const qrcodeBase64 =
    data.qrcode?.base64 || (typeof data.qrcode === "string" ? data.qrcode : null);

  return {
    status: isConnected
      ? ("connected" as const)
      : qrcodeBase64
        ? ("scan_qr_code" as const)
        : ("disconnected" as const),
    isConnected,
    qrcode: qrcodeBase64,
    instance: data.instance || null,
    message: data.message || null,
    raw: data,
  };
}

/**
 * Inicia uma ligação telefônica via WhatsApp com IA de voz
 */
export async function startAtendiCallsVoiceCall(params: {
  to: string;
  webhookUrl?: string;
  agent?: AtendiCallsAgentConfig;
  config: AtendiCallsConfig;
}): Promise<{ callId: string; sessionId?: string; raw: any }> {
  const { to, webhookUrl, agent, config } = params;
  const cleanPhone = to.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  const defaultAgent: AtendiCallsAgentConfig = {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    voice: "alloy",
    systemPrompt:
      "Você é uma consultora de atendimento da clínica Estética e Laser. Seja educada, acolhedora, objetiva e esclareça as dúvidas sobre nossos procedimentos e agendamentos.",
    firstMessage:
      "Olá! Tudo bem? Estou ligando para dar continuidade ao seu atendimento na Estética e Laser.",
    variables: {},
  };

  const finalAgent = {
    ...defaultAgent,
    ...(agent || {}),
    variables: {
      ...(defaultAgent.variables || {}),
      ...(agent?.variables || {}),
    },
  };

  const payload: any = {
    to: formattedPhone,
    agent: finalAgent,
  };

  if (webhookUrl) {
    payload.webhookUrl = webhookUrl;
  }

  const url = `${config.apiUrl}/api/v1/voice/calls`;
  console.log(`[AtendiCalls] Disparando chamada para ${formattedPhone} via ${url}...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": config.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[AtendiCalls] Erro ao disparar chamada (${res.status}):`, errText);
    throw new Error(
      `Falha ao iniciar ligação via AtendiCalls (${res.status}): ${errText || res.statusText}`,
    );
  }

  const data = await res.json();
  const callId = data.callId || data.id || data.call_id;

  if (!callId) {
    console.warn(`[AtendiCalls] Resposta sem callId explícito:`, data);
  }

  const sessionId = data.sessionId || data.session_id || data.call?.sessionId;
  return { callId, sessionId, raw: data };
}

/**
 * Sincroniza as chaves de inteligência artificial da empresa com o motor AtendiCalls (VPS)
 */
export async function syncCompanyKeysToAtendiCalls(
  companyId: string,
  config: AtendiCallsConfig,
): Promise<void> {
  if (!companyId) return;
  try {
    const { data: comp } = await supabaseAdmin
      .from("companies")
      .select("ai_settings")
      .eq("id", companyId)
      .maybeSingle();

    const keys = (comp?.ai_settings as any)?.keys || {};
    if (!keys.openrouter && !keys.openai && !keys.groq) return;

    const url = `${config.apiUrl}/api/settings`;
    await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": config.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openrouterApiKey: keys.openrouter || "",
        openaiApiKey: keys.openai || "",
        groqApiKey: keys.groq || "",
        defaultProvider: "openrouter",
        defaultModel: "google/gemini-2.0-flash-001",
        defaultVoice: "alloy",
      }),
    });
  } catch (err: any) {
    console.warn(
      "[AtendiCalls] Falha ao sincronizar chaves de IA com AtendiCalls:",
      err?.message || err,
    );
  }
}

/**
 * Inicia chamada de voz com atendente humano (Softphone WebRTC)
 */
export async function startAtendiCallsHumanCall(params: {
  phone: string;
  config: AtendiCallsConfig;
  sessionId?: string;
}): Promise<{ callId: string; sessionId?: string; raw: any }> {
  const cleanPhone = params.phone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  let sid = params.sessionId;
  if (!sid) {
    const conn = await getAtendiCallsConnectStatus(params.config).catch(() => null);
    sid = conn?.instance?.id || conn?.instance?.sessionId;
  }

  const endpoint = sid
    ? `${params.config.apiUrl}/api/sessions/${encodeURIComponent(sid)}/calls`
    : `${params.config.apiUrl}/api/v1/voice/calls`;

  const payload = sid
    ? { phone: formattedPhone, duration_ms: 300000, record: true }
    : { to: formattedPhone };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.config.token}`,
      "X-API-Key": params.config.token,
      "X-Client-Id": "atendi",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Falha ao iniciar ligação humana via AtendiCalls (${res.status}): ${errText || res.statusText}`,
    );
  }

  const data = await res.json();
  const callId = data.call?.callId || data.callId || data.id || data.call_id;
  const returnedSid = data.sessionId || data.session_id || sid;

  return { callId, sessionId: returnedSid, raw: data };
}

/**
 * Negocia SDP Offer com AtendiCalls e retorna SDP Answer para estabelecer o canal de áudio WebRTC
 */
export async function sendAtendiCallsWebRTCOffer(params: {
  callId: string;
  sessionId?: string;
  sdpOffer: string;
  config: AtendiCallsConfig;
}): Promise<{ sdpAnswer: string }> {
  let sid = params.sessionId;
  if (!sid) {
    const conn = await getAtendiCallsConnectStatus(params.config).catch(() => null);
    sid = conn?.instance?.id || conn?.instance?.sessionId;
  }

  if (!sid) {
    throw new Error("Sessão da linha não identificada para conexão WebRTC.");
  }

  const url = `${params.config.apiUrl}/api/sessions/${encodeURIComponent(sid)}/calls/${encodeURIComponent(params.callId)}/webrtc`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.config.token}`,
      "X-API-Key": params.config.token,
      "X-Client-Id": "atendi",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sdp_offer: params.sdpOffer }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Falha na negociação WebRTC com AtendiCalls (${res.status}): ${errText || res.statusText}`,
    );
  }

  const data = await res.json();
  const sdpAnswer = data.sdp_answer || data.sdpAnswer || data.sdp;
  if (!sdpAnswer) {
    throw new Error("AtendiCalls não retornou resposta SDP (sdp_answer).");
  }

  return { sdpAnswer };
}

/**
 * Desliga uma chamada em andamento
 */
export async function hangupAtendiCallsVoiceCall(
  callId: string,
  config: AtendiCallsConfig,
  sessionId?: string,
): Promise<boolean> {
  let sid = sessionId;
  if (!sid) {
    const conn = await getAtendiCallsConnectStatus(config).catch(() => null);
    sid = conn?.instance?.id || conn?.instance?.sessionId;
  }

  const headers = {
    Authorization: `Bearer ${config.token}`,
    "X-API-Key": config.token,
    "X-Client-Id": "atendi",
    "Content-Type": "application/json",
  };

  // 1. Tenta DELETE /api/sessions/:sid/calls/:id (padrão nativo do AtendiCalls)
  if (sid) {
    try {
      const delRes = await fetch(
        `${config.apiUrl}/api/sessions/${encodeURIComponent(sid)}/calls/${encodeURIComponent(callId)}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (delRes.ok) return true;
    } catch {}

    // 2. Tenta POST /api/sessions/:sid/calls/:id/reject
    try {
      const rejRes = await fetch(
        `${config.apiUrl}/api/sessions/${encodeURIComponent(sid)}/calls/${encodeURIComponent(callId)}/reject`,
        {
          method: "POST",
          headers,
          body: "{}",
        },
      );
      if (rejRes.ok) return true;
    } catch {}
  }

  // 3. Fallback POST /api/v1/voice/calls/:id/hangup
  const url = `${config.apiUrl}/api/v1/voice/calls/${encodeURIComponent(callId)}/hangup`;
  const res = await fetch(url, {
    method: "POST",
    headers,
  });

  return res.ok;
}

/**
 * Atende uma chamada recebida (operador clica em Aceitar)
 */
export async function acceptAtendiCallsVoiceCall(
  callId: string,
  config: AtendiCallsConfig,
  sessionId?: string,
): Promise<boolean> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "X-API-Key": config.token,
    "X-Client-Id": "atendi",
    "Content-Type": "application/json",
  };

  let sid = sessionId;
  if (!sid) {
    const conn = await getAtendiCallsConnectStatus(config).catch(() => null);
    sid = conn?.instance?.id || conn?.instance?.sessionId;
  }

  if (sid) {
    try {
      const res = await fetch(
        `${config.apiUrl}/api/sessions/${encodeURIComponent(sid)}/calls/${encodeURIComponent(callId)}/accept`,
        {
          method: "POST",
          headers,
          body: "{}",
        },
      );
      if (res.ok) return true;
    } catch {}
  }

  try {
    const res = await fetch(
      `${config.apiUrl}/api/v1/voice/calls/${encodeURIComponent(callId)}/accept`,
      {
        method: "POST",
        headers,
        body: "{}",
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Rejeita uma chamada recebida (operador clica em Recusar)
 */
export async function rejectAtendiCallsVoiceCall(
  callId: string,
  config: AtendiCallsConfig,
  sessionId?: string,
): Promise<boolean> {
  return hangupAtendiCallsVoiceCall(callId, config, sessionId);
}

/**
 * Consulta detalhes e status em tempo real de uma chamada no motor AtendiCalls
 */
export async function getAtendiCallsCallDetails(
  callId: string,
  config: AtendiCallsConfig,
): Promise<{
  call?: {
    CallID: string;
    Status: string; // "connected" | "active" | "ringing" | "ended" | "initiating"
    Peer: string;
    Direction: string;
    StartedAt?: number;
    ConnectedAt?: number;
  };
  mode?: string;
  transcript?: Array<{ role: string; text: string }>;
  isEnded?: boolean;
}> {
  const cleanUrl = config.apiUrl.replace(/\/+$/, "");
  const res = await fetch(`${cleanUrl}/api/v1/voice/calls/${encodeURIComponent(callId)}`, {
    method: "GET",
    headers: {
      "X-API-Key": config.token,
    },
  });

  if (res.status === 404) {
    return { isEnded: true };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Falha ao consultar chamada no AtendiCalls (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawCall = data.call || {};
  const status = (rawCall.status || rawCall.Status || "").toLowerCase();
  const isConnected = status === "connected" || status === "active" || status === "in_progress";
  const isEnded =
    !isConnected && (status === "ended" || status === "terminated" || status === "failed");

  const normalizedCall = {
    ...rawCall,
    callId: rawCall.callId || rawCall.CallID || callId,
    status,
    Status: status,
    peer: rawCall.peer || rawCall.Peer,
    direction: rawCall.direction || rawCall.Direction,
    startedAt: rawCall.startedAt || rawCall.StartedAt,
    connectedAt: rawCall.connectedAt || rawCall.ConnectedAt,
  };

  return { ...data, call: normalizedCall, isEnded };
}

/**
 * Busca o áudio da gravação de uma chamada
 */
export async function fetchAtendiCallsAudioStream(
  callId: string,
  config: AtendiCallsConfig,
): Promise<Response> {
  const url = `${config.apiUrl}/api/calls/${callId}/audio`;
  return await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": config.token,
    },
  });
}
