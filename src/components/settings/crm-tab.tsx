import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, GripVertical, Settings2, ChevronUp, ChevronDown } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { useActiveCompany } from "@/lib/active-company-context";

export function CrmTab() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();

  const [newPipelineName, setNewPipelineName] = useState("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [deletingPipeline, setDeletingPipeline] = useState<{ id: string; name: string } | null>(
    null,
  );

  // Fetch Pipelines
  const { data: pipelines, isLoading: isLoadingPipelines } = useQuery({
    queryKey: ["pipelines", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createPipeline = useMutation({
    mutationFn: async (name: string) => {
      if (!activeCompanyId) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase
        .from("pipelines")
        .insert({ name, company_id: activeCompanyId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Funil criado com sucesso!");
      setNewPipelineName("");
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      setSelectedPipelineId(data.id);
    },
    onError: (e) => toast.error("Erro ao criar funil", { description: (e as Error).message }),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      toast.success("Funil excluído.");
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      if (selectedPipelineId === id) setSelectedPipelineId(null);
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  // Ensure we have a pipeline selected if available
  if (!selectedPipelineId && pipelines && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }

  const selectedPipeline = pipelines?.find((p) => p.id === selectedPipelineId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestão de Funis (Pipelines)</CardTitle>
          <CardDescription>Crie e gerencie os funis de vendas da sua empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-6">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Novo Funil</label>
              <Input
                placeholder="Ex: Vendas B2B, Pós-Venda..."
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPipelineName) createPipeline.mutate(newPipelineName);
                }}
              />
            </div>
            <Button
              onClick={() => createPipeline.mutate(newPipelineName)}
              disabled={!newPipelineName || createPipeline.isPending}
            >
              <Plus className="mr-2 h-4 w-4" /> Criar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {isLoadingPipelines ? (
              <span className="text-sm text-muted-foreground">Carregando funis...</span>
            ) : (
              pipelines?.map((p) => (
                <Button
                  key={p.id}
                  variant={selectedPipelineId === p.id ? "default" : "outline"}
                  className="group relative pr-10"
                  onClick={() => setSelectedPipelineId(p.id)}
                >
                  {p.name}
                  <button
                    type="button"
                    className="absolute right-2 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingPipeline(p);
                    }}
                    title="Excluir funil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {selectedPipeline && <PipelineStagesManager pipeline={selectedPipeline} />}

      <AlertDialog
        open={!!deletingPipeline}
        onOpenChange={(open) => !open && setDeletingPipeline(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Funil de Vendas?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o funil <strong>{deletingPipeline?.name}</strong> e
              todas as etapas vinculadas? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingPipeline) {
                  deletePipeline.mutate(deletingPipeline.id);
                  setDeletingPipeline(null);
                }
              }}
            >
              Sim, Excluir Funil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PipelineStagesManager({ pipeline }: { pipeline: { id: string; name: string } }) {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3b82f6"); // Default blue

  // We need a fallback unit_id if selectedUnitId is null, because the original table requires it.
  const { data: fallbackUnit } = useQuery({
    queryKey: ["first-unit", activeCompanyId],
    enabled: !selectedUnitId && !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id")
        .eq("company_id", activeCompanyId!)
        .limit(1)
        .single();
      return data;
    },
  });

  const effectiveUnitId = selectedUnitId || fallbackUnit?.id;

  const { data: stages, isLoading } = useQuery({
    queryKey: ["pipeline-stages", pipeline.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipeline.id)
        .order("order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createStage = useMutation({
    mutationFn: async () => {
      if (!effectiveUnitId) throw new Error("Nenhuma unidade encontrada para vincular a etapa.");
      const newOrder =
        stages && stages.length > 0 ? Math.max(...stages.map((s) => s.order)) + 1 : 1;
      const { error } = await supabase.from("pipeline_stages").insert({
        pipeline_id: pipeline.id,
        unit_id: effectiveUnitId,
        name: newStageName,
        color: newStageColor,
        order: newOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa criada!");
      setNewStageName("");
      qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa excluída.");
      qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message }),
  });

  const updateStageColor = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      const { error } = await supabase.from("pipeline_stages").update({ color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] }),
  });

  const updateStageMetaEvent = useMutation({
    mutationFn: async ({ id, metaEvent }: { id: string; metaEvent: string }) => {
      const val = metaEvent === "none" ? null : metaEvent;
      try {
        const { error } = await (supabase.from("pipeline_stages") as any)
          .update({ meta_event_name: val })
          .eq("id", id);
        if (error && error.code !== "42703") throw error;
      } catch (e: any) {
        if (e?.code !== "42703") throw e;
      }
    },
    onSuccess: () => {
      toast.success("Evento Meta CAPI da etapa atualizado!");
      qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] });
    },
    onError: (e) => toast.error("Erro ao atualizar evento", { description: (e as Error).message }),
  });

  const reorderStages = useMutation({
    mutationFn: async (newOrderedStages: any[]) => {
      const updates = newOrderedStages.map((stage, idx) =>
        supabase
          .from("pipeline_stages")
          .update({ order: idx + 1 })
          .eq("id", stage.id)
      );
      await Promise.all(updates);
    },
    onMutate: async (newOrderedStages) => {
      await qc.cancelQueries({ queryKey: ["pipeline-stages", pipeline.id] });
      const previousStages = qc.getQueryData(["pipeline-stages", pipeline.id]);
      qc.setQueryData(["pipeline-stages", pipeline.id], newOrderedStages);
      return { previousStages };
    },
    onError: (e, _vars, context) => {
      if (context?.previousStages) {
        qc.setQueryData(["pipeline-stages", pipeline.id], context.previousStages);
      }
      toast.error("Erro ao reordenar etapas", { description: (e as Error).message });
    },
    onSuccess: () => {
      toast.success("Ordem das etapas atualizada!");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
    },
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !stages) return;
    if (result.destination.index === result.source.index) return;

    const items = Array.from(stages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    reorderStages.mutate(items);
  };

  const moveStageIndex = (fromIndex: number, toIndex: number) => {
    if (!stages || toIndex < 0 || toIndex >= stages.length) return;
    const items = Array.from(stages);
    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
    reorderStages.mutate(items);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Etapas: {pipeline.name}
        </CardTitle>
        <CardDescription>
          Gerencie e reordene as colunas do seu quadro Kanban arrastando ou usando as setas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium">Nome da Etapa</label>
            <Input
              placeholder="Ex: Prospecção, Negociação..."
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStageName) createStage.mutate();
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Cor</label>
            <div className="flex h-9 w-14 overflow-hidden rounded-md border border-input">
              <input
                type="color"
                value={newStageColor}
                onChange={(e) => setNewStageColor(e.target.value)}
                className="h-full w-full cursor-pointer bg-transparent border-0 p-0"
              />
            </div>
          </div>
          <Button
            onClick={() => createStage.mutate()}
            disabled={!newStageName || createStage.isPending || !effectiveUnitId}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>

        {!effectiveUnitId && !fallbackUnit && (
          <p className="text-sm text-destructive">
            Por favor, crie uma unidade primeiro para poder adicionar etapas.
          </p>
        )}

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando etapas...</p>
          ) : stages?.length === 0 ? (
            <p className="text-sm text-muted-foreground border-dashed border-2 rounded-md p-6 text-center">
              Nenhuma etapa configurada neste funil.
            </p>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="pipeline-stages-droppable">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {stages?.map((stage, index) => (
                      <Draggable key={stage.id} draggableId={stage.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 bg-muted/30 border rounded-md transition-all ${
                              snapshot.isDragging ? "shadow-lg bg-card ring-2 ring-primary/40 z-10" : ""
                            }`}
                          >
                            <div 
                              {...provided.dragHandleProps} 
                              className="cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground" 
                              title="Arraste para reordenar"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>

                            {/* Up / Down arrows */}
                            <div className="flex flex-col -space-y-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer p-0"
                                disabled={index === 0 || reorderStages.isPending}
                                onClick={() => moveStageIndex(index, index - 1)}
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer p-0"
                                disabled={index === stages.length - 1 || reorderStages.isPending}
                                onClick={() => moveStageIndex(index, index + 1)}
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </div>

                            <span className="text-xs font-mono text-muted-foreground w-4">{index + 1}</span>

                            <div className="relative flex h-8 w-8 overflow-hidden rounded-md border border-input shrink-0">
                              <input
                                type="color"
                                value={stage.color}
                                onChange={(e) =>
                                  updateStageColor.mutate({ id: stage.id, color: e.target.value })
                                }
                                className="h-full w-full cursor-pointer bg-transparent border-0 p-0"
                                title="Alterar cor"
                              />
                            </div>

                            <div className="flex-1 font-medium text-sm">{stage.name}</div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] text-muted-foreground hidden sm:inline">Meta CAPI:</span>
                              <Select
                                value={(stage as any).meta_event_name || "none"}
                                onValueChange={(val) => updateStageMetaEvent.mutate({ id: stage.id, metaEvent: val })}
                              >
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                  <SelectValue placeholder="Sem evento" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhum (Sem envio)</SelectItem>
                                  <SelectItem value="Lead">Lead</SelectItem>
                                  <SelectItem value="Contact">Contact</SelectItem>
                                  <SelectItem value="Schedule">Schedule (Agendamento)</SelectItem>
                                  <SelectItem value="SubmitApplication">Submit Application</SelectItem>
                                  <SelectItem value="QualifiedLead">Qualified Lead</SelectItem>
                                  <SelectItem value="InitiateCheckout">Initiate Checkout</SelectItem>
                                  <SelectItem value="Purchase">Purchase (Compra)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Excluir esta etapa? Todas as oportunidades nela podem ficar sem etapa definida.",
                                  )
                                ) {
                                  deleteStage.mutate(stage.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
