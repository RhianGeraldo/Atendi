import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
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
import { CheckSquare, Circle, CheckCircle2, Pencil, Trash2, Calendar as CalendarIcon, Target, Plus, Phone, MessageSquare, Video, CalendarClock, Clock, Info, ListTodo, StickyNote, User, UserCheck, Save, History } from "lucide-react";
import { TaskDialog } from "@/components/crm/task-dialog";

// BRL Currency formatting helpers
const formatBRLString = (num: number | string | undefined | null) => {
  if (num === undefined || num === null || num === "") return "";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const maskBRLInput = (rawValue: string) => {
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10) / 100;
  return cents.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseBRLToFloat = (brlStr: string) => {
  if (!brlStr) return 0;
  const clean = brlStr.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};

const formatDateSafe = (dateVal: any, formatStr: string = "dd/MM/yyyy 'às' HH:mm") => {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return format(d, formatStr, { locale: ptBR });
  } catch {
    return "";
  }
};

function OpportunityNotes({ opportunityId }: { opportunityId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");

  const { data: notes, isLoading } = useQuery({
    queryKey: ["opportunity-notes", opportunityId],
    enabled: !!opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_notes")
        .select(`
          id,
          user_id,
          content,
          created_at,
          profiles (
            name,
            email
          )
        `)
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });
      if (error && error.code !== '42P01') throw error; 
      return data || [];
    },
  });

  const saveNote = useMutation({
    mutationFn: async () => {
      if (!noteContent.trim()) return;
      if (editingNoteId) {
        const { error } = await supabase
          .from("opportunity_notes")
          .update({ content: noteContent.trim() })
          .eq("id", editingNoteId);
        if (error) throw error;
      } else {
        if (!profile?.id) throw new Error("Usuário não autenticado");
        const { error } = await supabase
          .from("opportunity_notes")
          .insert({
            opportunity_id: opportunityId,
            user_id: profile.id,
            content: noteContent.trim()
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setDialogOpen(false);
      setNoteContent("");
      setEditingNoteId(null);
      toast.success(editingNoteId ? "Nota atualizada!" : "Nota adicionada!");
      qc.invalidateQueries({ queryKey: ["opportunity-notes", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("opportunity_notes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota excluída!");
      qc.invalidateQueries({ queryKey: ["opportunity-notes", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message })
  });

  const handleOpenCreate = () => {
    setEditingNoteId(null);
    setNoteContent("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (note: any) => {
    setEditingNoteId(note.id);
    setNoteContent(note.content || "");
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Notas da Oportunidade</h4>
        </div>
        <Button 
          variant="default" 
          size="sm" 
          className="h-8 text-xs font-medium gap-1.5 cursor-pointer"
          onClick={handleOpenCreate}
        >
          <Plus className="h-3.5 w-3.5" /> Nova Nota
        </Button>
      </div>

      {/* List of Notes */}
      <div className="space-y-2 pr-1 pb-4">
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !notes || notes.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/20">
            Nenhuma nota registrada para esta oportunidade.
          </div>
        ) : (
          notes.map((note: any) => (
            <div key={note.id} className="flex items-center justify-between p-3 border rounded-xl group hover:bg-muted/40 transition-colors bg-card">
              <div className="flex items-start gap-3 flex-1 overflow-hidden pr-2">
                <StickyNote className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="text-xs font-medium text-foreground whitespace-pre-wrap break-words">{note.content}</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <User className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate font-medium text-foreground">{note.profiles?.name || note.profiles?.email || profile?.name || "Usuário"}</span>
                    <span>•</span>
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatDateSafe(note.created_at)}</span>
                  </span>
                </div>
              </div>

              {/* Actions: Edit & Delete */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer" 
                  onClick={() => handleOpenEdit(note)}
                  title="Editar Nota"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer" 
                  onClick={() => deleteNote.mutate(note.id)}
                  title="Excluir Nota"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dialog for Add / Edit Note */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingNoteId ? "Editar Nota" : "Nova Nota"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Conteúdo da Observação</Label>
              <Textarea 
                placeholder="Digite detalhes ou observações sobre esta oportunidade..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="resize-none text-sm"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="cursor-pointer">Cancelar</Button>
            <Button 
              onClick={() => saveNote.mutate()} 
              disabled={!noteContent.trim() || saveNote.isPending}
              className="cursor-pointer gap-1.5"
            >
              {saveNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function OpportunityDialog({ 
  children, 
  opportunity, 
  defaultContactId, 
  defaultPipelineId,
  defaultStageId
}: { 
  children: React.ReactNode, 
  opportunity?: any, 
  defaultContactId?: string,
  defaultPipelineId?: string,
  defaultStageId?: string
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
  const [ownerId, setOwnerId] = useState(opportunity?.owner_id || profile?.id || "");
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || "");
  const [stageId, setStageId] = useState(defaultStageId || "");
  const [status, setStatus] = useState("open");

  const [contactSearch, setContactSearch] = useState("");
  const [contactComboboxOpen, setContactComboboxOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (opportunity) {
        setTitle(opportunity.title || "");
        setValue(formatBRLString(opportunity.value));
        setNotes(opportunity.notes || "");
        setExpectedCloseDate(opportunity.expected_close_date ? opportunity.expected_close_date.split('T')[0] : "");
        setContactId(opportunity.contact_id || defaultContactId || "");
        setOwnerId(opportunity.owner_id || profile?.id || "");
        setPipelineId(opportunity.pipeline_stages?.pipeline_id || opportunity.pipeline_stages?.pipelines?.id || defaultPipelineId || "");
        setStageId(opportunity.stage_id || defaultStageId || "");
        setStatus(opportunity.status || "open");
      } else {
        setTitle("");
        setValue("");
        setNotes("");
        setExpectedCloseDate("");
        setContactId(defaultContactId || "");
        setOwnerId(profile?.id || "");
        setPipelineId(defaultPipelineId || "");
        setStageId(defaultStageId || "");
        setStatus("open");
      }
    }
  }, [open, opportunity, defaultContactId, defaultPipelineId, defaultStageId, profile?.id]);

  // Fetch Company Users for Responsável dropdown
  const { data: companyUsers } = useQuery({
    queryKey: ["company-users", profile?.company_id],
    enabled: open && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("company_id", profile!.company_id!)
        .order("name");
      return data || [];
    },
  });

  // Fetch Pipelines
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipelines").select("*").eq("company_id", profile!.company_id!);
      return data || [];
    },
  });

  // Fetch Stages based on pipelineId
  const { data: stages } = useQuery({
    queryKey: ["pipeline-stages-by-pipeline", pipelineId],
    enabled: !!pipelineId && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("order");
      return data || [];
    },
  });

  // Fetch Contacts for dropdown
  const { data: contacts, isLoading: isLoadingContacts } = useQuery({
    queryKey: ["contacts-dropdown", profile?.company_id, contactSearch, selectedUnitId],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, name, phone").eq("company_id", profile!.company_id!);
      if (selectedUnitId) {
        q = q.eq("unit_id", selectedUnitId);
      }
      if (contactSearch) {
        q = q.or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`);
      }
      const { data } = await q.limit(5);
      return data || [];
    },
  });

  // Fallback unit
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
        value: parseBRLToFloat(value),
        notes,
        expected_close_date: expectedCloseDate ? new Date(expectedCloseDate).toISOString() : null,
        contact_id: contactId,
        stage_id: stageId,
        unit_id: effectiveUnitId,
        owner_id: ownerId || profile?.id,
        status,
      };

      if (opportunity?.id) {
        const { error } = await supabase.from("opportunities").update(payload).eq("id", opportunity.id);
        if (error) throw error;
      } else {
        const { data: newOpp, error } = await supabase.from("opportunities").insert(payload).select("id").single();
        if (error) throw error;
        
        // Record creation in dedicated opportunity_history table
        if (newOpp?.id) {
          await supabase.from("opportunity_history").insert({
            opportunity_id: newOpp.id,
            user_id: profile?.id,
            action_type: "creation",
            description: `Oportunidade "${title}" foi criada no funil.`
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(opportunity ? "Oportunidade atualizada!" : "Oportunidade criada!");
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      if (!opportunity) setOpen(false);
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
  });

  // Dedicated Opportunity History Audit Trail
  const changeStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      if (!opportunity?.id) return;
      const { error: oppError } = await supabase.from("opportunities").update({ status: newStatus }).eq("id", opportunity.id);
      if (oppError) throw oppError;

      let statusText = "";
      if (newStatus === "won") statusText = "Oportunidade marcada como GANHA 🎉";
      else if (newStatus === "lost") statusText = "Oportunidade marcada como PERDIDA ❌";
      else statusText = "Oportunidade REABERTA no funil 🔄";

      // Save status change in dedicated opportunity_history table
      const { error: histError } = await supabase
        .from("opportunity_history")
        .insert({
          opportunity_id: opportunity.id,
          user_id: profile?.id,
          action_type: "status_change",
          description: statusText
        });
      if (histError && histError.code !== '42P01') {
        console.warn("Could not record status history:", histError);
      }

      return newStatus;
    },
    onSuccess: (newStatus) => {
      setStatus(newStatus as string);
      toast.success(newStatus === 'won' ? "Oportunidade marcada como GANHA!" : newStatus === 'lost' ? "Oportunidade marcada como PERDIDA!" : "Oportunidade REABERTA!");
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
    },
    onError: (e) => toast.error("Erro ao alterar status", { description: (e as Error).message })
  });

  // Tasks logic with profiles join for assigned_to user details
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["opp-tasks", opportunity?.id],
    enabled: !!opportunity?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select(`
          *,
          profiles:assigned_to (
            id,
            name,
            email
          )
        `)
        .eq("opportunity_id", opportunity.id)
        .order("created_at", { ascending: false });
      return data || [];
    }
  });

  // Dedicated Opportunity History Query
  const { data: historyList } = useQuery({
    queryKey: ["opportunity-history", opportunity?.id],
    enabled: !!opportunity?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_history")
        .select(`
          id,
          action_type,
          description,
          created_at,
          profiles (
            name,
            email
          )
        `)
        .eq("opportunity_id", opportunity.id)
        .order("created_at", { ascending: false });
      if (error && error.code !== '42P01') throw error;
      return data || [];
    }
  });

  // Notes full logic for sidebar badge and user notes tab
  const { data: notesList } = useQuery({
    queryKey: ["opportunity-notes", opportunity?.id],
    enabled: !!opportunity?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_notes")
        .select(`
          id,
          user_id,
          content,
          created_at,
          profiles (
            name,
            email
          )
        `)
        .eq("opportunity_id", opportunity.id)
        .order("created_at", { ascending: false });
      if (error && error.code !== '42P01') throw error; 
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

  const currentOwnerName = companyUsers?.find(u => u.id === (opportunity?.owner_id || ownerId))?.name || opportunity?.profiles?.name || profile?.name || profile?.email || "";

  // Aggregated timeline events combining dedicated history, tasks, notes & creation
  const timelineEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: 'creation' | 'task' | 'note' | 'status';
      timestamp: string;
      title: string;
      description?: string;
      user?: string;
      color?: string;
    }> = [];

    // 1. Opportunity Creation event
    if (opportunity?.created_at) {
      events.push({
        id: `create-${opportunity.id}`,
        type: 'creation',
        timestamp: opportunity.created_at,
        title: "Oportunidade Criada",
        description: `Oportunidade "${opportunity.title}" foi iniciada no funil.`,
        user: currentOwnerName || profile?.name || profile?.email || "Usuário",
        color: "bg-primary/15 text-primary border-primary/30"
      });
    }

    // 2. Dedicated Opportunity History (Stage Changes, Status Changes & Creation)
    if (historyList && historyList.length > 0) {
      historyList.forEach((h: any) => {
        const histUserName = h.profiles?.name || h.profiles?.email || profile?.name || "Usuário";

        if (h.action_type === "stage_change") {
          events.push({
            id: `hist-${h.id}`,
            type: 'status',
            timestamp: h.created_at,
            title: "Mudança de Etapa 🔄",
            description: h.description,
            user: histUserName,
            color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30"
          });
        } else if (h.action_type === "status_change") {
          const isWon = h.description?.includes("GANHA");
          const isLost = h.description?.includes("PERDIDA");
          events.push({
            id: `hist-${h.id}`,
            type: 'status',
            timestamp: h.created_at,
            title: isWon ? "Oportunidade Marcada como GANHA 🎉" : isLost ? "Oportunidade Marcada como PERDIDA ❌" : "Oportunidade REABERTA 🔄",
            description: h.description,
            user: histUserName,
            color: isWon 
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" 
              : isLost 
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
          });
        } else {
          events.push({
            id: `hist-${h.id}`,
            type: 'creation',
            timestamp: h.created_at,
            title: "Oportunidade Criada",
            description: h.description,
            user: histUserName,
            color: "bg-primary/15 text-primary border-primary/30"
          });
        }
      });
    }

    // 3. Task events
    if (tasks && tasks.length > 0) {
      tasks.forEach((t: any) => {
        const taskUserName = t.profiles?.name || t.profiles?.email || companyUsers?.find(u => u.id === t.assigned_to)?.name || currentOwnerName || profile?.name || "Usuário";
        events.push({
          id: `task-${t.id}`,
          type: 'task',
          timestamp: t.created_at,
          title: `Tarefa ${t.status === 'done' ? 'Concluída' : 'Registrada'}: ${t.title}`,
          description: t.due_date ? `Vencimento: ${formatDateSafe(t.due_date)}` : undefined,
          user: taskUserName,
          color: t.status === 'done' ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
        });
      });
    }

    // 4. User Notes events (clean manual notes only)
    if (notesList && notesList.length > 0) {
      notesList.forEach((n: any) => {
        const noteUserName = n.profiles?.name || n.profiles?.email || profile?.name || profile?.email || "Usuário";
        events.push({
          id: `note-${n.id}`,
          type: 'note',
          timestamp: n.created_at,
          title: "Observação Adicionada",
          description: n.content,
          user: noteUserName,
          color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        });
      });
    }

    // Sort descending by timestamp (newest first)
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [opportunity, historyList, tasks, notesList, currentOwnerName, companyUsers, profile]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className={cn("p-0 overflow-hidden flex flex-col gap-0 border-border/80 shadow-xl", opportunity ? "sm:max-w-[780px] h-[85vh] max-h-[660px]" : "sm:max-w-[540px] max-h-[90vh]")}>
        
        {/* Header Bar */}
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-muted/15">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Target className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">{opportunity ? (title || "Gerenciar Oportunidade") : "Nova Oportunidade"}</span>
              </DialogTitle>
              {opportunity?.contacts?.name && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-0.5">
                  <span className="font-normal text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">{opportunity.contacts.name}</span>
                  {currentOwnerName && (
                    <>
                      <span className="opacity-40">•</span>
                      <span className="font-normal text-muted-foreground">Responsável:</span>
                      <span className="font-semibold text-foreground">{currentOwnerName}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {opportunity && (
              <div className="flex items-center gap-2 shrink-0 pr-6">
                {status === 'open' ? (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 px-3 text-xs font-semibold border-emerald-500/40 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer" 
                      onClick={() => changeStatus.mutate('won')} 
                      disabled={changeStatus.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Ganho
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 px-3 text-xs font-semibold border-rose-500/40 text-rose-600 bg-rose-500/10 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer" 
                      onClick={() => changeStatus.mutate('lost')} 
                      disabled={changeStatus.isPending}
                    >
                      Perdido
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant={status === 'won' ? "default" : "destructive"} className={`text-xs px-2.5 py-1 ${status === 'won' ? 'bg-emerald-600 text-white' : ''}`}>
                      {status === 'won' ? "Ganho" : "Perdido"}
                    </Badge>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium cursor-pointer" onClick={() => changeStatus.mutate('open')} disabled={changeStatus.isPending}>
                      Reabrir
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {opportunity ? (
          <Tabs defaultValue="details" className="flex flex-1 overflow-hidden" orientation="vertical">
            {/* Sidebar Navigation */}
            <div className="w-[210px] border-r border-border/60 bg-muted/15 shrink-0 p-3 space-y-1.5 overflow-y-auto">
              <TabsList className="flex flex-col h-auto w-full items-stretch justify-start p-0 bg-transparent space-y-1">
                <TabsTrigger 
                  value="details" 
                  className="justify-start px-3 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-l-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
                >
                  <Info className="mr-2 h-4 w-4" /> Detalhes
                </TabsTrigger>
                
                <TabsTrigger 
                  value="tasks" 
                  className="justify-between px-3 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-l-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
                >
                  <div className="flex items-center">
                    <ListTodo className="mr-2 h-4 w-4" /> Tarefas 
                  </div>
                  {tasks && tasks.length > 0 && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1.5 h-4 font-bold border-none",
                        tasks.some(t => t.status !== 'done') 
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" 
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {tasks.filter(t => t.status === 'done').length}/{tasks.length}
                    </Badge>
                  )}
                </TabsTrigger>

                <TabsTrigger 
                  value="notes" 
                  className="justify-between px-3 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-l-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
                >
                  <div className="flex items-center">
                    <StickyNote className="mr-2 h-4 w-4" /> Notas
                  </div>
                  {notesList && notesList.length > 0 && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1.5 h-4 font-bold border-none bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    >
                      {notesList.length}
                    </Badge>
                  )}
                </TabsTrigger>

                <TabsTrigger 
                  value="timeline" 
                  className="justify-between px-3 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-l-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
                >
                  <div className="flex items-center">
                    <History className="mr-2 h-4 w-4" /> Progresso
                  </div>
                  {timelineEvents.length > 0 && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1.5 h-4 font-bold border-none bg-primary/15 text-primary"
                    >
                      {timelineEvents.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-5 bg-background space-y-4">
              {/* TAB: DETALHES */}
              <TabsContent value="details" className="m-0 space-y-4">
                
                {/* Section 1: Informações Principais */}
                <div className="space-y-3 p-4 rounded-xl border border-border/50 bg-card">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground pb-2 border-b border-border/40">
                    <Target className="h-4 w-4 text-primary" />
                    <span>Informações Principais</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Título da Oportunidade</Label>
                    <Input 
                      placeholder="Ex: Projeto Comercial / Consultoria" 
                      value={title} 
                      onChange={e => setTitle(e.target.value)} 
                      className="font-medium bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Valor (R$)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 select-none">
                          R$
                        </span>
                        <Input 
                          type="text" 
                          inputMode="numeric"
                          placeholder="0,00" 
                          value={value} 
                          onChange={e => setValue(maskBRLInput(e.target.value))} 
                          className="pl-9 font-semibold text-emerald-600 dark:text-emerald-400 bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Previsão de Fechamento</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal cursor-pointer bg-background",
                              !expectedCloseDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                            {expectedCloseDate ? formatDateSafe(expectedCloseDate + 'T12:00:00', "dd/MM/yyyy") : <span>Selecione uma data...</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="flex items-center gap-1 pb-2 mb-2 border-b text-xs">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[11px] cursor-pointer" 
                              onClick={() => setExpectedCloseDate(format(new Date(), "yyyy-MM-dd"))}
                            >
                              Hoje
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[11px] cursor-pointer" 
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 7);
                                setExpectedCloseDate(format(d, "yyyy-MM-dd"));
                              }}
                            >
                              +7 Dias
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[11px] cursor-pointer" 
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 30);
                                setExpectedCloseDate(format(d, "yyyy-MM-dd"));
                              }}
                            >
                              +30 Dias
                            </Button>
                          </div>
                          <Calendar
                            mode="single"
                            selected={expectedCloseDate ? new Date(expectedCloseDate + 'T12:00:00') : undefined}
                            onSelect={(date) => setExpectedCloseDate(date ? format(date, "yyyy-MM-dd") : "")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>

                {/* Section 2: Cliente, Responsável & Funil */}
                <div className="space-y-3 p-4 rounded-xl border border-border/50 bg-card">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground pb-2 border-b border-border/40">
                    <User className="h-4 w-4 text-primary" />
                    <span>Cliente & Atendente Responsável</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Contato Selecionado */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Contato Vinculado (Cliente)</Label>
                      <Popover open={contactComboboxOpen} onOpenChange={setContactComboboxOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={contactComboboxOpen}
                            className="w-full justify-between font-normal cursor-pointer bg-background"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <User className="h-4 w-4 text-primary shrink-0" />
                              <span className="truncate">
                                {contactId
                                  ? contacts?.find((c) => c.id === contactId)?.name || opportunity?.contacts?.name || "Contato selecionado"
                                  : "Selecione um contato..."}
                              </span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0" align="start">
                          <Command shouldFilter={false} filter={() => 1}>
                            <CommandInput 
                              placeholder="Buscar contato por nome..." 
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
                                    className="cursor-pointer"
                                    onSelect={(currentValue) => {
                                      setContactId(currentValue === contactId ? "" : currentValue);
                                      setContactComboboxOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 text-primary",
                                        contactId === c.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-medium text-sm">{c.name}</span>
                                      {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Atendente Responsável */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Atendente Responsável</Label>
                      <Select value={ownerId} onValueChange={setOwnerId}>
                        <SelectTrigger className="cursor-pointer bg-background">
                          <div className="flex items-center gap-2 truncate">
                            <UserCheck className="h-4 w-4 text-primary shrink-0" />
                            <SelectValue placeholder="Selecione o atendente..." />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {companyUsers?.map((u) => (
                            <SelectItem key={u.id} value={u.id} className="cursor-pointer">
                              {u.name || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Funil de Vendas</Label>
                      <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                        <SelectTrigger className="cursor-pointer bg-background"><SelectValue placeholder="Selecione o funil..." /></SelectTrigger>
                        <SelectContent>
                          {pipelines?.map(p => <SelectItem key={p.id} value={p.id} className="cursor-pointer">{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Etapa do Funil</Label>
                      <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                        <SelectTrigger className="cursor-pointer bg-background"><SelectValue placeholder="Selecione a etapa..." /></SelectTrigger>
                        <SelectContent>
                          {stages?.map(s => <SelectItem key={s.id} value={s.id} className="cursor-pointer">{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button className="w-full font-semibold gap-2 cursor-pointer h-10 text-sm shadow-sm" onClick={() => saveOpportunity.mutate()} disabled={!title || !stageId || saveOpportunity.isPending}>
                    {saveOpportunity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Alterações
                  </Button>
                </div>
              </TabsContent>

              {/* TAB: TAREFAS */}
              <TabsContent value="tasks" className="m-0 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Tarefas da Oportunidade</h4>
                  </div>
                  <TaskDialog opportunityId={opportunity.id} contactId={opportunity.contact_id} defaultUnitId={opportunity.unit_id}>
                    <Button variant="default" size="sm" className="h-8 text-xs font-medium gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Nova Tarefa
                    </Button>
                  </TaskDialog>
                </div>

                <div className="space-y-2 pr-1 pb-4">
                  {isLoadingTasks ? (
                    <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
                  ) : !tasks || tasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/20">
                      Nenhuma tarefa agendada para esta oportunidade.
                    </div>
                  ) : (
                    tasks.map((task: any) => {
                      const taskUser = task.profiles?.name || task.profiles?.email || companyUsers?.find(u => u.id === task.assigned_to)?.name || currentOwnerName || profile?.name || "Usuário";
                      return (
                        <div key={task.id} className="flex items-center justify-between p-3 border rounded-xl group hover:bg-muted/40 transition-colors bg-card">
                          <div className="flex items-center gap-3 flex-1 overflow-hidden">
                            <button 
                              type="button"
                              onClick={() => toggleTask.mutate(task)} 
                              className="text-muted-foreground hover:text-primary transition-colors shrink-0 cursor-pointer p-0.5 rounded-full hover:bg-primary/10"
                              title={task.status === 'done' ? "Marcar como pendente" : "Marcar como concluída"}
                            >
                              {task.status === 'done' ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/15 cursor-pointer transition-colors" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground hover:text-emerald-600 cursor-pointer transition-colors" />
                              )}
                            </button>

                            {task.task_type === "call" && <Phone className="h-4 w-4 text-blue-500 shrink-0" />}
                            {task.task_type === "message" && <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />}
                            {task.task_type === "meeting" && <Video className="h-4 w-4 text-purple-500 shrink-0" />}
                            {task.task_type === "follow_up" && <CalendarClock className="h-4 w-4 text-amber-500 shrink-0" />}
                            {(task.task_type === "other" || !task.task_type) && <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />}

                            <div className="flex flex-col overflow-hidden min-w-0">
                              <span className={`text-xs font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-primary shrink-0" />
                                  <span className="font-medium text-foreground">{taskUser}</span>
                                </span>
                                {task.due_date && (
                                  <span className="flex items-center gap-1">
                                    <span>•</span>
                                    <Clock className="h-3 w-3 shrink-0" />
                                    <span>{formatDateSafe(task.due_date)}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Ações da Tarefa: Editar e Excluir */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <TaskDialog taskToEdit={task} opportunityId={opportunity.id} contactId={opportunity.contact_id} defaultUnitId={opportunity.unit_id}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer" title="Editar Tarefa">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TaskDialog>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer" onClick={() => deleteTask.mutate(task.id)} title="Excluir Tarefa">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TabsContent>

              {/* TAB: NOTAS */}
              <TabsContent value="notes" className="m-0 space-y-4">
                <OpportunityNotes opportunityId={opportunity.id} />
              </TabsContent>

              {/* TAB: PROGRESSO & HISTÓRICO */}
              <TabsContent value="timeline" className="m-0 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Histórico & Progresso</h4>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{timelineEvents.length} evento(s)</span>
                </div>

                <div className="space-y-0 relative before:absolute before:inset-y-0 before:left-4 before:w-0.5 before:bg-border/60 pt-1 pr-1 pb-4">
                  {timelineEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/20">
                      Nenhum evento no histórico desta oportunidade.
                    </div>
                  ) : (
                    timelineEvents.map((evt) => {
                      const isWon = evt.title.includes('GANHA');
                      const isLost = evt.title.includes('PERDIDA');
                      const isStage = evt.title.includes('Mudança de Etapa');
                      const isReopen = evt.title.includes('REABERTA');

                      const bulletBorderColor = 
                        evt.type === 'creation' ? "border-primary text-primary" :
                        evt.type === 'note' ? "border-amber-500 text-amber-500" :
                        evt.type === 'task' ? "border-blue-500 text-blue-500" :
                        isWon ? "border-emerald-500 text-emerald-500" :
                        isLost ? "border-rose-500 text-rose-500" :
                        isStage ? "border-purple-500 text-purple-500" :
                        "border-blue-500 text-blue-500";

                      const bulletBgColor = 
                        evt.type === 'creation' ? "bg-primary" :
                        evt.type === 'note' ? "bg-amber-500" :
                        evt.type === 'task' ? "bg-blue-500" :
                        isWon ? "bg-emerald-500" :
                        isLost ? "bg-rose-500" :
                        isStage ? "bg-purple-500" :
                        "bg-blue-500";

                      return (
                        <div key={evt.id} className="relative pl-8 pb-5 group last:pb-1">
                          {/* Connector Bullet */}
                          <div className={cn(
                            "absolute left-2 -translate-x-1/2 top-0.5 h-4 w-4 rounded-full border-2 bg-background flex items-center justify-center shrink-0 z-10 transition-colors",
                            bulletBorderColor
                          )}>
                            <div className={cn("h-1.5 w-1.5 rounded-full", bulletBgColor)} />
                          </div>

                        {/* Event Content Card */}
                        <div className="p-3 border rounded-xl bg-card space-y-1.5 shadow-2xs group-hover:border-primary/40 transition-colors">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 h-4 font-semibold border-none", evt.color)}>
                                {evt.type === 'creation' ? "Criação" :
                                 evt.type === 'status' ? "Status" :
                                 evt.type === 'note' ? "Observação" : "Tarefa"}
                              </Badge>
                              <span className="text-xs font-semibold text-foreground truncate">{evt.title}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                              {formatDateSafe(evt.timestamp)}
                            </span>
                          </div>

                          {evt.description && (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {evt.description}
                            </p>
                          )}

                          {evt.user && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                              <User className="h-3 w-3 text-primary shrink-0" />
                              <span>Por: <strong className="text-foreground font-medium">{evt.user}</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        ) : (
          /* MODO DE CRIAÇÃO (NOVA OPORTUNIDADE) */
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Título da Oportunidade</Label>
              <Input placeholder="Ex: Projeto Comercial" value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Valor (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 select-none">
                    R$
                  </span>
                  <Input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="0,00" 
                    value={value} 
                    onChange={e => setValue(maskBRLInput(e.target.value))} 
                    className="pl-9 font-semibold text-emerald-600 dark:text-emerald-400" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Data de Fechamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal cursor-pointer",
                        !expectedCloseDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {expectedCloseDate ? formatDateSafe(expectedCloseDate + 'T12:00:00', "dd/MM/yyyy") : <span>Selecione uma data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="flex items-center gap-1 pb-2 mb-2 border-b text-xs">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] cursor-pointer" onClick={() => setExpectedCloseDate(format(new Date(), "yyyy-MM-dd"))}>Hoje</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] cursor-pointer" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); setExpectedCloseDate(format(d, "yyyy-MM-dd")); }}>+7 Dias</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] cursor-pointer" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 30); setExpectedCloseDate(format(d, "yyyy-MM-dd")); }}>+30 Dias</Button>
                    </div>
                    <Calendar
                      mode="single"
                      selected={expectedCloseDate ? new Date(expectedCloseDate + 'T12:00:00') : undefined}
                      onSelect={(date) => setExpectedCloseDate(date ? format(date, "yyyy-MM-dd") : "")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!defaultContactId && (
                <div className="space-y-1.5 flex flex-col">
                  <Label className="text-xs font-medium text-muted-foreground">Contato</Label>
                  <Popover open={contactComboboxOpen} onOpenChange={setContactComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={contactComboboxOpen}
                        className="w-full justify-between font-normal cursor-pointer"
                      >
                        {contactId
                          ? contacts?.find((c) => c.id === contactId)?.name || "Contato selecionado"
                          : "Selecione um contato..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
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
                                className="cursor-pointer"
                                onSelect={(currentValue) => {
                                  setContactId(currentValue === contactId ? "" : currentValue);
                                  setContactComboboxOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 text-primary",
                                    contactId === c.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">{c.name}</span>
                                  {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Atendente Responsável na Criação */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Atendente Responsável</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger className="cursor-pointer bg-background">
                    <div className="flex items-center gap-2 truncate">
                      <UserCheck className="h-4 w-4 text-primary shrink-0" />
                      <SelectValue placeholder="Selecione o atendente..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {companyUsers?.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="cursor-pointer">
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Funil</Label>
                <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Selecione o funil..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines?.map(p => <SelectItem key={p.id} value={p.id} className="cursor-pointer">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Etapa do Funil</Label>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Selecione a etapa..." /></SelectTrigger>
                  <SelectContent>
                    {stages?.map(s => <SelectItem key={s.id} value={s.id} className="cursor-pointer">{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button className="w-full font-semibold gap-2 cursor-pointer" onClick={() => saveOpportunity.mutate()} disabled={!title || !stageId || saveOpportunity.isPending}>
                {saveOpportunity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar Oportunidade
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
