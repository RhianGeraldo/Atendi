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
  Trash2,
  Edit3,
  Bookmark,
  Building2,
  Calendar,
  BarChart2,
  FileSpreadsheet,
  Activity,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
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
  startCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  cancelCampaignAction,
  deleteCampaignDraftAction,
} from "@/lib/api/campaigns.functions";
import { CreateCampaignDialog } from "@/components/campaigns/create-campaign-dialog";
import { CampaignDetailsSheet } from "@/components/campaigns/campaign-details-sheet";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "default" | "outline" | "secondary" | "destructive";
    icon: any;
    color: string;
  }
> = {
  draft: {
    label: "Rascunho",
    variant: "outline",
    icon: Clock,
    color: "text-amber-500 border-amber-500/50 bg-amber-500/10",
  },
  running: {
    label: "Rodando",
    variant: "secondary",
    icon: Activity,
    color: "text-primary border-primary/50 bg-primary/10",
  },
  completed: {
    label: "Concluída",
    variant: "secondary",
    icon: CheckCircle2,
    color: "text-emerald-500 border-emerald-500/50 bg-emerald-500/10",
  },
  paused: {
    label: "Pausada",
    variant: "outline",
    icon: Pause,
    color: "text-amber-500 border-amber-500/50 bg-amber-500/10",
  },
  scheduled: {
    label: "Agendada",
    variant: "outline",
    icon: Clock,
    color: "text-blue-500 border-blue-500/50 bg-blue-500/10",
  },
  cancelled: {
    label: "Cancelada",
    variant: "destructive",
    icon: XCircle,
    color: "text-destructive border-destructive/50 bg-destructive/10",
  },
  failed: {
    label: "Falha",
    variant: "destructive",
    icon: AlertTriangle,
    color: "text-destructive border-destructive/50 bg-destructive/10",
  },
};

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
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
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

  // Ações de Iniciar / Pausar / Retomar / Cancelar
  const startMutation = useMutation({
    mutationFn: (campaignId: string) =>
      startCampaignAction({
        data: { campaignId, companyId: activeCompanyId! },
      }),
    onSuccess: (res: any) => {
      toast.success(`Campanha iniciada com sucesso! (${res?.pendingCount || 0} contatos na fila)`);
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao iniciar campanha"),
  });

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

  const deleteDraftMutation = useMutation({
    mutationFn: (campaignId: string) =>
      deleteCampaignDraftAction({
        data: { campaignId, companyId: activeCompanyId! },
      }),
    onSuccess: () => {
      toast.success("Rascunho excluído com sucesso.");
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao excluir rascunho"),
  });

  const renderStatusBadge = (camp: any) => {
    const status = STATUS_MAP[camp.status] || STATUS_MAP.draft;
    const StatusIcon = status.icon;
    const draftStep = camp.settings?.draft_step || 1;

    return (
      <Badge
        variant="outline"
        className={cn("gap-1.5 py-1 px-2.5 font-bold border whitespace-nowrap", status.color)}
      >
        <StatusIcon className={cn("h-3.5 w-3.5", camp.status === "running" && "animate-pulse")} />
        <span className="uppercase tracking-tight text-[11px]">
          {camp.status === "draft" ? `Rascunho (${draftStep}/5)` : status.label}
        </span>
      </Badge>
    );
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 pb-20">
      {/* Header Estilo Avisei */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Campanhas</h2>
          <p className="text-sm text-muted-foreground">
            Envio em massa para listas de contatos e segmentações da base.
          </p>
        </div>

        <Button
          onClick={() => {
            setEditingDraftId(null);
            setCreateDialogOpen(true);
          }}
          className="gap-2 font-semibold shadow-sm shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
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
                <SelectItem value="running">Rodando</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="draft">Rascunhos</SelectItem>
                <SelectItem value="scheduled">Agendadas</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
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
            className="text-xs shrink-0 cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </Card>

      {/* Listagem de Campanhas - Tabela Estilo Avisei */}
      {isLoading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          Carregando campanhas...
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center border-dashed border-2">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary mb-3">
            <Megaphone className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-base">Nenhuma campanha cadastrada</h3>
          <p className="max-w-md text-sm text-muted-foreground mt-1 mb-4">
            Crie sua primeira campanha para reativar clientes ou enviar novidades para sua base.
          </p>
          <Button
            onClick={() => {
              setEditingDraftId(null);
              setCreateDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden border shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-4">Campanha</TableHead>
                  <TableHead>Público / Unidade</TableHead>
                  <TableHead className="min-w-[200px]">Progresso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-36 text-right px-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((camp: any) => {
                  const stats = camp.stats || {};
                  const total = stats.total || 0;
                  const sent = stats.sent || 0;
                  const failed = stats.failed || 0;
                  const processed = sent + failed;
                  const pending = stats.pending ?? Math.max(0, total - sent - failed);
                  const progress = total > 0 ? (processed / total) * 100 : 0;
                  const isDraft = camp.status === "draft";

                  return (
                    <TableRow
                      key={camp.id}
                      className="group hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setDetailsCampaignId(camp.id)}
                    >
                      {/* Campanha */}
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                            {camp.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {camp.scheduled_at
                              ? `Agendada para ${format(new Date(camp.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                              : format(new Date(camp.created_at), "dd/MM/yyyy HH:mm", {
                                  locale: ptBR,
                                })}
                          </span>
                        </div>
                      </TableCell>

                      {/* Público / Unidade */}
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            {camp.audience_type === "segment" ? (
                              <>
                                <Filter className="h-3.5 w-3.5 text-primary/70" />
                                <span>Segmentação da Base</span>
                              </>
                            ) : (
                              <>
                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Planilha Importada</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                            <Building2 className="h-3 w-3" />
                            <span>{camp.units?.name || "Todas as unidades"}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Progresso */}
                      <TableCell className="min-w-[200px]">
                        {isDraft ? (
                          <span className="text-xs text-muted-foreground italic">
                            Rascunho não iniciado
                          </span>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-medium text-foreground">
                                {processed}/{total} processados
                              </span>
                              <span className="text-muted-foreground font-semibold">
                                {Math.round(progress)}%
                              </span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{pending} a enviar</span>
                              {failed > 0 && (
                                <span className="text-destructive font-semibold">
                                  {failed} falhas
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>{renderStatusBadge(camp)}</TableCell>

                      {/* Ações */}
                      <TableCell
                        className="text-right px-6 min-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                            title="Ver detalhes e métricas"
                            onClick={() => setDetailsCampaignId(camp.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* Iniciar / Disparar Agora (para rascunhos e agendadas) */}
                          {(isDraft || camp.status === "scheduled") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                              title="Iniciar Disparos Agora"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Deseja iniciar os disparos da campanha "${camp.name}" agora?`,
                                  )
                                ) {
                                  startMutation.mutate(camp.id);
                                }
                              }}
                              disabled={startMutation.isPending}
                            >
                              <Play className="h-4 w-4 fill-emerald-500" />
                            </Button>
                          )}

                          {isDraft && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                              title="Continuar / Editar rascunho"
                              onClick={() => {
                                setEditingDraftId(camp.id);
                                setCreateDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}

                          {camp.status === "running" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-500 hover:text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                              title="Pausar Disparos"
                              onClick={() => pauseMutation.mutate(camp.id)}
                              disabled={pauseMutation.isPending}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}

                          {camp.status === "paused" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
                              title="Retomar Disparos"
                              onClick={() => resumeMutation.mutate(camp.id)}
                              disabled={resumeMutation.isPending}
                            >
                              <Play className="h-4 w-4 fill-emerald-500" />
                            </Button>
                          )}

                          {isDraft && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                              title="Excluir Rascunho"
                              onClick={() => {
                                if (
                                  confirm(`Deseja realmente excluir o rascunho "${camp.name}"?`)
                                ) {
                                  deleteDraftMutation.mutate(camp.id);
                                }
                              }}
                              disabled={deleteDraftMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}

                          {["running", "paused", "scheduled"].includes(camp.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
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
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalCount > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
              <span>
                Página {page} de {Math.ceil(totalCount / 20)} ({totalCount} campanhas no total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 text-xs"
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= Math.ceil(totalCount / 20)}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 text-xs"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Modal de Criação de Campanha */}
      {activeCompanyId && (
        <CreateCampaignDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) setEditingDraftId(null);
          }}
          companyId={activeCompanyId}
          draftCampaignId={editingDraftId}
          onSuccess={() => {
            refetch();
            setEditingDraftId(null);
          }}
        />
      )}

      {/* Drawer de Detalhes da Campanha */}
      {activeCompanyId && (
        <CampaignDetailsSheet
          open={!!detailsCampaignId}
          onOpenChange={(open) => !open && setDetailsCampaignId(null)}
          campaignId={detailsCampaignId}
          companyId={activeCompanyId}
          onEditDraft={(id) => {
            setEditingDraftId(id);
            setCreateDialogOpen(true);
          }}
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
