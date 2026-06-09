import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { a as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./server-BpYW9gSM.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-CS_vbDu-.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { A as Avatar, a as AvatarFallback, i as initials, f as formatRelative, b as formatPhone, c as formatMessageTime } from "./format-DolZ3YMa.mjs";
import { T as Tabs, f as TabsList, g as TabsTrigger, D as Dialog, i as DialogTrigger, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription, e as DialogFooter, B as Badge, h as TabsContent } from "./tabs-DaV-6sV-.mjs";
import { S as ScrollArea, a as ContactEditDialog, b as ContactDetailsTabs } from "./contact-details-sheet-D-N6IO0A.mjs";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea, P as Popover, e as PopoverTrigger, f as PopoverContent, C as Command, g as CommandInput, h as CommandList, i as CommandEmpty, j as CommandGroup, k as CommandItem } from "./command-P2Bojk4p.mjs";
import { C as ChannelIcon } from "./channel-icon-6enHNb56.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { R as Route$2, a as useUnit, u as useAuth } from "./router-BZupuT9_.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { E as EmojiPicker$1 } from "../_libs/emoji-picker-react.mjs";
import "../_libs/seroval.mjs";
import { i as Search, z as MessageSquarePlus, H as LoaderCircle, X as Send, U as Users, v as Phone, I as CircleCheck, Y as PanelRight, Z as X, _ as Image, $ as Paperclip, a0 as Smile, a1 as Mic, W as MessageCircle, a2 as RefreshCw, a3 as Tag, P as Plus, a4 as Square, a5 as ArrowRightLeft, B as Building2, r as User, a6 as Undo2, a7 as CornerUpLeft, A as Pencil, a8 as SmilePlus } from "../_libs/lucide-react.mjs";
import { r as reactTextareaAutosize_cjs_defaultExports } from "../_libs/react-textarea-autosize.mjs";
import { o as objectType, s as stringType, e as enumType } from "../_libs/zod.mjs";
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
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:stream";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/isbot.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "../_libs/radix-ui__react-avatar.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/@radix-ui/react-use-is-hydrated+[...].mjs";
import "../_libs/date-fns.mjs";
import "../_libs/radix-ui__react-dialog.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
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
import "./sheet-DiuHGwRv.mjs";
import "../_libs/radix-ui__react-scroll-area.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-separator.mjs";
import "./opportunity-dialog-De0nOeSk.mjs";
import "../_libs/radix-ui__react-select.mjs";
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
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-label.mjs";
import "../_libs/flairup.mjs";
import "../_libs/babel__runtime.mjs";
import "../_libs/use-latest.mjs";
import "../_libs/use-isomorphic-layout-effect.mjs";
import "../_libs/use-composed-ref.mjs";
var createSsrRpc = (functionId) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    return (await getServerFnById(functionId))(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const sendMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  text: stringType().optional(),
  mediaType: enumType(["image", "video", "audio", "document", "text"]).optional(),
  mediaBase64: stringType().optional(),
  quotedMessageId: stringType().optional(),
  quotedParticipant: stringType().optional(),
  quotedInternalId: stringType().uuid().optional(),
  quotedContent: stringType().optional()
})).handler(createSsrRpc("dd9203253ba64f3cb87006b18c1b323e9106f73b8e284aca47f898f557392cbc"));
const sendProactiveMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  phone: stringType().min(10),
  text: stringType().min(1),
  instanceName: stringType().min(1),
  companyId: stringType().uuid()
})).handler(createSsrRpc("c76aca24d249742fd3ad7e0d8ca6a4db1643e994b9dfcd0cfce4fb020e7bd732"));
const fetchContactInfoAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  contactId: stringType().uuid(),
  unitId: stringType().uuid().optional().nullable(),
  whatsappInstanceId: stringType().uuid().optional().nullable()
})).handler(createSsrRpc("5a253eb843f2f83595cc554479fa955a0127b5e77219ec35522be34171eb2e36"));
createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid()
})).handler(createSsrRpc("377fa883f3eced871b848252e227566e53f70fb19b65bff5a94781cc59d63023"));
const createLabelAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid(),
  name: stringType().min(1),
  color: stringType().optional()
})).handler(createSsrRpc("64a1b9e14505d6b4ee4bee0a6923cb1a51d15cf8b9ebc17afe5eb23aaa2c8658"));
const toggleContactLabelAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  unitId: stringType().uuid(),
  contactId: stringType().uuid(),
  labelId: stringType().uuid(),
  action: enumType(["add", "remove"])
})).handler(createSsrRpc("ffb31e8d05e09f6a4d00f6fb88d119d2abe6a6c4f0ad1d314106b46aa87038d5"));
const reactToMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  messageId: stringType().uuid(),
  emoji: stringType()
})).handler(createSsrRpc("3e8bb2d1a87c1330c1ef34045f829dfae6a0d3c56f3e84628806bc966828fb41"));
const assignConversationAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid()
})).handler(createSsrRpc("edfe9db65e87bec0d92954c633b7a848f42fb8da908308f89216148e724c7219"));
const transferConversationAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  targetType: enumType(["department", "agent"]),
  targetId: stringType().uuid()
})).handler(createSsrRpc("897d74e9b4bf6c60c8ed905fbec4d92cbbab52e898844a511cc852b73ce9fa8d"));
const updateContactFromWhatsappAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  contactId: stringType().uuid(),
  unitId: stringType().uuid().optional().nullable(),
  whatsappInstanceId: stringType().uuid().optional().nullable()
})).handler(createSsrRpc("3939cb512fb25d2bfc6fa2cc62824508d4d5622d2202c92cad447a73b94229c0"));
const editMessageAction = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator(objectType({
  conversationId: stringType().uuid(),
  messageId: stringType().uuid(),
  newContent: stringType().min(1)
})).handler(createSsrRpc("715a4427d813845ac7bac0ffe3a0d811a573bd838936cb32984228eb37967546"));
const map = {
  waiting: { label: "Aguardando", cls: "bg-warning/15 text-warning border-warning/30" },
  active: { label: "Em andamento", cls: "bg-info/15 text-info border-info/30" },
  resolved: { label: "Resolvido", cls: "bg-success/15 text-success border-success/30" }
};
function StatusBadge({ status, className }) {
  const cfg = map[status];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cfg.cls,
        className
      ),
      children: cfg.label
    }
  );
}
function TransferDialog({ conv }) {
  const [open, setOpen] = reactExports.useState(false);
  const [tab, setTab] = reactExports.useState("department");
  const qc = useQueryClient();
  const { data: departments, isLoading: loadingDepts } = useQuery({
    queryKey: ["departments", conv.unit_id],
    queryFn: async () => {
      let query = supabase.from("departments").select("id, name").eq("active", true).order("name");
      if (conv.unit_id) {
        query = query.or(`unit_id.eq.${conv.unit_id},unit_id.is.null`);
      } else {
        query = query.is("unit_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: open
  });
  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ["unit_agents", conv.unit_id],
    queryFn: async () => {
      if (conv.unit_id) {
        const { data, error } = await supabase.from("user_units").select("user_id, profiles!inner(id, name, email, avatar_url, role, departments!profiles_department_id_fkey(name))").eq("unit_id", conv.unit_id);
        if (error) throw error;
        return data.map((d) => d.profiles);
      } else {
        const { data, error } = await supabase.from("profiles").select("id, name, email, avatar_url, role, departments!profiles_department_id_fkey(name)").or("has_matriz_access.eq.true,role.eq.admin_company");
        if (error) throw error;
        return data;
      }
    },
    enabled: open
  });
  const transfer = useMutation({
    mutationFn: async ({ targetId, targetType }) => {
      await transferConversationAction({
        data: { conversationId: conv.id, targetId, targetType }
      });
    },
    onSuccess: () => {
      toast.success("Atendimento transferido com sucesso.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => {
      toast.error("Erro ao transferir", { description: e.message });
    }
  });
  const returnToQueue = useMutation({
    mutationFn: async () => {
      await supabase.from("conversations").update({ status: "waiting", assigned_agent_id: null }).eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento retornado para a fila");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", title: "Transferir Atendimento", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRightLeft, { className: "h-4 w-4 mr-2" }),
      "Transferir"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Transferir Atendimento" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Escolha para onde deseja transferir este atendimento." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { value: tab, onValueChange: (v) => setTab(v), className: "w-full", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "department", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Building2, { className: "w-4 h-4 mr-2" }),
            "Departamento"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "agent", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "w-4 h-4 mr-2" }),
            "Atendente"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "department", className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollArea, { className: "h-[250px] rounded-md border p-2", children: loadingDepts ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "animate-spin h-5 w-5 text-muted-foreground" }) }) : departments?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: departments.map((dept) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => transfer.mutate({ targetId: dept.id, targetType: "department" }),
            disabled: transfer.isPending,
            className: "flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent text-left transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: dept.name }),
              transfer.isPending && transfer.variables?.targetId === dept.id && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" })
            ]
          },
          dept.id
        )) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground text-center p-4", children: "Nenhum departamento encontrado." }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "agent", className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollArea, { className: "h-[250px] rounded-md border p-2", children: loadingAgents ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "animate-spin h-5 w-5 text-muted-foreground" }) }) : agents?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1", children: agents.map((agent) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => transfer.mutate({ targetId: agent.id, targetType: "agent" }),
            disabled: transfer.isPending || agent.id === conv.assigned_agent_id,
            className: "flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent text-left transition-colors disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-8 w-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: "text-[10px]", children: initials(agent.name) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-hidden", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium truncate", children: agent.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground truncate flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: agent.email }),
                  agent.departments?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-foreground", children: agent.departments.name })
                  ] })
                ] })
              ] }),
              agent.id === conv.assigned_agent_id && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded", children: "Atual" }),
              transfer.isPending && transfer.variables?.targetId === agent.id && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" })
            ]
          },
          agent.id
        )) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground text-center p-4", children: "Nenhum atendente encontrado." }) }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-4 mt-2 border-t flex justify-between items-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground flex-1 pr-4", children: "Você também pode devolver este atendimento para a fila, deixando-o livre para outro consultor." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            variant: "secondary",
            size: "sm",
            onClick: () => returnToQueue.mutate(),
            disabled: returnToQueue.isPending,
            className: "shrink-0",
            children: [
              returnToQueue.isPending ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { className: "mr-2 h-4 w-4" }),
              "Devolver para a fila"
            ]
          }
        )
      ] })
    ] })
  ] });
}
function ConversationsPage() {
  const {
    c: searchConvId,
    tab: searchTab
  } = Route$2.useSearch();
  const qc = useQueryClient();
  const [tab, setTab] = reactExports.useState(searchTab || "waiting");
  const [search, setSearch] = reactExports.useState("");
  const [selectedId, setSelectedId] = reactExports.useState(searchConvId || null);
  const [showSidebar, setShowSidebar] = reactExports.useState(false);
  const {
    selectedUnitId
  } = useUnit();
  const {
    profile
  } = useAuth();
  const {
    data: conversations
  } = useQuery({
    queryKey: ["conversations", tab, selectedUnitId, profile?.id, profile?.role, profile?.department_id],
    queryFn: async () => {
      let query = supabase.from("conversations").select("id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, contact:contacts(id,name,phone,email,tags,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), unit:units(name,color), whatsapp_instance:whatsapp_instances(name)");
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }
      const {
        data,
        error
      } = await query.order("last_message_at", {
        ascending: false
      });
      if (error) throw error;
      const allConvs = data ?? [];
      return allConvs.filter((c) => {
        const isGroup = c.contact?.phone && (c.contact.phone.startsWith("120363") || c.contact.phone.includes("-"));
        if (tab === "groups") return isGroup;
        if (isGroup) return false;
        const isAdmin = profile?.role === "admin_company";
        const isManager = profile?.role === "manager";
        const isMyDept = c.department_id === profile?.department_id;
        const isGeneral = !c.department_id;
        const isAssignedToMe = c.assigned_agent_id === profile?.id;
        if (tab === "waiting") {
          const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
          if (!canSeeWaiting) return false;
          if (isAdmin || isManager) return c.status === "waiting";
          return c.status === "waiting" && (!c.assigned_agent_id || c.assigned_agent_id === profile?.id);
        }
        if (tab === "active") {
          const canSeeActive = isAdmin || isManager && isMyDept || isAssignedToMe;
          return c.status === "active" && canSeeActive;
        }
        if (tab === "resolved") {
          const canSeeResolved = isAdmin || isManager && isMyDept || isAssignedToMe;
          return c.status === "resolved" && canSeeResolved;
        }
        return false;
      });
    }
  });
  reactExports.useEffect(() => {
    if (searchTab && searchTab !== tab) {
      setTab(searchTab);
    }
  }, [searchTab]);
  reactExports.useEffect(() => {
    if (searchConvId && searchConvId !== selectedId) {
      setSelectedId(searchConvId);
    }
  }, [searchConvId]);
  const {
    data: unreadCounts
  } = useQuery({
    queryKey: ["unread-counts", selectedUnitId, profile?.id, profile?.department_id],
    queryFn: async () => {
      let query = supabase.from("conversations").select("status, unread_count, department_id, assigned_agent_id, contact:contacts(phone)");
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      const counts = {
        waiting: {
          total: 0,
          unread: 0
        },
        active: {
          total: 0,
          unread: 0
        },
        resolved: {
          total: 0,
          unread: 0
        },
        groups: {
          total: 0,
          unread: 0
        }
      };
      data.forEach((c) => {
        const isGroup = c.contact?.phone && (c.contact.phone.startsWith("120363") || c.contact.phone.includes("-"));
        if (isGroup) {
          counts.groups.total++;
          counts.groups.unread += c.unread_count || 0;
        } else {
          const isAdmin = profile?.role === "admin_company";
          const isManager = profile?.role === "manager";
          const isMyDept = c.department_id === profile?.department_id;
          const isGeneral = !c.department_id;
          const isAssignedToMe = c.assigned_agent_id === profile?.id;
          if (c.status === "waiting") {
            const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
            if (canSeeWaiting) {
              if (isAdmin || isManager || !c.assigned_agent_id || c.assigned_agent_id === profile?.id) {
                counts.waiting.total++;
                counts.waiting.unread += c.unread_count || 0;
              }
            }
          }
          if (c.status === "active") {
            const canSeeActive = isAdmin || isManager && isMyDept || isAssignedToMe;
            if (canSeeActive) {
              counts.active.total++;
              counts.active.unread += c.unread_count || 0;
            }
          }
          if (c.status === "resolved") {
            const canSeeResolved = isAdmin || isManager && isMyDept || isAssignedToMe;
            if (canSeeResolved) {
              counts.resolved.total++;
              counts.resolved.unread += c.unread_count || 0;
            }
          }
        }
      });
      return counts;
    }
  });
  reactExports.useEffect(() => {
    const channelId = `conversations-rt-${Math.random()}`;
    const ch = supabase.channel(channelId).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "conversations"
    }, (payload) => {
      console.log("Realtime: conversations updated", payload);
      qc.refetchQueries({
        queryKey: ["conversations"]
      });
      qc.refetchQueries({
        queryKey: ["unread-counts"]
      });
    }).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages"
    }, (payload) => {
      console.log("Realtime: messages updated", payload);
      qc.refetchQueries({
        queryKey: ["messages"]
      });
      qc.refetchQueries({
        queryKey: ["conversations"]
      });
      qc.refetchQueries({
        queryKey: ["unread-counts"]
      });
    }).subscribe((status) => {
      console.log("Realtime subscription status:", status);
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.contact?.name.toLowerCase().includes(s) || (c.contact?.phone ?? "").includes(s);
  });
  const selected = filtered.find((c) => c.id === selectedId) ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "flex w-[360px] shrink-0 flex-col border-r border-border bg-card", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-border p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Buscar nome ou número", value: search, onChange: (e) => setSearch(e.target.value), className: "h-9 pl-8" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(NewConversationDialog, { onCreated: (id) => {
            setTab("active");
            setSelectedId(id);
          } })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Tabs, { value: tab, onValueChange: (v) => setTab(v), className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-4 h-auto py-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "waiting", className: "px-1 py-1.5 text-xs relative", children: [
            "Aguard. ",
            unreadCounts?.waiting.total || 0,
            unreadCounts && unreadCounts.waiting.unread > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm", children: unreadCounts.waiting.unread })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "active", className: "px-1 py-1.5 text-xs relative", children: [
            "Andam. ",
            unreadCounts?.active.total || 0,
            unreadCounts && unreadCounts.active.unread > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm", children: unreadCounts.active.unread })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "resolved", className: "px-1 py-1.5 text-xs relative", children: [
            "Resolv. ",
            unreadCounts?.resolved.total || 0,
            unreadCounts && unreadCounts.resolved.unread > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm", children: unreadCounts.resolved.unread })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "groups", className: "px-1 py-1.5 text-xs relative", children: [
            "Grupos ",
            unreadCounts?.groups.total || 0,
            unreadCounts && unreadCounts.groups.unread > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm", children: unreadCounts.groups.unread })
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(ScrollArea, { className: "flex-1", children: [
        filtered.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(ConversationItem, { conv: c, selected: selectedId === c.id, onClick: () => setSelectedId(c.id), currentUserId: profile?.id, showUnitInfo: !selectedUnitId }, c.id)),
        !filtered.length && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6 text-center text-sm text-muted-foreground", children: "Nada por aqui ainda." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "flex min-w-0 flex-1 flex-col bg-background", children: selected ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChatPanel, { conv: selected, showSidebar, onToggleSidebar: () => setShowSidebar(!showSidebar), onAssigned: () => setTab("active") }) : /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyChat, {}) }),
    selected && showSidebar && /* @__PURE__ */ jsxRuntimeExports.jsx("aside", { className: "hidden w-[280px] shrink-0 flex-col border-l border-border bg-card lg:flex xl:w-[320px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ContactSidebar, { conv: selected, onClose: () => setShowSidebar(false) }) })
  ] });
}
function ContactSidebar({
  conv,
  onClose
}) {
  const qc = useQueryClient();
  const {
    selectedUnitId
  } = useUnit();
  const {
    profile
  } = useAuth();
  const [searchLabel, setSearchLabel] = reactExports.useState("");
  const {
    data: allLabels
  } = useQuery({
    queryKey: ["labels", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const {
        data
      } = await supabase.from("labels").select("*").eq("company_id", profile.company_id);
      return data || [];
    },
    enabled: !!profile?.company_id
  });
  const toggleLabel = useMutation({
    mutationFn: async ({
      labelId,
      action
    }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({
        data: {
          unitId: selectedUnitId,
          contactId: conv.contact.id,
          labelId,
          action
        }
      });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    },
    onError: (e) => toast.error(e.message)
  });
  const createLabel = useMutation({
    mutationFn: async (name) => {
      if (!selectedUnitId) return;
      const res = await createLabelAction({
        data: {
          unitId: selectedUnitId,
          name
        }
      });
      if (!res?.success || !res.label) throw new Error(res?.error || "Falha ao criar etiqueta");
      return res.label;
    },
    onSuccess: async (label) => {
      qc.invalidateQueries({
        queryKey: ["labels", profile?.company_id]
      });
      if (conv.contact?.id && selectedUnitId) {
        toggleLabel.mutate({
          labelId: label.id,
          action: "add"
        });
      }
      setSearchLabel("");
      toast.success("Etiqueta criada!");
    },
    onError: (e) => toast.error(e.message)
  });
  const {
    data: profilePictureUrl
  } = useQuery({
    queryKey: ["contact-profile-pic", conv.contact?.id, selectedUnitId],
    queryFn: async () => {
      if (!conv.contact?.id || !conv.unit_id && !conv.whatsapp_instance_id) return null;
      return await fetchContactInfoAction({
        data: {
          contactId: conv.contact.id,
          unitId: conv.unit_id,
          whatsappInstanceId: conv.whatsapp_instance_id
        }
      });
    },
    enabled: !!conv.contact?.id && !!conv.unit_id,
    staleTime: 1e3 * 60 * 60
    // 1 hour
  });
  const updateContact = useMutation({
    mutationFn: async () => {
      return await updateContactFromWhatsappAction({
        data: {
          contactId: conv.contact.id,
          unitId: conv.unit_id,
          whatsappInstanceId: conv.whatsapp_instance_id
        }
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        if (data.updatedName === "Foto Encontrada") {
          toast.success(data.message || "Foto de perfil atualizada!");
        } else {
          toast.success(`Nome atualizado para: ${data.updatedName}`);
        }
      } else if (data?.message) {
        toast.info(data.message);
      }
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
      qc.invalidateQueries({
        queryKey: ["contact-profile-pic", conv.contact.id]
      });
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao atualizar contato.");
    }
  });
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col bg-background/50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center p-3 pb-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold ml-2 text-muted-foreground", children: "Perfil" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground rounded-full hover:bg-muted", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 pt-2 flex flex-col items-center justify-center relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative mb-4 group", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-24 w-24 ring-4 ring-background shadow-xl", children: profilePictureUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: profilePictureUrl, alt: conv.contact?.name, className: "h-full w-full object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-3xl font-medium", isGroup ? "bg-primary/20 text-primary" : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-10 w-10 opacity-80" }) : initials(conv.contact.name) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "secondary", size: "icon", className: "absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity", title: "Sincronizar foto do WhatsApp", onClick: () => updateContact.mutate(), disabled: updateContact.isPending, children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: `h-4 w-4 text-muted-foreground ${updateContact.isPending ? "animate-spin" : ""}` }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center w-full space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-1.5 max-w-[90%] mx-auto", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-bold text-xl truncate", children: contactName || "Desconhecido" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ContactEditDialog, { contact: conv.contact })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "font-mono text-xs font-normal text-muted-foreground bg-muted/50 hover:bg-muted/80 transition-colors px-2.5 py-0.5", children: isGroup ? "Grupo" : formatPhone(conv.contact.phone) }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollArea, { className: "flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 pb-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-card border border-border/60 rounded-xl p-4 shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-foreground flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Tag, { className: "h-3.5 w-3.5 text-muted-foreground" }),
            "Etiquetas"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 rounded-full text-muted-foreground hover:text-primary", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { className: "p-0 w-56", align: "end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Command, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CommandInput, { placeholder: "Buscar etiqueta...", className: "h-8 text-xs", value: searchLabel, onValueChange: setSearchLabel }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandList, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CommandEmpty, { children: searchLabel.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", className: "w-full justify-start text-xs h-8 font-normal", onClick: () => createLabel.mutate(searchLabel), disabled: createLabel.isPending, children: [
                  'Criar "',
                  searchLabel,
                  '"'
                ] }) : "Nenhuma etiqueta encontrada." }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(CommandGroup, { children: allLabels?.map((label) => {
                  const isSelected = conv.contact?.contact_labels?.some((cl) => cl.labels?.id === label.id);
                  return /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandItem, { onSelect: () => {
                    toggleLabel.mutate({
                      labelId: label.id,
                      action: isSelected ? "remove" : "add"
                    });
                  }, className: "text-xs", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-2 h-2 rounded-full mr-2", style: {
                      backgroundColor: label.color || "#6b7280"
                    } }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1", children: label.name }),
                    isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { className: "h-3 w-3 opacity-50 bg-primary/20" })
                  ] }, label.id);
                }) })
              ] })
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
          conv.contact?.contact_labels?.map((cl) => {
            const label = cl.labels;
            if (!label) return null;
            const hexColor = label.color || "#6b7280";
            return /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "font-normal text-[10px] px-2 py-0 h-5", style: {
              backgroundColor: `${hexColor}15`,
              color: hexColor,
              borderColor: `${hexColor}30`
            }, children: label.name }, label.id);
          }),
          !conv.contact?.contact_labels?.length && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground/70 italic", children: "Nenhuma etiqueta atribuída." })
        ] })
      ] }),
      conv.contact?.id && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ContactDetailsTabs, { contactId: conv.contact.id }) })
    ] }) })
  ] });
}
function NewConversationDialog({
  onCreated
}) {
  const qc = useQueryClient();
  const {
    profile
  } = useAuth();
  const [open, setOpen] = reactExports.useState(false);
  const [phone, setPhone] = reactExports.useState("");
  const [text, setText] = reactExports.useState("");
  const [instanceName, setInstanceName] = reactExports.useState("");
  const {
    data: instances
  } = useQuery({
    queryKey: ["whatsapp_instances"],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const {
        data,
        error
      } = await supabase.from("whatsapp_instances").select("instance_name").eq("company_id", profile.company_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Usuário sem empresa");
      const res = await sendProactiveMessageAction({
        data: {
          phone,
          text,
          instanceName,
          companyId: profile.company_id
        }
      });
      return res;
    },
    onSuccess: (res) => {
      if (res.conversationId) {
        onCreated(res.conversationId);
      }
      setOpen(false);
      setPhone("");
      setText("");
      setInstanceName("");
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
      toast.success("Mensagem enviada com sucesso!");
    },
    onError: (e) => {
      toast.error("Erro ao enviar mensagem", {
        description: e.message
      });
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "icon", variant: "outline", className: "h-9 w-9 shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquarePlus, { className: "h-4 w-4" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Nova Conversa" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Inicie um atendimento enviando uma mensagem ativa para o cliente." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 py-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Instância (Remetente)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: instanceName, onValueChange: setInstanceName, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione a instância" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              instances?.map((inst) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: inst.instance_name, children: inst.instance_name }, inst.instance_name)),
              !instances?.length && /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "none", disabled: true, children: "Nenhuma instância encontrada" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Número do Cliente" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: 5511999999999", value: phone, onChange: (e) => setPhone(e.target.value) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground", children: "Inclua o DDI (55) e o DDD." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Mensagem" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { placeholder: "Digite a primeira mensagem...", value: text, onChange: (e) => setText(e.target.value), rows: 3 })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => send.mutate(), disabled: !phone || !text || !instanceName || send.isPending, children: [
          send.isPending ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { className: "mr-2 h-4 w-4" }),
          "Enviar"
        ] })
      ] })
    ] })
  ] });
}
function ConversationItem({
  conv,
  selected,
  onClick,
  currentUserId,
  showUnitInfo
}) {
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick, className: cn("flex w-full max-w-full overflow-hidden items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40", selected && "bg-accent/60"), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-10 w-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4" }) : initials(conv.contact?.name) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 grid", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChannelIcon, { channel: conv.channel, className: "h-4 w-4 shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("truncate text-sm font-medium flex-1", conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground"), children: contactName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("whitespace-nowrap shrink-0 text-[11px]", conv.unread_count && conv.unread_count > 0 ? "font-bold text-success" : "text-muted-foreground"), children: formatRelative(conv.last_message_at) })
      ] }),
      conv.last_message_preview && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: conv.last_message_preview }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex flex-wrap items-center gap-1.5", children: [
        showUnitInfo && conv.unit?.name ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50", style: {
          backgroundColor: conv.unit.color ? `${conv.unit.color}20` : "var(--muted)",
          color: conv.unit.color || "var(--muted-foreground)",
          borderColor: conv.unit.color ? `${conv.unit.color}40` : "var(--border)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-1.5 rounded-full", style: {
            backgroundColor: conv.unit.color || "var(--muted-foreground)"
          } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: conv.unit.name }),
          conv.whatsapp_instance?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-50", children: "•" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: conv.whatsapp_instance.name })
          ] })
        ] }) : !showUnitInfo && conv.whatsapp_instance?.name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50 bg-muted/50 text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-2 w-2 opacity-70" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: conv.whatsapp_instance.name })
        ] }),
        conv.department?.name && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "px-1.5 py-0 text-[10px] font-normal", children: conv.department.name }),
        conv.status === "active" && conv.assigned_agent?.name && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/30", children: conv.assigned_agent.name }),
        conv.status === "waiting" && conv.assigned_agent_id && conv.assigned_agent_id === currentUserId && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "default", className: "px-1.5 py-0 text-[10px] font-normal bg-orange-500 hover:bg-orange-600", children: "Transferido" }),
        conv.tags?.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "px-1.5 py-0 text-[10px] font-normal", children: t }, t)),
        conv.unread_count && conv.unread_count > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { className: "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold hover:bg-success", children: conv.unread_count }) : null
      ] })
    ] })
  ] });
}
function EmptyChat() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-12 text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-16 w-16 place-items-center rounded-full bg-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessageCircle, { className: "h-7 w-7 text-muted-foreground" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-medium", children: "Selecione uma conversa" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "max-w-xs text-sm text-muted-foreground", children: "Escolha um atendimento na lista ao lado para visualizar as mensagens." })
  ] });
}
function ChatPanel({
  conv,
  showSidebar,
  onToggleSidebar,
  onAssigned
}) {
  const {
    profile
  } = useAuth();
  const qc = useQueryClient();
  const {
    selectedUnitId
  } = useUnit();
  const [text, setText] = reactExports.useState("");
  const [selectedFile, setSelectedFile] = reactExports.useState(null);
  const [replyingTo, setReplyingTo] = reactExports.useState(null);
  const [editingMessage, setEditingMessage] = reactExports.useState(null);
  const [isRecording, setIsRecording] = reactExports.useState(false);
  const [recordingTime, setRecordingTime] = reactExports.useState(0);
  const [quickMsgIndex, setQuickMsgIndex] = reactExports.useState(0);
  const scrollRef = reactExports.useRef(null);
  const mediaRecorderRef = reactExports.useRef(null);
  const audioChunksRef = reactExports.useRef([]);
  const recordingTimerRef = reactExports.useRef(null);
  const {
    data: messages
  } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("messages").select("id, conversation_id, sender_type, content, media_type, media_url, created_at, quoted_content, is_edited, is_deleted, reactions, remote_msg_id, profiles(name)").eq("conversation_id", conv.id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data ?? [];
    }
  });
  const {
    data: quickMessages
  } = useQuery({
    queryKey: ["quick-messages", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("quick_messages").select("*").eq("company_id", profile.company_id).order("shortcut", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  reactExports.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
    if (conv.id && conv.unread_count && conv.unread_count > 0) {
      supabase.rpc("reset_unread_count", {
        conv_id: conv.id
      }).then(() => {
        qc.invalidateQueries({
          queryKey: ["conversations"]
        });
        qc.invalidateQueries({
          queryKey: ["unread-counts"]
        });
      });
    }
  }, [messages?.length, conv.id, conv.unread_count, qc]);
  const send = useMutation({
    mutationFn: async (payload) => {
      await sendMessageAction({
        data: {
          conversationId: conv.id,
          text: payload.content,
          mediaType: payload.mediaType,
          mediaBase64: payload.mediaBase64,
          quotedMessageId: payload.quotedMessageId,
          quotedParticipant: payload.quotedParticipant,
          quotedInternalId: payload.quotedInternalId,
          quotedContent: payload.quotedContent
        }
      });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({
        queryKey: ["messages", conv.id]
      });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      const optimisticMsg = {
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_type: "agent",
        content: payload.content,
        media_type: payload.mediaType || "text",
        media_url: payload.mediaBase64 || null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        isOptimistic: true,
        profiles: profile?.name ? {
          name: profile.name
        } : void 0
      };
      qc.setQueryData(["messages", conv.id], (old) => [...old || [], optimisticMsg]);
      setText("");
      setSelectedFile(null);
      setReplyingTo(null);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth"
        });
      }, 50);
      return {
        previousMessages,
        content: payload.content
      };
    },
    onError: (e, variables, context) => {
      if (context?.previousMessages) {
        qc.setQueryData(["messages", conv.id], context.previousMessages);
      }
      setText(context?.content || "");
      toast.error("Erro ao enviar", {
        description: e.message
      });
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["messages", conv.id]
      });
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });
  const editMsg = useMutation({
    mutationFn: async (payload) => {
      await editMessageAction({
        data: {
          conversationId: conv.id,
          messageId: payload.messageId,
          newContent: payload.content
        }
      });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({
        queryKey: ["messages", conv.id]
      });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      qc.setQueryData(["messages", conv.id], (old) => {
        if (!old) return old;
        return old.map((m) => m.id === payload.messageId ? {
          ...m,
          content: payload.content,
          is_edited: true
        } : m);
      });
      setText("");
      setEditingMessage(null);
      return {
        previousMessages
      };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao editar", {
        description: e.message
      });
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["messages", conv.id]
      });
    }
  });
  const react = useMutation({
    mutationFn: async ({
      messageId,
      emoji
    }) => {
      await reactToMessageAction({
        data: {
          conversationId: conv.id,
          messageId,
          emoji
        }
      });
    },
    onMutate: async ({
      messageId,
      emoji
    }) => {
      await qc.cancelQueries({
        queryKey: ["messages", conv.id]
      });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      qc.setQueryData(["messages", conv.id], (old) => {
        if (!old) return old;
        return old.map((m) => m.id === messageId ? {
          ...m,
          reactions: emoji ? {
            [emoji]: 1
          } : {}
        } : m);
      });
      return {
        previousMessages
      };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao reagir", {
        description: e.message
      });
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["messages", conv.id]
      });
    }
  });
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      let type = "document";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";
      setSelectedFile({
        file,
        base64,
        type
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/ogg"
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          send.mutate({
            content: "",
            mediaType: "audio",
            mediaBase64: base64data
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1e3);
    } catch (err) {
      toast.error("Erro ao acessar microfone", {
        description: String(err)
      });
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };
  const getGreeting = () => {
    const hour = (/* @__PURE__ */ new Date()).getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };
  const insertQuickMessage = (content) => {
    const now = /* @__PURE__ */ new Date();
    let t = content;
    t = t.replace(/\{\{atendente\}\}/g, profile?.name || "Atendente");
    t = t.replace(/\{\{cliente\}\}/g, conv.contact?.name && conv.contact.name !== "Desconhecido" ? conv.contact.name : "Cliente");
    t = t.replace(/\{\{saudacao\}\}/g, getGreeting());
    t = t.replace(/\{\{telefone\}\}/g, conv.contact?.phone || "");
    t = t.replace(/\{\{protocolo\}\}/g, conv.id.substring(0, 8).toUpperCase());
    t = t.replace(/\{\{data\}\}/g, now.toLocaleDateString("pt-BR"));
    t = t.replace(/\{\{hora\}\}/g, now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    }));
    setText(t);
    document.getElementById("chat-input")?.focus();
  };
  const handleSend = () => {
    if (editingMessage) {
      if (text.trim() && text.trim() !== editingMessage.content) {
        editMsg.mutate({
          messageId: editingMessage.id,
          content: text.trim()
        });
      } else {
        setEditingMessage(null);
        setText("");
      }
      return;
    }
    conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
    const participant = replyingTo ? replyingTo.participant_jid || (replyingTo.sender_type === "contact" ? replyingTo.sender_id ? void 0 : conv.contact?.phone ? `${conv.contact.phone}@s.whatsapp.net` : void 0 : void 0) : void 0;
    const quotedPayload = replyingTo ? {
      quotedMessageId: replyingTo.remote_msg_id || void 0,
      quotedParticipant: participant,
      quotedInternalId: replyingTo.id,
      quotedContent: replyingTo.content || (replyingTo.media_type !== "text" ? `[${replyingTo.media_type}]` : "Anexo")
    } : {};
    if (selectedFile) {
      send.mutate({
        content: text.trim(),
        mediaType: selectedFile.type,
        mediaBase64: selectedFile.base64,
        ...quotedPayload
      });
    } else if (text.trim()) {
      send.mutate({
        content: text.trim(),
        ...quotedPayload
      });
    }
  };
  const startEdit = (msg) => {
    setEditingMessage(msg);
    let textToEdit = msg.content || "";
    const hasSignature = textToEdit.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      textToEdit = hasSignature[2];
    }
    setText(textToEdit);
    setReplyingTo(null);
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  };
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const resolve = useMutation({
    mutationFn: async () => {
      await supabase.from("conversations").update({
        status: "resolved",
        resolved_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento encerrado");
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });
  useMutation({
    mutationFn: async () => {
      await supabase.from("conversations").update({
        status: "waiting",
        assigned_agent_id: null
      }).eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento retornado para a fila");
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    }
  });
  const assignConv = useMutation({
    mutationFn: async () => {
      await assignConversationAction({
        data: {
          conversationId: conv.id
        }
      });
    },
    onSuccess: () => {
      toast.success("Atendimento puxado para você.");
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
      onAssigned?.();
    },
    onError: (e) => {
      toast.error("Erro ao puxar atendimento", {
        description: e.message
      });
    }
  });
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  const filteredQuickMsgs = text.startsWith("/") && quickMessages ? quickMessages.filter((qm) => text === "/" || qm.shortcut.toLowerCase().includes(text.toLowerCase().substring(1))) : [];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card px-5 py-3 shadow-sm z-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-10 w-10 ring-2 ring-primary/10 ring-offset-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4" }) : initials(conv.contact?.name) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-semibold", children: [
            contactName,
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChannelIcon, { channel: conv.channel, className: "h-4 w-4" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mt-0.5", children: [
            conv.department?.name && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-foreground/70", children: conv.department.name }),
            conv.department?.name && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: conv.status })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        conv.status === "active" && !isGroup && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TransferDialog, { conv }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "default", size: "sm", className: "hidden md:flex h-8", onClick: () => resolve.mutate(), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "mr-1.5 h-3.5 w-3.5" }),
            "Encerrar"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: cn("rounded-md p-2 text-muted-foreground hover:bg-accent transition-colors ml-1", showSidebar && "bg-accent text-foreground"), onClick: onToggleSidebar, title: "Informações do Contato", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRight, { className: "h-4.5 w-4.5" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: scrollRef, className: "flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4", children: messages?.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(MessageBubble, { m, isGroup, onReact: (emoji) => react.mutate({
      messageId: m.id,
      emoji
    }), onReply: (msg) => {
      setReplyingTo(msg);
      document.getElementById("chat-input")?.focus();
    }, onEdit: startEdit }, m.id)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border bg-card p-3 flex flex-col gap-2 relative", children: [
      (conv.status === "waiting" || conv.status === "active" && conv.assigned_agent_id && conv.assigned_agent_id !== profile?.id) && !isGroup && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-10 flex flex-col items-center justify-center bg-card gap-2", children: !conv.assigned_agent_id || conv.assigned_agent_id === profile?.id || profile?.role === "admin_company" || profile?.role === "manager" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-muted-foreground text-center px-4", children: !conv.assigned_agent_id ? "Esta conversa está na fila e aguardando um agente." : conv.assigned_agent_id === profile?.id ? "Esta conversa foi transferida para você." : conv.status === "active" ? `Esta conversa está sendo atendida por ${conv.assigned_agent?.name || "outro agente"}.` : `Esta conversa foi transferida para ${conv.assigned_agent?.name || "outro agente"}.` }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => assignConv.mutate(), disabled: assignConv.isPending, children: [
          assignConv.isPending ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin" }) : null,
          !conv.assigned_agent_id ? "Atender Cliente" : conv.assigned_agent_id === profile?.id ? "Aceitar Transferência" : "Assumir Conversa"
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-muted-foreground", children: conv.status === "active" ? `Em atendimento por ${conv.assigned_agent?.name || "outro agente"}.` : `Aguardando aceite de ${conv.assigned_agent?.name || "outro agente"}.` }) }),
      selectedFile && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setSelectedFile(null), className: "absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }) }),
        selectedFile.type === "image" ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: selectedFile.base64, alt: "preview", className: "h-12 w-12 object-cover rounded-md" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-12 w-12 bg-muted rounded-md flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Image, { className: "h-5 w-5 text-muted-foreground" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs truncate max-w-[150px]", children: selectedFile.file.name })
      ] }),
      replyingTo && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-2 border-l-4 border-l-primary rounded-md bg-muted/30 relative pr-8 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setReplyingTo(null), className: "absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold block mb-0.5 text-[10px] uppercase opacity-70", children: "Respondendo a" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "line-clamp-2 opacity-90 text-xs", children: replyingTo.content || `[${replyingTo.media_type}]` })
        ] })
      ] }),
      editingMessage && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-2 border-l-4 border-l-amber-500 rounded-md bg-amber-500/10 relative pr-8 text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
          setEditingMessage(null);
          setText("");
        }, className: "absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold block mb-0.5 text-[10px] uppercase text-amber-600 opacity-90", children: "Editando mensagem" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "line-clamp-2 opacity-90 text-xs", children: editingMessage.content?.replace(/^\*(.+?)\*:\s*/, "") })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-end gap-2", children: !isRecording ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", id: "file-upload", hidden: true, onChange: handleFileChange }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "file-upload", className: "rounded p-2 text-muted-foreground hover:bg-accent cursor-pointer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "rounded p-2 text-muted-foreground hover:bg-accent", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Smile, { className: "h-4 w-4" }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { side: "top", align: "start", className: "p-0 border-none w-auto shadow-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmojiPicker$1, { onEmojiClick: (e) => setText((prev) => prev + e.emoji) }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { open: filteredQuickMsgs.length > 0, onOpenChange: () => {
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "rounded p-2 text-muted-foreground hover:bg-accent", onClick: () => setText((prev) => prev.startsWith("/") ? prev : "/" + prev), title: "Mensagens Rápidas", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquarePlus, { className: "h-4 w-4" }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { side: "top", align: "start", className: "w-80 p-0 shadow-lg border-border", onOpenAutoFocus: (e) => e.preventDefault(), onCloseAutoFocus: (e) => {
            e.preventDefault();
            document.getElementById("chat-input")?.focus();
          }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-h-[300px] overflow-y-auto p-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 py-1.5 text-xs font-semibold text-muted-foreground", children: "Mensagens Rápidas" }),
            filteredQuickMsgs.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-6 text-center text-sm text-muted-foreground", children: "Nenhum atalho encontrado." }),
            filteredQuickMsgs.map((qm, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { onClick: () => {
              insertQuickMessage(qm.content);
              setQuickMsgIndex(0);
            }, className: cn("flex flex-col items-start gap-1 p-2 cursor-pointer rounded-sm mb-1 last:mb-0", i === quickMsgIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-foreground"), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-xs font-bold text-primary", children: qm.shortcut }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-muted-foreground line-clamp-1", children: qm.content })
            ] }, qm.id))
          ] }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(reactTextareaAutosize_cjs_defaultExports._default, { id: "chat-input", value: text, onChange: (e) => {
          setText(e.target.value);
          setQuickMsgIndex(0);
        }, onKeyDown: (e) => {
          if (filteredQuickMsgs.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setQuickMsgIndex((prev) => Math.min(prev + 1, filteredQuickMsgs.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setQuickMsgIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              insertQuickMessage(filteredQuickMsgs[quickMsgIndex].content);
              setQuickMsgIndex(0);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }, placeholder: "Digite uma mensagem...", minRows: 1, maxRows: 6, className: "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" }),
        text.trim() || selectedFile ? /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "icon", onClick: handleSend, disabled: send.isPending, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { className: "h-4 w-4" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "icon", variant: "ghost", className: "text-muted-foreground hover:text-foreground", onClick: startRecording, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Mic, { className: "h-4 w-4" }) })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between flex-1 bg-destructive/10 text-destructive px-4 py-2 rounded-md border border-destructive/20 h-[40px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-destructive animate-pulse" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium", children: formatTime(recordingTime) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", variant: "ghost", className: "h-7 px-2 hover:bg-destructive/20 hover:text-destructive text-destructive/80", onClick: cancelRecording, children: "Cancelar" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", className: "h-7 px-3 bg-destructive hover:bg-destructive/90 text-white", onClick: stopRecording, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { className: "h-3 w-3 mr-1" }),
            "Enviar"
          ] })
        ] })
      ] }) })
    ] })
  ] }) });
}
function FormattedText({
  text
}) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*|_{1}[^_]+_{1}|~[^~]+~)/g);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "whitespace-pre-wrap break-words", children: parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) return /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: part.slice(1, -1) }, i);
    if (part.startsWith("_") && part.endsWith("_")) return /* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: part.slice(1, -1) }, i);
    if (part.startsWith("~") && part.endsWith("~")) return /* @__PURE__ */ jsxRuntimeExports.jsx("del", { children: part.slice(1, -1) }, i);
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: part }, i);
  }) });
}
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
function MessageBubble({
  m,
  isGroup,
  onReact,
  onReply,
  onEdit
}) {
  const mine = m.sender_type === "agent";
  let senderName = null;
  let displayContent = m.content || "";
  if (isGroup && m.sender_type === "contact") {
    const match = displayContent.match(/^(.+?):\n([\s\S]*)$/);
    if (match) {
      senderName = match[1];
      displayContent = match[2];
    }
  } else if (mine) {
    if (m.profiles?.name) {
      senderName = m.profiles.name;
    }
    const hasSignature = displayContent.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      displayContent = hasSignature[2];
      if (!senderName) {
        senderName = hasSignature[1];
      }
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex relative", mine ? "justify-end" : "justify-start"), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("max-w-[70%] flex flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground border border-border", m.is_deleted && "opacity-60", m.isOptimistic && "opacity-70"), children: [
    senderName && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("mb-1 text-xs font-bold", mine ? "text-primary-foreground/90" : "text-primary/80 dark:text-primary/90"), children: senderName }),
    onReact && !m.isOptimistic && !m.is_deleted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 p-0.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground z-10", mine ? "-left-20" : "-right-20"), children: [
      onReply && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onReply(m), className: "hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors", title: "Responder", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CornerUpLeft, { className: "h-3.5 w-3.5" }) }),
      onEdit && mine && m.media_type === "text" && m.remote_msg_id && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onEdit(m), className: "hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors", title: "Editar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors", title: "Reagir", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SmilePlus, { className: "h-3.5 w-3.5" }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { side: "top", className: "w-auto p-2 flex gap-1 rounded-full shadow-lg border-border", children: QUICK_EMOJIS.map((e) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onReact(e), className: "hover:bg-accent rounded-full p-2 text-xl transition-transform hover:scale-125", children: e }, e)) })
      ] })
    ] }),
    m.quoted_content && !m.is_deleted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 rounded bg-black/10 dark:bg-white/10 p-2 text-xs border-l-4 opacity-90 border-l-current", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold block mb-0.5 text-[10px] uppercase opacity-70", children: "Mensagem Respondida" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "line-clamp-3 opacity-90", children: m.quoted_content })
    ] }),
    m.is_deleted ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 italic", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[16px]", children: "🚫" }),
      "Mensagem apagada"
    ] }) : m.media_type === "image" && m.media_url ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: m.media_url, alt: displayContent || "Imagem recebida", className: "max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogContent, { className: "max-w-4xl p-1 bg-transparent border-none shadow-none flex justify-center items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: m.media_url, alt: displayContent || "Imagem recebida", className: "max-h-[85vh] w-auto rounded-md object-contain" }) })
      ] }),
      displayContent && displayContent !== "📷 Imagem" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: displayContent }) })
    ] }) : m.media_type === "audio" && m.media_url ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("audio", { controls: true, src: m.media_url, className: "h-10 w-48" }),
      displayContent && displayContent !== "🎵 Áudio" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: displayContent }) })
    ] }) : m.media_type === "video" && m.media_url ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("video", { controls: true, src: m.media_url, className: "max-w-[200px] rounded-lg" }),
      displayContent && displayContent !== "🎥 Vídeo" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: displayContent }) })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: displayContent }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("mt-1 flex items-center justify-end gap-1.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground"), children: [
      m.is_edited && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "italic", children: "Editado" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatMessageTime(m.created_at) })
    ] }),
    m.reactions && Object.keys(m.reactions).length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute -bottom-3 right-2 flex gap-1 bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-sm", children: Object.entries(m.reactions).map(([emoji, count]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      emoji,
      " ",
      count > 1 ? count : ""
    ] }, emoji)) })
  ] }) });
}
export {
  ConversationsPage as component
};
