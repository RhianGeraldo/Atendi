import { Fragment, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Flame, ListTodo, Trophy, BarChart3, UserPlus, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { TodooDailyQueue } from "@/components/todoo/todoo-daily-queue";
import { TodooMyDay } from "@/components/todoo/todoo-my-day";
import { TodooTeamPanel } from "@/components/todoo/todoo-team-panel";
import { useAuth } from "@/lib/auth-context";
import { getTodooTabs, type TodooTab } from "@/lib/permissions";
import { TodooCampaignsList } from "@/components/todoo/todoo-campaigns-list";
import { TodooGincana } from "@/components/todoo/todoo-gincana";
import { TodooMetrics } from "@/components/todoo/todoo-metrics";
import { TodooReferralsTab } from "@/components/todoo/todoo-referrals-tab";
import { TodooCreateCampaignDialog } from "@/components/todoo/todoo-create-campaign-dialog";
import { TodooCreateReferralDialog } from "@/components/todoo/todoo-create-referral-dialog";

export const Route = createFileRoute("/_authenticated/todoo")({
  component: TodooPage,
});

// Cada aba depende da permissão "todoo:<perm>" do cargo/perfil (Configurações → Cargos).
// Operação: o dia a dia da consultora. Gestão: acompanhamento e configuração.
const TABS: { value: string; perm: TodooTab; label: string; icon: typeof Flame; group: "operation" | "management" }[] = [
  { value: "my-day", perm: "my_day", label: "Meu Dia", icon: CalendarCheck, group: "operation" },
  { value: "queue", perm: "queue", label: "Quadro Comercial", icon: Flame, group: "operation" },
  { value: "team", perm: "team", label: "Painel da Equipe", icon: Users, group: "management" },
  { value: "referrals", perm: "referrals", label: "Cadastros & Metas", icon: UserPlus, group: "management" },
  { value: "campaigns", perm: "campaigns", label: "Ações Comerciais", icon: ListTodo, group: "management" },
  { value: "gincana", perm: "gincana", label: "Gincana & Ranking", icon: Trophy, group: "management" },
  { value: "metrics", perm: "metrics", label: "Indicadores", icon: BarChart3, group: "management" },
];

function TodooPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const allowedTabs = useMemo(() => getTodooTabs(profile), [profile]);
  const visibleTabs = TABS.filter((tab) => allowedTabs.includes(tab.perm));
  const can = (perm: TodooTab) => allowedTabs.includes(perm);
  const [activeTab, setActiveTab] = useState("my-day");

  // Abre na primeira aba permitida
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(visibleTabs[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTabs.join(","), activeTab]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createReferralOpen, setCreateReferralOpen] = useState(false);

  const tabs = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-full">
      <TabsList className="h-auto p-1 bg-muted/70 max-w-full overflow-x-auto justify-start">
        {visibleTabs.map((tab, index) => (
          <Fragment key={tab.value}>
            {/* Divisor entre as abas do dia a dia e as de gestão */}
            {index > 0 && tab.group !== visibleTabs[index - 1].group && (
              <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
            )}
            <TabsTrigger value={tab.value} className="gap-2 py-1.5 text-xs shrink-0">
              <tab.icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </TabsTrigger>
          </Fragment>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <ProtectedMenuRoute menuKey="todoo">
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {visibleTabs.length === 0 ? (
          <div className="flex-1 p-6 flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground max-w-sm">
              Seu cargo tem o Meu Todoo, mas nenhuma aba liberada. Peça a um administrador para ajustar em
              Configurações → Cargos.
            </p>
          </div>
        ) : activeTab === "queue" && can("queue") ? (
          // O Quadro Comercial monta uma barra única: abas + busca, filtros e ações
          <div className="flex-1 min-h-0 overflow-hidden">
            <TodooDailyQueue
              tabs={tabs}
              onCreateCampaignClick={can("campaigns") ? () => setCreateDialogOpen(true) : undefined}
              onCreateContactsClick={() => setCreateReferralOpen(true)}
            />
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-card/60 backdrop-blur-xs px-4 py-2.5 sm:px-6 shrink-0">
              {tabs}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 w-full">
              {activeTab === "my-day" && can("my_day") && (
                <TodooMyDay onCreateContactsClick={() => setCreateReferralOpen(true)} />
              )}
              {activeTab === "team" && can("team") && <TodooTeamPanel />}
              {activeTab === "referrals" && can("referrals") && <TodooReferralsTab />}
              {activeTab === "campaigns" && can("campaigns") && (
                <TodooCampaignsList onCreateClick={() => setCreateDialogOpen(true)} />
              )}
              {activeTab === "gincana" && can("gincana") && <TodooGincana />}
              {activeTab === "metrics" && can("metrics") && <TodooMetrics />}
            </div>
          </>
        )}

        {/* Wizard de Criação de Ação */}
        <TodooCreateCampaignDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={() => {
            // O cache de 5 min esconderia os leads novos no Quadro
            for (const key of ["todoo-leads", "todoo-my-day", "todoo-campaigns-list", "todoo-campaigns-filter"]) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
            setActiveTab("queue");
          }}
        />

        {/* Modal de Cadastro de Contatos */}
        <TodooCreateReferralDialog
          open={createReferralOpen}
          onOpenChange={setCreateReferralOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["todoo-referrals-list"] });
            queryClient.invalidateQueries({ queryKey: ["todoo-goals-overview"] });
            queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
            queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
          }}
        />
      </div>
    </ProtectedMenuRoute>
  );
}
