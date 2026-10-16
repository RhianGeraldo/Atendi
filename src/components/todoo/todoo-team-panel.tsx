import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Flame, Loader2, RefreshCw, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { TodooMyDay, useTodooDayData, pct, type DayPlan } from "./todoo-my-day";
import { TodooSectionHeader } from "./todoo-section-header";
import { cn } from "@/lib/utils";

// Papéis que sempre aparecem no painel; os demais (admins) só se tiverem atividade no dia
const TEAM_ROLES = ["agent", "manager"];

interface TeamRow {
  id: string;
  name: string;
  plan: DayPlan;
}

/** Painel de métricas do dia da equipe (somente gestores). */
export function TodooTeamPanel() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const { unitIds: myUnitIds, isAdmin: isCompanyAdmin } = useAccessibleUnits();
  const { data, isLoading, isFetching, refetch, buildPlan } = useTodooDayData();
  const [selected, setSelected] = useState<TeamRow | null>(null);

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["todoo-team-members", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role, active, user_units(unit_id)")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const rows = useMemo<TeamRow[]>(() => {
    if (!data) return [];
    const unitFilter = selectedUnitId && selectedUnitId !== "all" ? selectedUnitId : null;
    return members
      .filter((m) => m.active !== false)
      .filter((m) => {
        const units: string[] = (m.user_units || []).map((u: any) => u.unit_id);
        if (!isCompanyAdmin && m.id !== profile?.id && !units.some((u) => myUnitIds.includes(u))) return false;
        return true;
      })
      .map((m) => {
        const plan = buildPlan(m.id);
        const units: string[] = (m.user_units || []).map((u: any) => u.unit_id);
        const hasActivity = plan.total > 0 || plan.captureMonthDone > 0 || plan.workedToday > 0;
        const inUnit = !unitFilter || units.includes(unitFilter);
        const show = hasActivity || (TEAM_ROLES.includes(m.role) && inUnit);
        return show ? { id: m.id as string, name: m.name as string, plan } : null;
      })
      .filter((r): r is TeamRow => !!r)
      .sort(
        (a, b) =>
          b.plan.total - b.plan.done - (a.plan.total - a.plan.done) || a.name.localeCompare(b.name, "pt-BR"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, members, selectedUnitId, isCompanyAdmin, myUnitIds.join(","), profile?.id]);

  const totals = useMemo(() => {
    const sum = (fn: (p: DayPlan) => number) => rows.reduce((acc, r) => acc + fn(r.plan), 0);
    return {
      worked: sum((p) => p.workedToday),
      captures: sum((p) => p.captureDone),
      captureTarget: sum((p) => p.captureTarget),
      toContact: sum((p) => p.toContact.length + p.attempts.length),
      overdue: sum((p) => p.overdue),
      done: sum((p) => p.done),
      total: sum((p) => p.total),
    };
  }, [rows]);

  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="space-y-5">
      <TodooSectionHeader
        title="Painel da Equipe"
        description={`${todayLabel.charAt(0).toUpperCase()}${todayLabel.slice(1)} · andamento do dia de cada pessoa`}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {isLoading || loadingMembers ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={<Users className="h-4 w-4 text-primary" />} label="Pessoas no painel" value={rows.length} />
            <Kpi
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Progresso da equipe"
              value={`${pct(totals.done, totals.total)}%`}
              hint={`${totals.done} de ${totals.total} tarefas`}
            />
            <Kpi
              icon={<UserPlus className="h-4 w-4 text-pink-500" />}
              label="Cadastros hoje"
              value={totals.captureTarget > 0 ? `${totals.captures} / ${totals.captureTarget}` : totals.captures}
              hint={totals.captureTarget > 0 ? "Cadastrados / meta do dia" : "Sem metas definidas"}
            />
            <Kpi
              icon={<Flame className="h-4 w-4 text-blue-500" />}
              label="Trabalhados hoje"
              value={totals.worked}
              hint={`${totals.toContact} ainda para chamar`}
            />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              label="Atrasados"
              value={totals.overdue}
              danger={totals.overdue > 0}
            />
          </div>

          {rows.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa nesta unidade.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Pessoa</th>
                      <th className="px-3 py-2 font-medium min-w-[160px]">Progresso do dia</th>
                      <th className="px-3 py-2 font-medium text-center">Cadastros hoje</th>
                      <th className="px-3 py-2 font-medium text-center">Cadastros mês</th>
                      <th className="px-3 py-2 font-medium text-center">Trabalhados</th>
                      <th className="px-3 py-2 font-medium text-center">Para chamar</th>
                      <th className="px-3 py-2 font-medium text-center">Retornos</th>
                      <th className="px-3 py-2 font-medium text-center">Tentativas</th>
                      <th className="px-3 py-2 font-medium text-center">Follow-up</th>
                      <th className="px-3 py-2 font-medium text-center">Tarefas CRM</th>
                      <th className="px-3 py-2 font-medium text-center">Atrasados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((row) => {
                      const { plan } = row;
                      const progress = pct(plan.done, plan.total);
                      const captureHit = plan.captureTarget > 0 && plan.captureDone >= plan.captureTarget;
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-muted/40 cursor-pointer"
                          onClick={() => setSelected(row)}
                          title="Ver o dia desta pessoa"
                        >
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.name}</td>
                          <td className="px-3 py-2.5">
                            {plan.total > 0 ? (
                              <div className="flex items-center gap-2">
                                <Progress value={progress} className="h-1.5 flex-1" />
                                <span className="text-muted-foreground w-9 text-right">{progress}%</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Sem tarefas hoje</span>
                            )}
                          </td>
                          <td className={cn("px-3 py-2.5 text-center", captureHit && "text-emerald-600 font-semibold")}>
                            {plan.capturePeriod ? `${plan.captureDone} / ${plan.captureTarget}` : plan.captureDone}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {plan.capturePeriod === "monthly"
                              ? `${plan.captureMonthDone} / ${plan.captureMonthTarget}`
                              : plan.captureMonthDone}
                          </td>
                          <td className="px-3 py-2.5 text-center">{plan.workedToday}</td>
                          <td className="px-3 py-2.5 text-center">{plan.toContact.length}</td>
                          <td className="px-3 py-2.5 text-center">{plan.callbacks.length}</td>
                          <td className="px-3 py-2.5 text-center">{plan.attempts.length}</td>
                          <td className="px-3 py-2.5 text-center">{plan.followups.length}</td>
                          <td className="px-3 py-2.5 text-center">{plan.crmTasks.length}</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-center",
                              plan.overdue > 0 && "text-destructive font-semibold",
                            )}
                          >
                            {plan.overdue}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Dia de {selected?.name}</SheetTitle>
            <SheetDescription>Tarefas comerciais de hoje</SheetDescription>
          </SheetHeader>
          {selected && <TodooMyDay userId={selected.id} embedded />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <Card className="p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn("text-xl font-bold leading-tight", danger && "text-destructive")}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}
