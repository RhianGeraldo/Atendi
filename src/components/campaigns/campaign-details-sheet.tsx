/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  MessageCircle,
  Users,
  Send,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCampaignDetailsAction,
  listCampaignRecipientsAction,
  pauseCampaignAction,
  resumeCampaignAction,
  cancelCampaignAction,
} from "@/lib/api/campaigns.functions";

interface Props {
  campaignId: string | null;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignDetailsSheet({ campaignId, companyId, open, onOpenChange }: Props) {
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
  const stats = campaign?.stats || {};
  const total = stats.total || 0;
  const sent = stats.sent || 0;
  const replied = stats.replied || 0;
  const failed = stats.failed || 0;
  const pending = stats.pending ?? Math.max(0, total - sent - failed);
  const progressPercent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) : "0.0";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Em execução</Badge>;
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-6">
        {loadingDetails ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Carregando detalhes da campanha...</p>
          </div>
        ) : !campaign ? (
          <p className="text-center py-12 text-sm text-muted-foreground">Campanha não encontrada.</p>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="text-left space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SheetTitle className="text-xl font-bold">{campaign.name}</SheetTitle>
                <div className="flex items-center gap-2">
                  {getStatusBadge(campaign.status)}
                  {campaign.status === "running" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pauseMutation.mutate()}
                      disabled={pauseMutation.isPending}
                    >
                      <Pause className="h-3.5 w-3.5 mr-1 text-amber-500" />
                      Pausar
                    </Button>
                  )}
                  {campaign.status === "paused" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resumeMutation.mutate()}
                      disabled={resumeMutation.isPending}
                    >
                      <Play className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                      Retomar
                    </Button>
                  )}
                  {["running", "paused", "scheduled"].includes(campaign.status) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja cancelar esta campanha?")) {
                          cancelMutation.mutate();
                        }
                      }}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
              <SheetDescription>
                Criada em {format(new Date(campaign.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {campaign.profiles?.name && ` por ${campaign.profiles.name}`}
              </SheetDescription>
            </SheetHeader>

            {/* KPIs Grid Detalhado */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <Card className="p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Total Alvo
                </div>
                <div className="text-lg font-bold mt-1">{total.toLocaleString("pt-BR")}</div>
              </Card>

              <Card className="p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  A Enviar
                </div>
                <div className="text-lg font-bold mt-1 text-blue-600">
                  {pending.toLocaleString("pt-BR")}
                </div>
              </Card>

              <Card className="p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-emerald-500" />
                  Enviados
                </div>
                <div className="text-lg font-bold mt-1 text-emerald-600">
                  {sent.toLocaleString("pt-BR")}
                </div>
              </Card>

              <Card className="p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                  Falhas / Erros
                </div>
                <div className="text-lg font-bold mt-1 text-rose-600">
                  {failed.toLocaleString("pt-BR")}
                </div>
              </Card>

              <Card className="p-3 bg-indigo-500/10 border-indigo-500/20 col-span-2 sm:col-span-1">
                <div className="text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-indigo-500" />
                  Taxa de Resposta
                </div>
                <div className="text-lg font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                  {replyRate}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {replied} responderam
                </div>
              </Card>
            </div>

            {/* Progresso Geral */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso do Envio</span>
                <span>{sent + failed} de {total} processados</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Mensagem e Configuração */}
            <Card className="p-4 bg-muted/20 space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Template da Mensagem
              </span>
              <div className="bg-background border rounded-lg p-3 text-sm whitespace-pre-wrap font-sans text-foreground">
                {campaign.content}
              </div>
              {campaign.media_url && (
                <div className="pt-2 text-xs flex items-center gap-2 text-primary">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <a href={campaign.media_url} target="_blank" rel="noreferrer" className="underline">
                    Ver arquivo anexado ({campaign.message_type})
                  </a>
                </div>
              )}
            </Card>

            {/* Lista de Destinatários */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h4 className="text-sm font-semibold">Destinatários da Campanha</h4>
                <Tabs value={recipientStatusFilter} onValueChange={(val) => { setRecipientStatusFilter(val); setPage(1); }}>
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs px-2.5">Todos</TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs px-2.5">Pendentes</TabsTrigger>
                    <TabsTrigger value="sent" className="text-xs px-2.5">Enviados</TabsTrigger>
                    <TabsTrigger value="replied" className="text-xs px-2.5">Responderam</TabsTrigger>
                    <TabsTrigger value="failed" className="text-xs px-2.5">Falhas</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {loadingRecipients ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Carregando lista...</div>
              ) : (recipientsData?.recipients || []).length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg">
                  Nenhum destinatário encontrado neste filtro.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contato</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Envio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipientsData?.recipients.map((rec: any) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-medium">{rec.name || "Sem nome"}</TableCell>
                          <TableCell className="text-xs font-mono">{rec.phone}</TableCell>
                          <TableCell>
                            {rec.status === "sent" && (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
                                Enviado
                              </Badge>
                            )}
                            {rec.status === "replied" && (
                              <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">
                                Respondeu
                              </Badge>
                            )}
                            {rec.status === "pending" && (
                              <Badge variant="secondary">Pendente</Badge>
                            )}
                            {rec.status === "processing" && (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 animate-pulse">
                                Enviando...
                              </Badge>
                            )}
                            {rec.status === "failed" && (
                              <Badge variant="destructive" title={rec.error_message || ""}>
                                Falhou
                              </Badge>
                            )}
                            {rec.status === "cancelled" && (
                              <Badge variant="outline">Cancelado</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {rec.sent_at
                              ? format(new Date(rec.sent_at), "dd/MM HH:mm", { locale: ptBR })
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Paginação */}
              {recipientsData && recipientsData.total > 25 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                  <span>
                    Página {page} de {Math.ceil(recipientsData.total / 25)} ({recipientsData.total} registros)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= Math.ceil(recipientsData.total / 25)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
