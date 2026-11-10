/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  Filter,
  Users,
  Send,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import {
  listCampaignsAction,
  pauseCampaignAction,
  resumeCampaignAction,
  cancelCampaignAction,
} from "@/lib/api/campaigns.functions";
import { CreateCampaignDialog } from "@/components/campaigns/create-campaign-dialog";
import { CampaignDetailsSheet } from "@/components/campaigns/campaign-details-sheet";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: () => (
    <ProtectedMenuRoute menuKey="campaigns">
      <CampaignsPage />
    </ProtectedMenuRoute>
  ),
});

function CampaignsPage() {
  const { activeCompanyId } = useActiveCompany();
  const { units: accessibleUnits = [] } = useAccessibleUnits();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Modais
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null);

  // Consulta lista de campanhas
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["campaigns-list", activeCompanyId, unitFilter, statusFilter, searchTerm, page],
    enabled: !!activeCompanyId,
    queryFn: () =>
      listCampaignsAction({
        data: {
          companyId: activeCompanyId!,
          unitId: unitFilter,
          status: statusFilter,
          search: searchTerm,
          page,
          pageSize: 20,
        },
      }),
    refetchInterval: (query) => {
      // Faz auto-refresh a cada 5s se tiver alguma campanha rodando
      const hasRunning = query.state.data?.campaigns?.some((c: any) => c.status === "running");
      return hasRunning ? 5000 : false;
    },
  });

  const campaigns = data?.campaigns || [];
  const totalCount = data?.total || 0;

  // KPIs calculados
  const kpis = useMemoKpis(campaigns);

  // Ações de Pausar / Retomar / Cancelar
  const pauseMutation = useMutation({
    mutationFn: (campaignId: string) =>
      pauseCampaignAction({
        data: { campaignId, companyId: activeCompanyId! },
      }),
    onSuccess: () => {
      toast.success("Campanha pausada.");
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao pausar"),
  });

  const resumeMutation = useMutation({
    mutationFn: (campaignId: string) =>
      resumeCampaignAction({
        data: { campaignId, companyId: activeCompanyId! },
      }),
    onSuccess: () => {
      toast.success("Campanha retomada!");
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao retomar"),
  });

  const cancelMutation = useMutation({
    mutationFn: (campaignId: string) =>
      cancelCampaignAction({
        data: { campaignId, companyId: activeCompanyId! },
      }),
    onSuccess: () => {
      toast.success("Campanha cancelada.");
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao cancelar"),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Em execução
          </Badge>
        );
      case "scheduled":
        return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Agendada</Badge>;
      case "paused":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Pausada</Badge>;
      case "completed":
        return <Badge className="bg-indigo-500/15 text-indigo-600 border-indigo-500/30">Concluída</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelada</Badge>;
      case "failed":
        return <Badge variant="destructive">Falha</Badge>;
      default:
        return <Badge variant="outline">Rascunho</Badge>;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 pb-20">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Envios automatizados para clientes da base ou planilhas importadas com rotação anti-bloqueio.
        </p>

        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total de Campanhas</span>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold mt-2">{totalCount}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {kpis.running} em andamento
          </div>
        </Card>

        <Card className="p-4 bg-card border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Enviadas & A Enviar</span>
            <Send className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-emerald-600">
            {kpis.totalSent.toLocaleString("pt-BR")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {kpis.totalPending.toLocaleString("pt-BR")} a enviar (de {kpis.totalTarget.toLocaleString("pt-BR")} alvo)
          </div>
        </Card>

        <Card className="p-4 bg-card border shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Erros / Falhas</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-rose-600">
            {kpis.totalFailed.toLocaleString("pt-BR")}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Números sem WhatsApp ou falha de conexão
          </div>
        </Card>

        <Card className="p-4 bg-indigo-500/5 border-indigo-500/20 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Taxa de Resposta</span>
            <MessageCircle className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-indigo-600 dark:text-indigo-400">
            {kpis.avgReplyRate}%
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {kpis.totalReplied.toLocaleString("pt-BR")} contatos responderam
          </div>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <Card className="p-3.5 bg-card border shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar campanha por nome..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-8 text-xs"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="running">Em execução</SelectItem>
                <SelectItem value="scheduled">Agendada</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={unitFilter}
              onValueChange={(val) => {
                setUnitFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40 text-xs">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Unidades</SelectItem>
                {accessibleUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </Card>

      {/* Listagem de Campanhas */}
      {isLoading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          Carregando campanhas...
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary mb-3">
            <Megaphone className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-base">Nenhuma campanha encontrada</h3>
          <p className="max-w-md text-sm text-muted-foreground mt-1 mb-4">
            Crie sua primeira campanha para reativar clientes inativos ou enviar novidades para sua base.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Campanha
          </Button>
        </Card>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>A Enviar</TableHead>
                <TableHead>Enviadas</TableHead>
                <TableHead>Erros</TableHead>
                <TableHead>Taxa de Resposta</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((camp: any) => {
                const stats = camp.stats || {};
                const total = stats.total || 0;
                const sent = stats.sent || 0;
                const replied = stats.replied || 0;
                const failed = stats.failed || 0;
                const pending = stats.pending ?? Math.max(0, total - sent - failed);
                const percent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
                const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0.0";

                return (
                  <TableRow key={camp.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="font-semibold text-sm">{camp.name}</div>
                      {camp.units?.name && (
                        <div className="text-[11px] text-muted-foreground">{camp.units.name}</div>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {camp.audience_type === "segment" ? (
                          <>
                            <Filter className="h-3 w-3 mr-1 text-primary" />
                            Segmentação
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3 mr-1 text-primary" />
                            Planilha
                          </>
                        )}
                      </Badge>
                    </TableCell>

                    <TableCell>{getStatusBadge(camp.status)}</TableCell>

                    {/* Quantidade a enviar (Pendente) */}
                    <TableCell>
                      <span className="font-semibold text-xs text-blue-600 block">
                        {pending.toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        de {total.toLocaleString("pt-BR")} alvo
                      </span>
                    </TableCell>

                    {/* Quantidade Enviadas com sucesso */}
                    <TableCell className="min-w-[110px]">
                      <span className="font-semibold text-xs text-emerald-600 block">
                        {sent.toLocaleString("pt-BR")}
                        <span className="text-[10px] text-muted-foreground ml-1">({percent}%)</span>
                      </span>
                      <div className="w-20 bg-muted rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-1 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </TableCell>

                    {/* Quantidade com Erro */}
                    <TableCell>
                      {failed > 0 ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-semibold">
                          {failed.toLocaleString("pt-BR")} erro(s)
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>

                    {/* Taxa de Resposta e Quantidade que respondeu */}
                    <TableCell>
                      <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-xs font-bold">
                        {replyRate}%
                      </Badge>
                      <span className="text-[10px] text-muted-foreground block mt-0.5 font-medium">
                        {replied} responderam
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {camp.scheduled_at ? (
                        <div title="Agendada para">
                          <Clock className="h-3 w-3 inline mr-1 text-blue-500" />
                          {format(new Date(camp.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      ) : (
                        format(new Date(camp.created_at), "dd/MM/yy", { locale: ptBR })
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {camp.status === "running" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-amber-500"
                            title="Pausar Campanha"
                            onClick={() => pauseMutation.mutate(camp.id)}
                            disabled={pauseMutation.isPending}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}

                        {camp.status === "paused" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-emerald-500"
                            title="Retomar Campanha"
                            onClick={() => resumeMutation.mutate(camp.id)}
                            disabled={resumeMutation.isPending}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}

                        {["running", "paused", "scheduled"].includes(camp.status) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-500"
                            title="Cancelar Campanha"
                            onClick={() => {
                              if (confirm(`Cancelar a campanha "${camp.name}"?`)) {
                                cancelMutation.mutate(camp.id);
                              }
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Ver Detalhes e Fila"
                          onClick={() => setDetailsCampaignId(camp.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal de Criação de Campanha */}
      {activeCompanyId && (
        <CreateCampaignDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          companyId={activeCompanyId}
          onSuccess={() => refetch()}
        />
      )}

      {/* Drawer de Detalhes da Campanha */}
      {activeCompanyId && (
        <CampaignDetailsSheet
          open={!!detailsCampaignId}
          onOpenChange={(open) => !open && setDetailsCampaignId(null)}
          campaignId={detailsCampaignId}
          companyId={activeCompanyId}
        />
      )}
    </div>
  );
}

function useMemoKpis(campaigns: any[]) {
  let running = 0;
  let totalTarget = 0;
  let totalSent = 0;
  let totalPending = 0;
  let totalReplied = 0;
  let totalFailed = 0;

  for (const c of campaigns) {
    if (c.status === "running") running++;
    const s = c.stats || {};
    const t = s.total || 0;
    const sent = s.sent || 0;
    const failed = s.failed || 0;
    const pending = s.pending ?? Math.max(0, t - sent - failed);

    totalTarget += t;
    totalSent += sent;
    totalPending += pending;
    totalReplied += s.replied || 0;
    totalFailed += failed;
  }

  const avgReplyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : "0.0";

  return { running, totalTarget, totalSent, totalPending, totalReplied, totalFailed, avgReplyRate };
}
