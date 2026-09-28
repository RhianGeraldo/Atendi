import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckSquare,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  HelpCircle,
  Pencil,
  Check,
  X,
  Zap,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSelectOptions,
  getSelectObservationConfig,
  getQuestionDisqualification,
  type StageChecklistItem,
  type StageChecklistResponseType,
  type StageCompletionActionType,
  type SelectWithObservationConfig,
  type QuestionDisqualificationConfig,
} from "@/types/crm-qualification";

type FormResponseType = "checkbox" | "select" | "select_observation" | "text";

interface StageChecklistDialogProps {
  stage: { id: string; name: string; color: string; pipeline_id: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageChecklistDialog({ stage, open, onOpenChange }: StageChecklistDialogProps) {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const { profile } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [responseType, setResponseType] = useState<FormResponseType>("checkbox");
  const [optionsText, setOptionsText] = useState("");
  const [triggerOption, setTriggerOption] = useState("Sim");
  const [observationPlaceholder, setObservationPlaceholder] = useState("");
  const [observationRequired, setObservationRequired] = useState(true);

  // Desqualificação na criação
  const [disqEnabled, setDisqEnabled] = useState(false);
  const [disqTrigger, setDisqTrigger] = useState("Sim");
  const [disqAction, setDisqAction] = useState<"mark_lost" | "move_to_stage">("mark_lost");
  const [disqTargetStageId, setDisqTargetStageId] = useState("");
  const [disqReason, setDisqReason] = useState("");

  // Estado para edição de pergunta existente
  const [editingItem, setEditingItem] = useState<StageChecklistItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsRequired, setEditIsRequired] = useState(true);
  const [editResponseType, setEditResponseType] = useState<FormResponseType>("checkbox");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editTriggerOption, setEditTriggerOption] = useState("Sim");
  const [editObservationPlaceholder, setEditObservationPlaceholder] = useState("");
  const [editObservationRequired, setEditObservationRequired] = useState(true);

  // Desqualificação na edição
  const [editDisqEnabled, setEditDisqEnabled] = useState(false);
  const [editDisqTrigger, setEditDisqTrigger] = useState("Sim");
  const [editDisqAction, setEditDisqAction] = useState<"mark_lost" | "move_to_stage">("mark_lost");
  const [editDisqTargetStageId, setEditDisqTargetStageId] = useState("");
  const [editDisqReason, setEditDisqReason] = useState("");

  const handleStartEdit = (item: StageChecklistItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditIsRequired(item.is_required);

    const obsConfig = getSelectObservationConfig(item.options);
    const disq = getQuestionDisqualification(item.options);

    if (disq && disq.enabled) {
      setEditDisqEnabled(true);
      setEditDisqTrigger(disq.trigger_value || "Sim");
      setEditDisqAction(disq.action || "mark_lost");
      setEditDisqTargetStageId(disq.target_stage_id || "");
      setEditDisqReason(disq.reason || "");
    } else {
      setEditDisqEnabled(false);
      setEditDisqTrigger("Sim");
      setEditDisqAction("mark_lost");
      setEditDisqTargetStageId("");
      setEditDisqReason("");
    }

    if (item.response_type === "select" && obsConfig) {
      setEditResponseType("select_observation");
      setEditOptionsText(obsConfig.choices.join(", "));
      setEditTriggerOption(obsConfig.trigger_options?.[0] || obsConfig.choices[0] || "Sim");
      setEditObservationPlaceholder(obsConfig.observation_placeholder || "");
      setEditObservationRequired(obsConfig.observation_required ?? true);
    } else {
      setEditResponseType(item.response_type);
      const opts = getSelectOptions(item.options);
      setEditOptionsText(opts.join(", "));
      setEditTriggerOption(opts.includes("Sim") ? "Sim" : opts[0] || "Sim");
      setEditObservationPlaceholder("");
      setEditObservationRequired(true);
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditTitle("");
    setEditDescription("");
    setEditIsRequired(true);
    setEditResponseType("checkbox");
    setEditOptionsText("");
    setEditTriggerOption("Sim");
    setEditObservationPlaceholder("");
    setEditObservationRequired(true);
    setEditDisqEnabled(false);
    setEditDisqTrigger("Sim");
    setEditDisqAction("mark_lost");
    setEditDisqTargetStageId("");
    setEditDisqReason("");
  };

  useEffect(() => {
    if (!open) {
      handleCancelEdit();
    }
  }, [open, stage?.id]);

  const companyId = activeCompanyId || profile?.company_id;

  // Busca outras etapas do mesmo funil para seleção de destino
  const { data: pipelineStages } = useQuery({
    queryKey: ["pipeline-stages-dialog", stage?.pipeline_id],
    enabled: !!stage?.pipeline_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, order, color")
        .eq("pipeline_id", stage!.pipeline_id)
        .order("order", { ascending: true });
      if (error) throw error;
      return (data || []) as { id: string; name: string; order: number; color: string }[];
    },
  });
  const otherStages = (pipelineStages || []).filter((s) => s.id !== stage?.id);

