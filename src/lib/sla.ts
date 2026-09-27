import { differenceInMinutes } from "date-fns";
import type { ConvRow } from "@/components/chat/conversation-types";

export interface SlaSettings {
  enabled: boolean;
  first_response_limit_minutes: number;
  response_limit_minutes: number;
  resolution_limit_hours: number;
  warning_threshold_percent: number; // ex: 75 para 75%
  count_business_hours_only: boolean;
}

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  enabled: true,
  first_response_limit_minutes: 10,
  response_limit_minutes: 5,
  resolution_limit_hours: 4,
  warning_threshold_percent: 75,
  count_business_hours_only: false,
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
 * Calcula o status de SLA para uma conversa
 */
export function calculateConversationSla(
  conv: ConvRow,
  settings: SlaSettings = DEFAULT_SLA_SETTINGS,
  overrideLastMessage?: { sender_type: string; created_at: string; is_internal?: boolean } | null
): ConversationSlaInfo {
  // Ignora se SLA desabilitado, se resolvido ou se for grupo do WhatsApp
  const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith("120363") || (conv.contact.phone.includes("-") && conv.contact.phone.length > 18)));

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
  const lastMsg = (overrideLastMessage !== undefined && overrideLastMessage !== null)
    ? overrideLastMessage
    : (conv.last_message?.find((m) => !m.is_internal) || conv.last_message?.[0]);

  // Se a última mensagem foi enviada pelo atendente/agente/sistema:
  // O cliente NUNCA está aguardando resposta (tanto na fila quanto em andamento)!
  if (lastMsg && lastMsg.sender_type !== "contact") {
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

  // Verifica se o cliente está aguardando resposta
  let isWaiting = false;
  let isFirstResponse = false;
  let waitingDateStr: string | null = null;

  if (conv.status === "waiting") {
    // Na fila de espera: o cliente aguarda o primeiro atendimento
    isWaiting = true;
    isFirstResponse = true;
    waitingDateStr = lastMsg?.created_at || conv.last_message_at || conv.started_at;
  } else if (conv.status === "active") {
    // Em andamento:
    // 1. Se temos informação da última mensagem e foi do contato:
    if (lastMsg) {
      if (lastMsg.sender_type === "contact") {
        isWaiting = true;
        isFirstResponse = false;
        waitingDateStr = lastMsg.created_at || conv.last_message_at;
      }
    } else {
      // 2. Fallback caso lastMsg não tenha sido carregado individualmente ainda:
      // Se não há indicativo de envio por atendente no preview, consideramos aguardando retorno
      isWaiting = true;
      isFirstResponse = false;
      waitingDateStr = conv.last_message_at;
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
  const now = new Date();
  const elapsedMinutes = Math.max(0, differenceInMinutes(now, waitingSince));

  const limitMinutes = isFirstResponse
    ? settings.first_response_limit_minutes || 10
    : settings.response_limit_minutes || 5;

  const warningThreshold = Math.floor(
    (limitMinutes * (settings.warning_threshold_percent || 75)) / 100
  );

  const remainingMinutes = Math.max(0, limitMinutes - elapsedMinutes);
  const overdueMinutes = Math.max(0, elapsedMinutes - limitMinutes);
  const percentage = Math.round((elapsedMinutes / limitMinutes) * 100);

  let status: SlaStatus = "ok";
  let badgeLabel = "";
  let tooltipText = "";

  const formattedElapsed = formatMinutesFriendly(elapsedMinutes);
  const formattedLimit = formatMinutesFriendly(limitMinutes);
  const formattedOverdue = formatMinutesFriendly(overdueMinutes);
  const formattedRemaining = formatMinutesFriendly(remainingMinutes);

  const contextLabel = isFirstResponse ? "1ª Resposta" : "Retorno";

  if (elapsedMinutes >= limitMinutes) {
    status = "breached";
    badgeLabel = overdueMinutes > 0 ? `+${formattedOverdue}` : formattedElapsed;
    tooltipText = `SLA Estourado (${contextLabel}): Limite de ${formattedLimit} excedido por ${formattedOverdue}. Aguardando há ${formattedElapsed}.`;
  } else if (elapsedMinutes >= warningThreshold) {
    status = "warning";
    badgeLabel = formattedElapsed;
    tooltipText = `SLA Atenção (${contextLabel}): Faltam ${formattedRemaining} para o limite de ${formattedLimit}. Aguardando há ${formattedElapsed}.`;
  } else {
    status = "ok";
    badgeLabel = formattedElapsed;
    tooltipText = `SLA no Prazo (${contextLabel}): Aguardando há ${formattedElapsed} (Limite: ${formattedLimit}).`;
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
