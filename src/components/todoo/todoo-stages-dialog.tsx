import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  TODOO_STAGE_COLORS,
  TODOO_STAGE_KINDS,
  TODOO_STAGE_KIND_ORDER,
  useTodooStages,
  type TodooStageKind,
} from "./todoo-stages";

interface DraftStage {
  key: string;
  id: string | null;
  name: string;
  color: string;
  kind: TodooStageKind;
}

let draftSeq = 0;
const newKey = () => `draft-${++draftSeq}`;

/** Configuração das etapas do Quadro Comercial (admins da empresa). */
export function TodooStagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { stages, isCustom } = useTodooStages();
  const [drafts, setDrafts] = useState<DraftStage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDrafts(stages.map((s) => ({ key: s.id ?? newKey(), id: s.id, name: s.name, color: s.color, kind: s.kind })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (key: string, patch: Partial<DraftStage>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const move = (index: number, dir: -1 | 1) =>
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const kindCount = (kind: TodooStageKind) => drafts.filter((d) => d.kind === kind).length;

  const addStage = () =>
    setDrafts((prev) => [
      ...prev,
      { key: newKey(), id: null, name: "", color: TODOO_STAGE_COLORS[prev.length % TODOO_STAGE_COLORS.length], kind: "in_progress" },
    ]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["todoo-stages"] });
    queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
  };

  const handleSave = async () => {
    if (!activeCompanyId) return;
    if (drafts.some((d) => !d.name.trim())) {
      toast.error("Dê um nome para todas as etapas.");
      return;
    }
    const missing = TODOO_STAGE_KIND_ORDER.filter((k) => kindCount(k) === 0);
    if (missing.length > 0) {
      toast.error(
        `Cada tipo precisa de pelo menos uma etapa. Falta: ${missing.map((k) => TODOO_STAGE_KINDS[k].label).join(", ")}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const keptIds = drafts.filter((d) => d.id).map((d) => d.id as string);
      const removed = stages.filter((s) => s.id && !keptIds.includes(s.id)).map((s) => s.id as string);
      const now = new Date().toISOString();

      for (const [position, d] of drafts.entries()) {
        const row = { name: d.name.trim(), color: d.color, kind: d.kind, position, updated_at: now };
        const { error } = d.id
          ? await (supabase.from("todoo_stages") as any).update(row).eq("id", d.id)
          : await (supabase.from("todoo_stages") as any).insert({ ...row, company_id: activeCompanyId });
        if (error) throw error;
      }

      if (removed.length > 0) {
        const { error } = await (supabase.from("todoo_stages") as any).delete().in("id", removed);
        if (error) throw error;
      }

      toast.success("Etapas do Quadro atualizadas!");
      invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar etapas: " + err.message);
      invalidate();
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!activeCompanyId || !isCustom) return;
    if (!window.confirm("Voltar às 6 etapas padrão? As etapas personalizadas serão apagadas.")) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from("todoo_stages") as any)
        .delete()
        .eq("company_id", activeCompanyId);
      if (error) throw error;
      toast.success("Etapas padrão restauradas.");
      invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao restaurar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Etapas do Quadro Comercial</DialogTitle>
          <DialogDescription className="text-xs">
            Renomeie, mude a cor, reordene ou crie etapas. O tipo define o comportamento: ao arrastar
            para Agendado, Retorno, Venda ou Sem sucesso, o sistema pede o desfecho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {drafts.map((d, index) => {
            const KindIcon = TODOO_STAGE_KINDS[d.kind].icon;
            const lastOfKind = kindCount(d.kind) <= 1;
            return (
              <div key={d.key} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-6"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    title="Subir"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-6"
                    disabled={index === drafts.length - 1}
                    onClick={() => move(index, 1)}
                    title="Descer"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-7 w-7 shrink-0 rounded-md border shadow-xs"
                      style={{ backgroundColor: d.color }}
                      title="Cor da etapa"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="grid grid-cols-5 gap-1.5">
                      {TODOO_STAGE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => update(d.key, { color: c })}
                          className={cn(
                            "h-6 w-6 rounded-md border",
                            d.color === c && "ring-2 ring-offset-1 ring-primary",
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Input
                  value={d.name}
                  placeholder="Nome da etapa"
                  onChange={(e) => update(d.key, { name: e.target.value })}
                  className="h-8 text-xs flex-1 min-w-0"
                  autoFocus={!d.id && !d.name}
                />

                <Select value={d.kind} onValueChange={(v) => update(d.key, { kind: v as TodooStageKind })}>
                  <SelectTrigger className="h-8 w-[160px] text-xs shrink-0">
                    <span className="flex items-center gap-1.5 truncate">
                      <KindIcon className="h-3.5 w-3.5 shrink-0" style={{ color: d.color }} />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {TODOO_STAGE_KIND_ORDER.map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        <div className="flex flex-col">
                          <span>{TODOO_STAGE_KINDS[k].label}</span>
                          <span className="text-[10px] text-muted-foreground">{TODOO_STAGE_KINDS[k].hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={lastOfKind}
                  onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                  title={
                    lastOfKind
                      ? `É a única etapa do tipo ${TODOO_STAGE_KINDS[d.kind].label}`
                      : "Excluir etapa (os leads dela vão para outra etapa do mesmo tipo)"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={addStage}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar etapa
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleRestore}
            disabled={!isCustom || saving}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar etapas
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
