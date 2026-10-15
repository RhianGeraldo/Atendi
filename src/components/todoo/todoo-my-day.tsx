import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flame,
  Loader2,
  MessageSquare,
  RefreshCw,
  Target,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import { TodooLead, TodooOutcomeType } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { TodooGoalsDialog } from "./todoo-goals-dialog";
import { TodooSectionHeader } from "./todoo-section-header";
import { currentTodooMonth, formatTodooPhone, todooDayBounds } from "./todoo-period";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  onCreateContactsClick?: () => void;
}

// Lead em atendimento sem nenhuma interação há este tempo vira tarefa de follow-up
const FOLLOWUP_AFTER_HOURS = 48;
// Itens exibidos por grupo antes do "Ver todos"
const GROUP_PREVIEW = 8;

const TEAM_VIEW = "team";

interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  unit_id: string | null;
  contacts?: { name: string | null; phone: string | null } | null;
}

interface DayPlan {
  captureTarget: number;
  captureDone: number;
  capturePeriod: "daily" | "monthly" | null;
  captureMonthTarget: number;
  captureMonthDone: number;
  callbacks: TodooLead[];
  toContact: TodooLead[];
  followups: TodooLead[];
  crmTasks: CrmTask[];
  workedToday: number;
  overdue: number;
  done: number;
  total: number;
}

const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

