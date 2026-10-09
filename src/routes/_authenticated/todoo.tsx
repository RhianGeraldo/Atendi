import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Target,
  Flame,
  ListTodo,
  Trophy,
  BarChart3,
  Plus,
  Sparkles,
  Gift,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { useAuth } from "@/lib/auth-context";
import { TodooDailyQueue } from "@/components/todoo/todoo-daily-queue";
import { TodooCampaignsList } from "@/components/todoo/todoo-campaigns-list";
import { TodooGincana } from "@/components/todoo/todoo-gincana";
import { TodooMetrics } from "@/components/todoo/todoo-metrics";
import { TodooReferralsTab } from "@/components/todoo/todoo-referrals-tab";
import { TodooCreateCampaignDialog } from "@/components/todoo/todoo-create-campaign-dialog";
import { TodooCreateReferralDialog } from "@/components/todoo/todoo-create-referral-dialog";

export const Route = createFileRoute("/_authenticated/todoo")({
  component: TodooPage,
});

function TodooPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("queue");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createReferralOpen, setCreateReferralOpen] = useState(false);

  const canManage =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  return (
    <ProtectedMenuRoute menuKey="todoo">
      <div className="flex flex-col h-full overflow-hidden bg-background">
        {/* Barra Superior de Controles e Abas (Padrão limpo sem título duplicado) */}
        <div className="border-b border-border bg-card/60 backdrop-blur-xs px-4 py-2.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto h-auto p-1 bg-muted/70">
              <TabsTrigger value="queue" className="gap-2 py-1.5 text-xs">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span>Quadro Comercial</span>
              </TabsTrigger>

              <TabsTrigger value="referrals" className="gap-2 py-1.5 text-xs">
                <Gift className="h-3.5 w-3.5 text-pink-500" />
                <span>Indicações & Metas</span>
              </TabsTrigger>

              <TabsTrigger value="campaigns" className="gap-2 py-1.5 text-xs">
                <ListTodo className="h-3.5 w-3.5 text-primary" />
                <span>Ações Comerciais</span>
              </TabsTrigger>

              <TabsTrigger value="gincana" className="gap-2 py-1.5 text-xs">
                <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                <span>Gincana & Ranking</span>
              </TabsTrigger>

              <TabsTrigger value="metrics" className="gap-2 py-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Indicadores</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateReferralOpen(true)}
              className="gap-1.5 text-xs border-pink-500/30 text-pink-700 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 shrink-0 h-8"
            >
              <Gift className="h-3.5 w-3.5 text-pink-600" />
              Cadastrar Indicação
            </Button>

            {canManage && (
              <Button
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="gap-1.5 text-xs shadow-xs shrink-0 h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Ação Comercial
              </Button>
            )}
          </div>
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === "queue" ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <TodooDailyQueue
              onCreateCampaignClick={() => setCreateDialogOpen(true)}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {activeTab === "referrals" && <TodooReferralsTab />}
            {activeTab === "campaigns" && (
              <TodooCampaignsList
                onCreateClick={() => setCreateDialogOpen(true)}
              />
            )}
            {activeTab === "gincana" && <TodooGincana />}
            {activeTab === "metrics" && <TodooMetrics />}
          </div>
        )}

        {/* Wizard de Criação de Ação */}
        <TodooCreateCampaignDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={() => {
            setActiveTab("queue");
          }}
        />

        {/* Modal de Cadastro de Indicações */}
        <TodooCreateReferralDialog
          open={createReferralOpen}
          onOpenChange={setCreateReferralOpen}
          onSuccess={() => {
            setActiveTab("referrals");
          }}
        />
      </div>
    </ProtectedMenuRoute>
  );
}
