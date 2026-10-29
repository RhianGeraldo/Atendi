import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Flame,
  Loader2,
  Repeat,
  MessageCircle,
  MessageSquare,
  Send,
  RefreshCw,
  Target,
  UserPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { canAccessTodooTab } from "@/lib/permissions";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import { TodooLead, TodooOutcomeType } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { TodooGoalsDialog } from "./todoo-goals-dialog";
import { currentTodooMonth, formatTodooPhone, todooDayBounds } from "./todoo-period";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { TodooReferrerLink } from "./todoo-referrer-link";
import { TodooSendMessageDialog } from "./todoo-send-message-dialog";
import { useTodooAutoPending } from "./todoo-auto";
import {
  nextTodooStage,
  refreshTodooCadence,
  resolveTodooCardStatus,
  resolveTodooLeadStage,
  todooStageActionLabel,
  useTodooPipeline,
} from "./todoo-stages";

interface Props {
  /** Dia de outra pessoa (Painel da Equipe); sem valor, o dia de quem está logado */
  userId?: string;
  /** Dentro de outro painel: sem cabeçalho próprio */
  embedded?: boolean;
  onCreateContactsClick?: () => void;
}

// Lead em conversa (cadência pausada) sem nenhuma interação há este tempo vira follow-up
const FOLLOWUP_AFTER_HOURS = 48;

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

export interface DayPlan {
  captureTarget: number;
  captureDone: number;
  capturePeriod: "daily" | "monthly" | null;
  captureMonthTarget: number;
  captureMonthDone: number;
  callbacks: TodooLead[];
  /** A contatar: 1ª tentativa da cadência com prazo até o fim de hoje */
  toContact: TodooLead[];
  /** A contatar com prazo depois de hoje: aparece na fila, mas não conta no total do dia */
  upcoming: TodooLead[];
  /** Próximas tentativas da cadência que vencem até o fim de hoje */
  attempts: TodooLead[];
  /** Em conversa (cadência pausada) e parados há 48h */
  followups: TodooLead[];
  crmTasks: CrmTask[];
  workedToday: number;
  overdue: number;
  done: number;
  total: number;
}

