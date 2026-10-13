export type SlaStatus = "ok" | "warning" | "breached" | "none";

export interface StageSlaConfig {
  sla_enabled: boolean;
  sla_minutes: number | null;
  sla_warning_pct: number;
}

export interface OpportunitySlaInfo {
  status: SlaStatus;
  elapsedMinutes: number;
  limitMinutes: number;
  warningPct: number;
  percentElapsed: number;
  remainingMinutes: number;
  formattedElapsed: string;
  formattedRemaining: string;
  badgeLabel: string;
}

/**
 * Converte minutos para string legível (ex: "15 min", "2h", "1h 30m", "2d", "1d 4h")
 */
export function formatSlaDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMinutes = mins % 60;
  if (hours < 24) {
    if (remMinutes === 0) return `${hours}h`;
    return `${hours}h ${remMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `${days}d`;
  return `${days}d ${remHours}h`;
}

/**
 * Converte minutos totais para par (valor, unidade) mais apropriado
 */
export function slaMinutesToUnit(totalMinutes: number | null | undefined): {
  value: number;
  unit: "minutes" | "hours" | "days";
} {
  if (!totalMinutes || totalMinutes <= 0) {
    return { value: 24, unit: "hours" };
  }

  if (totalMinutes % 1440 === 0) {
    return { value: totalMinutes / 1440, unit: "days" };
  }
  if (totalMinutes % 60 === 0) {
    return { value: totalMinutes / 60, unit: "hours" };
  }
  return { value: totalMinutes, unit: "minutes" };
}

/**
 * Converte valor e unidade para minutos inteiros
 */
export function slaUnitToMinutes(value: number, unit: "minutes" | "hours" | "days"): number {
  const safeVal = Math.max(1, Math.round(value || 1));
  switch (unit) {
    case "days":
      return safeVal * 1440;
    case "hours":
      return safeVal * 60;
    case "minutes":
    default:
      return safeVal;
  }
}

/**
 * Calcula o status de SLA para uma oportunidade em relação à sua etapa atual.
 * Conforme requisito de negócio: contabiliza APENAS para oportunidades em aberto.
 */
export function calculateOpportunitySla(
  opportunity?: {
    status?: string | null;
    stage_entered_at?: string | null;
    created_at?: string | null;
  } | null,
  stage?:
    | {
        sla_enabled?: boolean | null;
        sla_minutes?: number | null;
        sla_warning_pct?: number | null;
      }
    | null
    | undefined,
): OpportunitySlaInfo {
  if (!opportunity) {
    return {
      status: "none",
      elapsedMinutes: 0,
      limitMinutes: stage?.sla_minutes || 0,
      warningPct: stage?.sla_warning_pct ?? 75,
      percentElapsed: 0,
      remainingMinutes: 0,
      formattedElapsed: "",
      formattedRemaining: "",
      badgeLabel: "",
    };
  }

  // Se não estiver em aberto (ex: ganho ou perdido), não contabiliza tempo/SLA
  const isOpportunityOpen = !opportunity.status || opportunity.status === "open";
  if (!isOpportunityOpen) {
    return {
      status: "none",
      elapsedMinutes: 0,
      limitMinutes: 0,
      warningPct: 75,
      percentElapsed: 0,
      remainingMinutes: 0,
      formattedElapsed: "",
      formattedRemaining: "",
      badgeLabel: "",
    };
  }

  const enteredAtStr = opportunity.stage_entered_at || opportunity.created_at;
  const enteredAt = enteredAtStr ? new Date(enteredAtStr).getTime() : Date.now();
  const now = Date.now();

  const elapsedMinutes = Math.max(0, Math.floor((now - enteredAt) / (1000 * 60)));
  const formattedElapsed = formatSlaDuration(elapsedMinutes);

  const hasSlaConfig = !!stage?.sla_enabled && !!stage?.sla_minutes && stage.sla_minutes > 0;

  if (!hasSlaConfig || !stage) {
    return {
      status: "none",
      elapsedMinutes,
      limitMinutes: 0,
      warningPct: 75,
      percentElapsed: 0,
      remainingMinutes: 0,
      formattedElapsed,
      formattedRemaining: "",
      badgeLabel: `Há ${formattedElapsed}`,
    };
  }
  const limitMinutes = stage.sla_minutes!;
  const warningPct = typeof stage.sla_warning_pct === "number" ? stage.sla_warning_pct : 75;
  const percentElapsed = Math.round((elapsedMinutes / limitMinutes) * 100);
  const remainingMinutes = limitMinutes - elapsedMinutes;

  const formattedRemaining = formatSlaDuration(Math.abs(remainingMinutes));

  let status: SlaStatus = "ok";
  let badgeLabel = `Há ${formattedElapsed}`;

  if (elapsedMinutes >= limitMinutes) {
    status = "breached";
    const breachedBy = elapsedMinutes - limitMinutes;
    badgeLabel = `Atrasado há ${formatSlaDuration(breachedBy)}`;
  } else if (percentElapsed >= warningPct) {
    status = "warning";
    badgeLabel = `Resta ${formattedRemaining}`;
  }

  return {
    status,
    elapsedMinutes,
    limitMinutes,
    warningPct,
    percentElapsed,
    remainingMinutes,
    formattedElapsed,
    formattedRemaining,
    badgeLabel,
  };
}
