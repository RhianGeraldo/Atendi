import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient, u as useQuery, b as useMutation } from "../_libs/tanstack__react-query.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent } from "./card-DQ5v2DYb.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { B as Badge } from "./dialog-DzIjWjAs.mjs";
import { u as useAuth } from "./router-D-8gqfSq.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { Q as QrCodeModal, I as InstanceSettingsModal, E as EvoGoClient, A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-CA_pk_ws.mjs";
import { R as Root2, I as Item, H as Header, T as Trigger2, C as Content2 } from "../_libs/radix-ui__react-accordion.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { m as Store, P as Plus, Q as QrCode, e as Settings, n as ChevronDown } from "../_libs/lucide-react.mjs";
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
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-collapsible.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "../_libs/tailwind-merge.mjs";
const Accordion = Root2;
const AccordionItem = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(Item, { ref, className: cn("border-b", className), ...props }));
AccordionItem.displayName = "AccordionItem";
const AccordionTrigger = reactExports.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(Header, { className: "flex", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
  Trigger2,
  {
    ref,
    className: cn(
      "flex flex-1 items-center justify-between py-4 text-sm font-medium cursor-pointer transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" })
    ]
  }
) }));
AccordionTrigger.displayName = Trigger2.displayName;
const AccordionContent = reactExports.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Content2,
  {
    ref,
    className: "overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("pb-4 pt-0", className), children })
  }
));
AccordionContent.displayName = Content2.displayName;
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function UnitsPage() {
  const {
    profile
  } = useAuth();
  const qc = useQueryClient();
  const [newUnitName, setNewUnitName] = reactExports.useState("");
  const [selectedInstance, setSelectedInstance] = reactExports.useState(null);
  const [qrModalOpen, setQrModalOpen] = reactExports.useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = reactExports.useState(false);
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
      } = await supabase.from("units").select("*").eq("company_id", profile.company_id);
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
        slug: slugify(name)
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade criada!");
      setNewUnitName("");
      qc.invalidateQueries({
        queryKey: ["units"]
      });
    },
    onError: (e) => toast.error("Erro ao criar", {
      description: e.message
    })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-4 p-4 md:p-8 pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between space-y-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight", children: "Gestão de Unidades" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "col-span-full", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Store, { className: "h-5 w-5" }),
          "Minhas Unidades / Filiais"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Gerencie as unidades da empresa. Cada unidade pode ter suas próprias conexões e departamentos." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardContent, { className: "space-y-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3 max-w-md", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Nova Unidade" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Nome da filial (ex: Clínica Centro)", value: newUnitName, onChange: (e) => setNewUnitName(e.target.value) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: () => createUnit.mutate(newUnitName), disabled: !newUnitName || createUnit.isPending, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "mr-2 h-4 w-4" }),
            "Criar"
          ] })
        ] }),
        isLoadingUnits ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground", children: "Carregando..." }) : units?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx(Accordion, { type: "single", collapsible: true, className: "w-full", children: units.map((unit) => /* @__PURE__ */ jsxRuntimeExports.jsx(UnitItem, { unit, company, onConnectInstance: (inst) => {
          setSelectedInstance(inst);
          setQrModalOpen(true);
        }, onSettingsInstance: (inst) => {
          setSelectedInstance(inst);
          setSettingsModalOpen(true);
        } }, unit.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground", children: "Nenhuma unidade cadastrada." })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(QrCodeModal, { open: qrModalOpen, onOpenChange: setQrModalOpen, instance: selectedInstance, company }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(InstanceSettingsModal, { open: settingsModalOpen, onOpenChange: setSettingsModalOpen, instance: selectedInstance, company })
  ] });
}
function UnitItem({
  unit,
  company,
  onConnectInstance,
  onSettingsInstance
}) {
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = reactExports.useState("");
  const [confirmDialog, setConfirmDialog] = reactExports.useState({
    open: false,
    type: null,
    instance: null
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
        instance: null
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
      toast.success("Instância deletada com sucesso.");
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
        instance: null
      });
    }
  };
  const {
    data: instances,
    isLoading: isLoadingInstances
  } = useQuery({
    queryKey: ["whatsapp-instances", unit.id],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("whatsapp_instances").select("*").eq("unit_id", unit.id);
      if (error) throw error;
      return data;
    }
  });
  const createInstance = useMutation({
    mutationFn: async (name) => {
      if (!company?.evogo_host || !company?.evogo_global_token) {
        throw new Error("Configure Host e Token na Empresa Mãe primeiro.");
      }
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
      toast.success("Instância da unidade criada!");
      setInstanceName("");
      qc.invalidateQueries({
        queryKey: ["whatsapp-instances", unit.id]
      });
    },
    onError: (e) => toast.error("Erro ao criar", {
      description: e.message
    })
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(AccordionItem, { value: unit.id, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(AccordionTrigger, { className: "hover:no-underline", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Store, { className: "h-4 w-4 text-muted-foreground" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: unit.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "outline", className: "ml-2 font-mono text-[10px] font-normal", children: unit.slug })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AccordionContent, { className: "pt-4 pb-6 border-t", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pl-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3 max-w-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-medium text-muted-foreground uppercase tracking-wider", children: "Nova Instância de WhatsApp" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { size: 1, placeholder: "Nome (ex: Recepção)", value: instanceName, onChange: (e) => setInstanceName(e.target.value), className: "h-8 text-sm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { size: "sm", onClick: () => createInstance.mutate(instanceName), disabled: !instanceName || createInstance.isPending || !company?.evogo_host, children: "Criar" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: isLoadingInstances ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Carregando instâncias..." }) : instances?.length ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-3 md:grid-cols-2", children: instances.map((inst) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-md border p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium", children: inst.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground font-mono truncate max-w-[150px]", children: inst.instance_name })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          inst.status === "connected" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", className: "h-7 px-2 text-xs text-destructive hover:bg-destructive/10", onClick: () => setConfirmDialog({
            open: true,
            type: "disconnect",
            instance: inst
          }), children: "Desconectar" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-7 px-2 text-xs", onClick: () => onConnectInstance(inst), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(QrCode, { className: "mr-1.5 h-3 w-3" }),
            "Conectar"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7", onClick: () => onSettingsInstance(inst), title: "Configurações", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "h-4 w-4 text-muted-foreground" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10", onClick: () => setConfirmDialog({
            open: true,
            type: "delete",
            instance: inst
          }), title: "Deletar", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 6h18" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "14", x2: "14", y1: "11", y2: "17" })
          ] }) })
        ] })
      ] }, inst.id)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-muted-foreground italic", children: "Nenhuma instância nesta unidade." }) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: confirmDialog.open, onOpenChange: (open) => !open && setConfirmDialog({
      open: false,
      type: null,
      instance: null
    }), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: confirmDialog.type === "disconnect" ? "Desconectar Aparelho?" : "Deletar Instância?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogDescription, { children: confirmDialog.type === "disconnect" ? `Isso irá deslogar o WhatsApp do aparelho "${confirmDialog.instance?.name}". Você precisará ler o QR Code novamente para conectar.` : `Isso apagará permanentemente a instância "${confirmDialog.instance?.name}" e todos os seus dados não poderão ser recuperados.` })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancelar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: () => {
          if (confirmDialog.type === "disconnect") handleDisconnect(confirmDialog.instance);
          else if (confirmDialog.type === "delete") handleDelete(confirmDialog.instance);
        }, className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: confirmDialog.type === "disconnect" ? "Sim, Desconectar" : "Sim, Deletar" })
      ] })
    ] }) })
  ] });
}
export {
  UnitsPage as component
};
