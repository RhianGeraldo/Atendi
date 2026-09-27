import { useState, useEffect } from "react";
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
  KanbanSquare,
  Target,
  UserPlus,
  DollarSign,
  ShieldCheck
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
  {
    value: "contact_created",
    label: "Novo contato cadastrado no sistema",
    description: "Disparado quando um novo contato é cadastrado no sistema",
    icon: UserPlus,
  },
];

type ActionCategory = "create_opportunity" | "add_label" | "both";

export function AutomationsTab() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationRow | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("ad_lead_first_message");
  const [actionCategory, setActionCategory] = useState<ActionCategory>("create_opportunity");

  // Label action state
  const [selectedLabelId, setSelectedLabelId] = useState("");

  // CRM action state
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [opportunityValue, setOpportunityValue] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("{{contact_name}}");
  const [preventDuplicates, setPreventDuplicates] = useState(true);

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

  // 3. Consulta funis (pipelines) da empresa
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

  // 4. Consulta etapas (stages) de todos os funis para exibição e seleção
  const { data: allStages } = useQuery({
    queryKey: ["all-pipeline-stages", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!pipelines || pipelines.length === 0) return [];
      const pipelineIds = pipelines.map((p) => p.id);
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, order, pipeline_id")
        .in("pipeline_id", pipelineIds)
        .order("order", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Etapas filtradas pelo funil selecionado no formulário
  const currentPipelineStages = (allStages || []).filter((s) => s.pipeline_id === selectedPipelineId);

  // Sincroniza primeira etapa ao trocar de funil
  useEffect(() => {
    if (selectedPipelineId && currentPipelineStages.length > 0) {
      if (!currentPipelineStages.some((s) => s.id === selectedStageId)) {
        setSelectedStageId(currentPipelineStages[0].id);
      }
    }
  }, [selectedPipelineId, currentPipelineStages, selectedStageId]);

  const openCreateModal = () => {
    setEditingAutomation(null);
    setName("Criar Oportunidade para Leads de Anúncios");
    setTriggerType("ad_lead_first_message");
    setActionCategory("create_opportunity");
    setSelectedLabelId(labels?.[0]?.id || "");
    const firstPipeline = pipelines?.[0]?.id || "";
    setSelectedPipelineId(firstPipeline);
    const firstStage = allStages?.find((s) => s.pipeline_id === firstPipeline)?.id || "";
    setSelectedStageId(firstStage);
    setOpportunityValue("");
    setTitleTemplate("{{contact_name}}");
    setPreventDuplicates(true);
    setIsModalOpen(true);
  };

  const openEditModal = (auto: AutomationRow) => {
    setEditingAutomation(auto);
    setName(auto.name);
    setTriggerType(auto.trigger_type);

    const addLabelAction = auto.actions?.find((a) => a.type === "add_label");
    const createOppAction = auto.actions?.find((a) => a.type === "create_opportunity");

    if (addLabelAction && createOppAction) {
      setActionCategory("both");
    } else if (createOppAction) {
      setActionCategory("create_opportunity");
    } else {
      setActionCategory("add_label");
    }

    if (addLabelAction) {
      setSelectedLabelId(addLabelAction.params?.label_id || "");
    } else {
      setSelectedLabelId(labels?.[0]?.id || "");
    }

    if (createOppAction) {
      setSelectedPipelineId(createOppAction.params?.pipeline_id || pipelines?.[0]?.id || "");
      setSelectedStageId(createOppAction.params?.stage_id || "");
      setOpportunityValue(createOppAction.params?.value ? String(createOppAction.params.value) : "");
      setTitleTemplate(createOppAction.params?.title_template || "{{contact_name}}");
      setPreventDuplicates(createOppAction.params?.prevent_duplicates !== false);
    } else {
      const firstPipeline = pipelines?.[0]?.id || "";
      setSelectedPipelineId(firstPipeline);
      const firstStage = allStages?.find((s) => s.pipeline_id === firstPipeline)?.id || "";
      setSelectedStageId(firstStage);
      setOpportunityValue("");
      setTitleTemplate("{{contact_name}}");
      setPreventDuplicates(true);
    }

    setIsModalOpen(true);
  };

  // Salvar / Editar
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa ativa");
      if (!name.trim()) throw new Error("O nome da automação é obrigatório");

      const actions: { type: string; params: Record<string, any> }[] = [];

      // Ação de Etiqueta
      if (actionCategory === "add_label" || actionCategory === "both") {
        if (!selectedLabelId) throw new Error("Selecione uma etiqueta para a automação");
        actions.push({
          type: "add_label",
          params: {
            label_id: selectedLabelId,
          },
        });
      }

      // Ação de CRM
      if (actionCategory === "create_opportunity" || actionCategory === "both") {
        if (!selectedPipelineId) throw new Error("Selecione o funil de vendas de destino");
        if (!selectedStageId) throw new Error("Selecione a etapa inicial do funil");

        const parsedVal = opportunityValue ? parseFloat(opportunityValue.replace(",", ".")) : 0;

        actions.push({
          type: "create_opportunity",
          params: {
            pipeline_id: selectedPipelineId,
            stage_id: selectedStageId,
            value: isNaN(parsedVal) ? 0 : parsedVal,
            title_template: titleTemplate.trim() || "{{contact_name}}",
            prevent_duplicates: preventDuplicates,
          },
        });
      }

      if (actions.length === 0) {
        throw new Error("Pelo menos uma ação deve ser configurada.");
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

  // Alternar Ativação
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

  const getPipelineInfo = (pipelineId: string) => {
    return pipelines?.find((p) => p.id === pipelineId);
  };

  const getStageInfo = (stageId: string) => {
    return allStages?.find((s) => s.id === stageId);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <h2 className="text-xl font-bold tracking-tight">Automações de Atendimento & CRM</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos automáticos para criar oportunidades no funil comercial do CRM, anexar etiquetas e acelerar a conversão de leads.
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
              Crie uma automação para que contatos e leads vindos de campanhas criem oportunidades no seu funil comercial automaticamente!
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
            const createOppAction = auto.actions?.find((a) => a.type === "create_opportunity");

            const labelInfo = addLabelAction ? getLabelInfo(addLabelAction.params?.label_id) : null;
            const pipelineInfo = createOppAction ? getPipelineInfo(createOppAction.params?.pipeline_id) : null;
            const stageInfo = createOppAction ? getStageInfo(createOppAction.params?.stage_id) : null;
            const triggerInfo = TRIGGER_OPTIONS.find((t) => t.value === auto.trigger_type);
            const TriggerIcon = triggerInfo?.icon || Zap;

            return (
              <Card 
                key={auto.id} 
                className={`transition-all border ${auto.is_active ? 'border-border bg-card shadow-xs' : 'border-border/50 bg-muted/20 opacity-75'}`}
              >
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
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
                        {triggerInfo?.description || "Gatilho configurado para eventos da empresa"}
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
                    <div className="flex items-center gap-2 min-w-0 shrink-0">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Gatilho:</span>
                      <Badge variant="secondary" className="gap-1.5 font-normal py-1">
                        <TriggerIcon className="h-3.5 w-3.5 text-amber-500" />
                        <span>{triggerInfo?.label || auto.trigger_type}</span>
                      </Badge>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />

                    {/* Actions visual */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Ações:</span>
                      
                      {/* Oportunidade no CRM */}
                      {createOppAction && (
                        <Badge 
                          variant="outline" 
                          className="gap-1.5 font-medium py-1 bg-primary/10 text-primary border-primary/30"
                        >
                          <KanbanSquare className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Criar Oportunidade: {pipelineInfo?.name || "Funil"} &gt;
                          </span>
                          {stageInfo ? (
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <span 
                                className="h-2 w-2 rounded-full shrink-0" 
                                style={{ backgroundColor: stageInfo.color || '#3b82f6' }} 
                              />
                              {stageInfo.name}
                            </span>
                          ) : (
                            <span>Etapa</span>
                          )}
                          {Number(createOppAction.params?.value) > 0 && (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-0.5">
                              ({formatCurrency(createOppAction.params.value)})
                            </span>
                          )}
                        </Badge>
                      )}

                      {/* Etiqueta */}
                      {addLabelAction && (
                        labelInfo ? (
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
                            Etiqueta: {labelInfo.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Etiqueta (não encontrada)
                          </Badge>
                        )
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
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              {editingAutomation ? "Editar Automação" : "Nova Automação de Atendimento & CRM"}
            </DialogTitle>
            <DialogDescription>
              Configure o evento de disparo e as ações executadas de forma 100% automática.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-name">Nome da Automação</Label>
              <Input
                id="auto-name"
                placeholder="Ex: Criar Oportunidade para Leads de Anúncios"
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
                {TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.description}
              </p>
            </div>

            {/* Escolha do Tipo de Ação */}
            <div className="space-y-2">
              <Label>O que fazer (Ação):</Label>
              <RadioGroup
                value={actionCategory}
                onValueChange={(val) => setActionCategory(val as ActionCategory)}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <div 
                  onClick={() => setActionCategory("create_opportunity")}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center cursor-pointer transition-all ${
                    actionCategory === "create_opportunity" 
                      ? "border-primary bg-primary/10 text-primary shadow-xs" 
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <KanbanSquare className="h-5 w-5 mb-1.5 text-primary" />
                  <span className="text-xs font-semibold leading-tight">Criar Oportunidade no CRM</span>
                </div>

                <div 
                  onClick={() => setActionCategory("add_label")}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center cursor-pointer transition-all ${
                    actionCategory === "add_label" 
                      ? "border-primary bg-primary/10 text-primary shadow-xs" 
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Tag className="h-5 w-5 mb-1.5 text-primary" />
                  <span className="text-xs font-semibold leading-tight">Anexar Etiqueta</span>
                </div>

                <div 
                  onClick={() => setActionCategory("both")}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center cursor-pointer transition-all ${
                    actionCategory === "both" 
                      ? "border-primary bg-primary/10 text-primary shadow-xs" 
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Sparkles className="h-5 w-5 mb-1.5 text-primary" />
                  <span className="text-xs font-semibold leading-tight">Ambas as Ações (CRM + Etiqueta)</span>
                </div>
              </RadioGroup>
            </div>

            {/* Configurações de CRM (Oportunidade) */}
            {(actionCategory === "create_opportunity" || actionCategory === "both") && (
              <div className="space-y-3 rounded-xl bg-muted/40 p-4 border border-border/60">
                <div className="flex items-center gap-2 mb-1">
                  <KanbanSquare className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Configuração da Oportunidade no CRM</span>
                </div>

                {!pipelines?.length ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Nenhum funil de vendas encontrado. Crie primeiro um funil em Configurações &gt; CRM.</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="pipeline-select" className="text-xs font-medium">Funil de Vendas</Label>
                        <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                          <SelectTrigger id="pipeline-select" className="bg-background">
                            <SelectValue placeholder="Selecione o funil..." />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="stage-select" className="text-xs font-medium">Etapa Inicial</Label>
                        <Select 
                          value={selectedStageId} 
                          onValueChange={setSelectedStageId}
                          disabled={!selectedPipelineId || currentPipelineStages.length === 0}
                        >
                          <SelectTrigger id="stage-select" className="bg-background">
                            <SelectValue placeholder="Selecione a etapa..." />
                          </SelectTrigger>
                          <SelectContent>
                            {currentPipelineStages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="h-2.5 w-2.5 rounded-full shrink-0" 
                                    style={{ backgroundColor: s.color || "#3b82f6" }} 
                                  />
                                  <span>{s.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="opp-value" className="text-xs font-medium">Valor Padrão (R$)</Label>
                        <Input
                          id="opp-value"
                          type="number"
                          step="0.01"
                          placeholder="0,00 (opcional)"
                          value={opportunityValue}
                          onChange={(e) => setOpportunityValue(e.target.value)}
                          className="bg-background"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="opp-title" className="text-xs font-medium">Título da Oportunidade</Label>
                        <Input
                          id="opp-title"
                          placeholder="Ex: {{contact_name}}"
                          value={titleTemplate}
                          onChange={(e) => setTitleTemplate(e.target.value)}
                          className="bg-background"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium cursor-pointer">Evitar Duplicidades no Funil</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Não cria nova oportunidade se o contato já possuir uma oportunidade aberta neste funil
                        </p>
                      </div>
                      <Switch
                        checked={preventDuplicates}
                        onCheckedChange={setPreventDuplicates}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Configurações de Etiqueta */}
            {(actionCategory === "add_label" || actionCategory === "both") && (
              <div className="space-y-2 rounded-xl bg-muted/40 p-4 border border-border/60">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Ação: Anexar Etiqueta ao Contato</span>
                </div>

                {!labels?.length ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Você ainda não possui etiquetas cadastradas. Crie suas etiquetas na aba <b>Etiquetas</b>.</span>
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
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending || !name.trim()}
            >
              {saveMutation.isPending ? "Salvando..." : editingAutomation ? "Salvar Alterações" : "Criar Automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
