import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Flame, ListTodo, Trophy, BarChart3, UserPlus, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { TodooDailyQueue } from "@/components/todoo/todoo-daily-queue";
import { TodooMyDay } from "@/components/todoo/todoo-my-day";
import { TodooTeamPanel } from "@/components/todoo/todoo-team-panel";
import { useAuth } from "@/lib/auth-context";
import { TodooCampaignsList } from "@/components/todoo/todoo-campaigns-list";
import { TodooGincana } from "@/components/todoo/todoo-gincana";
import { TodooMetrics } from "@/components/todoo/todoo-metrics";
import { TodooReferralsTab } from "@/components/todoo/todoo-referrals-tab";
import { TodooCreateCampaignDialog } from "@/components/todoo/todoo-create-campaign-dialog";
import { TodooCreateReferralDialog } from "@/components/todoo/todoo-create-referral-dialog";

export const Route = createFileRoute("/_authenticated/todoo")({
  component: TodooPage,
});

const TABS = [
  { value: "my-day", label: "Meu Dia", icon: CalendarCheck },
  { value: "team", label: "Painel da Equipe", icon: Users, managersOnly: true },
  { value: "queue", label: "Quadro Comercial", icon: Flame },
  { value: "referrals", label: "Cadastros & Metas", icon: UserPlus },
  { value: "campaigns", label: "Ações Comerciais", icon: ListTodo },
  { value: "gincana", label: "Gincana & Ranking", icon: Trophy },
  { value: "metrics", label: "Indicadores", icon: BarChart3 },
];

function TodooPage() {
  const { profile } = useAuth();
  const isManagerOrAdmin =
    profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager";
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("my-day");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createReferralOpen, setCreateReferralOpen] = useState(false);

  const tabs = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-full">
      <TabsList className="h-auto p-1 bg-muted/70 max-w-full overflow-x-auto justify-start">
        {TABS.filter((tab) => !tab.managersOnly || isManagerOrAdmin).map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="gap-2 py-1.5 text-xs shrink-0">
            <tab.icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <ProtectedMenuRoute menuKey="todoo">
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {activeTab === "queue" ? (
          // O Quadro Comercial monta uma barra única: abas + busca, filtros e ações
          <div className="flex-1 min-h-0 overflow-hidden">
            <TodooDailyQueue
              tabs={tabs}
              onCreateCampaignClick={() => setCreateDialogOpen(true)}
              onCreateContactsClick={() => setCreateReferralOpen(true)}
            />
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-card/60 backdrop-blur-xs px-4 py-2.5 sm:px-6 shrink-0">
              {tabs}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 w-full">
              {activeTab === "my-day" && (
                <TodooMyDay onCreateContactsClick={() => setCreateReferralOpen(true)} />
              )}
              {activeTab === "team" && isManagerOrAdmin && <TodooTeamPanel />}
              {activeTab === "referrals" && <TodooReferralsTab />}
              {activeTab === "campaigns" && (
                <TodooCampaignsList onCreateClick={() => setCreateDialogOpen(true)} />
              )}
              {activeTab === "gincana" && <TodooGincana />}
              {activeTab === "metrics" && <TodooMetrics />}
            </div>
          </>
        )}

        {/* Wizard de Criação de Ação */}
        <TodooCreateCampaignDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={() => {
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
