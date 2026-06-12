import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, QrCode, Smartphone, Settings, Save, Server, Key, Building, User, Sparkles, Mic, MessageCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evogo, EvoGoClient } from "@/integrations/evogo/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { QrCodeModal } from "@/components/whatsapp/qr-code-modal";
import { QuickMessagesTab } from "@/components/settings/quick-messages-tab";
import { ResolutionReasonsTab } from "@/components/settings/resolution-reasons-tab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DepartmentsTab } from "@/components/settings/departments-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { LabelsTab } from "@/components/settings/labels-tab";
import { CrmTab } from "@/components/settings/crm-tab";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user } = useAuth();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState("");
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [useSignature, setUseSignature] = useState(profile?.use_signature || false);

  const [aiSettings, setAiSettings] = useState({
    keys: { openai: "", groq: "", openrouter: "" },
    engines: { transcription: "none", chatbot: "none" },
    chatbot_models: [
      "meta-llama/llama-3-8b-instruct:free",
      "google/gemma-7b-it:free"
    ],
    active_chatbot_model: ""
  });
  const [newModelInput, setNewModelInput] = useState("");

  const [newCompanyName, setNewCompanyName] = useState("");
  
  // QrCode Modal State
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, evogo_host, evogo_global_token, ai_settings")
        .eq("id", profile!.company_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const { data: newId, error } = await supabase.rpc('create_new_company', {
        company_name: name,
        company_slug: slug,
        user_id: user!.id
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: () => {
      toast.success("Empresa criada com sucesso! Recarregue a página.");
      // Force reload to update auth context
      window.location.reload();
    },
    onError: (e) => toast.error("Erro ao criar empresa", { description: (e as Error).message })
  });

  useEffect(() => {
    if (company) {
      setHost(company.evogo_host || "");
      setToken(company.evogo_global_token || "");
      setNewCompanyName(company.name || "");
      if (company.ai_settings) {
        setAiSettings({
          keys: {
            openai: company.ai_settings.keys?.openai || "",
            groq: company.ai_settings.keys?.groq || "",
            openrouter: company.ai_settings.keys?.openrouter || "",
          },
          engines: {
            transcription: company.ai_settings.engines?.transcription || "none",
            chatbot: company.ai_settings.engines?.chatbot || "none",
          },
          chatbot_models: company.ai_settings.chatbot_models || [
            "meta-llama/llama-3-8b-instruct:free",
            "google/gemma-7b-it:free"
          ],
          active_chatbot_model: company.ai_settings.active_chatbot_model || ""
        });
      }
    }
  }, [company]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ evogo_host: host, evogo_global_token: token })
        .eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas!");
      qc.invalidateQueries({ queryKey: ["company", profile?.company_id] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const saveAiConfig = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ 
          ai_settings: aiSettings
        })
        .eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de IA salvas!");
      qc.invalidateQueries({ queryKey: ["company", profile?.company_id] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const saveCompanyName = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ name: newCompanyName })
        .eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nome da empresa atualizado!");
      qc.invalidateQueries({ queryKey: ["company", profile?.company_id] });
      qc.invalidateQueries({ queryKey: ["company-name", profile?.company_id] }); // Update sidebar
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: (e as Error).message })
  });

  const toggleSignature = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!profile?.id) throw new Error("Sem usuário ativo");
      const { error } = await supabase
        .from("profiles")
        .update({ use_signature: enabled })
        .eq("id", profile.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      setUseSignature(enabled);
      toast.success(enabled ? "Assinatura ativada!" : "Assinatura desativada!");
      // window.location.reload() or refresh auth context if needed, but setUseSignature handles local state
    },
    onError: (e) => {
      setUseSignature(!useSignature); // Revert on error
      toast.error("Erro ao alterar assinatura", { description: (e as Error).message });
    }
  });

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ["whatsapp-instances", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("company_id", profile!.company_id!);
      
      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      else q = q.is("unit_id", null);

      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createInstance = useMutation({
    mutationFn: async (name: string) => {
      if (!profile?.company_id) throw new Error("Sem empresa");
      if (!company?.evogo_host || !company?.evogo_global_token) {
        throw new Error("Configure Host e Token primeiro.");
      }
      
      // Gera o slug técnico com remoção de acentos real e sem espaços
      const slugify = (s: string) => s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\w-]/g, '');
        
      let unitSlugPart = "";
      if (selectedUnitId) {
        const { data: unitData } = await supabase.from("units").select("name").eq("id", selectedUnitId).single();
        if (unitData?.name) {
          unitSlugPart = `-${slugify(unitData.name)}`;
        }
      }

      const technicalName = `${slugify(company.name)}${unitSlugPart}-${slugify(name)}`;

      // Salvar no banco
      const { data, error } = await supabase.from("whatsapp_instances").insert({
        company_id: profile.company_id,
        unit_id: selectedUnitId || null,
        name,
        instance_name: technicalName,
      }).select().single();
      
      if (error) throw error;

      // Chama a EvoGo real
      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      try {
        const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
        const evogoId = evoRes?.data?.id || evoRes?.id;

        if (evogoId) {
          // Salva no banco local com base no domínio que o usuário está acessando
          const webhookUrl = `${window.location.origin}/api/evogo/webhook`;
          
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
      toast.success("Instância global criada!");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  if (!profile?.company_id) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Bem-vindo ao Omni!</CardTitle>
              <CardDescription>Para acessar as configurações, você precisa cadastrar a sua Empresa Mãe primeiro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da Empresa</label>
                <Input 
                  placeholder="Minha Empresa" 
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={() => createCompany.mutate(newCompanyName)}
                disabled={!newCompanyName || createCompany.isPending}
              >
                Cadastrar Empresa
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          {selectedUnitId ? "Configurações da Unidade" : "Configurações Globais"}
        </h2>
      </div>
      
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="general">Geral e Integrações</TabsTrigger>
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          <TabsTrigger value="departments">Departamentos</TabsTrigger>
          <TabsTrigger value="users">Equipe e Acessos</TabsTrigger>
          <TabsTrigger value="labels">Etiquetas</TabsTrigger>
          <TabsTrigger value="ai-transcription">Inteligência Artificial</TabsTrigger>
          <TabsTrigger value="crm">CRM e Funis</TabsTrigger>
          <TabsTrigger value="quick-messages">Mensagens Rápidas</TabsTrigger>
          <TabsTrigger value="resolution-reasons">Motivos de Encerramento</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Company Details */}
          {!selectedUnitId && (
            <Card className="col-span-full lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Detalhes da Empresa
                </CardTitle>
                <CardDescription>
                  Altere o nome da sua empresa matriz.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome da Empresa</label>
                  <Input 
                    placeholder="Minha Empresa" 
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => saveCompanyName.mutate()}
                  disabled={saveCompanyName.isPending || !newCompanyName}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </Button>
              </CardContent>
            </Card>
          )}

          {/* EvoGo API Settings Card - Only visible in Global/Matriz Context */}
          {!selectedUnitId && (
          <Card className="col-span-full lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                API EvoGo (Empresa Mãe)
              </CardTitle>
            <CardDescription>
              Configure o servidor base e o token mestre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Host (URL da API)</label>
              <div className="relative">
                <Server className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="https://api.evogo.com" 
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Global Token</label>
              <div className="relative">
                <Key className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="password"
                  placeholder="Seu token global" 
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={() => saveConfig.mutate()}
              disabled={saveConfig.isPending || isLoadingCompany}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar Credenciais
            </Button>
          </CardContent>
        </Card>
        )}

        {/* Global Instances Card */}
        <Card className={cn("col-span-full", !selectedUnitId && "lg:col-span-2")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Instâncias de WhatsApp
            </CardTitle>
            <CardDescription>
              {selectedUnitId 
                ? "Instâncias de atendimento desta unidade específica."
                : "Instâncias vinculadas diretamente à Empresa Mãe (sem unidade)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Nova Instância</label>
                <Input 
                  placeholder="Nome da conexão (ex: Suporte Central)" 
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && instanceName && company?.evogo_host && !createInstance.isPending) {
                      createInstance.mutate(instanceName);
                    }
                  }}
                />
              </div>
              <Button 
                onClick={() => createInstance.mutate(instanceName)}
                disabled={!instanceName || createInstance.isPending || !company?.evogo_host}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar
              </Button>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Instâncias Ativas</h3>
              {isLoadingInstances ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : instances?.length ? (
                instances.map((inst) => (
                  <InstanceRow 
                    key={inst.id} 
                    instance={inst} 
                    company={company}
                    onConnect={() => {
                      setSelectedInstance(inst);
                      setQrModalOpen(true);
                    }} 
                    onSettings={() => {
                      setSelectedInstance(inst);
                      setSettingsModalOpen(true);
                    }}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma instância global configurada no momento.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="profile" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Preferências de Atendimento
              </CardTitle>
              <CardDescription>
                Configure como suas mensagens serão enviadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between space-x-2 border rounded-lg p-4">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Assinatura de Mensagem</label>
                  <p className="text-xs text-muted-foreground">
                    Adicionar automaticamente seu nome ao final das mensagens enviadas.
                  </p>
                </div>
                <Switch
                  checked={useSignature}
                  onCheckedChange={(v) => toggleSignature.mutate(v)}
                  disabled={toggleSignature.isPending}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <DepartmentsTab />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="labels">
          <LabelsTab />
        </TabsContent>

        <TabsContent value="ai-transcription" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {!selectedUnitId && (
            <>
              {/* Card de Chaves de API */}
              <Card className="col-span-full lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Cofre de Chaves (API)
                  </CardTitle>
                  <CardDescription>
                    Cadastre as chaves dos provedores que deseja utilizar no sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">OpenRouter (Recomendado)</label>
                    <Input 
                      type="password"
                      placeholder="sk-or-v1-..." 
                      value={aiSettings.keys.openrouter}
                      onChange={(e) => setAiSettings({...aiSettings, keys: {...aiSettings.keys, openrouter: e.target.value}})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Groq (Mais Rápido)</label>
                    <Input 
                      type="password"
                      placeholder="gsk_..." 
                      value={aiSettings.keys.groq}
                      onChange={(e) => setAiSettings({...aiSettings, keys: {...aiSettings.keys, groq: e.target.value}})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">OpenAI (Whisper/GPT)</label>
                    <Input 
                      type="password"
                      placeholder="sk-..." 
                      value={aiSettings.keys.openai}
                      onChange={(e) => setAiSettings({...aiSettings, keys: {...aiSettings.keys, openai: e.target.value}})}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Card de Motores */}
              <Card className="col-span-full lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Motores de Inteligência Artificial
                  </CardTitle>
                  <CardDescription>
                    Defina qual provedor de IA será responsável por cada recurso do sistema.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Motor de Transcrição */}
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">Motor de Transcrição de Áudio (Speech-to-Text)</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">O provedor selecionado converterá áudios do WhatsApp em texto automaticamente.</p>
                    <Select 
                      value={aiSettings.engines.transcription} 
                      onValueChange={(val) => setAiSettings({...aiSettings, engines: {...aiSettings.engines, transcription: val}})}
                    >
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue placeholder="Selecione um motor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum (Desativado)</SelectItem>
                        <SelectItem value="groq">Groq (whisper-large-v3-turbo)</SelectItem>
                        <SelectItem value="openai">OpenAI (whisper-1)</SelectItem>
                        <SelectItem value="openrouter">OpenRouter (via groq/whisper)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Motor de Chatbot */}
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">Motor de Chatbot (Respostas e IA)</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">O provedor selecionado gerará as respostas automáticas e análises.</p>
                    <Select 
                      value={aiSettings.engines.chatbot} 
                      onValueChange={(val) => setAiSettings({...aiSettings, engines: {...aiSettings.engines, chatbot: val}})}
                    >
                      <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue placeholder="Selecione um motor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum (Desativado)</SelectItem>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                        <SelectItem value="groq">Groq</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Seleção de Modelo Específico (Se OpenRouter selecionado) */}
                    {aiSettings.engines.chatbot === "openrouter" && (
                      <div className="mt-4 space-y-2 pt-4 border-t border-border/50">
                        <label className="text-sm font-medium">Selecione o Modelo do OpenRouter</label>
                        <div className="flex items-center gap-2 max-w-md">
                          <Select 
                            value={aiSettings.active_chatbot_model} 
                            onValueChange={(val) => setAiSettings({...aiSettings, active_chatbot_model: val})}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Escolha um modelo salvo" />
                            </SelectTrigger>
                            <SelectContent>
                              {aiSettings.chatbot_models.map((mod) => (
                                <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-2 max-w-md">
                          <Input 
                            placeholder="Adicionar novo modelo (ex: anthropic/claude-3-haiku)" 
                            value={newModelInput}
                            onChange={(e) => setNewModelInput(e.target.value)}
                            className="flex-1 h-9"
                          />
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-9"
                            onClick={() => {
                              if (newModelInput && !aiSettings.chatbot_models.includes(newModelInput)) {
                                setAiSettings({
                                  ...aiSettings,
                                  chatbot_models: [...aiSettings.chatbot_models, newModelInput],
                                  active_chatbot_model: newModelInput
                                });
                                setNewModelInput("");
                              }
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button 
                      onClick={() => saveAiConfig.mutate()}
                      disabled={saveAiConfig.isPending || isLoadingCompany}
                      className="w-full sm:w-auto"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Todas Configurações de IA
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
          {selectedUnitId && (
            <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              A transcrição de áudio é configurada de forma global na Empresa Mãe.
            </div>
          )}
        </TabsContent>

        <TabsContent value="crm" className="grid gap-4">
          <CrmTab />
        </TabsContent>

        <TabsContent value="quick-messages" className="grid gap-4 md:grid-cols-2">
          <QuickMessagesTab />
        </TabsContent>

        <TabsContent value="resolution-reasons">
          <ResolutionReasonsTab />
        </TabsContent>
      </Tabs>

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

function InstanceRow({ instance, company, onConnect, onSettings }: { instance: any, company: any, onConnect: () => void, onSettings: () => void }) {
  const qc = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean, type: 'disconnect' | 'delete' | null }>({ open: false, type: null });

  const handleDisconnect = async () => {
    try {
      const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
      await client.logoutInstance(instance.evogo_api_key);
      await supabase.from("whatsapp_instances").update({ status: "disconnected" }).eq("id", instance.id);
      toast.success("Aparelho desconectado.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao desconectar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null });
    }
  };

  const handleDelete = async () => {
    try {
      if (instance.evogo_instance_id) {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.deleteInstance(instance.evogo_instance_id);
      }
      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success("Instância deletada com sucesso.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao deletar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null });
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium leading-none">{instance.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{instance.instance_name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>Status:</span>
          <Badge variant={instance.status === 'connected' ? 'default' : 'secondary'} className="text-[10px] py-0">
            {instance.status}
          </Badge>
        </div>
      </div>
      <div className="flex gap-2">
        {instance.status === 'connected' ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmDialog({ open: true, type: 'disconnect' })} className="text-destructive hover:bg-destructive/10">
            Desconectar
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onConnect}>
            <QrCode className="mr-2 h-4 w-4" />
            Conectar
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onSettings} title="Configurações">
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setConfirmDialog({ open: true, type: 'delete' })} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Deletar Instância">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </Button>
      </div>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'disconnect' ? "Desconectar Aparelho?" : "Deletar Instância?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'disconnect' 
                ? "Isso irá deslogar o WhatsApp do aparelho atual. Você precisará ler o QR Code novamente para conectar."
                : "Isso apagará permanentemente a instância da EvoGo e todos os seus dados não poderão ser recuperados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDialog.type === 'disconnect' ? handleDisconnect : handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmDialog.type === 'disconnect' ? "Sim, Desconectar" : "Sim, Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

