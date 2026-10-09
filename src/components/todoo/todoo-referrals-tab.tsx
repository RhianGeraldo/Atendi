import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gift,
  Plus,
  Users,
  Target,
  CheckCircle2,
  Clock,
  Sparkles,
  Phone,
  MessageSquare,
  Award,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { TodooReferral, TodooGoal } from "@/types/todoo";
import { TodooCreateReferralDialog } from "./todoo-create-referral-dialog";
import { TodooGoalsDialog } from "./todoo-goals-dialog";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { toast } from "sonner";

export function TodooReferralsTab() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();

  const [createReferralOpen, setCreateReferralOpen] = useState(false);
  const [goalsDialogOpen, setGoalsDialogOpen] = useState(false);
  const currentMonthYear = new Date().toISOString().slice(0, 7);

  const canManage =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  // Busca lista de indicações
  const { data: referrals = [], isLoading: loadingReferrals, refetch: refetchReferrals } = useQuery({
    queryKey: ["todoo-referrals-list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_referrals") as any)
        .select(`
          *,
          captured_by:profiles(id, name, avatar_url)
        `)
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TodooReferral[];
    },
  });

  // Busca metas e realizações do mês atual
  const { data: goalsData, isLoading: loadingGoals, refetch: refetchGoals } = useQuery({
    queryKey: ["todoo-goals-overview", activeCompanyId, currentMonthYear, profile?.id],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // 1. Metas do mês
      const { data: goals } = await (supabase.from("todoo_goals") as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("month_year", currentMonthYear);

      // 2. Contagem de cadastros de contatos no mês por usuário
      const firstDay = `${currentMonthYear}-01T00:00:00Z`;
      const { data: monthReferrals } = await (supabase.from("todoo_referrals") as any)
        .select("id, captured_by_user_id, status")
        .eq("company_id", activeCompanyId)
        .gte("created_at", firstDay);

      const countByUser: Record<string, number> = {};
      (monthReferrals || []).forEach((r: any) => {
        if (r.captured_by_user_id) {
          countByUser[r.captured_by_user_id] = (countByUser[r.captured_by_user_id] || 0) + 1;
        }
      });

      // Meta da consultora logada
      const myGoal = (goals || []).find((g: any) => g.user_id === profile?.id);
      const myCaptured = countByUser[profile?.id || ""] || 0;
      const myTarget = myGoal?.target_contacts || 20;

      // Total da empresa
      const totalTarget = (goals || []).reduce((acc: number, curr: any) => acc + (curr.target_contacts || 0), 0) || 50;
      const totalCaptured = (monthReferrals || []).length;

      return {
        myCaptured,
        myTarget,
        totalCaptured,
        totalTarget,
        monthReferralsCount: (monthReferrals || []).length,
      };
    },
  });

  // Atualizar status da recompensa da indicadora (ex: marcar como resgatada)
  const handleUpdateRewardStatus = async (referralId: string, nextStatus: "granted" | "claimed") => {
    try {
      const { error } = await (supabase.from("todoo_referrals") as any)
        .update({
          reward_status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", referralId);

      if (error) throw error;
      toast.success(
        nextStatus === "granted"
          ? "Crédito da indicadora liberado!"
          : "Bônus marcado como resgatado pela cliente!"
      );
      refetchReferrals();
    } catch (err: any) {
      toast.error("Erro ao atualizar recompensa: " + err.message);
    }
  };

  const myProgress = goalsData ? Math.min(100, Math.round((goalsData.myCaptured / goalsData.myTarget) * 100)) : 0;
  const companyProgress = goalsData ? Math.min(100, Math.round((goalsData.totalCaptured / goalsData.totalTarget) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Cards de Metas de Cadastro de Contatos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minha Meta Individual */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                Minha Meta de Cadastros ({currentMonthYear})
              </span>
              <CardTitle className="text-xl font-bold">
                {goalsData?.myCaptured || 0} / {goalsData?.myTarget || 20}{" "}
                <span className="text-xs font-normal text-muted-foreground">indicações</span>
              </CardTitle>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2">
            <Progress value={myProgress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{myProgress}% da sua meta atingida</span>
              <span>Faltam {Math.max(0, (goalsData?.myTarget || 20) - (goalsData?.myCaptured || 0))} contatos</span>
            </div>
          </CardContent>
        </Card>

        {/* Meta Geral da Equipe */}
        <Card>
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Meta Geral da Equipe (Mês)
              </span>
              <CardTitle className="text-xl font-bold">
                {goalsData?.totalCaptured || 0} / {goalsData?.totalTarget || 50}{" "}
                <span className="text-xs font-normal text-muted-foreground">novos leads</span>
              </CardTitle>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGoalsDialogOpen(true)}
                className="h-8 text-xs gap-1"
              >
                <Target className="h-3.5 w-3.5" />
                Ajustar Metas
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2">
            <Progress value={companyProgress} className="h-2 bg-muted" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{companyProgress}% do objetivo da clínica</span>
              <span>Total no mês: {goalsData?.totalCaptured || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações e Título da Tabela */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Indicações Captadas (Desafio 3 Amigas)
          </h3>
          <p className="text-xs text-muted-foreground">
            Acompanhe as clientes indicadoras, amigas presenteadas e liberação de créditos.
          </p>
        </div>

        <Button
          onClick={() => setCreateReferralOpen(true)}
          className="gap-2 bg-pink-600 hover:bg-pink-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4" />
          Cadastrar Indicação
        </Button>
      </div>

      {/* Tabela de Indicações */}
      {loadingReferrals ? (
        <div className="p-12 text-center text-xs text-muted-foreground">
          Carregando indicações...
        </div>
      ) : referrals.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pink-500/10 text-pink-600">
            <Gift className="h-6 w-6" />
          </div>
          <h4 className="text-base font-semibold mt-3">Nenhuma indicação cadastrada ainda</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
            Aproveite o momento de pico de satisfação da cliente em cabine e cadastre 3 amigas para ganhar bônus e bater sua meta de contatos!
          </p>
          <Button
            onClick={() => setCreateReferralOpen(true)}
            className="mt-4 gap-2 bg-pink-600 hover:bg-pink-700 text-white"
          >
            <Plus className="h-4 w-4" />
            Cadastrar 3 Amigas
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {referrals.map((ref) => {
            return (
              <Card key={ref.id} className="hover:border-primary/40 transition-all">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Informações da Indicadora e Indicada */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {ref.referred_name}
                      </span>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        Indicada por: <strong>{ref.referrer_name}</strong>
                      </Badge>

                      {/* Status da Indicada */}
                      <Badge
                        className={
                          ref.status === "won"
                            ? "bg-emerald-600 text-white"
                            : ref.status === "scheduled"
                            ? "bg-blue-600 text-white"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {ref.status === "won"
                          ? "✓ Fechou Pacote!"
                          : ref.status === "scheduled"
                          ? "Agendou Avaliação"
                          : "Aguardando Contato"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {ref.referred_phone}
                      </span>

                      {ref.interested_service && (
                        <span>Interesse: {ref.interested_service}</span>
                      )}

                      <span>
                        Voucher: <strong>{ref.voucher_code} (R$ {ref.voucher_value})</strong>
                      </span>

                      {ref.captured_by && (
                        <span>Captado por: {ref.captured_by.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Status da Recompensa da Indicadora & Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    {ref.reward_status === "claimed" ? (
                      <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                        ✓ Recompensa Resgatada
                      </Badge>
                    ) : ref.reward_status === "granted" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateRewardStatus(ref.id, "claimed")}
                        className="text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                      >
                        Marcar Resgate (R$ 50)
                      </Button>
                    ) : ref.status === "won" ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleUpdateRewardStatus(ref.id, "granted")}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Liberar Crédito
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Crédito pendente (aguarda fechamento)
                      </span>
                    )}

                    <StartConversationDialog
                      initialPhone={ref.referred_phone}
                      contactName={ref.referred_name}
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Iniciar atendimento no Atendi"
                          className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro de Indicação */}
      <TodooCreateReferralDialog
        open={createReferralOpen}
        onOpenChange={setCreateReferralOpen}
        onSuccess={() => {
          refetchReferrals();
          refetchGoals();
          queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
        }}
      />

      {/* Modal de Gestão de Metas */}
      <TodooGoalsDialog
        open={goalsDialogOpen}
        onOpenChange={setGoalsDialogOpen}
        onSuccess={() => {
          refetchGoals();
        }}
      />
    </div>
  );
}
