import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Bot, CheckCircle2, CornerDownRight, Info, CalendarCheck, BadgeDollarSign, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";

export function AiAgentsTab() {
  const { profile } = useAuth();
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
  const [pipelineId, setPipelineId] = useState<string>("none");
  const [allowedAgentIds, setAllowedAgentIds] = useState<string[]>([]);
  
  // Follow-up state
  const [allowFollowup, setAllowFollowup] = useState(false);
  const [followupIntervalMinutes, setFollowupIntervalMinutes] = useState<number>(15);
  const [followupMaxAttempts, setFollowupMaxAttempts] = useState<number>(2);
  const [promptFollowup, setPromptFollowup] = useState("");

  // Data Fetching
  const { data: agents, isLoading } = useQuery({
    queryKey: ["ai_agents", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select(`
          *,
          whatsapp_instances(name),
          departments!ai_agents_department_id_fkey(name)
        `)
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances_list", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("id, name").eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data;
    }
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_list", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data;
    }
  });

  const { data: units } = useQuery({
    queryKey: ["units_list", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id, name").eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data;
    }
  });

  const { data: pipelines } = useQuery({
    queryKey: ["pipelines_list", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, name").eq("company_id", profile!.company_id!);
      if (error) throw error;
      return data;
    }
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company_ai_settings", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("ai_settings").eq("id", profile!.company_id!).single();
      if (error) throw error;
      return data?.ai_settings || {};
    }
  });

  const { data: resolutionReasons } = useQuery({
    queryKey: ["resolution_reasons", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("resolution_reasons" as any).select("*").eq("company_id", profile!.company_id!).order("label");
      if (error) throw error;
      return data;
    }
  });

  const availableModels = companySettings?.chatbot_models || ["meta-llama/llama-3-8b-instruct:free", "google/gemma-7b-it:free"];

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
    setPipelineId("none");
    setAllowedAgentIds([]);
    setAllowFollowup(false);
    setFollowupIntervalMinutes(15);
    setFollowupMaxAttempts(2);
    setPromptFollowup("");
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
    setPipelineId(agent.pipeline_id || "none");
    setAllowedAgentIds(agent.allowed_agent_ids || []);
    setAllowFollowup(agent.allow_followup || false);
    setFollowupIntervalMinutes(agent.followup_interval_minutes || 15);
    setFollowupMaxAttempts(agent.followup_max_attempts || 2);
    setPromptFollowup(agent.prompt_followup || "");
    setIsModalOpen(true);
  };

  const saveAgent = useMutation({
    mutationFn: async () => {
      if (!name || !aiType || !model) throw new Error("Nome, Tipo e Modelo são obrigatórios");
      
      const payload = {
        company_id: profile!.company_id!,
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
        prompt_handoff: promptHandoff,
        prompt_resolution: promptResolution,
        prompt_receive_handoff: promptReceiveHandoff,
        is_active: isActive,
        active_by_default: activeByDefault,
        is_main_agent: isMainAgent,
        allow_handoff: allowHandoff,
        handoff_department_id: handoffDepartmentId === "none" ? null : handoffDepartmentId,
        allow_resolution: allowResolution,
        resolution_reason_id: resolutionReasonId === "none" ? null : resolutionReasonId,
        allow_tasks: allowTasks,
        prompt_tasks: promptTasks,
        allow_opportunities: allowOpportunities,
        prompt_opportunities: promptOpportunities,
        pipeline_id: pipelineId === "none" ? null : pipelineId,
        allowed_agent_ids: allowedAgentIds.length > 0 ? allowedAgentIds : null,
        allow_followup: allowFollowup,
        followup_interval_minutes: followupIntervalMinutes,
        followup_max_attempts: followupMaxAttempts,
        prompt_followup: promptFollowup
      };

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
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
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
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message })
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Agentes de Inteligência Artificial</h3>
          <p className="text-sm text-muted-foreground">Crie e configure IAs para diferentes departamentos e instâncias.</p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsModalOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Agente" : "Novo Agente de IA"}</DialogTitle>
              <DialogDescription>Configure as informações e o comportamento do agente.</DialogDescription>
            </DialogHeader>
            <TooltipProvider>
            <Tabs defaultValue="general" className="w-full py-4">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="behavior">Comportamento</TabsTrigger>
                <TabsTrigger value="followup">Follow-ups</TabsTrigger>
                <TabsTrigger value="automation">Skills</TabsTrigger>
              </TabsList>

              {/* Aba Geral */}
              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome do Agente *</label>
                    <Input placeholder="Ex: Agente - Agendamento" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo / Função *</label>
                    <Input placeholder="Ex: Agendamentos, Suporte..." value={aiType} onChange={e => setAiType(e.target.value)} />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm font-medium">
                      Resumo da Função (Para colegas de IA)
                      <Tooltip>
                        <TooltipTrigger asChild><HelpCircle className="h-4 w-4 ml-1 inline text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Descreva o que este agente faz em 1 frase. Isso será enviado para outras IAs saberem quando devem transferir para ele. Ex: "Responsável por lidar com finanças, boletos e pagamentos."
                        </TooltipContent>
                      </Tooltip>
                    </label>
                    <Input placeholder="Ex: Responsável por gerenciar agendamentos e horários..." value={description} onChange={e => setDescription(e.target.value)} />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provedor *</label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger><SelectValue placeholder="Selecione o provedor" /></SelectTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão da Plataforma</SelectItem>
                        {availableModels.map((mod: string) => (
                          <SelectItem key={mod} value={mod}>{mod}</SelectItem>
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
                      onChange={e => setMaxTokens(parseInt(e.target.value) || 4096)} 
                    />
                  </div>


                  <div className="space-y-2">
                    <label className="text-sm font-medium">Instância do WhatsApp</label>
                    <Select value={instanceId} onValueChange={setInstanceId}>
                      <SelectTrigger><SelectValue placeholder="Todas as instâncias" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Instâncias</SelectItem>
                        {instances?.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Departamento</label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger><SelectValue placeholder="Todos os departamentos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Departamentos</SelectItem>
                        {departments?.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Unidade</label>
                      <Select value={unitId} onValueChange={setUnitId}>
                        <SelectTrigger><SelectValue placeholder="Todas as unidades" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as Unidades</SelectItem>
                          {units?.map((unit: any) => (
                            <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Ativar Agente Geral</label>
                      <p className="text-xs text-muted-foreground">Desligue para pausar o agente completamente. Ele não responderá nenhuma mensagem.</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Assumir novas conversas automaticamente</label>
                      <p className="text-xs text-muted-foreground">Se desativado, a IA começará desligada e precisará ser ativada manualmente na tela de chat.</p>
                    </div>
                    <Switch checked={activeByDefault} onCheckedChange={setActiveByDefault} />
                  </div>

                  <div className="flex items-center justify-between border p-3 rounded-lg border-primary/20 bg-primary/5">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium text-primary">Agente Principal (Triagem)</label>
                      <p className="text-xs text-muted-foreground">Este é o agente principal que recebe o cliente inicialmente. Ao ativar este, outros agentes principais desta instância serão desativados (recomendável apenas 1 por unidade/instância).</p>
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
                          <p><strong>Exemplo:</strong> Você é o assistente principal de vendas. Você deve ser educado e amigável.</p>
                          <p>Neste campo, você define o tom e as diretrizes principais de comportamento da IA.</p>
                        </TooltipContent>
                      </Tooltip>
                    </label>
                    <Textarea 
                      placeholder="Ex: Você é um assistente de suporte gentil e prestativo..." 
                      value={promptPersonality} 
                      onChange={e => setPromptPersonality(e.target.value)}
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
                          <p>Aqui você instrui as permissões especiais da IA.</p>
                          <p><strong>Transferir IA:</strong> O agente detecta outras IAs ativas automaticamente. Você pode pedir para ele: <em>"Se o cliente quiser agendar, transfira usando a tag [TRANSFERIR_AGENTE: id_da_ia]"</em>.</p>
                          <p><strong>Criar Tarefa/Oportunidade:</strong> <em>"Use [CRIAR_TAREFA: Titulo | Descricao | 2024-12-01 10:00]"</em> ou <em>"[CRIAR_OPORTUNIDADE: Venda | 100.50]"</em>.</p>
                        </TooltipContent>
                      </Tooltip>
                    </label>
                    <Textarea 
                      placeholder="Ex: Peça o CPF do cliente antes de responder. Responda em no máximo 2 parágrafos..." 
                      value={promptInstructions} 
                      onChange={e => setPromptInstructions(e.target.value)}
                      className="min-h-[120px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">3. Informações Adicionais (Base de Conhecimento)</label>
                    <Textarea 
                      placeholder="Ex: Nossos horários de atendimento são de segunda a sexta, das 8h às 18h..." 
                      value={promptExtraInfo} 
                      onChange={e => setPromptExtraInfo(e.target.value)}
                      className="min-h-[120px]"
                    />
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
                      <p className="text-xs text-muted-foreground">A IA mandará mensagens cobrando o cliente se ele não responder após um tempo.</p>
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
                            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o tempo" /></SelectTrigger>
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
                            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione as tentativas" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 tentativa</SelectItem>
                              <SelectItem value="2">2 tentativas (Padrão)</SelectItem>
                              <SelectItem value="3">3 tentativas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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
                              <p>Quando o sistema acionar o follow-up, a IA usará este contexto para saber como falar com o cliente.</p>
                              <p>Você pode pedir para ela ser insistente, gentil, ou usar algum argumento de escassez.</p>
                            </TooltipContent>
                          </Tooltip>
                        </label>
                        <Textarea 
                          className="min-h-[120px] text-xs font-mono" 
                          placeholder="Ex: Ao cobrar o cliente, seja muito amigável. Pergunte se deu certo e se ele precisa de ajuda..." 
                          value={promptFollowup} 
                          onChange={e => setPromptFollowup(e.target.value)} 
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Deixe em branco para usar o comportamento padrão (amigável/direto).
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Aba Skills */}
              <TabsContent value="automation" className="space-y-4">
                <div className="space-y-4">
                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-primary" />
                        <label className="text-sm font-medium">Delegação para Outros Agentes (Skills)</label>
                      </div>
                      <p className="text-xs text-muted-foreground">Selecione quais outros agentes esta IA pode acessar e transferir o atendimento. Se nenhum for selecionado, ela não conhecerá os outros agentes da empresa.</p>
                      
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t">
                        {agents?.filter((a: any) => a.id !== editingId).map((a: any) => (
                          <div key={a.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`agent-${a.id}`} 
                              checked={allowedAgentIds.includes(a.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setAllowedAgentIds(prev => [...prev, a.id]);
                                } else {
                                  setAllowedAgentIds(prev => prev.filter(id => id !== a.id));
                                }
                              }}
                            />
                            <label htmlFor={`agent-${a.id}`} className="text-xs font-medium leading-none cursor-pointer">
                              {a.name} <span className="text-muted-foreground">({a.ai_type})</span>
                            </label>
                          </div>
                        ))}
                        {agents?.filter((a: any) => a.id !== editingId).length === 0 && (
                          <p className="text-xs text-muted-foreground col-span-2">Nenhum outro agente disponível na empresa.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Permitir Transferência (Handoff)</label>
                        <p className="text-xs text-muted-foreground">A IA poderá transferir o atendimento para um humano caso não saiba responder.</p>
                      </div>
                      <Switch checked={allowHandoff} onCheckedChange={setAllowHandoff} />
                    </div>
                    {allowHandoff && (
                      <>
                        <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Departamento de Destino
                        </label>
                        <Select value={handoffDepartmentId} onValueChange={setHandoffDepartmentId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Mesmo departamento atual" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Mesmo departamento atual</SelectItem>
                            {departments?.map((dept: any) => (
                              <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Instrução de Transferência [TRANSFERIR]
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-2 text-xs">
                              <p>Quando a IA não souber resolver, ela pode transferir para um humano ou enviar para uma fila.</p>
                              <p><strong>Exemplo:</strong> Se não conseguir ajudar, encerre sua frase com <code>[TRANSFERIR: Precisa de suporte financeiro]</code>.</p>
                              <p>Não confunda com <code>[TRANSFERIR_AGENTE]</code> (que envia para outra IA de forma autônoma).</p>
                            </TooltipContent>
                          </Tooltip>
                        </label>
                        <Textarea 
                          className="min-h-[120px] text-xs font-mono" 
                          placeholder="Ex: Se não souber resolver, use a tag [TRANSFERIR: motivo]..." 
                          value={promptHandoff} 
                          onChange={e => setPromptHandoff(e.target.value)} 
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Deixe em branco para usar o comportamento padrão do sistema.
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Instrução ao Receber Transferência
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-2 text-xs">
                              <p>Instrução que a IA recebe no momento em que um colega transfere um atendimento para ela.</p>
                            </TooltipContent>
                          </Tooltip>
                        </label>
                        <Textarea 
                          className="min-h-[100px] text-xs font-mono" 
                          placeholder="Ex: Um colega transferiu para você. Continue o atendimento da sua área de especialidade." 
                          value={promptReceiveHandoff} 
                          onChange={e => setPromptReceiveHandoff(e.target.value)} 
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Deixe em branco para usar o comportamento padrão do sistema.
                        </p>
                      </div>
                    </>
                    )}
                  </div>
                  
                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                          Permitir Encerramento Automático
                        </label>
                        <p className="text-xs text-muted-foreground">A IA poderá finalizar o ticket sozinha se concluir a solicitação com sucesso.</p>
                      </div>
                      <Switch checked={allowResolution} onCheckedChange={setAllowResolution} />
                    </div>
                    
                    {allowResolution && (
                      <>
                        <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Motivo de Encerramento (Sucesso)
                        </label>
                        <Select value={resolutionReasonId} onValueChange={setResolutionReasonId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um motivo de encerramento" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Padrão (Sem Motivo Especifico)</SelectItem>
                            {resolutionReasons?.map((reason: any) => (
                              <SelectItem key={reason.id} value={reason.id}>{reason.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Instrução de Encerramento [ENCERRAR]
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-2 text-xs">
                              <p>Usado quando a IA resolveu com sucesso e o ticket pode ser finalizado.</p>
                              <p><strong>Exemplo:</strong> Quando todas as dúvidas forem sanadas, escreva <code>[ENCERRAR: Dúvidas tiradas com sucesso]</code>.</p>
                            </TooltipContent>
                          </Tooltip>
                        </label>
                        <Textarea 
                          className="min-h-[120px] text-xs font-mono" 
                          placeholder="Ex: Se o problema for resolvido, use a tag [ENCERRAR: resumo]..." 
                          value={promptResolution} 
                          onChange={e => setPromptResolution(e.target.value)} 
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Deixe em branco para usar o comportamento padrão do sistema.
                        </p>
                      </div>
                    </>
                    )}
                  </div>

                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <CalendarCheck className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                          Permitir Criação de Tarefas
                        </label>
                        <p className="text-xs text-muted-foreground">A IA poderá criar tarefas de follow-up diretamente no CRM.</p>
                      </div>
                      <Switch checked={allowTasks} onCheckedChange={setAllowTasks} />
                    </div>
                    {allowTasks && (
                      <div className="space-y-2 pt-2 border-t">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <CornerDownRight className="h-3 w-3" />
                          Instrução de Tarefas [CRIAR_TAREFA]
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs space-y-2 text-xs">
                              <p>Ensine a IA sobre como criar as tarefas.</p>
                              <p><strong>Formato Obrigatório:</strong> <code>[CRIAR_TAREFA: Título | Descrição | YYYY-MM-DD HH:MM]</code>.</p>
                            </TooltipContent>
                          </Tooltip>
                        </label>
                        <Textarea 
                          className="min-h-[100px] text-xs font-mono" 
                          placeholder="Ex: Para criar uma tarefa, use a tag [CRIAR_TAREFA: Título | Descrição | 2026-12-31 14:00]..." 
                          value={promptTasks} 
                          onChange={e => setPromptTasks(e.target.value)} 
                        />
                        <p className="text-[10px] text-muted-foreground">Deixe em branco para usar o texto padrão do sistema.</p>
                      </div>
                    )}
                  </div>

                  <div className="border rounded-md p-4 space-y-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2">
                          <BadgeDollarSign className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                          Permitir Criação de Oportunidades
                        </label>
                        <p className="text-xs text-muted-foreground">A IA poderá criar oportunidades de negócio (vendas) no funil do contato.</p>
                      </div>
                      <Switch checked={allowOpportunities} onCheckedChange={setAllowOpportunities} />
                    </div>
                    {allowOpportunities && (
                      <>
                        <div className="space-y-2 pt-2 border-t">
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <CornerDownRight className="h-3 w-3" />
                            Funil (Pipeline) do Agente
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-2 text-xs">
                                <p>Selecione em qual Funil este agente irá operar.</p>
                                <p>O agente receberá as etapas deste funil para usar nas tags.</p>
                              </TooltipContent>
                            </Tooltip>
                          </label>
                          <Select value={pipelineId} onValueChange={setPipelineId}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o Funil" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum (Sem Contexto de Funil)</SelectItem>
                              {pipelines?.map((pipe: any) => (
                                <SelectItem key={pipe.id} value={pipe.id}>{pipe.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 pt-2 border-t">
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <CornerDownRight className="h-3 w-3" />
                            Instrução de Oportunidades
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer ml-1" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-2 text-xs">
                                <p>Ensine a IA sobre como criar e gerenciar a oportunidade.</p>
                                <p><strong>Formato Criação:</strong> <code>[CRIAR_OPORTUNIDADE: Título da Venda | Valor Numérico | etapa_id]</code>.</p>
                                <p><strong>Formato Atualização:</strong> <code>[ATUALIZAR_OPORTUNIDADE: oportunidade_id | etapa_id | id_nova_etapa]</code>.</p>
                                <p>A IA receberá os IDs de etapa automaticamente no contexto.</p>
                              </TooltipContent>
                            </Tooltip>
                          </label>
                          <Textarea 
                            className="min-h-[140px] text-xs font-mono" 
                            placeholder="Ex: Quando um lead chegar, crie uma oportunidade usando [CRIAR_OPORTUNIDADE: Nome | 100 | etapa_id]..." 
                            value={promptOpportunities} 
                            onChange={e => setPromptOpportunities(e.target.value)} 
                          />
                          <p className="text-[10px] text-muted-foreground">Você pode usar variáveis no prompt como {`{{nome_cliente}}`} e {`{{telefone}}`}.</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            </TooltipProvider>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveAgent.mutate()} disabled={saveAgent.isPending || !name || !aiType || !model}>
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
            <Card key={agent.id} className={`flex flex-col ${!agent.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary shrink-0" />
                    <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                    {agent.is_main_agent && (
                      <Badge className="text-[10px] h-5 bg-blue-600 hover:bg-blue-700 shrink-0">Principal</Badge>
                    )}
                  </div>
                  {!agent.is_active && <Badge variant="secondary" className="text-[10px] shrink-0">Inativo</Badge>}
                </div>
                <CardDescription className="text-xs font-medium">Tipo: {agent.ai_type}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 pb-4">
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Instância:</span>
                    <span className="font-medium truncate max-w-[120px]">{agent.whatsapp_instances?.name || "Todas"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Departamento:</span>
                    <span className="font-medium truncate max-w-[120px]">{agent.departments?.name || "Todos"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modelo:</span>
                    <span className="font-medium truncate max-w-[120px]">{agent.model}</span>
                  </div>
                </div>
              </CardContent>
              <div className="p-4 pt-0 mt-auto flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(agent)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => {
                  if (confirm("Deseja realmente excluir este agente?")) deleteAgent.mutate(agent.id);
                }}>
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
              <p className="text-sm text-muted-foreground">Você ainda não configurou nenhum agente inteligente.</p>
            </div>
            <Button onClick={() => setIsModalOpen(true)}>Criar Primeiro Agente</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
