import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { a as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./server-BNDz7mE0.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-CeW4yW8O.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { A as Avatar, a as AvatarFallback, i as initials, f as formatRelative, b as formatPhone, c as formatMessageTime } from "./format-DolZ3YMa.mjs";
import { T as Tabs, a as TabsList, b as TabsTrigger, S as Select, d as SelectTrigger, e as SelectValue, f as SelectContent, g as SelectItem, P as Popover, h as PopoverTrigger, i as PopoverContent, C as Command, j as CommandInput, k as CommandList, l as CommandEmpty, m as CommandGroup, n as CommandItem } from "./command-BJS_0Olj.mjs";
import { R as Root, V as Viewport, C as Corner, S as ScrollAreaScrollbar, a as ScrollAreaThumb } from "../_libs/radix-ui__react-scroll-area.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { D as Dialog, f as DialogTrigger, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription, e as DialogFooter, B as Badge } from "./dialog-DzIjWjAs.mjs";
import { C as ChannelIcon } from "./channel-icon-6enHNb56.mjs";
import { a as useUnit, u as useAuth } from "./router-D-8gqfSq.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { E as EmojiPicker$1 } from "../_libs/emoji-picker-react.mjs";
import "../_libs/seroval.mjs";
import { i as Search, A as MessageSquarePlus, w as LoaderCircle, D as Send, U as Users, E as PanelRight, F as EllipsisVertical, X, I as Image, H as Paperclip, J as Smile, N as Mic, O as Phone, R as Mail, V as Tag, z as MessageCircle, P as Plus, W as Square, Y as SmilePlus } from "../_libs/lucide-react.mjs";
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
import "../_libs/radix-ui__react-tabs.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-roving-focus.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-portal.mjs";
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
  mediaBase64: stringType().optional()
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
  unitId: stringType().uuid()
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
const Textarea = reactExports.forwardRef(
  ({ className, ...props }, ref) => {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "textarea",
      {
        className: cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Textarea.displayName = "Textarea";
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
function ConversationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = reactExports.useState("waiting");
  const [search, setSearch] = reactExports.useState("");
  const [selectedId, setSelectedId] = reactExports.useState(null);
  const [showSidebar, setShowSidebar] = reactExports.useState(true);
  const {
    selectedUnitId
  } = useUnit();
  const {
    data: conversations
  } = useQuery({
    queryKey: ["conversations", tab, selectedUnitId],
    queryFn: async () => {
      let query = supabase.from("conversations").select("id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, contact:contacts(id,name,phone,email,tags,contact_labels(labels(id,name,color))), department:departments(name)");
      if (tab === "groups") ;
      else {
        query = query.eq("status", tab);
      }
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
        return !isGroup;
      });
    }
  });
  reactExports.useEffect(() => {
    const ch = supabase.channel("conversations-rt").on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "conversations"
    }, () => {
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    }).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages"
    }, () => {
      qc.invalidateQueries({
        queryKey: ["messages"]
      });
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    }).subscribe();
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(Tabs, { value: tab, onValueChange: (v) => setTab(v), className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "waiting", className: "px-1 text-xs", children: "Aguard." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "active", className: "px-1 text-xs", children: "Andamento" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "resolved", className: "px-1 text-xs", children: "Resolvidos" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "groups", className: "px-1 text-xs", children: "Grupos" })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(ScrollArea, { className: "flex-1", children: [
        filtered.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(ConversationItem, { conv: c, selected: selectedId === c.id, onClick: () => setSelectedId(c.id) }, c.id)),
        !filtered.length && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6 text-center text-sm text-muted-foreground", children: "Nada por aqui ainda." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "flex min-w-0 flex-1 flex-col bg-background", children: selected ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChatPanel, { conv: selected, showSidebar, onToggleSidebar: () => setShowSidebar(!showSidebar) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyChat, {}) }),
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
      if (!conv.contact?.id || !selectedUnitId) return null;
      return await fetchContactInfoAction({
        data: {
          contactId: conv.contact.id,
          unitId: selectedUnitId
        }
      });
    },
    enabled: !!conv.contact?.id && !!selectedUnitId,
    staleTime: 1e3 * 60 * 60
    // 1 hour
  });
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end p-2 pb-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-muted-foreground", onClick: onClose, children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-4 w-4" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-border p-4 pt-0 flex flex-col items-center justify-center space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-24 w-24 border", children: profilePictureUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: profilePictureUrl, alt: conv.contact?.name, className: "object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-xl", isGroup ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-8 w-8" }) : initials(conv.contact?.name) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-lg", children: contactName || "Desconhecido" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: isGroup ? "Múltiplos Participantes" : formatPhone(conv.contact?.phone) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollArea, { className: "flex-1 p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-muted-foreground uppercase tracking-wider", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Tag, { className: "h-3 w-3 inline mr-1" }),
            " Etiquetas"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-6 text-xs px-2 gap-1 rounded-full", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3 w-3" }),
              " Adicionar"
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { className: "p-0 w-48", align: "end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Command, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CommandInput, { placeholder: "Buscar etiqueta...", className: "h-8", value: searchLabel, onValueChange: setSearchLabel }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandList, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CommandEmpty, { children: searchLabel.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", className: "w-full justify-start text-sm h-8 font-normal", onClick: () => createLabel.mutate(searchLabel), disabled: createLabel.isPending, children: [
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
                  }, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-2 h-2 rounded-full mr-2", style: {
                      backgroundColor: label.color || "#6b7280"
                    } }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 text-xs", children: label.name }),
                    isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { className: "h-3 w-3 opacity-50 bg-primary/20" })
                  ] }, label.id);
                }) })
              ] })
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
          conv.contact?.contact_labels?.map((cl) => {
            const label = cl.labels;
            if (!label) return null;
            const hexColor = label.color || "#6b7280";
            return /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", style: {
              backgroundColor: `${hexColor}1a`,
              color: hexColor,
              borderColor: `${hexColor}33`
            }, children: label.name }, label.id);
          }),
          !conv.contact?.contact_labels?.length && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Nenhuma etiqueta" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-semibold uppercase tracking-wider text-muted-foreground", children: "Detalhes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between border-b pb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "E-mail" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: conv.contact?.email || "—" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between border-b pb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "Departamento" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: conv.department?.name || "—" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between border-b pb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "Criado em" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Date(conv.started_at).toLocaleDateString() })
          ] })
        ] })
      ] })
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
  onClick
}) {
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick, className: cn("flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40", selected && "bg-accent/60"), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-10 w-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4" }) : initials(conv.contact?.name) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChannelIcon, { channel: conv.channel, className: "h-4 w-4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("truncate text-sm font-medium", conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground"), children: contactName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("ml-auto whitespace-nowrap text-[11px]", conv.unread_count && conv.unread_count > 0 ? "font-bold text-success" : "text-muted-foreground"), children: formatRelative(conv.last_message_at) })
      ] }),
      conv.last_message_preview && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: conv.last_message_preview }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex items-center gap-1.5", children: [
        conv.department?.name && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "px-1.5 py-0 text-[10px] font-normal", children: conv.department.name }),
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
  onToggleSidebar
}) {
  const {
    user
  } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = reactExports.useState("");
  const [selectedFile, setSelectedFile] = reactExports.useState(null);
  const [isRecording, setIsRecording] = reactExports.useState(false);
  const [recordingTime, setRecordingTime] = reactExports.useState(0);
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
      } = await supabase.from("messages").select("id, conversation_id, sender_type, content, media_type, media_url, created_at, quoted_content, is_edited, is_deleted, reactions").eq("conversation_id", conv.id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data ?? [];
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
          mediaBase64: payload.mediaBase64
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
        isOptimistic: true
      };
      qc.setQueryData(["messages", conv.id], (old) => [...old || [], optimisticMsg]);
      setText("");
      setSelectedFile(null);
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
  const handleSend = () => {
    if (selectedFile) {
      send.mutate({
        content: text.trim(),
        mediaType: selectedFile.type,
        mediaBase64: selectedFile.base64
      });
    } else if (text.trim()) {
      send.mutate({
        content: text.trim()
      });
    }
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
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith("120363") || conv.contact.phone.includes("-"));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-1 flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card px-5 py-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-10 w-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted"), children: isGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4" }) : initials(conv.contact?.name) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-semibold", children: [
              contactName,
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChannelIcon, { channel: conv.channel, className: "h-4 w-4" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
              conv.department?.name && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: conv.department.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: conv.status })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          conv.status !== "resolved" && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: () => resolve.mutate(), children: "Encerrar" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: cn("rounded p-2 text-muted-foreground hover:bg-accent", showSidebar && "bg-accent"), onClick: onToggleSidebar, title: "Informações do Contato", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRight, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "rounded p-2 text-muted-foreground hover:bg-accent", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EllipsisVertical, { className: "h-4 w-4" }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: scrollRef, className: "flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4", children: messages?.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(MessageBubble, { m, onReact: (emoji) => react.mutate({
        messageId: m.id,
        emoji
      }) }, m.id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border bg-card p-3 flex flex-col gap-2", children: [
        selectedFile && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setSelectedFile(null), className: "absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }) }),
          selectedFile.type === "image" ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: selectedFile.base64, alt: "preview", className: "h-12 w-12 object-cover rounded-md" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-12 w-12 bg-muted rounded-md flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Image, { className: "h-5 w-5 text-muted-foreground" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs truncate max-w-[150px]", children: selectedFile.file.name })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-end gap-2", children: !isRecording ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", id: "file-upload", hidden: true, onChange: handleFileChange }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "file-upload", className: "rounded p-2 text-muted-foreground hover:bg-accent cursor-pointer", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { className: "h-4 w-4" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "rounded p-2 text-muted-foreground hover:bg-accent", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Smile, { className: "h-4 w-4" }) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { side: "top", align: "start", className: "p-0 border-none w-auto shadow-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmojiPicker$1, { onEmojiClick: (e) => setText((prev) => prev + e.emoji) }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(reactTextareaAutosize_cjs_defaultExports._default, { value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => {
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
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "hidden w-[320px] shrink-0 flex-col border-l border-border bg-card xl:flex", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-border p-5 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "mx-auto h-16 w-16", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: "text-base", children: initials(conv.contact?.name) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-3 text-base font-semibold", children: conv.contact?.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Cliente" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 p-5 text-sm", children: [
        conv.contact?.phone && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { icon: Phone, label: "Telefone", value: formatPhone(conv.contact.phone) }),
        conv.contact?.email && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { icon: Mail, label: "E-mail", value: conv.contact.email }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Tag, { className: "h-3 w-3" }),
            " Tags"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: conv.contact?.tags?.length ? conv.contact.tags.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", children: t }, t)) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Sem tags" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", children: "Iniciado" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: formatRelative(conv.started_at) })
        ] })
      ] })
    ] })
  ] });
}
function Field({
  icon: Icon,
  label,
  value
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-3 w-3" }),
      " ",
      label
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "break-all", children: value })
  ] });
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
  onReact
}) {
  const mine = m.sender_type === "agent";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("flex relative", mine ? "justify-end" : "justify-start"), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cn("max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground border border-border", m.is_deleted && "opacity-60", m.isOptimistic && "opacity-70"), children: [
    onReact && !m.isOptimistic && !m.is_deleted && /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: cn("absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground z-10", mine ? "-left-10" : "-right-10"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(SmilePlus, { className: "h-4 w-4" }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { side: "top", className: "w-auto p-2 flex gap-1 rounded-full shadow-lg border-border", children: QUICK_EMOJIS.map((e) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onReact(e), className: "hover:bg-accent rounded-full p-2 text-xl transition-transform hover:scale-125", children: e }, e)) })
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: m.media_url, alt: m.content || "Imagem recebida", className: "max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogContent, { className: "max-w-4xl p-1 bg-transparent border-none shadow-none flex justify-center items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: m.media_url, alt: m.content || "Imagem recebida", className: "max-h-[85vh] w-auto rounded-md object-contain" }) })
      ] }),
      m.content && m.content !== "📷 Imagem" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: m.content }) })
    ] }) : m.media_type === "audio" && m.media_url ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("audio", { controls: true, src: m.media_url, className: "h-10 w-48" }),
      m.content && m.content !== "🎵 Áudio" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: m.content }) })
    ] }) : m.media_type === "video" && m.media_url ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-col gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("video", { controls: true, src: m.media_url, className: "max-w-[200px] rounded-lg" }),
      m.content && m.content !== "🎥 Vídeo" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: m.content }) })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FormattedText, { text: m.content || "" }),
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