export function TodooMyDay({ onCreateContactsClick }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const { unitIds: myUnitIds, isAdmin: isCompanyAdmin } = useAccessibleUnits();
  const queryClient = useQueryClient();

  const isManagerOrAdmin =
    profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager";

  // Gestores começam vendo a equipe; consultoras, o próprio dia
  const [viewUserId, setViewUserId] = useState<string>(isManagerOrAdmin ? TEAM_VIEW : profile?.id || "");
  const [leadForOutcome, setLeadForOutcome] = useState<TodooLead | null>(null);
  const [outcomeType, setOutcomeType] = useState<TodooOutcomeType>("won");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);

  const bounds = useMemo(() => todooDayBounds(), []);
  const month = currentTodooMonth();

  // Consultoras visíveis (gerente: só a equipe das suas unidades)
  const { data: consultants = [] } = useQuery({
    queryKey: ["todoo-consultants-filter", activeCompanyId, isCompanyAdmin, myUnitIds.join(",")],
    enabled: !!activeCompanyId && isManagerOrAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, user_units(unit_id)")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      const list = (data || []) as any[];
      if (isCompanyAdmin) return list;
      return list.filter(
        (p) => p.id === profile?.id || (p.user_units || []).some((uu: any) => myUnitIds.includes(uu.unit_id)),
      );
    },
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["todoo-my-day", activeCompanyId, profile?.id, isManagerOrAdmin, selectedUnitId, bounds.dayStart],
    enabled: !!activeCompanyId && !!profile?.id,
    queryFn: async () => {
      const onlyMine = !isManagerOrAdmin;
      const unitFilter = isManagerOrAdmin && selectedUnitId && selectedUnitId !== "all" ? selectedUnitId : null;

      let leadsQuery = (supabase.from("todoo_leads") as any)
        .select(`
          *,
          campaign:todoo_campaigns(id, title, type, message_template, offer_details, sla_hours),
          unit:units(id, name, color)
        `)
        .eq("company_id", activeCompanyId)
        .or(`status.in.(pending,contacted,quoted,callback),last_interaction_at.gte.${bounds.dayStart}`)
        .order("sla_deadline", { ascending: true, nullsFirst: false });
      if (onlyMine) leadsQuery = leadsQuery.eq("assigned_user_id", profile!.id);
      if (unitFilter) leadsQuery = leadsQuery.eq("unit_id", unitFilter);

      // Tarefas do CRM vencidas ou para hoje (as de retorno do Todoo já aparecem como lead)
      let tasksQuery = (supabase.from("tasks") as any)
        .select("id, title, description, due_date, contact_id, assigned_to, unit_id, contacts(name, phone)")
        .eq("company_id", activeCompanyId)
        .eq("status", "pending")
        .lt("due_date", bounds.dayEnd)
        .not("title", "ilike", "[Todoo]%")
        .order("due_date", { ascending: true });
      if (onlyMine) tasksQuery = tasksQuery.eq("assigned_to", profile!.id);
      if (unitFilter) tasksQuery = tasksQuery.eq("unit_id", unitFilter);

      // Metas e cadastros da equipe toda: o painel de metas mostra o ranking para todos
      const goalsQuery = (supabase.from("todoo_goals") as any)
        .select("user_id, target_contacts, contacts_period, user:profiles(id, name)")
        .eq("company_id", activeCompanyId)
        .eq("month_year", month)
        .gt("target_contacts", 0);

      const capturesQuery = (supabase.from("todoo_referrals") as any)
        .select("captured_by_user_id, created_at")
        .eq("company_id", activeCompanyId)
        .gte("created_at", bounds.monthStart);

      const [leadsRes, tasksRes, goalsRes, capturesRes] = await Promise.all([
        leadsQuery,
        tasksQuery,
        goalsQuery,
        capturesQuery,
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (goalsRes.error) throw goalsRes.error;
      if (capturesRes.error) throw capturesRes.error;

      return {
        leads: (leadsRes.data || []) as TodooLead[],
        tasks: (tasksRes.data || []) as CrmTask[],
        goals: (goalsRes.data || []) as {
          user_id: string;
          target_contacts: number;
          contacts_period: string;
          user?: { id: string; name: string } | null;
        }[],
        captures: (capturesRes.data || []) as { captured_by_user_id: string | null; created_at: string }[],
      };
    },
  });

  // Monta o plano do dia de uma consultora
  const buildPlan = (userId: string): DayPlan => {
    const now = Date.now();
    const followupLimit = now - FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000;
    const leads = (data?.leads || []).filter((l) => l.assigned_user_id === userId);

    const callbacks = leads
      .filter((l) => l.status === "callback" && (!l.callback_scheduled_at || l.callback_scheduled_at < bounds.dayEnd))
      .sort((a, b) => (a.callback_scheduled_at || "").localeCompare(b.callback_scheduled_at || ""));
    const toContact = leads.filter((l) => l.status === "pending");
    const followups = leads
      .filter(
        (l) =>
          (l.status === "contacted" || l.status === "quoted") &&
          (!l.last_interaction_at || new Date(l.last_interaction_at).getTime() < followupLimit),
      )
      .sort((a, b) => (a.last_interaction_at || "").localeCompare(b.last_interaction_at || ""));
    const workedToday = leads.filter((l) => l.last_interaction_at && l.last_interaction_at >= bounds.dayStart).length;
    const crmTasks = (data?.tasks || []).filter((t) => t.assigned_to === userId);

    const goal = (data?.goals || []).find((g) => g.user_id === userId);
    const myCaptures = (data?.captures || []).filter((c) => c.captured_by_user_id === userId);
    const captureDone = myCaptures.filter((c) => c.created_at >= bounds.dayStart).length;
    const captureMonthDone = myCaptures.length;
    let captureTarget = 0;
    if (goal?.contacts_period === "daily") {
      captureTarget = goal.target_contacts;
    } else if (goal) {
      // Meta mensal: divide o que falta (sem contar hoje) pelos dias restantes
      const remaining = Math.max(0, goal.target_contacts - (captureMonthDone - captureDone));
      captureTarget = Math.ceil(remaining / bounds.daysLeftInMonth);
    }

    const overdue =
      toContact.filter((l) => l.sla_deadline && new Date(l.sla_deadline).getTime() < now).length +
      callbacks.filter((l) => l.callback_scheduled_at && new Date(l.callback_scheduled_at).getTime() < now).length +
      crmTasks.filter((t) => t.due_date && t.due_date < bounds.dayStart).length;

    const captureRemaining = Math.max(0, captureTarget - captureDone);
    const pending = callbacks.length + toContact.length + followups.length + crmTasks.length + captureRemaining;
    const done = workedToday + Math.min(captureDone, captureTarget);

    return {
      captureTarget,
      captureDone,
      capturePeriod: goal ? (goal.contacts_period === "daily" ? "daily" : "monthly") : null,
      captureMonthTarget: goal?.target_contacts || 0,
      captureMonthDone,
      callbacks,
      toContact,
      followups,
      crmTasks,
      workedToday,
      overdue,
      done,
      total: done + pending,
    };
  };

  const teamRows = useMemo(() => {
    if (!isManagerOrAdmin || !data) return [];
    return consultants
      .map((c: any) => ({ id: c.id as string, name: c.name as string, plan: buildPlan(c.id) }))
      .filter((r) => r.plan.total > 0 || r.plan.captureMonthDone > 0)
      .sort((a, b) => b.plan.total - b.plan.done - (a.plan.total - a.plan.done));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultants, data, isManagerOrAdmin]);

  // Painel de metas de cadastro: quem tem meta no mês (gerente: só a sua equipe)
  const goalRows = useMemo(() => {
    if (!data) return [];
    const visible = isManagerOrAdmin && !isCompanyAdmin ? new Set(consultants.map((c: any) => c.id)) : null;
    return data.goals
      .filter((g) => !visible || visible.has(g.user_id))
      .map((g) => ({ id: g.user_id, name: g.user?.name || "—", plan: buildPlan(g.user_id) }))
      .sort(
        (a, b) =>
          pct(b.plan.captureDone, b.plan.captureTarget) - pct(a.plan.captureDone, a.plan.captureTarget) ||
          b.plan.captureMonthDone - a.plan.captureMonthDone,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, consultants, isManagerOrAdmin, isCompanyAdmin]);

  const isTeamView = isManagerOrAdmin && viewUserId === TEAM_VIEW;
  const viewedUserId = isTeamView ? null : viewUserId || profile?.id || "";
  const plan = viewedUserId && data ? buildPlan(viewedUserId) : null;
  const viewingOther = !!viewedUserId && viewedUserId !== profile?.id;
  const viewedName = viewingOther
    ? consultants.find((c: any) => c.id === viewedUserId)?.name || "Consultora"
    : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
    queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
  };

  // Marca o lead como trabalhado agora (contato feito)
  const markContacted = async (lead: TodooLead) => {
    if (!profile) return;
    setSavingId(lead.id);
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({
          status: "contacted",
          last_interaction_at: now,
          updated_at: now,
          ...(lead.first_contact_at ? {} : { first_contact_at: now }),
          ...(lead.status === "callback" ? { callback_scheduled_at: null } : {}),
        })
        .eq("id", lead.id);
      if (error) throw error;
      await (supabase.from("todoo_events") as any).insert({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        company_id: lead.company_id,
        user_id: profile.id,
        event_type: "status_changed",
        notes: lead.status === "callback" ? "Retorno feito pelo Meu Dia" : "Contato feito pelo Meu Dia",
        metadata: { from: lead.status, to: "contacted" },
      });
      toast.success(`${lead.contact_name}: contato registrado`);
      refresh();
    } catch (err: any) {
      toast.error("Erro ao registrar contato: " + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const completeTask = async (task: CrmTask) => {
    setSavingId(task.id);
    try {
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);
      if (error) throw error;
      toast.success("Tarefa concluída");
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
    } catch (err: any) {
      toast.error("Erro ao concluir tarefa: " + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const openOutcome = (lead: TodooLead, type: TodooOutcomeType) => {
    setOutcomeType(type);
    setLeadForOutcome(lead);
  };

  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="space-y-5">
      <TodooSectionHeader
        title={isTeamView ? "Dia da equipe" : viewingOther ? `Dia de ${viewedName}` : "Meu Dia"}
        description={`${todayLabel.charAt(0).toUpperCase()}${todayLabel.slice(1)} · tarefas comerciais de hoje`}
        actions={
          <>
            {isManagerOrAdmin && (
              <Select value={viewUserId} onValueChange={setViewUserId}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TEAM_VIEW} className="text-xs">
                    Equipe (resumo)
                  </SelectItem>
                  {profile?.id && (
                    <SelectItem value={profile.id} className="text-xs">
                      Meu dia
                    </SelectItem>
                  )}
                  <SelectSeparator />
                  {consultants
                    .filter((c: any) => c.id !== profile?.id)
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {isManagerOrAdmin && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setGoalsOpen(true)}>
                <Target className="h-3.5 w-3.5" />
                Metas de Cadastro
              </Button>
            )}
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
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : isTeamView ? (
        <>
          <GoalsPanel
            rows={goalRows}
            highlightId={profile?.id}
            daysLeft={bounds.daysLeftInMonth}
            onConfigure={() => setGoalsOpen(true)}
            onSelect={setViewUserId}
          />
          <TeamOverview rows={teamRows} onSelect={setViewUserId} />
        </>
      ) : plan ? (
        <>
          <DaySummary plan={plan} />

          <GoalsPanel
            rows={goalRows}
            highlightId={viewedUserId || undefined}
            daysLeft={bounds.daysLeftInMonth}
            onConfigure={isManagerOrAdmin ? () => setGoalsOpen(true) : undefined}
            onSelect={isManagerOrAdmin ? setViewUserId : undefined}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CaptureCard plan={plan} canCreate={!viewingOther} onCreate={onCreateContactsClick} />

            <TaskGroup
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              title="Retornos de hoje"
              hint="Clientes que pediram para você retornar"
              count={plan.callbacks.length}
              emptyText="Nenhum retorno agendado para hoje."
            >
              {plan.callbacks.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  detail={
                    lead.callback_scheduled_at ? (
                      <DueBadge date={lead.callback_scheduled_at} prefix="Retorno" />
                    ) : null
                  }
                  saving={savingId === lead.id}
                  doneLabel="Retornei"
                  onDone={() => markContacted(lead)}
                  onOutcome={(t) => openOutcome(lead, t)}
                />
              ))}
            </TaskGroup>

            <TaskGroup
              icon={<Flame className="h-4 w-4 text-blue-500" />}
              title="Contatos para chamar"
              hint="Ações comerciais, base inativa e cadastros na sua fila"
              count={plan.toContact.length}
              emptyText="Fila zerada. Nenhum contato aguardando."
            >
              {plan.toContact.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  detail={lead.sla_deadline ? <DueBadge date={lead.sla_deadline} prefix="Prazo" /> : null}
                  saving={savingId === lead.id}
                  doneLabel="Chamei"
                  onDone={() => markContacted(lead)}
                  onOutcome={(t) => openOutcome(lead, t)}
                />
              ))}
            </TaskGroup>

            <TaskGroup
              icon={<MessageSquare className="h-4 w-4 text-violet-500" />}
              title="Follow-up de negociações"
              hint={`Em atendimento sem interação há mais de ${FOLLOWUP_AFTER_HOURS / 24} dias`}
              count={plan.followups.length}
              emptyText="Nenhuma negociação parada."
            >
              {plan.followups.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  detail={
                    <span className="text-[10px] text-muted-foreground">
                      {lead.last_interaction_at
                        ? `Último contato ${formatDistanceToNow(new Date(lead.last_interaction_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}`
                        : "Sem contato registrado"}
                    </span>
                  }
                  saving={savingId === lead.id}
                  doneLabel="Chamei"
                  onDone={() => markContacted(lead)}
                  onOutcome={(t) => openOutcome(lead, t)}
                />
              ))}
            </TaskGroup>

            <TaskGroup
              icon={<ClipboardList className="h-4 w-4 text-emerald-500" />}
              title="Tarefas do CRM"
              hint="Vencidas ou com vencimento hoje"
              count={plan.crmTasks.length}
              emptyText="Nenhuma tarefa do CRM para hoje."
            >
              {plan.crmTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  dayStart={bounds.dayStart}
                  saving={savingId === task.id}
                  onDone={() => completeTask(task)}
                />
              ))}
            </TaskGroup>
          </div>
        </>
      ) : null}

      <TodooGoalsDialog
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
          queryClient.invalidateQueries({ queryKey: ["todoo-goals-overview"] });
        }}
      />

      <TodooOutcomeDialog
        lead={leadForOutcome}
        open={!!leadForOutcome}
        onOpenChange={(open) => !open && setLeadForOutcome(null)}
        initialType={outcomeType}
        onSuccess={refresh}
      />
    </div>
  );
}

