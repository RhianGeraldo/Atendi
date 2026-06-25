import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { 
  CheckSquare, 
  Circle, 
  Trash2, 
  Plus, 
  Phone, 
  MessageSquare, 
  Video, 
  CalendarClock, 
  MoreHorizontal,
  Clock,
  User,
  Building,
  Target,
  Edit2,
  Filter
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDialog } from "@/components/crm/task-dialog";
import { ContactDetailsSheet } from "@/components/contacts/contact-details-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");
  const [taskToEdit, setTaskToEdit] = useState<any>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["all-tasks", profile?.id, profile?.role, selectedUnitId, tab, taskTypeFilter],
    enabled: !!profile?.id,
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select(`
          *,
          contacts(name),
          opportunities(title),
          assigned:profiles!tasks_assigned_to_fkey(name),
          units(name)
        `)
        .eq("status", tab)
        .order("due_date", { ascending: tab === "pending" })
        .order("created_at", { ascending: false });

      if (taskTypeFilter !== "all") {
        query = query.eq("task_type", taskTypeFilter);
      }

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      } else if (activeCompanyId) {
        // Fallback: we should only fetch tasks for units the user has access to.
        // Actually, RLS handles unit access, but if we want to be explicit:
        // We just let RLS do its job for units.
      }

      // Permission Logic
      if (profile?.role !== "admin_company" && profile?.role !== "manager") {
        query = query.eq("assigned_to", profile!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const toggleTask = useMutation({
    mutationFn: async (task: any) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
      qc.invalidateQueries({ queryKey: ["contact-tasks"] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] });
    }
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
      qc.invalidateQueries({ queryKey: ["contact-tasks"] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] });
      toast.success("Tarefa excluída!");
    }
  });

  const getTaskIcon = (type: string, size = "h-4 w-4") => {
    switch (type) {
      case "call": return <Phone className={`${size} text-blue-500`} />;
      case "message": return <MessageSquare className={`${size} text-emerald-500`} />;
      case "meeting": return <Video className={`${size} text-purple-500`} />;
      case "follow_up": return <CalendarClock className={`${size} text-orange-500`} />;
      default: return <CheckSquare className={`${size} text-muted-foreground`} />;
    }
  };

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case "call": return "Ligação";
      case "message": return "Mensagem";
      case "meeting": return "Reunião";
      case "follow_up": return "Follow-up";
      default: return "Outro";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4 shrink-0 flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-[250px] sm:w-[300px]">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending">Pendentes</TabsTrigger>
              <TabsTrigger value="done">Concluídas</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex items-center gap-2 border-l pl-4 ml-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="call">Ligação</SelectItem>
                <SelectItem value="message">Mensagem</SelectItem>
                <SelectItem value="meeting">Reunião</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <TaskDialog>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </TaskDialog>
        </div>
      </header>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando tarefas...</div>
          ) : !tasks || tasks.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
                <CheckSquare className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">Nenhuma Tarefa</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {tab === "pending" 
                  ? "Você não tem nenhuma tarefa pendente. Aproveite para criar uma nova!" 
                  : "Nenhuma tarefa concluída ainda."}
              </p>
            </Card>
          ) : (
            tasks.map((task: any) => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status === 'pending';
              
              return (
                <Card key={task.id} className={`group overflow-hidden transition-colors ${task.status === 'done' ? 'bg-muted/30' : 'bg-card hover:border-primary/40'}`}>
                  <div className="flex items-start p-4 gap-4">
                    
                    <button 
                      onClick={() => toggleTask.mutate(task)} 
                      className="mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
                    >
                      {task.status === 'done' ? <CheckSquare className="h-6 w-6 text-emerald-500" /> : <Circle className="h-6 w-6" />}
                    </button>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 font-semibold text-base truncate">
                          {getTaskIcon(task.task_type, "h-4 w-4 shrink-0")}
                          <span className={`${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.title}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {task.due_date && (
                            <Badge variant={isOverdue ? "destructive" : "secondary"} className="gap-1 px-2 font-medium">
                              <Clock className="h-3 w-3" />
                              {format(new Date(task.due_date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </Badge>
                          )}
                          
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setTaskToEdit(task)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Tarefa?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteTask.mutate(task.id)} className="bg-destructive hover:bg-destructive/90">
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>

                      {task.description && (
                        <p className={`text-sm mt-1 line-clamp-2 ${task.status === 'done' ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1 font-medium bg-muted/50 px-2 py-0.5 rounded">
                          {getTaskTypeLabel(task.task_type)}
                        </div>
                        
                        {(profile?.role === "admin_company" || profile?.role === "manager") && task.assigned?.name && (
                          <div className="flex items-center gap-1" title="Responsável">
                            <User className="h-3 w-3" />
                            <span>{task.assigned.name}</span>
                          </div>
                        )}
                        
                        {task.contacts?.name && (
                          <div 
                            className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors hover:underline"
                            onClick={() => setSelectedContactId(task.contact_id)}
                            title="Ver contato"
                          >
                            <User className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{task.contacts.name}</span>
                          </div>
                        )}
                        
                        {task.opportunities?.title && (
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3 text-primary/70" />
                            <span className="truncate max-w-[150px]">{task.opportunities.title}</span>
                          </div>
                        )}
                        
                        {!selectedUnitId && task.units?.name && (
                          <div className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{task.units.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Edit Task Dialog */}
      <TaskDialog 
        taskToEdit={taskToEdit} 
        open={!!taskToEdit} 
        onOpenChange={(open) => !open && setTaskToEdit(null)}
      />

      {/* Contact Details Sheet */}
      <ContactDetailsSheet
        contactId={selectedContactId}
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      />
    </div>
  );
}
