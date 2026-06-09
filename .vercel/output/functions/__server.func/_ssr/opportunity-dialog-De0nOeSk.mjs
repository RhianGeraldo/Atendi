import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, b as useMutation, u as useQuery } from "../_libs/tanstack__react-query.mjs";
import { D as Dialog, i as DialogTrigger, a as DialogContent, b as DialogHeader, c as DialogTitle, e as DialogFooter, T as Tabs, f as TabsList, g as TabsTrigger, B as Badge, h as TabsContent } from "./tabs-DaV-6sV-.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea, P as Popover, e as PopoverTrigger, f as PopoverContent, C as Command, g as CommandInput, h as CommandList, i as CommandEmpty, j as CommandGroup, k as CommandItem } from "./command-P2Bojk4p.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { a as useUnit, u as useAuth } from "./router-BZupuT9_.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { v as Phone, M as MessageSquare, V as Video, u as CalendarClock, ae as Ellipsis, P as Plus, H as LoaderCircle, b as SquareCheckBig, p as Circle, q as Clock, T as Trash2, C as ChevronsUpDown, o as Check } from "../_libs/lucide-react.mjs";
import { f as format, p as ptBR } from "../_libs/date-fns.mjs";
function TaskDialog({
  children,
  contactId,
  opportunityId,
  defaultUnitId,
  taskToEdit,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = reactExports.useState(false);
  const open = controlledOpen !== void 0 ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const [title, setTitle] = reactExports.useState("");
  const [taskType, setTaskType] = reactExports.useState("other");
  const [dueDate, setDueDate] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (open) {
      if (taskToEdit) {
        setTitle(taskToEdit.title || "");
        setTaskType(taskToEdit.task_type || "other");
        setDueDate(taskToEdit.due_date ? new Date(taskToEdit.due_date).toISOString().slice(0, 16) : "");
        setDescription(taskToEdit.description || "");
      } else {
        setTitle("");
        setTaskType("other");
        setDueDate("");
        setDescription("");
      }
    }
  }, [open, taskToEdit]);
  const addTask = useMutation({
    mutationFn: async () => {
      if (!title.trim()) return;
      let unitId = selectedUnitId || defaultUnitId;
      if (!taskToEdit && !unitId) {
        if (contactId) {
          const { data: convData } = await supabase.from("conversations").select("unit_id").eq("contact_id", contactId).not("unit_id", "is", null).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
          if (convData?.unit_id) {
            unitId = convData.unit_id;
          }
        }
        if (!unitId) {
          const { data: fallbackUnit } = await supabase.from("units").select("id").limit(1).maybeSingle();
          if (fallbackUnit?.id) unitId = fallbackUnit.id;
        }
      }
      if (!taskToEdit && !unitId) throw new Error("Não foi possível determinar a unidade para esta tarefa.");
      const payload = {
        title,
        task_type: taskType,
        status: taskToEdit?.status || "pending",
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        description: description || null
      };
      if (!taskToEdit) {
        payload.unit_id = unitId;
        payload.assigned_to = profile?.id;
        if (contactId) payload.contact_id = contactId;
        if (opportunityId) payload.opportunity_id = opportunityId;
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").update(payload).eq("id", taskToEdit.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false);
      toast.success(taskToEdit ? "Tarefa atualizada!" : "Tarefa criada!");
      if (contactId) qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      if (opportunityId) qc.invalidateQueries({ queryKey: ["opp-tasks", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
    children && /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: taskToEdit ? "Editar Tarefa" : "Nova Tarefa" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Título da Tarefa" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: Ligar para confirmar proposta", value: title, onChange: (e) => setTitle(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Tipo" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: taskType, onValueChange: setTaskType, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "call", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-4 w-4" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Ligar" })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "message", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { className: "h-4 w-4" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Mensagem" })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "meeting", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "h-4 w-4" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Reunião" })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "follow_up", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarClock, { className: "h-4 w-4" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Follow-up" })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "other", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Ellipsis, { className: "h-4 w-4" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Outro" })
                ] }) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Data e Hora" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "datetime-local",
                value: dueDate,
                onChange: (e) => setDueDate(e.target.value),
                onClick: (e) => {
                  try {
                    if (typeof e.currentTarget.showPicker === "function") {
                      e.currentTarget.showPicker();
                    }
                  } catch (err) {
                  }
                }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Descrição (opcional)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Textarea,
            {
              placeholder: "Detalhes adicionais...",
              value: description,
              onChange: (e) => setDescription(e.target.value),
              className: "resize-none",
              rows: 3
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogFooter, { className: "mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: () => addTask.mutate(), disabled: !title.trim() || addTask.isPending, children: "Salvar Tarefa" })
      ] })
    ] })
  ] });
}
function OpportunityDialog({
  children,
  opportunity,
  defaultContactId,
  defaultPipelineId
}) {
  const [open, setOpen] = reactExports.useState(false);
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const [title, setTitle] = reactExports.useState("");
  const [value, setValue] = reactExports.useState("");
  const [notes, setNotes] = reactExports.useState("");
  const [expectedCloseDate, setExpectedCloseDate] = reactExports.useState("");
  const [contactId, setContactId] = reactExports.useState(defaultContactId || "");
  const [pipelineId, setPipelineId] = reactExports.useState(defaultPipelineId || "");
  const [stageId, setStageId] = reactExports.useState("");
  const [contactSearch, setContactSearch] = reactExports.useState("");
  const [contactComboboxOpen, setContactComboboxOpen] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (open) {
      if (opportunity) {
        setTitle(opportunity.title || "");
        setValue(opportunity.value?.toString() || "");
        setNotes(opportunity.notes || "");
        setExpectedCloseDate(opportunity.expected_close_date ? opportunity.expected_close_date.split("T")[0] : "");
        setContactId(opportunity.contact_id || "");
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
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipelines").select("*").eq("company_id", profile.company_id);
      return data || [];
    }
  });
  const { data: stages } = useQuery({
    queryKey: ["pipeline-stages-by-pipeline", pipelineId],
    enabled: !!pipelineId && open,
    queryFn: async () => {
      const { data } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineId).order("order");
      return data || [];
    }
  });
  const { data: contacts, isLoading: isLoadingContacts } = useQuery({
    queryKey: ["contacts-dropdown", profile?.company_id, contactSearch],
    enabled: !defaultContactId && !!profile?.company_id && open,
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, name, phone").eq("company_id", profile.company_id);
      if (contactSearch) {
        q = q.or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`);
      }
      const { data } = await q.limit(5);
      return data || [];
    }
  });
  const { data: fallbackUnit } = useQuery({
    queryKey: ["first-unit-opp", profile?.company_id],
    enabled: !selectedUnitId && !!profile?.company_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id").eq("company_id", profile.company_id).limit(1).single();
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
        owner_id: opportunity?.owner_id || profile?.id
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
      if (!opportunity) setOpen(false);
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["opp-tasks", opportunity?.id],
    enabled: !!opportunity?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("opportunity_id", opportunity.id).order("created_at", { ascending: false });
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
      qc.invalidateQueries({ queryKey: ["opp-tasks", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    }
  });
  const deleteTask = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opp-tasks", opportunity?.id] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-[500px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { className: "text-xl", children: opportunity ? "Gerenciar Oportunidade" : "Nova Oportunidade" }) }),
      opportunity ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { defaultValue: "details", className: "w-full mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-3 mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "details", children: "Detalhes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "tasks", children: [
            "Tarefas",
            tasks && tasks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Badge, { variant: "secondary", className: "ml-2 text-[10px] px-1", children: [
              tasks.filter((t) => t.status === "done").length,
              "/",
              tasks.length
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "notes", children: "Notas" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "details", className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Título" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: Projeto Site", value: title, onChange: (e) => setTitle(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Valor (R$)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", value, onChange: (e) => setValue(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Fechamento Esperado" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: expectedCloseDate, onChange: (e) => setExpectedCloseDate(e.target.value) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Funil" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: pipelineId, onValueChange: (v) => {
                setPipelineId(v);
                setStageId("");
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione..." }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: pipelines?.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.id, children: p.name }, p.id)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Etapa" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: stageId, onValueChange: setStageId, disabled: !pipelineId, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione..." }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: stages?.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.id, children: s.name }, s.id)) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { className: "w-full", onClick: () => saveOpportunity.mutate(), disabled: !title || !stageId || saveOpportunity.isPending, children: "Salvar Alterações" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "tasks", className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TaskDialog, { opportunityId: opportunity.id, contactId: opportunity.contact_id, defaultUnitId: opportunity.unit_id, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "w-full", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-2" }),
            " Nova Tarefa"
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2 max-h-[250px] overflow-y-auto pr-1", children: isLoadingTasks ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-4 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin mx-auto text-muted-foreground" }) }) : !tasks || tasks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground text-center py-4", children: "Nenhuma tarefa criada." }) : tasks.map((task) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-2 border rounded-md group hover:bg-muted/30", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-1 overflow-hidden", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => toggleTask.mutate(task), className: "text-muted-foreground hover:text-primary transition-colors", children: task.status === "done" ? /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-4 w-4 text-emerald-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-4 w-4" }) }),
              task.task_type === "call" && /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
              task.task_type === "message" && /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
              task.task_type === "meeting" && /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
              task.task_type === "follow_up" && /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarClock, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
              (task.task_type === "other" || !task.task_type) && /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-3.5 w-3.5 text-muted-foreground flex-shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col overflow-hidden", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`, children: task.title }),
                task.due_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-3 w-3" }),
                  format(new Date(task.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive", onClick: () => deleteTask.mutate(task.id), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3 w-3" }) })
          ] }, task.id)) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "notes", className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Textarea,
            {
              placeholder: "Anotações gerais sobre a negociação...",
              value: notes,
              onChange: (e) => setNotes(e.target.value),
              className: "min-h-[150px] resize-none"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { className: "w-full", onClick: () => saveOpportunity.mutate(), disabled: saveOpportunity.isPending, children: "Salvar Notas" })
        ] })
      ] }) : (
        /* MODO DE CRIAÇÃO (NOVA OPORTUNIDADE) */
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 mt-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Título da Oportunidade" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: Projeto Site Institucional", value: title, onChange: (e) => setTitle(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Valor (R$)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", placeholder: "1500.00", value, onChange: (e) => setValue(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Data de Fechamento" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: expectedCloseDate, onChange: (e) => setExpectedCloseDate(e.target.value) })
            ] })
          ] }),
          !defaultContactId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 flex flex-col", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Contato" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { open: contactComboboxOpen, onOpenChange: setContactComboboxOpen, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                Button,
                {
                  variant: "outline",
                  role: "combobox",
                  "aria-expanded": contactComboboxOpen,
                  className: "w-full justify-between",
                  children: [
                    contactId ? contacts?.find((c) => c.id === contactId)?.name || "Contato selecionado" : "Selecione um contato...",
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUpDown, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" })
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { className: "w-[375px] p-0", align: "start", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Command, { shouldFilter: false, filter: () => 1, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  CommandInput,
                  {
                    placeholder: "Buscar contato...",
                    value: contactSearch,
                    onValueChange: setContactSearch
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandList, { children: [
                  isLoadingContacts && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin text-muted-foreground" }) }),
                  !isLoadingContacts && contacts?.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(CommandEmpty, { children: "Nenhum contato encontrado." }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CommandGroup, { children: contacts?.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    CommandItem,
                    {
                      value: c.id,
                      onSelect: (currentValue) => {
                        setContactId(currentValue === contactId ? "" : currentValue);
                        setContactComboboxOpen(false);
                      },
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          Check,
                          {
                            className: cn(
                              "mr-2 h-4 w-4",
                              contactId === c.id ? "opacity-100" : "opacity-0"
                            )
                          }
                        ),
                        c.name,
                        " ",
                        c.phone ? `(${c.phone})` : ""
                      ]
                    },
                    c.id
                  )) })
                ] })
              ] }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Funil" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: pipelineId, onValueChange: (v) => {
                setPipelineId(v);
                setStageId("");
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione..." }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: pipelines?.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.id, children: p.name }, p.id)) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Etapa" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: stageId, onValueChange: setStageId, disabled: !pipelineId, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione..." }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: stages?.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.id, children: s.name }, s.id)) })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              className: "w-full",
              onClick: () => saveOpportunity.mutate(),
              disabled: !title || !contactId || !stageId || saveOpportunity.isPending,
              children: "Criar Oportunidade"
            }
          )
        ] })
      )
    ] })
  ] });
}
export {
  OpportunityDialog as O,
  TaskDialog as T
};
