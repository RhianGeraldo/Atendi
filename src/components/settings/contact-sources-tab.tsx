import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Target, 
  Plus, 
  Trash2, 
  Edit2, 
  Loader2, 
  Users, 
  CheckCircle2, 
  Sparkles,
  Info,
  RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/lib/active-company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  getSourcesWithStatsAction, 
  addCompanyContactSourceAction, 
  removeCompanyContactSourceAction,
  renameCompanyContactSourceAction,
  resetCompanyContactSourcesAction
} from "@/lib/api/contact-sources.functions";
import { getSourceIcon } from "@/lib/use-contact-sources";

export function ContactSourcesTab() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");

  const [editingSource, setEditingSource] = useState<{ name: string; count: number } | null>(null);
  const [editSourceName, setEditSourceName] = useState("");
  const [updateAssociatedContacts, setUpdateAssociatedContacts] = useState(true);

  const [deletingSource, setDeletingSource] = useState<{ name: string; count: number } | null>(null);
  const [clearAssociatedContacts, setClearAssociatedContacts] = useState(false);

  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Consulta todas as origens configuradas da empresa com estatísticas
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["contact-sources-stats", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const res = await getSourcesWithStatsAction({ data: { companyId: activeCompanyId } });
      return res || [];
    },
  });

  const totalContactsWithSource = sources.reduce((acc, curr) => acc + curr.count, 0);
  const topSource = sources.length > 0 && sources[0].count > 0 ? sources[0] : null;

  // Mutation: Criar nova origem
  const addSource = useMutation({
    mutationFn: async (source: string) => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada.");
      return await addCompanyContactSourceAction({
        data: { companyId: activeCompanyId, source },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      toast.success("Origem criada com sucesso!");
      setCreateModalOpen(false);
      setNewSourceName("");
    },
    onError: (e: any) => {
      toast.error("Erro ao criar origem", { description: e.message });
    },
  });

  // Mutation: Renomear origem (100% configurável)
  const renameSource = useMutation({
    mutationFn: async ({ oldSource, newSource, updateContacts }: { oldSource: string; newSource: string; updateContacts: boolean }) => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada.");
      return await renameCompanyContactSourceAction({
        data: {
          companyId: activeCompanyId,
          oldSource,
          newSource,
          updateContacts,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Origem atualizada com sucesso!");
      setEditingSource(null);
    },
    onError: (e: any) => {
      toast.error("Erro ao atualizar origem", { description: e.message });
    },
  });

  // Mutation: Excluir qualquer origem da empresa
  const deleteSource = useMutation({
    mutationFn: async ({ source, clearContacts }: { source: string; clearContacts: boolean }) => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada.");
      return await removeCompanyContactSourceAction({
        data: { companyId: activeCompanyId, source, clearContacts },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Origem removida com sucesso!");
      setDeletingSource(null);
      setClearAssociatedContacts(false);
    },
    onError: (e: any) => {
      toast.error("Erro ao remover origem", { description: e.message });
    },
  });

  // Mutation: Restaurar sugestões padrão
  const resetSources = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada.");
      return await resetCompanyContactSourcesAction({
        data: { companyId: activeCompanyId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      toast.success("Sugestões padrão restauradas com sucesso!");
      setResetDialogOpen(false);
    },
    onError: (e: any) => {
      toast.error("Erro ao restaurar sugestões", { description: e.message });
    },
  });

  const handleOpenEdit = (src: { name: string; count: number }) => {
    setEditingSource(src);
    setEditSourceName(src.name);
    setUpdateAssociatedContacts(true);
  };

  const handleOpenDelete = (src: { name: string; count: number }) => {
    setDeletingSource(src);
    setClearAssociatedContacts(false);
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Origens de Contatos & Canais
            </CardTitle>
            <CardDescription className="mt-1">
              Personalize 100% das origens de contato da sua empresa. Todas as origens são totalmente customizáveis, editáveis e podem ser removidas conforme sua preferência.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setResetDialogOpen(true)}
              className="gap-1.5"
              title="Restaurar a lista sugerida de origens"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              Restaurar Sugestões
            </Button>
            <Button onClick={() => setCreateModalOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" />
              Nova Origem
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Cards de Resumo Estatístico */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total de Origens</p>
              <h4 className="text-xl font-bold">{sources.length}</h4>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Contatos Mapeados</p>
              <h4 className="text-xl font-bold">{totalContactsWithSource}</h4>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Principal Origem</p>
              <h4 className="text-base font-bold truncate">
                {topSource ? `${topSource.name} (${topSource.count})` : "Nenhum dado"}
              </h4>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listagem de Origens Configuráveis */}
      <Card>
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
            <span>Origens Configuradas da Empresa</span>
            <span className="text-xs text-muted-foreground font-normal">
              Disponíveis para seleção no chat, formulários e perfil do contato
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Carregando origens...
            </div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm space-y-3">
              <p>Nenhuma origem configurada no momento.</p>
              <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Carregar sugestões padrão
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sources.map((src) => (
                <div 
                  key={src.name} 
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-muted/60 shrink-0">
                      {getSourceIcon(src.name, "h-4 w-4")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{src.name}</span>
                        {src.count > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {src.count === 1 ? "1 contato" : `${src.count} contatos`}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {src.count === 0 ? "Nenhum contato atribuído ainda" : `${src.count} contatos vinculados`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Editar / Renomear origem"
                      onClick={() => handleOpenEdit(src)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Remover esta origem"
                      onClick={() => handleOpenDelete(src)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Criar Origem */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Nova Origem de Contato
            </DialogTitle>
            <DialogDescription>
              Cadastre um canal ou forma de captação para associar aos seus contatos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="source-name">Nome da Origem</Label>
              <Input
                id="source-name"
                placeholder="Ex: WhatsApp Comercial, TikTok Ads, Evento Presencial"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSourceName.trim()) {
                    addSource.mutate(newSourceName.trim());
                  }
                }}
              />
            </div>

            {newSourceName.trim() && (
              <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Pré-visualização do badge:</span>
                <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold">
                  {getSourceIcon(newSourceName.trim())}
                  <span>{newSourceName.trim()}</span>
                </Badge>
              </div>
            )}

            <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30 border border-border/60 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <span>
                Termos como <em>whatsapp</em>, <em>instagram</em>, <em>facebook</em>, <em>site</em>, <em>ads</em> ou <em>indicação</em> recebem automaticamente ícones temáticos específicos.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => addSource.mutate(newSourceName.trim())}
              disabled={!newSourceName.trim() || addSource.isPending}
            >
              {addSource.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Salvar Origem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar / Renomear Origem */}
      <Dialog open={!!editingSource} onOpenChange={(open) => !open && setEditingSource(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Editar Origem
            </DialogTitle>
            <DialogDescription>
              Altere o nome desta origem. A alteração pode ser refletida automaticamente nos contatos existentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-source-name">Nome da Origem</Label>
              <Input
                id="edit-source-name"
                value={editSourceName}
                onChange={(e) => setEditSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editSourceName.trim() && editSourceName.trim() !== editingSource?.name) {
                    renameSource.mutate({
                      oldSource: editingSource!.name,
                      newSource: editSourceName.trim(),
                      updateContacts: updateAssociatedContacts,
                    });
                  }
                }}
              />
            </div>

            {editSourceName.trim() && (
              <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Pré-visualização:</span>
                <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold">
                  {getSourceIcon(editSourceName.trim())}
                  <span>{editSourceName.trim()}</span>
                </Badge>
              </div>
            )}

            {editingSource && editingSource.count > 0 && (
              <div className="flex items-start space-x-2 pt-2">
                <Checkbox
                  id="update-contacts"
                  checked={updateAssociatedContacts}
                  onCheckedChange={(checked) => setUpdateAssociatedContacts(Boolean(checked))}
                />
                <label
                  htmlFor="update-contacts"
                  className="text-xs text-muted-foreground leading-tight cursor-pointer"
                >
                  Atualizar automaticamente os <strong>{editingSource.count} contatos</strong> que possuem esta origem atribuída.
                </label>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingSource(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingSource && editSourceName.trim()) {
                  renameSource.mutate({
                    oldSource: editingSource.name,
                    newSource: editSourceName.trim(),
                    updateContacts: updateAssociatedContacts,
                  });
                }
              }}
              disabled={!editSourceName.trim() || editSourceName.trim() === editingSource?.name || renameSource.isPending}
            >
              {renameSource.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog: Excluir Origem */}
      <AlertDialog open={!!deletingSource} onOpenChange={(open) => !open && setDeletingSource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Origem?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span>
                Tem certeza que deseja remover <strong>"{deletingSource?.name}"</strong> da lista de origens?
              </span>
              {deletingSource && deletingSource.count > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                  <p className="font-semibold">
                    Existem {deletingSource.count} contatos vinculados a esta origem.
                  </p>
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="clear-contacts"
                      checked={clearAssociatedContacts}
                      onCheckedChange={(checked) => setClearAssociatedContacts(Boolean(checked))}
                    />
                    <label
                      htmlFor="clear-contacts"
                      className="text-xs font-normal leading-tight cursor-pointer text-foreground"
                    >
                      Remover a origem também dos {deletingSource.count} contatos existentes (ficarão sem origem definida).
                    </label>
                  </div>
                  {!clearAssociatedContacts && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Se desmarcado, os contatos existentes manterão o texto da origem no histórico, mas ela não aparecerá para novas seleções.
                    </p>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (deletingSource) {
                  deleteSource.mutate({
                    source: deletingSource.name,
                    clearContacts: clearAssociatedContacts,
                  });
                }
              }}
            >
              {deleteSource.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog: Restaurar Sugestões Padrão */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Restaurar Sugestões de Origens?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Esta ação redefine sua lista para o conjunto inicial sugerido (WhatsApp direto, Instagram, Site, Indicação, etc.).
              </span>
              <span className="block text-xs text-muted-foreground">
                Todas as origens restauradas continuarão 100% configuráveis e poderão ser renomeadas ou apagadas a qualquer momento.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetSources.mutate()}
              disabled={resetSources.isPending}
            >
              {resetSources.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Restaurar Sugestões
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
