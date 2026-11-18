/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  Pause,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Users,
  Loader2,
  ExternalLink,
  Trophy,
  Sparkles,
  Bookmark,
  Edit3,
  Settings2,
  Activity,
  Megaphone,
  Smartphone,
  Eye,
  MessageCircle,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getCampaignDetailsAction,
  listCampaignRecipientsAction,
  startCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  cancelCampaignAction,
} from "@/lib/api/campaigns.functions";

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

interface Props {
  campaignId: string | null;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditDraft?: (campaignId: string) => void;
}

function formatDisplayPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export function CampaignDetailsSheet({
  campaignId,
  companyId,
  open,
  onOpenChange,
  onEditDraft,
}: Props) {
  const qc = useQueryClient();
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // Consulta detalhes da campanha
  const { data: detailsData, isLoading: loadingDetails } = useQuery({
    queryKey: ["campaign-details", campaignId],
    enabled: !!campaignId && open,
    queryFn: () =>
      getCampaignDetailsAction({
        data: { campaignId: campaignId!, companyId },
      }),
    refetchInterval: (query) => {
      const status = query.state.data?.campaign?.status;
      return status === "running" ? 3000 : false;
    },
  });

  // Consulta destinatários paginados
  const { data: recipientsData, isLoading: loadingRecipients } = useQuery({
    queryKey: ["campaign-recipients", campaignId, recipientStatusFilter, page],
    enabled: !!campaignId && open,
    queryFn: () =>
      listCampaignRecipientsAction({
        data: {
          campaignId: campaignId!,
          status: recipientStatusFilter,
          page,
          pageSize: 25,
        },
      }),
    refetchInterval: () => {
      const status = detailsData?.campaign?.status;
      return status === "running" ? 3000 : false;
    },
  });

  const startMutation = useMutation({
    mutationFn: () =>
      startCampaignAction({
        data: { campaignId: campaignId!, companyId },
      }),
    onSuccess: (res: any) => {
      toast.success(
        `Campanha iniciada com sucesso! (${res?.pendingCount || 0} contatos na fila de envio)`,
      );
      qc.invalidateQueries({ queryKey: ["campaign-details", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao iniciar campanha"),
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      pauseCampaignAction({
        data: { campaignId: campaignId!, companyId },
      }),
    onSuccess: () => {
      toast.success("Campanha pausada.");
      qc.invalidateQueries({ queryKey: ["campaign-details", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao pausar campanha"),
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      resumeCampaignAction({
        data: { campaignId: campaignId!, companyId },
      }),
    onSuccess: () => {
      toast.success("Campanha retomada!");
      qc.invalidateQueries({ queryKey: ["campaign-details", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao retomar campanha"),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelCampaignAction({
        data: { campaignId: campaignId!, companyId },
      }),
    onSuccess: () => {
      toast.success("Campanha cancelada.");
      qc.invalidateQueries({ queryKey: ["campaign-details", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao cancelar campanha"),
  });

  const campaign = detailsData?.campaign;
  const instances = detailsData?.instances || [];
  const stats = campaign?.stats || {};
  const total = stats.total || 0;
  const sent = stats.sent || 0;
  const read = stats.read || 0;
  const replied = stats.replied || 0;
  const failed = stats.failed || 0;
  const delivered = Math.max(stats.delivered || 0, read + replied);
  const pending = stats.pending ?? Math.max(0, total - sent - failed);
  const progressPercent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  const readRate = sent > 0 ? ((read / sent) * 100).toFixed(1) : "0.0";
  const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0.0";

  const messages: any[] = useMemo(() => campaign?.messages || [], [campaign?.messages]);

  // Identifica vencedora de leitura
  const bestReadRateId = useMemo(() => {
    if (messages.length <= 1) return null;
    let bestId: string | null = null;
    let bestRate = 0;
    for (const m of messages) {
      const mSent = m.stats?.sent || 0;
      const mRead = m.stats?.read || 0;
      const rate = mSent > 0 ? (mRead / mSent) * 100 : 0;
      if (mRead > 0 && rate > bestRate) {
        bestRate = rate;
        bestId = m.id;
      }
    }
    return bestId;
  }, [messages]);

  // Identifica vencedora de resposta
  const bestReplyRateId = useMemo(() => {
    if (messages.length <= 1) return null;
    let bestId: string | null = null;
    let bestRate = 0;
    for (const m of messages) {
      const mSent = m.stats?.sent || 0;
      const mReplied = m.stats?.replied || 0;
      const rate = mSent > 0 ? (mReplied / mSent) * 100 : 0;
      if (mReplied > 0 && rate > bestRate) {
        bestRate = rate;
        bestId = m.id;
      }
    }
    return bestId;
  }, [messages]);

  const statusInfo = STATUS_MAP[campaign?.status] || STATUS_MAP.draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 gap-6">
        {loadingDetails ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Carregando detalhes da campanha...</p>
          </div>
        ) : !campaign ? (
          <p className="text-center py-12 text-sm text-muted-foreground">
            Campanha não encontrada.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Header Estilo Avisei */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/20 rounded-xl text-primary">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">{campaign.name}</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    ID: {campaign.id?.split("-")[0]} • Criada em{" "}
                    {format(new Date(campaign.created_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                    {campaign.units?.name && ` • ${campaign.units.name}`}
                  </DialogDescription>
                </div>
              </div>

              {/* Botões de Ação de Topo */}
              <div className="flex items-center gap-2">
                {(campaign.status === "draft" || campaign.status === "scheduled") && (
                  <Button
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-lg shadow-emerald-600/20 cursor-pointer"
                    onClick={() => {
                      if (
                        confirm(`Deseja iniciar os disparos da campanha "${campaign.name}" agora?`)
                      ) {
                        startMutation.mutate();
                      }
                    }}
                    disabled={startMutation.isPending}
                  >
                    <Play className="h-4 w-4 fill-white" /> Iniciar Disparos Agora
                  </Button>
                )}

                {campaign.status === "draft" && onEditDraft && (
                  <Button
                    variant="outline"
                    className="gap-2 cursor-pointer"
                    onClick={() => {
                      onOpenChange(false);
                      onEditDraft(campaign.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Editar Rascunho
                  </Button>
                )}

                {campaign.status === "running" && (
                  <Button
                    variant="outline"
                    className="gap-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending}
                  >
                    <Pause className="h-4 w-4" /> Pausar Disparos
                  </Button>
                )}

                {campaign.status === "paused" && (
                  <Button
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-lg shadow-emerald-600/20 cursor-pointer"
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending}
                  >
                    <Play className="h-4 w-4 fill-white" /> Retomar Disparos
                  </Button>
                )}

                {["running", "paused", "scheduled"].includes(campaign.status) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10 cursor-pointer"
                    title="Cancelar Campanha"
                    onClick={() => {
                      if (confirm("Deseja realmente cancelar esta campanha?")) {
                        cancelMutation.mutate();
                      }
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Banner de Rascunho */}
            {campaign.status === "draft" && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <Bookmark className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      Campanha em modo Rascunho (Etapa {campaign.settings?.draft_step || 1} de 5)
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                      Você pode continuar a configuração e disparar a qualquer momento.
                    </p>
                  </div>
                </div>
                {onEditDraft && (
                  <Button
                    size="sm"
                    className="gap-1.5 cursor-pointer"
                    onClick={() => {
                      onOpenChange(false);
                      onEditDraft(campaign.id);
                    }}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Continuar Edição
                  </Button>
                )}
              </div>
            )}

            {/* Big Numbers de KPI Estilo Avisei */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="p-4 rounded-2xl bg-muted/40 border space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Total de Contatos
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-foreground">
                  {total.toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500/70">
                  Aguardando
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-amber-500">
                  {pending.toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/70">
                  Enviadas
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-500">
                  {sent.toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-sky-500/70">
                  Taxa Leitura
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-sky-500">{readRate}%</p>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 block font-medium">
                  {read.toLocaleString("pt-BR")} lidos
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-500/70">
                  Taxa Resposta
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-indigo-500">{replyRate}%</p>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block font-medium">
                  {replied.toLocaleString("pt-BR")} respostas
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-destructive/70">
                  Falhas / Erros
                </span>
                <p className="text-2xl sm:text-3xl font-bold text-destructive">
                  {failed.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            {/* Tabs Estilo Avisei */}
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="bg-muted/40 p-1 border">
                <TabsTrigger value="overview">Visão Geral & Métricas</TabsTrigger>
                <TabsTrigger value="messages">
                  Mensagens & Teste A/B ({messages.length > 0 ? messages.length : 1})
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  Lista de Contatos ({total.toLocaleString("pt-BR")})
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: VISÃO GERAL */}
              <TabsContent value="overview" className="space-y-6">
                {/* Progresso da Campanha */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <Label className="text-sm font-medium">Progresso da Campanha</Label>
                    <span className="text-2xl font-bold text-primary">{progressPercent}%</span>
                  </div>
                  <div className="h-4 bg-muted/40 rounded-full overflow-hidden p-1 border">
                    <Progress
                      value={progressPercent}
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                    />
                  </div>
                </div>

                {/* Grid 2 Colunas Estilo Avisei */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Detalhes Técnicos */}
                  <div className="space-y-4 p-5 rounded-2xl bg-muted/30 border">
                    <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-muted-foreground">
                      <Settings2 className="h-4 w-4" /> Detalhes Técnicos
                    </h4>
                    <div className="space-y-3.5 pt-2">
                      <div className="flex justify-between items-center border-b pb-3 text-sm">
                        <span className="text-muted-foreground">Instâncias Conectadas</span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {instances.length > 0 ? (
                            instances.map((i: any) => (
                              <Badge
                                key={i.id}
                                variant="outline"
                                className="font-mono text-primary border-primary/20 text-xs"
                              >
                                <Smartphone className="h-3 w-3 mr-1" />
                                {i.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="font-medium text-xs">Rotação por Unidade</span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-b pb-3 text-sm">
                        <span className="text-muted-foreground">Público da Campanha</span>
                        <span className="font-medium text-xs">
                          {campaign.audience_type === "segment"
                            ? "Segmentação da Base"
                            : "Planilha Importada"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-b pb-3 text-sm">
                        <span className="text-muted-foreground">Intervalo de Disparo</span>
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {campaign.settings?.min_delay_seconds || 25}s a{" "}
                          {campaign.settings?.max_delay_seconds || 55}s
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-b pb-3 text-sm">
                        <span className="text-muted-foreground">Status Atual</span>
                        <Badge
                          variant="outline"
                          className={cn("gap-1.5 py-0.5 px-2", statusInfo.color)}
                        >
                          {statusInfo.label}
                        </Badge>
                      </div>

                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Unidade</span>
                        <span className="font-medium text-xs">
                          {campaign.units?.name || "Todas as unidades"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo da Mensagem Principal */}
                  <div className="space-y-4 p-5 rounded-2xl bg-muted/30 border">
                    <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-muted-foreground">
                      <MessageSquare className="h-4 w-4" /> Conteúdo da Mensagem
                    </h4>
                    <div className="p-4 rounded-xl bg-muted/20 text-sm whitespace-pre-wrap leading-relaxed border h-[220px] overflow-y-auto">
                      {campaign.content || "Nenhum conteúdo definido."}
                    </div>
                    {campaign.media_url && (
                      <div className="text-xs flex items-center gap-2 text-primary pt-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        <a
                          href={campaign.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-medium hover:text-primary/80"
                        >
                          Ver mídia anexada ({campaign.media_name || campaign.message_type})
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ABA 2: VARIAÇÕES DE MENSAGEM & TESTE A/B COM TAXA DE LEITURA */}
              <TabsContent value="messages" className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Variações Ativas da Campanha
                  </span>
                  {messages.length > 1 && (
                    <Badge variant="outline" className="text-xs text-primary border-primary/30">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {messages.length} variações em rotação
                    </Badge>
                  )}
                </div>

                {messages.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {messages.map((m: any, idx: number) => {
                      const mSent = m.stats?.sent || 0;
                      const mRead = m.stats?.read || 0;
                      const mReplied = m.stats?.replied || 0;
                      const mDelivered = Math.max(m.stats?.delivered || 0, mRead + mReplied);
                      const mFailed = m.stats?.failed || 0;
                      const mReadRate = mSent > 0 ? ((mRead / mSent) * 100).toFixed(1) : "0.0";
                      const mReplyRate = mSent > 0 ? ((mReplied / mSent) * 100).toFixed(1) : "0.0";
                      const isBestRead = m.id === bestReadRateId;
                      const isBestReply = m.id === bestReplyRateId;

                      return (
                        <div
                          key={m.id || idx}
                          className="p-5 rounded-2xl bg-muted/30 border space-y-4"
                        >
                          {/* Topo do Card da Variação */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono px-2 py-0.5 shrink-0"
                              >
                                #{idx + 1}
                              </Badge>
                              <span className="font-semibold text-sm truncate">
                                {m.name || `Variação ${idx + 1}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                {m.message_type || "text"}
                              </Badge>
                              {isBestRead && (
                                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] flex items-center gap-1 font-semibold">
                                  <Trophy className="h-3 w-3 text-sky-500" />
                                  Maior Leitura
                                </Badge>
                              )}
                              {isBestReply && (
                                <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-[10px] flex items-center gap-1 font-semibold">
                                  <Sparkles className="h-3 w-3 text-indigo-500" />
                                  Mais Respostas
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Placar de Big Numbers da Variação */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold text-sky-600 dark:text-sky-400">
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3.5 w-3.5" />
                                  Taxa de Leitura
                                </span>
                                <span className="text-xl font-bold">{mReadRate}%</span>
                              </div>
                              <Progress
                                value={Math.min(100, Number(mReadRate))}
                                className="h-1.5 bg-sky-500/20"
                              />
                              <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80 block">
                                {mRead} lidos de {mSent} envios
                              </span>
                            </div>

                            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                              <div className="flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  Taxa Resposta
                                </span>
                                <span className="text-xl font-bold">{mReplyRate}%</span>
                              </div>
                              <Progress
                                value={Math.min(100, Number(mReplyRate))}
                                className="h-1.5 bg-indigo-500/20"
                              />
                              <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 block">
                                {mReplied} contatos responderam
                              </span>
                            </div>
                          </div>

                          {/* Contadores da Variação */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-muted/40 border rounded-xl p-2 text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Enviados
                              </span>
                              <span className="font-bold text-foreground mt-0.5">{mSent}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Entregues
                              </span>
                              <span className="font-bold text-teal-600 mt-0.5">{mDelivered}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Falhas
                              </span>
                              <span
                                className={`font-bold mt-0.5 ${mFailed > 0 ? "text-destructive" : "text-muted-foreground"}`}
                              >
                                {mFailed}
                              </span>
                            </div>
                          </div>

                          {/* Conteúdo da Mensagem */}
                          <div className="p-3 rounded-xl bg-muted/20 border text-xs whitespace-pre-wrap leading-relaxed max-h-[140px] overflow-y-auto">
                            {m.content || "(Sem texto)"}
                          </div>

                          {m.media_url && (
                            <div className="text-xs flex items-center gap-1.5 text-primary pt-0.5">
                              <ExternalLink className="h-3.5 w-3.5" />
                              <a
                                href={m.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline truncate font-medium hover:text-primary/80"
                              >
                                Ver anexo ({m.media_name || m.message_type})
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-muted/30 border space-y-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Mensagem Principal
                    </span>
                    <div className="p-4 rounded-xl bg-muted/20 border text-sm whitespace-pre-wrap leading-relaxed">
                      {campaign.content || "Nenhum conteúdo definido."}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ABA 3: LISTA DE CONTATOS ESTILO AVISEI */}
              <TabsContent value="contacts" className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Contatos da Campanha
                  </span>

                  <Tabs
                    value={recipientStatusFilter}
                    onValueChange={(val) => {
                      setRecipientStatusFilter(val);
                      setPage(1);
                    }}
                  >
                    <TabsList className="h-8 bg-muted/40 p-1 border">
                      <TabsTrigger value="all" className="text-xs px-2.5">
                        Todos
                      </TabsTrigger>
                      <TabsTrigger value="pending" className="text-xs px-2.5">
                        Aguardando
                      </TabsTrigger>
                      <TabsTrigger value="sent" className="text-xs px-2.5">
                        Enviados
                      </TabsTrigger>
                      <TabsTrigger value="read" className="text-xs px-2.5">
                        Lidos
                      </TabsTrigger>
                      <TabsTrigger value="replied" className="text-xs px-2.5">
                        Responderam
                      </TabsTrigger>
                      <TabsTrigger value="failed" className="text-xs px-2.5">
                        Falhas
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="rounded-2xl border overflow-hidden max-h-[450px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="px-4 py-3">Nome do Cliente</TableHead>
                        <TableHead className="px-4 py-3">Telefone / WhatsApp</TableHead>
                        <TableHead className="px-4 py-3">Variação</TableHead>
                        <TableHead className="px-4 py-3">Status</TableHead>
                        <TableHead className="px-4 py-3 text-right">Data/Hora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingRecipients ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-16 text-muted-foreground"
                          >
                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                            Carregando contatos...
                          </TableCell>
                        </TableRow>
                      ) : (recipientsData?.recipients || []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-16 text-muted-foreground"
                          >
                            <div className="flex flex-col items-center gap-2 opacity-40">
                              <Users className="h-10 w-10" />
                              <p>Nenhum contato encontrado com este filtro.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        recipientsData?.recipients.map((contact: any) => (
                          <TableRow
                            key={contact.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <TableCell className="px-4 py-3 font-medium text-xs">
                              <div className="flex flex-col">
                                <span className="text-foreground">
                                  {contact.name ||
                                    contact.custom_variables?.Nome ||
                                    contact.custom_variables?.["Nome do Cliente"] ||
                                    "Sem nome cadastrado"}
                                </span>
                                {contact.custom_variables?.["Grupos Origem"] && (
                                  <span
                                    className="text-[10px] text-muted-foreground truncate max-w-[220px]"
                                    title={contact.custom_variables["Grupos Origem"]}
                                  >
                                    {contact.custom_variables["Grupos Origem"]}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs font-mono text-muted-foreground">
                              {formatDisplayPhone(contact.phone)}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-medium border-primary/20 bg-primary/5 text-primary"
                              >
                                {contact.campaign_messages?.name || "Variação 1"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {contact.status === "sent" && (
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 text-xs py-0"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Enviado
                                </Badge>
                              )}
                              {contact.status === "delivered" && (
                                <Badge
                                  variant="secondary"
                                  className="bg-teal-500/10 text-teal-600 border-teal-500/20 gap-1 text-xs py-0"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Entregue
                                </Badge>
                              )}
                              {contact.status === "read" && (
                                <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 gap-1 text-xs py-0">
                                  <Eye className="h-3 w-3" /> Lido
                                </Badge>
                              )}
                              {contact.status === "replied" && (
                                <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 gap-1 text-xs py-0">
                                  <MessageCircle className="h-3 w-3" /> Respondeu
                                </Badge>
                              )}
                              {contact.status === "pending" && (
                                <Badge
                                  variant="outline"
                                  className="text-muted-foreground gap-1 text-xs py-0"
                                >
                                  <Clock className="h-3 w-3" /> Aguardando
                                </Badge>
                              )}
                              {contact.status === "failed" && (
                                <div className="flex flex-col gap-0.5">
                                  <Badge
                                    variant="destructive"
                                    className="bg-destructive/10 text-destructive border-destructive/20 gap-1 text-xs py-0 w-fit"
                                  >
                                    <XCircle className="h-3 w-3" /> Falha
                                  </Badge>
                                  {contact.error_message && (
                                    <span
                                      className="text-[10px] text-destructive/70 max-w-[200px] truncate"
                                      title={contact.error_message}
                                    >
                                      {contact.error_message}
                                    </span>
                                  )}
                                </div>
                              )}
                              {contact.status === "cancelled" && (
                                <Badge variant="outline" className="text-xs py-0">
                                  Cancelado
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-xs text-muted-foreground text-right whitespace-nowrap">
                              {contact.sent_at
                                ? format(new Date(contact.sent_at), "dd/MM/yy HH:mm", {
                                    locale: ptBR,
                                  })
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginação */}
                {recipientsData && recipientsData.total > 25 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                    <span>
                      Página {page} de {Math.ceil(recipientsData.total / 25)} (
                      {recipientsData.total} registros)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="cursor-pointer h-7 text-xs"
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page >= Math.ceil(recipientsData.total / 25)}
                        onClick={() => setPage((p) => p + 1)}
                        className="cursor-pointer h-7 text-xs"
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
