import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Clock, Flame, MessageSquare, XCircle, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import type { TodooLead, TodooLeadStatus, TodooOutcomeType } from "@/types/todoo";

/** Comportamento da etapa: liga a coluna ao status do lead usado no resto do Todoo. */
export type TodooStageKind = "pending" | "in_progress" | "scheduled" | "callback" | "won" | "lost";

export interface TodooStage {
  /** null nas etapas padrão (empresa ainda sem etapas próprias) */
  id: string | null;
  name: string;
  color: string;
  kind: TodooStageKind;
  position: number;
}

export const TODOO_STAGE_KINDS: Record<
  TodooStageKind,
  { label: string; hint: string; icon: LucideIcon; outcome?: TodooOutcomeType }
> = {
  pending: { label: "A contatar", hint: "Lead ainda não chamado", icon: Flame },
  in_progress: { label: "Em atendimento", hint: "Conversa ou orçamento em andamento", icon: MessageSquare },
  scheduled: { label: "Agendado", hint: "Pede o desfecho Agendou", icon: Calendar, outcome: "scheduled" },
  callback: { label: "Retorno", hint: "Pede a data do retorno", icon: Clock, outcome: "callback" },
  won: { label: "Venda", hint: "Pede o valor da venda", icon: CheckCircle2, outcome: "won" },
  lost: { label: "Sem sucesso", hint: "Pede o motivo da perda", icon: XCircle, outcome: "lost" },
};

export const TODOO_STAGE_KIND_ORDER: TodooStageKind[] = [
  "pending",
  "in_progress",
  "scheduled",
  "callback",
  "won",
  "lost",
];

export const DEFAULT_TODOO_STAGES: TodooStage[] = [
  { id: null, name: "A Contatar", color: "#3b82f6", kind: "pending", position: 0 },
  { id: null, name: "Em Atendimento", color: "#8b5cf6", kind: "in_progress", position: 1 },
  { id: null, name: "Agendado", color: "#0ea5e9", kind: "scheduled", position: 2 },
  { id: null, name: "Retorno Agendado", color: "#f59e0b", kind: "callback", position: 3 },
  { id: null, name: "Venda Realizada", color: "#10b981", kind: "won", position: 4 },
  { id: null, name: "Sem Sucesso", color: "#ef4444", kind: "lost", position: 5 },
];

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

/** Chave da coluna no quadro (id da etapa ou o kind nas etapas padrão). */
export const todooStageKey = (stage: TodooStage) => stage.id ?? `default:${stage.kind}`;

export function todooStatusKind(status: TodooLeadStatus): TodooStageKind {
  if (status === "contacted" || status === "quoted") return "in_progress";
  if (status === "pending" || status === "scheduled" || status === "callback" || status === "won" || status === "lost") {
    return status;
  }
  return "pending";
}

/** Status gravado ao mover o lead para uma etapa de outro kind sem desfecho. */
export const TODOO_KIND_STATUS: Record<"pending" | "in_progress", TodooLeadStatus> = {
  pending: "pending",
  in_progress: "contacted",
};

/** Etapa onde o lead aparece: a escolhida, se for do kind do status; senão a primeira do kind. */
export function resolveTodooLeadStage(lead: Pick<TodooLead, "status"> & { stage_id?: string | null }, stages: TodooStage[]) {
  const kind = todooStatusKind(lead.status);
  const chosen = lead.stage_id ? stages.find((s) => s.id === lead.stage_id && s.kind === kind) : undefined;
  return chosen ?? stages.find((s) => s.kind === kind) ?? stages[0];
}

/** Etapas do Quadro da empresa ativa (as padrão enquanto a empresa não configurar). */
export function useTodooStages() {
  const { activeCompanyId } = useActiveCompany();
  const query = useQuery({
    queryKey: ["todoo-stages", activeCompanyId],
    enabled: !!activeCompanyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_stages") as any)
        .select("id, name, color, kind, position")
        .eq("company_id", activeCompanyId)
        .order("position");
      if (error) throw error;
      return (data || []) as TodooStage[];
    },
  });
  const custom = query.data ?? [];
  const isCustom = custom.length > 0;
  return {
    ...query,
    isCustom,
    stages: isCustom ? custom : DEFAULT_TODOO_STAGES,
  };
}
