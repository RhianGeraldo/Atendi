import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, Plus, Target, Phone, MessageSquare, Megaphone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { TodooReferral, TodooGoalPeriod, TodooLeadStatus } from "@/types/todoo";
import { TodooCreateReferralDialog } from "./todoo-create-referral-dialog";
import { TodooGoalsDialog } from "./todoo-goals-dialog";
import { currentTodooMonth, formatTodooPhone, todooPeriodStarts } from "./todoo-period";
import { TodooSectionHeader } from "./todoo-section-header";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";

type OriginFilter = "all" | "indicacao" | "prospeccao";
type PeriodFilter = "day" | "month" | "all";

const LEAD_STATUS: Record<TodooLeadStatus, { label: string; className: string }> = {
  pending: { label: "Aguardando contato", className: "bg-muted text-muted-foreground" },
  contacted: {
    label: "Em negociação",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  callback: {
    label: "Retornar depois",
    className: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  },
  quoted: { label: "Orçamento enviado", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  scheduled: { label: "Agendou avaliação", className: "bg-blue-600 text-white" },
  won: { label: "Fechou", className: "bg-emerald-600 text-white" },
  lost: { label: "Sem interesse", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
};

interface GoalProgress {
  userId: string;
  userName: string;
  period: TodooGoalPeriod;
  target: number;
  done: number;
}

const periodLabel = (p: TodooGoalPeriod) => (p === "daily" ? "hoje" : "no mês");
const pct = (done: number, target: number) =>
  target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

export function TodooReferralsTab() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [goalsDialogOpen, setGoalsDialogOpen] = useState(false);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const currentMonth = currentTodooMonth();

  const canManage =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  // Lista de cadastros
  const {
    data: captures = [],
    isLoading: loadingCaptures,
    error: capturesError,
  } = useQuery({
    queryKey: ["todoo-referrals-list", activeCompanyId, selectedUnitId, originFilter, periodFilter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { dayStart, monthStart } = todooPeriodStarts();
      let query = (supabase.from("todoo_referrals") as any)
        .select(
          `
          *,
          captured_by:profiles(id, name, avatar_url),
          lead:todoo_leads(id, status)
        `,
        )
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false })
        .limit(300);

      if (selectedUnitId) query = query.eq("unit_id", selectedUnitId);
      if (originFilter !== "all") query = query.eq("origin", originFilter);
      if (periodFilter === "day") query = query.gte("created_at", dayStart);
      if (periodFilter === "month") query = query.gte("created_at", monthStart);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TodooReferral[];
    },
  });

  // Metas do mês e realizado por consultora
  const { data: goalsData } = useQuery({
    queryKey: ["todoo-goals-overview", activeCompanyId, currentMonth],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { dayStart, monthStart } = todooPeriodStarts();

      const [{ data: goals, error: gErr }, { data: monthCaptures, error: rErr }] =
        await Promise.all([
          (supabase.from("todoo_goals") as any)
            .select("user_id, target_contacts, contacts_period, user:profiles(id, name)")
            .eq("company_id", activeCompanyId)
            .eq("month_year", currentMonth)
            .gt("target_contacts", 0),
          (supabase.from("todoo_referrals") as any)
            .select("captured_by_user_id, created_at")
            .eq("company_id", activeCompanyId)
            .gte("created_at", monthStart),
        ]);
      if (gErr) throw gErr;
      if (rErr) throw rErr;

      const dayCount: Record<string, number> = {};
      const monthCount: Record<string, number> = {};
      for (const r of monthCaptures || []) {
        if (!r.captured_by_user_id) continue;
        monthCount[r.captured_by_user_id] = (monthCount[r.captured_by_user_id] || 0) + 1;
        if (r.created_at >= dayStart) {
          dayCount[r.captured_by_user_id] = (dayCount[r.captured_by_user_id] || 0) + 1;
        }
      }

      const team: GoalProgress[] = (goals || [])
        .map((g: any) => {
          const period: TodooGoalPeriod = g.contacts_period === "daily" ? "daily" : "monthly";
          return {
            userId: g.user_id,
            userName: g.user?.name || "—",
            period,
            target: g.target_contacts,
            done: (period === "daily" ? dayCount : monthCount)[g.user_id] || 0,
          };
        })
        .sort((a: GoalProgress, b: GoalProgress) => pct(b.done, b.target) - pct(a.done, a.target));

      const myId = profile?.id || "";
      return {
        team,
        myGoal: team.find((t) => t.userId === myId) || null,
        myToday: dayCount[myId] || 0,
        myMonth: monthCount[myId] || 0,
      };
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["todoo-referrals-list"] });
    queryClient.invalidateQueries({ queryKey: ["todoo-goals-overview"] });
    queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
  };

  const myGoal = goalsData?.myGoal;

  return (
    <div className="space-y-6">
      <TodooSectionHeader
        title="Cadastros & Metas"
        description="Contatos de prospecção ativa e indicações que alimentam o Quadro Comercial."
        actions={
          <>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGoalsDialogOpen(true)}
                className="h-8 text-xs gap-1.5"
              >
                <Target className="h-3.5 w-3.5" />
                Ajustar Metas
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Cadastrar Contatos
            </Button>
          </>
        }
      />

      {/* Metas de cadastro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minha meta */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                {myGoal
                  ? `Minha meta ${myGoal.period === "daily" ? "diária" : "mensal"} de cadastros`
                  : "Meus cadastros"}
              </span>
              <CardTitle className="text-xl font-bold">
                {myGoal ? (
                  <>
                    {myGoal.done} / {myGoal.target}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {periodLabel(myGoal.period)}
                    </span>
                  </>
                ) : (
                  <>
                    {goalsData?.myMonth || 0}{" "}
                    <span className="text-xs font-normal text-muted-foreground">no mês</span>
                  </>
                )}
              </CardTitle>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2">
            {myGoal ? (
              <>
                <Progress value={pct(myGoal.done, myGoal.target)} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {myGoal.done >= myGoal.target
                      ? "Meta batida! 🎉"
                      : `Faltam ${myGoal.target - myGoal.done} ${periodLabel(myGoal.period)}`}
                  </span>
                  <span>
                    {myGoal.period === "daily"
                      ? `No mês: ${goalsData?.myMonth || 0}`
                      : `Hoje: ${goalsData?.myToday || 0}`}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Hoje: {goalsData?.myToday || 0} · Nenhuma meta definida para você neste mês.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Equipe */}
        <Card>
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Metas da equipe ({currentMonth})
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            {!goalsData?.team.length ? (
              <p className="text-xs text-muted-foreground py-2">Nenhuma meta definida neste mês.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {goalsData.team.map((g) => (
                  <div key={g.userId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium truncate">{g.userName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {g.done} / {g.target} {periodLabel(g.period)}
                      </span>
                    </div>
                    <Progress value={pct(g.done, g.target)} className="h-1.5 bg-muted" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Título, filtros e ação */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Contatos Cadastrados</h3>
          <p className="text-xs text-muted-foreground">
            Prospecção ativa e indicações. O status acompanha o Quadro Comercial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={originFilter} onValueChange={(v) => setOriginFilter(v as OriginFilter)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-6">
                Todos
              </TabsTrigger>
              <TabsTrigger value="indicacao" className="text-xs h-6">
                Indicações
              </TabsTrigger>
              <TabsTrigger value="prospeccao" className="text-xs h-6">
                Prospecção
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs h-6">
                Hoje
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs h-6">
                Este mês
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs h-6">
                Tudo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Lista */}
      {loadingCaptures ? (
        <div className="p-12 text-center text-xs text-muted-foreground">
          Carregando cadastros...
        </div>
      ) : capturesError ? (
        <Card className="p-8 text-center border-destructive/40">
          <h4 className="text-sm font-semibold text-destructive">
            Não foi possível carregar os cadastros
          </h4>
          <p className="text-xs text-muted-foreground mt-1">{(capturesError as Error).message}</p>
        </Card>
      ) : captures.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <UserPlus className="h-6 w-6" />
          </div>
          <h4 className="text-base font-semibold mt-3">Nenhum contato cadastrado neste filtro</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
            Cadastre contatos de prospecção ativa ou peça indicações às clientes para alimentar o
            Quadro Comercial e bater sua meta.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="mt-4 gap-2"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Contatos
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {captures.map((c) => {
            const status = c.lead ? LEAD_STATUS[c.lead.status] : null;
            return (
              <Card key={c.id} className="hover:border-primary/40 transition-all">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {c.referred_name}
                      </span>
                      {c.origin === "indicacao" ? (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-normal gap-1 border-pink-500/30"
                        >
                          <Gift className="h-3 w-3 text-pink-600" />
                          Indicada por: <strong>{c.referrer_name}</strong>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-normal gap-1">
                          <Megaphone className="h-3 w-3 text-primary" />
                          Prospecção ativa
                        </Badge>
                      )}
                      {status && (
                        <Badge className={`text-[11px] ${status.className}`}>{status.label}</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {formatTodooPhone(c.referred_phone)}
                      </span>
                      {c.interested_service && <span>Interesse: {c.interested_service}</span>}
                      {c.captured_by && <span>Captado por: {c.captured_by.name}</span>}
                      <span>
                        {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>

                  <StartConversationDialog
                    initialPhone={c.referred_phone}
                    contactName={c.referred_name}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Iniciar atendimento no Atendi"
                        className="h-8 w-8 p-0 shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TodooCreateReferralDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refreshAll}
      />

      <TodooGoalsDialog
        open={goalsDialogOpen}
        onOpenChange={setGoalsDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["todoo-goals-overview"] })}
      />
    </div>
  );
}
