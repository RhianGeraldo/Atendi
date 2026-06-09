import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useUnit } from "@/lib/unit-context";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckSquare, Circle, Trash2, Calendar, DollarSign, Target, Plus, Phone, MessageSquare, Video, MoreHorizontal, CalendarClock, Clock } from "lucide-react";
import { TaskDialog } from "@/components/crm/task-dialog";

export function OpportunityDialog({ 
  children, 
  opportunity, 
  defaultContactId, 
  defaultPipelineId 
}: { 
  children: React.ReactNode, 
  opportunity?: any, 
  defaultContactId?: string,
  defaultPipelineId?: string
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [contactId, setContactId] = useState(defaultContactId || "");
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || "");
  const [stageId, setStageId] = useState("");

  const [contactSearch, setContactSearch] = useState("");
  const [contactComboboxOpen, setContactComboboxOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (opportunity) {
        setTitle(opportunity.title || "");
        setValue(opportunity.value?.toString() || "");
        setNotes(opportunity.notes || "");
        setExpectedCloseDate(opportunity.expected_close_date ? opportunity.expected_close_date.split('T')[0] : "");
        setContactId(opportunity.contact_id || "");
        // We need to fetch the pipelineId for this stage, but for simplicity we rely on the parent or we just show stages across pipelines? No, we should show pipelines.
        setStageId(opportunity.stage_id || "");
      } else {
        setTitle("");
        setValue("");
        setNotes("");
        setExpectedCloseDate("");
        setContactId(defaultContactId || "");
        setPipelineId(defaultPipelineId || "");
        setStageId("");
      }
    }
  }, [open, opportunity, defaultContactId, defaultPipelineId]);

  // Fetch Pipelines
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipelines").select("*").eq("company_id", profile!.company_id!);
      return data || [];
    },
  });

  // Fetch Stages based on pipelineId (if editing, we might not have pipelineId initially, so we can fetch all stages for the company's pipelines)
  const { data: stages } = useQuery({
    queryKey: ["pipeline-stages-by-pipeline", pipelineId],
    enabled: !!pipelineId && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("order");
      return data || [];
    },
  });

  // Fetch Contacts for dropdown if defaultContactId is not provided
  const { data: contacts, isLoading: isLoadingContacts } = useQuery({
    queryKey: ["contacts-dropdown", profile?.company_id, contactSearch],
    enabled: !defaultContactId && !!profile?.company_id && open,
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, name, phone").eq("company_id", profile!.company_id!);
      if (contactSearch) {
        q = q.or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`);
      }
      const { data } = await q.limit(5);
      return data || [];
    },
  });

  // Fallback unit if no unit is selected globally
  const { data: fallbackUnit } = useQuery({
    queryKey: ["first-unit-opp", profile?.company_id],
    enabled: !selectedUnitId && !!profile?.company_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id").eq("company_id", profile!.company_id!).limit(1).single();
      return data;
    }
  });

  const saveOpportunity = useMutation({
    mutationFn: async () => {
      const effectiveUnitId = selectedUnitId || fallbackUnit?.id;
      if (!effectiveUnitId) throw new Error("Crie uma unidade primeiro para salvar oportunidades.");
      
      const payload = {
        title,
        value: value ? parseFloat(value) : 0,
        notes,
        expected_close_date: expectedCloseDate ? new Date(expectedCloseDate).toISOString() : null,
        contact_id: contactId,
        stage_id: stageId,
        unit_id: effectiveUnitId,
        owner_id: opportunity?.owner_id || profile?.id,
      };

      if (opportunity?.id) {
        const { error } = await supabase.from("opportunities").update(payload).eq("id", opportunity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("opportunities").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(opportunity ? "Oportunidade atualizada!" : "Oportunidade criada!");
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      if (!opportunity) setOpen(false); // Only close if creating new. If editing, they might want to stay in tabs.
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
  });

  // --- TASKS LOGIC ---
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["opp-tasks", opportunity?.id],
    enabled: !!opportunity?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("opportunity_id", opportunity.id).order("created_at", { ascending: false });
      return data || [];
    }
  });

  const toggleTask = useMutation({
    mutationFn: async (task: any) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opp-tasks", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    }
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opp-tasks", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    }
  });
  // -------------------

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {opportunity ? "Gerenciar Oportunidade" : "Nova Oportunidade"}
          </DialogTitle>
        </DialogHeader>

        {opportunity ? (
          <Tabs defaultValue="details" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="details">Detalhes</TabsTrigger>
              <TabsTrigger value="tasks">
                Tarefas 
                {tasks && tasks.length > 0 && <Badge variant="secondary" className="ml-2 text-[10px] px-1">{tasks.filter(t => t.status === 'done').length}/{tasks.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="notes">Notas</TabsTrigger>
            </TabsList>

            {/* TAB: DETALHES */}
            <TabsContent value="details" className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input placeholder="Ex: Projeto Site" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" value={value} onChange={e => setValue(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fechamento Esperado</Label>
                  <Input type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Funil</Label>
                  <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {pipelines?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Etapa</Label>
                  <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {stages?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={() => saveOpportunity.mutate()} disabled={!title || !stageId || saveOpportunity.isPending}>
                Salvar Alterações
              </Button>
            </TabsContent>

            {/* TAB: TAREFAS */}
            <TabsContent value="tasks" className="space-y-4">
              <TaskDialog opportunityId={opportunity.id} contactId={opportunity.contact_id} defaultUnitId={opportunity.unit_id}>
                <Button variant="outline" size="sm" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Nova Tarefa
                </Button>
              </TaskDialog>
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {isLoadingTasks ? (
                  <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
                ) : !tasks || tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa criada.</p>
                ) : (
                  tasks.map((task: any) => (
                    <div key={task.id} className="flex items-center justify-between p-2 border rounded-md group hover:bg-muted/30">
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <button onClick={() => toggleTask.mutate(task)} className="text-muted-foreground hover:text-primary transition-colors">
                          {task.status === 'done' ? <CheckSquare className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
                        </button>
                        {task.task_type === "call" && <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        {task.task_type === "message" && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        {task.task_type === "meeting" && <Video className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        {task.task_type === "follow_up" && <CalendarClock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        {(task.task_type === "other" || !task.task_type) && <CheckSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        <div className="flex flex-col overflow-hidden">
                          <span className={`text-sm truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
                          {task.due_date && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {format(new Date(task.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteTask.mutate(task.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* TAB: NOTAS */}
            <TabsContent value="notes" className="space-y-4">
              <Textarea 
                placeholder="Anotações gerais sobre a negociação..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                className="min-h-[150px] resize-none"
              />
              <Button className="w-full" onClick={() => saveOpportunity.mutate()} disabled={saveOpportunity.isPending}>
                Salvar Notas
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          /* MODO DE CRIAÇÃO (NOVA OPORTUNIDADE) */
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Título da Oportunidade</Label>
              <Input placeholder="Ex: Projeto Site Institucional" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" placeholder="1500.00" value={value} onChange={e => setValue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Fechamento</Label>
                <Input type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} />
              </div>
            </div>

            {!defaultContactId && (
              <div className="space-y-2 flex flex-col">
                <Label>Contato</Label>
                <Popover open={contactComboboxOpen} onOpenChange={setContactComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={contactComboboxOpen}
                      className="w-full justify-between"
                    >
                      {contactId
                        ? contacts?.find((c) => c.id === contactId)?.name || "Contato selecionado"
                        : "Selecione um contato..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[375px] p-0" align="start">
                    <Command shouldFilter={false} filter={() => 1}>
                      <CommandInput 
                        placeholder="Buscar contato..." 
                        value={contactSearch}
                        onValueChange={setContactSearch}
                      />
                      <CommandList>
                        {isLoadingContacts && (
                          <div className="p-4 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {!isLoadingContacts && contacts?.length === 0 && (
                          <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                        )}
                        <CommandGroup>
                          {contacts?.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={(currentValue) => {
                                setContactId(currentValue === contactId ? "" : currentValue);
                                setContactComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  contactId === c.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {c.name} {c.phone ? `(${c.phone})` : ""}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Funil</Label>
                <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapa</Label>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {stages?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={() => saveOpportunity.mutate()} 
              disabled={!title || !contactId || !stageId || saveOpportunity.isPending}
            >
              Criar Oportunidade
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
