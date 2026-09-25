import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Clock, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Save, 
  Loader2, 
  Timer, 
  Zap,
  Info,
  CalendarClock
} from "lucide-react";

import { useActiveCompany } from "@/lib/active-company-context";
import { getSlaSettingsAction, saveSlaSettingsAction } from "@/lib/api/sla.functions";
import { DEFAULT_SLA_SETTINGS, type SlaSettings } from "@/lib/sla";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function SlaSettingsTab() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(DEFAULT_SLA_SETTINGS.enabled);
  const [firstResponseMins, setFirstResponseMins] = useState(DEFAULT_SLA_SETTINGS.first_response_limit_minutes);
  const [responseMins, setResponseMins] = useState(DEFAULT_SLA_SETTINGS.response_limit_minutes);
  const [resolutionHours, setResolutionHours] = useState(DEFAULT_SLA_SETTINGS.resolution_limit_hours);
  const [warningThreshold, setWarningThreshold] = useState(DEFAULT_SLA_SETTINGS.warning_threshold_percent);
  const [countBusinessHoursOnly, setCountBusinessHoursOnly] = useState(DEFAULT_SLA_SETTINGS.count_business_hours_only);

  // Carrega configurações de SLA
  const { data: config, isLoading } = useQuery({
    queryKey: ["sla-settings", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!activeCompanyId) return DEFAULT_SLA_SETTINGS;
      const res = await getSlaSettingsAction({ data: { companyId: activeCompanyId } });
      return res || DEFAULT_SLA_SETTINGS;
    },
  });

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setFirstResponseMins(config.first_response_limit_minutes);
      setResponseMins(config.response_limit_minutes);
      setResolutionHours(config.resolution_limit_hours);
      setWarningThreshold(config.warning_threshold_percent);
      setCountBusinessHoursOnly(config.count_business_hours_only);
    }
  }, [config]);

  // Salva configurações
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Nenhuma empresa selecionada");

      const payload: SlaSettings = {
        enabled,
        first_response_limit_minutes: Number(firstResponseMins),
        response_limit_minutes: Number(responseMins),
        resolution_limit_hours: Number(resolutionHours),
        warning_threshold_percent: Number(warningThreshold),
        count_business_hours_only: Boolean(countBusinessHoursOnly),
      };

      await saveSlaSettingsAction({
        data: {
          companyId: activeCompanyId,
          settings: payload,
        },
      });
    },
    onSuccess: () => {
      toast.success("Configurações de SLA salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["sla-settings", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar configurações de SLA", {
        description: err.message || "Tente novamente mais tarde.",
      });
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">SLA de Atendimento (Nível de Serviço)</CardTitle>
              </div>
              <CardDescription>
                Configure metas de tempo de resposta para que sua equipe atenda os clientes com máxima agilidade e sem atrasos.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="sla-enabled" className="text-sm font-medium cursor-pointer">
                {enabled ? "Ativo" : "Inativo"}
              </Label>
              <Switch
                id="sla-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando configurações de SLA...</span>
            </div>
          ) : (
            <>
              {/* Metas Principais de Tempo */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-1 border-b border-border/40">
                  <Timer className="h-4 w-4 text-primary" />
                  <span>Metas de Tempo de Atendimento</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Primeira Resposta */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        1ª Resposta (Fila / Aguardando)
                      </Label>
                      <Badge variant="outline" className="text-[10px] font-mono bg-background">
                        {firstResponseMins} min
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Tempo máximo para um atendente assumir e enviar a primeira resposta após a entrada do cliente na fila.
                    </p>
                    <Select
                      value={String(firstResponseMins)}
                      onValueChange={(v) => setFirstResponseMins(Number(v))}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione o tempo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 minutos (Ultra Rápido)</SelectItem>
                        <SelectItem value="5">5 minutos (Rápido)</SelectItem>
                        <SelectItem value="10">10 minutos (Recomendado)</SelectItem>
                        <SelectItem value="15">15 minutos</SelectItem>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Resposta Contínua */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        Retorno Contínuo (Em Andamento)
                      </Label>
                      <Badge variant="outline" className="text-[10px] font-mono bg-background">
                        {responseMins} min
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Tempo máximo de espera do cliente por uma resposta enquanto o atendimento já está ativo com um atendente.
                    </p>
                    <Select
                      value={String(responseMins)}
                      onValueChange={(v) => setResponseMins(Number(v))}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione o tempo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 minutos</SelectItem>
                        <SelectItem value="3">3 minutos</SelectItem>
                        <SelectItem value="5">5 minutos (Recomendado)</SelectItem>
                        <SelectItem value="10">10 minutos</SelectItem>
                        <SelectItem value="15">15 minutos</SelectItem>
                        <SelectItem value="30">30 minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Resolução Total */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        Tempo de Resolução Total
                      </Label>
                      <Badge variant="outline" className="text-[10px] font-mono bg-background">
                        {resolutionHours} horas
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Meta limite para resolver e encerrar completamente a conversa/sessão de atendimento.
                    </p>
                    <Select
                      value={String(resolutionHours)}
                      onValueChange={(v) => setResolutionHours(Number(v))}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione o tempo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hora</SelectItem>
                        <SelectItem value="2">2 horas</SelectItem>
                        <SelectItem value="4">4 horas (Recomendado)</SelectItem>
                        <SelectItem value="8">8 horas (1 dia útil)</SelectItem>
                        <SelectItem value="24">24 horas</SelectItem>
                        <SelectItem value="48">48 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Limiar de Alerta Amarelo */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        Limiar de Atenção (Alerta Amarelo)
                      </Label>
                      <Badge variant="outline" className="text-[10px] font-mono bg-background">
                        {warningThreshold}% do tempo
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Quando a espera atingir esta porcentagem da meta, o status mudará para amarelo avisando que está prestes a vencer.
                    </p>
                    <Select
                      value={String(warningThreshold)}
                      onValueChange={(v) => setWarningThreshold(Number(v))}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione o limiar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50% do tempo</SelectItem>
                        <SelectItem value="70">70% do tempo</SelectItem>
                        <SelectItem value="75">75% do tempo (Recomendado)</SelectItem>
                        <SelectItem value="80">80% do tempo</SelectItem>
                        <SelectItem value="90">90% do tempo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Horário Comercial */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-1 border-b border-border/40">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <span>Jornada de Atendimento</span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card">
                  <div className="space-y-1">
                    <Label htmlFor="business-hours-only" className="text-xs sm:text-sm font-medium cursor-pointer">
                      Pausar SLA fora do Horário Comercial
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Quando ativado, o SLA não é contabilizado nos fins de semana e fora do expediente cadastrado na empresa.
                    </p>
                  </div>
                  <Switch
                    id="business-hours-only"
                    checked={countBusinessHoursOnly}
                    onCheckedChange={setCountBusinessHoursOnly}
                    disabled={!enabled}
                  />
                </div>
              </div>

              {/* Demonstração Visual para os Atendentes */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground pb-1 border-b border-border/40">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Sinalização Visual em Tempo Real</span>
                </div>

                <div className="p-4 rounded-xl border border-border/50 bg-muted/10 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Os atendentes visualizarão os seguintes indicadores coloridos na lista de conversas e no cabeçalho do chat:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          <Clock className="h-2.5 w-2.5" /> ⏱️ 3m
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Dentro do prazo estabelecido</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      <div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          <Clock className="h-2.5 w-2.5" /> ⚠️ 8m
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Atenção (prestes a vencer)</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                      <div className="h-2 w-2 rounded-full bg-destructive shrink-0 animate-ping" />
                      <div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive bg-destructive/15 border border-destructive/30 px-1.5 py-0.5 rounded animate-pulse">
                          <AlertTriangle className="h-2.5 w-2.5" /> 🚨 +5m
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">SLA Estourado (Prioridade máxima)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-2 border-t bg-muted/10 py-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            className="gap-2 shadow-xs"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Configurações de SLA
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
