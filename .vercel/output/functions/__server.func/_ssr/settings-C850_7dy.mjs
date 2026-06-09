import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { C as Card, a as CardHeader, b as CardTitle, d as CardDescription, c as CardContent } from "./card-t5bxWKAo.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { T as Tabs, f as TabsList, g as TabsTrigger, h as TabsContent, B as Badge, D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription, e as DialogFooter, i as DialogTrigger } from "./tabs-DaV-6sV-.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { S as Switch, Q as QrCodeModal, I as InstanceSettingsModal, E as EvoGoClient } from "./instance-settings-modal-UbRRc0DC.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { u as useAuth, a as useUnit } from "./router-BZupuT9_.mjs";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea, P as Popover, e as PopoverTrigger, f as PopoverContent, C as Command, g as CommandInput, h as CommandList, i as CommandEmpty, j as CommandGroup, k as CommandItem } from "./command-P2Bojk4p.mjs";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-DteJ2TLP.mjs";
import { c as createClient } from "../_libs/supabase__supabase-js.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { t as Building, w as Save, x as Server, K as Key, l as Smartphone, P as Plus, r as User, Q as QrCode, e as Settings, U as Users, T as Trash2, y as Copy, k as Pen, z as MessageSquarePlus, A as Pencil, C as ChevronsUpDown, o as Check, D as Settings2, G as GripVertical } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
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
import "tslib";
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
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-switch.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/radix-ui__react-popover.mjs";
import "../_libs/cmdk.mjs";
import "../_libs/radix-ui__react-alert-dialog.mjs";
import "../_libs/radix-ui__react-label.mjs";
function QuickMessagesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [editingId, setEditingId] = reactExports.useState(null);
  const [shortcut, setShortcut] = reactExports.useState("");
  const [content, setContent] = reactExports.useState("");
  const { data: quickMessages, isLoading } = useQuery({
    queryKey: ["quick-messages", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_messages").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });
  const resetForm = () => {
    setShortcut("");
    setContent("");
    setEditingId(null);
  };
  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!shortcut.startsWith("/")) throw new Error("O atalho deve começar com / (ex: /msg01)");
      if (editingId) {
        const { error } = await supabase.from("quick_messages").update({ shortcut, content }).eq("id", editingId).eq("company_id", profile.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("quick_messages").insert({
          company_id: profile.company_id,
          shortcut,
          content
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mensagem rápida salva!");
      setIsOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e.message })
  });
  const deleteMessage = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("quick_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mensagem excluída!");
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "flex flex-row items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquarePlus, { className: "h-5 w-5" }),
          "Mensagens Rápidas"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: 'Configure atalhos como "/saudacao" para respostas prontas no chat.' })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Dialog, { open: isOpen, onOpenChange: (open) => {
        setIsOpen(open);
        if (!open) resetForm();
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { children: "Novo Atalho" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: editingId ? "Editar Atalho" : "Novo Atalho" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 py-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Atalho (ex: /saudacao)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  value: shortcut,
                  onChange: (e) => setShortcut(e.target.value.replace(/\s/g, "")),
                  placeholder: "/msg01"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Conteúdo da Mensagem" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded cursor-help", title: "{{atendente}}, {{cliente}}, {{saudacao}}, {{telefone}}, {{protocolo}}, {{data}}, {{hora}}", children: [
                  "Variáveis: ",
                  "{{atendente}}",
                  ", ",
                  "{{cliente}}",
                  ", ",
                  "{{saudacao}}",
                  " e mais..."
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Textarea,
                {
                  value: content,
                  onChange: (e) => setContent(e.target.value),
                  placeholder: "Olá {{cliente}}, como podemos ajudar?",
                  rows: 5
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Button,
              {
                className: "w-full",
                onClick: () => saveMessage.mutate(),
                disabled: saveMessage.isPending || !shortcut || !content,
                children: "Salvar"
              }
            )
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : quickMessages?.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground", children: "Nenhuma mensagem rápida configurada. Crie atalhos para agilizar o atendimento." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: quickMessages?.map((qm) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between border rounded-lg p-4 bg-muted/20", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block bg-primary/10 text-primary font-mono px-2 py-0.5 rounded text-xs font-bold", children: qm.shortcut }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground line-clamp-2 mt-2", children: qm.content })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => {
              setEditingId(qm.id);
              setShortcut(qm.shortcut);
              setContent(qm.content);
              setIsOpen(true);
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          Button,
          {
            variant: "ghost",
            size: "icon",
            className: "text-destructive hover:text-destructive",
            onClick: () => {
              if (confirm("Excluir atalho?")) {
                deleteMessage.mutate(qm.id);
              }
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" })
          }
        )
      ] })
    ] }, qm.id)) }) })
  ] });
}
function DepartmentsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments", profile?.company_id, "sede"],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase.from("departments").select("*").eq("company_id", profile.company_id).is("unit_id", null);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });
  const createDept = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Nome é obrigatório");
      const { error } = await supabase.from("departments").insert({
        company_id: profile.company_id,
        unit_id: null,
        name,
        description
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento criado!");
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: e.message })
  });
  const deleteDept = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento excluído.");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Novo Departamento (Sede)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Crie setores para organizar o atendimento da Empresa Mãe." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3 max-w-2xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nome do Setor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: Financeiro", value: name, onChange: (e) => setName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Descrição" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Opcional", value: description, onChange: (e) => setDescription(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createDept.mutate(), disabled: !name || createDept.isPending, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-2" }),
          "Criar"
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Departamentos da Sede" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : departments?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 md:grid-cols-2 lg:grid-cols-3", children: departments.map((dept) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border p-4 flex items-start justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "font-semibold", children: dept.name }),
          dept.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground mt-1", children: dept.description }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-muted-foreground mt-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-3 w-3" }),
            "SLA: ",
            dept.sla_minutes,
            " min"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-destructive hover:bg-destructive/10", onClick: () => {
          if (confirm("Tem certeza que deseja apagar este departamento?")) deleteDept.mutate(dept.id);
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) })
      ] }, dept.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground italic", children: "Nenhum departamento criado neste contexto." }) })
    ] })
  ] });
}
function MultiSelectUnits({ units, selected, onChange }) {
  const [open, setOpen] = reactExports.useState(false);
  const allSelected = selected.length === units.length && units.length > 0;
  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(units.map((u) => u.id));
  };
  const toggleUnit = (id) => {
    if (selected.includes(id)) onChange(selected.filter((u) => u !== id));
    else onChange([...selected, id]);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Popover, { open, onOpenChange: setOpen, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-full justify-between font-normal", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: selected.length === 0 ? "Selecionar unidades..." : allSelected ? "Todas as unidades selecionadas" : `${selected.length} unidade(s) selecionada(s)` }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUpDown, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PopoverContent, { className: "w-[300px] p-0", align: "start", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Command, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CommandInput, { placeholder: "Buscar unidade..." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandList, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CommandEmpty, { children: "Nenhuma unidade encontrada." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandGroup, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandItem, { onSelect: toggleAll, className: "cursor-pointer", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", allSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: cn("h-3 w-3") }) }),
            "Selecionar Todas"
          ] }),
          units.map((unit) => {
            const isSelected = selected.includes(unit.id);
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(CommandItem, { onSelect: () => toggleUnit(unit.id), className: "cursor-pointer", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: cn("h-3 w-3") }) }),
              unit.name
            ] }, unit.id);
          })
        ] })
      ] })
    ] }) })
  ] });
}
function UsersTab() {
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [manageAccessUser, setManageAccessUser] = reactExports.useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = reactExports.useState(false);
  const [newUserName, setNewUserName] = reactExports.useState("");
  const [newUserEmail, setNewUserEmail] = reactExports.useState("");
  const [newUserPassword, setNewUserPassword] = reactExports.useState("");
  const [newUserRole, setNewUserRole] = reactExports.useState("agent");
  const [newUserUnits, setNewUserUnits] = reactExports.useState([]);
  const [newUserDepartment, setNewUserDepartment] = reactExports.useState("none");
  const [isCreating, setIsCreating] = reactExports.useState(false);
  const { data: users, isLoading } = useQuery({
    queryKey: ["users", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, name, email, role, department_id, has_matriz_access, departments!profiles_department_id_fkey(name), user_units(unit_id, role)").eq("company_id", profile.company_id);
      if (error) throw error;
      return data;
    }
  });
  const { data: units } = useQuery({
    queryKey: ["units", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").eq("company_id", profile.company_id);
      return data ?? [];
    }
  });
  const { data: companyName } = useQuery({
    queryKey: ["company-name", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("name").eq("id", profile.company_id).single();
      return data?.name;
    }
  });
  const { data: departments } = useQuery({
    queryKey: ["departments", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("company_id", profile.company_id);
      return data ?? [];
    }
  });
  const updateGlobalRole = useMutation({
    mutationFn: async ({ userId, role }) => {
      const { error } = await supabase.rpc("update_user_profile_admin", {
        p_user_id: userId,
        p_role: role,
        p_has_matriz_access: null,
        p_company_id: null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nível de acesso atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: e.message })
  });
  const updateUserDepartment = useMutation({
    mutationFn: async ({ userId, departmentId }) => {
      const { error } = await supabase.from("profiles").update({ department_id: departmentId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro ao atualizar departamento", { description: e.message })
  });
  useMutation({
    mutationFn: async ({ userId, hasAccess }) => {
      if (!selectedUnitId) return;
      if (hasAccess) {
        const { error } = await supabase.from("user_units").delete().eq("user_id", userId).eq("unit_id", selectedUnitId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_units").insert({ user_id: userId, unit_id: selectedUnitId, role: "agent" });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast.success(variables.hasAccess ? "Acesso revogado da unidade." : "Usuário adicionado à unidade.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  const toggleSpecificUnitAccess = useMutation({
    mutationFn: async ({ userId, unitId, hasAccess }) => {
      if (unitId === "matriz") {
        const { error } = await supabase.rpc("toggle_matriz_access_rpc", { p_user_id: userId, p_has_access: hasAccess });
        if (error) throw error;
        return;
      }
      if (!hasAccess) {
        const { error } = await supabase.from("user_units").delete().eq("user_id", userId).eq("unit_id", unitId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_units").upsert({ user_id: userId, unit_id: unitId, role: "agent" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  const handleCopyLink = () => {
    const link = `${window.location.origin}/auth?company=${profile?.company_id}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!profile?.company_id) return;
    setIsCreating(true);
    try {
      const tempClient = createClient(
        "https://qmkqjkzrsszzytrmdxzc.supabase.co",
        "sb_publishable_plo841jzoTXjwYn_c9c17g_NKK6ODUE",
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data, error } = await tempClient.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            name: newUserName,
            company_id: profile.company_id,
            department_id: newUserDepartment === "none" ? null : newUserDepartment
          }
        }
      });
      if (error) throw error;
      if (data.user?.id) {
        await new Promise((r) => setTimeout(r, 1500));
        const { error: linkError } = await supabase.rpc("link_user_to_company", {
          p_email: newUserEmail,
          p_company_id: profile.company_id
        });
        if (linkError) {
          throw new Error("Erro de Banco de Dados: A função 'link_user_to_company' não foi encontrada. Você PRECISA rodar as migrations (npx supabase db push) para poder criar novos usuários sem falhas de RLS.");
        }
        if (newUserRole !== "agent" || newUserUnits.includes("matriz")) {
          const { error: pErr } = await supabase.rpc("update_user_profile_admin", {
            p_user_id: data.user.id,
            p_role: newUserRole,
            p_has_matriz_access: newUserUnits.includes("matriz"),
            p_company_id: null
          });
          if (pErr) throw pErr;
        }
        const standardUnits = newUserUnits.filter((id) => id !== "matriz");
        if (standardUnits.length > 0) {
          const unitInserts = standardUnits.map((uid) => ({
            user_id: data.user.id,
            unit_id: uid,
            role: "agent"
          }));
          const { error: uErr } = await supabase.from("user_units").insert(unitInserts);
          if (uErr) throw uErr;
        }
      }
      toast.success("Usuário criado com sucesso!");
      setIsCreateModalOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("agent");
      setNewUserUnits([]);
      setNewUserDepartment("none");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e2) {
      if (e2.message?.includes("already registered") || e2.message?.includes("User already exists")) {
        try {
          const { data: existingProfile } = await supabase.from("profiles").select("id").eq("email", newUserEmail).single();
          if (existingProfile) {
            const { error: pErr } = await supabase.rpc("update_user_profile_admin", {
              p_user_id: existingProfile.id,
              p_role: newUserRole,
              p_has_matriz_access: newUserUnits.includes("matriz"),
              p_company_id: profile.company_id
            });
            if (pErr) throw pErr;
            const standardUnits = newUserUnits.filter((id) => id !== "matriz");
            if (standardUnits.length > 0) {
              const unitInserts = standardUnits.map((uid) => ({
                user_id: existingProfile.id,
                unit_id: uid,
                role: "agent"
              }));
              await supabase.from("user_units").upsert(unitInserts);
            }
          }
          toast.success("O usuário já existia e foi vinculado à sua empresa com os acessos definidos!");
          setIsCreateModalOpen(false);
          setNewUserName("");
          setNewUserEmail("");
          setNewUserPassword("");
          setNewUserRole("agent");
          setNewUserUnits([]);
          setNewUserDepartment("none");
          qc.invalidateQueries({ queryKey: ["users"] });
          return;
        } catch (linkError) {
          toast.error("Falha ao vincular usuário existente", { description: linkError.message });
        }
      } else {
        toast.error("Falha ao criar", { description: e2.message });
      }
    } finally {
      setIsCreating(false);
    }
  };
  const unitsWithMatriz = units ? [{ id: "matriz", name: companyName || "Empresa Mãe (Sede)" }, ...units] : [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    !selectedUnitId && /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Convite de Usuários" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Envie o link de convite abaixo para que novos funcionários criem suas contas vinculadas diretamente à sua empresa." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("code", { className: "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm flex-1 truncate", children: [
          window.location.origin,
          "/auth?company=",
          profile?.company_id
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "secondary", onClick: handleCopyLink, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { className: "h-4 w-4 mr-2" }),
          "Copiar"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-8 bg-border mx-2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => setIsCreateModalOpen(true), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4 mr-2" }),
          "Criar Usuário"
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Membros da Equipe" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: selectedUnitId ? "Gerencie quais funcionários da empresa possuem acesso a esta Unidade." : "Lista de todos os usuários da empresa. Aqui você define os níveis globais de acesso." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando usuários..." }) : users?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-md border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b bg-muted/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium", children: "Nome / E-mail" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium", children: "Departamento" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium", children: "Nível Global" }),
          !selectedUnitId && /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-right font-medium", children: "Ações" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: (selectedUnitId ? users.filter((u) => u.role === "admin_company" || u.user_units.some((uu) => uu.unit_id === selectedUnitId)) : users).map((u) => {
          const isSelf = u.id === profile?.id;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b last:border-0 hover:bg-muted/50", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "p-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-medium", children: [
                u.name,
                " ",
                isSelf && /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "ml-2 text-[10px]", children: "Você" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: u.email })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4", children: !selectedUnitId ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                disabled: updateUserDepartment.isPending,
                value: u.department_id || "none",
                onValueChange: (val) => updateUserDepartment.mutate({ userId: u.id, departmentId: val === "none" ? null : val }),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 w-[160px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Sem departamento" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "none", children: "Nenhum" }),
                    departments?.map((dept) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: dept.id, children: dept.name }, dept.id))
                  ] })
                ]
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: u.departments?.name || "Nenhum" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4", children: !selectedUnitId ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
              Select,
              {
                disabled: isSelf || updateGlobalRole.isPending,
                defaultValue: u.role,
                onValueChange: (val) => updateGlobalRole.mutate({ userId: u.id, role: val }),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 w-[140px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "agent", children: "Agente" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "manager", children: "Gerente" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "admin_company", children: "Administrador" })
                  ] })
                ]
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: u.role === "admin_company" ? "default" : "secondary", children: u.role === "admin_company" ? "Admin" : u.role === "manager" ? "Gerente" : "Agente" }) }),
            !selectedUnitId && /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                Button,
                {
                  variant: "outline",
                  size: "sm",
                  className: "h-8",
                  disabled: u.role === "admin_company",
                  onClick: () => setManageAccessUser(u),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Building, { className: "h-4 w-4 mr-2" }),
                    "Acessos às Unidades"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", disabled: isSelf, className: "h-8 w-8 text-destructive hover:bg-destructive/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) })
            ] }) })
          ] }, u.id);
        }) })
      ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground italic", children: "Nenhum usuário cadastrado." }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: !!manageAccessUser, onOpenChange: (open) => !open && setManageAccessUser(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
          "Acessos de ",
          manageAccessUser?.name
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Selecione em quais Unidades este usuário pode atuar. Usuários administradores têm acesso automático a todas as unidades." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 py-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Acesso às Unidades" }),
        unitsWithMatriz.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          MultiSelectUnits,
          {
            units: unitsWithMatriz,
            selected: [
              ...manageAccessUser?.has_matriz_access ? ["matriz"] : [],
              ...manageAccessUser?.user_units?.map((uu) => uu.unit_id) || []
            ],
            onChange: (newSelected) => {
              const currentSelected = [
                ...manageAccessUser?.has_matriz_access ? ["matriz"] : [],
                ...manageAccessUser?.user_units?.map((uu) => uu.unit_id) || []
              ];
              const added = newSelected.filter((id) => !currentSelected.includes(id));
              const removed = currentSelected.filter((id) => !newSelected.includes(id));
              added.forEach((unitId) => {
                toggleSpecificUnitAccess.mutate({ userId: manageAccessUser.id, unitId, hasAccess: true });
              });
              removed.forEach((unitId) => {
                toggleSpecificUnitAccess.mutate({ userId: manageAccessUser.id, unitId, hasAccess: false });
              });
              setManageAccessUser((prev) => ({
                ...prev,
                has_matriz_access: newSelected.includes("matriz"),
                user_units: newSelected.filter((id) => id !== "matriz").map((unit_id) => ({ unit_id, role: "agent" }))
              }));
            }
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Nenhuma unidade cadastrada na empresa." })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: isCreateModalOpen, onOpenChange: setIsCreateModalOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Criar Novo Usuário" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Crie uma conta para um funcionário. Ele já será vinculado à sua empresa." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleCreateUser, className: "space-y-4 py-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Nome Completo" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, value: newUserName, onChange: (e) => setNewUserName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "E-mail" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "email", required: true, value: newUserEmail, onChange: (e) => setNewUserEmail(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Senha Temporária" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "password", required: true, minLength: 6, value: newUserPassword, onChange: (e) => setNewUserPassword(e.target.value) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "O funcionário poderá alterar depois (mínimo 6 caracteres)." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Departamento Principal" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: newUserDepartment, onValueChange: setNewUserDepartment, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Selecione um departamento (Opcional)" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "none", children: "Sem departamento" }),
              departments?.map((dept) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: dept.id, children: dept.name }, dept.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Nível de Acesso (Matriz)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: newUserRole, onValueChange: setNewUserRole, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "agent", children: "Agente" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "manager", children: "Gerente" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "admin_company", children: "Administrador" })
            ] })
          ] })
        ] }),
        newUserRole !== "admin_company" && unitsWithMatriz.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 border-t pt-4 mt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Acesso às Unidades" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            MultiSelectUnits,
            {
              units: unitsWithMatriz,
              selected: newUserUnits,
              onChange: setNewUserUnits
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end pt-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "button", variant: "ghost", className: "mr-2", onClick: () => setIsCreateModalOpen(false), children: "Cancelar" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: isCreating, children: isCreating ? "Criando..." : "Criar Usuário" })
        ] })
      ] })
    ] }) })
  ] });
}
function LabelsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = reactExports.useState(false);
  const [editingLabel, setEditingLabel] = reactExports.useState(null);
  const [name, setName] = reactExports.useState("");
  const [color, setColor] = reactExports.useState("#6b7280");
  const { data: labels, isLoading } = useQuery({
    queryKey: ["labels", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("labels").select("*").eq("company_id", profile.company_id).order("name");
      if (error) throw error;
      return data || [];
    }
  });
  const openModal = (label) => {
    if (label) {
      setEditingLabel(label);
      setName(label.name);
      setColor(label.color || "#6b7280");
    } else {
      setEditingLabel(null);
      setName("");
      setColor(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`);
    }
    setIsModalOpen(true);
  };
  const saveLabel = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!name.trim()) throw new Error("O nome da etiqueta é obrigatório");
      if (editingLabel) {
        const { error } = await supabase.from("labels").update({ name, color }).eq("id", editingLabel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("labels").insert({
          name,
          color,
          company_id: profile.company_id,
          external_id: crypto.randomUUID()
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", profile?.company_id] });
      toast.success(editingLabel ? "Etiqueta atualizada!" : "Etiqueta criada!");
      setIsModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e.message })
  });
  const deleteLabel = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", profile?.company_id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Etiqueta removida!");
    },
    onError: (e) => toast.error("Erro ao remover", { description: e.message })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "flex flex-row items-start justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "text-xl", children: "Etiquetas do Sistema" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Crie e gerencie as etiquetas disponíveis para classificar contatos e conversas." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => openModal(), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
          "Nova Etiqueta"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando etiquetas..." }) : !labels?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground border border-dashed rounded-lg p-8 text-center", children: "Nenhuma etiqueta criada ainda." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: labels.map((label) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "w-4 h-4 rounded-full",
              style: { backgroundColor: label.color || "#6b7280" }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-sm", children: label.name })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openModal(label), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pen, { className: "h-4 w-4 text-muted-foreground" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                if (confirm(`Tem certeza que deseja apagar a etiqueta "${label.name}"?`)) {
                  deleteLabel.mutate(label.id);
                }
              },
              disabled: deleteLabel.isPending,
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4 text-destructive" })
            }
          )
        ] })
      ] }, label.id)) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: isModalOpen, onOpenChange: setIsModalOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: editingLabel ? "Editar Etiqueta" : "Nova Etiqueta" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: editingLabel ? "Altere o nome e a cor da etiqueta." : "Crie uma nova etiqueta para organizar seus atendimentos." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 py-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Nome" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: name,
              onChange: (e) => setName(e.target.value),
              placeholder: "Ex: Cliente VIP, Suporte Técnico...",
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Cor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "color",
                value: color,
                onChange: (e) => setColor(e.target.value),
                className: "w-16 h-10 p-1 cursor-pointer"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-muted-foreground uppercase", children: color })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setIsModalOpen(false), children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: () => saveLabel.mutate(), disabled: saveLabel.isPending, children: saveLabel.isPending ? "Salvando..." : "Salvar Etiqueta" })
      ] })
    ] }) })
  ] });
}
function CrmTab() {
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [newPipelineName, setNewPipelineName] = reactExports.useState("");
  const [selectedPipelineId, setSelectedPipelineId] = reactExports.useState(null);
  const { data: pipelines, isLoading: isLoadingPipelines } = useQuery({
    queryKey: ["pipelines", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("*").eq("company_id", profile.company_id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });
  const createPipeline = useMutation({
    mutationFn: async (name) => {
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      const { data, error } = await supabase.from("pipelines").insert({ name, company_id: profile.company_id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Funil criado com sucesso!");
      setNewPipelineName("");
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      setSelectedPipelineId(data.id);
    },
    onError: (e) => toast.error("Erro ao criar funil", { description: e.message })
  });
  const deletePipeline = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      toast.success("Funil excluído.");
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      if (selectedPipelineId === id) setSelectedPipelineId(null);
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message })
  });
  if (!selectedPipelineId && pipelines && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }
  const selectedPipeline = pipelines?.find((p) => p.id === selectedPipelineId);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Gestão de Funis (Pipelines)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Crie e gerencie os funis de vendas da sua empresa." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3 mb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Novo Funil" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                placeholder: "Ex: Vendas B2B, Pós-Venda...",
                value: newPipelineName,
                onChange: (e) => setNewPipelineName(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && newPipelineName) createPipeline.mutate(newPipelineName);
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createPipeline.mutate(newPipelineName), disabled: !newPipelineName || createPipeline.isPending, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
            " Criar"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: isLoadingPipelines ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-muted-foreground", children: "Carregando funis..." }) : pipelines?.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Button,
          {
            variant: selectedPipelineId === p.id ? "default" : "outline",
            className: "group relative pr-10",
            onClick: () => setSelectedPipelineId(p.id),
            children: [
              p.name,
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "absolute right-2 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity",
                  onClick: (e) => {
                    e.stopPropagation();
                    if (confirm("Tem certeza que deseja excluir este funil e todas as suas etapas?")) {
                      deletePipeline.mutate(p.id);
                    }
                  },
                  title: "Excluir funil",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" })
                }
              )
            ]
          },
          p.id
        )) })
      ] })
    ] }),
    selectedPipeline && /* @__PURE__ */ jsxRuntimeExports.jsx(PipelineStagesManager, { pipeline: selectedPipeline })
  ] });
}
function PipelineStagesManager({ pipeline }) {
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const [newStageName, setNewStageName] = reactExports.useState("");
  const [newStageColor, setNewStageColor] = reactExports.useState("#3b82f6");
  const { data: fallbackUnit } = useQuery({
    queryKey: ["first-unit", profile?.company_id],
    enabled: !selectedUnitId && !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id").eq("company_id", profile.company_id).limit(1).single();
      return data;
    }
  });
  const effectiveUnitId = selectedUnitId || fallbackUnit?.id;
  const { data: stages, isLoading } = useQuery({
    queryKey: ["pipeline-stages", pipeline.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipeline.id).order("order", { ascending: true });
      if (error) throw error;
      return data;
    }
  });
  const createStage = useMutation({
    mutationFn: async () => {
      if (!effectiveUnitId) throw new Error("Nenhuma unidade encontrada para vincular a etapa.");
      const newOrder = stages && stages.length > 0 ? Math.max(...stages.map((s) => s.order)) + 1 : 1;
      const { error } = await supabase.from("pipeline_stages").insert({
        pipeline_id: pipeline.id,
        unit_id: effectiveUnitId,
        name: newStageName,
        color: newStageColor,
        order: newOrder
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa criada!");
      setNewStageName("");
      qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] });
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  const deleteStage = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa excluída.");
      qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] });
    },
    onError: (e) => toast.error("Erro", { description: e.message })
  });
  const updateStageColor = useMutation({
    mutationFn: async ({ id, color }) => {
      const { error } = await supabase.from("pipeline_stages").update({ color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages", pipeline.id] })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Settings2, { className: "h-5 w-5" }),
        "Etapas: ",
        pipeline.name
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Gerencie as colunas do seu quadro Kanban. Arraste para reordenar (em breve)." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nome da Etapa" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              placeholder: "Ex: Prospecção, Negociação...",
              value: newStageName,
              onChange: (e) => setNewStageName(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && newStageName) createStage.mutate();
              }
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Cor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-9 w-14 overflow-hidden rounded-md border border-input", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "color",
              value: newStageColor,
              onChange: (e) => setNewStageColor(e.target.value),
              className: "h-full w-full cursor-pointer bg-transparent border-0 p-0"
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createStage.mutate(), disabled: !newStageName || createStage.isPending || !effectiveUnitId, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
          " Adicionar"
        ] })
      ] }),
      !effectiveUnitId && !fallbackUnit && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-destructive", children: "Por favor, crie uma unidade primeiro para poder adicionar etapas." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Carregando etapas..." }) : stages?.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground border-dashed border-2 rounded-md p-6 text-center", children: "Nenhuma etapa configurada neste funil." }) : stages?.map((stage, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-3 bg-muted/30 border rounded-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GripVertical, { className: "h-4 w-4 text-muted-foreground cursor-grab opacity-50" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-muted-foreground w-4", children: index + 1 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex h-8 w-8 overflow-hidden rounded-md border border-input shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "color",
            value: stage.color,
            onChange: (e) => updateStageColor.mutate({ id: stage.id, color: e.target.value }),
            className: "h-full w-full cursor-pointer bg-transparent border-0 p-0",
            title: "Alterar cor"
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 font-medium text-sm", children: stage.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", onClick: () => {
          if (confirm("Excluir esta etapa? Todas as oportunidades nela podem ficar sem etapa definida.")) {
            deleteStage.mutate(stage.id);
          }
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4 text-destructive" }) })
      ] }, stage.id)) })
    ] })
  ] });
}
function SettingsPage() {
  const {
    profile,
    user
  } = useAuth();
  const {
    selectedUnitId
  } = useUnit();
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = reactExports.useState("");
  const [host, setHost] = reactExports.useState("");
  const [token, setToken] = reactExports.useState("");
  const [useSignature, setUseSignature] = reactExports.useState(profile?.use_signature || false);
  const [newCompanyName, setNewCompanyName] = reactExports.useState("");
  const [selectedInstance, setSelectedInstance] = reactExports.useState(null);
  const [qrModalOpen, setQrModalOpen] = reactExports.useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = reactExports.useState(false);
  const {
    data: company,
    isLoading: isLoadingCompany
  } = useQuery({
    queryKey: ["company", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("companies").select("id, name, evogo_host, evogo_global_token").eq("id", profile.company_id).single();
      if (error) throw error;
      return data;
    }
  });
  const createCompany = useMutation({
    mutationFn: async (name) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const {
        data: newId,
        error
      } = await supabase.rpc("create_new_company", {
        company_name: name,
        company_slug: slug,
        user_id: user.id
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: () => {
      toast.success("Empresa criada com sucesso! Recarregue a página.");
      window.location.reload();
    },
    onError: (e) => toast.error("Erro ao criar empresa", {
      description: e.message
    })
  });
  reactExports.useEffect(() => {
    if (company) {
      setHost(company.evogo_host || "");
      setToken(company.evogo_global_token || "");
      setNewCompanyName(company.name || "");
    }
  }, [company]);
  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      const {
        error
      } = await supabase.from("companies").update({
        evogo_host: host,
        evogo_global_token: token
      }).eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas!");
      qc.invalidateQueries({
        queryKey: ["company", profile?.company_id]
      });
    },
    onError: (e) => toast.error("Erro ao salvar", {
      description: e.message
    })
  });
  const saveCompanyName = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      const {
        error
      } = await supabase.from("companies").update({
        name: newCompanyName
      }).eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nome da empresa atualizado!");
      qc.invalidateQueries({
        queryKey: ["company", profile?.company_id]
      });
      qc.invalidateQueries({
        queryKey: ["company-name", profile?.company_id]
      });
    },
    onError: (e) => toast.error("Erro ao atualizar", {
      description: e.message
    })
  });
  const toggleSignature = useMutation({
    mutationFn: async (enabled) => {
      if (!profile?.id) throw new Error("Sem usuário ativo");
      const {
        error
      } = await supabase.from("profiles").update({
        use_signature: enabled
      }).eq("id", profile.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      setUseSignature(enabled);
      toast.success(enabled ? "Assinatura ativada!" : "Assinatura desativada!");
    },
    onError: (e) => {
      setUseSignature(!useSignature);
      toast.error("Erro ao alterar assinatura", {
        description: e.message
      });
    }
  });
  const {
    data: instances,
    isLoading: isLoadingInstances
  } = useQuery({
    queryKey: ["whatsapp-instances", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase.from("whatsapp_instances").select("*").eq("company_id", profile.company_id);
      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      else q = q.is("unit_id", null);
      const {
        data,
        error
      } = await q.order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  const createInstance = useMutation({
    mutationFn: async (name) => {
      if (!profile?.company_id) throw new Error("Sem empresa");
      if (!company?.evogo_host || !company?.evogo_global_token) {
        throw new Error("Configure Host e Token primeiro.");
      }
      const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "").replace(/[^\w-]/g, "");
      let unitSlugPart = "";
      if (selectedUnitId) {
        const {
          data: unitData
        } = await supabase.from("units").select("name").eq("id", selectedUnitId).single();
        if (unitData?.name) {
          unitSlugPart = `-${slugify(unitData.name)}`;
        }
      }
      const technicalName = `${slugify(company.name)}${unitSlugPart}-${slugify(name)}`;
      const {
        data,
        error
      } = await supabase.from("whatsapp_instances").insert({
        company_id: profile.company_id,
        unit_id: selectedUnitId || null,
        name,
        instance_name: technicalName
      }).select().single();
      if (error) throw error;
      const client = new EvoGoClient({
        host: company.evogo_host,
        token: company.evogo_global_token
      });
      try {
        const evoRes = await client.createInstance(technicalName, data.evogo_api_key);
        const evogoId = evoRes?.data?.id || evoRes?.id;
        if (evogoId) {
          const webhookUrl = `${window.location.origin}/api/evogo/webhook`;
          await supabase.from("whatsapp_instances").update({
            evogo_instance_id: evogoId,
            webhook_url: webhookUrl
          }).eq("id", data.id);
          await client.connectInstance(webhookUrl, data.evogo_api_key).catch(console.error);
          await client.updateAdvancedSettings(evogoId, {
            rejectCalls: false,
            readMessages: false,
            readStatus: false,
            alwaysOnline: false
          }, data.evogo_api_key).catch(console.error);
        }
      } catch (e) {
        console.error("Falha ao criar/configurar na EvoGo, mas salvo no DB", e);
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Instância global criada!");
      setInstanceName("");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances"]
      });
    },
    onError: (e) => toast.error("Erro ao criar", {
      description: e.message
    })
  });
  if (!profile?.company_id) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 space-y-4 p-4 md:p-8 pt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-md mx-auto mt-20", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Bem-vindo ao Omni!" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Para acessar as configurações, você precisa cadastrar a sua Empresa Mãe primeiro." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nome da Empresa" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Minha Empresa", value: newCompanyName, onChange: (e) => setNewCompanyName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { className: "w-full", onClick: () => createCompany.mutate(newCompanyName), disabled: !newCompanyName || createCompany.isPending, children: "Cadastrar Empresa" })
      ] })
    ] }) }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-4 p-4 md:p-8 pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between space-y-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight", children: selectedUnitId ? "Configurações da Unidade" : "Configurações Globais" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { defaultValue: "general", className: "space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "flex flex-wrap h-auto gap-1 justify-start", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "general", children: "Geral e Integrações" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "profile", children: "Meu Perfil" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "departments", children: "Departamentos" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "users", children: "Equipe e Acessos" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "labels", children: "Etiquetas" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "crm", children: "CRM e Funis" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "quick-messages", children: "Mensagens Rápidas" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "general", className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: [
        !selectedUnitId && /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "col-span-full lg:col-span-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Building, { className: "h-5 w-5" }),
              "Detalhes da Empresa"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Altere o nome da sua empresa matriz." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nome da Empresa" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Minha Empresa", value: newCompanyName, onChange: (e) => setNewCompanyName(e.target.value) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { className: "w-full", onClick: () => saveCompanyName.mutate(), disabled: saveCompanyName.isPending || !newCompanyName, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "mr-2 h-4 w-4" }),
              "Salvar Alterações"
            ] })
          ] })
        ] }),
        !selectedUnitId && /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "col-span-full lg:col-span-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Server, { className: "h-5 w-5" }),
              "API EvoGo (Empresa Mãe)"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Configure o servidor base e o token mestre." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Host (URL da API)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Server, { className: "absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "https://api.evogo.com", value: host, onChange: (e) => setHost(e.target.value), className: "pl-9" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Global Token" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Key, { className: "absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "password", placeholder: "Seu token global", value: token, onChange: (e) => setToken(e.target.value), className: "pl-9" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { className: "w-full", onClick: () => saveConfig.mutate(), disabled: saveConfig.isPending || isLoadingCompany, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "mr-2 h-4 w-4" }),
              "Salvar Credenciais"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: cn("col-span-full", !selectedUnitId && "lg:col-span-2"), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "h-5 w-5" }),
              "Instâncias de WhatsApp"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: selectedUnitId ? "Instâncias de atendimento desta unidade específica." : "Instâncias vinculadas diretamente à Empresa Mãe (sem unidade)." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-6", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nova Instância" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Nome da conexão (ex: Suporte Central)", value: instanceName, onChange: (e) => setInstanceName(e.target.value), onKeyDown: (e) => {
                  if (e.key === "Enter" && instanceName && company?.evogo_host && !createInstance.isPending) {
                    createInstance.mutate(instanceName);
                  }
                } })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createInstance.mutate(instanceName), disabled: !instanceName || createInstance.isPending || !company?.evogo_host, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
                "Criar"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-muted-foreground", children: "Instâncias Ativas" }),
              isLoadingInstances ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : instances?.length ? instances.map((inst) => /* @__PURE__ */ jsxRuntimeExports.jsx(InstanceRow, { instance: inst, company, onConnect: () => {
                setSelectedInstance(inst);
                setQrModalOpen(true);
              }, onSettings: () => {
                setSelectedInstance(inst);
                setSettingsModalOpen(true);
              } }, inst.id)) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground", children: "Nenhuma instância global configurada no momento." })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "profile", className: "grid gap-4 md:grid-cols-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "h-5 w-5" }),
            "Preferências de Atendimento"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Configure como suas mensagens serão enviadas." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "space-y-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between space-x-2 border rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-0.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Assinatura de Mensagem" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Adicionar automaticamente seu nome ao final das mensagens enviadas." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: useSignature, onCheckedChange: (v) => toggleSignature.mutate(v), disabled: toggleSignature.isPending })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "departments", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DepartmentsTab, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "users", children: /* @__PURE__ */ jsxRuntimeExports.jsx(UsersTab, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "labels", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LabelsTab, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "crm", className: "grid gap-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CrmTab, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "quick-messages", className: "grid gap-4 md:grid-cols-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(QuickMessagesTab, {}) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(QrCodeModal, { open: qrModalOpen, onOpenChange: setQrModalOpen, instance: selectedInstance, company }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(InstanceSettingsModal, { open: settingsModalOpen, onOpenChange: setSettingsModalOpen, instance: selectedInstance, company })
  ] });
}
function InstanceRow({
  instance,
  company,
  onConnect,
  onSettings
}) {
  const qc = useQueryClient();
  const [confirmDialog, setConfirmDialog] = reactExports.useState({
    open: false,
    type: null
  });
  const handleDisconnect = async () => {
    try {
      const client = new EvoGoClient({
        host: company.evogo_host,
        token: company.evogo_global_token
      });
      await client.logoutInstance(instance.evogo_api_key);
      await supabase.from("whatsapp_instances").update({
        status: "disconnected"
      }).eq("id", instance.id);
      toast.success("Aparelho desconectado.");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances"]
      });
    } catch (e) {
      toast.error("Erro ao desconectar", {
        description: e.message
      });
    } finally {
      setConfirmDialog({
        open: false,
        type: null
      });
    }
  };
  const handleDelete = async () => {
    try {
      if (instance.evogo_instance_id) {
        const client = new EvoGoClient({
          host: company.evogo_host,
          token: company.evogo_global_token
        });
        await client.deleteInstance(instance.evogo_instance_id);
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success("Instância deletada com sucesso.");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances"]
      });
    } catch (e) {
      toast.error("Erro ao deletar", {
        description: e.message
      });
    } finally {
      setConfirmDialog({
        open: false,
        type: null
      });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-lg border p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium leading-none", children: instance.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground font-mono", children: instance.instance_name }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Status:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: instance.status === "connected" ? "default" : "secondary", className: "text-[10px] py-0", children: instance.status })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
      instance.status === "connected" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: () => setConfirmDialog({
        open: true,
        type: "disconnect"
      }), className: "text-destructive hover:bg-destructive/10", children: "Desconectar" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", onClick: onConnect, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(QrCode, { className: "mr-2 h-4 w-4" }),
        "Conectar"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", onClick: onSettings, title: "Configurações", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "h-4 w-4 text-muted-foreground" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", onClick: () => setConfirmDialog({
        open: true,
        type: "delete"
      }), className: "text-destructive hover:text-destructive hover:bg-destructive/10", title: "Deletar Instância", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 6h18" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "14", x2: "14", y1: "11", y2: "17" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: confirmDialog.open, onOpenChange: (open) => !open && setConfirmDialog({
      open: false,
      type: null
    }), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: confirmDialog.type === "disconnect" ? "Desconectar Aparelho?" : "Deletar Instância?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogDescription, { children: confirmDialog.type === "disconnect" ? "Isso irá deslogar o WhatsApp do aparelho atual. Você precisará ler o QR Code novamente para conectar." : "Isso apagará permanentemente a instância da EvoGo e todos os seus dados não poderão ser recuperados." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: confirmDialog.type === "disconnect" ? handleDisconnect : handleDelete, className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: confirmDialog.type === "disconnect" ? "Sim, Desconectar" : "Sim, Deletar" })
      ] })
    ] }) })
  ] });
}
export {
  SettingsPage as component
};
