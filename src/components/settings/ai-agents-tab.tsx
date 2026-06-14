import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Bot, CheckCircle2, CornerDownRight } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";

export function AiAgentsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [aiType, setAiType] = useState("");
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
  const [isActive, setIsActive] = useState(true);
  const [activeByDefault, setActiveByDefault] = useState(false);
  const [allowHandoff, setAllowHandoff] = useState(false);
  const [handoffDepartmentId, setHandoffDepartmentId] = useState<string>("none");
  const [allowResolution, setAllowResolution] = useState(false);
  const [resolutionReasonId, setResolutionReasonId] = useState<string>("none");

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
    setAiType("");
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
    setIsActive(true);
    setActiveByDefault(false);
    setAllowHandoff(false);
    setHandoffDepartmentId("none");
    setAllowResolution(false);
    setResolutionReasonId("none");
  };

  const handleEdit = (agent: any) => {
    setEditingId(agent.id);
    setName(agent.name);
    setAiType(agent.ai_type);
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
    setIsActive(agent.is_active);
    setActiveByDefault(agent.active_by_default);
    setAllowHandoff(agent.allow_handoff || false);
    setHandoffDepartmentId(agent.handoff_department_id || "none");
    setAllowResolution(agent.allow_resolution || false);
    setResolutionReasonId(agent.resolution_reason_id || "none");
    setIsModalOpen(true);
  };

  const saveAgent = useMutation({
    mutationFn: async () => {
      if (!name || !aiType || !model) throw new Error("Nome, Tipo e Modelo são obrigatórios");
      
      const payload = {
        company_id: profile!.company_id!,
        name,
        ai_type: aiType,
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
        is_active: isActive,
        active_by_default: activeByDefault,
        allow_handoff: allowHandoff,
        handoff_department_id: handoffDepartmentId === "none" ? null : handoffDepartmentId,
        allow_resolution: allowResolution,
        resolution_reason_id: resolutionReasonId === "none" ? null : resolutionReasonId
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
            <Tabs defaultValue="general" className="w-full py-4">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="behavior">Comportamento</TabsTrigger>
                <TabsTrigger value="automation">Automação e Regras</TabsTrigger>
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
              </TabsContent>

              {/* Aba Comportamento */}
              <TabsContent value="behavior" className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">1. Personalidade do Agente</label>
                    <Textarea 
                      placeholder="Ex: Você é um assistente de suporte gentil e prestativo..." 
                      value={promptPersonality} 
                      onChange={e => setPromptPersonality(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">2. Instruções de Atendimento</label>
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

              {/* Aba Automação */}
              <TabsContent value="automation" className="space-y-4">
                <div className="space-y-4">
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
                </div>
              </TabsContent>
            </Tabs>
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
                    <Bot className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                  </div>
                  {!agent.is_active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
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
