import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, QrCode, Smartphone, Settings, Save, Server, Key, Building, User, Sparkles, Mic, MessageCircle, Zap, Tags, CheckCircle2, Bot, Users, Building2, Loader2, Globe, Facebook } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { evogo, EvoGoClient } from "@/integrations/evogo/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { QrCodeModal } from "@/components/whatsapp/qr-code-modal";
import { QuickMessagesTab } from "@/components/settings/quick-messages-tab";
import { ResolutionReasonsTab } from "@/components/settings/resolution-reasons-tab";
import { InstanceSettingsModal } from "@/components/whatsapp/instance-settings-modal";
import { DepartmentCard } from "@/components/settings/department-card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DepartmentsTab } from "@/components/settings/departments-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { LabelsTab } from "@/components/settings/labels-tab";
import { CrmTab } from "@/components/settings/crm-tab";
import { AiAgentsTab } from "@/components/settings/ai-agents-tab";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user } = useAuth();
  const { selectedUnitId } = useUnit();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [instanceProvider, setInstanceProvider] = useState("evogo");
  const [oficialNumberId, setOficialNumberId] = useState("");
  const [oficialWabaId, setOficialWabaId] = useState("");
  const [oficialToken, setOficialToken] = useState("");
  const [oficialVerifyToken, setOficialVerifyToken] = useState("");
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState("");
  const [useManualToken, setUseManualToken] = useState(false);
  const [host, setHost] = useState("");
  const [stevoHost, setStevoHost] = useState("");
  const [token, setToken] = useState("");
  const [stevoToken, setStevoToken] = useState("");
  const [useSignature, setUseSignature] = useState(profile?.use_signature ?? true);

  const [aiSettings, setAiSettings] = useState({
    keys: { openai: "", groq: "", openrouter: "" },
    engines: { transcription: "none", chatbot: "none" },
    chatbot_models: [
      "meta-llama/llama-3-8b-instruct:free",
      "google/gemma-7b-it:free"
    ],
    active_chatbot_model: "",
    sales_coach_prompt: "",
    sales_coach_model: "",
    sales_coach_instances: [] as string[]
  });
  const [newModelInput, setNewModelInput] = useState("");

  const [newCompanyName, setNewCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyBusinessHours, setCompanyBusinessHours] = useState("");
  const [companyMetaToken, setCompanyMetaToken] = useState("");
  const [companyCustomVars, setCompanyCustomVars] = useState<{key: string, value: string}[]>([]);
  // QrCode Modal State
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (createModalOpen) {
      setMetaAccounts([]);
      setSelectedMetaAccountId("");
      setUseManualToken(false);
      setOficialNumberId("");
      setOficialWabaId("");
      setOficialToken("");
    }
  }, [createModalOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Se for a nossa própria janela de login (callback)
      if (event.origin === window.location.origin) {
        if (event.data?.type === 'META_AUTH_SUCCESS') {
          toast.success("Conta do Facebook vinculada com sucesso!");
          qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
          return;
        }
      }

      // Se for o popup da Meta (para embedded signup)
      if (event.origin === "https://www.facebook.com" || event.origin === "https://web.facebook.com") {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data.type === 'WA_EMBEDDED_SIGNUP') {
            console.log("Embedded Signup Data recebido:", data);
            toast.success("Vínculo do WhatsApp Embedded concluído!");
            qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
          }
        } catch {
          // Ignora
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeCompanyId]);


  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, evogo_host, evogo_global_token, stevo_host, stevo_global_token, meta_system_user_token, ai_settings, document, address, business_hours, custom_variables")
        .eq("id", activeCompanyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (createModalOpen && company?.meta_system_user_token && (instanceProvider === 'instagram' || instanceProvider === 'messenger')) {
      const fetchAccounts = async () => {
        setIsLoadingMeta(true);
        try {
          const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${company.meta_system_user_token}`);
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
      setStevoHost(company.stevo_host || "");
      setToken(company.evogo_global_token || "");
      setStevoToken(company.stevo_global_token || "");
      setNewCompanyName(company.name || "");
      setCompanyDocument(company.document || "");
      setCompanyAddress(company.address || "");
      setCompanyBusinessHours(company.business_hours || "");
      setCompanyMetaToken(company.meta_system_user_token || "");
      
      const vars = company.custom_variables as Record<string, string>;
      if (vars && typeof vars === 'object') {
        setCompanyCustomVars(Object.entries(vars).map(([k, v]) => ({ key: k, value: v as string })));
      } else {
        setCompanyCustomVars([]);
      }

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
          active_chatbot_model: company.ai_settings.active_chatbot_model || "",
          sales_coach_prompt: company.ai_settings.sales_coach_prompt || "",
          sales_coach_model: company.ai_settings.sales_coach_model || "",
          sales_coach_instances: company.ai_settings.sales_coach_instances || []
        });
      }
    }
  }, [company]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ evogo_host: host, evogo_global_token: token, stevo_host: stevoHost, stevo_global_token: stevoToken })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const saveAiConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ 
          ai_settings: aiSettings
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de IA salvas!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const saveCompanyDetails = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      
      const customVarsObj = companyCustomVars.reduce((acc, curr) => {
        if (curr.key.trim()) {
          acc[curr.key.trim()] = curr.value;
        }
        return acc;
      }, {} as Record<string, string>);

      const { error } = await supabase
        .from("companies")
        .update({ 
          name: newCompanyName,
          document: companyDocument,
          address: companyAddress,
          business_hours: companyBusinessHours,
          meta_system_user_token: companyMetaToken,
          custom_variables: customVarsObj
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nome da empresa atualizado!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-name", activeCompanyId] }); // Update sidebar
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
    queryKey: ["whatsapp-instances", activeCompanyId, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("company_id", activeCompanyId!);
      
      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      else q = q.is("unit_id", null);

      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createInstance = useMutation({
    mutationFn: async (payload: { name: string, provider: string, numberId?: string, wabaId?: string, accessToken?: string, verifyToken?: string, customHost?: string, customApiKey?: string }) => {
      const { name, provider, numberId, wabaId, accessToken, verifyToken, customHost, customApiKey } = payload;
      if (!activeCompanyId) throw new Error("Sem empresa");
      if (provider === 'evogo' && (!company?.evogo_host || !company?.evogo_global_token) && !customHost) {
        throw new Error('Configure Host Global ou preencha o Host customizado da instância.');
      }
      if (provider === 'stevo' && (!company?.stevo_host || !company?.stevo_global_token) && !customHost) {
        throw new Error('Configure Host Global ou preencha o Host customizado da instância.');
      }
      if (provider === 'stevo' && !customApiKey && !company?.stevo_global_token) {
        throw new Error('O Stevo requer uma API Key informada ou o Token Global configurado.');
      }

      let finalNumberId = numberId;
      let finalAccessToken = accessToken;
      let finalWabaId = wabaId;

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

      if (!finalAccessToken && company?.meta_system_user_token) {
        finalAccessToken = company.meta_system_user_token;
      }

      let finalVerifyToken = verifyToken;
      if (!finalVerifyToken) {
        finalVerifyToken = `atendi_${Math.random().toString(36).substring(2, 11)}`;
      }

      if ((provider === 'oficial' || provider === 'instagram' || provider === 'messenger') && (!finalNumberId || !finalAccessToken || !finalVerifyToken)) {
        throw new Error("Preencha todos os campos da credencial (ID, Token e Verify Token) ou selecione uma conta da Meta.");
      }
      
      // Gera o slug técnico
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

      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const technicalName = `${slugify(company.name)}${unitSlugPart}-${slugify(name)}-${provider}-${randomSuffix}`;

      let defaultWebhookUrl = null;
      if (provider === 'oficial') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;
      } else if (provider === 'instagram') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/instagram`;
      } else if (provider === 'messenger') {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/messenger`;
      }

      // Salvar no banco
      const { data, error } = await supabase.from("whatsapp_instances").insert({
        company_id: activeCompanyId,
        unit_id: selectedUnitId || null,
        name,
        instance_name: technicalName,
        provider,
        oficial_phone_number_id: finalNumberId,
        oficial_waba_id: finalWabaId || null,
        oficial_access_token: finalAccessToken,
        oficial_verify_token: finalVerifyToken,
        webhook_url: defaultWebhookUrl,
        custom_host: customHost || null,
        ...(customApiKey && provider === "evogo" ? { evogo_api_key: customApiKey } : {}),
        ...(customApiKey && provider === "stevo" ? { stevo_api_key: customApiKey } : {}),
      }).select().single();
      
      if (error) throw error;

      if (provider === 'evogo') {
        const hostToUse = customHost || company.evogo_host;
        const client = new EvoGoClient({ host: hostToUse, token: company.evogo_global_token });
        try {
          let evogoId = null;
          let apiKeyToUse = data.evogo_api_key;
          
          if (customApiKey) {
            apiKeyToUse = customApiKey;
            evogoId = "manual-" + technicalName;
          } else {
            const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
            evogoId = evoRes?.data?.id || evoRes?.id;
          }

          if (evogoId) {
            const webhookUrl = `${window.location.origin}/api/webhooks/evogo`;
          
          await supabase.from("whatsapp_instances").update({
            evogo_instance_id: evogoId,
            webhook_url: webhookUrl
          }).eq("id", data.id);

          await client.connectInstance(webhookUrl, apiKeyToUse).catch(console.error);
          await client.updateAdvancedSettings(evogoId, {
            rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false
          }, apiKeyToUse).catch(console.error);
        }
      } catch (e) {
        console.error("Falha ao criar/configurar na EvoGo, mas salvo no DB", e);
      }
      } else if (provider === 'stevo') {
        const hostToUse = customHost || company.stevo_host;
        const client = new StevoClient({ host: hostToUse, token: company.stevo_global_token });
        try {
          let stevoId = null;
          let apiKeyToUse = data.stevo_api_key;
          
          if (customApiKey) {
            apiKeyToUse = customApiKey;
            stevoId = "manual-" + technicalName;
          } else {
            const stevoRes: any = await client.createInstance(technicalName, data.stevo_api_key);
            stevoId = stevoRes?.data?.id || stevoRes?.id;
          }

          if (stevoId) {
            const webhookUrl = `${window.location.origin}/api/webhooks/stevo`;
          
            await supabase.from("whatsapp_instances").update({
              stevo_instance_id: stevoId,
              webhook_url: webhookUrl
            }).eq("id", data.id);

            await client.connectInstance(webhookUrl, apiKeyToUse).catch(console.error);
            await client.updateAdvancedSettings(stevoId, {
              rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false
            }, apiKeyToUse).catch(console.error);
          }
        } catch (e: any) {
          console.error("Stevo Create Error:", e);
          throw new Error("Falha ao configurar instância no Stevo: " + e.message);
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
      setCustomHost("");
      setCustomApiKey("");
      setCreateModalOpen(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  if (!activeCompanyId) {
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
        <TabsList className="flex flex-wrap md:flex-nowrap h-auto gap-1 justify-start overflow-x-auto pb-1">
          <TabsTrigger value="general">Empresa & API</TabsTrigger>
          <TabsTrigger value="channels">Canais & Atendimento</TabsTrigger>
          <TabsTrigger value="ai">Inteligência Artificial</TabsTrigger>
          <TabsTrigger value="crm">CRM & Funis</TabsTrigger>
          <TabsTrigger value="team">Equipe & Perfis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Company Details */}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Documento (CNPJ/CPF)</label>
                  <Input 
                    placeholder="00.000.000/0000-00" 
                    value={companyDocument}
                    onChange={(e) => setCompanyDocument(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Endereço</label>
                  <Input 
                    placeholder="Av. Exemplo, 123" 
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Horário de Funcionamento</label>
                  <Input 
                    placeholder="Seg a Sex: 08h as 18h" 
                    value={companyBusinessHours}
                    onChange={(e) => setCompanyBusinessHours(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">Token da Meta (System User)</label>
                  <Input 
                    type="password"
                    placeholder="EAAW...ZDZD" 
                    value={companyMetaToken}
                    onChange={(e) => setCompanyMetaToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado para listar e conectar contas do Instagram e Páginas do Facebook automaticamente.
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <label className="text-sm font-medium mb-2 block">Variáveis Personalizadas</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Essas variáveis podem ser usadas nos prompts da IA com chaves duplas: {'{{nome_da_variavel}}'}.
                  </p>
                  
                  <div className="space-y-2 mb-3">
                    {companyCustomVars.map((v, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input 
                          placeholder="chave (ex: link_pgto)" 
                          className="w-1/3 text-xs"
                          value={v.key}
                          onChange={(e) => {
                            const newVars = [...companyCustomVars];
                            newVars[i].key = e.target.value;
                            setCompanyCustomVars(newVars);
                          }}
                        />
                        <Input 
                          placeholder="valor" 
                          className="flex-1 text-xs"
                          value={v.value}
                          onChange={(e) => {
                            const newVars = [...companyCustomVars];
                            newVars[i].value = e.target.value;
                            setCompanyCustomVars(newVars);
                          }}
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            setCompanyCustomVars(companyCustomVars.filter((_, idx) => idx !== i));
                          }}
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs"
                    onClick={() => setCompanyCustomVars([...companyCustomVars, { key: "", value: "" }])}
                  >
                    + Adicionar Variável
                  </Button>
                </div>

                <Button 
                  className="w-full mt-4" 
                  onClick={() => saveCompanyDetails.mutate()}
                  disabled={saveCompanyDetails.isPending || !newCompanyName}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </Button>
              </CardContent>
            </Card>

          {/* EvoGo API Settings Card */}
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

        <Card className="col-span-full lg:col-span-1 mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              API StevoChat (Empresa Mãe)
            </CardTitle>
            <CardDescription>
              Configure o servidor base e o token mestre do StevoChat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Host (URL da API)</label>
              <div className="relative">
                <Server className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="https://stevo.chat/api" 
                  value={stevoHost}
                  onChange={(e) => setStevoHost(e.target.value)}
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
                  value={stevoToken}
                  onChange={(e) => setStevoToken(e.target.value)}
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

        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Tabs defaultValue="whatsapp" orientation="vertical" className="flex flex-col md:flex-row gap-6 w-full">
            <TabsList className="flex md:flex-col h-auto w-full md:w-56 bg-transparent gap-1 justify-start overflow-x-auto pb-1">
              <TabsTrigger value="whatsapp" className="w-full justify-start data-[state=active]:bg-muted">
                <Smartphone className="mr-2 h-4 w-4" />
                Canais (WhatsApp / Insta)
              </TabsTrigger>
              <TabsTrigger value="quick-messages" className="w-full justify-start data-[state=active]:bg-muted">
                <Zap className="mr-2 h-4 w-4" />
                Mensagens Rápidas
              </TabsTrigger>
              <TabsTrigger value="labels" className="w-full justify-start data-[state=active]:bg-muted">
                <Tags className="mr-2 h-4 w-4" />
                Etiquetas
              </TabsTrigger>
              <TabsTrigger value="reasons" className="w-full justify-start data-[state=active]:bg-muted">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Encerramento
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 w-full min-w-0">
              <TabsContent value="whatsapp" className="mt-0 border-none p-0">
                {/* Global Instances Card */}
          <Card className={cn("col-span-full", !selectedUnitId && "lg:col-span-2")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Instâncias e Canais
              </CardTitle>
              <CardDescription>
                {selectedUnitId 
                  ? "Instâncias de atendimento desta unidade específica."
                  : "Instâncias vinculadas diretamente à Empresa Mãe (sem unidade)."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground">Instâncias Ativas</h3>
                </div>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Instância
                </Button>
              </div>

              <div className="space-y-4">
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

          <TabsContent value="quick-messages" className="mt-0 border-none p-0">
            <QuickMessagesTab />
          </TabsContent>
          
          <TabsContent value="reasons" className="mt-0 border-none p-0">
            <ResolutionReasonsTab />
          </TabsContent>
          
          <TabsContent value="labels" className="mt-0 border-none p-0">
            <LabelsTab />
          </TabsContent>
        </div>
      </Tabs>
    </TabsContent>

    <TabsContent value="team" className="space-y-4">
      <Tabs defaultValue="profile" orientation="vertical" className="flex flex-col md:flex-row gap-6 w-full">
        <TabsList className="flex md:flex-col h-auto w-full md:w-56 bg-transparent gap-1 justify-start overflow-x-auto pb-1">
          <TabsTrigger value="profile" className="w-full justify-start data-[state=active]:bg-muted">
            <User className="mr-2 h-4 w-4" />
            Minha Conta
          </TabsTrigger>
          <TabsTrigger value="users" className="w-full justify-start data-[state=active]:bg-muted">
            <Users className="mr-2 h-4 w-4" />
            Membros
          </TabsTrigger>
          <TabsTrigger value="departments" className="w-full justify-start data-[state=active]:bg-muted">
            <Building2 className="mr-2 h-4 w-4" />
            Departamentos
          </TabsTrigger>
        </TabsList>
        
        <div className="flex-1 w-full min-w-0">
          <TabsContent value="profile" className="mt-0 border-none p-0">
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
          
        <TabsContent value="users" className="mt-0 border-none p-0">
          <UsersTab />
        </TabsContent>

        <TabsContent value="departments" className="mt-0 border-none p-0">
          <DepartmentsTab />
        </TabsContent>
      </div>
    </Tabs>
  </TabsContent>

  <TabsContent value="ai" className="space-y-4">
    <Tabs defaultValue="integrations" orientation="vertical" className="flex flex-col md:flex-row gap-6 w-full">
      <TabsList className="flex md:flex-col h-auto w-full md:w-56 bg-transparent gap-1 justify-start">
        <TabsTrigger value="integrations" className="w-full justify-start data-[state=active]:bg-muted">
          <Key className="mr-2 h-4 w-4" />
          Integrações Globais
        </TabsTrigger>
        <TabsTrigger value="agents" className="w-full justify-start data-[state=active]:bg-muted">
          <Bot className="mr-2 h-4 w-4" />
          Agentes de IA
        </TabsTrigger>
      </TabsList>

      <div className="flex-1 w-full min-w-0">
        <TabsContent value="integrations" className="mt-0 border-none p-0 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

                    {/* Configuração do Sales Coach */}
                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30 mt-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold text-sm">Prompt do Sales Coach (Treinador de Vendas)</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Define como o treinador de vendas deve se comportar ao analisar o contexto da conversa. (Ex: "Atue como um treinador e sugira como contornar a objeção acima de forma persuasiva.")
                    </p>
                    <Textarea 
                      placeholder="Você é um treinador de vendas..."
                      className="min-h-[100px] text-sm"
                      value={aiSettings.sales_coach_prompt}
                      onChange={(e) => setAiSettings({...aiSettings, sales_coach_prompt: e.target.value})}
                    />

                    <div className="mt-4 pt-4 border-t border-border/50">
                      <label className="text-sm font-medium">Modelo da IA do Sales Coach</label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Selecione ou digite o modelo específico que o Sales Coach usará (ex: openai/gpt-4o-mini ou openai/gpt-oss-120b:free).
                      </p>
                      <div className="flex items-center gap-2 max-w-md">
                        <Select 
                          value={aiSettings.sales_coach_model} 
                          onValueChange={(val) => setAiSettings({...aiSettings, sales_coach_model: val})}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Escolha ou deixe em branco para o padrão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai/gpt-4o-mini">gpt-4o-mini (Padrão OpenAI)</SelectItem>
                            <SelectItem value="openai/gpt-oss-120b:free">gpt-oss-120b:free (Padrão OpenRouter)</SelectItem>
                            <SelectItem value="google/gemma-7b-it:free">gemma-7b-it:free</SelectItem>
                            {aiSettings.chatbot_models.map((mod) => (
                              !["openai/gpt-4o-mini", "openai/gpt-oss-120b:free", "google/gemma-7b-it:free"].includes(mod) && (
                                <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                              )
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <label className="text-sm font-medium">Instâncias Ativas para o Sales Coach</label>
                      <p className="text-xs text-muted-foreground mb-3">Selecione em quais canais/instâncias o botão do Sales Coach deve aparecer. Deixe vazio para ativar em todas.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        {instances?.map((inst: any) => {
                          const isActive = aiSettings.sales_coach_instances.includes(inst.id);
                          return (
                            <div key={inst.id} className="flex items-center space-x-2 bg-background border p-2 rounded-md">
                              <Switch 
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setAiSettings(prev => ({...prev, sales_coach_instances: [...prev.sales_coach_instances, inst.id]}));
                                  } else {
                                    setAiSettings(prev => ({...prev, sales_coach_instances: prev.sales_coach_instances.filter(id => id !== inst.id)}));
                                  }
                                }}
                              />
                              <span className="text-sm truncate font-medium">{inst.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
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

        </TabsContent>

        <TabsContent value="agents" className="mt-0 border-none p-0">
          <AiAgentsTab />
        </TabsContent>
      </div>
    </Tabs>
  </TabsContent>

        <TabsContent value="crm" className="grid gap-4">
          <CrmTab />
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
      
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Canal de Atendimento</DialogTitle>
            <DialogDescription>
              Digite um nome para a nova conexão que será criada na EvoGo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome de Exibição</label>
              <Input 
                placeholder="Ex: Suporte Central" 
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                autoFocus
              />
            </div>
            {(instanceProvider === 'evogo' || instanceProvider === 'stevo') && (
              <>
                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium">Host da API (URL)</label>
                  <Input 
                    placeholder="Deixe em branco para usar o Host Global" 
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Opcional. Preencha se esta instância usar um servidor diferente da empresa.</p>
                </div>
                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium">API Key da Instância</label>
                  <Input 
                    placeholder="Se preenchido, apenas conectará a instância" 
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Opcional no EvoGo. Obrigatório no Stevo se não for gerar via API.</p>
                </div>
                <div className="space-y-2 mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 border rounded-md">
                  <p className="text-xs font-medium mb-1">Configuração de Webhook (Aviso)</p>
                  <p className="text-[11px] text-muted-foreground">
                    O Atendi tentará configurar automaticamente o webhook na sua instância ao salvar. Caso o seu provedor bloqueie a alteração via API, você precisará colar esta URL manualmente no painel deles:
                  </p>
                  <code className="text-[10px] block p-2 bg-muted rounded">
                    {window.location.origin}/api/webhooks/{instanceProvider === 'stevo' ? 'stevo' : 'evogo'}
                  </code>
                </div>
              </>
            )}
            
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
                  <SelectItem value="stevo">StevoChat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(instanceProvider === 'oficial' || instanceProvider === 'instagram' || instanceProvider === 'messenger') && (
              <>
                {/* Meta OAuth Status Banner */}
                {!company?.meta_system_user_token ? (
                  <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between gap-4 mb-4 text-left">
                    <div className="flex items-center gap-2.5">
                      <Facebook className="h-5 w-5 text-blue-600 shrink-0 animate-pulse" />
                      <div>
                        <p className="text-xs font-semibold">Importação Automática (Meta OAuth)</p>
                        <p className="text-[10px] text-muted-foreground">Conecte sua conta para listar páginas e Instagram.</p>
                      </div>
                    </div>
                    <Button 
                      type="button"
                      size="sm"
                      onClick={() => {
                        const appId = import.meta.env.VITE_META_APP_ID || "1035728705567552";
                        const redirectUri = encodeURIComponent(window.location.origin + "/facebook-signup");
                        const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${activeCompanyId}&scope=pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages,whatsapp_business_management,whatsapp_business_messaging`;
                        
                        const width = 600;
                        const height = 650;
                        const left = window.screenX + (window.innerWidth - width) / 2;
                        const top = window.screenY + (window.innerHeight - height) / 2;
                        window.open(oauthUrl, "facebook-oauth", `width=${width},height=${height},left=${left},top=${top}`);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] h-8 px-3 flex items-center gap-1.5 shrink-0"
                    >
                      <Facebook className="h-3.5 w-3.5 fill-current" />
                      Conectar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-md mb-4 text-left">
                    <span className="text-xs text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Integração Meta Ativa
                    </span>
                    <Button
                      variant="link"
                      className="text-xs text-destructive h-auto p-0 hover:no-underline"
                      onClick={async () => {
                        const { error } = await supabase
                          .from("companies")
                          .update({ meta_system_user_token: null })
                          .eq("id", activeCompanyId!);
                        if (error) {
                          toast.error("Erro ao desconectar");
                        } else {
                          toast.success("Integração Meta desconectada!");
                          qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
                        }
                      }}
                    >
                      Desconectar
                    </Button>
                  </div>
                )}

                {/* Meta Page / Instagram Select OR Manual Configuration Inputs */}
                {(instanceProvider === 'instagram' || instanceProvider === 'messenger') && company?.meta_system_user_token && !useManualToken ? (
                  <div className="space-y-2 mb-4 text-left">
                    <label className="text-sm font-medium">Selecione a Conta da Meta</label>
                    {isLoadingMeta ? (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Buscando contas...
                      </div>
                    ) : metaAccounts.length === 0 ? (
                      <div className="text-sm text-destructive">
                        Nenhuma conta encontrada. Verifique as permissões do Token ou se a página está vinculada.
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
                    <div className="space-y-2 text-left">
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
                    {(instanceProvider === 'instagram' || instanceProvider === 'oficial') && (
                      <div className="space-y-2 text-left">
                        <label className="text-sm font-medium">
                          {instanceProvider === 'oficial' ? 'WhatsApp Business Account ID (WABA ID)' : 'Facebook Page ID (Opcional se usar token IGA)'}
                        </label>
                        <Input 
                          placeholder={instanceProvider === 'oficial' ? "Ex: 109876543210" : "ID da página vinculada"}
                          value={oficialWabaId}
                          onChange={(e) => setOficialWabaId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {instanceProvider === 'oficial' 
                            ? "O ID da conta comercial do WhatsApp no painel da Meta." 
                            : "Opcional para tokens diretos (IGA). Necessário se usar token da Meta (EAAS)."}
                        </p>
                      </div>
                    )}
                    <div className="space-y-2 text-left">
                      <label className="text-sm font-medium">Access Token Permanente</label>
                      <Input 
                        type="password"
                        placeholder={company?.meta_system_user_token ? "Usando Token da Meta Conectado (Opcional)" : "EAAS... ou IGA..."}
                        value={oficialToken}
                        onChange={(e) => setOficialToken(e.target.value)}
                      />
                      {company?.meta_system_user_token && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          Sua conta Meta está conectada. Se preferir usar o token do login com Facebook, deixe este campo em branco.
                        </p>
                      )}
                    </div>
                    {company?.meta_system_user_token && (instanceProvider === 'instagram' || instanceProvider === 'messenger') && (
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
                    <code>{window.location.origin}/api/webhooks/{instanceProvider === 'instagram' ? 'instagram' : instanceProvider === 'messenger' ? 'messenger' : 'whatsapp'}</code>
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
                company_id: activeCompanyId,
                numberId: oficialNumberId,
                wabaId: oficialWabaId,
                accessToken: oficialToken,
                verifyToken: oficialVerifyToken,
                customHost,
                customApiKey
              })}
              disabled={!instanceName || createInstance.isPending || (instanceProvider === 'evogo' && !company?.evogo_host && !customHost) || (instanceProvider === 'stevo' && !company?.stevo_host && !customHost)}
            >
              {createInstance.isPending ? "Criando..." : "Criar Instância"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstanceRow({ instance, company, onConnect, onSettings }: { instance: any, company: any, onConnect: () => void, onSettings: () => void }) {
  const qc = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean, type: 'disconnect' | 'delete' | null }>({ open: false, type: null });

  const handleDisconnect = async () => {
    try {
      if (instance.provider === 'stevo') {
        const client = new StevoClient({ host: company.stevo_host, token: company.stevo_global_token });
        await client.logoutInstance(instance.stevo_api_key);
      } else {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.logoutInstance(instance.evogo_api_key);
      }
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
      if (instance.provider === 'stevo' && instance.stevo_instance_id) {
        const client = new StevoClient({ host: company.stevo_host, token: company.stevo_global_token });
        await client.deleteInstance(instance.stevo_instance_id);
      } else if (instance.provider === 'evogo' && instance.evogo_instance_id) {
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
        {!['oficial', 'instagram', 'messenger', 'facebook'].includes(instance.provider) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>Status:</span>
            <Badge variant={instance.status === 'connected' ? 'default' : 'secondary'} className="text-[10px] py-0">
              {instance.status}
            </Badge>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {instance.provider === 'oficial' ? (
          <Badge variant="outline" className="h-9 px-3 border-emerald-200 text-emerald-700 bg-emerald-50 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>
            API Oficial Ativa
          </Badge>
        ) : instance.provider === 'instagram' ? (
          <Badge variant="outline" className="h-9 px-3 border-pink-200 text-pink-700 bg-pink-50 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            Instagram
          </Badge>
        ) : instance.provider === 'messenger' ? (
          <Badge variant="outline" className="h-9 px-3 border-blue-200 text-blue-700 bg-blue-50 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.1 11.3c0-5-4.3-9-9.6-9s-9.6 4-9.6 9c0 2.8 1.4 5.3 3.6 7l-.3 2.7 2.6-1.4c1.1.3 2.3.5 3.6.5 5.3 0 9.6-4 9.6-9z" fill="none"/><path d="m11.5 13.9 1.7-2.7 4.1 2.7-4.5-4.8-1.7 2.7-4.1-2.7z"/></svg>
            Messenger
          </Badge>
        ) : instance.provider === 'facebook' ? (
          <Badge variant="outline" className="h-9 px-3 border-blue-200 text-blue-700 bg-blue-50 flex items-center gap-1">
            Facebook
          </Badge>
        ) : instance.status === 'connected' ? (
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