export const pct = (done: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

/**
 * Dados do dia (leads, tarefas do CRM, metas e cadastros) e o cálculo do plano
 * de cada pessoa. Gestores carregam a equipe toda; consultoras, só o que é delas.
 */
export function useTodooDayData() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const autoPending = useTodooAutoPending();
  // Carrega a equipe para gestoras e para quem tem a aba Painel da Equipe; senão, só o que é da pessoa
  const isManagerOrAdmin =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager" ||
    canAccessTodooTab("team", profile);
  // Redesenha a cada minuto: o que passou do horário vai para Atrasados e, depois da
  // meia-noite, o dia muda junto (bounds é recalculado a cada render)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const bounds = todooDayBounds();
  const month = currentTodooMonth();
  const { stages, statuses } = useTodooPipeline();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "todoo-my-day",
      activeCompanyId,
      profile?.id,
      isManagerOrAdmin,
      selectedUnitId,
      bounds.dayStart,
    ],
    enabled: !!activeCompanyId && !!profile?.id,
    queryFn: async () => {
      // Quarentena vencida volta para A contatar antes de montar o dia
      await refreshTodooCadence(activeCompanyId!);
      const onlyMine = !isManagerOrAdmin;
      const unitFilter =
        isManagerOrAdmin && selectedUnitId && selectedUnitId !== "all" ? selectedUnitId : null;

      // Gestoras carregam a empresa toda: as listas passam de 1.000 linhas, então vêm em páginas
      const buildLeads = () => {
        let leadsQuery = (supabase.from("todoo_leads") as any)
          .select(
            `
          *,
          campaign:todoo_campaigns!inner(id, title, type, status, message_template, offer_details, sla_hours),
          unit:units(id, name, color)
        `,
          )
          .eq("company_id", activeCompanyId)
          // Ação pausada ou concluída sai da fila até ser retomada
          .eq("campaign.status", "active")
          .or(
            `status.in.(pending,contacted,quoted,callback),last_interaction_at.gte.${bounds.dayStart}`,
          )
          .order("sla_deadline", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true });
        if (onlyMine) leadsQuery = leadsQuery.eq("assigned_user_id", profile!.id);
        if (unitFilter) leadsQuery = leadsQuery.eq("unit_id", unitFilter);
        return leadsQuery;
      };

      // Tarefas do CRM vencidas ou para hoje (as de retorno do Todoo já aparecem como lead)
      const buildTasks = () => {
        let tasksQuery = (supabase.from("tasks") as any)
          .select(
            "id, title, description, due_date, contact_id, assigned_to, unit_id, contacts(name, phone)",
          )
          .eq("company_id", activeCompanyId)
          .eq("status", "pending")
          .lt("due_date", bounds.dayEnd)
          .not("title", "ilike", "[Todoo]%")
          .order("due_date", { ascending: true })
          .order("id", { ascending: true });
        if (onlyMine) tasksQuery = tasksQuery.eq("assigned_to", profile!.id);
        if (unitFilter) tasksQuery = tasksQuery.eq("unit_id", unitFilter);
        return tasksQuery;
      };

      let goalsQuery = (supabase.from("todoo_goals") as any)
        .select("user_id, target_contacts, contacts_period")
        .eq("company_id", activeCompanyId)
        .eq("month_year", month)
        .gt("target_contacts", 0);
      if (onlyMine) goalsQuery = goalsQuery.eq("user_id", profile!.id);

      const buildCaptures = () => {
        let capturesQuery = (supabase.from("todoo_referrals") as any)
          .select("captured_by_user_id, created_at")
          .eq("company_id", activeCompanyId)
          .gte("created_at", bounds.monthStart)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (onlyMine) capturesQuery = capturesQuery.eq("captured_by_user_id", profile!.id);
        return capturesQuery;
      };

      const [leadsRes, tasksRes, goalsRes, capturesRes] = await Promise.all([
        fetchAllPages(buildLeads),
        fetchAllPages(buildTasks),
        goalsQuery,
        fetchAllPages(buildCaptures),
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
        }[],
        captures: (capturesRes.data || []) as {
          captured_by_user_id: string | null;
          created_at: string;
        }[],
      };
    },
  });

  // Monta o plano do dia de uma consultora
  const buildPlan = (userId: string): DayPlan => {
    const now = Date.now();
    const followupLimit = now - FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000;
    const leads = (data?.leads || []).filter((l) => l.assigned_user_id === userId);

    const callbacks = leads
      .filter(
        (l) =>
          l.status === "callback" &&
          (!l.callback_scheduled_at || l.callback_scheduled_at < bounds.dayEnd),
      )
      .sort((a, b) => (a.callback_scheduled_at || "").localeCompare(b.callback_scheduled_at || ""));
    // Cadência: etapa e status do card de cada lead
    const cadence = leads.map((l) => ({
      lead: l,
      stage: resolveTodooLeadStage(l, stages),
      behavior:
        resolveTodooCardStatus(l, statuses)?.behavior ??
        (l.status === "pending" ? "active" : "paused"),
    }));
    const startLeads = cadence
      .filter(
        (c) =>
          c.behavior === "active" &&
          !autoPending.has(c.lead.id) &&
          (c.stage ? c.stage.kind === "start" : c.lead.status === "pending"),
      )
      .map((c) => c.lead);
    // Contato cadastrado hoje vence amanhã (SLA da ação): é tarefa de amanhã, não pendência de hoje.
    // Se a consultora chamar antes, conta como trabalhado hoje.
    const toContact = startLeads.filter((l) => !l.sla_deadline || l.sla_deadline < bounds.dayEnd);
    const upcoming = startLeads.filter((l) => !!l.sla_deadline && l.sla_deadline >= bounds.dayEnd);
    const attempts = cadence
      .filter(
        (c) =>
          c.behavior === "active" &&
          // A mensagem automática sai sozinha: não é tarefa nem atraso da consultora
          !autoPending.has(c.lead.id) &&
          c.stage?.kind === "attempt" &&
          !!c.lead.next_action_at &&
          c.lead.next_action_at < bounds.dayEnd,
      )
      .map((c) => c.lead)
      .sort((a, b) => (a.next_action_at || "").localeCompare(b.next_action_at || ""));
    const followups = cadence
      .filter(
        (c) =>
          c.behavior === "paused" &&
          c.lead.status !== "callback" &&
          (!c.lead.last_interaction_at ||
            new Date(c.lead.last_interaction_at).getTime() < followupLimit),
      )
      .map((c) => c.lead)
      .sort((a, b) => (a.last_interaction_at || "").localeCompare(b.last_interaction_at || ""));
    const workedToday = leads.filter(
      (l) => l.last_interaction_at && l.last_interaction_at >= bounds.dayStart,
    ).length;
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
      attempts.filter((l) => l.next_action_at && new Date(l.next_action_at).getTime() < now)
        .length +
      callbacks.filter(
        (l) => l.callback_scheduled_at && new Date(l.callback_scheduled_at).getTime() < now,
      ).length +
      crmTasks.filter((t) => t.due_date && new Date(t.due_date).getTime() < now).length;

    const captureRemaining = Math.max(0, captureTarget - captureDone);
    const pending =
      callbacks.length +
      toContact.length +
      attempts.length +
      followups.length +
      crmTasks.length +
      captureRemaining;
    const done = workedToday + Math.min(captureDone, captureTarget);

    return {
      captureTarget,
      captureDone,
      capturePeriod: goal ? (goal.contacts_period === "daily" ? "daily" : "monthly") : null,
      captureMonthTarget: goal?.target_contacts || 0,
      captureMonthDone,
      callbacks,
      toContact,
      upcoming,
      attempts,
      followups,
      crmTasks,
      workedToday,
      overdue,
      done,
      total: done + pending,
    };
  };

  return { data, isLoading, isFetching, refetch, buildPlan, bounds, stages, statuses };
}

