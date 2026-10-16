import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TODOO_CARD_BEHAVIORS,
  TODOO_CARD_BEHAVIOR_ORDER,
  TODOO_STAGE_COLORS,
  TODOO_STAGE_KINDS,
  useTodooPipeline,
  type TodooCardBehavior,
  type TodooStageKind,
} from "./todoo-stages";

type WaitUnit = "hours" | "days";

interface DraftStage {
  key: string;
  id: string | null;
  name: string;
  color: string;
  kind: TodooStageKind;
  waitValue: number;
  waitUnit: WaitUnit;
}

interface DraftStatus {
  key: string;
  id: string | null;
  name: string;
  color: string;
  behavior: TodooCardBehavior;
  is_default: boolean;
}

let draftSeq = 0;
const newKey = () => `draft-${++draftSeq}`;

const toWait = (minutes: number | null): { waitValue: number; waitUnit: WaitUnit } =>
  minutes && minutes % 1440 === 0
    ? { waitValue: minutes / 1440, waitUnit: "days" }
    : { waitValue: minutes ? Math.round(minutes / 60) : 48, waitUnit: "hours" };

const toMinutes = (d: DraftStage) =>
  d.kind === "start" ? null : Math.max(1, Math.round(d.waitValue || 1)) * (d.waitUnit === "days" ? 1440 : 60);

function ColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 w-7 shrink-0 rounded-md border shadow-xs"
          style={{ backgroundColor: color }}
          title="Cor"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-5 gap-1.5">
          {TODOO_STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn("h-6 w-6 rounded-md border", color === c && "ring-2 ring-offset-1 ring-primary")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MoveButtons({ index, total, onMove }: { index: number; total: number; onMove: (dir: -1 | 1) => void }) {
  return (
    <div className="flex flex-col">
      <Button type="button" variant="ghost" size="icon" className="h-5 w-6" disabled={index === 0} onClick={() => onMove(-1)} title="Subir">
        <ArrowUp className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-6"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        title="Descer"
      >
        <ArrowDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Configuração do funil de prospecção: etapas da cadência e status dos cards (admins). */
export function TodooStagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { stages, statuses } = useTodooPipeline();
  const [stageDrafts, setStageDrafts] = useState<DraftStage[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<DraftStatus[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStageDrafts(
      stages.map((s) => ({ key: s.id, id: s.id, name: s.name, color: s.color, kind: s.kind, ...toWait(s.wait_minutes) })),
    );
    setStatusDrafts(
      statuses.map((s) => ({ key: s.id, id: s.id, name: s.name, color: s.color, behavior: s.behavior, is_default: s.is_default })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateStage = (key: string, patch: Partial<DraftStage>) =>
    setStageDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const updateStatus = (key: string, patch: Partial<DraftStatus>) =>
    setStatusDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const kindCount = (kind: TodooStageKind) => stageDrafts.filter((d) => d.kind === kind).length;

  const validate = (): string | null => {
    if (stageDrafts.some((d) => !d.name.trim()) || statusDrafts.some((d) => !d.name.trim())) {
      return "Dê um nome para todas as etapas e status.";
    }
    if (kindCount("start") !== 1) return "O funil precisa de exatamente uma etapa de Início (A contatar).";
    if (stageDrafts[0]?.kind !== "start") return "A etapa de Início precisa ser a primeira.";
    if (kindCount("attempt") < 1) return "O funil precisa de pelo menos uma etapa de Tentativa.";
    if (kindCount("failed") !== 1) return "O funil precisa de exatamente uma etapa Sem sucesso.";
    if (stageDrafts[stageDrafts.length - 1]?.kind !== "failed") return "A etapa Sem sucesso precisa ser a última.";
    const defaults = statusDrafts.filter((d) => d.is_default);
    if (defaults.length !== 1 || defaults[0].behavior !== "active") {
      return "Marque um status padrão (estrela) com o comportamento Cadência segue.";
    }
    return null;
  };

  const handleSave = async () => {
    if (!activeCompanyId) return;
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const table = (name: string) => supabase.from(name as any) as any;

      // Etapas
      const keptStageIds = stageDrafts.filter((d) => d.id).map((d) => d.id as string);
      const removedStages = stages.filter((s) => !keptStageIds.includes(s.id)).map((s) => s.id);
      for (const [position, d] of stageDrafts.entries()) {
        const row = { name: d.name.trim(), color: d.color, kind: d.kind, wait_minutes: toMinutes(d), position, updated_at: now };
        const { error } = d.id
          ? await table("todoo_stages").update(row).eq("id", d.id)
          : await table("todoo_stages").insert({ ...row, company_id: activeCompanyId });
        if (error) throw error;
      }
      if (removedStages.length > 0) {
        // Leads das etapas apagadas recomeçam a cadência no início
        const startId = stageDrafts[0].id;
        if (startId) {
          const { error: moveErr } = await table("todoo_leads").update({ stage_id: startId }).in("stage_id", removedStages);
          if (moveErr) throw moveErr;
        }
        const { error } = await table("todoo_stages").delete().in("id", removedStages);
        if (error) throw error;
      }

      // Status dos cards
      const keptStatusIds = statusDrafts.filter((d) => d.id).map((d) => d.id as string);
      const removedStatuses = statuses.filter((s) => !keptStatusIds.includes(s.id)).map((s) => s.id);
      for (const [position, d] of statusDrafts.entries()) {
        const row = { name: d.name.trim(), color: d.color, behavior: d.behavior, is_default: d.is_default, position, updated_at: now };
        const { error } = d.id
          ? await table("todoo_card_statuses").update(row).eq("id", d.id)
          : await table("todoo_card_statuses").insert({ ...row, company_id: activeCompanyId });
        if (error) throw error;
      }
      if (removedStatuses.length > 0) {
        const { error } = await table("todoo_card_statuses").delete().in("id", removedStatuses);
        if (error) throw error;
      }

      toast.success("Funil de prospecção atualizado!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      queryClient.invalidateQueries({ queryKey: ["todoo-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] grid-cols-1 overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">Funil de prospecção</DialogTitle>
          <DialogDescription className="text-xs">
            Um funil para a empresa toda; cada unidade vê só os seus contatos. A consultora move o card a cada
            tentativa; o tempo da etapa diz quando a próxima tentativa vence.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stages">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="stages" className="text-xs">
              Etapas da cadência
            </TabsTrigger>
            <TabsTrigger value="statuses" className="text-xs">
              Status dos cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="space-y-2 pt-2">
            {stageDrafts.map((d, index) => {
              const KindIcon = TODOO_STAGE_KINDS[d.kind].icon;
              const locked = d.kind !== "attempt";
              return (
                <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
                  <MoveButtons
                    index={index}
                    total={stageDrafts.length}
                    onMove={(dir) => setStageDrafts((prev) => moveItem(prev, index, dir))}
                  />
                  <ColorPicker color={d.color} onChange={(color) => updateStage(d.key, { color })} />
                  <Input
                    value={d.name}
                    placeholder="Nome da etapa"
                    onChange={(e) => updateStage(d.key, { name: e.target.value })}
                    className="h-8 text-xs flex-1 min-w-[140px]"
                    autoFocus={!d.id && !d.name}
                  />
                  <span
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground shrink-0"
                    title={TODOO_STAGE_KINDS[d.kind].hint}
                  >
                    <KindIcon className="h-3 w-3" style={{ color: d.color }} />
                    {TODOO_STAGE_KINDS[d.kind].label}
                  </span>
                  {d.kind === "start" ? (
                    <span className="text-[11px] text-muted-foreground w-[150px] shrink-0">Prazo da ação comercial</span>
                  ) : (
                    <div className="flex items-center gap-1 w-[150px] shrink-0">
                      <span className="text-[11px] text-muted-foreground">{d.kind === "failed" ? "Volta em" : "Próxima em"}</span>
                      <Input
                        type="number"
                        min={1}
                        value={d.waitValue}
                        onChange={(e) => updateStage(d.key, { waitValue: Number(e.target.value) })}
                        className="h-8 w-14 text-xs px-1.5"
                      />
                      <Select value={d.waitUnit} onValueChange={(v) => updateStage(d.key, { waitUnit: v as WaitUnit })}>
                        <SelectTrigger className="h-8 w-[70px] text-xs px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours" className="text-xs">horas</SelectItem>
                          <SelectItem value="days" className="text-xs">dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={locked || kindCount("attempt") <= 1}
                    onClick={() => setStageDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                    title={locked ? "Etapa obrigatória do funil" : "Excluir tentativa (os cards dela voltam ao início)"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() =>
                setStageDrafts((prev) => {
                  const failedIndex = prev.findIndex((d) => d.kind === "failed");
                  const draft: DraftStage = {
                    key: newKey(),
                    id: null,
                    name: `${prev.filter((d) => d.kind === "attempt").length + 1}ª Tentativa`,
                    color: TODOO_STAGE_COLORS[prev.length % TODOO_STAGE_COLORS.length],
                    kind: "attempt",
                    waitValue: 15,
                    waitUnit: "days",
                  };
                  const at = failedIndex >= 0 ? failedIndex : prev.length;
                  return [...prev.slice(0, at), draft, ...prev.slice(at)];
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar tentativa
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Tempos novos valem para os cards que entrarem na etapa a partir de agora.
            </p>
          </TabsContent>

          <TabsContent value="statuses" className="space-y-2 pt-2">
            {statusDrafts.map((d, index) => (
              <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
                <MoveButtons
                  index={index}
                  total={statusDrafts.length}
                  onMove={(dir) => setStatusDrafts((prev) => moveItem(prev, index, dir))}
                />
                <ColorPicker color={d.color} onChange={(color) => updateStatus(d.key, { color })} />
                <Input
                  value={d.name}
                  placeholder="Nome do status"
                  onChange={(e) => updateStatus(d.key, { name: e.target.value })}
                  className="h-8 text-xs flex-1 min-w-[140px]"
                  autoFocus={!d.id && !d.name}
                />
                <Select
                  value={d.behavior}
                  onValueChange={(v) =>
                    updateStatus(d.key, { behavior: v as TodooCardBehavior, ...(v !== "active" ? { is_default: false } : {}) })
                  }
                >
                  <SelectTrigger className="h-8 w-[170px] text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TODOO_CARD_BEHAVIOR_ORDER.map((b) => (
                      <SelectItem key={b} value={b} className="text-xs">
                        <div className="flex flex-col">
                          <span>{TODOO_CARD_BEHAVIORS[b].label}</span>
                          <span className="text-[10px] text-muted-foreground">{TODOO_CARD_BEHAVIORS[b].hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 shrink-0", d.is_default ? "text-amber-500" : "text-muted-foreground")}
                  disabled={d.behavior !== "active"}
                  onClick={() => setStatusDrafts((prev) => prev.map((x) => ({ ...x, is_default: x.key === d.key })))}
                  title="Status padrão dos contatos novos"
                >
                  <Star className={cn("h-3.5 w-3.5", d.is_default && "fill-current")} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={d.is_default}
                  onClick={() => setStatusDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                  title={d.is_default ? "O status padrão não pode ser excluído" : "Excluir status"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() =>
                setStatusDrafts((prev) => [
                  ...prev,
                  {
                    key: newKey(),
                    id: null,
                    name: "",
                    color: TODOO_STAGE_COLORS[prev.length % TODOO_STAGE_COLORS.length],
                    behavior: "paused",
                    is_default: false,
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar status
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar funil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
