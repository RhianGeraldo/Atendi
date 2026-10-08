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
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Meu Todoo
                </h1>
                <p className="text-xs text-muted-foreground">
                  CRM de execução comercial diária, listas quentes inteligentes e metas.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateReferralOpen(true)}
              className="gap-2 border-pink-500/30 text-pink-700 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 shrink-0"
            >
              <Gift className="h-4 w-4 text-pink-600" />
              Cadastrar Indicação
            </Button>

            {canManage && (
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="gap-2 shadow-xs shrink-0"
              >
                <Plus className="h-4 w-4" />
                Nova Ação Comercial
              </Button>
            )}
          </div>
        </div>

        {/* Abas do Módulo */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto h-auto p-1 bg-muted/60">
            <TabsTrigger value="queue" className="gap-2 py-2 text-xs">
              <Flame className="h-4 w-4 text-amber-500" />
              <span>Fila do Dia</span>
            </TabsTrigger>

            <TabsTrigger value="referrals" className="gap-2 py-2 text-xs">
              <Gift className="h-4 w-4 text-pink-500" />
              <span>Indicações & Metas</span>
            </TabsTrigger>

            <TabsTrigger value="campaigns" className="gap-2 py-2 text-xs">
              <ListTodo className="h-4 w-4 text-primary" />
              <span>Ações Comerciais</span>
            </TabsTrigger>

            <TabsTrigger value="gincana" className="gap-2 py-2 text-xs">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span>Gincana & Ranking</span>
            </TabsTrigger>

            <TabsTrigger value="metrics" className="gap-2 py-2 text-xs">
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              <span>Indicadores</span>
            </TabsTrigger>
          </TabsList>

          {/* Aba 1: Fila do Dia da Consultora */}
          <TabsContent value="queue" className="m-0 focus-visible:outline-none">
            <TodooDailyQueue
              onCreateCampaignClick={() => setCreateDialogOpen(true)}
            />
          </TabsContent>

          {/* Aba 2: Indicações & Metas de Cadastro (Desafio 3 Amigas) */}
          <TabsContent value="referrals" className="m-0 focus-visible:outline-none">
            <TodooReferralsTab />
          </TabsContent>

          {/* Aba 3: Gestão de Ações e Listas Quentes */}
          <TabsContent value="campaigns" className="m-0 focus-visible:outline-none">
            <TodooCampaignsList
              onCreateClick={() => setCreateDialogOpen(true)}
            />
          </TabsContent>

          {/* Aba 4: Gincana & Ranking */}
          <TabsContent value="gincana" className="m-0 focus-visible:outline-none">
            <TodooGincana />
          </TabsContent>

          {/* Aba 5: Indicadores de Execução */}
          <TabsContent value="metrics" className="m-0 focus-visible:outline-none">
            <TodooMetrics />
          </TabsContent>
        </Tabs>

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
