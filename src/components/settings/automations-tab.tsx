import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Zap, 
  Plus, 
  Trash2, 
  Edit2, 
  ArrowRight, 
  Tag, 
  Megaphone, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AutomationRow {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  trigger_type: string;
  trigger_config: Record<string, any>;
  conditions: any[];
  actions: { type: string; params: Record<string, any> }[];
  is_active: boolean;
  created_at: string;
}

const TRIGGER_OPTIONS = [
  {
    value: "ad_lead_first_message",
    label: "Primeiro contato vindo de Anúncio (CTWA)",
    description: "Disparado na primeira vez que um lead envia mensagem através de um anúncio do WhatsApp/Meta Ads",
    icon: Megaphone,
  },
];

export function AutomationsTab() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationRow | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("ad_lead_first_message");
  const [selectedLabelId, setSelectedLabelId] = useState("");

  // 1. Consulta automações da empresa
  const { data: automations, isLoading: loadingAutomations } = useQuery({
    queryKey: ["automations", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations" as any)
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as AutomationRow[];
    },
  });

  // 2. Consulta etiquetas disponíveis
  const { data: labels } = useQuery({
    queryKey: ["labels", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labels")
        .select("id, name, color")
        .eq("company_id", activeCompanyId!)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  const openCreateModal = () => {
    setEditingAutomation(null);
    setName("Etiquetar Leads de Anúncios");
    setTriggerType("ad_lead_first_message");
    setSelectedLabelId(labels?.[0]?.id || "");
    setIsModalOpen(true);
  };

  const openEditModal = (auto: AutomationRow) => {
    setEditingAutomation(auto);
    setName(auto.name);
    setTriggerType(auto.trigger_type);
    const addLabelAction = auto.actions?.find((a) => a.type === "add_label");
    setSelectedLabelId(addLabelAction?.params?.label_id || "");
    setIsModalOpen(true);
  };

  // Salvar / Editar
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa ativa");
      if (!name.trim()) throw new Error("O nome da automação é obrigatório");
      if (!selectedLabelId) throw new Error("Selecione uma etiqueta para a automação");

      const actions = [
        {
          type: "add_label",
          params: {
            label_id: selectedLabelId,
          },
        },
      ];

      if (editingAutomation) {
        const { error } = await supabase
          .from("automations" as any)
          .update({
            name,
            trigger_type: triggerType,
            actions,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingAutomation.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automations" as any)
          .insert({
            company_id: activeCompanyId,
            name,
            trigger_type: triggerType,
            actions,
            is_active: true,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingAutomation ? "Automação atualizada!" : "Automação criada com sucesso!");
      setIsModalOpen(false);
      qc.invalidateQueries({ queryKey: ["automations", activeCompanyId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar automação");
    },
  });

  // Alternar Ativação (Toggle switch)
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("automations" as any)
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.is_active ? "Automação ativada!" : "Automação pausada!");
      qc.invalidateQueries({ queryKey: ["automations", activeCompanyId] });
    },
    onError: () => {
      toast.error("Erro ao alterar status da automação");
    },
  });

  // Excluir
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automations" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automação excluída com sucesso!");
      qc.invalidateQueries({ queryKey: ["automations", activeCompanyId] });
    },
    onError: () => {
      toast.error("Erro ao excluir automação");
    },
  });

  const getLabelInfo = (labelId: string) => {
    return labels?.find((l) => l.id === labelId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <h2 className="text-xl font-bold tracking-tight">Automações de Atendimento</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos automáticos estilo ManyChat e BotConversa para etiquetar contatos, segmentar anúncios e acelerar processos.
          </p>
        </div>
        <Button onClick={openCreateModal} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nova Automação
        </Button>
      </div>

      {/* Lista de Automações */}
      {loadingAutomations ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse border border-border" />
          ))}
        </div>
      ) : !automations?.length ? (
        <Card className="border-dashed border-2 border-border/80 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base mb-1">Nenhuma automação configurada</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-5">
              Crie uma automação para que leads vindos de anúncios recebam automaticamente a etiqueta desejada assim que mandarem mensagem!
            </p>
            <Button onClick={openCreateModal} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeira automação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {automations.map((auto) => {
            const addLabelAction = auto.actions?.find((a) => a.type === "add_label");
            const labelInfo = addLabelAction ? getLabelInfo(addLabelAction.params?.label_id) : null;

            return (
              <Card 
                key={auto.id} 
                className={`transition-all border ${auto.is_active ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-75'}`}
              >
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <CardTitle className="text-base font-semibold">{auto.name}</CardTitle>
                        {auto.is_active ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px] gap-1 py-0 h-5">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px] gap-1 py-0 h-5">
                            <Clock className="h-3 w-3" />
                            Pausada
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        Dispara automaticamente no primeiro contato vindo de campanhas
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-2">
                        <Switch
                          checked={auto.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: auto.id, is_active: checked })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditModal(auto)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm("Deseja realmente excluir esta automação?")) {
                            deleteMutation.mutate(auto.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 pt-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-muted/40 p-3 rounded-lg border border-border/50 text-xs">
                    {/* Trigger visual */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Gatilho:</span>
                      <Badge variant="secondary" className="gap-1.5 font-normal py-1">
                        <Megaphone className="h-3 w-3 text-amber-500" />
                        Primeiro contato via Anúncio (CTWA)
                      </Badge>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />

                    {/* Action visual */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Ação:</span>
                      {labelInfo ? (
                        <Badge 
                          variant="outline" 
                          className="gap-1.5 font-medium py-1"
                          style={{
                            backgroundColor: `${labelInfo.color || '#6b7280'}15`,
                            color: labelInfo.color || '#6b7280',
                            borderColor: `${labelInfo.color || '#6b7280'}40`,
                          }}
                        >
                          <span 
                            className="h-2 w-2 rounded-full shrink-0" 
                            style={{ backgroundColor: labelInfo.color || '#6b7280' }} 
                          />
                          Aplicar etiqueta: {labelInfo.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Aplicar etiqueta (não encontrada)
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              {editingAutomation ? "Editar Automação" : "Nova Automação de Atendimento"}
            </DialogTitle>
            <DialogDescription>
              Configure o gatilho e a ação que o sistema executará de forma 100% automática.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-name">Nome da Automação</Label>
              <Input
                id="auto-name"
                placeholder="Ex: Etiquetar Leads de Tráfego Pago"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Gatilho */}
            <div className="space-y-1.5">
              <Label>Quando isso acontecer (Gatilho):</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o gatilho" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2 py-0.5">
                        <opt.icon className="h-4 w-4 text-amber-500" />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Disparado assim que uma pessoa clica em um anúncio do Meta Ads/WhatsApp e envia a primeira mensagem criando o contato.
              </p>
            </div>

            {/* Ação */}
            <div className="space-y-2 rounded-xl bg-muted/40 p-4 border border-border/60">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Ação: Anexar Etiqueta ao Contato</span>
              </div>

              {!labels?.length ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Você ainda não possui etiquetas cadastradas. Crie primeiro suas etiquetas na aba <b>Etiquetas</b> para poder selecioná-las aqui.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="label-select" className="text-xs text-muted-foreground">
                    Selecione qual etiqueta será anexada:
                  </Label>
                  <Select value={selectedLabelId} onValueChange={setSelectedLabelId}>
                    <SelectTrigger id="label-select" className="bg-background">
                      <SelectValue placeholder="Selecione uma etiqueta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {labels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          <div className="flex items-center gap-2">
                            <span 
                              className="h-2.5 w-2.5 rounded-full shrink-0" 
                              style={{ backgroundColor: l.color || '#6b7280' }} 
                            />
                            <span>{l.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending || !selectedLabelId || !name.trim()}
            >
              {saveMutation.isPending ? "Salvando..." : editingAutomation ? "Salvar Alterações" : "Criar Automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
