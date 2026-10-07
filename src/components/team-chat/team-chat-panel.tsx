import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Send, 
  Smile, 
  Hash, 
  Building2, 
  Globe, 
  Users, 
  MessageSquare,
  Reply,
  X,
  Loader2,
  ChevronLeft,
  Paperclip,
  Mic,
  Square,
  FileText,
  Download,
  Image as ImageIcon,
  AtSign,
  Plus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  MoreVertical,
  Lock,
  Megaphone,
  Check,
  Search,
  FolderOpen,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import EmojiPicker from "emoji-picker-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { InternalChannel, InternalMessage, TeamMember } from "./team-chat-types";
import { TeamChatMediaDrawer } from "./team-chat-media-drawer";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🚀", "👀", "✅"];

interface TeamChatPanelProps {
  channel: InternalChannel;
  messages: InternalMessage[];
  isLoadingMessages: boolean;
  onSendMessage: (payload: {
    content: string;
    mediaType?: "text" | "image" | "audio" | "video" | "document";
    mediaUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    replyToId?: string | null;
  }) => void;
  onUploadFile: (file: File) => Promise<{
    url: string;
    fileName: string;
    fileSize: number;
    mediaType: "image" | "audio" | "document";
  }>;
  onToggleReaction: (payload: { messageId: string; emoji: string }) => void;
  teamMembers?: TeamMember[];
  isSending: boolean;
  onBack?: () => void;
  // Pilar 3: Presença e Digitando
  onlineUserIds?: string[];
  typingUsers?: string[];
  onTyping?: () => void;
  onStopTyping?: () => void;
  // Pilar 4: Gestão, Avisos & Moderação
  onTogglePinMessage?: (payload: { messageId: string; isPinned: boolean }) => void;
  onEditMessage?: (payload: { messageId: string; content: string }) => void;
  onDeleteMessage?: (payload: { messageId: string }) => void;
}

