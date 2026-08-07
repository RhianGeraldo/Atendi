import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Plus, GripVertical, Settings2, Calendar, DollarSign, User, UserCheck, MessageCircle, CheckSquare, FileText, Building, Search, X, RefreshCw, TrendingUp, Target, Award } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { useNavigate } from "@tanstack/react-router";
import { initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [searchTerm, setSearchTerm] = useState("");

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
    queryKey: ["opportunities", activeCompanyId, selectedPipelineId, profile?.role, profile?.id, selectedUnitId, statusFilter],
    enabled: !!selectedPipelineId && !!stages && stages.length > 0 && !!profile?.id && !!activeCompanyId,
    queryFn: async () => {
      const stageIds = stages!.map(s => s.id);
      let query = supabase
        .from("opportunities")
        .select(`
          id, title, value, stage_id, expected_close_date, contact_id, created_at, notes, owner_id, unit_id, status,
          contacts ( name, phone ),
          profiles:owner_id ( id, name, email ),
          tasks ( id, status ),
          opportunity_notes ( id ),
          units ( name )
        `)
        .in("stage_id", stageIds);
        
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      
      // Filtra para que apenas agentes vejam as próprias oportunidades (Admins, Super Admins e Gerentes veem todas)
      if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
        query = query.eq("owner_id", profile!.id);
      }

      // Filtra pela unidade selecionada no painel superior
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const filteredOpportunities = useMemo(() => {
    if (!opportunities) return [];
    if (!searchTerm.trim()) return opportunities;
    const term = searchTerm.toLowerCase();
    return opportunities.filter((opp: any) => {
      const title = (opp.title || "").toLowerCase();
      const contactName = (opp.contacts?.name || "").toLowerCase();
      const contactPhone = (opp.contacts?.phone || "").toLowerCase();
      const notes = (opp.notes || "").toLowerCase();
      return (
        title.includes(term) ||
        contactName.includes(term) ||
        contactPhone.includes(term) ||
        notes.includes(term)
      );
    });
  }, [opportunities, searchTerm]);

  // Organize opportunities by stage
  const columns = useMemo(() => {
    if (!stages) return {};
    const cols: Record<string, any[]> = {};
    stages.forEach(s => {
      cols[s.id] = (filteredOpportunities || []).filter(o => o.stage_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return cols;
  }, [stages, filteredOpportunities]);

  const moveOpportunity = useMutation({
    mutationFn: async ({ oppId, newStageId }: { oppId: string, newStageId: string }) => {
      const targetStageName = stages?.find(s => s.id === newStageId)?.name || "Nova etapa";

      const { error: oppError } = await supabase
        .from("opportunities")
        .update({ 
          stage_id: newStageId
        })
        .eq("id", oppId);
      if (oppError) throw oppError;

      // Record stage movement in opportunity_history
      const { error: histError } = await supabase
        .from("opportunity_history")
        .insert({
          opportunity_id: oppId,
          user_id: profile?.id,
          action_type: "stage_change",
          description: `Oportunidade movida para a etapa "${targetStageName}"`
        });
      if (histError && histError.code !== '42P01') {
        console.warn("Could not record stage history:", histError);
      }
    },
    onMutate: async ({ oppId, newStageId }) => {
      // 1. Cancel any outgoing refetches for opportunities
      await qc.cancelQueries({ queryKey: ["opportunities"] });

      // 2. Snapshot all matching opportunity queries
      const previousQueries = qc.getQueriesData({ queryKey: ["opportunities"] });

      // 3. Optimistically update all opportunity queries in cache immediately
      qc.setQueriesData({ queryKey: ["opportunities"] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((opp: any) => 
          opp.id === oppId ? { ...opp, stage_id: newStageId } : opp
        );
      });

      return { previousQueries };
    },
    onSuccess: () => {
      toast.success("Oportunidade movida para a nova etapa!");
    },
    onError: (err, _variables, context) => {
      toast.error("Erro ao mover oportunidade", { description: err.message });
      // Rollback to previous cache state if mutation fails
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          qc.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history"] });
    }
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (source.droppableId !== destination.droppableId) {
      moveOpportunity.mutate({ oppId: draggableId, newStageId: destination.droppableId });
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
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
      <header className="flex items-center justify-between border-b bg-card px-6 py-4 shrink-0 flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedPipelineId || ""} onValueChange={setSelectedPipelineId}>
            <SelectTrigger className="w-[220px] h-9 text-xs">
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="won">Ganho</SelectItem>
              <SelectItem value="lost">Perdido</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Bar */}
          <div className="relative w-full sm:w-48 md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar no funil..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["opportunities"] });
              qc.invalidateQueries({ queryKey: ["pipelines"] });
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        <div>
          <OpportunityDialog defaultPipelineId={selectedPipelineId || ""}>
            <Button variant="default" size="sm" className="h-9 text-xs font-medium">
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
                  <div key={stage.id} className="flex h-full max-h-full w-[310px] shrink-0 flex-col rounded-xl bg-card border border-border/70 shadow-sm">
                    <div 
                      className="flex items-center justify-between p-3.5 border-b border-border/50 shrink-0 rounded-t-xl bg-card/80"
                      style={{ borderTop: `4px solid ${stage.color || '#3b82f6'}` }}
                    >
                      <div className="flex items-center gap-2 truncate flex-1" title={stage.name}>
                        <h3 className="font-semibold text-sm truncate">{stage.name}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-bold shrink-0">
                          {stageOpps.length}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {stageTotal > 0 && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(stageTotal)}
                          </span>
                        )}
                        <OpportunityDialog defaultPipelineId={selectedPipelineId || ""} defaultStageId={stage.id}>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted" title="Adicionar nesta etapa">
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </OpportunityDialog>
                      </div>
                    </div>
                    
                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[160px] transition-colors rounded-b-xl ${snapshot.isDraggingOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
                        >
                          {stageOpps.length === 0 && !snapshot.isDraggingOver ? (
                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-border/60 rounded-xl my-1 bg-muted/20">
                              <p className="text-xs text-muted-foreground font-medium">Nenhuma oportunidade</p>
                              <OpportunityDialog defaultPipelineId={selectedPipelineId || ""} defaultStageId={stage.id}>
                                <Button variant="ghost" size="sm" className="h-7 text-[11px] mt-2 text-primary hover:bg-primary/5">
                                  <Plus className="h-3 w-3 mr-1" /> Criar nesta etapa
                                </Button>
                              </OpportunityDialog>
                            </div>
                          ) : (
                            stageOpps.map((opp, index) => (
                              <Draggable key={opp.id} draggableId={opp.id} index={index}>
                                {(provided, snapshot) => {
                                  const pendingTasksCount = opp.tasks?.filter((t: any) => t.status === 'pending' || t.status === 'todo').length || 0;
                                  const completedTasksCount = opp.tasks?.filter((t: any) => t.status === 'done').length || 0;
                                  const totalTasks = opp.tasks?.length || 0;
                                  const notesCount = 
                                    (opp.notes && String(opp.notes).trim().length > 0 ? 1 : 0) + 
                                    (Array.isArray(opp.opportunity_notes) ? opp.opportunity_notes.length : 0);
                                  const hasNotes = notesCount > 0;

                                  return (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={provided.draggableProps.style}
                                      className={`group relative rounded-xl border border-border/80 bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/40 ${
                                        snapshot.isDragging 
                                          ? 'shadow-2xl ring-2 ring-primary/60 transition-none z-50 opacity-95' 
                                          : 'transition-all duration-200'
                                      }`}
                                    >
                                      <OpportunityDialog opportunity={opp} defaultPipelineId={selectedPipelineId || ""}>
                                        <div className="cursor-pointer space-y-3">
                                          
                                          {/* Title */}
                                          <div className="font-semibold text-sm leading-tight text-foreground hover:text-primary transition-colors line-clamp-2 pr-6">
                                            {opp.title}
                                          </div>

                                          {/* Contact & Atendente row */}
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                              <Avatar className="h-6 w-6 border bg-background shrink-0">
                                                <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                                                  {initials(opp.contacts?.name || "??")}
                                                </AvatarFallback>
                                              </Avatar>
                                              <div className="flex flex-col truncate">
                                                <span className="text-xs text-foreground font-medium truncate">
                                                  {opp.contacts?.name || "Contato Desconhecido"}
                                                </span>
                                                {opp.contacts?.phone && (
                                                  <span className="text-[10px] text-muted-foreground truncate">
                                                    {opp.contacts.phone}
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            {/* Atendente Badge */}
                                            {opp.profiles?.name && (
                                              <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground shrink-0 border border-border/40" title={`Atendente: ${opp.profiles.name}`}>
                                                <UserCheck className="h-3 w-3 text-primary shrink-0" />
                                                <span className="truncate max-w-[90px]">{opp.profiles.name}</span>
                                              </div>
                                            )}
                                          </div>

                                          {/* Middle Row (Above the divider line): Unidade (1º), Status (2º), Valor (Direita) */}
                                          <div className="flex items-center justify-between gap-2 pt-0.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {/* Unidade Primeiro */}
                                              {!selectedUnitId && opp.units?.name && (
                                                <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit max-w-full">
                                                  <Building className="h-3 w-3 shrink-0" />
                                                  <span className="truncate">{opp.units.name}</span>
                                                </div>
                                              )}

                                              {/* Status Segundo */}
                                              {opp.status && (
                                                <Badge variant={opp.status === 'won' ? 'default' : opp.status === 'lost' ? 'destructive' : 'secondary'} className={`text-[10px] px-1.5 h-5 font-medium ${opp.status === 'won' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}>
                                                  {opp.status === 'won' ? 'Ganho' : opp.status === 'lost' ? 'Perdido' : 'Aberto'}
                                                </Badge>
                                              )}
                                            </div>

                                            {/* Valor R$ acima da linha à direita */}
                                            <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0 whitespace-nowrap">
                                              {formatCurrency(opp.value || 0)}
                                            </div>
                                          </div>
                                          
                                          {/* Footer: Tarefas e Notas (Esquerda) e Data (Direita) abaixo da linha */}
                                          <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-border/40 gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {/* Tasks Indicator */}
                                              {totalTasks > 0 ? (
                                                pendingTasksCount > 0 ? (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                    title={`${pendingTasksCount} tarefa(s) pendente(s)`}
                                                  >
                                                    <CheckSquare className="h-3 w-3" />
                                                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                                    </span>
                                                    {pendingTasksCount}
                                                  </Badge>
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                    title="Todas as tarefas concluídas"
                                                  >
                                                    <CheckSquare className="h-3 w-3" />
                                                    {totalTasks}
                                                  </Badge>
                                                )
                                              ) : (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] px-1.5 h-5 gap-1 font-normal text-muted-foreground/60 border-border/40 bg-muted/20"
                                                  title="Sem tarefas"
                                                >
                                                  <CheckSquare className="h-3 w-3" />
                                                  0
                                                </Badge>
                                              )}

                                              {/* Notes Indicator */}
                                              {hasNotes ? (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                  title={`${notesCount} anotação(ões)`}
                                                >
                                                  <FileText className="h-3 w-3" />
                                                  {notesCount}
                                                </Badge>
                                              ) : (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[10px] px-1.5 h-5 gap-1 font-normal text-muted-foreground/60 border-border/40 bg-muted/20"
                                                  title="Sem notas"
                                                >
                                                  <FileText className="h-3 w-3" />
                                                  0
                                                </Badge>
                                              )}
                                            </div>

                                            {opp.expected_close_date && (
                                              <div 
                                                className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 shrink-0"
                                                title="Data Prevista de Fechamento"
                                              >
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
                                            <StartConversationDialog 
                                              contactName={opp.contacts?.name || ""}
                                              initialPhone={opp.contacts?.phone || ""}
                                              onCreated={(id) => navigate({ to: "/conversations", search: { c: id } as any })}
                                              trigger={
                                                <TooltipTrigger asChild>
                                                  <Button 
                                                    variant="secondary" 
                                                    size="icon" 
                                                    className="h-7 w-7 rounded-full shadow-sm bg-background border hover:bg-primary hover:text-primary-foreground transition-colors"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <MessageCircle className="h-3.5 w-3.5" />
                                                  </Button>
                                                </TooltipTrigger>
                                              }
                                            />
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
                            ))
                          )}
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