function DaySummary({ plan }: { plan: DayPlan }) {
  const progress = pct(plan.done, plan.total);
  const remaining = plan.total - plan.done;
  return (
    <Card className="p-4 bg-primary/5 border-primary/20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">
                {plan.total === 0
                  ? "Nenhuma tarefa para hoje"
                  : remaining === 0
                    ? "Dia concluído!"
                    : `${remaining} ${remaining === 1 ? "tarefa pendente" : "tarefas pendentes"}`}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {plan.done} de {plan.total} · {progress}%
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:w-auto shrink-0">
          <SummaryStat label="Trabalhados hoje" value={plan.workedToday} />
          <SummaryStat label="Cadastros hoje" value={plan.captureDone} />
          <SummaryStat label="Atrasados" value={plan.overdue} danger={plan.overdue > 0} />
        </div>
      </div>
    </Card>
  );
}

function SummaryStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-1.5 text-center min-w-[92px]">
      <div className={cn("text-lg font-bold leading-tight", danger && "text-destructive")}>{value}</div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</div>
    </div>
  );
}

function CaptureCard({
  plan,
  canCreate,
  onCreate,
}: {
  plan: DayPlan;
  canCreate: boolean;
  onCreate?: () => void;
}) {
  const hasGoal = plan.capturePeriod !== null;
  const reached = hasGoal && plan.captureDone >= plan.captureTarget;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserPlus className="h-4 w-4 text-pink-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Cadastrar contatos</h3>
            <p className="text-[11px] text-muted-foreground">Prospecção ativa e indicações</p>
          </div>
        </div>
        {canCreate && onCreate && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={onCreate}>
            <UserPlus className="h-3.5 w-3.5" />
            Cadastrar
          </Button>
        )}
      </div>

      {hasGoal ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-foreground">
              {plan.captureDone} / {plan.captureTarget} hoje
            </span>
            {reached ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Meta do dia batida
              </span>
            ) : (
              <span className="text-muted-foreground">
                Faltam {plan.captureTarget - plan.captureDone}
              </span>
            )}
          </div>
          <Progress value={pct(plan.captureDone, plan.captureTarget)} className="h-1.5" />
          {plan.capturePeriod === "monthly" && (
            <p className="text-[11px] text-muted-foreground">
              Meta mensal: {plan.captureMonthDone} / {plan.captureMonthTarget}. A meta de hoje é o que falta
              dividido pelos dias restantes do mês.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {plan.captureMonthDone > 0
            ? `${plan.captureDone} hoje · ${plan.captureMonthDone} no mês. Sem meta definida.`
            : "Sem meta de cadastros definida para este mês."}
        </p>
      )}
    </Card>
  );
}

