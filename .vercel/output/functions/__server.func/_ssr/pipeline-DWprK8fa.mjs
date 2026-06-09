import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { D as DragDropContext, C as ConnectedDroppable, P as PublicDraggable } from "../_libs/hello-pangea__dnd.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { u as useAuth, a as useUnit } from "./router-BZupuT9_.mjs";
import { C as Card } from "./card-t5bxWKAo.mjs";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./command-P2Bojk4p.mjs";
import { B as Badge } from "./tabs-DaV-6sV-.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { A as Avatar, a as AvatarFallback, i as initials } from "./format-DolZ3YMa.mjs";
import { P as Provider, R as Root3, T as Trigger, a as Portal, C as Content2 } from "../_libs/radix-ui__react-tooltip.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { O as OpportunityDialog } from "./opportunity-dialog-De0nOeSk.mjs";
import { d as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { D as Settings2, P as Plus, b as SquareCheckBig, O as FileText, t as Building, R as Calendar, W as MessageCircle } from "../_libs/lucide-react.mjs";
import { f as format, p as ptBR } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/redux.mjs";
import "../_libs/react-redux.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/css-box-model.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/raf-schd.mjs";
import "../_libs/babel__runtime.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/react-remove-scroll.mjs";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/radix-ui__react-popover.mjs";
import "../_libs/cmdk.mjs";
import "../_libs/radix-ui__react-dialog.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "../_libs/radix-ui__react-tabs.mjs";
import "../_libs/radix-ui__react-roving-focus.mjs";
import "../_libs/radix-ui__react-avatar.mjs";
import "../_libs/@radix-ui/react-use-is-hydrated+[...].mjs";
import "../_libs/tailwind-merge.mjs";
import "./input-C0QjszdI.mjs";
import "./label-JU3yqRBo.mjs";
import "../_libs/radix-ui__react-label.mjs";
const TooltipProvider = Provider;
const Tooltip = Root3;
const TooltipTrigger = Trigger;
const TooltipContent = reactExports.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(Portal, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  Content2,
  {
    ref,
    sideOffset,
    className: cn(
      "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
      className
    ),
    ...props
  }
) }));
TooltipContent.displayName = Content2.displayName;
function PipelinePage() {
  const navigate = useNavigate();
  const {
    profile
  } = useAuth();
  const {
    selectedUnitId
  } = useUnit();
  const qc = useQueryClient();
  const [selectedPipelineId, setSelectedPipelineId] = reactExports.useState(null);
  const {
    data: pipelines,
    isLoading: isLoadingPipelines
  } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("pipelines").select("*").eq("company_id", profile.company_id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  if (!selectedPipelineId && pipelines && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }
  const {
    data: stages,
    isLoading: isLoadingStages
  } = useQuery({
    queryKey: ["pipeline-stages", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", selectedPipelineId).order("order", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  const {
    data: opportunities,
    isLoading: isLoadingOpps
  } = useQuery({
    queryKey: ["opportunities", selectedPipelineId, profile?.role, profile?.id],
    enabled: !!selectedPipelineId && !!stages && stages.length > 0 && !!profile?.id,
    queryFn: async () => {
      const stageIds = stages.map((s) => s.id);
      let query = supabase.from("opportunities").select(`
          id, title, value, stage_id, expected_close_date, contact_id, created_at, notes, owner_id, unit_id,
          contacts ( name ),
          tasks ( id, status ),
          units ( name )
        `).in("stage_id", stageIds);
      if (profile?.role !== "admin_company" && profile?.role !== "manager") {
        query = query.eq("owner_id", profile.id);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data;
    }
  });
  const columns = reactExports.useMemo(() => {
    if (!stages) return {};
    const cols = {};
    stages.forEach((s) => {
      cols[s.id] = (opportunities || []).filter((o) => o.stage_id === s.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return cols;
  }, [stages, opportunities]);
  const moveOpportunity = useMutation({
    mutationFn: async ({
      oppId,
      newStageId
    }) => {
      const {
        error
      } = await supabase.from("opportunities").update({
        stage_id: newStageId
      }).eq("id", oppId);
      if (error) throw error;
    },
    onMutate: async ({
      oppId,
      newStageId
    }) => {
      await qc.cancelQueries({
        queryKey: ["opportunities", selectedPipelineId]
      });
      const previous = qc.getQueryData(["opportunities", selectedPipelineId]);
      qc.setQueryData(["opportunities", selectedPipelineId], (old) => {
        if (!old) return old;
        return old.map((o) => o.id === oppId ? {
          ...o,
          stage_id: newStageId
        } : o);
      });
      return {
        previous
      };
    },
    onError: (err, variables, context) => {
      toast.error("Erro ao mover card", {
        description: err.message
      });
      if (context?.previous) {
        qc.setQueryData(["opportunities", selectedPipelineId], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["opportunities", selectedPipelineId]
      });
    }
  });
  const onDragEnd = (result) => {
    const {
      destination,
      source,
      draggableId
    } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    if (source.droppableId !== destination.droppableId) {
      moveOpportunity.mutate({
        oppId: draggableId,
        newStageId: destination.droppableId
      });
    }
  };
  const formatCurrency = (val) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };
  const goToConversation = async (contactId, e) => {
    e.stopPropagation();
    try {
      const {
        data
      } = await supabase.from("conversations").select("id, status").eq("contact_id", contactId).order("last_message_at", {
        ascending: false
      }).limit(1).single();
      if (data) {
        navigate({
          to: "/conversations",
          search: {
            c: data.id,
            tab: data.status
          }
        });
      } else {
        toast.error("Este contato ainda não possui conversas.");
      }
    } catch (err) {
      toast.error("Erro ao buscar conversa.");
    }
  };
  if (isLoadingPipelines) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: "Carregando CRM..." });
  if (!pipelines || pipelines.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "flex flex-col items-center gap-3 p-12 text-center max-w-lg mx-auto mt-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings2, { className: "h-6 w-6" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold", children: "Nenhum Funil Encontrado" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Você ainda não configurou um funil de vendas. Acesse as Configurações para criar seu primeiro funil e etapas." })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-hidden bg-muted/20", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b bg-card px-6 py-4 shrink-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Kanban" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: selectedPipelineId || "", onValueChange: setSelectedPipelineId, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "w-[250px] h-9", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione um funil" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: pipelines.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.id, children: p.name }, p.id)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(OpportunityDialog, { defaultPipelineId: selectedPipelineId || "", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "default", size: "sm", className: "h-9", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-2" }),
        "Nova Oportunidade"
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-x-auto p-6", children: isLoadingStages || isLoadingOpps ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-muted-foreground text-sm", children: "Carregando quadro..." }) : !stages || stages.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center mt-10 text-muted-foreground", children: "Este funil ainda não tem etapas. Adicione etapas nas configurações." }) : /* @__PURE__ */ jsxRuntimeExports.jsx(DragDropContext, { onDragEnd, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-start gap-4 pb-4", children: stages.map((stage) => {
      const stageOpps = columns[stage.id] || [];
      const stageTotal = stageOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full max-h-full w-[300px] shrink-0 flex-col rounded-lg bg-muted/50 border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 border-b border-border/50 shrink-0", style: {
          borderTop: `3px solid ${stage.color || "#3b82f6"}`
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "font-semibold text-sm truncate flex-1", title: stage.name, children: [
            stage.name,
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "ml-2 text-[10px] px-1.5", children: stageOpps.length })
          ] }),
          stageTotal > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-muted-foreground", children: formatCurrency(stageTotal) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ConnectedDroppable, { droppableId: stage.id, children: (provided, snapshot) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: provided.innerRef, ...provided.droppableProps, className: `flex-1 overflow-y-auto p-3 space-y-3 min-h-[150px] transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`, children: [
          stageOpps.map((opp, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(PublicDraggable, { draggableId: opp.id, index, children: (provided2, snapshot2) => {
            const completedTasks = opp.tasks?.filter((t) => t.status === "done").length || 0;
            const totalTasks = opp.tasks?.length || 0;
            const hasNotes = !!opp.notes && opp.notes.trim().length > 0;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: provided2.innerRef, ...provided2.draggableProps, ...provided2.dragHandleProps, className: `group relative rounded-xl border bg-card/60 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-200 ${snapshot2.isDragging ? "shadow-xl ring-2 ring-primary/50 rotate-2" : ""}`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(OpportunityDialog, { opportunity: opp, defaultPipelineId: selectedPipelineId || "", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cursor-pointer space-y-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-start justify-between gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold text-sm leading-tight hover:text-primary transition-colors line-clamp-2 pr-6", children: opp.title }) }),
                (totalTasks > 0 || hasNotes) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
                  totalTasks > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Badge, { variant: completedTasks === totalTasks ? "default" : "secondary", className: "text-[10px] px-1.5 h-5 gap-1 font-medium bg-muted/60", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-3 w-3" }),
                    completedTasks,
                    "/",
                    totalTasks
                  ] }),
                  hasNotes && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "text-[10px] px-1.5 h-5 gap-1 bg-muted/60", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "h-3 w-3" }) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-6 w-6 border bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: "text-[10px] font-medium", children: initials(opp.contacts?.name || "??") }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground font-medium truncate flex-1", children: opp.contacts?.name || "Contato Desconhecido" })
                ] }),
                !selectedUnitId && opp.units?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit max-w-full", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Building, { className: "h-3 w-3 shrink-0" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: opp.units.name })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mt-2 pt-3 border-t border-border/40", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs", children: formatCurrency(opp.value || 0) }),
                  opp.expected_close_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[11px] text-muted-foreground font-medium bg-muted/30 px-1.5 py-0.5 rounded", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "h-3 w-3" }),
                    format(new Date(opp.expected_close_date), "dd/MMM", {
                      locale: ptBR
                    })
                  ] })
                ] })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TooltipProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Tooltip, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "secondary", size: "icon", className: "h-7 w-7 rounded-full shadow-sm bg-background/80 backdrop-blur border hover:bg-primary hover:text-primary-foreground transition-colors", onClick: (e) => goToConversation(opp.contact_id, e), children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessageCircle, { className: "h-3.5 w-3.5" }) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(TooltipContent, { side: "top", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "Ir para conversa" }) })
              ] }) }) })
            ] });
          } }, opp.id)),
          provided.placeholder
        ] }) })
      ] }, stage.id);
    }) }) }) })
  ] });
}
export {
  PipelinePage as component
};
