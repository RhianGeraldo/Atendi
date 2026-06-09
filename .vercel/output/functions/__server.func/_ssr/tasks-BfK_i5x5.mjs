import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { u as useAuth, a as useUnit } from "./router-BZupuT9_.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { T as Tabs, f as TabsList, g as TabsTrigger, B as Badge } from "./tabs-DaV-6sV-.mjs";
import { C as Card } from "./card-t5bxWKAo.mjs";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./command-P2Bojk4p.mjs";
import { T as TaskDialog } from "./opportunity-dialog-De0nOeSk.mjs";
import { S as ScrollArea, C as ContactDetailsSheet } from "./contact-details-sheet-D-N6IO0A.mjs";
import { A as AlertDialog, h as AlertDialogTrigger, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-DteJ2TLP.mjs";
import { F as Funnel, P as Plus, b as SquareCheckBig, p as Circle, q as Clock, k as Pen, T as Trash2, r as User, s as Target, t as Building, u as CalendarClock, V as Video, M as MessageSquare, v as Phone } from "../_libs/lucide-react.mjs";
import { f as format, p as ptBR } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "./utils-H80jjgLf.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-dialog.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/react-remove-scroll.mjs";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/radix-ui__react-tabs.mjs";
import "../_libs/radix-ui__react-roving-focus.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/radix-ui__react-popover.mjs";
import "../_libs/cmdk.mjs";
import "./input-C0QjszdI.mjs";
import "./label-JU3yqRBo.mjs";
import "../_libs/radix-ui__react-label.mjs";
import "./sheet-DiuHGwRv.mjs";
import "../_libs/radix-ui__react-scroll-area.mjs";
import "../_libs/radix-ui__react-separator.mjs";
import "../_libs/radix-ui__react-alert-dialog.mjs";
function TasksPage() {
  const qc = useQueryClient();
  const {
    profile
  } = useAuth();
  const {
    selectedUnitId
  } = useUnit();
  const [tab, setTab] = reactExports.useState("pending");
  const [taskTypeFilter, setTaskTypeFilter] = reactExports.useState("all");
  const [taskToEdit, setTaskToEdit] = reactExports.useState(null);
  const [selectedContactId, setSelectedContactId] = reactExports.useState(null);
  const {
    data: tasks,
    isLoading
  } = useQuery({
    queryKey: ["all-tasks", profile?.id, profile?.role, selectedUnitId, tab, taskTypeFilter],
    enabled: !!profile?.id,
    queryFn: async () => {
      let query = supabase.from("tasks").select(`
          *,
          contacts(name),
          opportunities(title),
          assigned:profiles!tasks_assigned_to_fkey(name),
          units(name)
        `).eq("status", tab).order("due_date", {
        ascending: tab === "pending"
      }).order("created_at", {
        ascending: false
      });
      if (taskTypeFilter !== "all") {
        query = query.eq("task_type", taskTypeFilter);
      }
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      } else if (profile?.company_id) ;
      if (profile?.role !== "admin_company" && profile?.role !== "manager") {
        query = query.eq("assigned_to", profile.id);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data || [];
    }
  });
  const toggleTask = useMutation({
    mutationFn: async (task) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      const {
        error
      } = await supabase.from("tasks").update({
        status: newStatus
      }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["all-tasks"]
      });
      qc.invalidateQueries({
        queryKey: ["contact-tasks"]
      });
      qc.invalidateQueries({
        queryKey: ["opp-tasks"]
      });
    }
  });
  const deleteTask = useMutation({
    mutationFn: async (id) => {
      const {
        error
      } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["all-tasks"]
      });
      qc.invalidateQueries({
        queryKey: ["contact-tasks"]
      });
      qc.invalidateQueries({
        queryKey: ["opp-tasks"]
      });
      toast.success("Tarefa excluída!");
    }
  });
  const getTaskIcon = (type, size = "h-4 w-4") => {
    switch (type) {
      case "call":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: `${size} text-blue-500` });
      case "message":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { className: `${size} text-emerald-500` });
      case "meeting":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: `${size} text-purple-500` });
      case "follow_up":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarClock, { className: `${size} text-orange-500` });
      default:
        return /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: `${size} text-muted-foreground` });
    }
  };
  const getTaskTypeLabel = (type) => {
    switch (type) {
      case "call":
        return "Ligação";
      case "message":
        return "Mensagem";
      case "meeting":
        return "Reunião";
      case "follow_up":
        return "Follow-up";
      default:
        return "Outro";
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-hidden bg-muted/20", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b bg-card px-6 py-4 shrink-0 flex-wrap gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 flex-wrap", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Tarefas" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Tabs, { value: tab, onValueChange: (v) => setTab(v), className: "w-[250px] sm:w-[300px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "pending", children: "Pendentes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "done", children: "Concluídas" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 border-l pl-4 ml-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Funnel, { className: "h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: taskTypeFilter, onValueChange: setTaskTypeFilter, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-[140px] h-9", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Tipo" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "Todos" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "call", children: "Ligação" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "message", children: "Mensagem" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "meeting", children: "Reunião" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "follow_up", children: "Follow-up" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "other", children: "Outro" })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TaskDialog, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-2" }),
        "Nova Tarefa"
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollArea, { className: "flex-1 p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-4xl mx-auto space-y-4", children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-12 text-muted-foreground", children: "Carregando tarefas..." }) : !tasks || tasks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "flex flex-col items-center gap-3 p-12 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-6 w-6" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold", children: "Nenhuma Tarefa" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "max-w-md text-sm text-muted-foreground", children: tab === "pending" ? "Você não tem nenhuma tarefa pendente. Aproveite para criar uma nova!" : "Nenhuma tarefa concluída ainda." })
    ] }) : tasks.map((task) => {
      const isOverdue = task.due_date && new Date(task.due_date) < /* @__PURE__ */ new Date() && task.status === "pending";
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { className: `group overflow-hidden transition-colors ${task.status === "done" ? "bg-muted/30" : "bg-card hover:border-primary/40"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start p-4 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => toggleTask.mutate(task), className: "mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0", children: task.status === "done" ? /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-6 w-6 text-emerald-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-6 w-6" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0 flex flex-col gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 font-semibold text-base truncate", children: [
              getTaskIcon(task.task_type, "h-4 w-4 shrink-0"),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `${task.status === "done" ? "line-through text-muted-foreground" : ""}`, children: task.title })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
              task.due_date && /* @__PURE__ */ jsxRuntimeExports.jsxs(Badge, { variant: isOverdue ? "destructive" : "secondary", className: "gap-1 px-2 font-medium", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-3 w-3" }),
                format(new Date(task.due_date), "dd/MM 'às' HH:mm", {
                  locale: ptBR
                })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center opacity-0 group-hover:opacity-100 transition-opacity", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground hover:text-primary", onClick: () => setTaskToEdit(task), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pen, { className: "h-4 w-4" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialog, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Excluir Tarefa?" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogDescription, { children: "Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita." })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancelar" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: () => deleteTask.mutate(task.id), className: "bg-destructive hover:bg-destructive/90", children: "Excluir" })
                    ] })
                  ] })
                ] })
              ] })
            ] })
          ] }),
          task.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-sm mt-1 line-clamp-2 ${task.status === "done" ? "text-muted-foreground/60" : "text-muted-foreground"}`, children: task.description }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 font-medium bg-muted/50 px-2 py-0.5 rounded", children: getTaskTypeLabel(task.task_type) }),
            (profile?.role === "admin_company" || profile?.role === "manager") && task.assigned?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", title: "Responsável", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: task.assigned.name })
            ] }),
            task.contacts?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 cursor-pointer hover:text-primary transition-colors hover:underline", onClick: () => setSelectedContactId(task.contact_id), title: "Ver contato", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate max-w-[150px]", children: task.contacts.name })
            ] }),
            task.opportunities?.title && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Target, { className: "h-3 w-3 text-primary/70" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate max-w-[150px]", children: task.opportunities.title })
            ] }),
            !selectedUnitId && task.units?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Building, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate max-w-[150px]", children: task.units.name })
            ] })
          ] })
        ] })
      ] }) }, task.id);
    }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TaskDialog, { taskToEdit, open: !!taskToEdit, onOpenChange: (open) => !open && setTaskToEdit(null) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ContactDetailsSheet, { contactId: selectedContactId, open: !!selectedContactId, onOpenChange: (open) => !open && setSelectedContactId(null) })
  ] });
}
export {
  TasksPage as component
};
