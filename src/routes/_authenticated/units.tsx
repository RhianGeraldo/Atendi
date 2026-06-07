import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Store, Smartphone, Settings, QrCode } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { EvoGoClient } from "@/integrations/evogo/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { QrCodeModal } from "@/components/whatsapp/qr-code-modal";
import { InstanceSettingsModal } from "@/components/whatsapp/instance-settings-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/units")({
  component: UnitsPage,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function UnitsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [newUnitName, setNewUnitName] = useState("");
  
  // QrCode Modal State
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const { data: company } = useQuery({
    queryKey: ["company", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", profile!.company_id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: units, isLoading: isLoadingUnits } = useQuery({
    queryKey: ["units", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data;
    },
  });

  const createUnit = useMutation({
    mutationFn: async (name: string) => {
      if (!profile?.company_id) throw new Error("Sem empresa");
      const { error } = await supabase.from("units").insert({
        company_id: profile.company_id,
        name,
        slug: slugify(name),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade criada!");
      setNewUnitName("");
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestão de Unidades</h2>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Create Unit Card */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Minhas Unidades / Filiais
            </CardTitle>
            <CardDescription>
              Gerencie as unidades da empresa. Cada unidade pode ter suas próprias conexões e departamentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-end gap-3 max-w-md">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Nova Unidade</label>
                <Input 
                  placeholder="Nome da filial (ex: Clínica Centro)" 
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                />
              </div>
              <Button 
                onClick={() => createUnit.mutate(newUnitName)}
                disabled={!newUnitName || createUnit.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar
              </Button>
            </div>

            {isLoadingUnits ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : units?.length ? (
              <Accordion type="single" collapsible className="w-full">
                {units.map((unit) => (
                  <UnitItem 
                    key={unit.id} 
                    unit={unit} 
                    company={company} 
                    onConnectInstance={(inst) => {
                      setSelectedInstance(inst);
                      setQrModalOpen(true);
                    }}
                    onSettingsInstance={(inst) => {
                      setSelectedInstance(inst);
                      setSettingsModalOpen(true);
                    }}
                  />
                ))}
              </Accordion>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma unidade cadastrada.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <QrCodeModal 
        open={qrModalOpen} 
        onOpenChange={setQrModalOpen} 
        instance={selectedInstance} 
        company={company} 
      />
      <InstanceSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        instance={selectedInstance}
        company={company}
      />
    </div>
  );
}

function UnitItem({ unit, company, onConnectInstance, onSettingsInstance }: { unit: any, company: any, onConnectInstance: (inst: any) => void, onSettingsInstance: (inst: any) => void }) {
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean, type: 'disconnect' | 'delete' | null, instance: any }>({ open: false, type: null, instance: null });

  const handleDisconnect = async (instance: any) => {
    try {
      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      await client.logoutInstance(instance.evogo_api_key);
      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instance.id);
      toast.success("Aparelho desconectado.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    } catch (e: any) {
      toast.error("Erro ao desconectar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null, instance: null });
    }
  };

  const handleDelete = async (instance: any) => {
    try {
      if (instance.evogo_instance_id) {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.deleteInstance(instance.evogo_instance_id);
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success("Instância deletada com sucesso.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    } catch (e: any) {
      toast.error("Erro ao deletar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null, instance: null });
    }
  };

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ["whatsapp-instances", unit.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("unit_id", unit.id);
      if (error) throw error;
      return data;
    },
  });

  const createInstance = useMutation({
    mutationFn: async (name: string) => {
      if (!company?.evogo_host || !company?.evogo_global_token) {
        throw new Error("Configure Host e Token na Empresa Mãe primeiro.");
      }
      
      const technicalName = `${slugify(company.name)}-${slugify(unit.name)}-${slugify(name)}`;

      const { data, error } = await supabase.from("whatsapp_instances").insert({
        company_id: company.id,
        unit_id: unit.id,
        name,
        instance_name: technicalName,
      }).select().single();
      
      if (error) throw error;

      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      try {
        const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
        const evogoId = evoRes?.data?.id || evoRes?.id;

        if (evogoId) {
          // Salva no banco local
          const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evogo-webhook`;
          
          await supabase.from("whatsapp_instances").update({
            evogo_instance_id: evogoId,
            webhook_url: webhookUrl
          }).eq("id", data.id);

          // Configura Webhook no EvoGo (usa o token da instância)
          await client.connectInstance(webhookUrl, data.evogo_api_key).catch(console.error);

          // Configura Advanced Settings no EvoGo (usa o token da instância)
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
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  return (
    <AccordionItem value={unit.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{unit.name}</span>
          <Badge variant="outline" className="ml-2 font-mono text-[10px] font-normal">{unit.slug}</Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-4 pb-6 border-t">
        <div className="pl-6 space-y-6">
          <div className="flex items-end gap-3 max-w-sm">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova Instância de WhatsApp</label>
              <Input 
                size={1}
                placeholder="Nome (ex: Recepção)" 
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button 
              size="sm"
              onClick={() => createInstance.mutate(instanceName)}
              disabled={!instanceName || createInstance.isPending || !company?.evogo_host}
            >
              Criar
            </Button>
          </div>

          <div className="space-y-3">
            {isLoadingInstances ? (
              <div className="text-xs text-muted-foreground">Carregando instâncias...</div>
            ) : instances?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {instances.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{inst.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">{inst.instance_name}</p>
                    </div>
                    <div className="flex gap-2">
                      {inst.status === 'connected' ? (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10" onClick={() => setConfirmDialog({ open: true, type: 'disconnect', instance: inst })}>
                          Desconectar
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onConnectInstance(inst)}>
                          <QrCode className="mr-1.5 h-3 w-3" />
                          Conectar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSettingsInstance(inst)} title="Configurações">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDialog({ open: true, type: 'delete', instance: inst })} title="Deletar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Nenhuma instância nesta unidade.</div>
            )}
          </div>
        </div>
      </AccordionContent>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null, instance: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'disconnect' ? "Desconectar Aparelho?" : "Deletar Instância?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'disconnect' 
                ? `Isso irá deslogar o WhatsApp do aparelho "${confirmDialog.instance?.name}". Você precisará ler o QR Code novamente para conectar.`
                : `Isso apagará permanentemente a instância "${confirmDialog.instance?.name}" e todos os seus dados não poderão ser recuperados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (confirmDialog.type === 'disconnect') handleDisconnect(confirmDialog.instance);
                else if (confirmDialog.type === 'delete') handleDelete(confirmDialog.instance);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmDialog.type === 'disconnect' ? "Sim, Desconectar" : "Sim, Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccordionItem>
  );
}
