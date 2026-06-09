import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { C as Card, a as CardHeader, b as CardTitle, c as CardContent, d as CardDescription, e as CardFooter } from "./card-t5bxWKAo.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription, e as DialogFooter, T as Tabs, f as TabsList, g as TabsTrigger, h as TabsContent, B as Badge } from "./tabs-DaV-6sV-.mjs";
import { u as useAuth } from "./router-BZupuT9_.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { E as EvoGoClient, Q as QrCodeModal, I as InstanceSettingsModal } from "./instance-settings-modal-UbRRc0DC.mjs";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-DteJ2TLP.mjs";
import { D as DropdownMenu, a as DropdownMenuTrigger, b as DropdownMenuContent, e as DropdownMenuItem } from "./dropdown-menu-DOrZFMaI.mjs";
import { S as Sheet, a as SheetContent, b as SheetHeader, c as SheetTitle, d as SheetDescription } from "./sheet-DiuHGwRv.mjs";
import { P as Plus, E as EllipsisVertical, k as Pen, T as Trash2, l as Smartphone, U as Users, g as ChevronRight, m as Store, n as Layers, Q as QrCode, e as Settings } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "./utils-H80jjgLf.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
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
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/radix-ui__react-switch.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-alert-dialog.mjs";
import "../_libs/radix-ui__react-dropdown-menu.mjs";
import "../_libs/radix-ui__react-menu.mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function UnitsPage() {
  const {
    profile
  } = useAuth();
  const qc = useQueryClient();
  const [newUnitName, setNewUnitName] = reactExports.useState("");
  const [newUnitColor, setNewUnitColor] = reactExports.useState("#6366f1");
  const [editingUnit, setEditingUnit] = reactExports.useState(null);
  const [editUnitName, setEditUnitName] = reactExports.useState("");
  const [editUnitColor, setEditUnitColor] = reactExports.useState("");
  const [deletingUnit, setDeletingUnit] = reactExports.useState(null);
  const [managingUnit, setManagingUnit] = reactExports.useState(null);
  const {
    data: company
  } = useQuery({
    queryKey: ["company", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("companies").select("*").eq("id", profile.company_id).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: units,
    isLoading: isLoadingUnits
  } = useQuery({
    queryKey: ["units", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("units").select("*").eq("company_id", profile.company_id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  const createUnit = useMutation({
    mutationFn: async (name) => {
      if (!profile?.company_id) throw new Error("Sem empresa");
      const {
        error
      } = await supabase.from("units").insert({
        company_id: profile.company_id,
        name,
        slug: slugify(name),
        color: newUnitColor
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade criada!");
      setNewUnitName("");
      setNewUnitColor("#6366f1");
      qc.invalidateQueries({
        queryKey: ["units"]
      });
    },
    onError: (e) => toast.error("Erro ao criar", {
      description: e.message
    })
  });
  const updateUnit = useMutation({
    mutationFn: async ({
      id,
      name,
      color
    }) => {
      const {
        error
      } = await supabase.from("units").update({
        name,
        color
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade atualizada!");
      setEditingUnit(null);
      qc.invalidateQueries({
        queryKey: ["units"]
      });
      qc.invalidateQueries({
        queryKey: ["conversations"]
      });
    },
    onError: (e) => toast.error("Erro ao atualizar", {
      description: e.message
    })
  });
  const deleteUnit = useMutation({
    mutationFn: async (id) => {
      const {
        error
      } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade excluída!");
      setDeletingUnit(null);
      qc.invalidateQueries({
        queryKey: ["units"]
      });
    },
    onError: (e) => toast.error("Não foi possível excluir", {
      description: "Esta unidade pode ter dados vinculados (ex: usuários ou instâncias)."
    })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-6 p-4 md:p-8 pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight", children: "Gestão de Unidades" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-muted-foreground mt-1", children: "Gerencie as filiais da empresa, suas conexões de WhatsApp e departamentos." })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "border-border bg-card/50 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardHeader, { className: "pb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "text-lg", children: "Adicionar Nova Unidade" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row items-end gap-3 max-w-2xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-medium text-muted-foreground uppercase tracking-wider", children: "Identificação Visual e Nome" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative group", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "color", className: "w-10 h-10 p-0 border-0 rounded-md cursor-pointer overflow-hidden shadow-sm", value: newUnitColor, onChange: (e) => setNewUnitColor(e.target.value), title: "Cor de identificação da unidade" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 ring-1 ring-inset ring-black/10 rounded-md pointer-events-none" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Nome da filial (ex: Clínica Centro)", value: newUnitName, onChange: (e) => setNewUnitName(e.target.value), className: "flex-1 h-10 shadow-sm" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createUnit.mutate(newUnitName), disabled: !newUnitName || createUnit.isPending, className: "h-10 px-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
          "Criar Unidade"
        ] })
      ] }) })
    ] }),
    isLoadingUnits ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center p-12 text-sm text-muted-foreground", children: "Carregando unidades..." }) : units?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3", children: units.map((unit) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "overflow-hidden flex flex-col group transition-all hover:shadow-md border-border/60", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full", style: {
        backgroundColor: unit.color || "#6366f1"
      } }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { className: "pb-3 flex flex-row justify-between items-start", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { className: "flex items-center gap-2 text-xl", children: unit.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { className: "font-mono text-xs mt-1", children: unit.slug })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "-mr-2 -mt-2 h-8 w-8 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EllipsisVertical, { className: "h-4 w-4" }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuContent, { align: "end", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuItem, { onClick: () => {
              setEditingUnit(unit);
              setEditUnitName(unit.name);
              setEditUnitColor(unit.color || "#6366f1");
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Pen, { className: "mr-2 h-4 w-4" }),
              "Editar Unidade"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuItem, { className: "text-destructive focus:text-destructive focus:bg-destructive/10", onClick: () => setDeletingUnit(unit), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "mr-2 h-4 w-4" }),
              "Excluir"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { className: "pb-4 flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-4 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Instâncias" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Departamentos" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardFooter, { className: "pt-0 border-t border-border/40 mt-auto bg-muted/10 px-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", className: "w-full rounded-none h-12 justify-between px-6 hover:bg-muted/30", onClick: () => setManagingUnit(unit), children: [
        "Gerenciar Estrutura",
        /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground" })
      ] }) })
    ] }, unit.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-dashed p-12 text-center text-muted-foreground bg-card/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Store, { className: "h-10 w-10 mx-auto mb-3 opacity-20" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-medium text-foreground", children: "Nenhuma unidade cadastrada" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Crie sua primeira unidade acima para começar a configurar instâncias de WhatsApp." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: !!editingUnit, onOpenChange: (v) => !v && setEditingUnit(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Editar Unidade" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(DialogDescription, { children: "Atualize o nome e a cor de identificação da unidade." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nome" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: editUnitName, onChange: (e) => setEditUnitName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Cor de Identificação" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "color", className: "w-10 h-10 p-0 border-0 rounded-md cursor-pointer overflow-hidden shadow-sm", value: editUnitColor, onChange: (e) => setEditUnitColor(e.target.value) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 ring-1 ring-inset ring-black/10 rounded-md pointer-events-none" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-muted-foreground", children: editUnitColor })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setEditingUnit(null), children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: () => updateUnit.mutate({
          id: editingUnit.id,
          name: editUnitName,
          color: editUnitColor
        }), disabled: updateUnit.isPending || !editUnitName, children: "Salvar Alterações" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deletingUnit, onOpenChange: (v) => !v && setDeletingUnit(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Excluir Unidade?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          "Tem certeza que deseja excluir a unidade ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deletingUnit?.name }),
          "? Essa ação não pode ser desfeita e falhará se existirem usuários vinculados a ela."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: () => deleteUnit.mutate(deletingUnit.id), className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: "Sim, Excluir" })
      ] })
    ] }) }),
    managingUnit && company && /* @__PURE__ */ jsxRuntimeExports.jsx(UnitManagementSheet, { open: !!managingUnit, onOpenChange: (v) => !v && setManagingUnit(null), unit: managingUnit, company })
  ] });
}
function UnitManagementSheet({
  open,
  onOpenChange,
  unit,
  company
}) {
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = reactExports.useState("");
  const [deptName, setDeptName] = reactExports.useState("");
  const [confirmDialog, setConfirmDialog] = reactExports.useState({
    open: false,
    type: null,
    instance: null,
    dept: null
  });
  const [qrModalOpen, setQrModalOpen] = reactExports.useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = reactExports.useState(false);
  const [selectedInstance, setSelectedInstance] = reactExports.useState(null);
  const {
    data: instances,
    isLoading: isLoadingInstances
  } = useQuery({
    queryKey: ["whatsapp-instances", unit.id],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("whatsapp_instances").select("*").eq("unit_id", unit.id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  const {
    data: departments,
    isLoading: isLoadingDepts
  } = useQuery({
    queryKey: ["departments", unit.id],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("departments").select("*").eq("unit_id", unit.id).order("created_at", {
        ascending: true
      });
      if (error) throw error;
      return data;
    }
  });
  const createInstance = useMutation({
    mutationFn: async (name) => {
      if (!company?.evogo_host || !company?.evogo_global_token) throw new Error("Configure Host e Token na Empresa Mãe primeiro.");
      const technicalName = `${slugify(company.name)}-${slugify(unit.name)}-${slugify(name)}`;
      const {
        data,
        error
      } = await supabase.from("whatsapp_instances").insert({
        company_id: company.id,
        unit_id: unit.id,
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
          const webhookUrl = `${"https://qmkqjkzrsszzytrmdxzc.supabase.co"}/functions/v1/evogo-webhook`;
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
      toast.success("Instância criada!");
      setInstanceName("");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances", unit.id]
      });
    },
    onError: (e) => toast.error("Erro", {
      description: e.message
    })
  });
  const handleDisconnect = async (instance) => {
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
        queryKey: ["whatsapp-instances", unit.id]
      });
    } catch (e) {
      toast.error("Erro ao desconectar", {
        description: e.message
      });
    } finally {
      setConfirmDialog({
        open: false,
        type: null,
        instance: null,
        dept: null
      });
    }
  };
  const handleDelete = async (instance) => {
    try {
      if (instance.evogo_instance_id) {
        const client = new EvoGoClient({
          host: company.evogo_host,
          token: company.evogo_global_token
        });
        await client.deleteInstance(instance.evogo_instance_id);
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success("Instância deletada.");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances", unit.id]
      });
    } catch (e) {
      toast.error("Erro ao deletar", {
        description: e.message
      });
    } finally {
      setConfirmDialog({
        open: false,
        type: null,
        instance: null,
        dept: null
      });
    }
  };
  const createDept = useMutation({
    mutationFn: async (name) => {
      const {
        error
      } = await supabase.from("departments").insert({
        company_id: company.id,
        unit_id: unit.id,
        name
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento criado!");
      setDeptName("");
      qc.invalidateQueries({
        queryKey: ["departments", unit.id]
      });
    },
    onError: (e) => toast.error("Erro ao criar departamento", {
      description: e.message
    })
  });
  const handleDeleteDept = async (dept) => {
    try {
      await supabase.from("departments").delete().eq("id", dept.id);
      toast.success("Departamento excluído.");
      qc.invalidateQueries({
        queryKey: ["departments", unit.id]
      });
    } catch (e) {
      toast.error("Erro ao deletar", {
        description: e.message
      });
    } finally {
      setConfirmDialog({
        open: false,
        type: null,
        instance: null,
        dept: null
      });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Sheet, { open, onOpenChange, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(SheetContent, { className: "sm:max-w-[600px] w-full overflow-y-auto p-0 flex flex-col h-full bg-background", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 w-full shrink-0", style: {
      backgroundColor: unit.color || "#6366f1"
    } }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SheetHeader, { className: "p-6 pb-2 shrink-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(SheetTitle, { className: "text-2xl flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Store, { className: "h-5 w-5 text-muted-foreground" }),
        unit.name
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SheetDescription, { children: "Gerencie instâncias de WhatsApp e os departamentos desta unidade." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { defaultValue: "instances", className: "w-full mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid w-full grid-cols-2 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "instances", className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "h-4 w-4" }),
          " Instâncias"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsTrigger, { value: "departments", className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { className: "h-4 w-4" }),
          " Departamentos"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "instances", className: "space-y-6 animate-in fade-in-50 duration-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-card border border-border rounded-lg p-4 shadow-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold mb-3", children: "Conectar Novo Aparelho" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Nome (ex: Recepção)", value: instanceName, onChange: (e) => setInstanceName(e.target.value), className: "h-9" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", className: "h-9", onClick: () => createInstance.mutate(instanceName), disabled: !instanceName || createInstance.isPending || !company?.evogo_host, children: "Criar" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold flex items-center justify-between", children: [
            "Aparelhos Conectados",
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "text-xs font-normal", children: instances?.length || 0 })
          ] }),
          isLoadingInstances ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : instances?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-3", children: instances.map((inst) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-sm", children: inst.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: inst.status === "connected" ? "default" : "secondary", className: inst.status === "connected" ? "bg-success text-[10px] py-0 h-4" : "text-[10px] py-0 h-4", children: inst.status === "connected" ? "Online" : "Aguardando" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground font-mono", children: inst.instance_name })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1.5 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity", children: [
              inst.status === "connected" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", className: "h-8 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20", onClick: () => setConfirmDialog({
                open: true,
                type: "disconnect",
                instance: inst,
                dept: null
              }), children: "Desconectar" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "default", size: "sm", className: "h-8 px-3 text-xs bg-primary hover:bg-primary/90", onClick: () => {
                setSelectedInstance(inst);
                setQrModalOpen(true);
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(QrCode, { className: "mr-1.5 h-3.5 w-3.5" }),
                " Ler QR"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "secondary", size: "icon", className: "h-8 w-8 bg-muted/50 hover:bg-muted", onClick: () => {
                setSelectedInstance(inst);
                setSettingsModalOpen(true);
              }, title: "Configurações", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-8 w-8 text-destructive hover:bg-destructive/10", onClick: () => setConfirmDialog({
                open: true,
                type: "delete",
                instance: inst,
                dept: null
              }), title: "Excluir", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) })
            ] })
          ] }, inst.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center border rounded-lg bg-card/30 border-dashed text-sm text-muted-foreground", children: "Nenhuma instância vinculada a esta unidade." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "departments", className: "space-y-6 animate-in fade-in-50 duration-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-card border border-border rounded-lg p-4 shadow-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold mb-3", children: "Novo Departamento" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Ex: Vendas, Suporte...", value: deptName, onChange: (e) => setDeptName(e.target.value), className: "h-9" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", className: "h-9", onClick: () => createDept.mutate(deptName), disabled: !deptName || createDept.isPending, children: "Criar" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold flex items-center justify-between", children: [
            "Departamentos Ativos",
            /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "text-xs font-normal", children: departments?.length || 0 })
          ] }),
          isLoadingDepts ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : departments?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: departments.map((dept) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "h-4 w-4 text-muted-foreground" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium", children: dept.name })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all", onClick: () => setConfirmDialog({
              open: true,
              type: "delete_dept",
              instance: null,
              dept
            }), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-4 w-4" }) })
          ] }, dept.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center border rounded-lg bg-card/30 border-dashed text-sm text-muted-foreground", children: "Nenhum departamento cadastrado." })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: confirmDialog.open, onOpenChange: (open2) => !open2 && setConfirmDialog({
      open: false,
      type: null,
      instance: null,
      dept: null
    }), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: confirmDialog.type === "disconnect" ? "Desconectar Aparelho?" : confirmDialog.type === "delete_dept" ? "Excluir Departamento?" : "Excluir Instância?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogDescription, { children: confirmDialog.type === "disconnect" ? `Isso irá deslogar o WhatsApp do aparelho "${confirmDialog.instance?.name}". Você precisará ler o QR Code novamente para conectar.` : confirmDialog.type === "delete_dept" ? `Tem certeza que deseja excluir o departamento "${confirmDialog.dept?.name}"? Isso pode afetar atendimentos.` : `Isso apagará permanentemente a instância "${confirmDialog.instance?.name}" e todos os seus dados não poderão ser recuperados.` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: () => {
          if (confirmDialog.type === "disconnect") handleDisconnect(confirmDialog.instance);
          else if (confirmDialog.type === "delete") handleDelete(confirmDialog.instance);
          else if (confirmDialog.type === "delete_dept") handleDeleteDept(confirmDialog.dept);
        }, className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: confirmDialog.type === "disconnect" ? "Sim, Desconectar" : "Sim, Excluir" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(QrCodeModal, { open: qrModalOpen, onOpenChange: setQrModalOpen, instance: selectedInstance, company }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(InstanceSettingsModal, { open: settingsModalOpen, onOpenChange: setSettingsModalOpen, instance: selectedInstance, company })
  ] }) });
}
export {
  UnitsPage as component
};
