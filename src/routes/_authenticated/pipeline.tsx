import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Plus, GripVertical, Settings2, Calendar, DollarSign, User, MessageCircle, CheckSquare, FileText, Building } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { useNavigate } from "@tanstack/react-router";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  // Fetch Pipelines
  const { data: pipelines, isLoading: isLoadingPipelines } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Set default pipeline
  if (!selectedPipelineId && pipelines && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }

  // Fetch Stages
  const { data: stages, isLoading: isLoadingStages } = useQuery({
    queryKey: ["pipeline-stages", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", selectedPipelineId!)
        .order("order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch Opportunities for this pipeline
  const { data: opportunities, isLoading: isLoadingOpps } = useQuery({
    queryKey: ["opportunities", selectedPipelineId, profile?.role, profile?.id],
    enabled: !!selectedPipelineId && !!stages && stages.length > 0 && !!profile?.id,
    queryFn: async () => {
      const stageIds = stages!.map(s => s.id);
      let query = supabase
        .from("opportunities")
        .select(`
          id, title, value, stage_id, expected_close_date, contact_id, created_at, notes, owner_id, unit_id,
          contacts ( name ),
          tasks ( id, status ),
          units ( name )
        `)
        .in("stage_id", stageIds);
      
      // Filtra para que usuários comuns vejam apenas as próprias oportunidades
      if (profile?.role !== "admin_company" && profile?.role !== "manager") {
        query = query.eq("owner_id", profile!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Organize opportunities by stage
  const columns = useMemo(() => {
    if (!stages) return {};
    const cols: Record<string, any[]> = {};
    stages.forEach(s => {
      cols[s.id] = (opportunities || []).filter(o => o.stage_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return cols;
  }, [stages, opportunities]);

  const moveOpportunity = useMutation({
    mutationFn: async ({ oppId, newStageId }: { oppId: string, newStageId: string }) => {
      const { error } = await supabase
        .from("opportunities")
        .update({ stage_id: newStageId })
        .eq("id", oppId);
      if (error) throw error;
    },
    onMutate: async ({ oppId, newStageId }) => {
      await qc.cancelQueries({ queryKey: ["opportunities", selectedPipelineId] });
      const previous = qc.getQueryData(["opportunities", selectedPipelineId]);
      
      qc.setQueryData(["opportunities", selectedPipelineId], (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(o => o.id === oppId ? { ...o, stage_id: newStageId } : o);
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      toast.error("Erro ao mover card", { description: err.message });
      if (context?.previous) {
        qc.setQueryData(["opportunities", selectedPipelineId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["opportunities", selectedPipelineId] });
    }
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    // We only support moving between stages (columns) right now. Sorting within same column is visual-only unless we add a "order" field to opportunities.
    if (source.droppableId !== destination.droppableId) {
      moveOpportunity.mutate({ oppId: draggableId, newStageId: destination.droppableId });
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const goToConversation = async (contactId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await supabase.from('conversations').select('id, status').eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1).single();
      if (data) {
        navigate({ to: "/conversations", search: { c: data.id, tab: data.status } as any });
      } else {
        toast.error("Este contato ainda não possui conversas.");
      }
    } catch (err) {
      toast.error("Erro ao buscar conversa.");
    }
  };

  if (isLoadingPipelines) return <div className="p-6">Carregando CRM...</div>;
  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="p-6">
        <Card className="flex flex-col items-center gap-3 p-12 text-center max-w-lg mx-auto mt-10">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <Settings2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Nenhum Funil Encontrado</h2>
          <p className="text-sm text-muted-foreground">Você ainda não configurou um funil de vendas. Acesse as Configurações para criar seu primeiro funil e etapas.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Kanban</h1>
          <Select value={selectedPipelineId || ""} onValueChange={setSelectedPipelineId}>
            <SelectTrigger className="w-[250px] h-9">
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <OpportunityDialog defaultPipelineId={selectedPipelineId || ""}>
            <Button variant="default" size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-2" />
              Nova Oportunidade
            </Button>
          </OpportunityDialog>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        {isLoadingStages || isLoadingOpps ? (
          <div className="text-muted-foreground text-sm">Carregando quadro...</div>
        ) : !stages || stages.length === 0 ? (
          <div className="text-center mt-10 text-muted-foreground">
            Este funil ainda não tem etapas. Adicione etapas nas configurações.
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full items-start gap-4 pb-4">
              {stages.map((stage) => {
                const stageOpps = columns[stage.id] || [];
                const stageTotal = stageOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);
                
                return (
                  <div key={stage.id} className="flex h-full max-h-full w-[300px] shrink-0 flex-col rounded-lg bg-muted/50 border">
                    <div 
                      className="flex items-center justify-between p-3 border-b border-border/50 shrink-0"
                      style={{ borderTop: `3px solid ${stage.color || '#3b82f6'}` }}
                    >
                      <h3 className="font-semibold text-sm truncate flex-1" title={stage.name}>
                        {stage.name}
                        <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">{stageOpps.length}</Badge>
                      </h3>
                      {stageTotal > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">{formatCurrency(stageTotal)}</span>
                      )}
                    </div>
                    
                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] transition-colors ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
                        >
                          {stageOpps.map((opp, index) => (
                            <Draggable key={opp.id} draggableId={opp.id} index={index}>
                              {(provided, snapshot) => {
                                const completedTasks = opp.tasks?.filter((t: any) => t.status === 'done').length || 0;
                                const totalTasks = opp.tasks?.length || 0;
                                const hasNotes = !!opp.notes && opp.notes.trim().length > 0;

                                return (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`group relative rounded-xl border bg-card/60 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/50 rotate-2' : ''}`}
                                  >
                                    <OpportunityDialog opportunity={opp} defaultPipelineId={selectedPipelineId || ""}>
                                      <div className="cursor-pointer space-y-3">
                                        
                                        {/* Header: Title and value */}
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="font-semibold text-sm leading-tight hover:text-primary transition-colors line-clamp-2 pr-6">
                                            {opp.title}
                                          </div>
                                        </div>

                                        {/* Badges row: Tasks, Notes */}
                                        {(totalTasks > 0 || hasNotes) && (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {totalTasks > 0 && (
                                              <Badge variant={completedTasks === totalTasks ? "default" : "secondary"} className="text-[10px] px-1.5 h-5 gap-1 font-medium bg-muted/60">
                                                <CheckSquare className="h-3 w-3" />
                                                {completedTasks}/{totalTasks}
                                              </Badge>
                                            )}
                                            {hasNotes && (
                                              <Badge variant="secondary" className="text-[10px] px-1.5 h-5 gap-1 bg-muted/60">
                                                <FileText className="h-3 w-3" />
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                        
                                        {/* Contact row */}
                                        <div className="flex items-center gap-2">
                                          <Avatar className="h-6 w-6 border bg-background">
                                            <AvatarFallback className="text-[10px] font-medium">
                                              {initials(opp.contacts?.name || "??")}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="text-xs text-muted-foreground font-medium truncate flex-1">
                                            {opp.contacts?.name || "Contato Desconhecido"}
                                          </span>
                                        </div>

                                        {!selectedUnitId && opp.units?.name && (
                                          <div className="flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit max-w-full">
                                            <Building className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{opp.units.name}</span>
                                          </div>
                                        )}
                                        
                                        {/* Footer */}
                                        <div className="flex items-center justify-between mt-2 pt-3 border-t border-border/40">
                                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                                            {formatCurrency(opp.value || 0)}
                                          </div>
                                          {opp.expected_close_date && (
                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium bg-muted/30 px-1.5 py-0.5 rounded">
                                              <Calendar className="h-3 w-3" />
                                              {format(new Date(opp.expected_close_date), "dd/MMM", { locale: ptBR })}
                                            </div>
                                          )}
                                        </div>

                                      </div>
                                    </OpportunityDialog>

                                    {/* Quick Actions (Hover) */}
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="secondary" 
                                              size="icon" 
                                              className="h-7 w-7 rounded-full shadow-sm bg-background/80 backdrop-blur border hover:bg-primary hover:text-primary-foreground transition-colors"
                                              onClick={(e) => goToConversation(opp.contact_id, e)}
                                            >
                                              <MessageCircle className="h-3.5 w-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            <p className="text-xs">Ir para conversa</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                    
                                  </div>
                                );
                              }}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}
