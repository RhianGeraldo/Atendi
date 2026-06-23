import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Store, Smartphone, Settings, QrCode, Trash2, Users, MoreVertical, Edit2, ChevronRight, Layers, RefreshCw, Loader2, Globe } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { EvoGoClient } from "@/integrations/evogo/client";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/units")({
  component: UnitsPage,
});

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function UnitsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  
  // Create state
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitColor, setNewUnitColor] = useState("#6366f1");

  // Edit Unit state
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editUnitName, setEditUnitName] = useState("");
  const [editUnitColor, setEditUnitColor] = useState("");
  const [editUnitDocument, setEditUnitDocument] = useState("");
  const [editUnitAddress, setEditUnitAddress] = useState("");
  const [editUnitBusinessHours, setEditUnitBusinessHours] = useState("");
  const [editUnitCustomVars, setEditUnitCustomVars] = useState<{key: string, value: string}[]>([]);

  // Delete state
  const [deletingUnit, setDeletingUnit] = useState<any>(null);

  // Management Sheet State
  const [managingUnit, setManagingUnit] = useState<any>(null);

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
      const { data, error } = await supabase.from("units").select("*").eq("company_id", profile!.company_id!).order("created_at", { ascending: true });
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
        color: newUnitColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade criada!");
      setNewUnitName("");
      setNewUnitColor("#6366f1");
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  const updateUnit = useMutation({
    mutationFn: async ({ id, name, color, document, address, business_hours, custom_variables }: any) => {
      const { error } = await supabase.from("units").update({ 
        name, color, document, address, business_hours, custom_variables 
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade atualizada!");
      setEditingUnit(null);
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["conversations"] }); // invalidate conversations to show new colors
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: (e as Error).message })
  });

  const deleteUnit = useMutation({
    mutationFn: async (id: string) => {
      // O Supabase vai dar erro de chave estrangeira se houver departamentos/instâncias vinculadas e não tiver ON DELETE CASCADE
      // Mas assumindo que estamos fazendo soft delete ou temos permissão:
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade excluída!");
      setDeletingUnit(null);
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e) => toast.error("Não foi possível excluir", { description: "Esta unidade pode ter dados vinculados (ex: usuários ou instâncias)." })
  });

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestão de Unidades</h2>
          <p className="text-muted-foreground mt-1">Gerencie as filiais da empresa, suas conexões de WhatsApp e departamentos.</p>
        </div>
      </div>
      
      {/* Create Section */}
      <Card className="border-border bg-card/50 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Adicionar Nova Unidade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-3 max-w-2xl">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Identificação Visual e Nome</label>
              <div className="flex gap-2">
                <div className="relative group">
                  <Input 
                    type="color"
                    className="w-10 h-10 p-0 border-0 rounded-md cursor-pointer overflow-hidden shadow-sm"
                    value={newUnitColor}
                    onChange={(e) => setNewUnitColor(e.target.value)}
                    title="Cor de identificação da unidade"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-md pointer-events-none" />
                </div>
                <Input 
                  placeholder="Nome da filial (ex: Clínica Centro)" 
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="flex-1 h-10 shadow-sm"
                />
              </div>
            </div>
            <Button 
              onClick={() => createUnit.mutate(newUnitName)}
              disabled={!newUnitName || createUnit.isPending}
              className="h-10 px-6"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar Unidade
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid of Units */}
      {isLoadingUnits ? (
        <div className="flex justify-center p-12 text-sm text-muted-foreground">Carregando unidades...</div>
      ) : units?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <Card key={unit.id} className="overflow-hidden flex flex-col group transition-all hover:shadow-md border-border/60">
              <div className="h-1.5 w-full" style={{ backgroundColor: unit.color || '#6366f1' }} />
              <CardHeader className="pb-3 flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    {unit.name}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs mt-1">
                    {unit.slug}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setEditingUnit(unit);
                      setEditUnitName(unit.name);
                      setEditUnitColor(unit.color || '#6366f1');
                      setEditUnitDocument(unit.document || "");
                      setEditUnitAddress(unit.address || "");
                      setEditUnitBusinessHours(unit.business_hours || "");
                      
                      const vars = unit.custom_variables as Record<string, string>;
                      if (vars && typeof vars === 'object') {
                        setEditUnitCustomVars(Object.entries(vars).map(([k, v]) => ({ key: k, value: v as string })));
                      } else {
                        setEditUnitCustomVars([]);
                      }
                    }}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      Editar Unidade
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setDeletingUnit(unit)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="pb-4 flex-1">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md">
                    <Smartphone className="h-4 w-4" />
                    <span>Instâncias</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md">
                    <Users className="h-4 w-4" />
                    <span>Departamentos</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 border-t border-border/40 mt-auto bg-muted/10 px-0">
                <Button variant="ghost" className="w-full rounded-none h-12 justify-between px-6 hover:bg-muted/30" onClick={() => setManagingUnit(unit)}>
                  Gerenciar Estrutura
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground bg-card/30">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma unidade cadastrada</h3>
          <p className="text-sm mt-1">Crie sua primeira unidade acima para começar a configurar instâncias de WhatsApp.</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingUnit} onOpenChange={(v) => !v && setEditingUnit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Unidade</DialogTitle>
            <DialogDescription>Atualize o nome e a cor de identificação da unidade.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor de Identificação</label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Input type="color" className="w-10 h-10 p-0 border-0 rounded-md cursor-pointer overflow-hidden shadow-sm" value={editUnitColor} onChange={(e) => setEditUnitColor(e.target.value)} />
                  <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-md pointer-events-none" />
                </div>
                <span className="text-sm font-mono text-muted-foreground">{editUnitColor}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Documento (CNPJ/CPF)</label>
              <Input value={editUnitDocument} onChange={(e) => setEditUnitDocument(e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Endereço</label>
              <Input value={editUnitAddress} onChange={(e) => setEditUnitAddress(e.target.value)} placeholder="Av. Exemplo, 123" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Horário de Funcionamento</label>
              <Input value={editUnitBusinessHours} onChange={(e) => setEditUnitBusinessHours(e.target.value)} placeholder="Seg a Sex: 08h as 18h" />
            </div>
            <div className="pt-2 border-t mt-2">
              <label className="text-sm font-medium mb-2 block">Variáveis Personalizadas</label>
              <p className="text-xs text-muted-foreground mb-3">
                Sobrescreve as variáveis da empresa matriz quando a IA atender nesta unidade.
              </p>
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {editUnitCustomVars.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="chave" className="w-1/3 text-xs h-8" value={v.key} onChange={(e) => {
                      const newVars = [...editUnitCustomVars];
                      newVars[i].key = e.target.value;
                      setEditUnitCustomVars(newVars);
                    }}/>
                    <Input placeholder="valor" className="flex-1 text-xs h-8" value={v.value} onChange={(e) => {
                      const newVars = [...editUnitCustomVars];
                      newVars[i].value = e.target.value;
                      setEditUnitCustomVars(newVars);
                    }}/>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => setEditUnitCustomVars(editUnitCustomVars.filter((_, idx) => idx !== i))}>X</Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setEditUnitCustomVars([...editUnitCustomVars, { key: "", value: "" }])}>
                + Adicionar Variável
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUnit(null)}>Cancelar</Button>
            <Button onClick={() => {
              const customVarsObj = editUnitCustomVars.reduce((acc, curr) => {
                if (curr.key.trim()) acc[curr.key.trim()] = curr.value;
                return acc;
              }, {} as Record<string, string>);
              
              updateUnit.mutate({ 
                id: editingUnit.id, 
                name: editUnitName, 
                color: editUnitColor,
                document: editUnitDocument,
                address: editUnitAddress,
                business_hours: editUnitBusinessHours,
                custom_variables: customVarsObj
              });
            }} disabled={updateUnit.isPending || !editUnitName}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingUnit} onOpenChange={(v) => !v && setDeletingUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a unidade <strong>{deletingUnit?.name}</strong>? Essa ação não pode ser desfeita e falhará se existirem usuários vinculados a ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteUnit.mutate(deletingUnit.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Management Sheet */}
      {managingUnit && company && (
        <UnitManagementSheet 
          open={!!managingUnit} 
          onOpenChange={(v) => !v && setManagingUnit(null)} 
          unit={managingUnit} 
          company={company} 
        />
      )}
    </div>
  );
}

