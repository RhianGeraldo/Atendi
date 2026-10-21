import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";

/** Configuração do envio automático de uma unidade (todoo_auto_units). */
export interface TodooAutoUnit {
  unit_id: string;
  company_id: string;
  enabled: boolean;
  instance_id: string | null;
  interval_min_seconds: number;
  interval_max_seconds: number;
  window_start: string;
  window_end: string;
  weekdays: number[];
  daily_limit: number | null;
  next_send_at: string | null;
  enabled_at: string | null;
}

/** Variação de mensagem de uma etapa (todoo_auto_messages). */
export interface TodooAutoMessage {
  id: string;
  company_id: string;
  stage_id: string;
  campaign_id: string | null;
  content: string | null;
  media_type: "image" | "video" | "audio" | "document" | null;
  media_url: string | null;
  media_name: string | null;
  active: boolean;
  created_at: string;
}

export type TodooAutoQueueStatus = "pending" | "sending" | "sent" | "skipped" | "canceled" | "failed";

export const TODOO_AUTO_STATUS: Record<TodooAutoQueueStatus, { label: string; className: string }> = {
  pending: { label: "Na fila", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  sending: { label: "Enviando", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  sent: { label: "Enviada", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  skipped: { label: "Pulada", className: "bg-muted text-muted-foreground" },
  canceled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
  failed: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};

export const TODOO_AUTO_WEEKDAYS = [
  { value: 0, short: "D", label: "Domingo" },
  { value: 1, short: "S", label: "Segunda" },
  { value: 2, short: "T", label: "Terça" },
  { value: 3, short: "Q", label: "Quarta" },
  { value: 4, short: "Q", label: "Quinta" },
  { value: 5, short: "S", label: "Sexta" },
  { value: 6, short: "S", label: "Sábado" },
];

const NO_PENDING = new Map<string, string>();

/**
 * Cards com mensagem automática na fila (ou saindo): a mensagem sai sozinha, então não
 * aparecem como atraso nem como tarefa da consultora.
 */
export function useTodooAutoPending() {
  const { activeCompanyId } = useActiveCompany();
  const query = useQuery({
    queryKey: ["todoo-auto-pending", activeCompanyId],
    enabled: !!activeCompanyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await fetchAllPages(() =>
        (supabase.from("todoo_auto_queue") as any)
          .select("id, lead_id, scheduled_for")
          .eq("company_id", activeCompanyId)
          .in("status", ["pending", "sending"])
          .order("id", { ascending: true }),
      );
      if (error) throw error;
      return new Map((data as { lead_id: string; scheduled_for: string }[]).map((r) => [r.lead_id, r.scheduled_for]));
    },
  });
  return query.data ?? NO_PENDING;
}