export function TeamChatPanel({
  channel,
  messages,
  isLoadingMessages,
  onSendMessage,
  onUploadFile,
  onToggleReaction,
  teamMembers = [],
  isSending,
  onBack,
  onlineUserIds = [],
  typingUsers = [],
  onTyping,
  onStopTyping,
  onTogglePinMessage,
  onEditMessage,
  onDeleteMessage,
}: TeamChatPanelProps) {
  const { profile } = useAuth();
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<InternalMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<InternalMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // Estados do Pilar 5: Busca, Galeria de Mídias & Resumo IA
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mediaDrawerOpen, setMediaDrawerOpen] = useState(false);

  // Busca textual no histórico do canal ativo
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return messages.filter((m) => {
      if (m.is_deleted) return false;
      const content = m.content?.toLowerCase() || "";
      const sender = m.sender?.name?.toLowerCase() || "";
      const file = m.file_name?.toLowerCase() || "";
      return content.includes(q) || sender.includes(q) || file.includes(q);
    });
  }, [messages, searchQuery]);

  // Redefine índice de busca quando a query mudar
  useEffect(() => {
    setCurrentSearchIndex(0);
    if (searchMatches.length > 0) {
      scrollToMessage(searchMatches[0].id);
    }
  }, [searchQuery]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const next = (currentSearchIndex + 1) % searchMatches.length;
    setCurrentSearchIndex(next);
    scrollToMessage(searchMatches[next].id);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const prev = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentSearchIndex(prev);
    scrollToMessage(searchMatches[prev].id);
  };

  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  // Atalho de teclado: Ctrl+F ou Cmd+F para abrir busca no chat da equipe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleOpenSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Permissões de Moderação / Diretoria
  const isManagerOrAdmin = useMemo(() => {
    if (!profile?.id) return false;
    if (
      profile.role === "admin_company" ||
      profile.role === "super_admin" ||
      profile.role === "manager"
    ) {
      return true;
    }
    if (channel.created_by === profile.id) return true;
    return channel.members?.some((m) => m.user_id === profile.id && m.role === "admin") || false;
  }, [profile, channel]);

  // Se o canal é de avisos e o usuário não é gestor/admin, fica somente leitura
  const isReadOnlyAnnouncement = Boolean(channel.is_announcement && !isManagerOrAdmin);

  // Mensagens fixadas ativas (não apagadas)
  const pinnedMessages = useMemo(() => {
    return messages.filter((m) => m.is_pinned && !m.is_deleted);
  }, [messages]);

  const latestPinned = pinnedMessages.length > 0 ? pinnedMessages[pinnedMessages.length - 1] : null;

  // Scroll suave com destaque visual para mensagem específica (ao clicar no banner de fixada)
  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`internal-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMsgId(messageId);
      setTimeout(() => {
        setHighlightedMsgId(null);
      }, 2500);
    }
  };

  // Controle de digitação (Typing indicator)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Estados de Gravação de Áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados de Menções (@)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorIndex, setMentionCursorIndex] = useState<number>(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup do timer de digitação ao desmontar ou trocar de canal
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onStopTyping?.();
    };
  }, [channel.id, onStopTyping]);

  // Auto-scroll
  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timer);
  }, [messages, channel.id]);

  // Lista unificada de membros disponíveis para menção
  const mentionableMembers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatar_url?: string | null; role?: string | null }>();
    
    // Membros da equipe
    teamMembers.forEach((m) => {
      if (m.id !== profile?.id) {
        map.set(m.id, {
          id: m.id,
          name: m.name,
          avatar_url: m.avatar_url || null,
          role: m.role || null,
        });
      }
    });

    // Membros do próprio canal (se houver adicionais)
    if (channel.members) {
      channel.members.forEach((m) => {
        if (m.user_id !== profile?.id && m.profile && !map.has(m.user_id)) {
          map.set(m.user_id, {
            id: m.user_id,
            name: m.profile.name,
            avatar_url: (m.profile as any).avatar_url || null,
            role: m.profile.role || null,
          });
        }
      });
    }

    return Array.from(map.values());
  }, [teamMembers, channel.members, profile?.id]);

  // Função auxiliar para normalizar busca sem acentos
  const normalizeStr = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Lista de menções sugeridas filtradas (disponível apenas em grupos)
  const suggestedMembers = useMemo(() => {
    if (channel.type === "direct" || mentionQuery === null) return [];
    const q = normalizeStr(mentionQuery.trim());

    const list: Array<{
      id: string;
      name: string;
      avatar_url?: string | null;
      role?: string | null;
      isSpecial?: boolean;
      subtitle?: string;
    }> = [];

    // Se for canal em grupo, permite mencionar "@todos"
    if (channel.type === "group") {
      if (!q || normalizeStr("todos").includes(q) || normalizeStr("canal").includes(q)) {
        list.push({
          id: "all-members",
          name: "todos",
          isSpecial: true,
          subtitle: "Notificar todos neste canal",
        });
      }
    }

    const filtered = mentionableMembers.filter(
      (m) => !q || normalizeStr(m.name).includes(q)
    );

    list.push(
      ...filtered.map((m) => ({
        id: m.id,
        name: m.name,
        avatar_url: m.avatar_url,
        role: m.role,
        isSpecial: false,
      }))
    );

    return list.slice(0, 8);
  }, [mentionQuery, mentionableMembers, channel.type]);

  // Reseta o item selecionado ao mudar a query
  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery]);

  // Analisa se o cursor atual está em uma menção ativa (somente para canais de grupo)
  const checkMentionTrigger = (val: string, cursorPos: number) => {
    if (channel.type === "direct") {
      if (mentionQuery !== null) {
        setMentionQuery(null);
        setMentionCursorIndex(-1);
      }
      return;
    }

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      // O @ precisa estar no início do texto ou após espaço / quebra de linha
      const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
      if (/\s/.test(charBefore)) {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        // Permite nomes com espaços (ex: "Rhian Geraldo"), até 35 caracteres e sem quebras de linha
        if (!query.includes("\n") && query.length <= 35) {
          setMentionQuery(query);
          setMentionCursorIndex(lastAtIndex);
          return;
        }
      }
    }

    setMentionQuery(null);
    setMentionCursorIndex(-1);
  };

  // Detecta digitação, atualiza menções e transmite status digitando
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setText(val);
    checkMentionTrigger(val, cursorPos);

    if (val.trim()) {
      const now = Date.now();
      // Throttle: transmite no máximo 1 vez a cada 1.5s
      if (now - lastTypingSentRef.current > 1500) {
        onTyping?.();
        lastTypingSentRef.current = now;
      }

      // Reinicia o timer de parada por inatividade (2.5s)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onStopTyping?.();
      }, 2500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onStopTyping?.();
    }
  };

  // Seleciona menção e insere com posicionamento preciso do cursor
  const handleSelectMention = (memberName: string) => {
    if (mentionCursorIndex === -1) return;

    const before = text.slice(0, mentionCursorIndex);
    const queryLen = mentionQuery !== null ? mentionQuery.length : 0;
    const after = text.slice(mentionCursorIndex + 1 + queryLen);

    const inserted = `@${memberName} `;
    const newText = `${before}${inserted}${after}`;
    setText(newText);
    setMentionQuery(null);
    setMentionCursorIndex(-1);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextPos = before.length + inserted.length;
        inputRef.current.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  // Inserção manual pelo botão @ na toolbar (disponível apenas em grupos)
  const handleTriggerMention = () => {
    if (channel.type === "direct") return;
    const currentPos = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, currentPos);
    const after = text.slice(currentPos);
    const needLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const insert = `${needLeadingSpace ? " " : ""}@`;
    const newText = `${before}${insert}${after}`;
    const newPos = before.length + insert.length;

    setText(newText);
    setMentionCursorIndex(newPos - 1);
    setMentionQuery("");

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  };

  // Iniciar modo de edição
  const handleStartEdit = (msg: InternalMessage) => {
    setEditingMessage(msg);
    setText(msg.content || "");
    setReplyingTo(null);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // Cancelar modo de edição
  const handleCancelEdit = () => {
    setEditingMessage(null);
    setText("");
  };

  // Envio de mensagem de texto (ou confirmação de edição)
  const handleSend = () => {
    if (!text.trim() || isSending) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onStopTyping?.();

    if (editingMessage) {
      onEditMessage?.({
        messageId: editingMessage.id,
        content: text.trim(),
      });
      setEditingMessage(null);
      setText("");
      return;
    }

    onSendMessage({
      content: text,
      mediaType: "text",
      replyToId: replyingTo?.id || null,
    });
    setText("");
    setReplyingTo(null);
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Navegação no menu de menções (@)
    if (mentionQuery !== null && suggestedMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % suggestedMembers.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + suggestedMembers.length) % suggestedMembers.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = suggestedMembers[selectedMentionIndex] || suggestedMembers[0];
        if (selected) {
          handleSelectMention(selected.name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        setMentionCursorIndex(-1);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      if (editingMessage) {
        setEditingMessage(null);
        setText("");
      }
      setMentionQuery(null);
      setReplyingTo(null);
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    setText((prev) => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  // Upload e Envio de Arquivo / Foto
  const handleUploadAndSend = async (file: File) => {
    try {
      setIsUploading(true);
      toast.loading(`Enviando ${file.name}...`, { id: "upload-media" });
      const uploaded = await onUploadFile(file);

      onSendMessage({
        content: uploaded.fileName,
        mediaType: uploaded.mediaType,
        mediaUrl: uploaded.url,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        replyToId: replyingTo?.id || null,
      });

      toast.success("Arquivo enviado com sucesso!", { id: "upload-media" });
      setReplyingTo(null);
    } catch (err: any) {
      console.error("[TeamChat] Falha no upload:", err);
      toast.error(err?.message || "Erro ao enviar arquivo", { id: "upload-media" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Colar Imagem com Ctrl + V
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleUploadAndSend(file);
          return;
        }
      }
    }
  };

  // Gravação de Áudio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, {
            type: "audio/webm",
          });
          await handleUploadAndSend(audioFile);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("[TeamChat] Erro ao acessar microfone:", err);
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const stopAndSendRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Renderizador de menções e links no texto (destaques apenas em grupos)
  const renderFormattedText = (content: string | null, isFromMe: boolean = false) => {
    if (!content) return null;
    if (channel.type === "direct") {
      return <span className="whitespace-pre-wrap leading-relaxed break-words">{content}</span>;
    }

    // Coleta todos os nomes de membros conhecidos + opções globais + próprio perfil
    const candidateNames = ["todos", "canal", profile?.name, ...mentionableMembers.map((m) => m.name)];
    // Ordena por tamanho decrescente para que nomes compostos venham primeiro ("Rhian Geraldo" antes de "Rhian")
    const escapedNames = Array.from(new Set(candidateNames))
      .filter(Boolean)
      .sort((a, b) => (b?.length || 0) - (a?.length || 0))
      .map((n) => (n || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    const pattern =
      escapedNames.length > 0
        ? new RegExp(`(@(?:${escapedNames.join("|")}|[\\w\\u00C0-\\u00FF]+))`, "gi")
        : /(@[\w\u00C0-\u00FF]+)/g;

    const parts = content.split(pattern);

    return (
      <span className="whitespace-pre-wrap leading-relaxed break-words">
        {parts.map((part, idx) => {
          if (part && part.startsWith("@")) {
            const rawName = part.slice(1).trim().toLowerCase();
            const myName = (profile?.name || "").toLowerCase();
            const isMentioningMe =
              rawName === "todos" ||
              rawName === "canal" ||
              (myName && (rawName === myName || myName.startsWith(rawName) || rawName.startsWith(myName)));

            return (
              <span
                key={idx}
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded-md text-[11px] mx-0.5 align-baseline shadow-2xs transition-colors",
                  isFromMe
                    ? "bg-amber-400/30 text-amber-100 dark:text-amber-200 border border-amber-300/40 font-bold"
                    : "bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-500/50 ring-1 ring-amber-500/20 font-bold"
                )}
              >
                <AtSign className="h-2.5 w-2.5 inline shrink-0" />
                <span>{part.slice(1)}</span>
              </span>
            );
          }
          return part;
        })}
      </span>
    );
  };

  const otherUser = channel.other_user;
  const channelTitle = channel.type === "direct" ? otherUser?.name || "Conversa Direta" : channel.name;

  // Presença online
  const isSelfChat = channel.type === "direct" && (!otherUser || otherUser.id === profile?.id);
  const isOtherUserOnline = isSelfChat
    ? true
    : Boolean(
        (otherUser?.id && onlineUserIds.includes(otherUser.id)) ||
        otherUser?.online
      );

  const onlineGroupMembersCount = useMemo(() => {
    if (channel.type !== "group" || !channel.members) return 0;
    return channel.members.filter(
      (m) => onlineUserIds.includes(m.user_id) || (m.profile as any)?.online
    ).length;
  }, [channel.type, channel.members, onlineUserIds]);

  return (
    <div className="flex flex-col h-full bg-background min-h-0 overflow-hidden">
      {/* Header do Chat Interno */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 backdrop-blur-sm px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 -ml-2 md:hidden text-muted-foreground"
              onClick={onBack}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary shrink-0">
            {channel.type === "direct" ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={otherUser?.avatar_url || ""} />
                <AvatarFallback className="text-xs">
                  {initials(channelTitle || "C")}
                </AvatarFallback>
              </Avatar>
            ) : channel.scope === "company" ? (
              <Globe className="h-4 w-4" />
            ) : channel.scope === "unit" ? (
              <Building2 className="h-4 w-4 text-amber-500" />
            ) : (
              <Hash className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold truncate text-foreground">
                {channelTitle}
              </h2>
              {channel.unit && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/30">
                  {channel.unit.name}
                </Badge>
              )}
              {otherUser?.unit_name && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/30">
                  {otherUser.unit_name}
                </Badge>
              )}
              {channel.is_announcement && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 flex items-center gap-1">
                  <Megaphone className="h-2.5 w-2.5" />
                  <span>Avisos</span>
                </Badge>
              )}
            </div>

            {/* Subtítulo: Descrição ou Status Online do Colega */}
            {channel.type === "direct" ? (
              <div className="flex items-center gap-2 text-xs truncate">
                {isOtherUserOnline ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Online agora
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    Offline
                  </span>
                )}
                {otherUser?.role && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="text-muted-foreground capitalize text-[11px]">
                      {otherUser.role.replace("_", " ")}
                    </span>
                  </>
                )}
              </div>
            ) : channel.description ? (
              <p className="text-xs text-muted-foreground truncate">
                {channel.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {channel.type === "group" && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground mr-2">
              <Users className="h-3.5 w-3.5" />
              <span>{channel.members?.length || 1} membros</span>
              {onlineGroupMembersCount > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    {onlineGroupMembersCount} online
                  </span>
                </>
              )}
            </div>
          )}

          {/* Botão de Busca */}
          <Button
            size="icon"
            variant="ghost"
            onClick={searchOpen ? handleCloseSearch : handleOpenSearch}
            className={`h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer ${
              searchOpen ? "bg-muted text-primary" : ""
            }`}
            title="Buscar no chat"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Botão de Arquivos & Mídias */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMediaDrawerOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Arquivos e Mídias compartilhadas"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Barra de Busca Suspensa */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/70 border-b border-border text-xs animate-in fade-in slide-in-from-top-2 duration-150">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) handlePrevMatch();
                else handleNextMatch();
              } else if (e.key === "Escape") {
                handleCloseSearch();
              }
            }}
            placeholder="Buscar mensagens, arquivos ou autores... (Pressione Esc para fechar)"
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground"
          />

          {searchQuery && (
            <span className="text-[11px] text-muted-foreground px-1.5 shrink-0 font-medium">
              {searchMatches.length > 0
                ? `${currentSearchIndex + 1} de ${searchMatches.length}`
                : "Nenhum resultado"}
            </span>
          )}

          <div className="flex items-center gap-0.5 shrink-0 border-l border-border/60 pl-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={handlePrevMatch}
              disabled={searchMatches.length === 0}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Resultado anterior (Shift+Enter)"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNextMatch}
              disabled={searchMatches.length === 0}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Próximo resultado (Enter)"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCloseSearch}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer ml-1"
              title="Fechar busca (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Banner de Mensagem Fixada no Topo (Pin) */}
      {latestPinned && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-foreground animate-in fade-in slide-in-from-top-1 duration-200">
          <button
            type="button"
            onClick={() => scrollToMessage(latestPinned.id)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-85 transition-opacity cursor-pointer group"
          >
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <Pin className="h-3.5 w-3.5 fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                <span>Mensagem Fixada</span>
                {latestPinned.pinned_by_user?.name && (
                  <span className="font-normal text-muted-foreground">
                    • por {latestPinned.pinned_by_user.name}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground group-hover:text-foreground">
                {latestPinned.content || (latestPinned.media_type ? `[${latestPinned.media_type}]` : "Anexo")}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => scrollToMessage(latestPinned.id)}
              className="h-6 px-2 text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
            >
              Ver
            </Button>
            {isManagerOrAdmin && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  onTogglePinMessage?.({ messageId: latestPinned.id, isPinned: true })
                }
                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Desfixar mensagem"
              >
                <PinOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Área de Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">Carregando mensagens...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 text-center p-6">
            <div className="p-3 rounded-full bg-muted/50 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-60" />
            </div>
            <p className="text-sm font-medium">Nenhuma mensagem por aqui ainda</p>
            <p className="text-xs max-w-sm">
              Inicie a conversa com sua equipe enviando a primeira mensagem abaixo!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === profile?.id;
            const senderName = isMe ? "Você" : msg.sender?.name || "";
            const timeStr = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });

            // Agrupa reações por emoji
            const groupedReactions = (msg.reactions || []).reduce<
              Record<string, { count: number; users: string[]; hasReacted: boolean }>
            >((acc, r) => {
              if (!acc[r.emoji]) {
                acc[r.emoji] = { count: 0, users: [], hasReacted: false };
              }
              acc[r.emoji].count += 1;
              if (r.profile?.name) acc[r.emoji].users.push(r.profile.name);
              if (r.user_id === profile?.id) acc[r.emoji].hasReacted = true;
              return acc;
            }, {});

            const isCurrentSearchMatch =
              searchOpen && searchMatches[currentSearchIndex]?.id === msg.id;

            return (
              <div
                key={msg.id}
                id={`internal-msg-${msg.id}`}
                className={cn(
                  "group relative flex gap-2.5 max-w-[85%] md:max-w-[75%] transition-all duration-300 p-0.5 rounded-2xl",
                  (highlightedMsgId === msg.id || isCurrentSearchMatch) &&
                    "ring-2 ring-amber-500/80 ring-offset-2 bg-amber-500/10",
                  isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                {!isMe && channel.type === "group" && (
                  <Avatar className="h-7 w-7 mt-0.5 shrink-0">
                    <AvatarImage src={msg.sender?.avatar_url || ""} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {initials(senderName || "?")}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="space-y-1 min-w-0">
                  {/* Nome do autor apenas em grupos */}
                  {!isMe && channel.type === "group" && senderName && (
                    <div className="flex items-center gap-1.5 px-1 mb-0.5">
                      <span className="text-[11px] font-semibold text-primary">
                        {senderName}
                      </span>
                    </div>
                  )}

                  {/* Balão de Mensagem */}
                  <div
                    className={cn(
                      "relative rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs break-words",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted/80 text-foreground rounded-tl-none border border-border/50",
                      msg.is_deleted && "opacity-60"
                    )}
                  >
                      {/* Tag de Mensagem Fixada */}
                      {msg.is_pinned && (
                        <div
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-semibold mb-1",
                            isMe ? "text-amber-200" : "text-amber-600 dark:text-amber-400"
                          )}
                        >
                          <Pin className="h-2.5 w-2.5 fill-current" />
                          <span>Fixada</span>
                        </div>
                      )}

                      {/* Citação / Resposta (dentro do balão se houver conteúdo) */}
                      {msg.reply_to?.content && (
                        <div
                          className={cn(
                            "text-[11px] px-2.5 py-1 mb-2 rounded border-l-2 truncate max-w-md text-left",
                            isMe
                              ? "bg-white/15 border-white text-white/90"
                              : "bg-background/80 border-primary text-muted-foreground"
                          )}
                        >
                          {msg.reply_to.sender_name && (
                            <span
                              className={cn(
                                "font-semibold block text-[10px]",
                                isMe ? "text-white" : "text-primary"
                              )}
                            >
                              {msg.reply_to.sender_name}
                            </span>
                          )}
                          <span className="truncate">{msg.reply_to.content}</span>
                        </div>
                      )}

                      {/* Imagem anexada */}
                      {msg.media_type === "image" && msg.media_url && (
                        <div className="mb-2 max-w-sm rounded-lg overflow-hidden bg-black/5 cursor-pointer">
                          <img
                            src={msg.media_url}
                            alt={msg.file_name || "Imagem"}
                            className="w-full max-h-72 object-cover rounded-lg hover:opacity-95 transition-opacity"
                            onClick={() => setPreviewImageUrl(msg.media_url)}
                          />
                        </div>
                      )}

                      {/* Áudio anexado */}
                      {msg.media_type === "audio" && msg.media_url && (
                        <div className="mb-1.5 min-w-[220px]">
                          <audio
                            src={msg.media_url}
                            controls
                            className="w-full h-8 rounded-md"
                          />
                        </div>
                      )}

                      {/* Documento / PDF anexado */}
                      {msg.media_type === "document" && msg.media_url && (
                        <a
                          href={msg.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "flex items-center gap-2.5 p-2 mb-2 rounded-lg transition-colors border",
                            isMe
                              ? "bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/20 text-primary-foreground"
                              : "bg-background border-border hover:bg-muted text-foreground"
                          )}
                        >
                          <FileText className="h-6 w-6 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{msg.file_name || "Documento"}</p>
                            <p className="text-[10px] opacity-75">{formatFileSize(msg.file_size)}</p>
                          </div>
                          <Download className="h-4 w-4 shrink-0 opacity-80" />
                        </a>
                      )}

                      {/* Conteúdo textual */}
                      {msg.content && msg.media_type !== "document" && (
                        <div>{renderFormattedText(msg.content, isMe)}</div>
                      )}

                      {/* Indicador de Mensagem Apagada (idêntico ao dos clientes) */}
                      {msg.is_deleted && (
                        <div
                          className={cn(
                            "mt-1.5 pt-1.5 border-t text-xs flex items-center gap-1.5 italic opacity-80",
                            isMe ? "border-primary-foreground/20" : "border-border"
                          )}
                        >
                          <span className="text-[14px]">🚫</span>
                          Mensagem apagada
                        </div>
                      )}

                      <div
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1.5 text-[9px]",
                          isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}
                      >
                        {msg.is_edited && !msg.is_deleted && <span className="opacity-80 italic">(editada)</span>}
                        <span>{timeStr}</span>
                      </div>
                    </div>

                  {/* Pílulas de Reações (apenas se não estiver apagada) */}
                  {!msg.is_deleted && Object.keys(groupedReactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(groupedReactions).map(([emoji, data]) => (
                        <button
                          key={emoji}
                          onClick={() => onToggleReaction({ messageId: msg.id, emoji })}
                          title={data.users.join(", ")}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-all cursor-pointer",
                            data.hasReacted
                              ? "bg-primary/15 border-primary/40 text-primary font-semibold"
                              : "bg-card border-border/80 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px] font-medium">{data.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Barra Flutuante de Ações ao passar o mouse (apenas se mensagem não estiver apagada) */}
                {!msg.is_deleted && (
                  <div
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3 flex items-center gap-0.5 bg-card border border-border shadow-md rounded-full px-1 py-0.5 z-10",
                      isMe ? "right-2" : "left-8"
                    )}
                  >
                    {/* Reações rápidas */}
                    {QUICK_REACTIONS.slice(0, 4).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onToggleReaction({ messageId: msg.id, emoji })}
                        className="p-1 text-xs hover:scale-125 transition-transform cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}

                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer">
                          <Plus className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="p-0 border-none w-auto shadow-xl">
                        <EmojiPicker
                          onEmojiClick={(data) =>
                            onToggleReaction({ messageId: msg.id, emoji: data.emoji })
                          }
                        />
                      </PopoverContent>
                    </Popover>

                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="p-1 rounded-full text-muted-foreground hover:text-foreground ml-0.5 cursor-pointer"
                      title="Responder"
                    >
                      <Reply className="h-3 w-3" />
                    </button>

                    {/* Menu com Mais Opções: Fixar, Editar, Apagar */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Mais opções"
                        >
                          <MoreVertical className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align={isMe ? "end" : "start"}
                        className="w-44 text-xs"
                      >
                        {/* Fixar / Desfixar (se gestor/admin) */}
                        {isManagerOrAdmin && (
                          <DropdownMenuItem
                            onClick={() =>
                              onTogglePinMessage?.({
                                messageId: msg.id,
                                isPinned: Boolean(msg.is_pinned),
                              })
                            }
                            className="cursor-pointer"
                          >
                            {msg.is_pinned ? (
                              <>
                                <PinOff className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                <span>Desfixar mensagem</span>
                              </>
                            ) : (
                              <>
                                <Pin className="h-3.5 w-3.5 mr-2 text-amber-500" />
                                <span>Fixar no topo</span>
                              </>
                            )}
                          </DropdownMenuItem>
                        )}

                        {/* Editar mensagem (apenas o autor e tipo texto) */}
                        {isMe && msg.media_type === "text" && (
                          <DropdownMenuItem
                            onClick={() => handleStartEdit(msg)}
                            className="cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            <span>Editar mensagem</span>
                          </DropdownMenuItem>
                        )}

                        {/* Apagar mensagem (autor ou gestor/admin) */}
                        {(isMe || isManagerOrAdmin) && (
                          <DropdownMenuItem
                            onClick={() => setMessageToDelete(msg.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            <span>Apagar mensagem</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Caixa de Envio */}
      <div className="p-3 border-t border-border bg-card/60 backdrop-blur-sm relative">
        {/* Dropdown de Sugestão de Menções (@) */}
        {suggestedMembers.length > 0 && mentionQuery !== null && (
          <div className="absolute bottom-full left-4 mb-2 w-72 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-primary">
                <AtSign className="h-3 w-3" />
                <span>Mencionar no chat</span>
              </div>
              <span className="text-[9px] text-muted-foreground font-normal">
                ↑↓ navegar • Enter selecionar
              </span>
            </div>
            <div className="p-1 max-h-52 overflow-y-auto space-y-0.5">
              {suggestedMembers.map((member, index) => {
                const isSelected = index === selectedMentionIndex;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMention(member.name);
                    }}
                    onMouseEnter={() => setSelectedMentionIndex(index)}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    {member.isSpecial ? (
                      <div
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                          isSelected ? "bg-white text-primary" : "bg-primary/10 text-primary"
                        )}
                      >
                        @
                      </div>
                    ) : (
                      <Avatar className="h-6 w-6 shrink-0 border border-border/50">
                        <AvatarImage src={member.avatar_url || ""} />
                        <AvatarFallback
                          className={cn(
                            "text-[9px] font-semibold",
                            isSelected ? "bg-primary-foreground text-primary" : "bg-primary/10 text-primary"
                          )}
                        >
                          {initials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{member.isSpecial ? `@${member.name}` : member.name}</span>
                        {member.isSpecial && (
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1 py-0">
                            Canal
                          </Badge>
                        )}
                      </div>
                      {member.subtitle && (
                        <p
                          className={cn(
                            "text-[10px] truncate capitalize",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          {member.subtitle}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Banner de Resposta */}
        {replyingTo && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-md bg-muted/70 text-xs border-l-2 border-primary">
            <div className="truncate">
              <span className="font-semibold text-primary">
                Respondendo a {replyingTo.sender?.name || "mensagem"}:
              </span>{" "}
              <span className="text-muted-foreground">{replyingTo.content}</span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Banner de Modo Edição */}
        {editingMessage && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-md bg-amber-500/10 text-xs border-l-2 border-amber-500 text-amber-900 dark:text-amber-300 animate-in fade-in slide-in-from-bottom-1 duration-150">
            <div className="flex items-center gap-2 truncate">
              <Pencil className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                Editando mensagem:
              </span>
              <span className="truncate text-muted-foreground">{editingMessage.content}</span>
            </div>
            <button
              onClick={handleCancelEdit}
              className="text-muted-foreground hover:text-foreground p-0.5"
              title="Cancelar edição (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input escondido de Arquivo */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUploadAndSend(file);
          }}
          className="hidden"
        />

        {/* Indicador de Digitando (Typing Indicator) */}
        {typingUsers && typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-1.5 mb-1.5 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
            </div>
            <span className="text-[11px] font-medium text-foreground/85 italic">
              {typingUsers.length === 1
                ? `${typingUsers[0]} está digitando...`
                : typingUsers.length === 2
                ? `${typingUsers[0]} e ${typingUsers[1]} estão digitando...`
                : `${typingUsers[0]} e mais ${typingUsers.length - 1} colegas estão digitando...`}
            </span>
          </div>
        )}

        {/* Se o canal é de avisos e o usuário não é gestor/admin: Modo Somente Leitura */}
        {isReadOnlyAnnouncement ? (
          <div className="flex items-center justify-center gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-900 dark:text-amber-200 text-center">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Canal de Avisos da Matriz:</strong> Somente leitura para colaboradores. Apenas administradores e gestores podem publicar.
            </span>
          </div>
        ) : isRecording ? (
          <div className="flex items-center justify-between bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2 text-xs">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span>Gravando áudio: {formatTimer(recordingSeconds)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={cancelRecording} className="h-7 text-xs">
                Cancelar
              </Button>
              <Button size="sm" onClick={stopAndSendRecording} className="h-7 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Square className="h-3 w-3 mr-1 fill-current" />
                Enviar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 bg-background border border-input rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-primary shadow-2xs">
            {/* Botão de Anexo */}
            <Button
              size="icon"
              variant="ghost"
              disabled={isUploading || !!editingMessage}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
              title="Anexar arquivo ou foto"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>

            {/* Emoji */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                  title="Inserir emoji"
                >
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="p-0 border-none w-auto shadow-xl">
                <EmojiPicker onEmojiClick={handleEmojiClick} autoFocusSearch={false} />
              </PopoverContent>
            </Popover>

            {/* Botão de Menção @ (apenas em canais de grupo) */}
            {channel.type !== "direct" && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleTriggerMention}
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                title="Mencionar colega (@)"
              >
                <AtSign className="h-4 w-4" />
              </Button>
            )}

            <TextareaAutosize
              ref={inputRef}
              placeholder={
                editingMessage
                  ? "Edite a mensagem... (Enter salva, Esc cancela)"
                  : channel.type === "direct"
                  ? `Mensagem para ${channelTitle}... (Cole imagens com Ctrl+V)`
                  : `Mensagem em ${channelTitle}... (digite @ para mencionar, Cole imagens com Ctrl+V)`
              }
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              minRows={1}
              maxRows={4}
              className="flex-1 resize-none bg-transparent text-xs py-1.5 px-1 focus:outline-hidden"
            />

            {/* Se estiver editando mensagem: botão Salvar */}
            {editingMessage ? (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                  title="Cancelar edição (Esc)"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!text.trim() || isSending}
                  className="h-8 w-8 shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                  title="Salvar alterações (Enter)"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : !text.trim() ? (
              /* Gravação de Áudio se o campo de texto estiver vazio */
              <Button
                size="icon"
                variant="ghost"
                onClick={startRecording}
                className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0 rounded-lg"
                title="Gravar áudio para a equipe"
              >
                <Mic className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isSending || isUploading}
                className="h-8 w-8 shrink-0 rounded-lg"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modal de Visualização de Imagem em Tela Cheia */}
      <Dialog open={!!previewImageUrl} onOpenChange={() => setPreviewImageUrl(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-none shadow-none flex items-center justify-center">
          <DialogTitle className="sr-only">Visualizar Imagem</DialogTitle>
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt="Visualização"
              className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain bg-background/90"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação para Apagar Mensagem (idêntico ao dos clientes) */}
      <AlertDialog
        open={Boolean(messageToDelete)}
        onOpenChange={(open) => {
          if (!open) setMessageToDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar Mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente apagar esta mensagem para toda a equipe? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (messageToDelete) {
                  onDeleteMessage?.({ messageId: messageToDelete });
                  setMessageToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Apagar mensagem
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gaveta de Arquivos & Mídias Compartilhadas */}
      <TeamChatMediaDrawer
        channel={channel}
        messages={messages}
        isOpen={mediaDrawerOpen}
        onClose={() => setMediaDrawerOpen(false)}
        onSelectMessage={(msgId) => scrollToMessage(msgId)}
      />
    </div>
  );
}
