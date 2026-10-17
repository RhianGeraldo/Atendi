import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, DollarSign, Filter, Loader2, MessageCircleReply, Repeat, Target, Timer, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { formatSlaDuration } from "@/types/crm-sla";
import { todooRange, type TodooRangeKey } from "./todoo-period";
import { useTodooPipeline } from "./todoo-stages";
import { cn } from "@/lib/utils";

// O PostgREST devolve no máximo 1.000 linhas por consulta: busca em páginas até acabar.
// A consulta precisa de uma ordem estável (created_at/occurred_at + id).
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

async function fetchAllPages(build: () => any): Promise<{ data: any[]; error: any }> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

interface CohortLead {
  id: string;
  created_at: string;
  assigned_user_id: string | null;
  stage_id: string | null;
  status: string;
  outcome_value: number | null;
  custom_fields: Record<string, any> | null;
  cadence_round: number;
  first_attempt_at: string | null;
  responded_at: string | null;
  scheduled_at: string | null;
  won_at: string | null;
}

interface HistoryRow {
  lead_id: string;
  event: string;
  occurred_at: string;
  actor_id: string | null;
  to_stage_id: string | null;
  to_stage_kind: string | null;
  from_stage_kind: string | null;
  to_stage_name: string | null;
  from_card_behavior: string | null;
  to_card_behavior: string | null;
  late_seconds: number | null;
  due_at: string | null;
}

