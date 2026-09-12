import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cpu,
  Key,
  Copy,
  Plus,
  Trash2,
  ShieldCheck,
  Building2,
  Sparkles,
  Check,
  Code2,
  Terminal,
  Loader2,
  AlertTriangle,
  Bot,
  Workflow,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";
import {
  listMcpKeysAction,
  createMcpKeyAction,
  revokeMcpKeyAction,
} from "@/lib/api/mcp.functions";

interface McpSettingsTabProps {
  companyId: string;
}

export function McpSettingsTab({ companyId }: McpSettingsTabProps) {
  const qc = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyUnitId, setNewKeyUnitId] = useState<string>("matriz");

  // Estado para modal da chave gerada (mostra o token completo uma única vez)
  const [generatedKey, setGeneratedKey] = useState<{ name: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [copiedClientSecret, setCopiedClientSecret] = useState(false);
  const [platformGuide, setPlatformGuide] = useState<"web" | "ides" | "agents">("web");

  // Determinar URL base do endpoint MCP
  const mcpServerUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/mcp`
    : "http://localhost:8080/api/mcp";

  // 1. Buscar unidades da empresa
  const { data: units } = useQuery({
    queryKey: ["company-units-mcp", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, slug, active")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) return [];
      return data || [];
    },
  });

  // 2. Buscar chaves MCP ativas
  const { data: keysData, isLoading } = useQuery({
    queryKey: ["mcp-api-keys", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await listMcpKeysAction({ data: { companyId } });
      return res.keys || [];
    },
  });

  // 3. Mutation: Criar Chave
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newKeyName.trim()) throw new Error("Informe o nome da chave.");
      const res = await createMcpKeyAction({
        data: {
          companyId,
          unitId: newKeyUnitId === "matriz" ? null : newKeyUnitId,
          name: newKeyName.trim(),
        },
      });
      return res;
    },
    onSuccess: (res) => {
      setIsCreateOpen(false);
      setNewKeyName("");
      setNewKeyUnitId("matriz");
      setGeneratedKey({ name: res.key.name, token: res.rawToken });
      qc.invalidateQueries({ queryKey: ["mcp-api-keys", companyId] });
      toast.success("Chave MCP criada com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar chave MCP.");
    },
  });

  // 4. Mutation: Revogar Chave
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await revokeMcpKeyAction({ data: { keyId, companyId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mcp-api-keys", companyId] });
      toast.success("Chave MCP revogada com sucesso.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao revogar chave.");
    },
  });

  const handleCopy = (text: string, isUrl = false) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      toast.success("URL do Servidor MCP copiada!");
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
      toast.success("Token de acesso copiado!");
    }
  };

  const cursorSnippet = generatedKey
    ? JSON.stringify(
        {
          mcpServers: {
            atendi: {
              url: mcpServerUrl,
              headers: {
                Authorization: `Bearer ${generatedKey.token}`,
              },
            },
          },
        },
        null,
        2
      )
    : "";

  return (
    <div className="space-y-6">
      {/* Header explicativo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/40 border border-border/80 rounded-2xl p-5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold tracking-tight">Servidor MCP (Model Context Protocol)</h3>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
              Ativo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Conecte assistentes de inteligência artificial (Claude Desktop, Cursor IDE, Antigravity CLI ou agentes N8N) diretamente à sua base do Atendi para pesquisar contatos, enviar mensagens, movimentar funis e consultar o Playbook.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shrink-0 self-start md:self-center"
        >
          <Plus className="h-4 w-4" />
          Criar Nova Chave MCP
        </Button>
      </div>

      {/* Card da URL de Conexão */}
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            URL do Servidor MCP da Empresa
          </CardTitle>
          <CardDescription className="text-xs">
            Esta é a URL que deve ser inserida nas configurações do seu cliente MCP (Cursor, Claude Desktop ou Antigravity).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 max-w-xl">
            <Input
              readOnly
              value={mcpServerUrl}
              className="font-mono text-xs bg-muted/50 select-all"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(mcpServerUrl, true)}
              className="gap-1.5 shrink-0"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedUrl ? "Copiado" : "Copiar URL"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card Especial: Conexão Universal MCP com Qualquer LLM / Plataforma */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Bot className="h-4 w-4 text-primary" />
                  Conexão Universal com Qualquer Modelo de IA (LLM)
                </CardTitle>
                <Badge className="bg-emerald-600 text-white text-[10px]">
                  Multi-LLM
                </Badge>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Padrão Aberto MCP
                </Badge>
              </div>
              <CardDescription className="text-xs">
                O AtendiAI suporta qualquer modelo (OpenAI ChatGPT, Anthropic Claude, Google Gemini, DeepSeek, Llama), IDEs de código (Cursor, Windsurf, Antigravity) e orquestradores (N8N, Dify, LangChain).
              </CardDescription>
            </div>
            
            {/* Seletor de Tipo de Integração */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/80 self-start lg:self-center shrink-0">
              <button
                type="button"
                onClick={() => setPlatformGuide("web")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                  platformGuide === "web"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ChatGPT & Claude (Web)
              </button>
              <button
                type="button"
                onClick={() => setPlatformGuide("ides")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                  platformGuide === "ides"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cursor & IDEs
              </button>
              <button
                type="button"
                onClick={() => setPlatformGuide("agents")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                  platformGuide === "agents"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                N8N & Agentes
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {platformGuide === "web" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">URL do Conector Remoto (MCP OAuth 2.1)</label>
                <div className="flex items-center gap-2 max-w-xl">
                  <Input
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/mcp` : "http://localhost:8080/mcp"}
                    className="font-mono text-xs bg-muted/50 select-all"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "http://localhost:8080/mcp";
                      navigator.clipboard.writeText(url);
                      toast.success("URL do conector MCP copiada!");
                    }}
                    className="gap-1.5 shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Compatível com <strong>Claude.ai</strong>, <strong>ChatGPT (Custom Actions / MCP)</strong>, <strong>LibreChat</strong>, <strong>Open WebUI</strong> e qualquer cliente com suporte a OAuth 2.1 (RFC 9728) e Dynamic Client Registration (RFC 7591).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-3">
                <div className="text-xs font-semibold flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-amber-500" />
                  Credenciais Pré-Registradas (caso o cliente solicite Client ID manual):
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">OAuth Client ID Universal</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        value="atendi-mcp-client"
                        className="font-mono text-xs bg-background select-all h-8"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText("atendi-mcp-client");
                          setCopiedClientId(true);
                          setTimeout(() => setCopiedClientId(false), 2000);
                          toast.success("Client ID copiado!");
                        }}
                        className="h-8 px-2"
                      >
                        {copiedClientId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">OAuth Client Secret</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        value="atendi-mcp-secret"
                        className="font-mono text-xs bg-background select-all h-8"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText("atendi-mcp-secret");
                          setCopiedClientSecret(true);
                          setTimeout(() => setCopiedClientSecret(false), 2000);
                          toast.success("Client Secret copiado!");
                        }}
                        className="h-8 px-2"
                      >
                        {copiedClientSecret ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {platformGuide === "ides" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Gere uma chave abaixo na tabela <strong>"Chaves de Acesso MCP"</strong> e configure seu editor favorito (Cursor, Windsurf, VS Code ou Claude Desktop):
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold font-mono text-foreground">.cursor/mcp.json ou claude_desktop_config.json</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const snippet = JSON.stringify(
                        {
                          mcpServers: {
                            atendi: {
                              url: mcpServerUrl,
                              headers: {
                                Authorization: "Bearer atendi_mcp_live_SUA_CHAVE_AQUI",
                              },
                            },
                          },
                        },
                        null,
                        2
                      );
                      navigator.clipboard.writeText(snippet);
                      toast.success("Snippet copiado!");
                    }}
                    className="h-7 text-xs gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar JSON
                  </Button>
                </div>
                <pre className="p-3 rounded-xl bg-muted/60 border border-border/80 text-[11px] font-mono overflow-x-auto text-foreground">
{`{
  "mcpServers": {
    "atendi": {
      "url": "${mcpServerUrl}",
      "headers": {
        "Authorization": "Bearer atendi_mcp_live_SUA_CHAVE_AQUI"
      }
    }
  }
}`}
                </pre>
              </div>
            </div>
          )}

          {platformGuide === "agents" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Conecte fluxos do <strong>N8N</strong>, <strong>Dify</strong>, <strong>Flowise</strong>, scripts em <strong>Python</strong> ou qualquer agente autônomo enviando chamadas HTTP JSON-RPC 2.0 padrão:
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold font-mono text-foreground">Exemplo de Requisição HTTP (cURL / N8N / Python)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const curlText = `curl -X POST ${mcpServerUrl} \\
  -H "Authorization: Bearer atendi_mcp_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "listar_contatos", "arguments": {"limite": 10}}}'`;
                      navigator.clipboard.writeText(curlText);
                      toast.success("Comando cURL copiado!");
                    }}
                    className="h-7 text-xs gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar cURL
                  </Button>
                </div>
                <pre className="p-3 rounded-xl bg-muted/60 border border-border/80 text-[11px] font-mono overflow-x-auto text-foreground">
{`curl -X POST ${mcpServerUrl} \\
  -H "Authorization: Bearer atendi_mcp_live_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "listar_contatos",
      "arguments": { "limite": 10 }
    }
  }'`}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Chaves Ativas */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                Chaves de Acesso MCP da Empresa
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Chaves geradas para permitir conexões externas com validação de unidade e escopo.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {keysData?.length || 0} {keysData?.length === 1 ? "chave ativa" : "chaves ativas"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Carregando chaves MCP...
            </div>
          ) : !keysData || keysData.length === 0 ? (
            <div className="py-10 text-center border border-dashed rounded-xl border-border/80 p-6 space-y-2">
              <Key className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-medium text-foreground">Nenhuma chave MCP ativa</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Crie sua primeira chave para conectar o Cursor, Claude Desktop ou outro agente de IA ao Atendi.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="mt-2 text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar Chave
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {keysData.map((k: any) => {
                const isGlobal = !k.unit_id;
                return (
                  <div key={k.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{k.name}</span>
                        {isGlobal ? (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-1">
                            <Building2 className="h-3 w-3" />
                            Matriz (Todas as Unidades)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 gap-1">
                            <Building2 className="h-3 w-3" />
                            Filial: {k.units?.name || "Unidade"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        <span>{k.key_prefix}••••••••••••</span>
                        <span>•</span>
                        <span className="font-sans">
                          Criada em {new Date(k.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        {k.last_used_at && (
                          <>
                            <span>•</span>
                            <span className="font-sans text-emerald-600 dark:text-emerald-400">
                              Último uso: {new Date(k.last_used_at).toLocaleDateString("pt-BR")} {new Date(k.last_used_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja revogar a chave "${k.name}"? Qualquer IA usando este token perderá o acesso imediatamente.`)) {
                          revokeMutation.mutate(k.id);
                        }
                      }}
                      disabled={revokeMutation.isPending}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 self-end sm:self-center gap-1.5 h-8 px-2.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revogar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card com Catálogo de Ferramentas Ativas no MCP */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            24 Ferramentas Nativas Disponíveis no Servidor MCP
          </CardTitle>
          <CardDescription className="text-xs">
            Qualquer cliente conectado tem acesso às seguintes funções do CRM em tempo real:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">🏬 Unidades & Filiais</span>
              <p className="text-muted-foreground text-[11px]">listar_unidades, consultar_unidade, listar_departamentos</p>
            </div>
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">👥 Contatos & Leads</span>
              <p className="text-muted-foreground text-[11px]">listar_contatos, consultar_contato, criar_contato, atualizar_contato, adicionar_nota_contato</p>
            </div>
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">💬 Mensageria & WhatsApp</span>
              <p className="text-muted-foreground text-[11px]">listar_conversas, consultar_conversa, enviar_mensagem_whatsapp</p>
            </div>
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">🎯 Funis & Oportunidades</span>
              <p className="text-muted-foreground text-[11px]">listar_funis, listar_etapas, listar_oportunidades, criar_oportunidade, mover_oportunidade, atualizar_oportunidade</p>
            </div>
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">📋 Tarefas & Follow-ups</span>
              <p className="text-muted-foreground text-[11px]">listar_tarefas, criar_tarefa, concluir_tarefa</p>
            </div>
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
              <span className="font-semibold text-foreground">📖 Playbook Comercial & Métricas</span>
              <p className="text-muted-foreground text-[11px]">consultar_playbook, listar_procedimentos, salvar_procedimento, consultar_metricas_dashboard</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Criar Nova Chave */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-600" />
              Criar Nova Chave de Acesso MCP
            </DialogTitle>
            <DialogDescription className="text-xs">
              Gere um token seguro para conectar um assistente externo ao Atendi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Nome da Chave / Identificação</label>
              <Input
                placeholder="Ex: Cursor IDE - Rhian, Claude Desktop Matriz..."
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Escopo da Unidade</label>
              <Select value={newKeyUnitId} onValueChange={setNewKeyUnitId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o escopo da chave" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="matriz">
                    🏢 Matriz (Todas as Unidades / Visão Global)
                  </SelectItem>
                  {(units || []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      🏬 Filial: {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Se escolher uma filial, a IA só terá acesso aos leads e atendimentos daquela filial específica.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newKeyName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Gerar Chave de Acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Exibição da Chave Gerada */}
      <Dialog open={!!generatedKey} onOpenChange={(open) => !open && setGeneratedKey(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base text-emerald-600 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Chave MCP Criada com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs">
              Copie o token secreto agora. Por motivos de segurança, ele <strong>nunca mais será exibido</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Guarde este token em local seguro. Qualquer aplicação com este token poderá interagir com os dados da empresa de acordo com o escopo configurado.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Token de Acesso Bearer</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generatedKey?.token || ""}
                  className="font-mono text-xs bg-muted/60 select-all"
                />
                <Button
                  size="sm"
                  onClick={() => handleCopy(generatedKey?.token || "")}
                  className="gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedToken ? "Copiado!" : "Copiar Token"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                <label className="text-xs font-semibold">Configuração Pronta para o Cursor IDE (.cursor/mcp.json)</label>
              </div>
              <pre className="p-3 rounded-xl bg-muted/60 border border-border/80 text-[11px] font-mono overflow-x-auto text-foreground">
                {cursorSnippet}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setGeneratedKey(null)}
              className="text-xs w-full sm:w-auto"
            >
              Concluir e Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
