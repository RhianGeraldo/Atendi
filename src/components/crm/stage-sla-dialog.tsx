import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { slaMinutesToUnit, slaUnitToMinutes, formatSlaDuration } from "@/types/crm-sla";

interface StageSlaDialogProps {
  stage: {
    id: string;
    name: string;
    color?: string;
    sla_enabled?: boolean | null;
    sla_minutes?: number | null;
    sla_warning_pct?: number | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageSlaDialog({ stage, open, onOpenChange }: StageSlaDialogProps) {
  const qc = useQueryClient();

  const [slaEnabled, setSlaEnabled] = useState(false);
  const [slaValue, setSlaValue] = useState<number>(24);
  const [slaUnit, setSlaUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [warningPct, setWarningPct] = useState<number>(75);

  useEffect(() => {
    if (stage) {
      setSlaEnabled(Boolean(stage.sla_enabled));
      const parsed = slaMinutesToUnit(stage.sla_minutes);
      setSlaValue(parsed.value);
      setSlaUnit(parsed.unit);
      setWarningPct(typeof stage.sla_warning_pct === "number" ? stage.sla_warning_pct : 75);
    }
  }, [stage, open]);

  const totalMinutes = slaUnitToMinutes(slaValue, slaUnit);
  const warningMinutes = Math.round((totalMinutes * warningPct) / 100);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!stage) return;
      const { error } = await supabase
        .from("pipeline_stages")
        .update({
          sla_enabled: slaEnabled,
          sla_minutes: slaEnabled ? totalMinutes : null,
          sla_warning_pct: slaEnabled ? warningPct : 75,
        })
        .eq("id", stage.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SLA da etapa atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar SLA da etapa", { description: err.message });
    },
  });

  if (!stage) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: stage.color || "#3b82f6" }}
            />
            <DialogTitle className="text-base font-semibold">
              SLA da Etapa: {stage.name}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Configure o tempo máximo de permanência das negociações nesta etapa para evitar leads
            parados ou esquecidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Switch de Ativação */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="sla-toggle" className="text-xs font-semibold cursor-pointer">
                Ativar controle de SLA
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Monitorar tempo de resposta e permanência na etapa
              </p>
            </div>
            <Switch id="sla-toggle" checked={slaEnabled} onCheckedChange={setSlaEnabled} />
          </div>

          {slaEnabled && (
            <div className="space-y-4 rounded-lg border border-border/70 p-3.5 bg-card/50">
              {/* Tempo Máximo */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tempo Máximo de Permanência (SLA)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={slaValue}
                    onChange={(e) => setSlaValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-9 text-xs"
                    placeholder="Ex: 24"
                  />
                  <Select
                    value={slaUnit}
                    onValueChange={(val: "minutes" | "hours" | "days") => setSlaUnit(val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutos</SelectItem>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Limiar de Alerta de Risco */}
              <div className="space-y-2.5 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Alerta Prévio de Risco
                  </Label>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    {warningPct}% do tempo
                  </span>
                </div>
                <Slider
                  min={10}
                  max={95}
                  step={5}
                  value={[warningPct]}
                  onValueChange={([val]) => setWarningPct(val)}
                  className="py-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>10% (Precoce)</span>
                  <span>50% (Metade)</span>
                  <span>75% (Padrão)</span>
                  <span>95% (Tardio)</span>
                </div>
              </div>

              {/* Resumo da Regra */}
              <div className="p-3 rounded-md bg-muted/60 border border-border/50 space-y-1.5 text-xs">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  Como funcionará para esta etapa:
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground pt-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>
                      <strong>No Prazo:</strong> até {formatSlaDuration(warningMinutes)} de
                      permanência.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span>
                      <strong>Em Risco (Amarelo):</strong> entre {formatSlaDuration(warningMinutes)}{" "}
                      e {formatSlaDuration(totalMinutes)}.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                    <span>
                      <strong>Estourado (Vermelho):</strong> acima de{" "}
                      {formatSlaDuration(totalMinutes)}.
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/75 italic pt-1">
                    * Aplicado somente para oportunidades em aberto (ganhas ou perdidas não geram
                    atraso).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs font-semibold gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Salvar Configurações de SLA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
