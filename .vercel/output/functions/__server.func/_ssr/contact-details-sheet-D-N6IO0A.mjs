import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { u as useQuery, a as useQueryClient, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { S as Sheet, a as SheetContent, b as SheetHeader, c as SheetTitle, d as SheetDescription } from "./sheet-DiuHGwRv.mjs";
import { B as Badge, D as Dialog, i as DialogTrigger, a as DialogContent, b as DialogHeader, c as DialogTitle, T as Tabs, f as TabsList, g as TabsTrigger, h as TabsContent } from "./tabs-DaV-6sV-.mjs";
import { R as Root, V as Viewport, C as Corner, S as ScrollAreaScrollbar, a as ScrollAreaThumb } from "../_libs/radix-ui__react-scroll-area.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { R as Root$1 } from "../_libs/radix-ui__react-separator.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { O as OpportunityDialog, T as TaskDialog } from "./opportunity-dialog-De0nOeSk.mjs";
import { H as LoaderCircle, v as Phone, ab as CalendarDays, k as Pen, ac as History, q as Clock, W as MessageCircle, l as Smartphone, s as Target, P as Plus, ad as DollarSign, w as Save, b as SquareCheckBig, p as Circle, M as MessageSquare, V as Video, u as CalendarClock, T as Trash2 } from "../_libs/lucide-react.mjs";
import { f as format, p as ptBR } from "../_libs/date-fns.mjs";
const ScrollArea = reactExports.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Root,
  {
    ref,
    className: cn("relative overflow-hidden", className),
    ...props,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Viewport, { className: "h-full w-full rounded-[inherit]", children }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollBar, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Corner, {})
    ]
  }
));
ScrollArea.displayName = Root.displayName;
const ScrollBar = reactExports.forwardRef(({ className, orientation = "vertical", ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  ScrollAreaScrollbar,
  {
    ref,
    orientation,
    className: cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-border" })
  }
));
ScrollBar.displayName = ScrollAreaScrollbar.displayName;
const Separator = reactExports.forwardRef(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Root$1,
  {
    ref,
    decorative,
    orientation,
    className: cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className
    ),
    ...props
  }
));
Separator.displayName = Root$1.displayName;
function ContactTasks({ contactId }) {
  const qc = useQueryClient();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["contact-tasks", contactId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("contact_id", contactId).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });
  const toggleTask = useMutation({
    mutationFn: async (task) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] });
    }
  });
  const deleteTask = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] });
      toast.success("Tarefa removida!");
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-5 w-5 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold", children: "Tarefas" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TaskDialog, { contactId, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
        " Nova Tarefa"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2 mt-4", children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : !tasks || tasks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed", children: "Nenhuma tarefa pendente." }) : tasks.map((task) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 p-3 border rounded-lg group bg-muted/30 hover:bg-muted/50 transition-colors", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-1 overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => toggleTask.mutate(task), className: "text-muted-foreground hover:text-primary transition-colors", children: task.status === "done" ? /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-5 w-5 text-emerald-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-5 w-5" }) }),
          task.task_type === "call" && /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-4 w-4 text-blue-500 flex-shrink-0" }),
          task.task_type === "message" && /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { className: "h-4 w-4 text-emerald-500 flex-shrink-0" }),
          task.task_type === "meeting" && /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "h-4 w-4 text-purple-500 flex-shrink-0" }),
          task.task_type === "follow_up" && /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarClock, { className: "h-4 w-4 text-orange-500 flex-shrink-0" }),
          (task.task_type === "other" || !task.task_type) && /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-4 w-4 text-muted-foreground flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col overflow-hidden", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-medium truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`, children: task.title }),
            task.due_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-3 w-3" }),
              format(new Date(task.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive", onClick: () => deleteTask.mutate(task.id), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) })
      ] }),
      task.opportunity_id && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex pl-11", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "text-[10px] text-muted-foreground", children: "Vinculado a Oportunidade" }) })
    ] }, task.id)) })
  ] });
}
function ContactDetailsTabs({ contactId }) {
  const { data: contact, isLoading: isLoadingContact } = useQuery({
    queryKey: ["contact-details", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).single();
      if (error) throw error;
      return data;
    }
  });
  const { data: conversations, isLoading: isLoadingConversations } = useQuery({
    queryKey: ["contact-conversations", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select(`
          id,
          status,
          started_at,
          last_message_at,
          channel,
          whatsapp_instance_id,
          whatsapp_instances (
            name,
            instance_name
          )
        `).eq("contact_id", contactId).order("last_message_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const { data: opportunities, isLoading: isLoadingOpportunities } = useQuery({
    queryKey: ["contact-opportunities", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select(`
          id,
          title,
          value,
          expected_close_date,
          created_at,
          pipeline_stages (
            name,
            color,
            pipelines (
              name
            )
          )
        `).eq("contact_id", contactId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const getStatusColor = (status) => {
    switch (status) {
      case "waiting":
        return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
      case "active":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
      case "resolved":
        return "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };
  const translateStatus = (status) => {
    switch (status) {
      case "waiting":
        return "Aguardando";
      case "active":
        return "Em Atendimento";
      case "resolved":
        return "Resolvido";
      default:
        return status;
    }
  };
  if (isLoadingContact) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin text-muted-foreground" }) });
  }
  if (!contact) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center p-8 text-center text-muted-foreground", children: "Contato não encontrado." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { defaultValue: "observacoes", className: "flex-1 flex flex-col h-full min-h-0 w-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pt-4 border-b w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-4 h-auto py-1 bg-muted/50 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "observacoes", className: "px-1 py-1.5 text-[11px]", children: "Notas" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "conversations", className: "px-1 py-1.5 text-[11px]", children: "Histórico" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "opportunities", className: "px-1 py-1.5 text-[11px]", children: "CRM" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "tasks", className: "px-1 py-1.5 text-[11px]", children: "Tarefas" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(ScrollArea, { className: "flex-1 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "observacoes", className: "mt-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "h-5 w-5 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold", children: "Observações" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "conversations", className: "mt-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "h-5 w-5 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold", children: "Histórico de Atendimentos" })
        ] }),
        isLoadingConversations ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : !conversations || conversations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-8 text-muted-foreground border rounded-lg border-dashed", children: "Nenhuma conversa registrada." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: conversations.map((conv) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 p-4 rounded-lg border bg-card text-card-foreground shadow-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: getStatusColor(conv.status), children: translateStatus(conv.status) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: format(new Date(conv.last_message_at), "dd/MM/yy HH:mm", { locale: ptBR }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Separator, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-muted-foreground", children: [
              conv.channel === "whatsapp" ? /* @__PURE__ */ jsxRuntimeExports.jsx(MessageCircle, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MessageCircle, { className: "h-4 w-4" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "capitalize", children: conv.channel })
            ] }),
            conv.whatsapp_instances && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-md", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate max-w-[150px]", children: conv.whatsapp_instances.name })
            ] })
          ] })
        ] }, conv.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "opportunities", className: "mt-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Target, { className: "h-5 w-5 text-muted-foreground" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold", children: "Oportunidades" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(OpportunityDialog, { defaultContactId: contactId, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", className: "h-8", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-1" }),
            " Nova"
          ] }) })
        ] }),
        isLoadingOpportunities ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : !opportunities || opportunities.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-8 text-muted-foreground border rounded-lg border-dashed", children: "Nenhuma oportunidade registrada para este contato." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: opportunities.map((opp) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 p-4 rounded-lg border bg-card text-card-foreground shadow-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium", children: opp.title }),
              opp.pipeline_stages?.pipelines?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground mt-0.5", children: [
                "Funil: ",
                opp.pipeline_stages.pipelines.name
              ] })
            ] }),
            opp.pipeline_stages && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { style: { backgroundColor: opp.pipeline_stages.color, color: "#fff" }, variant: "outline", children: opp.pipeline_stages.name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Separator, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-green-600 font-medium", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "h-4 w-4" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(opp.value || 0) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-muted-foreground", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "h-3 w-3" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: format(new Date(opp.created_at), "dd/MM/yyyy", { locale: ptBR }) })
            ] })
          ] })
        ] }, opp.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "tasks", className: "mt-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ContactTasks, { contactId }) })
    ] })
  ] });
}
function ContactDetailsSheet({ contactId, open, onOpenChange }) {
  const { data: contact, isLoading: isLoadingContact } = useQuery({
    queryKey: ["contact-details", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).single();
      if (error) throw error;
      return data;
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Sheet, { open, onOpenChange, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SheetContent, { className: "w-full sm:max-w-md md:max-w-lg p-0 flex flex-col", children: isLoadingContact ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin text-muted-foreground" }) }) : !contact ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center p-6 text-center text-muted-foreground", children: "Contato não encontrado." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SheetHeader, { className: "p-6 pb-4 border-b", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SheetTitle, { className: "text-2xl", children: contact.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ContactEditDialog, { contact })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(SheetDescription, { className: "flex flex-col gap-2 mt-2", children: [
        contact.phone && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: contact.phone })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "Cadastrado em ",
            format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })
          ] })
        ] })
      ] }),
      contact.tags && contact.tags.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1 mt-4", children: contact.tags.map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "text-xs", children: tag }, tag)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ContactDetailsTabs, { contactId })
  ] }) }) });
}
function ContactEditForm({ contact, onSuccess }) {
  const qc = useQueryClient();
  const [name, setName] = reactExports.useState(contact.name || "");
  const [email, setEmail] = reactExports.useState(contact.email || "");
  reactExports.useEffect(() => {
    setName(contact.name || "");
    setEmail(contact.email || "");
  }, [contact]);
  const updateContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").update({ name, email }).eq("id", contact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["contact-details", contact.id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error("Erro ao atualizar", { description: e.message });
    }
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    updateContact.mutate();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "name", children: "Nome do Contato" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Input,
        {
          id: "name",
          value: name,
          onChange: (e) => setName(e.target.value),
          placeholder: "Nome completo",
          required: true
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "phone", children: "Telefone (WhatsApp)" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Input,
        {
          id: "phone",
          value: contact.phone || "",
          disabled: true,
          className: "bg-muted",
          title: "O número de telefone é o identificador único e não pode ser alterado."
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground", children: "O número é usado para deduplicação automática." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "email", children: "E-mail" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Input,
        {
          id: "email",
          type: "email",
          value: email,
          onChange: (e) => setEmail(e.target.value),
          placeholder: "email@empresa.com"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Button,
      {
        type: "submit",
        className: "w-full",
        disabled: updateContact.isPending || name === contact.name && email === (contact.email || ""),
        children: [
          updateContact.isPending ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "mr-2 h-4 w-4" }),
          "Salvar Alterações"
        ]
      }
    ) })
  ] }) });
}
function ContactEditDialog({ contact }) {
  const [open, setOpen] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 rounded-full", title: "Editar contato", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pen, { className: "h-4 w-4 text-muted-foreground" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Editar Contato" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ContactEditForm, { contact, onSuccess: () => setOpen(false) }) })
    ] })
  ] });
}
export {
  ContactDetailsSheet as C,
  ScrollArea as S,
  ContactEditDialog as a,
  ContactDetailsTabs as b
};
