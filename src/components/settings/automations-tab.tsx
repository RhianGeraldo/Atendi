import { useState, useMemo } from "react";
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
  Sparkles,
  UserPlus,
  Target,
  DollarSign
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
    value: "contact_created",
    label: "Novo contato criado / Primeiro contato",
    description: "Disparado sempre que um novo contato entrar na sua base (via WhatsApp, Redes Sociais ou cadastro)",
    icon: UserPlus,
  },
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
  const [triggerType, setTriggerType] = useState("contact_created");
  
  // Action: Add Label
  const [enableAddLabel, setEnableAddLabel] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState("");

  // Action: Create Opportunity
  const [enableCreateOpp, setEnableCreateOpp] = useState(true);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [oppTitle, setOppTitle] = useState("{{nome}}");
  const [oppValue, setOppValue] = useState("");

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

  // 3. Consulta pipelines (funis) disponíveis
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // 4. Consulta etapas do pipeline selecionado
  const { data: stages } = useQuery({
    queryKey: ["pipeline-stages", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, order")
        .eq("pipeline_id", selectedPipelineId)
        .order("order", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // 5. Consulta todas as etapas para exibição nos cards
  const { data: allStages } = useQuery({
    queryKey: ["all-pipeline-stages-for-automations", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, pipeline_id, pipelines(name)");

      if (error) return [];
      return data || [];
    },
  });

  const openCreateModal = () => {
    setEditingAutomation(null);
    setName("Criar Oportunidade para Novos Contatos");
    setTriggerType("contact_created");
    
    setEnableAddLabel(false);
    setSelectedLabelId(labels?.[0]?.id || "");

    setEnableCreateOpp(true);
    const defaultPipeline = pipelines?.[0]?.id || "";
    setSelectedPipelineId(defaultPipeline);
    setSelectedStageId("");
    setOppTitle("{{nome}}");
    setOppValue("");

    setIsModalOpen(true);
  };

  const openEditModal = (auto: AutomationRow) => {
    setEditingAutomation(auto);
    setName(auto.name);
    setTriggerType(auto.trigger_type || "contact_created");

    // Action: add_label
    const addLabelAction = auto.actions?.find((a) => a.type === "add_label");
    if (addLabelAction) {
      setEnableAddLabel(true);
      setSelectedLabelId(addLabelAction.params?.label_id || "");
    } else {
      setEnableAddLabel(false);
      setSelectedLabelId(labels?.[0]?.id || "");
    }

    // Action: create_opportunity
    const createOppAction = auto.actions?.find((a) => a.type === "create_opportunity");
    if (createOppAction) {
      setEnableCreateOpp(true);
      setSelectedPipelineId(createOppAction.params?.pipeline_id || pipelines?.[0]?.id || "");
      setSelectedStageId(createOppAction.params?.stage_id || "");
      setOppTitle(createOppAction.params?.title || "{{nome}}");
      setOppValue(createOppAction.params?.value ? String(createOppAction.params.value) : "");
    } else {
      setEnableCreateOpp(false);
      setSelectedPipelineId(pipelines?.[0]?.id || "");
      setSelectedStageId("");
      setOppTitle("{{nome}}");
      setOppValue("");
    }

    setIsModalOpen(true);
  };

  // Salvar / Editar
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa ativa");
      if (!name.trim()) throw new Error("O nome da automação é obrigatório");

      if (!enableAddLabel && !enableCreateOpp) {
        throw new Error("Selecione pelo menos uma ação para a automação (Etiqueta ou Oportunidade)");
      }

      if (enableAddLabel && !selectedLabelId) {
        throw new Error("Selecione qual etiqueta será anexada");
      }

      if (enableCreateOpp) {
        if (!selectedPipelineId) throw new Error("Selecione o funil da oportunidade");
        if (!selectedStageId) throw new Error("Selecione a etapa do funil da oportunidade");
      }

      const actions: { type: string; params: Record<string, any> }[] = [];

      if (enableAddLabel) {
        actions.push({
          type: "add_label",
          params: {
            label_id: selectedLabelId,
          },
        });
      }

      if (enableCreateOpp) {
        actions.push({
          type: "create_opportunity",
          params: {
            pipeline_id: selectedPipelineId,
            stage_id: selectedStageId,
            title: oppTitle.trim() || "{{nome}}",
            value: oppValue ? parseFloat(oppValue.replace(/\./g, "").replace(",", ".")) || 0 : 0,
          },
        });
      }

      if (editingAutomation) {
        const { error } = await supabase
          .from("automations" as any)
          .update({
            name: name.trim(),
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
            name: name.trim(),
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

  const getStageInfo = (stageId: string) => {
    return (allStages as any[])?.find((s) => s.id === stageId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <h2 className="text-xl font-bold tracking-tight">Automações de CRM e Atendimento</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Automatize ações instantâneas quando contatos entrarem na base: crie oportunidades no funil, aplique etiquetas e qualifique leads.
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
              Crie uma automação para que novos contatos criem uma oportunidade no seu funil e recebam etiquetas automaticamente!
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
            const triggerInfo = TRIGGER_OPTIONS.find((t) => t.value === auto.trigger_type) || {
              label: auto.trigger_type,
              icon: Zap,
            };
            const TriggerIcon = triggerInfo.icon;

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
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px] gap-1 py-0 h-5 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px] gap-1 py-0 h-5 font-semibold">
                            <Clock className="h-3 w-3" />
                            Pausada
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {auto.trigger_type === "contact_created" 
                          ? "Dispara automaticamente sempre que um novo contato entrar na base"
                          : "Dispara no primeiro contato via anúncio (Meta Ads/CTWA)"}
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
                        className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={() => openEditModal(auto)}
                        title="Editar automação"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => {
                          if (confirm("Deseja realmente excluir esta automação?")) {
                            deleteMutation.mutate(auto.id);
                          }
                        }}
                        title="Excluir automação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 pt-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-muted/40 p-3 rounded-lg border border-border/50 text-xs flex-wrap">
                    {/* Trigger visual */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Gatilho:</span>
                      <Badge variant="secondary" className="gap-1.5 font-normal py-1">
                        <TriggerIcon className="h-3.5 w-3.5 text-amber-500" />
                        {triggerInfo.label}
                      </Badge>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />

                    {/* Actions visual */}
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Ações:</span>
                      {auto.actions?.map((act, idx) => {
                        if (act.type === "add_label") {
                          const labelInfo = getLabelInfo(act.params?.label_id);
                          return (
                            <Badge 
                              key={idx}
                              variant="outline" 
                              className="gap-1.5 font-medium py-1"
                              style={{
                                backgroundColor: `${labelInfo?.color || '#6b7280'}15`,
                                color: labelInfo?.color || '#6b7280',
                                borderColor: `${labelInfo?.color || '#6b7280'}40`,
                              }}
                            >
                              <span 
                                className="h-2 w-2 rounded-full shrink-0" 
                                style={{ backgroundColor: labelInfo?.color || '#6b7280' }} 
                              />
                              Etiqueta: {labelInfo?.name || "Não encontrada"}
                            </Badge>
                          );
                        }

                        if (act.type === "create_opportunity") {
                          const stageInfo = getStageInfo(act.params?.stage_id);
                          return (
                            <Badge 
                              key={idx}
                              variant="outline" 
                              className="gap-1.5 font-medium py-1 bg-primary/10 text-primary border-primary/30"
                            >
                              <Target className="h-3.5 w-3.5 text-primary" />
                              Oportunidade: {stageInfo?.pipelines?.name ? `${stageInfo.pipelines.name} → ` : ""}{stageInfo?.name || "Etapa inicial"}
                            </Badge>
                          );
                        }

                        return (
                          <Badge key={idx} variant="outline">
                            {act.type}
                          </Badge>
                        );
                      })}
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
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              {editingAutomation ? "Editar Automação" : "Nova Automação de Atendimento e CRM"}
            </DialogTitle>
            <DialogDescription>
              Configure o evento de gatilho e as ações automáticas que serão disparadas pelo sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-name">Nome da Automação</Label>
              <Input
                id="auto-name"
                placeholder="Ex: Criar Oportunidade e Etiquetar Leads"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Gatilho */}
            <div className="space-y-1.5">
              <Label>Quando isso acontecer (Gatilho):</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Selecione o gatilho" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="cursor-pointer">
                      <div className="flex items-center gap-2 py-0.5">
                        <opt.icon className="h-4 w-4 text-amber-500" />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.description}
              </p>
            </div>

            {/* Ações disponíveis */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Ações que serão executadas:</Label>

              {/* Ação 1: Criar Oportunidade no Funil */}
              <div className={`p-4 rounded-xl border transition-all ${enableCreateOpp ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20'}`}>
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="enable-opp"
                      checked={enableCreateOpp} 
                      onCheckedChange={(checked) => setEnableCreateOpp(!!checked)} 
                    />
                    <Label htmlFor="enable-opp" className="font-semibold text-sm cursor-pointer flex items-center gap-1.5">
                      <Target className="h-4 w-4 text-primary" />
                      Criar Oportunidade no Funil de Vendas
                    </Label>
                  </div>
                </div>

                {enableCreateOpp && (
                  <div className="space-y-3 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Funil de Vendas:</Label>
                        <Select 
                          value={selectedPipelineId} 
                          onValueChange={(val) => {
                            setSelectedPipelineId(val);
                            setSelectedStageId("");
                          }}
                        >
                          <SelectTrigger className="bg-background cursor-pointer">
                            <SelectValue placeholder="Selecione o funil..." />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines?.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="cursor-pointer">
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Etapa Inicial:</Label>
                        <Select 
                          value={selectedStageId} 
                          onValueChange={setSelectedStageId}
                          disabled={!selectedPipelineId}
                        >
                          <SelectTrigger className="bg-background cursor-pointer">
                            <SelectValue placeholder="Selecione a etapa..." />
                          </SelectTrigger>
                          <SelectContent>
                            {stages?.map((s) => (
                              <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#3b82f6' }} />
                                  <span>{s.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Título (suporta <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{{nome}}"}</code>):
                        </Label>
                        <Input
                          placeholder="Ex: {{nome}}"
                          value={oppTitle}
                          onChange={(e) => setOppTitle(e.target.value)}
                          className="bg-background h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Valor Inicial (R$):</Label>
                        <Input
                          placeholder="0,00"
                          value={oppValue}
                          onChange={(e) => setOppValue(e.target.value)}
                          className="bg-background h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ação 2: Adicionar Etiqueta */}
              <div className={`p-4 rounded-xl border transition-all ${enableAddLabel ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20'}`}>
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="enable-label"
                      checked={enableAddLabel} 
                      onCheckedChange={(checked) => setEnableAddLabel(!!checked)} 
                    />
                    <Label htmlFor="enable-label" className="font-semibold text-sm cursor-pointer flex items-center gap-1.5">
                      <Tag className="h-4 w-4 text-primary" />
                      Adicionar Etiqueta ao Contato
                    </Label>
                  </div>
                </div>

                {enableAddLabel && (
                  <div className="space-y-2 pt-3">
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
                          <SelectTrigger id="label-select" className="bg-background cursor-pointer">
                            <SelectValue placeholder="Selecione uma etiqueta..." />
                          </SelectTrigger>
                          <SelectContent>
                            {labels.map((l) => (
                              <SelectItem key={l.id} value={l.id} className="cursor-pointer">
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
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={
                saveMutation.isPending || 
                !name.trim() || 
                (!enableAddLabel && !enableCreateOpp) ||
                (enableAddLabel && !selectedLabelId) ||
                (enableCreateOpp && (!selectedPipelineId || !selectedStageId))
              }
            >
              {saveMutation.isPending ? "Salvando..." : editingAutomation ? "Salvar Alterações" : "Criar Automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
