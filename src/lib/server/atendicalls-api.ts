import dns from "node:dns";
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
  companyId?: string | null
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
    throw new Error(`Falha ao criar instância no AtendiCalls (${res.status}): ${errText || res.statusText}`);
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
    throw new Error(`Erro ao conectar com AtendiCalls (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const isConnected = data.status === "connected" || data.instance?.paired === true || data.instance?.state === "open";
  const qrcodeBase64 = data.qrcode?.base64 || (typeof data.qrcode === "string" ? data.qrcode : null);

  return {
    status: isConnected ? ("connected" as const) : qrcodeBase64 ? ("qrcode_ready" as const) : ("disconnected" as const),
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
}): Promise<{ callId: string; raw: any }> {
  const { to, webhookUrl, agent, config } = params;
  const cleanPhone = to.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

  const defaultAgent: AtendiCallsAgentConfig = {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    voice: "alloy",
    systemPrompt:
      "Você é uma consultora de atendimento da clínica Estética e Laser. Seja educada, acolhedora, objetiva e esclareça as dúvidas sobre nossos procedimentos e agendamentos.",
    firstMessage: "Olá! Tudo bem? Estou ligando para dar continuidade ao seu atendimento na Estética e Laser.",
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
    throw new Error(`Falha ao iniciar ligação via AtendiCalls (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const callId = data.callId || data.id || data.call_id;

  if (!callId) {
    console.warn(`[AtendiCalls] Resposta sem callId explícito:`, data);
  }

  return { callId, raw: data };
}

/**
 * Desliga uma chamada em andamento
 */
export async function hangupAtendiCallsVoiceCall(callId: string, config: AtendiCallsConfig): Promise<boolean> {
  const url = `${config.apiUrl}/api/v1/voice/calls/${callId}/hangup`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": config.token,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[AtendiCalls] Erro ao desligar chamada ${callId} (${res.status}):`, errText);
    return false;
  }

  return true;
}

/**
 * Consulta detalhes e status em tempo real de uma chamada no motor AtendiCalls
 */
export async function getAtendiCallsCallDetails(
  callId: string,
  config: AtendiCallsConfig
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
  const isEnded = !isConnected && (status === "ended" || status === "terminated" || status === "failed");

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
export async function fetchAtendiCallsAudioStream(callId: string, config: AtendiCallsConfig): Promise<Response> {
  const url = `${config.apiUrl}/api/calls/${callId}/audio`;
  return await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": config.token,
    },
  });
}
