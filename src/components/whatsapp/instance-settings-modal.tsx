import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings, Loader2, Save, Globe } from "lucide-react";
import { toast } from "sonner";
import { EvoGoClient } from "@/integrations/evogo/client";
import { supabase } from "@/integrations/supabase/client";

interface InstanceSettingsModalProps {
  instance: any; // { id, name, instance_name, evogo_api_key, evogo_instance_id, webhook_url }
  company: any; // { evogo_host, evogo_global_token }
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstanceSettingsModal({ instance, company, open, onOpenChange }: InstanceSettingsModalProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [webhookUrl, setWebhookUrl] = useState("");
  const [advSettings, setAdvSettings] = useState({
    rejectCalls: false,
    readMessages: false,
    readStatus: false,
    alwaysOnline: false
  });

  useEffect(() => {
    if (!open || !instance || !company?.evogo_host) return;

    let defaultWebhook = instance.webhook_url;
    const currentDomainWebhook = `${window.location.origin}/api/evogo/webhook`;
    
    // Se estiver vazio, for do supabase antigo, ou for de um domínio antigo diferente do atual, atualiza pra origem atual
    if (!defaultWebhook || defaultWebhook.includes('supabase.co') || !defaultWebhook.startsWith(window.location.origin)) {
      defaultWebhook = currentDomainWebhook;
    }

    setWebhookUrl(defaultWebhook);
    
    // Fetch advanced settings from EvoGo
    const fetchSettings = async () => {
      setLoading(true);
      try {
        if (!instance.evogo_instance_id) {
          throw new Error("Instância local sem ID do EvoGo vinculado.");
        }

        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        const res: any = await client.getAdvancedSettings(instance.evogo_instance_id, instance.evogo_api_key);
        
        if (res) {
          setAdvSettings({
            rejectCalls: res.rejectCall ?? false,
            readMessages: res.readMessages ?? false,
            readStatus: res.readStatus ?? false,
            alwaysOnline: res.alwaysOnline ?? false
          });
        }
      } catch (err: any) {
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
      // 1. Save Webhook
      if (webhookUrl !== instance.webhook_url) {
        await client.connectInstance(webhookUrl, instance.evogo_api_key);
        await supabase
          .from("whatsapp_instances")
          .update({ webhook_url: webhookUrl })
          .eq("id", instance.id);
      }

      // 2. Save Advanced Settings
      if (instance.evogo_instance_id) {
        await client.updateAdvancedSettings(instance.evogo_instance_id, advSettings, instance.evogo_api_key);
      }

      toast.success("Configurações salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações da Instância
          </DialogTitle>
          <DialogDescription>
            {instance?.name} <span className="font-mono text-xs">({instance?.instance_name})</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">Carregando configurações...</p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Webhook e Eventos</h4>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">URL do Webhook</label>
                <Input 
                  placeholder="https://sua-api.com/webhook" 
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-1">Opções Avançadas</h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Rejeitar Ligações</label>
                  <p className="text-xs text-muted-foreground">Recusa chamadas de voz e vídeo automaticamente.</p>
                </div>
                <Switch 
                  checked={advSettings.rejectCalls}
                  onCheckedChange={(c) => setAdvSettings(s => ({ ...s, rejectCalls: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Marcar como Lido</label>
                  <p className="text-xs text-muted-foreground">Marca mensagens como lidas ao receber.</p>
                </div>
                <Switch 
                  checked={advSettings.readMessages}
                  onCheckedChange={(c) => setAdvSettings(s => ({ ...s, readMessages: c }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Always Online</label>
                  <p className="text-xs text-muted-foreground">Força o status "Online" no WhatsApp.</p>
                </div>
                <Switch 
                  checked={advSettings.alwaysOnline}
                  onCheckedChange={(c) => setAdvSettings(s => ({ ...s, alwaysOnline: c }))}
                />
              </div>
            </div>

            <Button 
              className="w-full mt-4" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Configurações
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
