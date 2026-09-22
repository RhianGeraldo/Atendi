/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Send,
  RefreshCw,
  Zap,
  DollarSign,
  TrendingUp,
  Sliders,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Eye,
  Activity,
  Calendar,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMetaCapiConfigAction,
  saveMetaCapiConfigAction,
  testMetaCapiEventAction,
  listMetaCapiLogsAction,
} from "@/lib/api/meta-capi.functions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MetaCapiSettingsProps {
  companyId: string;
}

export function MetaCapiSettingsTab({ companyId }: MetaCapiSettingsProps) {
  const qc = useQueryClient();

  // Estados do formulário
  const [enabled, setEnabled] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [trackCtwaLeads, setTrackCtwaLeads] = useState(true);
  const [trackStageMoves, setTrackStageMoves] = useState(true);
  const [trackWonPurchases, setTrackWonPurchases] = useState(true);
  const [defaultLeadValue, setDefaultLeadValue] = useState("");
  const [currency, setCurrency] = useState("BRL");

  // Estado do teste
  const [testFeedback, setTestFeedback] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  // 1. Carregar configurações
  const {
    data: configData,
    isLoading: isLoadingConfig,
    refetch: refetchConfig,
  } = useQuery({
    queryKey: ["meta-capi-config", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await getMetaCapiConfigAction({ data: { companyId } });
      return res;
    },
  });

  // 2. Preencher estados ao carregar dados
  useEffect(() => {
    if (configData?.config) {
      const cfg = configData.config;
      setEnabled(!!cfg.enabled);
      setPixelId(cfg.pixel_id || "");
      setAccessToken(cfg.access_token || "");
      setTestEventCode(cfg.test_event_code || "");
      setTrackCtwaLeads(cfg.track_ctwa_leads ?? true);
      setTrackStageMoves(cfg.track_stage_moves ?? true);
      setTrackWonPurchases(cfg.track_won_purchases ?? true);
      setDefaultLeadValue(cfg.default_lead_value ? String(cfg.default_lead_value) : "");
      setCurrency(cfg.currency || "BRL");
    }
  }, [configData]);

  // 3. Mutation de Salvar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await saveMetaCapiConfigAction({
        data: {
          companyId,
          config: {
            enabled,
            pixel_id: pixelId.trim(),
            access_token: accessToken.trim() || undefined,
            test_event_code: testEventCode.trim() || undefined,
            track_ctwa_leads: trackCtwaLeads,
            track_stage_moves: trackStageMoves,
            track_won_purchases: trackWonPurchases,
            default_lead_value: defaultLeadValue ? parseFloat(defaultLeadValue) : null,
            currency: currency || "BRL",
          },
        },
      });
      return res;
    },
    onSuccess: () => {
      toast.success("Configurações da Meta CAPI salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["meta-capi-config", companyId] });
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar configurações", {
        description: err.message || "Verifique os dados informados.",
      });
    },
  });

  // 4. Mutation de Teste
  const testMutation = useMutation({
    mutationFn: async () => {
      setTestFeedback(null);
      const res = await testMetaCapiEventAction({
        data: {
          companyId,
          testEventCode: testEventCode.trim() || undefined,
          eventName: "Lead",
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if (res.success) {
        setTestFeedback({
          success: true,
          message: `Evento 'Lead' recebido com sucesso pela Meta! (Trace ID: ${res.fbtraceId || res.eventId})`,
          details: res.response,
        });
        toast.success("Evento de teste entregue com sucesso à Meta!");
      } else {
        setTestFeedback({
          success: false,
          message: res.error || "A Meta recusou o evento de teste.",
          details: res.response,
        });
        toast.error("Falha no teste da Meta CAPI", {
          description: res.error,
        });
      }
      qc.invalidateQueries({ queryKey: ["meta-capi-logs", companyId] });
    },
    onError: (err: any) => {
      setTestFeedback({
        success: false,
        message: err.message || "Erro de conexão com o servidor.",
      });
      toast.error("Erro ao disparar teste", { description: err.message });
    },
  });

  // 5. Query de logs recentes
  const {
    data: logsData,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["meta-capi-logs", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await listMetaCapiLogsAction({ data: { companyId, limit: 15 } });
      return res.logs || [];
    },
  });

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando configurações da Meta Conversions API...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Status Card */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">Meta Conversions API (CAPI)</CardTitle>
                  <Badge
                    variant={enabled ? "default" : "secondary"}
                    className={
                      enabled
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                        : ""
                    }
                  >
                    {enabled ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-muted-foreground" /> Inativo
                      </span>
                    )}
                  </Badge>
                </div>
                <CardDescription className="mt-1">
                  Envio server-side de conversões (Leads CTWA, avanço de funil e vendas ganhas)
                  direto para o seu Pixel/Dataset da Meta.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label htmlFor="capi-enabled-switch" className="text-sm font-medium cursor-pointer">
                {enabled ? "Rastreamento Ativado" : "Rastreamento Pausado"}
              </Label>
              <Switch id="capi-enabled-switch" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6 space-y-6">
          {/* Informações da Conexão */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pixel-id">ID do Pixel ou Dataset (Meta) *</Label>
              <Input
                id="pixel-id"
                placeholder="Ex: 123456789012345"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Localize no Gerenciador de Eventos da Meta &gt; Configurações do Conjunto de Dados
                &gt; Identificação do Dataset.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="access-token">Token de Acesso (CAPI)</Label>
                {configData?.hasMetaSystemUserToken && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-300"
                  >
                    <ShieldCheck className="h-3 w-3 mr-1" /> Token de Sistema Conectado
                  </Badge>
                )}
              </div>
              <Input
                id="access-token"
                type="password"
                placeholder="EAA..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Gere no{" "}
                <strong>
                  Gerenciador de Eventos da Meta &gt; Configurações &gt; API de Conversões &gt;
                  Gerar token de acesso
                </strong>
                .
                {configData?.hasMetaSystemUserToken && (
                  <span className="block mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                    * O token de mensageria WhatsApp conectado não possui permissões de anúncios
                    (ads_management). É necessário colar aqui o token gerado no Pixel.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="test-event-code">Código de Teste (Test Event Code)</Label>
              <Input
                id="test-event-code"
                placeholder="Ex: TEST12345"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Acesse a aba <strong>Testar Eventos</strong> no Gerenciador de Eventos da Meta para
                ver os disparos chegando ao vivo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Moeda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL (R$)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead-value">Valor Padrão do Lead</Label>
                <Input
                  id="lead-value"
                  type="number"
                  placeholder="Ex: 50.00"
                  value={defaultLeadValue}
                  onChange={(e) => setDefaultLeadValue(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Gatilhos Automáticos */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Gatilhos de Conversão Automáticos
            </h4>

            <div className="grid gap-4 md:grid-cols-3">
              {/* CTWA Leads */}
              <div className="p-4 rounded-xl border bg-card/60 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-emerald-600" />
                      Anúncios CTWA
                    </span>
                    <Switch checked={trackCtwaLeads} onCheckedChange={setTrackCtwaLeads} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Captura o parâmetro <code>ctwa_clid</code> e envia o evento{" "}
                    <strong>Lead</strong> assim que o cliente clica no anúncio e manda a primeira
                    mensagem no WhatsApp.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] bg-muted/40">
                  Evento: Lead
                </Badge>
              </div>

              {/* CRM Stages */}
              <div className="p-4 rounded-xl border bg-card/60 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs flex items-center gap-1.5">
                      <Sliders className="h-4 w-4 text-blue-600" />
                      Etapas do CRM
                    </span>
                    <Switch checked={trackStageMoves} onCheckedChange={setTrackStageMoves} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Ao mover a oportunidade no Kanban, dispara o evento configurado na etapa (ex:{" "}
                    <strong>Schedule</strong>, <strong>SubmitApplication</strong>).
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] bg-muted/40">
                  Configurável por Etapa
                </Badge>
              </div>

              {/* Purchases */}
              <div className="p-4 rounded-xl border bg-card/60 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      Vendas Ganhas (Purchase)
                    </span>
                    <Switch checked={trackWonPurchases} onCheckedChange={setTrackWonPurchases} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Quando uma oportunidade é marcada como <strong>Ganha</strong>, dispara o evento{" "}
                    <strong>Purchase</strong> contendo o valor exato do negócio fechado.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] bg-muted/40">
                  Evento: Purchase
                </Badge>
              </div>
            </div>
          </div>

          {/* Test Feedback Box */}
          {testFeedback && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                testFeedback.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {testFeedback.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                {testFeedback.message}
              </div>
              {testFeedback.details && (
                <pre className="text-[10px] p-2 bg-background/80 rounded border overflow-x-auto">
                  {JSON.stringify(testFeedback.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t bg-muted/20 py-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !pixelId}
              className="text-xs w-full sm:w-auto"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-2" />
              )}
              Disparar Evento de Teste
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs w-full sm:w-auto"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </CardFooter>
      </Card>

      {/* Histórico / Logs Recentes */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Histórico de Disparos CAPI
              </CardTitle>
              <CardDescription className="text-xs">
                Auditoria em tempo real dos últimos eventos enviados para a Meta.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchLogs()}
              disabled={isLoadingLogs}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoadingLogs ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoadingLogs ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
            </div>
          ) : logsData && logsData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 font-medium">Evento</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Contato</th>
                    <th className="pb-2 font-medium">CTWA CLID</th>
                    <th className="pb-2 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Horário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {logsData.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-medium">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">
                          {log.event_name}
                        </span>
                        {log.test_code && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] py-0">
                            TEST
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5">
                        {log.status === "success" ? (
                          <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Entregue
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center text-destructive font-medium"
                            title={log.error_message || "Erro"}
                          >
                            <AlertCircle className="h-3.5 w-3.5 mr-1" /> Falha
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {log.contacts?.name ? (
                          <span>{log.contacts.name}</span>
                        ) : log.contacts?.phone ? (
                          <span>{log.contacts.phone}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">-</span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-[10px] text-muted-foreground max-w-[140px] truncate">
                        {log.ctwa_clid ? (
                          <span title={log.ctwa_clid}>{log.ctwa_clid.slice(0, 14)}...</span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                      <td className="py-2.5 font-medium">
                        {log.value !== null && log.value !== undefined ? (
                          new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: log.currency || "BRL",
                          }).format(log.value)
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {log.created_at
                          ? format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground border border-dashed rounded-lg space-y-1">
              <p>Nenhum evento CAPI registrado ainda.</p>
              <p className="text-[11px] text-muted-foreground/70">
                Os eventos enviados aparecerão aqui automaticamente quando houver conversões ou
                testes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
