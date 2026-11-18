import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit,
  Bot,
  CheckCircle2,
  CornerDownRight,
  Info,
  CalendarCheck,
  BadgeDollarSign,
  HelpCircle,
  Ticket,
  Wrench,
  UserCheck,
  Building2,
  MapPin,
  Globe,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderIcon } from "@/components/common/provider-icon";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";

export function AiAgentsTab() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [aiType, setAiType] = useState("Vendedor / SDR");
  const [description, setDescription] = useState("");
  const [instanceId, setInstanceId] = useState<string>("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [unitId, setUnitId] = useState<string>("all");
  const [provider, setProvider] = useState<string>("openai");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [promptPersonality, setPromptPersonality] = useState("");
  const [promptInstructions, setPromptInstructions] = useState("");
  const [promptExtraInfo, setPromptExtraInfo] = useState("");
  const [promptHandoff, setPromptHandoff] = useState("");
  const [promptResolution, setPromptResolution] = useState("");
  const [promptReceiveHandoff, setPromptReceiveHandoff] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [activeByDefault, setActiveByDefault] = useState(false);
  const [isMainAgent, setIsMainAgent] = useState(false);
  const [allowHandoff, setAllowHandoff] = useState(false);
  const [handoffDepartmentId, setHandoffDepartmentId] = useState<string>("none");
  const [allowResolution, setAllowResolution] = useState(false);
  const [resolutionReasonId, setResolutionReasonId] = useState<string>("none");
  const [allowTasks, setAllowTasks] = useState(false);
  const [promptTasks, setPromptTasks] = useState("");
  const [allowOpportunities, setAllowOpportunities] = useState(false);
  const [promptOpportunities, setPromptOpportunities] = useState("");
  const [allowTickets, setAllowTickets] = useState(false);
  const [promptTickets, setPromptTickets] = useState("");
  const [pipelineId, setPipelineId] = useState<string>("none");
  const [allowedAgentIds, setAllowedAgentIds] = useState<string[]>([]);

  // Follow-up state
  const [allowFollowup, setAllowFollowup] = useState(false);
  const [followupIntervalMinutes, setFollowupIntervalMinutes] = useState<number>(15);
  const [followupMaxAttempts, setFollowupMaxAttempts] = useState<number>(3);
  const [promptFollowup, setPromptFollowup] = useState("");
  const [followupResolutionReasonId, setFollowupResolutionReasonId] = useState<string>("none");

  // Data Fetching
  const { data: agents, isLoading } = useQuery({
    queryKey: ["ai_agents", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select(
          `
          *,
          whatsapp_instances(name, provider, network, units(name, color)),
          departments!ai_agents_department_id_fkey(name)
        `,
        )
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances_list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider, network, unit_id, units(id, name, color)")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
    },
  });

  // Agrupa as instâncias: Sede (Empresa Mãe) e por Unidade
  const groupedInstances = useMemo(() => {
    if (!instances) return { matriz: [], byUnit: {} };

    const matriz: any[] = [];
    const byUnit: Record<string, { unitName: string; unitColor?: string; items: any[] }> = {};

    for (const inst of instances as any[]) {
      if (!inst.unit_id) {
        matriz.push(inst);
      } else {
        const uId = inst.unit_id;
        const uName = (inst.units as any)?.name || "Unidade";
        const uColor = (inst.units as any)?.color;
        if (!byUnit[uId]) {
          byUnit[uId] = { unitName: uName, unitColor: uColor, items: [] };
        }
        byUnit[uId].items.push(inst);
      }
    }

    return { matriz, byUnit };
  }, [instances]);

  const selectedInstance = useMemo(() => {
    if (!instances || instanceId === "all") return null;
    return (instances as any[]).find((i: any) => i.id === instanceId) || null;
  }, [instances, instanceId]);

  const { data: departments } = useQuery({
    queryKey: ["departments_list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: units } = useQuery({
    queryKey: ["units_list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: pipelines } = useQuery({
    queryKey: ["pipelines_list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company_ai_settings", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("ai_settings")
        .eq("id", activeCompanyId!)
        .single();
      if (error) throw error;
      return data?.ai_settings || {};
    },
  });

  const { data: resolutionReasons } = useQuery({
    queryKey: ["resolution_reasons", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resolution_reasons" as any)
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("label");
      if (error) throw error;
      return data;
    },
  });

  const availableModels = companySettings?.chatbot_models || [
    "meta-llama/llama-3-8b-instruct:free",
    "google/gemma-7b-it:free",
  ];

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setAiType("Vendedor / SDR");
    setDescription("");
    setInstanceId("all");
    setDepartmentId("all");
    setUnitId("all");
    setProvider("default");
    setModel("default");
    setMaxTokens(4096);
    setPromptPersonality("");
    setPromptInstructions("");
    setPromptExtraInfo("");
    setPromptHandoff("");
    setPromptResolution("");
    setPromptReceiveHandoff("");
    setIsActive(true);
    setActiveByDefault(false);
    setAllowHandoff(false);
    setHandoffDepartmentId("none");
    setAllowResolution(false);
    setResolutionReasonId("none");
    setAllowTasks(false);
    setPromptTasks("");
    setAllowOpportunities(false);
    setPromptOpportunities("");
    setAllowTickets(false);
    setPromptTickets("");
    setPipelineId("none");
    setAllowedAgentIds([]);
    setAllowFollowup(false);
    setFollowupIntervalMinutes(15);
    setFollowupMaxAttempts(2);
    setPromptFollowup("");
    setFollowupResolutionReasonId("none");
  };

  const handleEdit = (agent: any) => {
    setEditingId(agent.id);
    setName(agent.name);
    setAiType(agent.ai_type);
    setDescription(agent.description || "");
    setInstanceId(agent.instance_id || "all");
    setDepartmentId(agent.department_id || "all");
    setUnitId(agent.unit_id || "all");
    setProvider(agent.provider || "default");
    setModel(agent.model || "default");
    setMaxTokens(agent.max_tokens || 4096);
    setPromptPersonality(agent.prompt_personality || "");
    setPromptInstructions(agent.prompt_instructions || "");
    setPromptExtraInfo(agent.prompt_extra_info || "");
    setPromptHandoff(agent.prompt_handoff || "");
    setPromptResolution(agent.prompt_resolution || "");
    setPromptReceiveHandoff(agent.prompt_receive_handoff || "");
    setIsActive(agent.is_active);
    setActiveByDefault(agent.active_by_default);
    setIsMainAgent(agent.is_main_agent || false);
    setAllowHandoff(agent.allow_handoff || false);
    setHandoffDepartmentId(agent.handoff_department_id || "none");
    setAllowResolution(agent.allow_resolution || false);
    setResolutionReasonId(agent.resolution_reason_id || "none");
    setAllowTasks(agent.allow_tasks || false);
    setPromptTasks(agent.prompt_tasks || "");
    setAllowOpportunities(agent.allow_opportunities || false);
    setPromptOpportunities(agent.prompt_opportunities || "");
    setAllowTickets(agent.allow_tickets || false);
    setPromptTickets(agent.prompt_tickets || "");
    setPipelineId(agent.pipeline_id || "none");
    setAllowedAgentIds(agent.allowed_agent_ids || []);
    setAllowFollowup(agent.allow_followup || false);
    setFollowupIntervalMinutes(agent.followup_interval_minutes || 15);
    setFollowupMaxAttempts(agent.followup_max_attempts || 3);
    setPromptFollowup(agent.prompt_followup || "");
    setFollowupResolutionReasonId(agent.followup_resolution_reason_id || "none");
    setIsModalOpen(true);
  };

  const saveAgent = useMutation({
    mutationFn: async () => {
      if (!name || !aiType || !model) throw new Error("Nome, Tipo e Modelo são obrigatórios");
      if (allowOpportunities && (!pipelineId || pipelineId === "none")) {
        throw new Error(
          "Selecione um Funil de CRM para o agente quando a criação de oportunidades estiver ativada.",
        );
      }

      const payload = {
        company_id: activeCompanyId!,
        name,
        ai_type: aiType,
        description,
        instance_id: instanceId === "all" ? null : instanceId,
        department_id: departmentId === "all" ? null : departmentId,
        unit_id: unitId === "all" ? null : unitId,
        provider,
        model,
        max_tokens: maxTokens,
        prompt_personality: promptPersonality,
        prompt_instructions: promptInstructions,
        prompt_extra_info: promptExtraInfo,
        prompt_handoff: null,
        prompt_resolution: null,
        prompt_receive_handoff: null,
        is_active: isActive,
        active_by_default: activeByDefault,
        is_main_agent: isMainAgent,
        allow_handoff: allowHandoff,
        handoff_department_id: handoffDepartmentId === "none" ? null : handoffDepartmentId,
        allow_resolution: allowResolution,
        resolution_reason_id: resolutionReasonId === "none" ? null : resolutionReasonId,
        allow_tasks: allowTasks,
        prompt_tasks: null,
        allow_opportunities: allowOpportunities,
        prompt_opportunities: null,
        allow_tickets: allowTickets,
        prompt_tickets: null,
        pipeline_id: pipelineId === "none" ? null : pipelineId,
        allowed_agent_ids: allowedAgentIds.length > 0 ? allowedAgentIds : null,
        allow_followup: allowFollowup,
        followup_interval_minutes: followupIntervalMinutes,
        followup_max_attempts: followupMaxAttempts,
        prompt_followup: promptFollowup,
        followup_resolution_reason_id:
          followupResolutionReasonId === "none" ? null : followupResolutionReasonId,
      };

      if (isMainAgent) {
        await supabase
          .from("ai_agents")
          .update({ is_main_agent: false })
          .eq("company_id", activeCompanyId!)
          .neq("id", editingId || "00000000-0000-0000-0000-000000000000");
      }

      if (editingId) {
        const { error } = await supabase.from("ai_agents").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_agents").insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Agente atualizado!" : "Agente criado!");
      setIsModalOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["ai_agents"] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message }),
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente excluído.");
      qc.invalidateQueries({ queryKey: ["ai_agents"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Agentes de Inteligência Artificial</h3>
          <p className="text-sm text-muted-foreground">
            Crie e configure IAs para diferentes departamentos e instâncias.
          </p>
        </div>
        <Dialog
          open={isModalOpen}
          onOpenChange={(open) => {
            if (!open) resetForm();
            setIsModalOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Agente" : "Novo Agente de IA"}</DialogTitle>
              <DialogDescription>
                Configure as informações e o comportamento do agente.
              </DialogDescription>
            </DialogHeader>
            <TooltipProvider>
              <Tabs defaultValue="general" className="w-full py-4">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  <TabsTrigger value="behavior">Comportamento</TabsTrigger>
                  <TabsTrigger value="followup">Follow-ups</TabsTrigger>
                  <TabsTrigger value="automation">Ferramentas (Tools)</TabsTrigger>
                </TabsList>

                {/* Aba Geral */}
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nome do Agente *</label>
                      <Input
                        placeholder="Ex: Agente - Agendamento"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo / Função *</label>
                      <Input
                        placeholder="Ex: Agendamentos, Suporte..."
                        value={aiType}
                        onChange={(e) => setAiType(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-medium">
                        Resumo da Função (Para colegas de IA)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 ml-1 inline text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Descreva o que este agente faz em 1 frase. Isso será enviado para outras
                            IAs saberem quando devem transferir para ele. Ex: "Responsável por lidar
                            com finanças, boletos e pagamentos."
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <Input
                        placeholder="Ex: Responsável por gerenciar agendamentos e horários..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Provedor *</label>
                      <Select value={provider} onValueChange={setProvider}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o provedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Padrão da Empresa (Recomendado)</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Modelo de IA *</label>
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o modelo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Padrão da Plataforma</SelectItem>
                          {availableModels.map((mod: string) => (
                            <SelectItem key={mod} value={mod}>
                              {mod}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Máx Tokens (Saída)</label>
                      <Input
                        type="number"
                        placeholder="Ex: 4096"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center justify-between">
                        <span>Canal de Atendimento / Instância</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          Onde a IA irá responder
                        </span>
                      </label>
                      <Select value={instanceId} onValueChange={setInstanceId}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Todos os Canais (Atende qualquer canal)">
                            {instanceId === "all" || !selectedInstance ? (
                              <div className="flex items-center gap-2 truncate">
                                <Globe className="h-4 w-4 text-primary shrink-0" />
                                <span className="font-medium text-xs sm:text-sm truncate">
                                  Todos os Canais (Atende qualquer canal/instância)
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between w-full gap-2 pr-1">
                                <div className="flex items-center gap-2 truncate">
                                  <ProviderIcon
                                    provider={selectedInstance.provider}
                                    network={selectedInstance.network}
                                    className="h-4 w-4 shrink-0"
                                  />
                                  <span className="font-medium text-xs sm:text-sm truncate">
                                    {selectedInstance.name || selectedInstance.instance_name}
                                  </span>
                                </div>
                                {selectedInstance.units?.name ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4"
                                    style={
                                      selectedInstance.units.color
                                        ? { borderColor: `${selectedInstance.units.color}40` }
                                        : undefined
                                    }
                                  >
                                    {selectedInstance.units.name}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4 bg-muted/40 text-muted-foreground"
                                  >
                                    Empresa Mãe
                                  </Badge>
                                )}
                              </div>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="z-[100] max-h-[320px]">
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-medium">Todos os Canais (Atende Geral)</span>
                            </div>
                          </SelectItem>
                          <SelectSeparator />

                          {groupedInstances.matriz.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
                                <Building2 className="h-3.5 w-3.5 text-primary/70" />
                                <span>Sede / Empresa Mãe</span>
                              </SelectLabel>
                              {groupedInstances.matriz.map((inst: any) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  <div className="flex items-center justify-between w-full gap-2 pr-2">
                                    <div className="flex items-center gap-2 truncate">
                                      <ProviderIcon
                                        provider={inst.provider}
                                        network={inst.network}
                                        className="h-4 w-4 shrink-0"
                                      />
                                      <span className="font-medium truncate">
                                        {inst.name || inst.instance_name}
                                      </span>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4 bg-muted/40 text-muted-foreground"
                                    >
                                      Empresa Mãe
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}

                          {Object.entries(groupedInstances.byUnit).map(([uId, group], index) => (
                            <SelectGroup key={uId}>
                              {(groupedInstances.matriz.length > 0 || index > 0) && (
                                <SelectSeparator />
                              )}
                              <SelectLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
                                <MapPin
                                  className="h-3.5 w-3.5 shrink-0"
                                  style={{ color: group.unitColor || "#6366f1" }}
                                />
                                <span>{group.unitName}</span>
                              </SelectLabel>
                              {group.items.map((inst: any) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  <div className="flex items-center justify-between w-full gap-2 pr-2">
                                    <div className="flex items-center gap-2 truncate">
                                      <ProviderIcon
                                        provider={inst.provider}
                                        network={inst.network}
                                        className="h-4 w-4 shrink-0"
                                      />
                                      <span className="font-medium truncate">
                                        {inst.name || inst.instance_name}
                                      </span>
                                    </div>
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4"
                                      style={
                                        group.unitColor
                                          ? { borderColor: `${group.unitColor}40` }
                                          : undefined
                                      }
                                    >
                                      {group.unitName}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Departamento</label>
                      <Select value={departmentId} onValueChange={setDepartmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os departamentos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os Departamentos</SelectItem>
                          {departments?.map((dept: any) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Unidade</label>
                      <Select value={unitId} onValueChange={setUnitId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todas as unidades" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as Unidades</SelectItem>
                          {units?.map((unit: any) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Ativar Agente Geral</label>
                      <p className="text-xs text-muted-foreground">
                        Desligue para pausar o agente completamente. Ele não responderá nenhuma
                        mensagem.
                      </p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">
                        Assumir novas conversas automaticamente
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Se desativado, a IA começará desligada e precisará ser ativada manualmente
                        na tela de chat.
                      </p>
                    </div>
                    <Switch checked={activeByDefault} onCheckedChange={setActiveByDefault} />
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg border-primary/20 bg-primary/5">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium text-primary">
                        Agente Principal (Triagem)
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Este é o agente principal que recebe o cliente inicialmente. Ao ativar este,
                        outros agentes principais desta instância serão desativados (recomendável
                        apenas 1 por unidade/instância).
                      </p>
                    </div>
                    <Switch checked={isMainAgent} onCheckedChange={setIsMainAgent} />
                  </div>
                </TabsContent>

                {/* Aba Comportamento */}
                <TabsContent value="behavior" className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        1. Personalidade do Agente
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs space-y-2 text-xs">
                            <p>
                              <strong>Exemplo:</strong> Você é o assistente principal de vendas.
                              Você deve ser educado e amigável.
                            </p>
                            <p>
                              Neste campo, você define o tom e as diretrizes principais de
                              comportamento da IA.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <Textarea
                        placeholder="Ex: Você é um assistente de suporte gentil e prestativo..."
                        value={promptPersonality}
                        onChange={(e) => setPromptPersonality(e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        2. Instruções de Atendimento e Ações
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm space-y-2 text-xs">
                            <p>Aqui você instrui o comportamento e as diretrizes da IA.</p>
                            <p>
                              <strong>Ferramentas Nativas (Tools):</strong> O agente possui
                              ferramentas estruturadas para transferir atendimento, delegar a
                              colegas e gerenciar oportunidades e tarefas no CRM de forma
                              automática.
                            </p>
                            <p>
                              <strong>Sem tags no texto:</strong> Não instrua tags como [TRANSFERIR]
                              ou [CRIAR_OPORTUNIDADE]. A IA utiliza Function Calling nativo e mantém
                              as mensagens para o cliente sempre limpas e humanizadas.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </label>
                      <Textarea
                        placeholder="Ex: Peça o CPF do cliente antes de responder. Responda em no máximo 2 parágrafos..."
                        value={promptInstructions}
                        onChange={(e) => setPromptInstructions(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        3. Informações Adicionais (Base de Conhecimento)
                      </label>
                      <Textarea
                        placeholder="Ex: Nossos horários de atendimento são de segunda a sexta, das 8h às 18h..."
                        value={promptExtraInfo}
                        onChange={(e) => setPromptExtraInfo(e.target.value)}
                        className="min-h-[120px]"
                      />
                    </div>
                    <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground border">
                      <span className="font-semibold text-foreground">
                        Variáveis dinâmicas suportadas nos prompts:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{primeiro_nome}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{nome_cliente}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{unidade}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{empresa}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{telefone}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{endereco}}"}
                        </code>
                        <code className="bg-background px-1.5 py-0.5 rounded border text-[10px]">
                          {"{{horarios}}"}
                        </code>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Aba Follow-ups */}
                <TabsContent value="followup" className="space-y-4">
                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          Ativar Follow-ups Automáticos
                        </label>
                        <p className="text-xs text-muted-foreground">
                          A IA mandará mensagens cobrando o cliente se ele não responder após um
                          tempo.
                        </p>
                      </div>
                      <Switch checked={allowFollowup} onCheckedChange={setAllowFollowup} />
                    </div>

                    {allowFollowup && (
                      <>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                              <CornerDownRight className="h-3 w-3" />
                              Intervalo de Espera (minutos)
                            </label>
                            <Select
                              value={followupIntervalMinutes.toString()}
                              onValueChange={(val) => setFollowupIntervalMinutes(parseInt(val))}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione o tempo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5 minutos</SelectItem>
                                <SelectItem value="10">10 minutos</SelectItem>
                                <SelectItem value="15">15 minutos (Padrão)</SelectItem>
                                <SelectItem value="30">30 minutos</SelectItem>
                                <SelectItem value="60">60 minutos (1 hora)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                              <CornerDownRight className="h-3 w-3" />
                              Máximo de Tentativas
                            </label>
                            <Select
                              value={followupMaxAttempts.toString()}
                              onValueChange={(val) => setFollowupMaxAttempts(parseInt(val))}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione as tentativas" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 tentativa</SelectItem>
                                <SelectItem value="2">2 tentativas</SelectItem>
                                <SelectItem value="3">3 tentativas (Recomendado)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t">
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <CornerDownRight className="h-3 w-3" />
                            Motivo de Encerramento por Inatividade
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-2 text-xs">
                                <p>
                                  Quando a IA encerrar a conversa por falta de resposta do cliente,
                                  este motivo será registrado na sessão.
                                </p>
                                <p>
                                  Diferente do motivo de encerramento de sucesso configurado na aba
                                  Skills.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </label>
                          <Select
                            value={followupResolutionReasonId}
                            onValueChange={setFollowupResolutionReasonId}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecione um motivo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Padrão (Sem motivo específico)</SelectItem>
                              {resolutionReasons?.map((reason: any) => (
                                <SelectItem key={reason.id} value={reason.id}>
                                  {reason.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2 pt-4 border-t">
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <CornerDownRight className="h-3 w-3" />
                            Instrução de Comportamento do Follow-up
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-2 text-xs">
                                <p>
                                  Quando o sistema acionar o follow-up, a IA usará este contexto
                                  para saber como falar com o cliente.
                                </p>
                                <p>
                                  Você pode pedir para ela ser insistente, gentil, ou usar algum
                                  argumento de escassez.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </label>
                          <Textarea
                            className="min-h-[120px] text-xs font-mono"
                            placeholder="Ex: Ao cobrar o cliente, seja muito amigável. Pergunte se deu certo e se ele precisa de ajuda..."
                            value={promptFollowup}
                            onChange={(e) => setPromptFollowup(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Deixe em branco para usar o comportamento padrão (amigável/direto).
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Aba Ferramentas (Tools) */}
                <TabsContent value="automation" className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-3.5 flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-foreground">
                        Ferramentas Nativas & Function Calling (Padrão MCP)
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        O agente executa ações através de ferramentas nativas estruturadas. Não é
                        necessário escrever prompts para acioná-las: o modelo LLM decide
                        autonomamente quando chamar cada ferramenta com base no contexto e nas
                        definições do sistema.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Tool: Delegação Multi-Agente */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-primary/10 text-primary">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">Delegação Multi-Agente</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-primary/30 text-primary"
                              >
                                delegar_para_outro_agente_ia
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Permite ao agente transferir a conversa para outros agentes de IA
                              especialistas da empresa.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t">
                        <label className="text-xs font-medium text-muted-foreground block mb-2">
                          Selecione os agentes colegas disponíveis para delegação:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {agents
                            ?.filter((a: any) => a.id !== editingId)
                            .map((a: any) => (
                              <div
                                key={a.id}
                                className="flex items-center space-x-2 border rounded-md p-2 bg-muted/20 hover:bg-muted/40 transition-colors"
                              >
                                <Checkbox
                                  id={`agent-${a.id}`}
                                  checked={allowedAgentIds.includes(a.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setAllowedAgentIds((prev) => [...prev, a.id]);
                                    } else {
                                      setAllowedAgentIds((prev) =>
                                        prev.filter((id) => id !== a.id),
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`agent-${a.id}`}
                                  className="text-xs font-medium leading-none cursor-pointer flex-1"
                                >
                                  {a.name}{" "}
                                  <span className="text-muted-foreground font-normal">
                                    ({a.ai_type})
                                  </span>
                                </label>
                              </div>
                            ))}
                          {agents?.filter((a: any) => a.id !== editingId).length === 0 && (
                            <p className="text-xs text-muted-foreground col-span-2 py-1">
                              Nenhum outro agente cadastrado na empresa.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tool: Transferência Humana (Handoff) */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <UserCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Transferência para Humano (Handoff)
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400"
                              >
                                transferir_atendimento
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Transfere o atendimento para atendentes humanos quando o cliente pedir
                              ou o assunto fugir do escopo.
                            </p>
                          </div>
                        </div>
                        <Switch checked={allowHandoff} onCheckedChange={setAllowHandoff} />
                      </div>

                      {allowHandoff && (
                        <div className="pt-3 border-t">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <CornerDownRight className="h-3 w-3" />
                              Departamento de Destino
                            </label>
                            <Select
                              value={handoffDepartmentId}
                              onValueChange={setHandoffDepartmentId}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Mesmo departamento atual" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Mesmo departamento atual</SelectItem>
                                {departments?.map((dept: any) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tool: Encerramento de Atendimento */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-green-500/10 text-green-600 dark:text-green-500">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Encerramento de Atendimento
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-green-500/30 text-green-600 dark:text-green-500"
                              >
                                encerrar_atendimento
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Encerra a sessão e finaliza o atendimento quando a dúvida for sanada
                              ou o cliente se despedir.
                            </p>
                          </div>
                        </div>
                        <Switch checked={allowResolution} onCheckedChange={setAllowResolution} />
                      </div>

                      {allowResolution && (
                        <div className="pt-3 border-t">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <CornerDownRight className="h-3 w-3" />
                              Motivo de Encerramento (Sucesso)
                            </label>
                            <Select
                              value={resolutionReasonId}
                              onValueChange={setResolutionReasonId}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Selecione um motivo de encerramento" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Padrão (Sem Motivo Específico)</SelectItem>
                                {resolutionReasons?.map((reason: any) => (
                                  <SelectItem key={reason.id} value={reason.id}>
                                    {reason.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tool: Oportunidades no CRM */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-500">
                            <BadgeDollarSign className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Gestão de Oportunidades no CRM
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-500"
                              >
                                criar_oportunidade / atualizar_oportunidade
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Cria e move cards no funil comercial assim que o lead demonstrar
                              interesse ou pedir proposta.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={allowOpportunities}
                          onCheckedChange={setAllowOpportunities}
                        />
                      </div>

                      {allowOpportunities && (
                        <div className="pt-3 border-t">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <CornerDownRight className="h-3 w-3" />
                              Funil (Pipeline) de Operação do Agente *
                            </label>
                            <Select value={pipelineId} onValueChange={setPipelineId}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Selecione o Funil" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Selecione um funil comercial</SelectItem>
                                {pipelines?.map((pipe: any) => (
                                  <SelectItem key={pipe.id} value={pipe.id}>
                                    {pipe.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tool: Criação de Tarefas no CRM */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-500">
                            <CalendarCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Tarefas e Lembretes no CRM
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-blue-500/30 text-blue-600 dark:text-blue-500"
                              >
                                criar_tarefa
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Agenda tarefas e lembretes para a equipe com prazos flexíveis (ex:
                              amanhã às 14h, em 2 dias).
                            </p>
                          </div>
                        </div>
                        <Switch checked={allowTasks} onCheckedChange={setAllowTasks} />
                      </div>
                    </div>

                    {/* Tool: Abertura de Tickets */}
                    <div className="border rounded-lg p-4 space-y-3 bg-card shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            <Ticket className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                Abertura de Chamados (Tickets)
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400"
                              >
                                abrir_ticket
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Abre tickets com prioridade e departamento para falhas técnicas, links
                              com erro ou reclamações graves.
                            </p>
                          </div>
                        </div>
                        <Switch checked={allowTickets} onCheckedChange={setAllowTickets} />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </TooltipProvider>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveAgent.mutate()}
                disabled={saveAgent.isPending || !name || !aiType || !model}
              >
                Salvar Agente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando agentes...</div>
      ) : agents?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent: any) => (
            <Card
              key={agent.id}
              className={`flex flex-col ${!agent.is_active ? "opacity-60" : ""}`}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary shrink-0" />
                    <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                    {agent.is_main_agent && (
                      <Badge className="text-[10px] h-5 bg-blue-600 hover:bg-blue-700 shrink-0">
                        Principal
                      </Badge>
                    )}
                  </div>
                  {!agent.is_active && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Inativo
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs font-medium">
                  Tipo: {agent.ai_type}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 pb-4">
                <div className="text-xs space-y-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Canal / Instância:</span>
                    {agent.whatsapp_instances ? (
                      <span className="font-medium inline-flex items-center gap-1.5 truncate max-w-[150px]">
                        <ProviderIcon
                          provider={agent.whatsapp_instances.provider}
                          network={agent.whatsapp_instances.network}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        <span className="truncate">{agent.whatsapp_instances.name}</span>
                        {agent.whatsapp_instances.units?.name && (
                          <span
                            className="text-[10px] px-1 py-0 rounded font-normal shrink-0"
                            style={{
                              backgroundColor: agent.whatsapp_instances.units.color
                                ? `${agent.whatsapp_instances.units.color}20`
                                : undefined,
                              color: agent.whatsapp_instances.units.color || undefined,
                              border: `1px solid ${
                                agent.whatsapp_instances.units.color
                                  ? `${agent.whatsapp_instances.units.color}40`
                                  : "currentColor"
                              }`,
                            }}
                          >
                            {agent.whatsapp_instances.units.name}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="font-medium inline-flex items-center gap-1.5 text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span>Todos os Canais</span>
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Departamento:</span>
                    <span className="font-medium truncate max-w-[120px]">
                      {agent.departments?.name || "Todos"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modelo:</span>
                    <span className="font-medium truncate max-w-[120px]">{agent.model}</span>
                  </div>
                  {(agent.allow_handoff ||
                    agent.allow_resolution ||
                    agent.allow_tasks ||
                    agent.allow_opportunities ||
                    agent.allow_tickets) && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-border/40">
                      {agent.allow_handoff && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          Transfere
                        </Badge>
                      )}
                      {agent.allow_resolution && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          Encerra
                        </Badge>
                      )}
                      {agent.allow_tasks && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          Tarefas
                        </Badge>
                      )}
                      {agent.allow_opportunities && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          CRM
                        </Badge>
                      )}
                      {agent.allow_tickets && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-purple-500/40 text-purple-600 dark:text-purple-400"
                        >
                          Tickets
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              <div className="p-4 pt-0 mt-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEdit(agent)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Deseja realmente excluir este agente?"))
                      deleteAgent.mutate(agent.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-medium">Nenhum Agente de IA</h3>
              <p className="text-sm text-muted-foreground">
                Você ainda não configurou nenhum agente inteligente.
              </p>
            </div>
            <Button onClick={() => setIsModalOpen(true)}>Criar Primeiro Agente</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