const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Funil da cadência de prospecção: contatos que entraram no funil no período. */
export function TodooCadenceFunnel({ range }: { range: TodooRangeKey }) {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const { stages } = useTodooPipeline();
  const [consultant, setConsultant] = useState("all");
  const [origin, setOrigin] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["todoo-cadence-funnel", activeCompanyId, range, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { from, to } = todooRange(range);
      const leadsQuery = () => {
        let q = (supabase.from("todoo_leads") as any)
          .select(
            "id, created_at, assigned_user_id, stage_id, status, outcome_value, custom_fields, cadence_round, first_attempt_at, responded_at, scheduled_at, won_at",
          )
          .eq("company_id", activeCompanyId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lt("created_at", to);
        if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
        return q;
      };

      const historyQuery = () => {
        let q = (supabase.from("todoo_lead_history") as any)
          .select(
            "lead_id, event, occurred_at, actor_id, to_stage_id, to_stage_kind, from_stage_kind, to_stage_name, from_card_behavior, to_card_behavior, late_seconds, due_at",
          )
          .eq("company_id", activeCompanyId)
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true });
        if (from) q = q.gte("occurred_at", from);
        if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
        return q;
      };

      const [leadsRes, historyRes, profilesRes] = await Promise.all([
        fetchAllPages(leadsQuery),
        fetchAllPages(historyQuery),
        supabase.from("profiles").select("id, name").eq("company_id", activeCompanyId!),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (historyRes.error) throw historyRes.error;
      return {
        leads: (leadsRes.data || []) as CohortLead[],
        history: (historyRes.data || []) as HistoryRow[],
        names: Object.fromEntries((profilesRes.data || []).map((p: any) => [p.id, p.name as string])) as Record<
          string,
          string
        >,
      };
    },
  });

  const origins = useMemo(
    () =>
      Array.from(
        new Set((data?.leads || []).map((l) => l.custom_fields?.origem).filter(Boolean) as string[]),
      ).sort(),
    [data],
  );
  const consultants = useMemo(
    () =>
      Array.from(new Set((data?.leads || []).map((l) => l.assigned_user_id).filter(Boolean) as string[]))
        .map((id) => ({ id, name: data?.names[id] || "Sem nome" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [data],
  );

  const result = useMemo(() => {
    if (!data) return null;
    const cohort = data.leads.filter(
      (l) =>
        (consultant === "all" || l.assigned_user_id === consultant) &&
        (origin === "all" || l.custom_fields?.origem === origin),
    );
    const ids = new Set(cohort.map((l) => l.id));
    const history = data.history.filter((h) => ids.has(h.lead_id));
    const total = cohort.length;

    // Etapa mais avançada que cada lead já alcançou (histórico + etapa atual). Na cadência,
    // quem chegou à 3ª tentativa passou pelas anteriores, então o funil é cumulativo.
    const stageIndex = new Map(stages.map((s, i) => [s.id, i]));
    const maxReached = new Map<string, number>();
    const touch = (leadId: string, stageId: string | null) => {
      const idx = stageId ? stageIndex.get(stageId) : undefined;
      if (idx === undefined) return;
      maxReached.set(leadId, Math.max(maxReached.get(leadId) ?? 0, idx));
    };
    for (const l of cohort) {
      maxReached.set(l.id, 0);
      touch(l.id, l.stage_id);
    }
    for (const h of history) touch(h.lead_id, h.to_stage_id);
    const funnel = stages.map((s, index) => {
      const count = cohort.filter((l) => (maxReached.get(l.id) ?? 0) >= index).length;
      return { stage: s, count, pct: pctOf(count, total) };
    });

    // Em qual etapa o contato respondeu pela primeira vez (cadência ativa -> respondeu/agendou/comprou)
    const firstResponse = new Map<string, string>();
    for (const h of history) {
      if (
        h.event === "status_changed" &&
        h.from_card_behavior === "active" &&
        ["paused", "scheduled", "won"].includes(h.to_card_behavior || "") &&
        !firstResponse.has(h.lead_id)
      ) {
        firstResponse.set(h.lead_id, h.to_stage_id || "");
      }
    }
    const responsesByStage = stages
      .map((s) => ({ stage: s, count: Array.from(firstResponse.values()).filter((id) => id === s.id).length }))
      .filter((r) => r.stage.kind !== "failed");

    const attempted = cohort.filter((l) => l.first_attempt_at).length;
    const responded = cohort.filter((l) => l.responded_at).length;
    const scheduled = cohort.filter((l) => l.scheduled_at).length;
    const won = cohort.filter((l) => l.won_at);
    const revenue = won.reduce((acc, l) => acc + (Number(l.outcome_value) || 0), 0);
    const recycled = cohort.filter((l) => l.cadence_round > 1).length;
    const toFirstAttempt = cohort
      .filter((l) => l.first_attempt_at)
      .map((l) => (new Date(l.first_attempt_at!).getTime() - new Date(l.created_at).getTime()) / 60000)
      .filter((m) => m >= 0);
    const avgToFirstAttempt = toFirstAttempt.length
      ? toFirstAttempt.reduce((a, b) => a + b, 0) / toFirstAttempt.length
      : null;

    // Disciplina: tentativas feitas (saída de A contatar ou de uma tentativa), no prazo ou atrasadas
    const perUser = new Map<
      string,
      { attempts: number; withDue: number; onTime: number; lateSum: number; lateCount: number }
    >();
    for (const h of history) {
      if (h.event !== "stage_changed" || !h.actor_id) continue;
      if (!["start", "attempt"].includes(h.from_stage_kind || "")) continue;
      if (!["attempt", "failed"].includes(h.to_stage_kind || "")) continue;
      const row = perUser.get(h.actor_id) || { attempts: 0, withDue: 0, onTime: 0, lateSum: 0, lateCount: 0 };
      row.attempts += 1;
      if (h.late_seconds !== null && h.late_seconds !== undefined) {
        row.withDue += 1;
        if (h.late_seconds === 0) row.onTime += 1;
        else {
          row.lateSum += h.late_seconds;
          row.lateCount += 1;
        }
      }
      perUser.set(h.actor_id, row);
    }
    const discipline = Array.from(perUser.entries())
      .map(([id, r]) => {
        const leadsOfUser = cohort.filter((l) => l.assigned_user_id === id);
        return {
          id,
          name: data.names[id] || "Sem nome",
          attempts: r.attempts,
          onTimePct: r.withDue ? pctOf(r.onTime, r.withDue) : null,
          avgLateMin: r.lateCount ? r.lateSum / r.lateCount / 60 : null,
          responded: leadsOfUser.filter((l) => l.responded_at).length,
          scheduled: leadsOfUser.filter((l) => l.scheduled_at).length,
          won: leadsOfUser.filter((l) => l.won_at).length,
        };
      })
      .sort((a, b) => b.attempts - a.attempts);

    return {
      total,
      funnel,
      responsesByStage,
      totalResponses: firstResponse.size,
      attempted,
      responded,
      scheduled,
      won: won.length,
      revenue,
      recycled,
      avgToFirstAttempt,
      discipline,
    };
  }, [data, stages, consultant, origin]);

  return (
    <Card className="min-w-0">
      <CardHeader className="p-4 border-b border-border flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          Funil da cadência de prospecção
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as origens</SelectItem>
              {origins.map((o) => (
                <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={consultant} onValueChange={setConsultant}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas as consultoras</SelectItem>
              {consultants.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-5">
        {isLoading || !result ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : result.total === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Nenhum contato entrou no funil neste período e filtro.
          </p>
        ) : (
          <>
            {/* Números do período */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              <Stat icon={Users} label="Entraram no funil" value={result.total} />
              <Stat
                icon={Target}
                label="Tiveram a 1ª tentativa"
                value={result.attempted}
                hint={`${pctOf(result.attempted, result.total)}% dos contatos`}
              />
              <Stat
                icon={MessageCircleReply}
                label="Responderam"
                value={result.responded}
                hint={`${pctOf(result.responded, result.total)}% dos contatos`}
              />
              <Stat
                icon={Clock}
                label="Agendaram"
                value={result.scheduled}
                hint={`${pctOf(result.scheduled, result.total)}% dos contatos`}
              />
              <Stat
                icon={DollarSign}
                label="Compraram"
                value={result.won}
                hint={result.revenue > 0 ? brl(result.revenue) : `${pctOf(result.won, result.total)}% dos contatos`}
              />
              <Stat
                icon={Timer}
                label="Até a 1ª tentativa"
                value={result.avgToFirstAttempt !== null ? formatSlaDuration(result.avgToFirstAttempt) : "—"}
                hint={result.recycled > 0 ? `${result.recycled} na 2ª rodada ou mais` : "tempo médio"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Funil por etapa */}
              <div className="space-y-2 min-w-0">
                <h4 className="text-xs font-semibold text-foreground">Até onde os contatos chegaram</h4>
                {result.funnel.map(({ stage, count, pct }) => (
                  <div key={stage.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                        {stage.name}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Em qual tentativa respondeu */}
              <div className="space-y-2 min-w-0">
                <h4 className="text-xs font-semibold text-foreground">
                  Em qual etapa responderam{" "}
                  <span className="font-normal text-muted-foreground">
                    ({result.totalResponses} {result.totalResponses === 1 ? "resposta" : "respostas"})
                  </span>
                </h4>
                {result.totalResponses === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-3">
                    Ainda não há respostas registradas. Elas contam quando o status muda de "Sem contato" para
                    "Em conversa", "Agendado" ou "Comprou".
                  </p>
                ) : (
                  result.responsesByStage.map(({ stage, count }) => {
                    const pct = pctOf(count, result.totalResponses);
                    return (
                      <div key={stage.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="truncate">{stage.name}</span>
                          <span className="text-muted-foreground shrink-0">
                            {count} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Disciplina da cadência */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground">Disciplina da cadência por consultora</h4>
              {result.discipline.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-2">Nenhuma tentativa registrada no período.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Consultora</th>
                        <th className="px-3 py-2 font-medium text-center">Tentativas</th>
                        <th className="px-3 py-2 font-medium text-center">No prazo</th>
                        <th className="px-3 py-2 font-medium text-center">Atraso médio</th>
                        <th className="px-3 py-2 font-medium text-center">Responderam</th>
                        <th className="px-3 py-2 font-medium text-center">Agendaram</th>
                        <th className="px-3 py-2 font-medium text-center">Compraram</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {result.discipline.map((d) => (
                        <tr key={d.id}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{d.name}</td>
                          <td className="px-3 py-2 text-center">{d.attempts}</td>
                          <td
                            className={cn(
                              "px-3 py-2 text-center",
                              d.onTimePct !== null && d.onTimePct < 70 && "text-destructive font-semibold",
                              d.onTimePct !== null && d.onTimePct >= 90 && "text-emerald-600 font-semibold",
                            )}
                          >
                            {d.onTimePct !== null ? `${d.onTimePct}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {d.avgLateMin !== null ? formatSlaDuration(d.avgLateMin) : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">{d.responded}</td>
                          <td className="px-3 py-2 text-center">{d.scheduled}</td>
                          <td className="px-3 py-2 text-center">{d.won}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5 space-y-0.5 min-w-0">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}
