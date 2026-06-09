import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Store, Smartphone, Settings, QrCode, Trash2, Users, MoreVertical, Edit2, ChevronRight, Layers } from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/units")({
  component: UnitsPage,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
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
    mutationFn: async ({ id, name, color }: { id: string, name: string, color: string }) => {
      const { error } = await supabase.from("units").update({ name, color }).eq("id", id);
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUnit(null)}>Cancelar</Button>
            <Button onClick={() => updateUnit.mutate({ id: editingUnit.id, name: editUnitName, color: editUnitColor })} disabled={updateUnit.isPending || !editUnitName}>
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
    mutationFn: async (name: string) => {
      if (!company?.evogo_host || !company?.evogo_global_token) throw new Error("Configure Host e Token na Empresa Mãe primeiro.");
      const technicalName = `${slugify(company.name)}-${slugify(unit.name)}-${slugify(name)}`;
      const { data, error } = await supabase.from("whatsapp_instances").insert({ company_id: company.id, unit_id: unit.id, name, instance_name: technicalName }).select().single();
      if (error) throw error;

      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      try {
        const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
        const evogoId = evoRes?.data?.id || evoRes?.id;
        if (evogoId) {
          const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evogo-webhook`;
          await supabase.from("whatsapp_instances").update({ evogo_instance_id: evogoId, webhook_url: webhookUrl }).eq("id", data.id);
          await client.connectInstance(webhookUrl, data.evogo_api_key).catch(console.error);
          await client.updateAdvancedSettings(evogoId, { rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false }, data.evogo_api_key).catch(console.error);
        }
      } catch (e) {
        console.error("Falha ao criar/configurar na EvoGo, mas salvo no DB", e);
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Instância criada!");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances", unit.id] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
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

  const handleDelete = async (instance: any) => {
    try {
      if (instance.evogo_instance_id) {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.deleteInstance(instance.evogo_instance_id);
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
              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold mb-3">Conectar Novo Aparelho</h4>
                <div className="flex gap-2">
                  <Input placeholder="Nome (ex: Recepção)" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} className="h-9" />
                  <Button size="sm" className="h-9" onClick={() => createInstance.mutate(instanceName)} disabled={!instanceName || createInstance.isPending || !company?.evogo_host}>Criar</Button>
                </div>
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
                            <Badge variant={inst.status === 'connected' ? 'default' : 'secondary'} className={inst.status === 'connected' ? 'bg-success text-[10px] py-0 h-4' : 'text-[10px] py-0 h-4'}>
                              {inst.status === 'connected' ? 'Online' : 'Aguardando'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{inst.instance_name}</p>
                        </div>
                        <div className="flex gap-1.5 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity">
                          {inst.status === 'connected' ? (
                            <Button variant="outline" size="sm" className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={() => setConfirmDialog({ open: true, type: 'disconnect', instance: inst, dept: null })}>
                              Desconectar
                            </Button>
                          ) : (
                            <Button variant="default" size="sm" className="h-8 px-3 text-xs bg-primary hover:bg-primary/90" onClick={() => { setSelectedInstance(inst); setQrModalOpen(true); }}>
                              <QrCode className="mr-1.5 h-3.5 w-3.5" /> Ler QR
                            </Button>
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
      </SheetContent>
    </Sheet>
  );
}