  // Busca automação ao concluir passos da etapa
  const { data: stageAutomation, isLoading: loadingAutomation } = useQuery({
    queryKey: ["stage-automation", stage?.id],
    enabled: !!stage?.id && open && !!companyId,
    queryFn: async () => {
      const { data, error } = (await supabase
        .from("automations" as never)
        .select("*")
        .eq("company_id", companyId)
        .eq("trigger_type", "stage_checklist_completed")
        .contains("trigger_config", { stage_id: stage!.id })
        .maybeSingle()) as {
        data: {
          id: string;
          actions?: { type?: StageCompletionActionType; target_stage_id?: string }[];
        } | null;
        error: Error | null;
      };
      if (error) throw error;
      return data;
    },
  });

  const [completionAction, setCompletionAction] =
    useState<StageCompletionActionType>("advance_next");
  const [completionTargetStageId, setCompletionTargetStageId] = useState<string>("");

  useEffect(() => {
    if (stageAutomation) {
      const actionObj = stageAutomation.actions?.[0];
      if (actionObj?.type) {
        setCompletionAction(actionObj.type);
        setCompletionTargetStageId(actionObj.target_stage_id || "");
      }
    } else {
      setCompletionAction("advance_next");
      setCompletionTargetStageId("");
    }
  }, [stageAutomation, stage?.id]);

  const saveStageAutomation = useMutation({
    mutationFn: async ({
      action,
      targetStageId,
    }: {
      action: StageCompletionActionType;
      targetStageId?: string | null;
    }) => {
      if (!companyId || !stage?.id) return;

      const payload = {
        company_id: companyId,
        name: `Automação da etapa ${stage.name}`,
        description: `Disparado ao concluir os passos da etapa ${stage.name}`,
        trigger_type: "stage_checklist_completed",
        trigger_config: { stage_id: stage.id, pipeline_id: stage.pipeline_id },
        actions: [
          {
            type: action,
            target_stage_id: action === "move_to_stage" ? targetStageId : null,
          },
        ],
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (stageAutomation?.id) {
        const { error } = await supabase
          .from("automations" as never)
          .update(payload)
          .eq("id", stageAutomation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("automations" as never).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-automation", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-automations"] });
      toast.success("Automação da etapa atualizada com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar automação da etapa: " + (err.message || "Tente novamente"));
    },
  });

  // Busca itens cadastrados para esta etapa
  const { data: items, isLoading } = useQuery({
    queryKey: ["stage-checklist-items", stage?.id],
    enabled: !!stage?.id && open,
    queryFn: async () => {
      if (!stage?.id) return [];
      const { data, error } = await supabase
        .from("stage_checklist_items" as never)
        .select("*")
        .eq("stage_id", stage.id)
        .order("order_index", { ascending: true });

      if (error) {
        console.error("Erro ao carregar critérios da etapa:", error);
        return [];
      }
      return (data || []) as StageChecklistItem[];
    },
  });

