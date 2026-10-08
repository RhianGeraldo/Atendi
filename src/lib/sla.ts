import { differenceInMinutes } from "date-fns";
import type { ConvRow } from "@/components/chat/conversation-types";

export interface SlaSettings {
  enabled: boolean;
  first_response_limit_minutes: number;
  response_limit_minutes: number;
  resolution_limit_hours: number;
  warning_threshold_percent: number; // ex: 75 para 75%
  count_business_hours_only: boolean;
  auto_rotate_active_breached?: boolean;
  auto_rotate_active_timeout_minutes?: number;
}

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  enabled: true,
  first_response_limit_minutes: 5,
  response_limit_minutes: 5,
  resolution_limit_hours: 4,
  warning_threshold_percent: 60, // 3 min = 60% de 5 min (0-2m verde, 3-5m atenção)
  count_business_hours_only: false,
  auto_rotate_active_breached: false,
  auto_rotate_active_timeout_minutes: 8,
};

export type SlaStatus = "ok" | "warning" | "breached" | "none";

export interface ConversationSlaInfo {
  isWaiting: boolean;
  isFirstResponse: boolean;
  waitingSince: Date | null;
  elapsedMinutes: number;
  limitMinutes: number;
  status: SlaStatus;
  percentage: number;
  remainingMinutes: number;
  overdueMinutes: number;
  badgeLabel: string;
  tooltipText: string;
}

/**
 * Formata minutos em string amigável (ex: "5m", "1h 15m", "2d")
 */
