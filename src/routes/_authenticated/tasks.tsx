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
  Clock,
  User,
  Building,
  Target,
  Edit2,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Calendar as CalendarIcon,
  Loader2
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
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

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const [tab, setTab] = useState<"pending" | "done" | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const [taskToEdit, setTaskToEdit] = useState<any>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Query team members for assigned_to filter selection
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allTasks, isLoading } = useQuery({
    queryKey: ["all-tasks", activeCompanyId, profile?.id, profile?.role, selectedUnitId, dateRange],
    enabled: !!profile?.id && !!activeCompanyId,
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
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      // Permission Logic (Admins, Super Admins & Managers see all)
      if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
        query = query.eq("assigned_to", profile!.id);
      }

      if (dateRange?.from) {
        query = query.gte("due_date", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        query = query.lte("due_date", toDate.toISOString());
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

  // Calculate Metrics for KPIs
  const now = new Date();
  const pendingTasks = (allTasks || []).filter((t: any) => t.status === "pending");
  const doneTasks = (allTasks || []).filter((t: any) => t.status === "done");

  const overdueTasks = pendingTasks.filter((t: any) => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < now;
  });

  const todayTasks = pendingTasks.filter((t: any) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });

  // Filter Tasks for the list
  const filteredTasks = (allTasks || []).filter((task: any) => {
    // Filter by tab status
    if (tab === "pending" && task.status !== "pending") return false;
    if (tab === "done" && task.status !== "done") return false;

    // Filter by task type
    if (taskTypeFilter !== "all" && task.task_type !== taskTypeFilter) return false;

    // Filter by assigned user
    if (assignedFilter !== "all" && task.assigned_to !== assignedFilter) return false;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const title = (task.title || "").toLowerCase();
      const desc = (task.description || "").toLowerCase();
      const contactName = (task.contacts?.name || "").toLowerCase();
      const oppTitle = (task.opportunities?.title || "").toLowerCase();
      const assignedName = (task.assigned?.name || "").toLowerCase();

      if (
        !title.includes(term) &&
        !desc.includes(term) &&
        !contactName.includes(term) &&
        !oppTitle.includes(term) &&
        !assignedName.includes(term)
      ) {
        return false;
      }
    }

    return true;
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
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Top KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pendentes
            </span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{pendingTasks.length}</div>
          <p className="text-xs text-muted-foreground mt-0.5">Aguardando execução</p>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Atrasadas
            </span>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
            {overdueTasks.length}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Requerem atenção imediata</p>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Para Hoje
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <CalendarClock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {todayTasks.length}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Vencem no dia atual</p>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Concluídas
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {doneTasks.length}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Finalizadas com sucesso</p>
        </Card>
      </div>

      {/* Main Content Area with Filters & List */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Tab Navigation */}
              <TabsList className="h-9 w-fit">
                <TabsTrigger value="pending" className="text-xs">
                  Pendentes ({pendingTasks.length})
                </TabsTrigger>
                <TabsTrigger value="done" className="text-xs">
                  Concluídas ({doneTasks.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">
                  Todas ({(allTasks || []).length})
                </TabsTrigger>
              </TabsList>

              {/* Filters & Actions Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search Input */}
                <div className="relative w-full sm:w-48 md:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar por título, contato..."
                    className="pl-8 h-8 text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
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

                {/* Task Type Filter */}
                <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Tipos</SelectItem>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="message">Mensagem</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="other">Outros</SelectItem>
                  </SelectContent>
                </Select>

                {/* Assigned Attendant Filter */}
                <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Responsáveis</SelectItem>
                    {teamMembers?.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Date Range Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-normal">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yy")} - {format(dateRange.to, "dd/MM/yy")}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy")
                        )
                      ) : (
                        "Período"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>

                {/* Clear Filters Button */}
                {(searchTerm || taskTypeFilter !== "all" || assignedFilter !== "all" || dateRange) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm("");
                      setTaskTypeFilter("all");
                      setAssignedFilter("all");
                      setDateRange(undefined);
                    }}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Limpar
                  </Button>
                )}

                {/* New Task Button */}
                <TaskDialog>
                  <Button size="sm" className="h-8 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Nova Tarefa
                  </Button>
                </TaskDialog>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Carregando tarefas...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground mb-4">
                  <CheckSquare className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold">Nenhuma tarefa encontrada</h3>
                <p className="max-w-md text-xs text-muted-foreground mt-1">
                  {searchTerm || taskTypeFilter !== "all" || assignedFilter !== "all" || dateRange
                    ? "Nenhum resultado corresponde aos filtros aplicados. Tente limpar os filtros para ver mais tarefas."
                    : tab === "pending"
                    ? "Você não tem nenhuma tarefa pendente. Aproveite para criar uma nova!"
                    : "Nenhuma tarefa concluída nesta visão."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task: any) => {
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status === 'pending';

                  return (
                    <Card
                      key={task.id}
                      className={`group overflow-hidden transition-colors border ${
                        task.status === 'done'
                          ? 'bg-muted/20 border-border/50 opacity-80'
                          : 'bg-card hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start p-4 gap-4">
                        <button
                          onClick={() => toggleTask.mutate(task)}
                          className="mt-0.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title={task.status === 'done' ? "Marcar como pendente" : "Marcar como concluída"}
                        >
                          {task.status === 'done' ? (
                            <CheckSquare className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2 font-semibold text-sm sm:text-base truncate">
                              {getTaskIcon(task.task_type, "h-4 w-4 shrink-0")}
                              <span className={`${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                                {task.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {task.due_date && (
                                <Badge
                                  variant={isOverdue ? "destructive" : "secondary"}
                                  className="gap-1 px-2 font-medium text-xs"
                                >
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(task.due_date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                </Badge>
                              )}

                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => setTaskToEdit(task)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
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
                                      <AlertDialogAction
                                        onClick={() => deleteTask.mutate(task.id)}
                                        className="bg-destructive hover:bg-destructive/90"
                                      >
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          </div>

                          {task.description && (
                            <p
                              className={`text-xs sm:text-sm mt-0.5 line-clamp-2 ${
                                task.status === 'done' ? 'text-muted-foreground/60' : 'text-muted-foreground'
                              }`}
                            >
                              {task.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1 font-medium bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                              {getTaskTypeLabel(task.task_type)}
                            </div>

                            {task.assigned?.name && (
                              <div className="flex items-center gap-1 font-medium bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px]" title="Responsável">
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
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

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