  // Mutação para criar novo passo/critério
  const createItem = useMutation({
    mutationFn: async () => {
      if (!stage?.id || !companyId || !title.trim()) return;

      let finalOptions: StageChecklistOptions = [];
      let finalResponseType: StageChecklistResponseType = "checkbox";

      const disqPayload = disqEnabled
        ? {
            enabled: true,
            trigger_value: disqTrigger.trim() || "Sim",
            action: disqAction,
            target_stage_id: disqAction === "move_to_stage" ? disqTargetStageId || null : null,
            reason: disqReason.trim() || null,
          }
        : null;

      if (responseType === "select") {
        finalResponseType = "select";
        const choices = optionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (choices.length === 0) {
          throw new Error(
            "Informe pelo menos uma opção para a pergunta do tipo Seleção (separadas por vírgula).",
          );
        }
        finalOptions = disqEnabled
          ? {
              choices,
              disqualification: disqPayload,
            }
          : choices;
      } else if (responseType === "select_observation") {
        finalResponseType = "select";
        const choices = optionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (choices.length === 0) {
          throw new Error("Informe as opções para a pergunta (ex: Sim, Não).");
        }
        const trig = triggerOption.trim() || choices[0];
        finalOptions = {
          choices,
          trigger_options: [trig],
          observation_placeholder: observationPlaceholder.trim() || null,
          observation_required: observationRequired,
          disqualification: disqPayload,
        };
      } else if (responseType === "text") {
        finalResponseType = "text";
        finalOptions = [];
      } else {
        finalResponseType = "checkbox";
        finalOptions = [];
      }

      const nextOrder = (items?.length || 0) + 1;
      const { error } = await supabase.from("stage_checklist_items" as never).insert({
        stage_id: stage.id,
        company_id: companyId,
        title: title.trim(),
        description: description.trim() || null,
        response_type: finalResponseType,
        options: finalOptions,
        is_required: isRequired,
        order_index: nextOrder,
        created_by: profile?.id || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Critério adicionado à etapa!");
      setTitle("");
      setDescription("");
      setResponseType("checkbox");
      setOptionsText("");
      setTriggerOption("Sim");
      setObservationPlaceholder("");
      setObservationRequired(true);
      setIsRequired(true);
      setDisqEnabled(false);
      setDisqTrigger("Sim");
      setDisqAction("mark_lost");
      setDisqTargetStageId("");
      setDisqReason("");
      qc.invalidateQueries({ queryKey: ["stage-checklist-items", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-items-by-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-counts"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao adicionar critério", { description: err.message });
    },
  });

  // Mutação para atualizar pergunta/critério existente
  const updateItem = useMutation({
    mutationFn: async () => {
      if (!editingItem || !editTitle.trim()) return;

      let finalOptions: StageChecklistOptions = [];
      let finalResponseType: StageChecklistResponseType = "checkbox";

      const editDisqPayload = editDisqEnabled
        ? {
            enabled: true,
            trigger_value: editDisqTrigger.trim() || "Sim",
            action: editDisqAction,
            target_stage_id:
              editDisqAction === "move_to_stage" ? editDisqTargetStageId || null : null,
            reason: editDisqReason.trim() || null,
          }
        : null;

      if (editResponseType === "select") {
        finalResponseType = "select";
        const choices = editOptionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (choices.length === 0) {
          throw new Error(
            "Informe pelo menos uma opção para a pergunta do tipo Seleção (separadas por vírgula).",
          );
        }
        finalOptions = editDisqEnabled
          ? {
              choices,
              disqualification: editDisqPayload,
            }
          : choices;
      } else if (editResponseType === "select_observation") {
        finalResponseType = "select";
        const choices = editOptionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (choices.length === 0) {
          throw new Error("Informe as opções para a pergunta (ex: Sim, Não).");
        }
        const trig = editTriggerOption.trim() || choices[0];
        finalOptions = {
          choices,
          trigger_options: [trig],
          observation_placeholder: editObservationPlaceholder.trim() || null,
          observation_required: editObservationRequired,
          disqualification: editDisqPayload,
        };
      } else if (editResponseType === "text") {
        finalResponseType = "text";
        finalOptions = [];
      } else {
        finalResponseType = "checkbox";
        finalOptions = [];
      }

      const { error } = await supabase
        .from("stage_checklist_items" as never)
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          response_type: finalResponseType,
          options: finalOptions,
          is_required: editIsRequired,
        })
        .eq("id", editingItem.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pergunta atualizada com sucesso!");
      handleCancelEdit();
      qc.invalidateQueries({ queryKey: ["stage-checklist-items", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-items-by-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-counts"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao atualizar pergunta: " + (err.message || "Tente novamente"));
    },
  });

  // Mutação para alternar se o item é obrigatório
  const toggleRequired = useMutation({
    mutationFn: async ({ id, isRequired }: { id: string; isRequired: boolean }) => {
      const { error } = await supabase
        .from("stage_checklist_items" as never)
        .update({ is_required: isRequired })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-checklist-items", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-items-by-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao alterar requisito", { description: err.message });
    },
  });

  // Mutação para reordenar
  const moveItem = useMutation({
    mutationFn: async ({
      item,
      direction,
    }: {
      item: StageChecklistItem;
      direction: "up" | "down";
    }) => {
      if (!items) return;
      const currentIndex = items.findIndex((i) => i.id === item.id);
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      const otherItem = items[targetIndex];

      // Troca os índices de ordem
      await supabase
        .from("stage_checklist_items" as never)
        .update({ order_index: otherItem.order_index })
        .eq("id", item.id);

      await supabase
        .from("stage_checklist_items" as never)
        .update({ order_index: item.order_index })
        .eq("id", otherItem.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-checklist-items", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-items-by-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao reordenar", { description: err.message });
    },
  });

  // Mutação para excluir critério
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("stage_checklist_items" as never)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      toast.success("Critério removido.");
      if (editingItem?.id === deletedId) {
        handleCancelEdit();
      }
      qc.invalidateQueries({ queryKey: ["stage-checklist-items", stage?.id] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-items-by-stages"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
      qc.invalidateQueries({ queryKey: ["stage-checklist-counts"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao excluir", { description: err.message });
    },
  });

  if (!stage) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ backgroundColor: stage.color || "#3b82f6" }}
            />
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Passos da Etapa: {stage.name}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Defina as perguntas e critérios que o atendente deve preencher durante esta etapa. Ao
            completar 100% dos passos obrigatórios, a oportunidade avança de etapa automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Automação da Etapa ao Concluir */}
          <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/[0.03] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Automação ao Concluir os Passos
                    <Badge
                      variant="secondary"
                      className="text-[9px] py-0 h-4 bg-primary/10 text-primary border-primary/20"
                    >
                      Personalizável
                    </Badge>
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    O que acontece com a oportunidade quando 100% dos passos obrigatórios forem
                    concluídos?
                  </p>
                </div>
              </div>
              {saveStageAutomation.isPending && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-foreground">Ação de Conclusão</Label>
                <Select
                  value={completionAction}
                  onValueChange={(val: StageCompletionActionType) => {
                    setCompletionAction(val);
                    saveStageAutomation.mutate({
                      action: val,
                      targetStageId: completionTargetStageId,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Selecione a ação..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance_next" className="text-xs">
                      ➡️ Avançar para a próxima etapa (Padrão)
                    </SelectItem>
                    <SelectItem value="mark_won" className="text-xs">
                      🎉 Concluir e marcar como GANHA
                    </SelectItem>
                    <SelectItem value="mark_lost" className="text-xs">
                      ❌ Concluir e marcar como PERDIDA
                    </SelectItem>
                    <SelectItem value="move_to_stage" className="text-xs">
                      🔀 Mover para uma etapa específica...
                    </SelectItem>
                    <SelectItem value="none" className="text-xs">
                      ⏸️ Manter nesta etapa (não mover)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {completionAction === "move_to_stage" && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <Label className="text-[10px] font-medium text-foreground">
                    Etapa de Destino <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={completionTargetStageId}
                    onValueChange={(val: string) => {
                      setCompletionTargetStageId(val);
                      saveStageAutomation.mutate({ action: completionAction, targetStageId: val });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Escolha a etapa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {otherStages.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Formulário de Adicionar Critério */}
          <div className="p-4 rounded-xl border border-border/70 bg-card space-y-3.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-semibold text-foreground">
                Novo Critério / Pergunta de Qualificação
              </h4>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-title" className="text-xs font-medium">
                Pergunta ou Ação <span className="text-destructive">*</span>
              </Label>
              <Input
                id="item-title"
                placeholder="Ex: Qualificou o orçamento previsto? / Confirmou a data?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) {
                    createItem.mutate();
                  }
                }}
                className="bg-background text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tipo de Resposta</Label>
                <Select
                  value={responseType}
                  onValueChange={(val: FormResponseType) => setResponseType(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkbox" className="text-xs">
                      ☑️ Checkbox (Sim / Concluído)
                    </SelectItem>
                    <SelectItem value="select" className="text-xs">
                      📋 Seleção Única (Dropdown simples)
                    </SelectItem>
                    <SelectItem value="select_observation" className="text-xs">
                      📝 Seleção com Observação (Estilo Google Forms)
                    </SelectItem>
                    <SelectItem value="text" className="text-xs">
                      ✏️ Texto Livre (Resposta aberta)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(responseType === "select" || responseType === "select_observation") && (
                <div className="space-y-1.5">
                  <Label htmlFor="item-options" className="text-xs font-medium">
                    Opções da Lista <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="item-options"
                    placeholder="Ex: Sim, Não"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    className="bg-background text-xs h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">Separe as opções por vírgula.</p>
                </div>
              )}
            </div>

            {responseType === "select_observation" && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <span>📝 Regra de Observação Condicional</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-foreground">
                      Opção que abre a observação <span className="text-destructive">*</span>
                    </Label>
                    {(() => {
                      const choices = optionsText
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (choices.length > 0) {
                        return (
                          <Select
                            value={triggerOption || (choices.includes("Sim") ? "Sim" : choices[0])}
                            onValueChange={setTriggerOption}
                          >
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue placeholder="Selecione a opção..." />
                            </SelectTrigger>
                            <SelectContent>
                              {choices.map((c, i) => (
                                <SelectItem key={i} value={c} className="text-xs">
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          placeholder="Ex: Sim"
                          value={triggerOption}
                          onChange={(e) => setTriggerOption(e.target.value)}
                          className="bg-background text-xs h-8"
                        />
                      );
                    })()}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-foreground">
                      Pergunta / Placeholder da Observação
                    </Label>
                    <Input
                      placeholder="Ex: Qual e por quê? / Especifique..."
                      value={observationPlaceholder}
                      onChange={(e) => setObservationPlaceholder(e.target.value)}
                      className="bg-background text-xs h-8"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                  <Switch
                    id="item-obs-required"
                    checked={observationRequired}
                    onCheckedChange={setObservationRequired}
                  />
                  <Label
                    htmlFor="item-obs-required"
                    className="text-[11px] font-medium cursor-pointer"
                  >
                    Observação obrigatória ao escolher essa opção
                  </Label>
                </div>
              </div>
            )}

            {(responseType === "select" || responseType === "select_observation") && (
              <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/[0.03] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Regra de Desqualificação (Eliminatória)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="item-disq-toggle"
                      checked={disqEnabled}
                      onCheckedChange={setDisqEnabled}
                    />
                    <Label
                      htmlFor="item-disq-toggle"
                      className="text-[11px] font-medium cursor-pointer"
                    >
                      {disqEnabled ? "Ativada" : "Desativada"}
                    </Label>
                  </div>
                </div>

                {disqEnabled && (
                  <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                    <p className="text-[10px] text-muted-foreground">
                      Se o cliente responder a opção eliminatória (ex: gestante, contraindicação), a
                      oportunidade será tratada imediatamente.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-foreground">
                          Se a resposta for igual a:
                        </Label>
                        {(() => {
                          const choices = optionsText
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (choices.length > 0) {
                            return (
                              <Select
                                value={
                                  disqTrigger || (choices.includes("Sim") ? "Sim" : choices[0])
                                }
                                onValueChange={setDisqTrigger}
                              >
                                <SelectTrigger className="h-8 text-xs bg-background">
                                  <SelectValue placeholder="Selecione a opção..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {choices.map((c, i) => (
                                    <SelectItem key={i} value={c} className="text-xs">
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }
                          return (
                            <Input
                              placeholder="Ex: Sim"
                              value={disqTrigger}
                              onChange={(e) => setDisqTrigger(e.target.value)}
                              className="bg-background text-xs h-8"
                            />
                          );
                        })()}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium text-foreground">
                          Ação Imediata:
                        </Label>
                        <Select
                          value={disqAction}
                          onValueChange={(val: "mark_lost" | "move_to_stage") => setDisqAction(val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue placeholder="Selecione a ação..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mark_lost" className="text-xs">
                              ❌ Marcar como Perdida (Desqualificar)
                            </SelectItem>
                            <SelectItem value="move_to_stage" className="text-xs">
                              🔀 Mover para etapa de descarte...
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {disqAction === "move_to_stage" && (
                      <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        <Label className="text-[10px] font-medium text-foreground">
                          Etapa de Destino <span className="text-destructive">*</span>
                        </Label>
                        <Select value={disqTargetStageId} onValueChange={setDisqTargetStageId}>
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue placeholder="Selecione a etapa..." />
                          </SelectTrigger>
                          <SelectContent>
                            {otherStages.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground">
                        Motivo registrado no histórico (opcional):
                      </Label>
                      <Input
                        placeholder="Ex: Contraindicação médica detectada na pré-avaliação"
                        value={disqReason}
                        onChange={(e) => setDisqReason(e.target.value)}
                        className="bg-background text-xs h-8"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="item-desc" className="text-xs font-medium text-muted-foreground">
                Orientações para o atendente (opcional)
              </Label>
              <Input
                id="item-desc"
                placeholder="Ex: Perguntar se tem flexibilidade de pagamento no boleto ou cartão"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch id="item-required" checked={isRequired} onCheckedChange={setIsRequired} />
                <Label htmlFor="item-required" className="text-xs font-medium cursor-pointer">
                  Item obrigatório para avançar de etapa
                </Label>
              </div>

              <Button
                size="sm"
                onClick={() => createItem.mutate()}
                disabled={!title.trim() || createItem.isPending}
                className="h-8 px-3 text-xs gap-1.5"
              >
                {createItem.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Adicionar Passo
              </Button>
            </div>
          </div>

          {/* Listagem de Critérios Existentes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Critérios Configurados ({items?.length || 0})
              </h4>
              {items && items.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {items.filter((i) => i.is_required).length} obrigatórios
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !items || items.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed text-center bg-muted/10 space-y-1.5">
                <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                <p className="text-xs font-medium text-foreground">
                  Nenhum passo cadastrado nesta etapa.
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Sem passos configurados, a oportunidade pode ser movida livremente pelos
                  atendentes sem critérios automáticos.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, index) => {
                  const isEditingThis = editingItem?.id === item.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl border-2 border-primary/40 bg-primary/[0.03] space-y-3.5 shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Pencil className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-semibold text-foreground">
                              Editar Pergunta #{index + 1}
                            </h4>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={handleCancelEdit}
                            title="Cancelar edição"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`edit-title-${item.id}`} className="text-xs font-medium">
                            Pergunta ou Ação <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id={`edit-title-${item.id}`}
                            placeholder="Ex: Qualificou o orçamento previsto? / Confirmou a data?"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editTitle.trim()) {
                                updateItem.mutate();
                              }
                            }}
                            className="bg-background text-xs"
                            autoFocus
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Tipo de Resposta</Label>
                            <Select
                              value={editResponseType}
                              onValueChange={(val: FormResponseType) => setEditResponseType(val)}
                            >
                              <SelectTrigger className="h-8 text-xs bg-background">
                                <SelectValue placeholder="Selecione o tipo..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="checkbox" className="text-xs">
                                  ☑️ Checkbox (Sim / Concluído)
                                </SelectItem>
                                <SelectItem value="select" className="text-xs">
                                  📋 Seleção Única (Dropdown simples)
                                </SelectItem>
                                <SelectItem value="select_observation" className="text-xs">
                                  📝 Seleção com Observação (Estilo Google Forms)
                                </SelectItem>
                                <SelectItem value="text" className="text-xs">
                                  ✏️ Texto Livre (Resposta aberta)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {(editResponseType === "select" ||
                            editResponseType === "select_observation") && (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`edit-options-${item.id}`}
                                className="text-xs font-medium"
                              >
                                Opções da Lista <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id={`edit-options-${item.id}`}
                                placeholder="Ex: Sim, Não"
                                value={editOptionsText}
                                onChange={(e) => setEditOptionsText(e.target.value)}
                                className="bg-background text-xs h-8"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Separe as opções por vírgula.
                              </p>
                            </div>
                          )}
                        </div>

                        {editResponseType === "select_observation" && (
                          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              <span>📝 Regra de Observação Condicional</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-foreground">
                                  Opção que abre a observação{" "}
                                  <span className="text-destructive">*</span>
                                </Label>
                                {(() => {
                                  const choices = editOptionsText
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  if (choices.length > 0) {
                                    return (
                                      <Select
                                        value={
                                          editTriggerOption ||
                                          (choices.includes("Sim") ? "Sim" : choices[0])
                                        }
                                        onValueChange={setEditTriggerOption}
                                      >
                                        <SelectTrigger className="h-8 text-xs bg-background">
                                          <SelectValue placeholder="Selecione a opção..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {choices.map((c, i) => (
                                            <SelectItem key={i} value={c} className="text-xs">
                                              {c}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    );
                                  }
                                  return (
                                    <Input
                                      placeholder="Ex: Sim"
                                      value={editTriggerOption}
                                      onChange={(e) => setEditTriggerOption(e.target.value)}
                                      className="bg-background text-xs h-8"
                                    />
                                  );
                                })()}
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] font-medium text-foreground">
                                  Pergunta / Placeholder da Observação
                                </Label>
                                <Input
                                  placeholder="Ex: Qual e por quê? / Especifique..."
                                  value={editObservationPlaceholder}
                                  onChange={(e) => setEditObservationPlaceholder(e.target.value)}
                                  className="bg-background text-xs h-8"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                              <Switch
                                id={`edit-obs-req-${item.id}`}
                                checked={editObservationRequired}
                                onCheckedChange={setEditObservationRequired}
                              />
                              <Label
                                htmlFor={`edit-obs-req-${item.id}`}
                                className="text-[11px] font-medium cursor-pointer"
                              >
                                Observação obrigatória ao escolher essa opção
                              </Label>
                            </div>
                          </div>
                        )}

                        {(editResponseType === "select" ||
                          editResponseType === "select_observation") && (
                          <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/[0.03] space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                <span>Regra de Desqualificação (Eliminatória)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  id={`edit-disq-toggle-${item.id}`}
                                  checked={editDisqEnabled}
                                  onCheckedChange={setEditDisqEnabled}
                                />
                                <Label
                                  htmlFor={`edit-disq-toggle-${item.id}`}
                                  className="text-[11px] font-medium cursor-pointer"
                                >
                                  {editDisqEnabled ? "Ativada" : "Desativada"}
                                </Label>
                              </div>
                            </div>

                            {editDisqEnabled && (
                              <div className="space-y-2.5 pt-1 animate-in fade-in duration-150">
                                <p className="text-[10px] text-muted-foreground">
                                  Se o cliente responder a opção eliminatória (ex: gestante,
                                  contraindicação), a oportunidade será tratada imediatamente.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-medium text-foreground">
                                      Se a resposta for igual a:
                                    </Label>
                                    {(() => {
                                      const choices = editOptionsText
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean);
                                      if (choices.length > 0) {
                                        return (
                                          <Select
                                            value={
                                              editDisqTrigger ||
                                              (choices.includes("Sim") ? "Sim" : choices[0])
                                            }
                                            onValueChange={setEditDisqTrigger}
                                          >
                                            <SelectTrigger className="h-8 text-xs bg-background">
                                              <SelectValue placeholder="Selecione a opção..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {choices.map((c, i) => (
                                                <SelectItem key={i} value={c} className="text-xs">
                                                  {c}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        );
                                      }
                                      return (
                                        <Input
                                          placeholder="Ex: Sim"
                                          value={editDisqTrigger}
                                          onChange={(e) => setEditDisqTrigger(e.target.value)}
                                          className="bg-background text-xs h-8"
                                        />
                                      );
                                    })()}
                                  </div>

                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-medium text-foreground">
                                      Ação Imediata:
                                    </Label>
                                    <Select
                                      value={editDisqAction}
                                      onValueChange={(val: "mark_lost" | "move_to_stage") =>
                                        setEditDisqAction(val)
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-background">
                                        <SelectValue placeholder="Selecione a ação..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="mark_lost" className="text-xs">
                                          ❌ Marcar como Perdida (Desqualificar)
                                        </SelectItem>
                                        <SelectItem value="move_to_stage" className="text-xs">
                                          🔀 Mover para etapa de descarte...
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                {editDisqAction === "move_to_stage" && (
                                  <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                                    <Label className="text-[10px] font-medium text-foreground">
                                      Etapa de Destino <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                      value={editDisqTargetStageId}
                                      onValueChange={setEditDisqTargetStageId}
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-background">
                                        <SelectValue placeholder="Selecione a etapa..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {otherStages.map((s) => (
                                          <SelectItem key={s.id} value={s.id} className="text-xs">
                                            {s.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <Label className="text-[10px] font-medium text-muted-foreground">
                                    Motivo registrado no histórico (opcional):
                                  </Label>
                                  <Input
                                    placeholder="Ex: Contraindicação médica detectada na pré-avaliação"
                                    value={editDisqReason}
                                    onChange={(e) => setEditDisqReason(e.target.value)}
                                    className="bg-background text-xs h-8"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`edit-desc-${item.id}`}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Orientações para o atendente (opcional)
                          </Label>
                          <Input
                            id={`edit-desc-${item.id}`}
                            placeholder="Ex: Perguntar se tem flexibilidade de pagamento no boleto ou cartão"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="bg-background text-xs"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`edit-required-${item.id}`}
                              checked={editIsRequired}
                              onCheckedChange={setEditIsRequired}
                            />
                            <Label
                              htmlFor={`edit-required-${item.id}`}
                              className="text-xs font-medium cursor-pointer"
                            >
                              Item obrigatório para avançar de etapa
                            </Label>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleCancelEdit}
                              disabled={updateItem.isPending}
                              className="h-8 px-3 text-xs"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => updateItem.mutate()}
                              disabled={!editTitle.trim() || updateItem.isPending}
                              className="h-8 px-3 text-xs gap-1.5"
                            >
                              {updateItem.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Salvar Alterações
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const choices = getSelectOptions(item.options);
                  const obsConfig = getSelectObservationConfig(item.options);
                  const disqConfig = getQuestionDisqualification(item.options);

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/70 bg-card hover:bg-muted/20 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">
                          {index + 1}.
                        </span>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground truncate">
                              {item.title}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 h-4 font-semibold ${
                                item.is_required
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-muted text-muted-foreground border-border/80"
                              }`}
                            >
                              {item.is_required ? "Obrigatório" : "Opcional"}
                            </Badge>

                            {item.response_type === "select" && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[9px] px-1.5 py-0 h-4 border",
                                  obsConfig
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold"
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                                )}
                              >
                                {obsConfig
                                  ? `Seleção + Obs (${obsConfig.trigger_options?.[0] || "Sim"})`
                                  : `Seleção (${choices.length})`}
                              </Badge>
                            )}

                            {item.response_type === "text" && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                              >
                                Texto
                              </Badge>
                            )}

                            {disqConfig && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-medium flex items-center gap-1"
                                title={
                                  disqConfig.reason ||
                                  `Eliminatória se responder "${disqConfig.trigger_value}"`
                                }
                              >
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Elimina se "{disqConfig.trigger_value}" (
                                {disqConfig.action === "mark_lost" ? "Perdida" : "Mover"})
                              </Badge>
                            )}
                          </div>
                          {item.description && (
                            <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                              {item.description}
                            </span>
                          )}
                          {item.response_type === "select" && choices.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[10px] text-muted-foreground">Opções:</span>
                              {choices.map((opt, oIdx) => {
                                const isTrig = obsConfig?.trigger_options?.includes(opt);
                                return (
                                  <span
                                    key={oIdx}
                                    className={cn(
                                      "text-[10px] px-1.5 py-0 rounded border font-mono",
                                      isTrig
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold"
                                        : "bg-muted text-muted-foreground border-border/40",
                                    )}
                                  >
                                    {opt}
                                    {isTrig ? " (abre obs)" : ""}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          onClick={() => handleStartEdit(item)}
                          title="Editar pergunta"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={index === 0 || moveItem.isPending}
                          onClick={() => moveItem.mutate({ item, direction: "up" })}
                          title="Subir na ordem"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={index === items.length - 1 || moveItem.isPending}
                          onClick={() => moveItem.mutate({ item, direction: "down" })}
                          title="Descer na ordem"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => {
                            if (confirm(`Remover o critério "${item.title}"?`)) {
                              deleteItem.mutate(item.id);
                            }
                          }}
                          title="Excluir critério"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/10 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
