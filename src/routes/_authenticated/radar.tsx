/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Radar,
  AlertTriangle,
  Flame,
  Scale,
  Frown,
  DollarSign,
  Ticket,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageSquare,
  Search,
  Filter,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { ContactAvatar } from "@/components/chat/contact-avatar";
import {
  getRadarAlertsAction,
  getRadarMetricsAction,
  dismissRadarAlertAction,
  resolveRadarAlertAction,
  createTicketFromRadarAlertAction,
  scanRecentConversationsAction,
} from "@/lib/api/radar.functions";
import { formatTicketCode } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/radar")({
  component: () => (
    <ProtectedMenuRoute menuKey="radar">
      <RadarPage />
    </ProtectedMenuRoute>
  ),
});

const CATEGORY_MAP: Record<
  string,
  { label: string; icon: any; color: string; bg: string; border: string }
> = {
  churn: {
    label: "Risco de Cancelamento (Churn)",
    icon: Flame,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
  },
  critical_issue: {
    label: "Incidente Crítico",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  legal_risk: {
    label: "Risco Jurídico / Procon",
    icon: Scale,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  severe_dissatisfaction: {
    label: "Insatisfação Severa",
    icon: Frown,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  billing: {
    label: "Disputa Financeira",
    icon: DollarSign,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
};

const SEVERITY_MAP: Record<string, { label: string; badgeClass: string }> = {
  critical: {
    label: "Crítica",
    badgeClass: "bg-rose-600 text-white font-bold animate-pulse hover:bg-rose-700",
  },
  high: {
    label: "Alta",
    badgeClass: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold",
  },
  medium: {
    label: "Média",
    badgeClass: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  low: {
    label: "Baixa",
    badgeClass: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
};

const STATUS_MAP: Record<string, { label: string; badgeClass: string }> = {
  pending: {
    label: "Pendente de Ação",
    badgeClass: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  in_review: {
    label: "Em Análise",
    badgeClass: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  },
  ticket_created: {
    label: "Chamado Criado",
    badgeClass: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  },
  resolved: {
    label: "Tratado / Resolvido",
    badgeClass: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  dismissed: {
    label: "Falso Positivo",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

function RadarPage() {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");

  const effectiveUnitId = selectedUnitId === "all" ? null : selectedUnitId;

  // 1. Busca métricas consolidadas
  const {
    data: metrics,
    isLoading: isLoadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["radar-metrics", activeCompanyId, effectiveUnitId],
    queryFn: () =>
      getRadarMetricsAction({
        data: {
          companyId: activeCompanyId!,
          unitId: effectiveUnitId,
        },
      }),
    enabled: !!activeCompanyId,
  });

  // 2. Busca lista de alertas
  const {
    data: alertsData,
    isLoading: isLoadingAlerts,
    refetch: refetchAlerts,
    isFetching,
  } = useQuery({
    queryKey: [
      "radar-alerts",
      activeCompanyId,
      effectiveUnitId,
      selectedStatus,
      selectedCategory,
      selectedSeverity,
    ],
    queryFn: () =>
      getRadarAlertsAction({
        data: {
          companyId: activeCompanyId!,
          unitId: effectiveUnitId,
          status: selectedStatus as any,
          category: selectedCategory === "all" ? undefined : selectedCategory,
          severity: selectedSeverity === "all" ? undefined : selectedSeverity,
          limit: 100,
        },
      }),
    enabled: !!activeCompanyId,
  });

  // 3. Realtime para atualizar a lista instantaneamente
  useEffect(() => {
    if (!activeCompanyId) return;

    const channel = supabase
      .channel(`radar_alerts_${activeCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_radar_alerts",
          filter: `company_id=eq.${activeCompanyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["radar-alerts"] });
          qc.invalidateQueries({ queryKey: ["radar-metrics"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompanyId, qc]);

  // Mutations de ação
  const dismissMutation = useMutation({
    mutationFn: (variables: { alertId: string; conversationId: string }) =>
      dismissRadarAlertAction({ data: variables }),
    onSuccess: () => {
      toast.success("Alerta descartado como falso positivo.");
      qc.invalidateQueries({ queryKey: ["radar-alerts"] });
      qc.invalidateQueries({ queryKey: ["radar-metrics"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao descartar alerta: ${err.message}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (variables: { alertId: string; conversationId: string }) =>
      resolveRadarAlertAction({ data: variables }),
    onSuccess: () => {
      toast.success("Alerta marcado como tratado com sucesso!");
      qc.invalidateQueries({ queryKey: ["radar-alerts"] });
      qc.invalidateQueries({ queryKey: ["radar-metrics"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao resolver alerta: ${err.message}`);
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (variables: { alertId: string; unitId?: string | null }) =>
      createTicketFromRadarAlertAction({
        data: {
          alertId: variables.alertId,
          companyId: activeCompanyId!,
          unitId: variables.unitId || effectiveUnitId || undefined,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(
        `Chamado ${res.ticketCode || "#" + res.ticketNumber} aberto com sucesso a partir do Radar!`,
      );
      qc.invalidateQueries({ queryKey: ["radar-alerts"] });
      qc.invalidateQueries({ queryKey: ["radar-metrics"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao abrir chamado: ${err.message}`);
    },
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      scanRecentConversationsAction({
        data: {
          companyId: activeCompanyId!,
          unitId: effectiveUnitId,
          daysBack: 15,
          limit: 100,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(
        `Varredura concluída! ${res.scanned} conversas analisadas, ${res.matched} suspeitas encontradas e ${res.alertsCreated} novos alertas gerados.`,
      );
      qc.invalidateQueries({ queryKey: ["radar-alerts"] });
      qc.invalidateQueries({ queryKey: ["radar-metrics"] });
    },
    onError: (err: any) => {
      toast.error(`Falha na varredura: ${err.message}`);
    },
  });

  const alerts = alertsData?.alerts || [];

  const filteredAlerts = alerts.filter((alert: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const contactName = alert.contact?.name?.toLowerCase() || "";
    const phone = alert.contact?.phone?.toLowerCase() || "";
    const summary = alert.ai_summary?.toLowerCase() || "";
    const trigger = alert.trigger_message?.toLowerCase() || "";
    return (
      contactName.includes(term) ||
      phone.includes(term) ||
      summary.includes(term) ||
      trigger.includes(term)
    );
  });

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto">
      {/* Barra de Ações Superior (Título oficial exibido no AppHeader) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs font-normal border-rose-500/30 text-rose-600 bg-rose-500/10 gap-1.5 py-1 px-2.5"
          >
            <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
            Sentinela Ativo de Riscos & Churn
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="gap-1.5 h-8 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
            title="Escanear mensagens de clientes dos últimos 15 dias para detectar cancelamentos e falhas não registradas"
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-rose-600" />
            )}
            {scanMutation.isPending ? "Varrendo Histórico..." : "Varredura de Histórico"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAlerts();
              refetchMetrics();
            }}
            disabled={isFetching}
            className="gap-1.5 h-8"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Link to="/tickets">
            <Button variant="default" size="sm" className="gap-1.5 h-8">
              <Ticket className="h-4 w-4" />
              Ver Chamados
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
              Alertas Pendentes
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingMetrics ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                metrics?.pending || 0
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Aguardando intervenção</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs border-l-4 border-l-rose-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
              Riscos de Churn
            </CardTitle>
            <Flame className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {isLoadingMetrics ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                metrics?.churnRisks || 0
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Ameaças de cancelamento</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
              Incidentes Críticos
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingMetrics ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                metrics?.criticalIssues || 0
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Falhas ou risco jurídico</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
              Tickets Gerados
            </CardTitle>
            <Ticket className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoadingMetrics ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                metrics?.ticketsCreated || 0
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Chamados com origem Radar</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Busca */}
      <Card className="p-4 border-border shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, telefone, diagnóstico ou mensagem..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[150px] text-xs h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="ticket_created">Chamado Criado</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
                <SelectItem value="dismissed">Falso Positivo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[160px] text-xs h-9">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                <SelectItem value="churn">Cancelamento (Churn)</SelectItem>
                <SelectItem value="critical_issue">Incidente Crítico</SelectItem>
                <SelectItem value="legal_risk">Risco Jurídico</SelectItem>
                <SelectItem value="severe_dissatisfaction">Insatisfação</SelectItem>
                <SelectItem value="billing">Financeiro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger className="w-[130px] text-xs h-9">
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Severidades</SelectItem>
                <SelectItem value="critical">Crítica</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de Alertas do Radar */}
      {isLoadingAlerts ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Varrendo o radar de conversas...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Radar Limpo!</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
            Nenhuma conversa ativa com risco de cancelamento, incidente crítico ou insatisfação
            grave no momento.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((alert: any) => {
            const cat = CATEGORY_MAP[alert.category] || CATEGORY_MAP.critical_issue;
            const CategoryIcon = cat.icon;
            const sev = SEVERITY_MAP[alert.severity] || SEVERITY_MAP.medium;
            const st = STATUS_MAP[alert.status] || STATUS_MAP.pending;
            const contactName = alert.contact?.name || "Cliente Desconhecido";

            return (
              <Card
                key={alert.id}
                className="overflow-hidden border-border hover:shadow-md transition-shadow"
              >
                <div className="p-5 space-y-4">
                  {/* Topo do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                    <Link
                      to="/conversations"
                      search={{ mode: "clients", c: alert.conversation_id } as any}
                      className="flex items-center gap-3 group"
                    >
                      <ContactAvatar
                        url={alert.contact?.avatar_url}
                        name={contactName}
                        className="h-10 w-10 ring-1 ring-border group-hover:ring-primary transition-all"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                            {contactName}
                          </span>
                          {alert.unit?.name && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {alert.unit.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {alert.contact?.phone || alert.contact?.email || "Sem dados de contato"} •
                          Detectado em{" "}
                          {format(new Date(alert.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cat.bg} ${cat.color} border ${cat.border}`}
                      >
                        <CategoryIcon className="h-3.5 w-3.5" />
                        <span>{cat.label}</span>
                      </div>

                      <Badge className={sev.badgeClass}>{sev.label}</Badge>

                      <Badge variant="outline" className={st.badgeClass}>
                        {st.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Diagnóstico da IA e Mensagem do Cliente */}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-2">
                      <div className="flex items-start gap-2 bg-muted/40 p-3 rounded-lg border border-border/50">
                        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <span className="font-semibold text-foreground">Diagnóstico da IA:</span>
                          <p className="text-muted-foreground leading-relaxed">
                            {alert.ai_summary}
                          </p>
                        </div>
                      </div>

                      {alert.suggested_action && (
                        <div className="text-xs bg-emerald-500/[0.06] border border-emerald-500/20 p-2.5 rounded-lg text-emerald-800 dark:text-emerald-300">
                          <span className="font-semibold">👉 Ação Recomendada: </span>
                          <span>{alert.suggested_action}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-border/40">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Gatilho na Conversa:
                      </span>
                      <p className="text-xs italic text-foreground/90 line-clamp-4">
                        "{alert.trigger_message}"
                      </p>
                    </div>
                  </div>

                  {/* Rodapé do Card com Ações */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
                    <div className="flex items-center gap-2">
                      {alert.ticket ? (
                        <Link to="/tickets">
                          <Badge
                            variant="secondary"
                            className="bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 cursor-pointer gap-1 py-1 px-2.5"
                          >
                            <Ticket className="h-3.5 w-3.5" />
                            {formatTicketCode(alert.ticket)}: {alert.ticket.title} (
                            {alert.ticket.priority === "urgent"
                              ? "Urgente"
                              : alert.ticket.priority === "high"
                                ? "Alta"
                                : alert.ticket.priority === "medium"
                                  ? "Média"
                                  : alert.ticket.priority === "low"
                                    ? "Baixa"
                                    : alert.ticket.priority}
                            )
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">
                          Nenhum chamado aberto ainda para este alerta.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {/* Botão de abrir conversa no chat */}
                      <Link
                        to="/conversations"
                        search={{ mode: "clients", c: alert.conversation_id } as any}
                      >
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Abrir no Chat
                        </Button>
                      </Link>

                      {/* Botão de gerar chamado se não existir */}
                      {!alert.ticket_id && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() =>
                            createTicketMutation.mutate({
                              alertId: alert.id,
                              unitId: alert.unit_id || effectiveUnitId || null,
                            })
                          }
                          disabled={createTicketMutation.isPending}
                        >
                          <Ticket className="h-3.5 w-3.5" />
                          Abrir Chamado
                        </Button>
                      )}

                      {/* Botões de resolver ou falso positivo */}
                      {alert.status !== "resolved" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 gap-1 text-xs"
                          onClick={() =>
                            resolveMutation.mutate({
                              alertId: alert.id,
                              conversationId: alert.conversation_id,
                            })
                          }
                          disabled={resolveMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Tratar / Resolver
                        </Button>
                      )}

                      {alert.status !== "dismissed" && alert.status !== "resolved" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 text-xs"
                          onClick={() =>
                            dismissMutation.mutate({
                              alertId: alert.id,
                              conversationId: alert.conversation_id,
                            })
                          }
                          disabled={dismissMutation.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Falso Positivo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