export function formatMinutesFriendly(minutes: number): string {
  if (minutes < 0) minutes = 0;
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Calcula o status de SLA para uma conversa de forma contínua:
 * 0 a 2 min: Verde (ok / no prazo)
 * 3 a 5 min: Atenção (warning / âmbar)
 * > 5 min: Vermelho (breached / estourado)
 * Badge contínuo: 0m, 1m, 2m, 3m, 4m, 5m, 6m, 7m... (nunca reinicia por nova mensagem do cliente)
 */
export function calculateConversationSla(
  conv: ConvRow,
  settings: SlaSettings = DEFAULT_SLA_SETTINGS,
  overrideLastMessage?: { sender_type: string; created_at: string; is_internal?: boolean; waiting_since?: string } | null,
  overrideWaitingSince?: string | null,
): ConversationSlaInfo {
  // Ignora se SLA desabilitado, se resolvido ou se for grupo do WhatsApp
  const isGroup = !!(
    conv.contact?.phone &&
    (conv.contact.phone.startsWith("120363") ||
      (conv.contact.phone.includes("-") && conv.contact.phone.length > 18))
  );

  if (!settings.enabled || conv.status === "resolved" || isGroup) {
    return {
      isWaiting: false,
      isFirstResponse: false,
      waitingSince: null,
      elapsedMinutes: 0,
      limitMinutes: 0,
      status: "none",
      percentage: 0,
      remainingMinutes: 0,
      overdueMinutes: 0,
      badgeLabel: "",
      tooltipText: "",
    };
  }

  // Identifica a última mensagem externa (não interna)
  const lastMsg =
    overrideLastMessage !== undefined && overrideLastMessage !== null
      ? overrideLastMessage
      : conv.last_message?.find((m) => !m.is_internal) || conv.last_message?.[0];

  // Se a última mensagem externa foi enviada por um atendente/agente (humano ou IA):
  // O cliente foi respondido e NÃO está aguardando resposta!
  if (lastMsg && lastMsg.sender_type === "agent") {
    return {
      isWaiting: false,
      isFirstResponse: false,
      waitingSince: null,
      elapsedMinutes: 0,
      limitMinutes: 0,
      status: "none",
      percentage: 0,
      remainingMinutes: 0,
      overdueMinutes: 0,
      badgeLabel: "",
      tooltipText: "",
    };
  }

  // Heurística extra: se o preview da última mensagem indicar mensagem enviada por atendente
  // (ex: *Débora Martins*: ... ou *Brenda Lauwers*: ... ou *Admin*: ...)
  if (conv.last_message_preview && /^\*[^*]+[*]:/.test(conv.last_message_preview.trim())) {
    return {
      isWaiting: false,
      isFirstResponse: false,
      waitingSince: null,
      elapsedMinutes: 0,
      limitMinutes: 0,
      status: "none",
      percentage: 0,
      remainingMinutes: 0,
      overdueMinutes: 0,
      badgeLabel: "",
      tooltipText: "",
    };
  }

  // Determina quando o cliente começou a aguardar (waitingSinceDate)
  // REGRA DE CONTINUIDADE:
  // A espera NUNCA reinicia quando o cliente envia mensagens adicionais.
  // Começa na primeira mensagem sem resposta deste turno (ou na criação da conversa se nunca foi respondida).
  let isWaiting = false;
  let isFirstResponse = false;
  let waitingDateStr: string | null = null;

  if (overrideWaitingSince) {
    isWaiting = true;
    isFirstResponse = conv.status === "waiting";
    waitingDateStr = overrideWaitingSince;
  } else if (lastMsg?.waiting_since) {
    isWaiting = true;
    isFirstResponse = conv.status === "waiting";
    waitingDateStr = lastMsg.waiting_since;
  } else if (conv.status === "waiting") {
    // Na fila de espera: aguarda primeiro atendimento
    isWaiting = true;
    isFirstResponse = true;
    waitingDateStr = conv.started_at || lastMsg?.created_at || conv.last_message_at;
  } else if (conv.status === "active") {
    // Em andamento:
    if (lastMsg && lastMsg.sender_type === "contact") {
      isWaiting = true;
      isFirstResponse = false;
      waitingDateStr = lastMsg.waiting_since || lastMsg.created_at || conv.last_message_at;
    } else if (!lastMsg) {
      // Fallback caso lastMsg não tenha sido carregado individualmente ainda
      isWaiting = true;
      isFirstResponse = false;
      waitingDateStr = conv.started_at || conv.last_message_at;
    }
  }

  if (!isWaiting || !waitingDateStr) {
    return {
      isWaiting: false,
      isFirstResponse,
      waitingSince: null,
      elapsedMinutes: 0,
      limitMinutes: 0,
      status: "none",
      percentage: 0,
      remainingMinutes: 0,
      overdueMinutes: 0,
      badgeLabel: "",
      tooltipText: "",
    };
  }

  const waitingSince = new Date(waitingDateStr);
  if (isNaN(waitingSince.getTime())) {
    return {
      isWaiting: false,
      isFirstResponse,
      waitingSince: null,
      elapsedMinutes: 0,
      limitMinutes: 0,
      status: "none",
      percentage: 0,
      remainingMinutes: 0,
      overdueMinutes: 0,
      badgeLabel: "",
      tooltipText: "",
    };
  }

  const now = new Date();
  const elapsedMinutes = Math.max(0, differenceInMinutes(now, waitingSince));

  // Régua Contínua Solicitada:
  // 0 a 2 min: Verde (ok / no prazo)
  // 3 a 5 min: Atenção (warning / âmbar)
  // > 5 min: Vermelho (breached / estourado)
  const limitMinutes = settings.response_limit_minutes || 5;
  const warningMinutes = 3;

  let status: SlaStatus = "ok";
  if (elapsedMinutes > limitMinutes) {
    status = "breached";
  } else if (elapsedMinutes >= warningMinutes) {
    status = "warning";
  } else {
    status = "ok";
  }

  const remainingMinutes = Math.max(0, limitMinutes - elapsedMinutes);
  const overdueMinutes = Math.max(0, elapsedMinutes - limitMinutes);
  const percentage = Math.round((elapsedMinutes / limitMinutes) * 100);

  const formattedElapsed = formatMinutesFriendly(elapsedMinutes);
  const formattedLimit = formatMinutesFriendly(limitMinutes);
  const formattedOverdue = formatMinutesFriendly(overdueMinutes);
  const formattedRemaining = formatMinutesFriendly(remainingMinutes);

  // Badge contínuo: SEMPRE o tempo decorrido total (0m, 1m, 2m, 3m, 4m, 5m, 6m, 7m...)
  // NUNCA "+1m", "+2m"
  const badgeLabel = formattedElapsed;

  let tooltipText = "";
  if (status === "breached") {
    tooltipText = `SLA Estourado: Aguardando resposta há ${formattedElapsed} (Limite de ${formattedLimit} excedido por ${formattedOverdue}).`;
  } else if (status === "warning") {
    tooltipText = `SLA Atenção: Aguardando resposta há ${formattedElapsed} (Faltam ${formattedRemaining} para o limite de ${formattedLimit}).`;
  } else {
    tooltipText = `SLA no Prazo: Aguardando resposta há ${formattedElapsed} (Limite: ${formattedLimit}).`;
  }

  return {
    isWaiting: true,
    isFirstResponse,
    waitingSince,
    elapsedMinutes,
    limitMinutes,
    status,
    percentage,
    remainingMinutes,
    overdueMinutes,
    badgeLabel,
    tooltipText,
  };
}