export function TodooMyDay({ userId, embedded, onCreateContactsClick }: Props) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const isManagerOrAdmin =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  const [leadForOutcome, setLeadForOutcome] = useState<TodooLead | null>(null);
  const [outcomeType, setOutcomeType] = useState<TodooOutcomeType>("won");
  // Itens salvando agora (evita clique duplo e não libera o botão de outro item)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const setSaving = (id: string, on: boolean) =>
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [goalsOpen, setGoalsOpen] = useState(false);

  const { data, isLoading, isFetching, refetch, buildPlan, bounds, stages, statuses } =
    useTodooDayData();
  const [messageLead, setMessageLead] = useState<TodooLead | null>(null);
  // Com cadência ativa, a mensagem pode registrar a próxima tentativa
  const messageNextStage = useMemo(() => {
    if (!messageLead) return null;
    const stage = resolveTodooLeadStage(messageLead, stages);
    const behavior = resolveTodooCardStatus(messageLead, statuses)?.behavior;
    if (behavior !== "active" || !stage || stage.kind === "failed") return null;
    return nextTodooStage(stage, stages) ?? null;
  }, [messageLead, stages, statuses]);

  const viewedUserId = userId || profile?.id || "";
  const plan = viewedUserId && data ? buildPlan(viewedUserId) : null;
  const viewingOther = viewedUserId !== profile?.id;

  const queue = useMemo(() => (plan ? buildQueue(plan, stages) : []), [plan, stages]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
    queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
  };

  // Marca o lead como trabalhado agora (contato feito)
  const markContacted = async (lead: TodooLead) => {
    if (!profile) return;
    if (savingIds.has(lead.id)) return;
    setSaving(lead.id, true);
    try {
      const now = new Date().toISOString();
      // Orçamento enviado continua orçamento: o follow-up só registra o contato
      const nextStatus = lead.status === "quoted" ? "quoted" : "contacted";
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({
          status: nextStatus,
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
        notes:
          lead.status === "callback" ? "Retorno feito pelo Meu Dia" : "Contato feito pelo Meu Dia",
        metadata: { from: lead.status, to: nextStatus },
      });
      toast.success(`${lead.contact_name}: contato registrado`);
      refresh();
    } catch (err: any) {
      toast.error("Erro ao registrar contato: " + err.message);
    } finally {
      setSaving(lead.id, false);
    }
  };

  // Tentativa feita: o card avança uma etapa na cadência (o banco ajusta prazo e status)
  const advanceLead = async (lead: TodooLead) => {
    if (!profile) return;
    const next = nextTodooStage(resolveTodooLeadStage(lead, stages), stages);
    if (!next) {
      await markContacted(lead);
      return;
    }
    if (savingIds.has(lead.id)) return;
    setSaving(lead.id, true);
    try {
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({ stage_id: next.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;
      await (supabase.from("todoo_events") as any).insert({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        company_id: lead.company_id,
        user_id: profile.id,
        event_type: next.kind === "attempt" ? "cadence_attempt" : "cadence_moved",
        notes: `Movido para ${next.name} pelo Meu Dia`,
        metadata: { from: lead.stage_id ?? null, to: next.id },
      });
      toast.success(`${lead.contact_name}: ${next.name}`);
      refresh();
    } catch (err: any) {
      toast.error("Erro ao registrar tentativa: " + err.message);
    } finally {
      setSaving(lead.id, false);
    }
  };

  const attemptLabel = (lead: TodooLead) =>
    todooStageActionLabel(resolveTodooLeadStage(lead, stages), stages);

  const completeTask = async (task: CrmTask) => {
    if (savingIds.has(task.id)) return;
    setSaving(task.id, true);
    try {
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);
      if (error) throw error;
      toast.success("Tarefa concluída");
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
    } catch (err: any) {
      toast.error("Erro ao concluir tarefa: " + err.message);
    } finally {
      setSaving(task.id, false);
    }
  };

  const openOutcome = (lead: TodooLead, type: TodooOutcomeType) => {
    setOutcomeType(type);
    setLeadForOutcome(lead);
  };

  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className={cn("flex flex-col gap-5", !embedded && "xl:h-full xl:min-h-0")}>
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : plan ? (
        <>
          <div
            className={cn(
              "grid grid-cols-1 gap-4",
              !embedded && "xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_320px]",
            )}
          >
            <DayQueue
              fill={!embedded}
              title={embedded ? "Fila de hoje" : "Meu Dia"}
              dateLabel={
                embedded ? undefined : `${todayLabel.charAt(0).toUpperCase()}${todayLabel.slice(1)}`
              }
              refreshing={isFetching}
              onRefresh={() => refetch()}
              items={queue}
              renderRow={(item) => {
                if (item.kind === "task") {
                  return (
                    <QueueRow
                      key={`task-${item.task.id}`}
                      item={item}
                      saving={savingIds.has(item.task.id)}
                      doneLabel="Concluir"
                      onDone={() => completeTask(item.task)}
                    />
                  );
                }
                const lead = item.lead;
                const isCadence = item.kind === "first" || item.kind === "attempt";
                return (
                  <QueueRow
                    key={`lead-${lead.id}`}
                    item={item}
                    saving={savingIds.has(lead.id)}
                    doneLabel={
                      isCadence
                        ? attemptLabel(lead)
                        : item.kind === "callback"
                          ? "Retornei"
                          : "Chamei"
                    }
                    onDone={() => (isCadence ? advanceLead(lead) : markContacted(lead))}
                    onMessage={() => setMessageLead(lead)}
                    onOutcome={(t) => openOutcome(lead, t)}
                  />
                );
              }}
            />

            <div className="flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
              <DaySummary plan={plan} />
              <CaptureCard
                plan={plan}
                canCreate={!viewingOther}
                onCreate={onCreateContactsClick}
                onConfigure={isManagerOrAdmin ? () => setGoalsOpen(true) : undefined}
              />
            </div>
          </div>
        </>
      ) : null}

      <TodooGoalsDialog
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
        }}
      />

      <TodooSendMessageDialog
        lead={messageLead}
        nextStage={messageNextStage}
        open={!!messageLead}
        onOpenChange={(open) => !open && setMessageLead(null)}
        onSent={refresh}
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
    <Card className="p-4 space-y-3 bg-primary/5 border-primary/20">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
          <CalendarCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Meta do dia</h3>
          <p className="text-[11px] text-muted-foreground">
            {plan.total === 0
              ? "Nenhuma tarefa para hoje"
              : remaining === 0
                ? "Dia concluído!"
                : `${remaining} ${remaining === 1 ? "tarefa pendente" : "tarefas pendentes"}`}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {plan.done} de {plan.total}
          </span>
          <span className="font-medium text-foreground">{progress}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SummaryStat label="Trabalhados hoje" value={plan.workedToday} />
        <SummaryStat label="Atrasados" value={plan.overdue} danger={plan.overdue > 0} />
      </div>
    </Card>
  );
}

function SummaryStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-1.5 text-center">
      <div className={cn("text-lg font-bold leading-tight", danger && "text-destructive")}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</div>
    </div>
  );
}

function CaptureCard({
  plan,
  canCreate,
  onCreate,
  onConfigure,
}: {
  plan: DayPlan;
  canCreate: boolean;
  onCreate?: () => void;
  onConfigure?: () => void;
}) {
  const hasGoal = plan.capturePeriod !== null;
  const monthly = plan.capturePeriod === "monthly";
  const reached =
    hasGoal &&
    (monthly
      ? plan.captureMonthDone >= plan.captureMonthTarget
      : plan.captureDone >= plan.captureTarget);
  const remaining = Math.max(0, plan.captureTarget - plan.captureDone);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink-500/10 text-pink-500">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Cadastrar contatos</h3>
            <p className="text-[11px] text-muted-foreground">
              {hasGoal
                ? `Meta ${monthly ? "mensal" : "diária"} · prospecção e indicações`
                : "Prospecção e indicações"}
            </p>
          </div>
        </div>
        {onConfigure && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            title={hasGoal ? "Ajustar meta" : "Definir meta"}
            onClick={onConfigure}
          >
            <Target className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Meta de hoje</div>
          <div className="text-xl font-bold leading-tight">
            {hasGoal ? plan.captureTarget : "—"}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Cadastrados hoje</div>
          <div className={cn("text-xl font-bold leading-tight", reached && "text-emerald-600")}>
            {plan.captureDone}
          </div>
        </div>
      </div>

      {hasGoal ? (
        <div className="space-y-1.5">
          <Progress value={pct(plan.captureDone, plan.captureTarget)} className="h-1.5" />
          <div className="flex items-baseline justify-between text-[11px]">
            {reached ? (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                {monthly ? "Meta do mês batida" : "Meta do dia batida"}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {remaining > 0 ? `Faltam ${remaining} hoje` : "Meta de hoje batida"}
              </span>
            )}
            {monthly && (
              <span className="text-muted-foreground">
                Mês: <strong className="text-foreground">{plan.captureMonthDone}</strong> /{" "}
                {plan.captureMonthTarget}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sem meta de cadastros definida para este mês · {plan.captureMonthDone} no mês.
        </p>
      )}

      {canCreate && onCreate && (
        <Button size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={onCreate}>
          <UserPlus className="h-3.5 w-3.5" />
          Cadastrar contato
        </Button>
      )}
    </Card>
  );
}

type QueueKind = "callback" | "first" | "attempt" | "followup" | "task";

type QueueItem =
  | {
      kind: Exclude<QueueKind, "task">;
      lead: TodooLead;
      due: string | null;
      tag: string;
      stage?: string;
      /** Vence depois de hoje: fica em Próximos dias, fora do total do dia */
      upcoming?: boolean;
    }
  | { kind: "task"; task: CrmTask; due: string | null; tag: string };

const QUEUE_KINDS: Record<QueueKind, { label: string; icon: typeof Clock; className: string }> = {
  callback: {
    label: "Retornos",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  first: {
    label: "A contatar",
    icon: Flame,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  attempt: {
    label: "Tentativas",
    icon: Repeat,
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  },
  followup: {
    label: "Follow-up",
    icon: MessageSquare,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  },
  task: {
    label: "Tarefas",
    icon: ClipboardList,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
};
const QUEUE_ORDER: QueueKind[] = ["callback", "first", "attempt", "followup", "task"];

/**
 * Tudo o que a pessoa tem para fazer hoje numa fila só, pela ordem do prazo
 * (atrasados primeiro). Na cadência a tag é a etapa em que o lead está; retorno e
 * follow-up mostram a etapa ao lado do prazo.
 */
function buildQueue(
  plan: DayPlan,
  stages: ReturnType<typeof useTodooPipeline>["stages"],
): QueueItem[] {
  const followupDue = (lead: TodooLead) =>
    lead.last_interaction_at
      ? new Date(
          new Date(lead.last_interaction_at).getTime() + FOLLOWUP_AFTER_HOURS * 3600 * 1000,
        ).toISOString()
      : null;
  const stageName = (lead: TodooLead) => resolveTodooLeadStage(lead, stages)?.name;

  const items: QueueItem[] = [
    ...plan.callbacks.map((lead) => ({
      kind: "callback" as const,
      lead,
      due: lead.callback_scheduled_at,
      tag: "Retorno",
      stage: stageName(lead),
    })),
    ...plan.toContact.map((lead) => ({
      kind: "first" as const,
      lead,
      due: lead.sla_deadline,
      tag: stageName(lead) || "A contatar",
    })),
    ...plan.upcoming.map((lead) => ({
      kind: "first" as const,
      lead,
      due: lead.sla_deadline,
      tag: stageName(lead) || "A contatar",
      upcoming: true,
    })),
    ...plan.attempts.map((lead) => ({
      kind: "attempt" as const,
      lead,
      due: lead.next_action_at,
      tag: stageName(lead) || "Tentativa",
    })),
    ...plan.followups.map((lead) => ({
      kind: "followup" as const,
      lead,
      due: followupDue(lead),
      tag: "Follow-up",
      stage: stageName(lead),
    })),
    ...plan.crmTasks.map((task) => ({
      kind: "task" as const,
      task,
      due: task.due_date,
      tag: "Tarefa",
    })),
  ];

  // Sem prazo conta como "agora"; empate segue a ordem dos tipos
  const time = (item: QueueItem) => (item.due ? new Date(item.due).getTime() : Date.now());
  return items.sort(
    (a, b) => time(a) - time(b) || QUEUE_ORDER.indexOf(a.kind) - QUEUE_ORDER.indexOf(b.kind),
  );
}

function DayQueue({
  items,
  renderRow,
  fill,
  title,
  dateLabel,
  refreshing,
  onRefresh,
}: {
  items: QueueItem[];
  renderRow: (item: QueueItem) => ReactNode;
  /** Ocupa a altura disponível e rola por dentro (tela do Meu Dia) */
  fill?: boolean;
  title: string;
  /** Data por extenso; no Painel da Equipe fica de fora */
  dateLabel?: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<QueueKind | "all">("all");
  const counts = useMemo(() => {
    const c: Record<QueueKind, number> = {
      callback: 0,
      first: 0,
      attempt: 0,
      followup: 0,
      task: 0,
    };
    for (const item of items) c[item.kind] += 1;
    return c;
  }, [items]);
  // Tipo filtrado que acabou (último item concluído) volta para Todos
  const activeFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const filtered =
    activeFilter === "all" ? items : items.filter((item) => item.kind === activeFilter);
  const overdue = items.filter(isLate).length;
  // Atrasados, o que vence hoje e o que vence depois (a fila já vem pela ordem do prazo)
  const isUpcoming = (item: QueueItem) => item.kind !== "task" && !!item.upcoming;
  const sections = [
    { key: "late", label: "Atrasados", items: filtered.filter(isLate) },
    {
      key: "today",
      label: "Para hoje",
      items: filtered.filter((item) => !isLate(item) && !isUpcoming(item)),
    },
    { key: "upcoming", label: "Próximos dias", items: filtered.filter(isUpcoming) },
  ];

  const chip = (value: QueueKind | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        activeFilter === value
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <span className={cn("tabular-nums font-semibold", filter !== value && "text-foreground")}>
        {count}
      </span>
    </button>
  );

  return (
    <Card className={cn("flex flex-col overflow-hidden", fill && "xl:min-h-0 xl:h-full")}>
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            <p className="text-[11px] text-muted-foreground">
              {dateLabel ? `${dateLabel} · ` : ""}tarefas comerciais de hoje pela ordem do prazo
              {overdue > 0 ? ` · ${overdue} atrasado${overdue > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Atualizar"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chip("all", "Todos", items.length)}
          {QUEUE_ORDER.filter((kind) => counts[kind] > 0).map((kind) =>
            chip(kind, QUEUE_KINDS[kind].label, counts[kind]),
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="flex items-center justify-center gap-1.5 px-4 py-10 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-500" />
          {items.length === 0 ? "Nada pendente para hoje." : "Nada pendente neste filtro."}
        </p>
      ) : (
        <div className={cn(fill && "xl:min-h-0 xl:flex-1 xl:overflow-y-auto")}>
          {sections.map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.key}>
                <h4
                  className={cn(
                    "sticky top-0 z-10 border-b bg-muted/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide backdrop-blur",
                    section.key === "late" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {section.label} · {section.items.length}
                </h4>
                <div className="divide-y divide-border/60">{section.items.map(renderRow)}</div>
              </section>
            ),
          )}
        </div>
      )}
    </Card>
  );
}

/** Atrasado: passou do prazo (follow-up não tem prazo, só o tempo sem resposta). */
function isLate(item: QueueItem) {
  return item.kind !== "followup" && !!item.due && new Date(item.due).getTime() < Date.now();
}

/** Prazo do item no canto da linha: atrasado em vermelho, senão o horário. */
function DueBadge({ item }: { item: QueueItem }) {
  if (item.kind === "followup") {
    const last = item.lead.last_interaction_at;
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {last
          ? `Sem resposta ${formatDistanceToNow(new Date(last), { addSuffix: true, locale: ptBR })}`
          : "Sem contato"}
      </span>
    );
  }
  if (!item.due)
    return <span className="shrink-0 text-[11px] text-muted-foreground">Sem prazo</span>;
  const date = new Date(item.due);
  if (isLate(item)) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-destructive"
        title={`Prazo: ${format(date, "dd/MM 'às' HH:mm")}`}
      >
        <AlertTriangle className="h-3 w-3" />
        Atrasado {formatDistanceToNow(date, { locale: ptBR })}
      </span>
    );
  }
  const today = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <Clock className="h-3 w-3" />
      {today ? `Hoje, ${format(date, "HH:mm")}` : format(date, "dd/MM 'às' HH:mm")}
    </span>
  );
}

function QueueRow({
  item,
  saving,
  doneLabel,
  onDone,
  onMessage,
  onOutcome,
}: {
  item: QueueItem;
  saving: boolean;
  doneLabel: string;
  onDone: () => void;
  onMessage?: () => void;
  onOutcome?: (type: TodooOutcomeType) => void;
}) {
  const kind = QUEUE_KINDS[item.kind];
  const Icon = kind.icon;
  const lead = item.kind === "task" ? null : item.lead;
  const task = item.kind === "task" ? item.task : null;

  const name = lead ? lead.contact_name : task?.contacts?.name || task?.title || "Tarefa";
  const phone = lead ? lead.contact_phone : task?.contacts?.phone;
  const contactId = lead ? lead.contact_id : task?.contact_id;
  const referrer = lead?.custom_fields?.indicadora;
  const interest = lead?.custom_fields?.servico;

  // Uma linha de contexto, separada por "·": telefone, ação, etapa, indicação, interesse
  const details: ReactNode[] = [];
  if (phone) details.push(formatTodooPhone(phone));
  if (task?.contacts?.name) details.push(task.title);
  if (task?.description) details.push(task.description);
  if (lead?.campaign?.title) details.push(lead.campaign.title);
  if (item.kind !== "task" && item.stage) details.push(`Etapa: ${item.stage}`);
  if (referrer) {
    details.push(
      <>
        Indicada por{" "}
        <TodooReferrerLink name={referrer} contactId={lead?.custom_fields?.indicadora_id} />
      </>,
    );
  }
  if (interest) details.push(`Interesse: ${interest}`);

  return (
    <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <div
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
          kind.className,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{name}</span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-px text-[10px] font-medium",
                  kind.className,
                )}
                title={item.tag}
              >
                {item.tag}
              </span>
            </div>
            {details.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                {details.map((d, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {d}
                  </span>
                ))}
              </p>
            )}
          </div>
          <DueBadge item={item} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(contactId || phone) && (
            <ContactChatButton
              contactId={contactId}
              contactName={name}
              phone={phone}
              unitId={lead?.unit_id ?? task?.unit_id}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-xs"
                  title="Abrir a conversa"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-primary" />
                  Conversa
                </Button>
              }
            />
          )}
          {onMessage && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              title="Enviar a mensagem da ação"
              onClick={onMessage}
            >
              <Send className="h-3.5 w-3.5 text-emerald-500" />
              Mensagem
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {onOutcome && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                    Desfecho
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {OUTCOME_OPTIONS.map((o) => (
                    <DropdownMenuItem
                      key={o.value}
                      className="text-xs"
                      onClick={() => onOutcome(o.value)}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={onDone}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {doneLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const OUTCOME_OPTIONS: { value: TodooOutcomeType; label: string }[] = [
  { value: "scheduled", label: "Agendou" },
  { value: "won", label: "Fechou" },
  { value: "quoted", label: "Orçamento" },
  { value: "callback", label: "Retornar" },
  { value: "lost", label: "Sem interesse" },
];
