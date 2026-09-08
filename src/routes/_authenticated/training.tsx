import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  GraduationCap,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Bot,
  User,
  Copy,
  BarChart3,
  RefreshCw,
  Target,
  ChevronRight,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  ShieldCheck,
  Zap,
  HelpCircle,
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  FileText,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  mineCompanyObjectionsAction,
  fetchObjectionInsightsAction,
  startBlindTrainingSessionAction,
  sendTrainingMessageAction,
  finishTrainingSessionAction,
  fetchTrainingSessionsAction,
  fetchTrainingSessionDetailsAction,
  fetchSalesPlaybookProceduresAction,
  upsertSalesPlaybookProcedureAction,
  deleteSalesPlaybookProcedureAction,
} from "@/lib/api/training.functions";

export const Route = createFileRoute("/_authenticated/training")({
  component: TrainingPageRoute,
});

function TrainingPageRoute() {
  return (
    <ProtectedMenuRoute menuKey="training">
      <TrainingDashboard />
    </ProtectedMenuRoute>
  );
}

function TrainingDashboard() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const effectiveCompanyId = profile?.role === "super_admin" ? activeCompanyId : profile?.company_id;
  const isManagerOrAdmin = profile?.role === "super_admin" || profile?.role === "admin_company" || profile?.role === "manager";

  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"arena" | "report" | "playbook" | "insights" | "history">("arena");

  // Sessão atual ativa
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "instagram">("whatsapp");
  const [optimisticMessages, setOptimisticMessages] = useState<
    Array<{
      id: string;
      sender_type: "trainee" | "lead";
      content: string;
      created_at: string;
    }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sessão selecionada para visualização do relatório
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);

  // 1. Buscar detalhes e mensagens da sessão ativa
  const {
    data: activeSessionData,
    isLoading: isLoadingActiveSession,
    refetch: refetchActiveSession,
  } = useQuery({
    queryKey: ["training-session-active", currentSessionId],
    enabled: !!currentSessionId,
    queryFn: async () => {
      const res = await fetchTrainingSessionDetailsAction({ data: { sessionId: currentSessionId! } });
      return res;
    },
    refetchInterval: false,
  });

  // 2. Buscar detalhes da sessão em relatório (quando visualizando uma avaliação)
  const {
    data: reportSessionData,
    isLoading: isLoadingReportSession,
  } = useQuery({
    queryKey: ["training-session-report", reportSessionId],
    enabled: !!reportSessionId,
    queryFn: async () => {
      const res = await fetchTrainingSessionDetailsAction({ data: { sessionId: reportSessionId! } });
      return res;
    },
  });

  // 3. Buscar histórico de sessões
  const {
    data: sessionsHistoryData,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["training-sessions-history", effectiveCompanyId],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      const res = await fetchTrainingSessionsAction({
        data: {
          companyId: effectiveCompanyId!,
          limit: 50,
        },
      });
      return res.sessions || [];
    },
  });

  // 4. Buscar últimas objeções mineradas
  const {
    data: objectionInsightsData,
    isLoading: isLoadingInsights,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ["training-objection-insights", effectiveCompanyId],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      const res = await fetchObjectionInsightsAction({
        data: { companyId: effectiveCompanyId! },
      });
      return res.insight || null;
    },
  });

  // Mutation: Iniciar Novo Treino às Cegas
  const startTrainingMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error("Selecione uma empresa ativa.");
      const res = await startBlindTrainingSessionAction({
        data: {
          companyId: effectiveCompanyId,
          channel: selectedChannel,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if (res?.session?.id) {
        setCurrentSessionId(res.session.id);
        setActiveTab("arena");
        toast.success(`Atendimento simulado com ${res.session.lead_name} iniciado!`);
        qc.invalidateQueries({ queryKey: ["training-sessions-history"] });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao iniciar simulação.");
    },
  });

  // Mutation: Enviar Mensagem da Consultora
  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!currentSessionId) throw new Error("Nenhuma sessão ativa.");
      const res = await sendTrainingMessageAction({
        data: {
          sessionId: currentSessionId,
          content: text,
        },
      });
      return res;
    },
    onSuccess: () => {
      setOptimisticMessages([]);
      refetchActiveSession();
    },
    onError: (err: any) => {
      setOptimisticMessages([]);
      toast.error(err.message || "Erro ao processar fala do lead.");
    },
  });

  // Mutation: Encerrar e Avaliar Atendimento
  const finishTrainingMutation = useMutation({
    mutationFn: async () => {
      if (!currentSessionId) throw new Error("Nenhuma sessão ativa.");
      const res = await finishTrainingSessionAction({
        data: { sessionId: currentSessionId },
      });
      return res;
    },
    onSuccess: (res) => {
      toast.success("Atendimento avaliado pelo Sales Coach com sucesso!");
      const targetSessionId = res.session?.id || currentSessionId;
      if (targetSessionId) {
        qc.setQueryData(["training-session-report", targetSessionId], {
          session: res.session,
          messages: activeSessionData?.messages || [],
        });
        setReportSessionId(targetSessionId);
      }
      setCurrentSessionId(null);
      setActiveTab("report");
      qc.invalidateQueries({ queryKey: ["training-sessions-history"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao auditar simulação.");
    },
  });

  // Mutation: Minerar Objeções Reais (Admin)
  const mineObjectionsMutation = useMutation({
    mutationFn: async (period: "week" | "month") => {
      if (!effectiveCompanyId) throw new Error("Selecione uma empresa.");
      const res = await mineCompanyObjectionsAction({
        data: {
          companyId: effectiveCompanyId,
          period,
        },
      });
      return res;
    },
    onSuccess: () => {
      toast.success("Mineração de conversas reais concluída com sucesso!");
      refetchInsights();
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao minerar objeções.");
    },
  });

  // ================= Playbook & Procedimentos State =================
  const [playbookCategoryFilter, setPlaybookCategoryFilter] = useState<string>("all");
  const [playbookSearch, setPlaybookSearch] = useState("");
  const [isProcedureModalOpen, setIsProcedureModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<any | null>(null);

  // Form states do modal
  const [procTitle, setProcTitle] = useState("");
  const [procCategory, setProcCategory] = useState<"procedure" | "faq" | "pricing" | "objection_script" | "policy">("procedure");
  const [procContent, setProcContent] = useState("");
  const [procKeyPoints, setProcKeyPoints] = useState("");
  const [procTargetAudience, setProcTargetAudience] = useState("");
  const [procIsActive, setProcIsActive] = useState(true);

  const resetProcedureForm = () => {
    setEditingProcedure(null);
    setProcTitle("");
    setProcCategory("procedure");
    setProcContent("");
    setProcKeyPoints("");
    setProcTargetAudience("");
    setProcIsActive(true);
  };

  const openNewProcedureModal = () => {
    resetProcedureForm();
    setIsProcedureModalOpen(true);
  };

  const openEditProcedureModal = (proc: any) => {
    setEditingProcedure(proc);
    setProcTitle(proc.title);
    setProcCategory(proc.category || "procedure");
    setProcContent(proc.content);
    setProcKeyPoints(Array.isArray(proc.key_points) ? proc.key_points.join("\n") : "");
    setProcTargetAudience(proc.target_audience || "");
    setProcIsActive(proc.is_active ?? true);
    setIsProcedureModalOpen(true);
  };

  // Query: Buscar Procedimentos do Playbook
  const {
    data: playbookData,
    isLoading: isLoadingPlaybook,
    refetch: refetchPlaybook,
  } = useQuery({
    queryKey: ["sales-playbook-procedures", effectiveCompanyId, playbookCategoryFilter, playbookSearch],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      const res = await fetchSalesPlaybookProceduresAction({
        data: {
          companyId: effectiveCompanyId!,
          category: playbookCategoryFilter === "all" ? undefined : playbookCategoryFilter,
          search: playbookSearch.trim() || undefined,
        },
      });
      return res.procedures || [];
    },
  });

  // Mutation: Salvar / Atualizar Procedimento
  const upsertProcedureMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error("Selecione uma empresa.");
      if (!procTitle.trim()) throw new Error("O título do procedimento é obrigatório.");
      if (!procContent.trim()) throw new Error("O conteúdo explicativo é obrigatório.");

      const points = procKeyPoints
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      return await upsertSalesPlaybookProcedureAction({
        data: {
          id: editingProcedure?.id,
          companyId: effectiveCompanyId,
          title: procTitle,
          category: procCategory,
          content: procContent,
          keyPoints: points,
          targetAudience: procTargetAudience.trim() || undefined,
          isActive: procIsActive,
        },
      });
    },
    onSuccess: () => {
      toast.success(editingProcedure ? "Procedimento atualizado!" : "Procedimento adicionado ao Playbook!");
      setIsProcedureModalOpen(false);
      resetProcedureForm();
      refetchPlaybook();
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar procedimento.");
    },
  });

  // Mutation: Excluir Procedimento
  const deleteProcedureMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!effectiveCompanyId) throw new Error("Selecione uma empresa.");
      return await deleteSalesPlaybookProcedureAction({
        data: { id, companyId: effectiveCompanyId },
      });
    },
    onSuccess: () => {
      toast.success("Procedimento removido do playbook.");
      refetchPlaybook();
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao remover procedimento.");
    },
  });

  // Mensagens do servidor combinadas com mensagens otimistas locais
  const serverMessages = activeSessionData?.messages || [];
  const displayMessages = [
    ...serverMessages,
    ...optimisticMessages.filter(
      (opt) => !serverMessages.some((m: any) => m.content === opt.content && m.sender_type === opt.sender_type)
    ),
  ];

  // Rolar até o fim das mensagens ao receber nova mensagem ou ao enviar
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages.length, sendMessageMutation.isPending]);

  // Auto-resize do Textarea: 1 linha inicial (~42px), expande para até 2 linhas (~64px) e depois scrolla
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "42px";
    const scrollH = textarea.scrollHeight;
    if (scrollH > 42) {
      textarea.style.height = `${Math.min(scrollH, 64)}px`;
    }
  }, [messageInput]);

  const handleSendMessage = () => {
    const text = messageInput.trim();
    if (!text || sendMessageMutation.isPending) return;

    // 1. Limpa o input e reseta a altura imediatamente
    setMessageInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
    }

    // 2. Adiciona a mensagem imediatamente no chat (Optimistic UI)
    const tempId = "optimistic-" + Date.now();
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender_type: "trainee",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    // 3. Dispara o envio para a IA
    sendMessageMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Script copiado para a área de transferência!");
  };

  // Obter cor da nota (0 a 10)
  const getScoreBadgeColor = (score: number) => {
    if (score >= 8.0) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    if (score >= 6.0) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    return "bg-rose-500/15 text-rose-600 border-rose-500/30";
  };

  const activeSession = activeSessionData?.session;
  const activeMessages = activeSessionData?.messages || [];
  const currentReport = reportSessionData?.session;
  const rawScorecard = currentReport?.scorecard_json;
  const scorecard: any =
    typeof rawScorecard === "string"
      ? (() => {
          try {
            return JSON.parse(rawScorecard);
          } catch {
            return null;
          }
        })()
      : rawScorecard;
  const reportMessages = reportSessionData?.messages || [];

  return (
    <div className="flex flex-col h-full min-w-0 bg-background">
      {/* Top Header */}
      <div className="border-b border-border px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-card/40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl ring-1 ring-primary/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Arena de Treinamento & Sales Coach
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                IA Roleplay
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Simulação de clientes às cegas, mineração de objeções reais e auditoria técnica de vendas.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-auto">
          <TabsList className="bg-muted/80 p-1">
            <TabsTrigger value="arena" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Arena de Treino
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5 text-primary" />
              Scorecard & Relatório
            </TabsTrigger>
            <TabsTrigger value="playbook" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
              Playbook & Procedimentos
            </TabsTrigger>
            {isManagerOrAdmin && (
              <TabsTrigger value="insights" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                Objeções Reais
              </TabsTrigger>
            )}
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Histórico
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 min-w-0">
        {/* ================= ABA 1: ARENA DE TREINAMENTO ================= */}
        {activeTab === "arena" && (
          <div className="max-w-4xl mx-auto h-full flex flex-col min-h-[600px]">
            {!currentSessionId ? (
              // Início de Nova Sessão (Hero Screen)
              <div className="flex-1 flex items-center justify-center py-10">
                <Card className="max-w-xl w-full border-border/70 shadow-lg text-center p-6 md:p-8 bg-card">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 ring-1 ring-amber-500/20 shadow-inner">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    Pronta para o Próximo Treino?
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    A IA simulará um lead real do seu nicho com dores e dúvidas autênticas. Conduza o diálogo pelo chat aplicando técnicas de sondagem, ancoragem de valor e contorno de objeções.
                  </p>

                  <div className="bg-muted/40 border border-border/60 rounded-xl p-4 mb-6 text-left space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Regras do Treino às Cegas:
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Você não saberá a objeção do cliente com antecedência.</li>
                      <li>O lead reagirá de acordo com a sua postura (cordialidade, autoridade e perguntas).</li>
                      <li>Ao final, o Sales Coach avaliará seu atendimento ponto a ponto com notas de 0 a 10.</li>
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => startTrainingMutation.mutate()}
                      disabled={startTrainingMutation.isPending}
                      className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2 shadow-md hover:shadow-lg transition-all"
                    >
                      {startTrainingMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Gerando Lead Realista...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Iniciar Atendimento Simulado
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            ) : (
              // Tela de Atendimento Ativo (Estilo WhatsApp)
              <Card className="flex-1 flex flex-col border border-border/80 shadow-md overflow-hidden bg-background">
                {/* Header do Chat */}
                <div className="bg-card px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {activeSession?.lead_name?.slice(0, 2).toUpperCase() || "CL"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {activeSession?.lead_name}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          WhatsApp
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Online agora • Simulação em andamento
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => finishTrainingMutation.mutate()}
                    disabled={finishTrainingMutation.isPending || activeMessages.length <= 1}
                    className="gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 text-xs font-semibold"
                  >
                    {finishTrainingMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Sales Coach Auditando...
                      </>
                    ) : (
                      <>
                        <Target className="w-3.5 h-3.5" />
                        Encerrar e Avaliar
                      </>
                    )}
                  </Button>
                </div>

                {/* Área de Mensagens */}
                <ScrollArea className="flex-1 p-4 bg-muted/20">
                  <div className="space-y-3 max-w-2xl mx-auto">
                    <div className="text-center my-2">
                      <span className="text-[11px] bg-background/80 border border-border/60 text-muted-foreground px-3 py-1 rounded-full shadow-2xs">
                        Atendimento iniciado • Conduza a venda com técnicas de sondagem e valor
                      </span>
                    </div>

                    {displayMessages.map((msg: any) => {
                      const isLead = msg.sender_type === "lead";
                      return (
                        <div
                          key={msg.id}
                          className={cn("flex w-full", isLead ? "justify-start" : "justify-end")}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-xs break-words",
                              isLead
                                ? "bg-card border border-border text-foreground rounded-tl-xs"
                                : "bg-primary text-primary-foreground rounded-tr-xs"
                            )}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <div
                              className={cn(
                                "text-[10px] mt-1 flex items-center justify-end gap-1 opacity-70",
                                isLead ? "text-muted-foreground" : "text-primary-foreground"
                              )}
                            >
                              <span>
                                {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {!isLead && <CheckCircle2 className="w-3 h-3" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {sendMessageMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-card border border-border rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-medium">{activeSession?.lead_name} está digitando</span>
                            <span className="flex gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0.2s]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0.4s]" />
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input do Chat */}
                <div className="p-3 bg-card border-t border-border">
                  <div className="flex items-end gap-2 max-w-2xl mx-auto">
                    <Textarea
                      ref={textareaRef}
                      placeholder="Digite sua resposta para o cliente... (Enter para enviar)"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={finishTrainingMutation.isPending}
                      className="h-[42px] max-h-[64px] min-h-[42px] resize-none overflow-y-auto text-sm py-2.5 px-3 rounded-xl transition-all leading-snug"
                      rows={1}
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sendMessageMutation.isPending}
                      className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="text-center mt-2">
                    <p className="text-[11px] text-muted-foreground">
                      Dica: Não fale o preço logo no início. Investigue as necessidades e a dor do cliente primeiro.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ================= ABA 2: RELATÓRIO & SCORECARD ================= */}
        {activeTab === "report" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {isLoadingReportSession && !currentReport ? (
              <div className="py-24 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="font-medium text-foreground">Carregando Scorecard e Auditoria do Atendimento...</span>
              </div>
            ) : !currentReport ? (
              <Card className="p-12 text-center border-dashed">
                <Target className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-foreground">Nenhum relatório selecionado</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Finalize um atendimento na Arena de Treino ou escolha uma sessão no Histórico para visualizar a auditoria completa.
                </p>
                <Button size="sm" onClick={() => setActiveTab("arena")}>
                  Ir para a Arena de Treino
                </Button>
              </Card>
            ) : (
              <>
                {/* Banner de Resultado da Venda */}
                <div
                  className={cn(
                    "p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm",
                    currentReport.outcome === "won"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : currentReport.outcome === "lost"
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-3 rounded-xl",
                        currentReport.outcome === "won"
                          ? "bg-emerald-500/20 text-emerald-600"
                          : currentReport.outcome === "lost"
                          ? "bg-rose-500/20 text-rose-600"
                          : "bg-amber-500/20 text-amber-600"
                      )}
                    >
                      {currentReport.outcome === "won" ? (
                        <Trophy className="w-7 h-7" />
                      ) : (
                        <AlertTriangle className="w-7 h-7" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">
                        {scorecard?.outcome_label ||
                          (currentReport.outcome === "won"
                            ? "Venda Realizada com Sucesso! 🎉"
                            : currentReport.outcome === "lost"
                            ? "Negociação Perdida / Esfriou ❌"
                            : "Negociação em Andamento 🟡")}
                      </h3>
                      <p className="text-xs opacity-85">
                        Lead simulado: <span className="font-semibold">{currentReport.lead_name}</span> • Atendimento realizado em{" "}
                        {new Date(currentReport.started_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-75">
                        Nota Geral
                      </div>
                      <div className="text-3xl font-black">
                        {Number(currentReport.overall_score || 0).toFixed(1)}
                        <span className="text-sm font-normal opacity-70">/10</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Histórico do Atendimento / O que foi conversado */}
                {reportMessages && reportMessages.length > 0 && (
                  <Card className="border-border/80 shadow-2xs">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-primary" />
                          <CardTitle className="text-base">Histórico do Atendimento (O que foi conversado)</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {reportMessages.length} mensagens trocadas
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        Transcrição completa das mensagens trocadas no treino entre a consultora e {currentReport.lead_name}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[340px] overflow-y-auto space-y-3 p-3.5 rounded-xl bg-muted/25 border border-border/60">
                        {reportMessages.map((msg: any) => {
                          const isLead = msg.sender_type === "lead";
                          return (
                            <div
                              key={msg.id}
                              className={cn("flex", isLead ? "justify-start" : "justify-end")}
                            >
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs text-xs space-y-1",
                                  isLead
                                    ? "bg-card border border-border text-card-foreground rounded-tl-xs"
                                    : "bg-primary text-primary-foreground rounded-tr-xs"
                                )}
                              >
                                <div className="flex items-center justify-between gap-3 text-[10px] font-semibold opacity-75">
                                  <span>{isLead ? currentReport.lead_name : (currentReport.profiles?.name || "Consultora")}</span>
                                  <span>
                                    {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Scorecard de Performance (Critérios Dinâmicos 0 a 10) */}
                <Card className="border-border/80">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-amber-500" />
                        <CardTitle className="text-base">Scorecard de Performance (0 a 10)</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Auditado pelo Sales Coach IA
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Critérios técnicos avaliados com base no prompt da empresa.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {scorecard?.scorecard?.map((item: any, idx: number) => {
                        const score = Number(item.score || 0);
                        const progressPercent = Math.min(Math.max(score * 10, 0), 100);
                        return (
                          <div
                            key={idx}
                            className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">
                                {item.criteria}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn("text-xs font-bold px-2 py-0.5", getScoreBadgeColor(score))}
                              >
                                {score.toFixed(1)}/10
                              </Badge>
                            </div>
                            <Progress value={progressPercent} className="h-2" />
                            {item.feedback && (
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {item.feedback}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* O Coração do Treino: O que Você Falou vs O que Poderia ter Falado */}
                {scorecard?.comparatives && scorecard.comparatives.length > 0 && (
                  <Card className="border-border/80">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        <CardTitle className="text-base">
                          Análise Prática: O que Falou vs O que Poderia ter Falado
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        Pontos de inflexão da conversa onde uma resposta diferente aumentaria a chance de fechamento.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {scorecard.comparatives.map((comp: any, idx: number) => (
                        <div
                          key={idx}
                          className="border border-border/80 rounded-xl p-4 bg-card/60 space-y-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[11px] font-medium">
                              Momento: {comp.moment}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* O que a consultora falou */}
                            <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs space-y-1">
                              <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                ❌ O que você falou:
                              </span>
                              <p className="text-muted-foreground italic">"{comp.trainee_said}"</p>
                            </div>

                            {/* O que ela poderia ter falado */}
                            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2 relative group">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  💡 O que você poderia ter falado:
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyToClipboard(comp.coach_suggested)}
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  title="Copiar sugestão"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <p className="text-foreground font-medium">"{comp.coach_suggested}"</p>
                            </div>
                          </div>

                          {comp.tactical_reason && (
                            <div className="text-[11px] bg-muted/40 p-2.5 rounded-lg border border-border/50 text-muted-foreground flex items-start gap-1.5">
                              <Target className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>
                                <strong className="text-foreground font-semibold">Por que faz diferença:</strong>{" "}
                                {comp.tactical_reason}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Pontos Fortes e Pontos a Melhorar */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scorecard?.strengths && scorecard.strengths.length > 0 && (
                    <Card className="border-emerald-500/30 bg-emerald-500/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          O que Você Fez Muito Bem
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="text-xs space-y-1.5 text-muted-foreground list-disc list-inside">
                          {scorecard.strengths.map((s: string, i: number) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {scorecard?.improvements && scorecard.improvements.length > 0 && (
                    <Card className="border-amber-500/30 bg-amber-500/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          Onde Focar no Próximo Treino
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="text-xs space-y-1.5 text-muted-foreground list-disc list-inside">
                          {scorecard.improvements.map((imp: string, i: number) => (
                            <li key={i}>{imp}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Resumo do Coach em Markdown */}
                {scorecard?.executive_summary_markdown && (
                  <Card className="border-border/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary" />
                        Parecer do Treinador de Vendas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {scorecard.executive_summary_markdown}
                      </ReactMarkdown>
                    </CardContent>
                  </Card>
                )}

                {/* Ações Finais */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2 pb-6">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setActiveTab("history")}
                    className="text-xs gap-1.5"
                  >
                    <Clock className="w-4 h-4" />
                    Ver Todo o Histórico
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => {
                      setReportSessionId(null);
                      setActiveTab("arena");
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white gap-2 font-semibold shadow-md text-xs"
                  >
                    <Zap className="w-4 h-4" />
                    Iniciar Outro Treinamento
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= ABA 3: PLAYBOOK & PROCEDIMENTOS ================= */}
        {activeTab === "playbook" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header com Ação */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border/80 shadow-xs">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Playbook Comercial & Procedimentos da Empresa
                </h3>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Cadastre procedimentos, tratamentos, explicações técnicas, regras de preço e scripts de vendas.
                  O Sales Coach utiliza essas informações tanto no chat em tempo real com clientes quanto no treino às cegas e scorecard.
                </p>
              </div>

              {isManagerOrAdmin && (
                <Button
                  onClick={openNewProcedureModal}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0 text-xs shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Novo Procedimento / Script
                </Button>
              )}
            </div>

            {/* Barra de Busca e Filtros de Categoria */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar procedimentos, explicações, dúvidas ou palavras-chave..."
                    value={playbookSearch}
                    onChange={(e) => setPlaybookSearch(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 shrink-0">
                  {[
                    { id: "all", label: "Todos" },
                    { id: "procedure", label: "Procedimentos" },
                    { id: "faq", label: "Dúvidas (FAQ)" },
                    { id: "pricing", label: "Preços & Regras" },
                    { id: "objection_script", label: "Scripts" },
                    { id: "policy", label: "Políticas" },
                  ].map((cat) => (
                    <Button
                      key={cat.id}
                      variant={playbookCategoryFilter === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPlaybookCategoryFilter(cat.id)}
                      className="text-xs h-8 px-3 rounded-lg"
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid de Procedimentos */}
            {isLoadingPlaybook ? (
              <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                Carregando playbook e procedimentos...
              </div>
            ) : !playbookData || playbookData.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-foreground">Nenhum procedimento encontrado</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  {playbookSearch || playbookCategoryFilter !== "all"
                    ? "Nenhum resultado corresponde aos filtros de busca aplicados."
                    : "Cadastre o primeiro procedimento, explicação ou script de vendas para guiar o Sales Coach e as consultoras."}
                </p>
                {isManagerOrAdmin && (
                  <Button size="sm" onClick={openNewProcedureModal} className="text-xs gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Primeiro Procedimento
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {playbookData.map((item: any) => {
                  const categoryBadgeColor =
                    {
                      procedure: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                      faq: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
                      pricing: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                      objection_script: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
                      policy: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
                    }[item.category as string] || "bg-muted text-muted-foreground";

                  const categoryLabel =
                    {
                      procedure: "Procedimento / Serviço",
                      faq: "Dúvidas & Explicações",
                      pricing: "Preços & Condições",
                      objection_script: "Script de Objeção",
                      policy: "Políticas Internas",
                    }[item.category as string] || item.category;

                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "border-border/80 flex flex-col justify-between transition-all hover:shadow-xs",
                        !item.is_active && "opacity-60"
                      )}
                    >
                      <CardHeader className="pb-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5", categoryBadgeColor)}>
                                {categoryLabel}
                              </Badge>
                              {!item.is_active && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Inativo
                                </Badge>
                              )}
                              {item.target_audience && (
                                <Badge variant="outline" className="text-[10px] bg-muted/40">
                                  {item.target_audience}
                                </Badge>
                              )}
                            </div>
                            <CardTitle className="text-sm font-bold text-foreground">
                              {item.title}
                            </CardTitle>
                          </div>

                          {isManagerOrAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditProcedureModal(item)}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Editar procedimento"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Deseja realmente excluir "${item.title}"?`)) {
                                    deleteProcedureMutation.mutate(item.id);
                                  }
                                }}
                                className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                                title="Excluir procedimento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3 pt-0 flex-1 flex flex-col justify-between">
                        <div className="space-y-2.5">
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {item.content}
                          </p>

                          {item.key_points && item.key_points.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Pontos-chave & Gatilhos:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {item.key_points.map((pt: string, pIdx: number) => (
                                  <span
                                    key={pIdx}
                                    className="text-[11px] bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded-md font-medium"
                                  >
                                    ✓ {pt}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            Atualizado em {new Date(item.updated_at).toLocaleDateString("pt-BR")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              copyToClipboard(item.content);
                              toast.success("Explicação copiada para a área de transferência!");
                            }}
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3 h-3" />
                            Copiar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 4: GESTÃO & OBJEÇÕES REAIS ================= */}
        {activeTab === "insights" && isManagerOrAdmin && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header da Mineração */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border/80 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  Minerador de Objeções das Conversas Reais
                </h3>
                <p className="text-xs text-muted-foreground">
                  A IA analisa as mensagens trocadas com clientes reais no WhatsApp/Instagram e ranqueia as maiores barreiras de compra da sua empresa.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => mineObjectionsMutation.mutate("week")}
                  disabled={mineObjectionsMutation.isPending}
                  className="gap-1.5 text-xs"
                >
                  {mineObjectionsMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Minerar Últimos 7 Dias
                </Button>

                <Button
                  size="sm"
                  onClick={() => mineObjectionsMutation.mutate("month")}
                  disabled={mineObjectionsMutation.isPending}
                  className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {mineObjectionsMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5" />
                  )}
                  Minerar Último Mês
                </Button>
              </div>
            </div>

            {isLoadingInsights ? (
              <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                Carregando mapa de objeções da empresa...
              </div>
            ) : !objectionInsightsData ? (
              <Card className="p-12 text-center border-dashed">
                <HelpCircle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-foreground">Nenhuma análise de conversas ainda</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Clique no botão acima para que a IA analise as conversas reais recentes e extraia as principais objeções enfrentadas pelo seu time.
                </p>
                <Button
                  size="sm"
                  onClick={() => mineObjectionsMutation.mutate("week")}
                  disabled={mineObjectionsMutation.isPending}
                >
                  Disparar Mineração Agora
                </Button>
              </Card>
            ) : (
              <>
                {/* Resumo Executivo da IA */}
                {(objectionInsightsData.objections_data as any)?.executive_summary && (
                  <Card className="border-indigo-500/20 bg-indigo-500/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        Diagnóstico Geral do Comportamento dos Clientes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {(objectionInsightsData.objections_data as any).executive_summary}
                    </CardContent>
                  </Card>
                )}

                {/* Grid das Maiores Objeções */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-500" />
                    Top Objeções que Travam as Vendas da Empresa
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(objectionInsightsData.objections_data as any)?.objections?.map(
                      (obj: any, idx: number) => (
                        <Card key={idx} className="border-border/80 shadow-2xs">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                                  #{idx + 1}
                                </span>
                                {obj.category}
                              </CardTitle>
                              <Badge variant="outline" className="text-xs font-semibold bg-muted">
                                {obj.percentage}% dos leads
                              </Badge>
                            </div>
                            <CardDescription className="text-xs">
                              {obj.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {obj.sample_quotes && obj.sample_quotes.length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-border/50">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Exemplos de falas reais dos clientes:
                                </span>
                                <div className="space-y-1">
                                  {obj.sample_quotes.map((quote: string, qIdx: number) => (
                                    <p
                                      key={qIdx}
                                      className="text-xs italic bg-muted/40 p-2 rounded-md border border-border/40 text-foreground"
                                    >
                                      "{quote}"
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    )}
                  </div>
                </div>

                {/* Dicas e Treinos Recomendados */}
                {(objectionInsightsData.objections_data as any)?.recommended_drills && (
                  <Card className="border-border/80">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-amber-500" />
                        Recomendações do Sales Coach para Treinamento da Equipe
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                        {(objectionInsightsData.objections_data as any).recommended_drills.map(
                          (drill: string, dIdx: number) => (
                            <li key={dIdx}>{drill}</li>
                          )
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= ABA 4: HISTÓRICO DE TREINOS ================= */}
        {activeTab === "history" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold text-foreground">Histórico de Sessões de Treinamento</h3>
                <p className="text-xs text-muted-foreground">
                  Acompanhe a evolução das consultoras ao longo do tempo.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchHistory()}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </Button>
            </div>

            {isLoadingHistory ? (
              <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                Buscando histórico...
              </div>
            ) : !sessionsHistoryData || sessionsHistoryData.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-foreground">Nenhum treino realizado ainda</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Inicie o primeiro atendimento na aba "Arena de Treino".
                </p>
                <Button size="sm" onClick={() => setActiveTab("arena")}>
                  Iniciar Primeiro Treino
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {sessionsHistoryData.map((session: any) => {
                  const score = Number(session.overall_score || 0);
                  const isCompleted = session.status === "completed";
                  return (
                    <Card
                      key={session.id}
                      className="p-4 border-border/80 hover:border-border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarFallback className="bg-muted text-xs font-bold">
                            {session.lead_name?.slice(0, 2).toUpperCase() || "CL"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              {session.lead_name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                session.outcome === "won"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                  : session.outcome === "lost"
                                  ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {session.outcome === "won"
                                ? "Venda Realizada"
                                : session.outcome === "lost"
                                ? "Venda Perdida"
                                : "Em Aberto"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Consultora: <span className="font-medium text-foreground">{session.profiles?.name || "Consultora"}</span> •{" "}
                            {new Date(session.started_at).toLocaleDateString("pt-BR")} às{" "}
                            {new Date(session.started_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {isCompleted && (
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={cn("text-xs font-bold px-2.5 py-1", getScoreBadgeColor(score))}
                            >
                              Nota {score.toFixed(1)}/10
                            </Badge>
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            qc.setQueryData(["training-session-report", session.id], (old: any) => ({
                              session: session,
                              messages: old?.messages || [],
                            }));
                            setReportSessionId(session.id);
                            setActiveTab("report");
                          }}
                          className="gap-1 text-xs"
                        >
                          Ver Scorecard
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Criação / Edição de Procedimento */}
      <Dialog open={isProcedureModalOpen} onOpenChange={setIsProcedureModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              {editingProcedure ? "Editar Procedimento / Script" : "Novo Procedimento / Script de Vendas"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Essas informações serão utilizadas pelo Sales Coach para guiar as consultoras no chat ao vivo e auditar treinamentos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Título do Procedimento ou Tópico *</label>
              <Input
                placeholder="Ex: Depilação a Laser - Axilas e Virilha"
                value={procTitle}
                onChange={(e) => setProcTitle(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Categoria</label>
                <Select value={procCategory} onValueChange={(val: any) => setProcCategory(val)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procedure">Procedimento / Serviço</SelectItem>
                    <SelectItem value="faq">Dúvidas Frequentes & Explicações</SelectItem>
                    <SelectItem value="pricing">Preços & Condições Comerciais</SelectItem>
                    <SelectItem value="objection_script">Script de Objeção</SelectItem>
                    <SelectItem value="policy">Políticas & Diretrizes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Público / Indicação (Opcional)</label>
                <Input
                  placeholder="Ex: Peles sensíveis, mulheres 25-45"
                  value={procTargetAudience}
                  onChange={(e) => setProcTargetAudience(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                Explicação Oficial / Conteúdo Detalhado *
              </label>
              <Textarea
                placeholder="Explique como funciona o procedimento, os benefícios reais para o cliente, diferenciais da clínica e como responder quando o cliente perguntar..."
                value={procContent}
                onChange={(e) => setProcContent(e.target.value)}
                rows={5}
                className="text-xs resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">
                Pontos-chave & Gatilhos de Valor (1 por linha)
              </label>
              <Textarea
                placeholder="Ex:&#10;Tecnologia indolor sem queimaduras&#10;Resultados visíveis a partir da 1ª sessão&#10;Garantia de retoque gratuita"
                value={procKeyPoints}
                onChange={(e) => setProcKeyPoints(e.target.value)}
                rows={3}
                className="text-xs resize-y"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/20">
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Ativo no Playbook da IA</span>
                <p className="text-[11px] text-muted-foreground">
                  Quando ativo, o Sales Coach utiliza este procedimento nas orientações e no treino.
                </p>
              </div>
              <Switch checked={procIsActive} onCheckedChange={setProcIsActive} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsProcedureModalOpen(false)}
              disabled={upsertProcedureMutation.isPending}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => upsertProcedureMutation.mutate()}
              disabled={upsertProcedureMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              {upsertProcedureMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingProcedure ? "Salvar Alterações" : "Cadastrar Procedimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
