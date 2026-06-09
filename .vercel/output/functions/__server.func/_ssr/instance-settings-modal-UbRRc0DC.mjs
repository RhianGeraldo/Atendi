import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { a as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogDescription } from "./tabs-DaV-6sV-.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { S as Switch$1, a as SwitchThumb } from "../_libs/radix-ui__react-switch.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { l as Smartphone, H as LoaderCircle, I as CircleCheck, e as Settings, J as Globe, w as Save } from "../_libs/lucide-react.mjs";
class EvoGoClient {
  host;
  token;
  constructor(config) {
    this.host = config?.host || void 0 || "";
    this.token = config?.token || void 0 || "";
  }
  async request(endpoint, options = {}, customApiKey) {
    const url = `${this.host}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "apikey": customApiKey || this.token,
      ...options.headers
    };
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EvoGo API Error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }
  // --- Instances ---
  async createInstance(name, instanceToken, instanceId) {
    return this.request("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        name,
        instanceId,
        // opcional
        token: instanceToken
        // O token individual gerado para a instância
      })
    });
  }
  async getAllInstances() {
    return this.request("/instance/all");
  }
  async connectInstance(webhookUrl, instanceToken) {
    return this.request("/instance/connect", {
      method: "POST",
      body: JSON.stringify({
        subscribe: ["ALL"],
        ...webhookUrl && { webhookUrl }
      })
    }, instanceToken);
  }
  async getQrCode(instanceToken) {
    return this.request("/instance/qr", {}, instanceToken);
  }
  async getInstanceStatus(instanceToken) {
    return this.request("/instance/status", {}, instanceToken);
  }
  async logoutInstance(instanceToken) {
    return this.request("/instance/logout", { method: "DELETE" }, instanceToken);
  }
  async deleteInstance(instanceId) {
    return this.request(`/instance/delete/${instanceId}`, { method: "DELETE" });
  }
  // --- Advanced Settings ---
  async getAdvancedSettings(instanceId, instanceToken) {
    return this.request(`/instance/${instanceId}/advanced-settings`, {
      headers: {
        "apikey": instanceToken
      }
    });
  }
  async updateAdvancedSettings(instanceId, settings, instanceToken) {
    return this.request(`/instance/${instanceId}/advanced-settings`, {
      method: "PUT",
      headers: {
        "apikey": instanceToken
      },
      body: JSON.stringify(settings)
    });
  }
  // --- Messaging & Chat ---
  async fetchProfilePictureUrl(number, instanceToken) {
    try {
      const result = await this.request("/user/avatar", {
        method: "POST",
        body: JSON.stringify({ number, preview: false })
      }, instanceToken);
      return result?.url || result?.profilePictureUrl || null;
    } catch (e) {
      console.warn("Failed to fetch profile picture for", number, e);
      return null;
    }
  }
  // --- Labels ---
  async getLabels(instanceToken) {
    try {
      const result = await this.request("/label/list", {
        method: "GET"
      }, instanceToken);
      return result || [];
    } catch (e) {
      console.warn("Failed to fetch labels", e);
      return [];
    }
  }
  async addLabelToContact(number, labelId, instanceToken) {
    return this.request("/label/chat", {
      method: "POST",
      body: JSON.stringify({ jid: `${number}@s.whatsapp.net`, labelId })
    }, instanceToken);
  }
  async removeLabelFromContact(number, labelId, instanceToken) {
    return this.request("/unlabel/chat", {
      method: "POST",
      body: JSON.stringify({ jid: `${number}@s.whatsapp.net`, labelId })
    }, instanceToken);
  }
  async sendText(number, text, instanceToken, delay = 1e3, quoted) {
    return this.request("/send/text", {
      method: "POST",
      body: JSON.stringify({
        number,
        text,
        delay,
        ...quoted && { quoted }
      })
    }, instanceToken);
  }
  async sendMedia(number, url, caption, filename, instanceToken, type = "document", delay = 1e3, quoted) {
    return this.request("/send/media", {
      method: "POST",
      body: JSON.stringify({
        number,
        url,
        caption,
        filename,
        type,
        delay,
        ...quoted && { quoted }
      })
    }, instanceToken);
  }
}
new EvoGoClient();
function QrCodeModal({ instance, company, open, onOpenChange, onSuccess }) {
  const qc = useQueryClient();
  const [qrCodeUrl, setQrCodeUrl] = reactExports.useState(null);
  const [status, setStatus] = reactExports.useState("loading");
  reactExports.useEffect(() => {
    if (!open || !instance || !company?.evogo_host) return;
    setStatus("loading");
    setQrCodeUrl(null);
    const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
    let isPolling = true;
    const poll = async () => {
      if (!isPolling) return;
      try {
        const res = await client.getQrCode(instance.evogo_api_key);
        const isConnected = res.connected || res.data?.connected;
        if (isConnected) {
          await handleConnected();
          return;
        }
        const qr = res.qrcode || res.data?.qrcode || res.data?.Qrcode;
        if (qr) {
          setStatus("qr");
          if (qr.startsWith("data:image/")) {
            setQrCodeUrl(qr);
          } else {
            setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qr)}`);
          }
        }
      } catch (err) {
        const msg = err.message || "";
        if (msg.includes("already logged in")) {
          await handleConnected();
          return;
        }
        if (msg.includes("no QR code available") || msg.includes("QR code not generated")) ;
        else {
          console.error("Erro ao obter QR Code:", msg);
        }
      }
      if (isPolling) {
        setTimeout(poll, 3e3);
      }
    };
    const handleConnected = async () => {
      isPolling = false;
      setStatus("connected");
      try {
        await supabase.from("whatsapp_instances").update({ status: "connected" }).eq("id", instance.id);
        toast.success("WhatsApp conectado com sucesso!");
        qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
        if (onSuccess) onSuccess();
        setTimeout(() => onOpenChange(false), 2e3);
      } catch (e) {
        console.error("Erro ao salvar status no banco", e);
      }
    };
    poll();
    return () => {
      isPolling = false;
    };
  }, [open, instance, company]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-md", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "h-5 w-5 text-primary" }),
        "Conectar WhatsApp"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogDescription, { children: [
        "Escaneie o QR Code para vincular o WhatsApp à instância ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "font-mono", children: instance?.instance_name }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center p-6 min-h-[300px]", children: [
      status === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4 text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-10 w-10 animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Aguardando QR Code do EvoGo..." })
      ] }),
      status === "qr" && qrCodeUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white p-4 rounded-xl shadow-sm border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: qrCodeUrl, alt: "QR Code WhatsApp", className: "w-[240px] h-[240px]" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-sidebar-accent/50 text-sm text-sidebar-foreground p-4 rounded-lg w-full space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: "Como conectar:" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ol", { className: "list-decimal list-inside space-y-1 text-xs opacity-80", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Abra o WhatsApp no seu celular" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "Toque em ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Aparelhos conectados" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "Toque em ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Conectar um aparelho" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Aponte seu celular para esta tela" })
          ] })
        ] })
      ] }),
      status === "connected" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4 text-success", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-16 w-16" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: "Aparelho conectado!" })
      ] })
    ] })
  ] }) });
}
const Switch = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Switch$1,
  {
    className: cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    ),
    ...props,
    ref,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SwitchThumb,
      {
        className: cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        )
      }
    )
  }
));
Switch.displayName = Switch$1.displayName;
function InstanceSettingsModal({ instance, company, open, onOpenChange }) {
  const qc = useQueryClient();
  const [loading, setLoading] = reactExports.useState(true);
  const [saving, setSaving] = reactExports.useState(false);
  const [webhookUrl, setWebhookUrl] = reactExports.useState("");
  const [advSettings, setAdvSettings] = reactExports.useState({
    rejectCalls: false,
    readMessages: false,
    readStatus: false,
    alwaysOnline: false
  });
  reactExports.useEffect(() => {
    if (!open || !instance || !company?.evogo_host) return;
    let defaultWebhook = instance.webhook_url;
    const currentDomainWebhook = `${window.location.origin}/api/evogo/webhook`;
    if (!defaultWebhook || defaultWebhook.includes("supabase.co") || !defaultWebhook.startsWith(window.location.origin)) {
      defaultWebhook = currentDomainWebhook;
    }
    setWebhookUrl(defaultWebhook);
    const fetchSettings = async () => {
      setLoading(true);
      try {
        if (!instance.evogo_instance_id) {
          throw new Error("Instância local sem ID do EvoGo vinculado.");
        }
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        const res = await client.getAdvancedSettings(instance.evogo_instance_id, instance.evogo_api_key);
        if (res) {
          setAdvSettings({
            rejectCalls: res.rejectCall ?? false,
            readMessages: res.readMessages ?? false,
            readStatus: res.readStatus ?? false,
            alwaysOnline: res.alwaysOnline ?? false
          });
        }
      } catch (err) {
        console.error("Erro ao buscar configs avançadas:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [open, instance, company]);
  const handleSave = async () => {
    if (!company?.evogo_host || !instance) return;
    setSaving(true);
    const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
    try {
      if (webhookUrl !== instance.webhook_url) {
        await client.connectInstance(webhookUrl, instance.evogo_api_key);
        await supabase.from("whatsapp_instances").update({ webhook_url: webhookUrl }).eq("id", instance.id);
      }
      if (instance.evogo_instance_id) {
        await client.updateAdvancedSettings(instance.evogo_instance_id, advSettings, instance.evogo_api_key);
      }
      toast.success("Configurações salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogHeader, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "h-5 w-5 text-primary" }),
        "Configurações da Instância"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogDescription, { children: [
        instance?.name,
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-xs", children: [
          "(",
          instance?.instance_name,
          ")"
        ] })
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center p-8 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-8 w-8 animate-spin mb-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Carregando configurações..." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Globe, { className: "h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-medium", children: "Webhook e Eventos" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-muted-foreground", children: "URL do Webhook" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              placeholder: "https://sua-api.com/webhook",
              value: webhookUrl,
              onChange: (e) => setWebhookUrl(e.target.value)
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-medium border-b pb-1", children: "Opções Avançadas" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-0.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Rejeitar Ligações" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Recusa chamadas de voz e vídeo automaticamente." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: advSettings.rejectCalls,
              onCheckedChange: (c) => setAdvSettings((s) => ({ ...s, rejectCalls: c }))
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-0.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Marcar como Lido" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Marca mensagens como lidas ao receber." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: advSettings.readMessages,
              onCheckedChange: (c) => setAdvSettings((s) => ({ ...s, readMessages: c }))
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-0.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium", children: "Always Online" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: 'Força o status "Online" no WhatsApp.' })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: advSettings.alwaysOnline,
              onCheckedChange: (c) => setAdvSettings((s) => ({ ...s, alwaysOnline: c }))
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        Button,
        {
          className: "w-full mt-4",
          onClick: handleSave,
          disabled: saving,
          children: [
            saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "mr-2 h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "mr-2 h-4 w-4" }),
            "Salvar Configurações"
          ]
        }
      )
    ] })
  ] }) });
}
export {
  EvoGoClient as E,
  InstanceSettingsModal as I,
  QrCodeModal as Q,
  Switch as S
};