function TaskGroup({
  icon,
  title,
  hint,
  count,
  emptyText,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  count: number;
  emptyText: string;
  children: ReactNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? children : children.slice(0, GROUP_PREVIEW);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{icon}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        </div>
        <Badge variant={count > 0 ? "secondary" : "outline"} className="text-xs shrink-0">
          {count}
        </Badge>
      </div>
      {count === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground py-2">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          {emptyText}
        </p>
      ) : (
        <div className="divide-y divide-border/60 -mx-1">
          {items}
          {children.length > GROUP_PREVIEW && (
            <button
              type="button"
              className="w-full pt-2 text-xs text-primary font-medium hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Mostrar menos" : `Ver todos (${children.length})`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function DueBadge({ date, prefix }: { date: string; prefix: string }) {
  const late = new Date(date).getTime() < Date.now();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium",
        late ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {late && <AlertTriangle className="h-3 w-3" />}
      {prefix} {late ? "vencido" : ""} {format(new Date(date), "dd/MM 'às' HH:mm")}
    </span>
  );
}

function LeadRow({
  lead,
  detail,
  saving,
  doneLabel,
  onDone,
  onOutcome,
}: {
  lead: TodooLead;
  detail: ReactNode;
  saving: boolean;
  doneLabel: string;
  onDone: () => void;
  onOutcome: (type: TodooOutcomeType) => void;
}) {
  const referrer = lead.custom_fields?.indicadora;
  const interest = lead.custom_fields?.servico;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-1 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{lead.contact_name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">{formatTodooPhone(lead.contact_phone)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {lead.campaign?.title && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {lead.campaign.title}
            </span>
          )}
          {referrer && <span className="text-[10px] text-muted-foreground">Indicada por {referrer}</span>}
          {interest && <span className="text-[10px] text-muted-foreground">Interesse: {interest}</span>}
          {detail}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <ContactChatButton
          contactId={lead.contact_id}
          contactName={lead.contact_name}
          phone={lead.contact_phone}
          unitId={lead.unit_id}
          trigger={
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" title="Abrir conversa">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
              Conversa
            </Button>
          }
        />
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={onDone} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {doneLabel}
        </Button>
        <Select value="" onValueChange={(v) => onOutcome(v as TodooOutcomeType)}>
          <SelectTrigger className="h-7 w-[104px] text-xs">
            <SelectValue placeholder="Desfecho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scheduled" className="text-xs">Agendou</SelectItem>
            <SelectItem value="won" className="text-xs">Fechou venda</SelectItem>
            <SelectItem value="quoted" className="text-xs">Enviou orçamento</SelectItem>
            <SelectItem value="callback" className="text-xs">Retornar depois</SelectItem>
            <SelectItem value="lost" className="text-xs">Sem sucesso</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  dayStart,
  saving,
  onDone,
}: {
  task: CrmTask;
  dayStart: string;
  saving: boolean;
  onDone: () => void;
}) {
  const late = !!task.due_date && task.due_date < dayStart;
  return (
    <div className="flex items-center gap-2.5 px-1 py-2">
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Checkbox checked={false} onCheckedChange={onDone} aria-label="Concluir tarefa" className="shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{task.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
          {task.contacts?.name && <span>{task.contacts.name}</span>}
          {task.due_date && (
            <span className={cn(late && "text-destructive font-medium")}>
              {late ? "Venceu " : "Vence "}
              {format(new Date(task.due_date), "dd/MM 'às' HH:mm")}
            </span>
          )}
          {task.description && <span className="truncate max-w-[220px]">{task.description}</span>}
        </div>
      </div>
      {task.contact_id && (
        <ContactChatButton contactId={task.contact_id} contactName={task.contacts?.name} phone={task.contacts?.phone} />
      )}
    </div>
  );
}

function GoalsPanel({
  rows,
  highlightId,
  daysLeft,
  onConfigure,
  onSelect,
}: {
  rows: { id: string; name: string; plan: DayPlan }[];
  highlightId?: string;
  daysLeft: number;
  onConfigure?: () => void;
  onSelect?: (id: string) => void;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="h-4 w-4 text-pink-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Metas de cadastro</h3>
            <p className="text-[11px] text-muted-foreground">
              Prospecção ativa e indicações · faltam {daysLeft} {daysLeft === 1 ? "dia" : "dias"} no mês
            </p>
          </div>
        </div>
        {onConfigure && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={onConfigure}>
            <Target className="h-3.5 w-3.5" />
            {rows.length > 0 ? "Ajustar" : "Definir metas"}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          Nenhuma meta de cadastro definida para este mês.
          {onConfigure ? " Defina a meta diária ou mensal de cada consultora." : ""}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {rows.map(({ id, name, plan }, idx) => {
            const monthly = plan.capturePeriod === "monthly";
            const reached =
              (plan.captureTarget > 0 && plan.captureDone >= plan.captureTarget) ||
              (monthly && plan.captureMonthDone >= plan.captureMonthTarget);
            return (
              <div
                key={id}
                onClick={onSelect ? () => onSelect(id) : undefined}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  id === highlightId ? "border-primary/40 bg-primary/5" : "bg-card",
                  onSelect && "cursor-pointer hover:border-primary/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                    {idx === 0 && reached && <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    <span className="truncate">{name}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {monthly ? `Mensal · ${plan.captureMonthTarget}` : `Diária · ${plan.captureTarget}`}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-muted-foreground">Hoje</span>
                    <span className={cn("font-semibold", reached && "text-emerald-600")}>
                      {plan.captureDone} / {plan.captureTarget}
                      {reached && <CheckCircle2 className="inline h-3 w-3 ml-1 -mt-0.5" />}
                    </span>
                  </div>
                  <Progress value={pct(plan.captureDone, plan.captureTarget)} className="h-1.5" />
                </div>
                {monthly && (
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between text-[11px]">
                      <span className="text-muted-foreground">No mês</span>
                      <span className="font-semibold">
                        {plan.captureMonthDone} / {plan.captureMonthTarget}
                      </span>
                    </div>
                    <Progress value={pct(plan.captureMonthDone, plan.captureMonthTarget)} className="h-1.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TeamOverview({
  rows,
  onSelect,
}: {
  rows: { id: string; name: string; plan: DayPlan }[];
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center space-y-2">
        <Users className="h-8 w-8 mx-auto text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Nenhuma consultora com tarefas ou metas para hoje.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Consultora</th>
              <th className="px-3 py-2 font-medium min-w-[160px]">Progresso do dia</th>
              <th className="px-3 py-2 font-medium text-center">Cadastros</th>
              <th className="px-3 py-2 font-medium text-center">Para chamar</th>
              <th className="px-3 py-2 font-medium text-center">Retornos</th>
              <th className="px-3 py-2 font-medium text-center">Follow-up</th>
              <th className="px-3 py-2 font-medium text-center">Tarefas CRM</th>
              <th className="px-3 py-2 font-medium text-center">Trabalhados</th>
              <th className="px-3 py-2 font-medium text-center">Atrasados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map(({ id, name, plan }) => {
              const progress = pct(plan.done, plan.total);
              return (
                <tr
                  key={id}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => onSelect(id)}
                  title="Ver o dia desta consultora"
                >
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="h-1.5 flex-1" />
                      <span className="text-muted-foreground w-9 text-right">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {plan.capturePeriod ? `${plan.captureDone}/${plan.captureTarget}` : plan.captureDone}
                  </td>
                  <td className="px-3 py-2.5 text-center">{plan.toContact.length}</td>
                  <td className="px-3 py-2.5 text-center">{plan.callbacks.length}</td>
                  <td className="px-3 py-2.5 text-center">{plan.followups.length}</td>
                  <td className="px-3 py-2.5 text-center">{plan.crmTasks.length}</td>
                  <td className="px-3 py-2.5 text-center">{plan.workedToday}</td>
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
  );
}
