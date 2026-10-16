import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Flame, PauseCircle, Repeat, XCircle, CalendarCheck, Circle, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import type { TodooLead } from "@/types/todoo";

/**
 * Cadência de prospecção do Quadro Comercial (um funil por empresa):
 * A contatar -> 1ª..4ª tentativa -> Sem sucesso (quarentena) -> A contatar.
 */
export type TodooStageKind = "start" | "attempt" | "failed";

export interface TodooStage {
  id: string;
  name: string;
  color: string;
  kind: TodooStageKind;
  position: number;
  /** Tempo até a próxima etapa (tentativa) ou da quarentena (Sem sucesso) */
  wait_minutes: number | null;
}

/** Comportamento do status do card na cadência. */
export type TodooCardBehavior = "active" | "paused" | "scheduled" | "won" | "lost";

export interface TodooCardStatus {
  id: string;
  name: string;
  color: string;
  behavior: TodooCardBehavior;
  position: number;
  is_default: boolean;
}

export const TODOO_STAGE_KINDS: Record<TodooStageKind, { label: string; hint: string; icon: LucideIcon }> = {
  start: { label: "Início", hint: "A contatar: prazo da ação comercial", icon: Flame },
  attempt: { label: "Tentativa", hint: "Tempo até a próxima tentativa", icon: Repeat },
  failed: { label: "Sem sucesso", hint: "Quarentena; depois volta ao início", icon: XCircle },
};

export const TODOO_CARD_BEHAVIORS: Record<
  TodooCardBehavior,
  { label: string; hint: string; icon: LucideIcon; outcome?: "scheduled" | "won" | "lost" }
> = {
  active: { label: "Cadência segue", hint: "As tentativas continuam sendo cobradas", icon: Circle },
  paused: { label: "Pausa a cadência", hint: "O contato respondeu", icon: PauseCircle },
  scheduled: { label: "Agendou", hint: "Para a cadência e conta agendamento", icon: CalendarCheck, outcome: "scheduled" },
  won: { label: "Comprou", hint: "Para a cadência e pede o valor", icon: CheckCircle2, outcome: "won" },
  lost: { label: "Perdido", hint: "Vai para Sem sucesso (quarentena)", icon: XCircle, outcome: "lost" },
};

export const TODOO_CARD_BEHAVIOR_ORDER: TodooCardBehavior[] = ["active", "paused", "scheduled", "won", "lost"];

export const TODOO_STAGE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#0ea5e9",
  "#14b8a6",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#10b981",
  "#ef4444",
  "#64748b",
];

export type TodooCadenceLead = Pick<TodooLead, "status" | "sla_deadline"> & {
  stage_id?: string | null;
  card_status_id?: string | null;
  next_action_at?: string | null;
  stage_entered_at?: string | null;
};

/** Etapa onde o lead aparece (sem etapa ou etapa apagada: a primeira). */
export function resolveTodooLeadStage(lead: TodooCadenceLead, stages: TodooStage[]) {
  return stages.find((s) => s.id === lead.stage_id) ?? stages[0];
}

export function resolveTodooCardStatus(lead: TodooCadenceLead, statuses: TodooCardStatus[]) {
  return statuses.find((s) => s.id === lead.card_status_id) ?? statuses.find((s) => s.is_default) ?? statuses[0];
}

/** Próxima etapa da cadência (a seguinte na ordem). */
export function nextTodooStage(stage: TodooStage | undefined, stages: TodooStage[]) {
  if (!stage) return undefined;
  const index = stages.findIndex((s) => s.id === stage.id);
  return index >= 0 ? stages[index + 1] : undefined;
}

export type CadenceState = "ok" | "due_today" | "overdue" | "stopped";

/** Situação da cadência do lead: quando vence o próximo passo e se está atrasado. */
export function todooCadenceInfo(
  lead: TodooCadenceLead,
  stage: TodooStage | undefined,
  status: TodooCardStatus | undefined,
  dayEnd?: string,
) {
  const dueAt = lead.next_action_at || (stage?.kind === "start" ? lead.sla_deadline : null);
  const active = !status || status.behavior === "active";
  const quarantine = stage?.kind === "failed";
  if ((!active && !quarantine) || !dueAt) {
    return { state: "stopped" as CadenceState, dueAt: null as string | null };
  }
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  let state: CadenceState = "ok";
  if (!quarantine && due < now) state = "overdue";
  else if (!quarantine && dayEnd && dueAt < dayEnd) state = "due_today";
  return { state, dueAt };
}

/** Rótulo curto da ação que a etapa cobra. */
export function todooStageActionLabel(stage: TodooStage | undefined, stages: TodooStage[]) {
  const next = nextTodooStage(stage, stages);
  if (!stage) return "Avançar";
  if (stage.kind === "failed") return "Voltar ao início";
  if (!next) return "Avançar";
  if (next.kind === "failed") return next.name;
  return `Fiz a ${next.name}`;
}

/** Funil da empresa ativa. Também devolve a quarentena vencida para o início. */
export function useTodooPipeline() {
  const { activeCompanyId } = useActiveCompany();
  const query = useQuery({
    queryKey: ["todoo-pipeline", activeCompanyId],
    enabled: !!activeCompanyId,
    staleTime: 60_000,
    queryFn: async () => {
      const [stagesRes, statusesRes] = await Promise.all([
        (supabase.from("todoo_stages") as any)
          .select("id, name, color, kind, position, wait_minutes")
          .eq("company_id", activeCompanyId)
          .order("position"),
        (supabase.from("todoo_card_statuses") as any)
          .select("id, name, color, behavior, position, is_default")
          .eq("company_id", activeCompanyId)
          .order("position"),
      ]);
      if (stagesRes.error) throw stagesRes.error;
      if (statusesRes.error) throw statusesRes.error;
      return {
        stages: (stagesRes.data || []) as TodooStage[],
        statuses: (statusesRes.data || []) as TodooCardStatus[],
      };
    },
  });
  return {
    ...query,
    stages: query.data?.stages ?? [],
    statuses: query.data?.statuses ?? [],
  };
}

/** Roda a rotina da cadência (quarentena vencida e atrasos) antes de carregar os leads. */
export async function refreshTodooCadence(companyId: string) {
  const { error } = await (supabase.rpc as any)("todoo_refresh_cadence", { p_company_id: companyId });
  if (error) console.warn("[todoo] refresh cadence:", error.message);
}

/** Minutos em texto: "48h", "7 dias", "15 dias". */
export function formatWait(minutes: number | null | undefined) {
  if (!minutes) return "";
  if (minutes % 1440 === 0) return `${minutes / 1440} dia${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes} min`;
}