function UnitManagementSheet({ open, onOpenChange, unit, company }: { open: boolean, onOpenChange: (open: boolean) => void, unit: any, company: any }) {
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState("");
  const [deptName, setDeptName] = useState("");
  
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean, type: 'disconnect' | 'delete' | 'delete_dept' | null, instance: any, dept: any }>({ open: false, type: null, instance: null, dept: null });
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);

  const [instanceProvider, setInstanceProvider] = useState("evogo");
  const [oficialNumberId, setOficialNumberId] = useState("");
  const [oficialToken, setOficialToken] = useState("");
  const [oficialVerifyToken, setOficialVerifyToken] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState("");
  const [useManualToken, setUseManualToken] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (createModalOpen) {
      setMetaAccounts([]);
      setSelectedMetaAccountId("");
      setUseManualToken(false);
      setOficialNumberId("");
      setOficialToken("");
    }
  }, [createModalOpen]);

  useEffect(() => {
    if (createModalOpen && company?.meta_system_user_token && (instanceProvider === 'instagram' || instanceProvider === 'messenger')) {
      const fetchAccounts = async () => {
        setIsLoadingMeta(true);
        try {
          const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=name,access_token,instagram_business_account{name,username,profile_picture_url}&access_token=${company.meta_system_user_token}`);
          const json = await res.json();
          if (json.error) throw new Error(json.error.message);
          
          let accounts = json.data || [];
          if (instanceProvider === 'instagram') {
            accounts = accounts.filter((a: any) => a.instagram_business_account);
          }
          setMetaAccounts(accounts);
        } catch (e: any) {
          toast.error("Erro ao buscar contas da Meta", { description: e.message });
        } finally {
          setIsLoadingMeta(false);
        }
      };
      fetchAccounts();
    }
  }, [instanceProvider, createModalOpen, company?.meta_system_user_token]);

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ["whatsapp-instances", unit.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("*").eq("unit_id", unit.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: departments, isLoading: isLoadingDepts } = useQuery({
    queryKey: ["departments", unit.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("unit_id", unit.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createInstance = useMutation({
    mutationFn: async (payload: { name: string, provider: string, numberId?: string, accessToken?: string, verifyToken?: string }) => {
      const { name, provider, numberId, accessToken, verifyToken } = payload;
      if (provider === 'evogo' && (!company?.evogo_host || !company?.evogo_global_token)) {
        throw new Error("Configure Host e Token na Empresa Mãe primeiro.");
      }

      let finalNumberId = numberId;
      let finalAccessToken = accessToken;
      let finalWabaId = undefined;

      if ((provider === 'instagram' || provider === 'messenger') && company?.meta_system_user_token && !useManualToken && selectedMetaAccountId) {
        const account = metaAccounts.find(a => a.id === selectedMetaAccountId);
        if (account) {
          finalAccessToken = account.access_token;
          if (provider === 'instagram') {
            finalNumberId = account.instagram_business_account.id;
            finalWabaId = account.id; // The Page ID is used as wabaId for instagram
          } else {
            finalNumberId = account.id; // Page ID
          }
        }
      }

      if ((provider === 'oficial' || provider === 'instagram' || provider === 'messenger') && (!finalNumberId || !finalAccessToken || !verifyToken)) {
        throw new Error("Preencha todos os campos da credencial (ID, Token e Verify Token) ou selecione uma conta da Meta.");
      }

      const localSlugify = (s: string) => s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\w-]/g, '');

      const technicalName = `${localSlugify(company.name)}-${localSlugify(unit.name)}-${localSlugify(name)}-${provider}`;

      let defaultWebhookUrl = null;
      if (provider === 'oficial') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;
      } else if (provider === 'instagram') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/instagram`;
      } else if (provider === 'messenger') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/messenger`;
      }

      const { data, error } = await supabase.from("whatsapp_instances").insert({
        company_id: company.id,
        unit_id: unit.id,
        name,
        instance_name: technicalName,
        provider,
        oficial_phone_number_id: finalNumberId,
        oficial_waba_id: finalWabaId || null,
        oficial_access_token: finalAccessToken,
        oficial_verify_token: verifyToken,
        webhook_url: defaultWebhookUrl
      }).select().single();
      
      if (error) throw error;

      if (provider === 'evogo') {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        try {
          const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
          const evogoId = evoRes?.data?.id || evoRes?.id;
          if (evogoId) {
            const webhookUrl = `${window.location.origin}/api/webhooks/evogo`;
            await supabase.from("whatsapp_instances").update({ evogo_instance_id: evogoId, webhook_url: webhookUrl }).eq("id", data.id);
            await client.connectInstance(webhookUrl, data.evogo_api_key).catch(console.error);
            await client.updateAdvancedSettings(evogoId, { rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false }, data.evogo_api_key).catch(console.error);
          }
        } catch (e) {
          console.error("Falha ao criar/configurar na EvoGo, mas salvo no DB", e);
        }
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Instância criada com sucesso!");
      setInstanceName("");
      setInstanceProvider("evogo");
      setOficialNumberId("");
      setOficialToken("");
      setOficialVerifyToken("");
      setCreateModalOpen(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

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
      setConfirmDialog({ open: false, type: null, instance: null, dept: null });
    }
  };

  const handleRefreshInstance = async (instance: any) => {
    setRefreshingInstance(instance.id);
    try {
      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      const statusRes: any = await client.getInstanceStatus(instance.evogo_api_key);
      
      let ownerJid = instance.owner_jid;
      let evoInstState = null;
      try {
        const allRes: any = await client.getAllInstances();
        const evogoInstances = allRes?.data || allRes || [];
        const evoInst = evogoInstances.find((e: any) => e.token === instance.evogo_api_key || e.instance?.apikey === instance.evogo_api_key || e.instance?.instanceName === instance.instance_name);
        if (evoInst) {
          if (evoInst.jid || evoInst.instance?.owner) {
            ownerJid = (evoInst.jid || evoInst.instance?.owner).split('@')[0].split(':')[0];
          }
          if (evoInst.state || evoInst.instance?.state || evoInst.status || evoInst.instance?.status) {
            evoInstState = evoInst.state || evoInst.instance?.state || evoInst.status || evoInst.instance?.status;
          }
        }
      } catch (err) {
        console.error("Erro ao buscar JID/estado na atualização:", err);
      }

      // EvoGo returns { data: { Connected: true, LoggedIn: false } } when not scanned.
      const isConnected = 
        statusRes?.instance?.state === 'open' || 
        statusRes?.instance?.status === 'open' || 
        statusRes?.data?.instance?.state === 'open' ||
        (statusRes?.data?.Connected === true && statusRes?.data?.LoggedIn === true) ||
        (statusRes?.Connected === true && statusRes?.LoggedIn === true) ||
        statusRes?.state === 'open' ||
        evoInstState === 'open' ||
        evoInstState === 'ONLINE';
      
      const newStatus = isConnected ? 'connected' : 'disconnected';
      const updateData: any = { status: newStatus };
      if (ownerJid) {
        updateData.owner_jid = ownerJid;
      }
      
      await supabase.from("whatsapp_instances").update(updateData).eq("id", instance.id);
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
      
      if (newStatus === 'connected') {
        toast.success("Conexão ativa!");
      } else {
        toast.warning("Aparelho está desconectado.");
      }
    } catch (err: any) {
      console.error("Erro ao atualizar status:", err);
      const msg = err.message?.toLowerCase() || "";
      if (msg.includes("not found") || msg.includes("disconnected") || msg.includes("logout") || msg.includes("404")) {
        await supabase.from("whatsapp_instances").update({ status: 'disconnected' }).eq("id", instance.id);
        qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
        toast.warning("Aparelho está desconectado.");
      } else {
        toast.error("Erro ao verificar conexão", { description: "Verifique o status do EvoGo." });
      }
    } finally {
      setRefreshingInstance(null);
    }
  };

  const handleDelete = async (instance: any) => {
    try {
      if (instance.evogo_instance_id) {
        try {
          const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
          await client.deleteInstance(instance.evogo_instance_id);
        } catch (evogoError: any) {
          console.warn("Falha ao deletar na EvoGo (pode já estar deletada):", evogoError.message);
        }
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success("Instância deletada.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    } catch (e: any) {
      toast.error("Erro ao deletar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null, instance: null, dept: null });
    }
  };

  const createDept = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("departments").insert({ company_id: company.id, unit_id: unit.id, name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento criado!");
      setDeptName("");
      qc.invalidateQueries({ queryKey: ["departments", unit.id] });
    },
    onError: (e) => toast.error("Erro ao criar departamento", { description: (e as Error).message })
  });

  const handleDeleteDept = async (dept: any) => {
    try {
      await supabase.from("departments").delete().eq("id", dept.id);
      toast.success("Departamento excluído.");
      qc.invalidateQueries({ queryKey: ["departments", unit.id] });
    } catch (e: any) {
      toast.error("Erro ao deletar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null, instance: null, dept: null });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] w-full overflow-y-auto p-0 flex flex-col h-full bg-background">
        <div className="h-2 w-full shrink-0" style={{ backgroundColor: unit.color || '#6366f1' }} />
        <SheetHeader className="p-6 pb-2 shrink-0">
          <SheetTitle className="text-2xl flex items-center gap-2">
            <Store className="h-5 w-5 text-muted-foreground" />
            {unit.name}
          </SheetTitle>
          <SheetDescription>
            Gerencie instâncias de WhatsApp e os departamentos desta unidade.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 flex-1">
          <Tabs defaultValue="instances" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="instances" className="flex items-center gap-2"><Smartphone className="h-4 w-4"/> Instâncias</TabsTrigger>
              <TabsTrigger value="departments" className="flex items-center gap-2"><Layers className="h-4 w-4"/> Departamentos</TabsTrigger>
            </TabsList>

            <TabsContent value="instances" className="space-y-6 animate-in fade-in-50 duration-300">
              <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold">Conectar Novo Aparelho</h4>
                  <p className="text-xs text-muted-foreground font-normal">Adicione instâncias do WhatsApp (EvoGo ou Oficial), Instagram ou Facebook Messenger.</p>
                </div>
                <Button size="sm" className="h-9" onClick={() => setCreateModalOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Criar Instância
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center justify-between">
                  Aparelhos Conectados 
                  <Badge variant="secondary" className="text-xs font-normal">{instances?.length || 0}</Badge>
                </h4>
                {isLoadingInstances ? (
                  <div className="text-sm text-muted-foreground">Carregando...</div>
                ) : instances?.length ? (
                  <div className="flex flex-col gap-3">
                    {instances.map((inst) => (
                      <div key={inst.id} className="group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{inst.name}</span>
                            {inst.provider && inst.provider !== 'whatsapp' && inst.provider !== 'evogo' && (
                              <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 capitalize font-semibold ${
                                inst.provider === 'instagram' ? 'border-pink-200 text-pink-700 bg-pink-50/50' : 
                                inst.provider === 'messenger' ? 'border-blue-200 text-blue-700 bg-blue-50/50' : 
                                inst.provider === 'oficial' ? 'border-emerald-200 text-emerald-700 bg-emerald-50/50' : ''
                              }`}>
                                {inst.provider === 'oficial' ? 'API Oficial' : inst.provider}
                              </Badge>
                            )}
                            <Badge variant={inst.status === 'connected' ? 'default' : 'secondary'} className={inst.status === 'connected' ? 'bg-success text-[10px] py-0 h-4 font-semibold' : 'text-[10px] py-0 h-4 font-semibold'}>
                              {inst.status === 'connected' ? 'Online' : 'Aguardando'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{inst.instance_name}</p>
                          {inst.owner_jid && (
                            <p className="text-[11px] font-medium text-foreground/80 font-mono mt-1 flex items-center gap-1">
                              <Smartphone className="h-3 w-3" />
                              +{inst.owner_jid}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1.5 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
                          {inst.provider === 'oficial' ? (
                            <Badge variant="outline" className="h-8 px-2.5 border-emerald-200 text-emerald-700 bg-emerald-50 text-[11px] font-medium flex items-center">API Oficial Ativa</Badge>
                          ) : inst.provider === 'instagram' ? (
                            <Badge variant="outline" className="h-8 px-2.5 border-pink-200 text-pink-700 bg-pink-50 text-[11px] font-medium flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                              Instagram Ativo
                            </Badge>
                          ) : inst.provider === 'messenger' ? (
                            <Badge variant="outline" className="h-8 px-2.5 border-blue-200 text-blue-700 bg-blue-50 text-[11px] font-medium flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                              Messenger Ativo
                            </Badge>
                          ) : (
                            <>
                              <Button variant="secondary" size="icon" className="h-8 w-8 bg-muted/50 hover:bg-muted" onClick={() => handleRefreshInstance(inst)} title="Verificar Status">
                                <RefreshCw className={`h-4 w-4 text-primary ${refreshingInstance === inst.id ? 'animate-spin' : ''}`} />
                              </Button>
                              {inst.status === 'connected' ? (
                                <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => setConfirmDialog({ open: true, type: 'disconnect', instance: inst, dept: null })}>
                                  Desconectar
                                </Button>
                              ) : (
                                <Button variant="default" size="sm" className="h-8 px-3 text-xs bg-primary hover:bg-primary/90" onClick={() => { setSelectedInstance(inst); setQrModalOpen(true); }}>
                                  <QrCode className="mr-1.5 h-3.5 w-3.5" /> Ler QR
                                </Button>
                              )}
                            </>
                          )}
                          <Button variant="secondary" size="icon" className="h-8 w-8 bg-muted/50 hover:bg-muted" onClick={() => { setSelectedInstance(inst); setSettingsModalOpen(true); }} title="Configurações">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDialog({ open: true, type: 'delete', instance: inst, dept: null })} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center border rounded-lg bg-card/30 border-dashed text-sm text-muted-foreground">
                    Nenhuma instância vinculada a esta unidade.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="departments" className="space-y-6 animate-in fade-in-50 duration-300">
              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold mb-3">Novo Departamento</h4>
                <div className="flex gap-2">
                  <Input placeholder="Ex: Vendas, Suporte..." value={deptName} onChange={(e) => setDeptName(e.target.value)} className="h-9" />
                  <Button size="sm" className="h-9" onClick={() => createDept.mutate(deptName)} disabled={!deptName || createDept.isPending}>Criar</Button>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center justify-between">
                  Departamentos Ativos
                  <Badge variant="secondary" className="text-xs font-normal">{departments?.length || 0}</Badge>
                </h4>
                {isLoadingDepts ? (
                  <div className="text-sm text-muted-foreground">Carregando...</div>
                ) : departments?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {departments.map((dept) => (
                      <div key={dept.id} className="group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{dept.name}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all" onClick={() => setConfirmDialog({ open: true, type: 'delete_dept', instance: null, dept: dept })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center border rounded-lg bg-card/30 border-dashed text-sm text-muted-foreground">
                    Nenhum departamento cadastrado.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Action Dialogs scoped to Sheet */}
        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null, instance: null, dept: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDialog.type === 'disconnect' ? "Desconectar Aparelho?" : confirmDialog.type === 'delete_dept' ? "Excluir Departamento?" : "Excluir Instância?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.type === 'disconnect' 
                  ? `Isso irá deslogar o WhatsApp do aparelho "${confirmDialog.instance?.name}". Você precisará ler o QR Code novamente para conectar.`
                  : confirmDialog.type === 'delete_dept'
                  ? `Tem certeza que deseja excluir o departamento "${confirmDialog.dept?.name}"? Isso pode afetar atendimentos.`
                  : `Isso apagará permanentemente a instância "${confirmDialog.instance?.name}" e todos os seus dados não poderão ser recuperados.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  if (confirmDialog.type === 'disconnect') handleDisconnect(confirmDialog.instance);
                  else if (confirmDialog.type === 'delete') handleDelete(confirmDialog.instance);
                  else if (confirmDialog.type === 'delete_dept') handleDeleteDept(confirmDialog.dept);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {confirmDialog.type === 'disconnect' ? "Sim, Desconectar" : "Sim, Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <QrCodeModal open={qrModalOpen} onOpenChange={setQrModalOpen} instance={selectedInstance} company={company} />
        <InstanceSettingsModal open={settingsModalOpen} onOpenChange={setSettingsModalOpen} instance={selectedInstance} company={company} />

        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Novo Canal de Atendimento (Unidade)</DialogTitle>
              <DialogDescription>
                Selecione o provedor e preencha as credenciais do canal para esta unidade.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome de Exibição</label>
                <Input 
                  placeholder="Ex: Recepção Aracruz" 
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  autoFocus
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Provedor</label>
                <Select value={instanceProvider} onValueChange={setInstanceProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evogo">EvoGo API (WhatsApp)</SelectItem>
                    <SelectItem value="oficial">API Oficial (WhatsApp Cloud API)</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="messenger">Messenger (Meta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(instanceProvider === 'oficial' || instanceProvider === 'instagram' || instanceProvider === 'messenger') && (
                <>
                  {(instanceProvider === 'instagram' || instanceProvider === 'messenger') && company?.meta_system_user_token && !useManualToken ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Selecione a Conta da Meta</label>
                      {isLoadingMeta ? (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Buscando contas...
                        </div>
                      ) : metaAccounts.length === 0 ? (
                        <div className="text-sm text-destructive">
                          Nenhuma conta encontrada. Verifique as permissões do Token do Sistema ou se a página está vinculada.
                        </div>
                      ) : (
                        <Select value={selectedMetaAccountId} onValueChange={setSelectedMetaAccountId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a Página / Instagram" />
                          </SelectTrigger>
                          <SelectContent>
                            {metaAccounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>
                                <div className="flex items-center gap-2">
                                  {instanceProvider === 'instagram' && acc.instagram_business_account?.profile_picture_url ? (
                                    <img src={acc.instagram_business_account.profile_picture_url} className="w-5 h-5 rounded-full" />
                                  ) : (
                                    <Globe className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <span>{instanceProvider === 'instagram' ? acc.instagram_business_account?.username || acc.name : acc.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button 
                        variant="link" 
                        className="px-0 text-xs text-muted-foreground h-auto"
                        onClick={() => setUseManualToken(true)}
                      >
                        Não achou sua conta? Inserir Manualmente (Modo Direto)
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {instanceProvider === 'instagram' ? 'Instagram Account ID' : instanceProvider === 'messenger' ? 'Facebook Page ID' : 'Phone Number ID'}
                        </label>
                        <Input 
                          placeholder="1234567890" 
                          value={oficialNumberId}
                          onChange={(e) => setOficialNumberId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">O ID gerado no painel de desenvolvedores da Meta.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Access Token Permanente</label>
                        <Input 
                          type="password"
                          placeholder="EAAS... ou IGA..." 
                          value={oficialToken}
                          onChange={(e) => setOficialToken(e.target.value)}
                        />
                      </div>
                      {company?.meta_system_user_token && (
                        <Button 
                          variant="link" 
                          className="px-0 text-xs text-muted-foreground h-auto mt-2"
                          onClick={() => setUseManualToken(false)}
                        >
                          Voltar para a Busca Automática
                        </Button>
                      )}
                    </>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Verify Token (Sua Escolha)</label>
                    <Input 
                      placeholder="Crie uma senha (ex: atendi2026)" 
                      value={oficialVerifyToken}
                      onChange={(e) => setOficialVerifyToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Crie uma chave e use-a para configurar o webhook na Meta: 
                      <code>{window.location.origin}/api/webhooks/{instanceProvider === 'instagram' ? 'instagram' : instanceProvider === 'messenger' ? 'messenger' : 'whatsapp-cloud'}</code>
                    </p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => createInstance.mutate({
                  name: instanceName,
                  provider: instanceProvider,
                  numberId: oficialNumberId,
                  accessToken: oficialToken,
                  verifyToken: oficialVerifyToken
                })}
                disabled={!instanceName || createInstance.isPending || (instanceProvider === 'evogo' && !company?.evogo_host)}
              >
                {createInstance.isPending ? "Criando..." : "Criar Instância"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
