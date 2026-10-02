/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Bot,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Building,
  Minus,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils";
import { useCopilot } from "@/hooks/use-copilot";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import {
  copilotSendMessageAction,
  copilotGetSuggestionsAction,
  copilotTranscribeAudioAction,
} from "@/lib/api/copilot.functions";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  executedActions?: Array<{
    tool: string;
    args: any;
    success: boolean;
    resultSummary: string;
  }>;
  createdAt: number;
}

export function CopilotFloatingChat() {
  const { isOpen, setIsOpen, screenContext, initialPrompt } = useCopilot();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const currentRoute = useRouterState({ select: (s) => s.location.pathname });

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedActions, setExpandedActions] = useState<Record<string, boolean>>({});
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Estados e referências para gravação e transcrição de áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Limpeza de stream de áudio e timers no unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("[CopilotAudio] Erro ao iniciar gravação:", err);
      toast.error("Não foi possível acessar o microfone", {
        description: "Verifique se a permissão de microfone está habilitada no navegador.",
      });
    }
  };

  const stopRecording = (autoSend = true) => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const mimeType = recorder.mimeType || "audio/webm";

    recorder.onstop = async () => {
      setIsRecording(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      if (audioBlob.size < 1000) {
        toast.info("Áudio muito curto. Tente novamente.");
        return;
      }

      setIsTranscribing(true);
      const toastId = toast.loading("Transcrevendo áudio com IA (Whisper)...");

      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64data = reader.result as string;
            if (!activeCompanyId) throw new Error("Selecione uma empresa.");

            const res = await copilotTranscribeAudioAction({
              data: {
                companyId: activeCompanyId,
                audioBase64: base64data,
                mimeType,
              },
            });

            toast.dismiss(toastId);
            const transcribedText = (res.text || "").trim();

            if (!transcribedText) {
              toast.info("Não foi possível identificar nenhuma fala no áudio.");
              return;
            }

            if (autoSend) {
              toast.success("Áudio transcrito com sucesso!", {
                description: `"${transcribedText}"`,
              });
              sendMutation.mutate(transcribedText);
            } else {
              setInput((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
              toast.success("Áudio transcrito para o campo de texto!");
              setTimeout(() => textareaRef.current?.focus(), 100);
            }
          } catch (error: any) {
            console.error("[CopilotAudio] Erro na transcrição:", error);
            toast.dismiss(toastId);
            toast.error("Falha ao transcrever áudio", {
              description: error?.message || "Tente falar novamente.",
            });
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      } catch (err: any) {
        console.error("[CopilotAudio] Erro ao ler áudio:", err);
        toast.dismiss(toastId);
        toast.error("Erro ao processar gravação de áudio.");
        setIsTranscribing(false);
      }
    };

    try {
      recorder.stop();
    } catch (e) {
      console.warn("[CopilotAudio] Exceção ao parar recorder:", e);
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
    toast("Gravação cancelada.");
  };

  // Armazenamento local do histórico da conversa por usuário e empresa
  const storageKey = `atendi_copilot_chat_${profile?.id || "guest"}_${activeCompanyId || "default"}`;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (messages.length > 0 && typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
    }
  }, [messages, storageKey]);

  // Se houver prompt inicial passado via trigger externo
  useEffect(() => {
    if (isOpen && initialPrompt) {
      setInput(initialPrompt);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 200);
    }
  }, [isOpen, initialPrompt]);

  // Rolagem suave para o fim ao receber nova mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Buscar sugestões dinâmicas de acordo com o papel e rota atual
  const { data: suggestions } = useQuery({
    queryKey: ["copilot-suggestions", currentRoute, profile?.role],
    enabled: isOpen && !!profile?.id,
    queryFn: async () => {
      const res = await copilotGetSuggestionsAction({
        data: { currentRoute },
      });
      return (res as string[]) || [];
    },
  });

  // Mutação para envio de mensagem e execução das ferramentas MCP
  const sendMutation = useMutation({
    mutationFn: async (userText: string) => {
      if (!activeCompanyId) throw new Error("Selecione uma empresa.");

      const newMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
        createdAt: Date.now(),
      };

      const updatedHistory = [...messages, newMsg];
      setMessages(updatedHistory);
      setInput("");

      const apiMessages = updatedHistory.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await copilotSendMessageAction({
        data: {
          companyId: activeCompanyId,
          messages: apiMessages,
          currentRoute,
          selectedUnitId,
          screenContext,
        },
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        executedActions: res.executedActions,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      return res;
    },
    onError: (err: any) => {
      toast.error("Erro no Copilot", {
        description: err?.message || "Não foi possível obter resposta da IA.",
      });
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
    toast.success("Histórico da conversa limpo.");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copiado para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleActions = (msgId: string) => {
    setExpandedActions((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";
  const isManager = profile?.role === "manager";

  return (
    <>
      {/* Botão Flutuante (quando o chat estiver fechado / minimizado) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Abrir Atendi Copilot (Ctrl + J)"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-primary via-indigo-600 to-primary text-white shadow-xl hover:shadow-2xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 group cursor-pointer"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          </div>
          <span className="text-xs font-semibold tracking-wide">Copilot</span>
          <span className="hidden sm:inline text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono">
            Ctrl+J
          </span>
        </button>
      )}

      {/* Janela Flutuante do Chat (quando aberto) */}
      {isOpen && (
        <div
          className={`fixed bottom-5 right-5 z-40 flex flex-col bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl overflow-hidden transition-all duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 ${
            isExpanded
              ? "w-[95vw] sm:w-[680px] md:w-[720px] h-[85vh] max-h-[820px]"
              : "w-[92vw] sm:w-[460px] md:w-[480px] h-[620px] max-h-[85vh]"
          }`}
          style={{
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 20px rgba(99, 102, 241, 0.15)",
          }}
        >
          {/* Header do Chat Flutuante */}
          <div className="p-3.5 border-b bg-card/80 backdrop-blur flex items-center justify-between select-none">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-primary to-emerald-500 flex items-center justify-center text-white shadow-md shadow-primary/20 shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate">Atendi Copilot</span>
                  <Badge
                    variant="outline"
                    className={
                      isAdmin
                        ? "border-amber-500/30 text-amber-500 bg-amber-500/10 text-[10px] px-1.5 py-0 font-medium"
                        : isManager
                          ? "border-blue-500/30 text-blue-500 bg-blue-500/10 text-[10px] px-1.5 py-0 font-medium"
                          : "border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[10px] px-1.5 py-0 font-medium"
                    }
                  >
                    <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                    {isAdmin ? "Admin" : isManager ? "Gerente" : "Atendente"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                  <Building className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    {selectedUnitId ? "Unidade Selecionada" : "Visão Matriz (Rede)"}
                  </span>
                </p>
              </div>
            </div>

            {/* Ações do Header */}
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearChat}
                  title="Limpar conversa"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? "Restaurar tamanho" : "Expandir janela"}
                className="h-7 w-7 text-muted-foreground hover:text-foreground hidden sm:flex"
              >
                {isExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                title="Minimizar (Ctrl + J)"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Área de Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs sm:text-sm"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-3 py-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Como posso ajudar seu dia no Atendi?
                </h3>
                <p className="text-[11px] text-muted-foreground max-w-xs mt-1 mb-5">
                  {isAdmin
                    ? "Ajuste SLAs, configure etapas de funis, cadastre etiquetas ou consulte métricas globais."
                    : "Consulte procedimentos no Playbook, crie tarefas de retorno ou movimente negócios no funil."}
                </p>

                {/* Sugestões de Prompts Rápidos */}
                {suggestions && suggestions.length > 0 && (
                  <div className="w-full space-y-1.5 max-w-sm text-left">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Sugestões para esta tela
                    </p>
                    <div className="grid gap-1.5">
                      {suggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => sendMutation.mutate(sug)}
                          className="text-left text-xs bg-muted/60 hover:bg-primary/10 hover:border-primary/30 border rounded-xl p-2.5 text-foreground transition-all duration-150 flex items-center justify-between group cursor-pointer"
                        >
                          <span className="line-clamp-2">{sug}</span>
                          <Send className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-card border text-card-foreground rounded-bl-none"
                    }`}
                  >
                    {/* Se houver ações executadas pelo MCP (Tool Calling) */}
                    {msg.executedActions && msg.executedActions.length > 0 && (
                      <div className="mb-2.5 border-b pb-2">
                        <div
                          onClick={() => toggleActions(msg.id)}
                          className="flex items-center justify-between cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            {msg.executedActions.length === 1
                              ? "1 ação executada no sistema"
                              : `${msg.executedActions.length} ações executadas no sistema`}
                          </span>
                          {expandedActions[msg.id] ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </div>

                        {expandedActions[msg.id] && (
                          <div className="mt-2 space-y-1.5 pt-1">
                            {msg.executedActions.map((act, idx) => (
                              <div
                                key={idx}
                                className="text-[11px] bg-muted/60 border rounded-lg p-2 font-mono"
                              >
                                <div className="flex items-center justify-between font-semibold text-[10px] text-foreground">
                                  <span className="flex items-center gap-1 text-primary">
                                    ⚡ {act.tool}
                                  </span>
                                  {act.success ? (
                                    <span className="text-[9px] text-emerald-600 font-sans font-medium">
                                      Sucesso
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-destructive font-sans font-medium flex items-center gap-0.5">
                                      <AlertTriangle className="h-2.5 w-2.5" /> Erro
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-3">
                                  {act.resultSummary}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Conteúdo Markdown da Resposta */}
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-xs sm:text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>

                  {/* Ações da Mensagem do Assistente */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-muted-foreground">
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-emerald-500" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-2.5 w-2.5" /> Copiar
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Indicador de Carregamento */}
            {sendMutation.isPending && (
              <div className="flex items-start gap-2">
                <div className="bg-card border text-card-foreground rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs shadow-sm flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="animate-pulse">Consultando MCP e executando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Footer (Layout idêntico ao Chat de Atendimento) */}
          <div className="p-3 border-t bg-card/80 backdrop-blur">
            <div className="flex items-end gap-2">
              {!isRecording && !isTranscribing ? (
                <>
                  <div
                    className={cn(
                      "flex-1 flex items-end bg-muted/60 rounded-3xl border border-transparent shadow-xs px-2 py-1 focus-within:border-border focus-within:bg-background transition-colors min-h-[42px]",
                    )}
                  >
                    <TextareaAutosize
                      ref={textareaRef as any}
                      spellCheck={true}
                      autoCorrect="on"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        isAdmin
                          ? "Peça para ajustar SLA, criar etiquetas, etapas..."
                          : "Pergunte sobre procedimentos, crie tarefas, mova oportunidades..."
                      }
                      minRows={1}
                      maxRows={5}
                      className="flex-1 w-full bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {/* Botão de Enviar / Áudio (idêntico ao Chat de Atendimento) */}
                  {input.trim() ? (
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleSend}
                      disabled={sendMutation.isPending}
                      className="mb-0.5 rounded-full h-10 w-10 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all flex items-center justify-center cursor-pointer"
                      title="Enviar mensagem (Enter)"
                    >
                      <Send className="h-4 w-4 ml-0.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      onClick={startRecording}
                      disabled={sendMutation.isPending}
                      className="mb-0.5 rounded-full h-10 w-10 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all flex items-center justify-center cursor-pointer"
                      title="Gravar áudio"
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                  )}
                </>
              ) : isRecording ? (
                <div className="flex items-center justify-between flex-1 bg-destructive/10 text-destructive px-3.5 py-1.5 rounded-3xl border border-destructive/20 min-h-[42px] animate-in fade-in-50 duration-200">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                    </span>
                    <span className="text-xs font-semibold font-mono">
                      {formatDuration(recordingDuration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs hover:bg-destructive/20 hover:text-destructive text-destructive/80"
                      onClick={cancelRecording}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-foreground hover:bg-background/80"
                      onClick={() => stopRecording(false)}
                      title="Inserir transcrição no campo de texto"
                    >
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                      Texto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-3 bg-destructive hover:bg-destructive/90 text-white text-xs gap-1 rounded-full shadow-sm"
                      onClick={() => stopRecording(true)}
                    >
                      <Send className="h-3 w-3" />
                      Enviar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center flex-1 bg-muted/50 text-muted-foreground rounded-3xl border px-4 py-2 min-h-[42px] gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium animate-pulse">
                    Transcrevendo áudio com Whisper...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Exportar como CopilotDrawer para compatibilidade com importações existentes
export { CopilotFloatingChat as CopilotDrawer };
