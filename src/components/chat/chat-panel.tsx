import React, { useEffect, useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Send, 
  Paperclip, 
  Smile, 
  Phone, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronUp, 
  ChevronDown, 
  PanelRight, 
  Users, 
  Bot, 
  BookOpen, 
  Mic, 
  X, 
  Image as ImageIcon, 
  MessageSquarePlus, 
  LayoutTemplate, 
  FileText, 
  Sparkles, 
  Folder, 
  FolderOpen, 
  Video, 
  Headphones, 
  Loader2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Check 
} from "lucide-react";
import { toast } from "sonner";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import TextareaAutosize from "react-textarea-autosize";
import EmojiPicker from "emoji-picker-react";

import { supabase } from "@/integrations/supabase/client";
import { 
  sendMessageAction, 
  reactToMessageAction, 
  editMessageAction, 
  deleteMessageAction, 
  transcribeAudioAction, 
  fixMessageTextAction, 
  salesCoachAction, 
  salesCoachSuggestAction,
  resolveConversationAction,
  assignConversationAction 
} from "@/lib/api/chat.functions";

import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useWavoip } from "@/hooks/use-wavoip";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { useSlaSettings } from "@/lib/use-sla";
import { calculateConversationSla } from "@/lib/sla";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/common/channel-icon";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { TransferDialog } from "@/components/chat/transfer-dialog";
import { PlaybookSheet } from "@/components/training/playbook-sheet";
import { WhatsappTemplateSender } from "@/components/whatsapp/whatsapp-template-sender";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ContactAvatar } from "@/components/chat/contact-avatar";
import { ConvRow, MessageRow, fetchConversationMessages } from "@/components/chat/conversation-types";

let ffmpegInstance: FFmpeg | null = null;
const getFFmpeg = async () => {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({
      coreURL: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
      wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm"
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  } catch (err) {
    console.warn("Falha ao carregar FFmpeg do unpkg, tentando fallback jsdelivr...", err);
    try {
      await ffmpeg.load({
        coreURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
        wasmURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm"
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (fallbackErr) {
      console.error("Erro ao carregar FFmpeg de ambos CDNs:", fallbackErr);
      throw new Error("Não foi possível carregar o módulo de áudio. Verifique a conexão com a internet.");
    }
  }
};

interface ChatPanelProps {
  conv: ConvRow;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  onAssigned?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export function ChatPanel({ 
  conv,
  showSidebar,
  onToggleSidebar,
  onAssigned,
  onBack,
  onClose,
}: ChatPanelProps) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const { startCall, instances } = useWavoip();
  const { selectedUnitId } = useUnit();
  const [text, setText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ file: File | null; base64: string; type: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [isCoaching, setIsCoaching] = useState(false);
  const [isPlaybookSheetOpen, setIsPlaybookSheetOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<MessageRow | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const isInitialLoadRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);

  // Reset paginação e rolagem ao trocar de conversa
  useEffect(() => {
    setHasMoreOlder(true);
    setIsLoadingOlder(false);
    isInitialLoadRef.current = true;
    lastMessageIdRef.current = null;
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setNewMessagesBelow(0);
  }, [conv.id]);

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-chat", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("ai_settings")
        .eq("id", activeCompanyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const aiSettings = companySettings?.ai_settings as any;
  const hasAiConfigured = aiSettings && (
    (aiSettings.engines?.chatbot && aiSettings.engines.chatbot !== "none") ||
    (aiSettings.engines?.text && aiSettings.engines.text !== "none") ||
    aiSettings.keys?.openai || aiSettings.keys?.openrouter || aiSettings.keys?.groq
  );

  const showCoach = hasAiConfigured && 
    (aiSettings?.sales_coach_active_instances?.includes(conv.whatsapp_instance_id!) || 
    !aiSettings?.sales_coach_active_instances?.length);

  useEffect(() => {
    const handleInsert = (e: any) => {
      if (e.detail) {
        setText(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + e.detail);
        setTimeout(() => {
          document.getElementById("chat-input")?.focus();
        }, 100);
      }
    };
    window.addEventListener("insert-chat-text", handleInsert);
    return () => window.removeEventListener("insert-chat-text", handleInsert);
  }, []);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [quickMsgIndex, setQuickMsgIndex] = useState(0);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [resolveObservation, setResolveObservation] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Consulta otimizada: busca apenas as 15 mensagens mais recentes inicialmente (com cache rápido)
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const list = await fetchConversationMessages(conv.id);
      if (list.length < 15) {
        setHasMoreOlder(false);
      }
      return list;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const { slaSettings } = useSlaSettings();
  const lastExternalMsg = useMemo(() => {
    if (!messages || messages.length === 0) {
      return conv.last_message?.find((m) => !m.is_internal) || conv.last_message?.[0] || null;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].is_internal) {
        return messages[i];
      }
    }
    return null;
  }, [messages, conv.last_message]);

  const slaInfo = useMemo(() => {
    return calculateConversationSla(conv, slaSettings, lastExternalMsg);
  }, [conv, slaSettings, lastExternalMsg]);

  // Função para buscar mensagens mais antigas (paginação infinita para cima)
  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasMoreOlder || !messages || messages.length === 0) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setIsLoadingOlder(true);
    const container = scrollRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;
    const oldScrollTop = container ? container.scrollTop : 0;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_type, sender_id, participant_jid, is_internal, content, media_type, media_url, created_at, quoted_content, quoted_message_id, is_edited, is_deleted, reactions, remote_msg_id, transcription, profiles(name), metadata")
        .eq("conversation_id", conv.id)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) throw error;

      if (!data || data.length === 0) {
        setHasMoreOlder(false);
        return;
      }

      if (data.length < 15) {
        setHasMoreOlder(false);
      }

      const olderMessages = (data as MessageRow[]).reverse();

      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return olderMessages;
        const existingIds = new Set(old.map(m => m.id));
        const filteredNew = olderMessages.filter(m => !existingIds.has(m.id));
        return [...filteredNew, ...old];
      });

      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
        }
      });
    } catch (err) {
      console.error("Erro ao carregar mensagens anteriores:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop <= 40 && hasMoreOlder && !isLoadingOlder && !isInitialLoadRef.current) {
      loadOlderMessages();
    }

    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    const isNear = distanceFromBottom <= 150;
    isNearBottomRef.current = isNear;

    if (isNear) {
      setShowScrollBottomBtn(false);
      setNewMessagesBelow(0);
    } else if (distanceFromBottom > 200) {
      setShowScrollBottomBtn(true);
    }
  };

  const scrollToBottomSmooth = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    setShowScrollBottomBtn(false);
    setNewMessagesBelow(0);
    isNearBottomRef.current = true;
  };

  const { data: quickMessageFolders } = useQuery({
    queryKey: ["quick-message-folders", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_message_folders")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: quickMessages } = useQuery({
    queryKey: ["quick-messages", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_messages")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("shortcut", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Controle inteligente de rolagem ao carregar ou receber mensagens
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (!messages || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];

    // Carga inicial da conversa: rola instantaneamente para o final
    if (isInitialLoadRef.current) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      lastMessageIdRef.current = lastMsg?.id || null;
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
      setNewMessagesBelow(0);

      timeout = setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        isInitialLoadRef.current = false;
      }, 150);

      return () => {
        if (timeout) clearTimeout(timeout);
      };
    }

    // Se novas mensagens chegarem após o carregamento inicial
    if (lastMsg && lastMsg.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMsg.id;

      const isFromMe = lastMsg.sender_type === "agent";

      if (isNearBottomRef.current || isFromMe) {
        // Se o atendente está próximo ao final ou foi quem enviou, acompanha descendo suavemente
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }
        });
        setShowScrollBottomBtn(false);
        setNewMessagesBelow(0);
      } else {
        // Se o atendente rolou para cima lendo o histórico, não sequestra a tela e mostra aviso com contador
        setShowScrollBottomBtn(true);
        setNewMessagesBelow((prev) => prev + 1);
      }
    }
  }, [messages]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (conv.id && conv.unread_count && conv.unread_count > 0) {
      supabase.rpc("reset_unread_count", { conv_id: conv.id }).then(() => {
        qc.setQueriesData({ queryKey: ["conversations"] }, (oldData: any) => {
          if (!oldData || !oldData.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => {
              if (!page || !page.rows) return page;
              return {
                ...page,
                rows: page.rows.map((c: ConvRow) => c.id === conv.id ? { ...c, unread_count: 0 } : c)
              };
            })
          };
        });

        const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith("120363") || (conv.contact.phone.includes("-") && conv.contact.phone.length > 18)));
        const tabKey = isGroup ? "groups" : (conv.status || "active");
        qc.setQueriesData({ queryKey: ["unread-counts"] }, (oldData: any) => {
          if (!oldData) return oldData;
          const newData = { ...oldData };
          if (newData[tabKey]) {
            newData[tabKey] = {
              total: newData[tabKey].total,
              unread: Math.max(0, newData[tabKey].unread - conv.unread_count!)
            };
          }
          return newData;
        });
      });
    }
  }, [conv.id, conv.unread_count, conv.contact?.phone, conv.status, qc]);

  const send = useMutation({
    mutationFn: async (payload: { content: string; isInternal?: boolean; mediaType?: "text"|"image"|"video"|"audio"|"document"|"template"; mediaBase64?: string; quotedMessageId?: string; quotedParticipant?: string; quotedInternalId?: string; quotedContent?: string }) => {
      return await sendMessageAction({ data: { conversationId: conv.id, text: payload.content, mediaType: (payload.mediaType === "template" ? "text" : payload.mediaType) as any, mediaBase64: payload.mediaBase64, quotedMessageId: payload.quotedMessageId, quotedParticipant: payload.quotedParticipant, quotedInternalId: payload.quotedInternalId, quotedContent: payload.quotedContent, isInternal: payload.isInternal } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      const optimisticMsg: MessageRow = {
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_type: "agent",
        is_internal: payload.isInternal,
        content: payload.content,
        media_type: (payload.mediaType === "template" ? "text" : (payload.mediaType || "text")) as any,
        media_url: payload.mediaBase64 || null,
        created_at: new Date().toISOString(),
        isOptimistic: true,
        quoted_message_id: payload.quotedInternalId || null,
        quoted_content: payload.quotedContent || null,
        profiles: profile?.name ? { name: profile.name } : undefined
      };

      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => [...(old || []), optimisticMsg]);
      
      if (!payload.isInternal) {
        qc.setQueriesData({ queryKey: ["conversations"] }, (oldData: any) => {
          if (!oldData || !oldData.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => {
              if (!page || !page.rows) return page;
              return {
                ...page,
                rows: page.rows.map((c: ConvRow) => c.id === conv.id ? {
                  ...c,
                  last_message: [{ sender_type: "agent", created_at: optimisticMsg.created_at, is_internal: false }]
                } : c)
              };
            })
          };
        });
      }

      setText("");
      setSelectedFile(null);
      setReplyingTo(null);
      setIsInternalNote(false);
      
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
      setNewMessagesBelow(0);
      
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);

      return { previousMessages, content: payload.content };
    },
    onSuccess: (result) => {
      if (result?.message) {
        qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
          if (!old) return old;
          return old.map(m =>
            m.isOptimistic && (m.content === result.message.content || m.quoted_message_id === result.message.quoted_message_id)
              ? { ...result.message, isOptimistic: false }
              : m
          );
        });
      }
    },
    onError: (e, variables, context) => {
      if (context?.previousMessages) {
        qc.setQueryData(["messages", conv.id], context.previousMessages);
      }
      setText(context?.content || "");
      if (e.message.includes("WINDOW_24H_EXPIRED")) {
        setTemplateDialogOpen(true);
      } else {
        toast.error("Erro ao enviar", { description: (e as Error).message });
      }
    },
    onSettled: () => {
      // Optimistic cache is already updated instantly; Realtime will seamlessly sync status
    },
  });

  const deleteMsg = useMutation({
    mutationFn: async (messageId: string) => {
      await deleteMessageAction({ data: { messageId } });
    },
    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === messageId ? { ...m, is_deleted: true } : m);
      });
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao apagar mensagem", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const editMsg = useMutation({
    mutationFn: async (payload: { messageId: string; content: string }) => {
      await editMessageAction({ data: { conversationId: conv.id, messageId: payload.messageId, newContent: payload.content } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === payload.messageId ? { ...m, content: payload.content, is_edited: true } : m);
      });
      setText("");
      setEditingMessage(null);
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao editar", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const transcribeAudio = useMutation({
    mutationFn: async (messageId: string) => {
      return transcribeAudioAction({ data: { messageId } });
    },
    onSuccess: (data, variables) => {
      toast.success("Transcrição concluída com sucesso!");
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === variables ? { ...m, transcription: data.text } : m);
      });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e) => toast.error("Erro na transcrição", { description: (e as Error).message })
  });

  const fixTextMutation = useMutation({
    mutationFn: async (textToFix: string) => {
      return fixMessageTextAction({ data: { conversationId: conv.id, text: textToFix } });
    },
    onSuccess: (data) => {
      setText(data.text);
      toast.success("Texto corrigido!");
    },
    onError: (e) => {
      toast.error("Erro ao corrigir texto", { description: (e as Error).message });
    }
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      await reactToMessageAction({ data: { conversationId: conv.id, messageId, emoji } });
    },
    onMutate: async ({ messageId, emoji }) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === messageId ? { ...m, reactions: emoji ? { [emoji]: 1 } : {} } : m);
      });
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao reagir", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("audio/")) type = "audio";
    
    if (type === "image") {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 800;
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL("image/jpeg", 0.8);
          setSelectedFile({ file, base64, type });
        }
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setSelectedFile({ file, base64, type });
      };
      reader.readAsDataURL(file);
    }
    
    e.target.value = "";
  };

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
        setIsRecording(false);
        const toastId = toast.loading("Processando áudio...");
        try {
          const webmBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          
          const ffmpeg = await getFFmpeg();
          await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));
          
          const isInstagram = conv.channel === "instagram";
          const outputName = isInstagram ? "output.mp4" : "output.ogg";
          const mimeType = isInstagram ? "audio/mp4" : "audio/ogg";

          if (isInstagram) {
            await ffmpeg.exec(["-i", "input.webm", "-c:a", "aac", "-b:a", "128k", outputName]);
          } else {
            await ffmpeg.exec(["-i", "input.webm", "-c:a", "libopus", outputName]);
          }
          
          const data = await ffmpeg.readFile(outputName);
          
          const audioBlob = new Blob([data], { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            send.mutate({ content: "", isInternal: isInternalNote, mediaType: "audio", mediaBase64: base64data });
            toast.dismiss(toastId);
          };
          reader.readAsDataURL(audioBlob);
        } catch (error) {
          console.error("Erro na conversão de áudio:", error);
          toast.dismiss(toastId);
          toast.error("Erro ao processar áudio", { description: String(error) });
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Erro ao acessar microfone", { description: String(err) });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const insertQuickMessage = (qm: { content: string; media_url?: string | null; media_type?: string | null }) => {
    const now = new Date();
    let t = qm.content || "";
    t = t.replace(/\{\{atendente\}\}/g, profile?.name || "Atendente");
    t = t.replace(/\{\{cliente\}\}/g, conv.contact?.name && conv.contact.name !== "Desconhecido" ? conv.contact.name : "Cliente");
    t = t.replace(/\{\{saudacao\}\}/g, getGreeting());
    t = t.replace(/\{\{telefone\}\}/g, conv.contact?.phone || "");
    t = t.replace(/\{\{protocolo\}\}/g, conv.id.substring(0, 8).toUpperCase());
    t = t.replace(/\{\{data\}\}/g, now.toLocaleDateString("pt-BR"));
    t = t.replace(/\{\{hora\}\}/g, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

    if (conv.unit?.custom_variables && typeof conv.unit.custom_variables === "object") {
      Object.entries(conv.unit.custom_variables).forEach(([key, val]) => {
        if (typeof key === "string" && val) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          t = t.replace(regex, String(val));
        }
      });
    }

    setText(t);
    
    if (qm.media_url && qm.media_type) {
      setSelectedFile({
        file: null,
        base64: qm.media_url,
        type: qm.media_type as any
      });
    }

    document.getElementById("chat-input")?.focus();
  };

  const handleSend = () => {
    if (editingMessage) {
      let origContent = editingMessage.content || "";
      const sigMatch = origContent.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
      if (sigMatch) origContent = sigMatch[2];
      if (text.trim() && text.trim() !== origContent.trim()) {
        editMsg.mutate({ messageId: editingMessage.id, content: text.trim() });
      } else {
        setEditingMessage(null);
        setText("");
      }
      return;
    }

    const quotedPayload = replyingTo ? {
      quotedMessageId: replyingTo.remote_msg_id || undefined,
      quotedParticipant: replyingTo.participant_jid || undefined,
      quotedInternalId: replyingTo.id,
      quotedContent: replyingTo.content || (replyingTo.media_type !== "text" ? `[${replyingTo.media_type}]` : "Anexo"),
    } : {};

    if (selectedFile) {
      send.mutate({ content: text.trim(), isInternal: isInternalNote, mediaType: selectedFile.type as any, mediaBase64: selectedFile.base64, ...quotedPayload });
    } else if (text.trim()) {
      send.mutate({ content: text.trim(), isInternal: isInternalNote, ...quotedPayload });
    }
  };

  const startEdit = (msg: MessageRow) => {
    setEditingMessage(msg);
    let textToEdit = msg.content || "";
    const hasSignature = textToEdit.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      textToEdit = hasSignature[2];
    }
    setText(textToEdit);
    setReplyingTo(null);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const { data: resolutionReasons } = useQuery({
    queryKey: ["resolution-reasons", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resolution_reasons" as any)
        .select("id, label, order")
        .eq("company_id", activeCompanyId!)
        .eq("active", true)
        .order("order", { ascending: true });
      if (error && error.code !== "42P01") throw error;
      return (data || []) as { id: string; label: string; order: number }[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ reasonId, observation }: { reasonId: string; observation: string }) => {
      await resolveConversationAction({ 
        data: { 
          conversationId: conv.id, 
          reasonId: reasonId || null, 
          observation: observation.trim() || null 
        } 
      });
    },
    onSuccess: () => {
      toast.success("Atendimento encerrado");
      setResolveDialogOpen(false);
      setSelectedReasonId("");
      setResolveObservation("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-conversations"] });
      qc.invalidateQueries({ queryKey: ["unread-counts"] });
      onClose?.();
    },
    onError: (e) => {
      toast.error("Erro ao encerrar atendimento", { description: (e as Error).message });
    }
  });

  const assignConv = useMutation({
    mutationFn: async () => {
      await assignConversationAction({ data: { conversationId: conv.id } });
      await supabase.from("conversations").update({ ai_active: false }).eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento puxado para você.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onAssigned?.();
    },
    onError: (e) => {
      toast.error("Erro ao puxar atendimento", { description: (e as Error).message });
    }
  });

  const toggleAi = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("conversations").update({ ai_active: active }).eq("id", conv.id);
      if (error) throw error;
    },
    onMutate: async (active) => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      qc.setQueriesData({ queryKey: ["conversations"] }, (oldData: any) => {
        if (!oldData) return oldData;
        if (oldData.pages) {
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => {
              if (!page || !page.rows) return page;
              return {
                ...page,
                rows: page.rows.map((r: any) => (r.id === conv.id ? { ...r, ai_active: active } : r)),
              };
            }),
          };
        }
        return oldData;
      });
      qc.setQueryData(["direct-conversation", conv.id], (old: any) => (old ? { ...old, ai_active: active } : old));
    },
    onSuccess: (_, active) => {
      toast.success(active ? "IA ativada neste atendimento" : "IA pausada neste atendimento");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["direct-conversation", conv.id] });
    },
    onError: (e: any) => {
      toast.error("Erro ao alterar status da IA", { description: e.message });
    }
  });

  const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith("120363") || (conv.contact.phone.includes("-") && conv.contact.phone.length > 18)));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  // Detecção da Janela de 24 horas da Meta WhatsApp
  const lastContactMessage = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_type === "contact") return messages[i];
    }
    return null;
  }, [messages]);

  const is24hExpired = useMemo(() => {
    if (conv.channel !== "whatsapp" || isGroup) return false;
    if (!lastContactMessage) return false;
    const lastTime = new Date(lastContactMessage.created_at).getTime();
    const diffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
    return diffHours >= 24;
  }, [conv.channel, isGroup, lastContactMessage]);

  const quickMsgItems = useMemo(() => {
    if (!text.startsWith("/") || !quickMessages) return { items: [], focusableCount: 0 };
    const search = text === "/" ? "" : text.toLowerCase().substring(1);
    const isSearch = search.length > 0;

    let items: any[] = [];
    let focusCount = 0;

    if (isSearch) {
      const filtered = quickMessages.filter(qm => 
        qm.shortcut.toLowerCase().includes(search) || 
        (qm.name && qm.name.toLowerCase().includes(search))
      ).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
      
      items = filtered.map(qm => ({ type: "message", id: qm.id, qm, index: focusCount++ }));
    } else {
      const rootMsgs = quickMessages.filter(qm => !qm.folder_id).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
      if (rootMsgs.length > 0) {
        items.push({ type: "header", id: "root", name: "Raiz", folderId: null, isExpanded: true, count: rootMsgs.length });
        rootMsgs.forEach(qm => items.push({ type: "message", id: qm.id, qm, index: focusCount++ }));
      }

      const sortedFolders = [...(quickMessageFolders || [])].sort((a, b) => a.name.localeCompare(b.name));
      sortedFolders.forEach(folder => {
        const folderMsgs = quickMessages.filter(qm => qm.folder_id === folder.id).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
        if (folderMsgs.length > 0) {
          const isExpanded = expandedFolders.has(folder.id);
          items.push({ type: "header", id: folder.id, name: folder.name, folderId: folder.id, isExpanded, count: folderMsgs.length });
          if (isExpanded) {
            folderMsgs.forEach(qm => items.push({ type: "message", id: qm.id, qm, index: focusCount++ }));
          }
        }
      });
    }

    return { items, focusableCount: focusCount };
  }, [text, quickMessages, quickMessageFolders, expandedFolders]);

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card px-3 md:px-5 py-3 shadow-sm z-10 min-w-0 w-full">
          <div 
            className="flex items-center gap-2 md:gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-1 -ml-1 transition-colors"
            onClick={onToggleSidebar}
          >
            {onBack && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => { e.stopPropagation(); onBack(); }}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="relative shrink-0">
              <ContactAvatar
                url={conv.contact?.avatar_url}
                name={contactName}
                isGroup={!!isGroup}
                className="h-10 w-10 ring-2 ring-primary/10 ring-offset-2"
              />
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                {contactName}
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-0.5">
                <ChannelIcon channel={conv.channel} className="h-3.5 w-3.5" />
                {conv.department?.name && <span>{conv.department.name}</span>}

                {slaInfo.isWaiting && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] h-5 px-1.5 font-semibold transition-all flex items-center gap-1",
                      slaInfo.status === "breached" && "bg-destructive/15 text-destructive border-destructive/30 animate-pulse font-bold",
                      slaInfo.status === "warning" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                      slaInfo.status === "ok" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    )}
                    title={slaInfo.tooltipText}
                  >
                    {slaInfo.status === "breached" ? (
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <Clock className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span>SLA: {slaInfo.badgeLabel}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            {!isGroup && (
              <div 
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-all select-none mr-0.5",
                  conv.ai_active 
                    ? "bg-primary/10 border-primary/20 text-primary shadow-xs" 
                    : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted/60"
                )}
                title={conv.ai_active ? "A IA está respondendo neste ticket" : "IA pausada neste ticket"}
              >
                <div className={cn("p-1 rounded-md shrink-0", conv.ai_active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                  <Bot className={cn("h-3.5 w-3.5", conv.ai_active && "text-primary animate-pulse")} />
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-[11px] font-semibold leading-tight">
                    {conv.ai_active ? "IA Ativa" : "IA Pausada"}
                  </span>
                  <span className="text-[9px] text-muted-foreground leading-tight">
                    {conv.ai_active ? "Respondendo" : "Pausada"}
                  </span>
                </div>
                <Switch 
                  checked={conv.ai_active || false} 
                  onCheckedChange={(v) => toggleAi.mutate(v)} 
                  disabled={toggleAi.isPending}
                  className="scale-75 origin-right cursor-pointer"
                />
              </div>
            )}
            {conv.status === "active" && !isGroup && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-10 w-10 text-muted-foreground hover:bg-muted/50 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (conv.contact?.phone) {
                      const name = conv.contact.name !== "Desconhecido" ? conv.contact.name : undefined;
                      const currentInstance = instances?.find((i: any) => i.id === conv.whatsapp_instance_id);
                      startCall(conv.contact.phone, name, currentInstance?.wavoip_token);
                    }
                  }}
                  title="Ligar para contato"
                >
                  <Phone className="h-5 w-5" />
                </Button>
                <TransferDialog conv={conv} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:bg-muted/50 rounded-full"
                  onClick={(e) => { e.stopPropagation(); setResolveDialogOpen(true); }}
                  title="Encerrar Atendimento"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </Button>

                {/* Resolve Dialog */}
                <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        Encerrar Atendimento
                      </DialogTitle>
                      <DialogDescription>
                        Informe o motivo do encerramento para registrar no histórico do contato.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="resolve-reason">
                          Motivo do Encerramento <span className="text-destructive">*</span>
                        </Label>
                        {(!resolutionReasons || resolutionReasons.length === 0) ? (
                          <div className="text-sm text-muted-foreground border border-dashed rounded-md p-3 text-center">
                            Nenhum motivo cadastrado. Configure os motivos em <strong>Configurações</strong>.
                          </div>
                        ) : (
                          <Select value={selectedReasonId} onValueChange={setSelectedReasonId}>
                            <SelectTrigger id="resolve-reason">
                              <SelectValue placeholder="Selecione um motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                              {resolutionReasons.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="resolve-observation">
                          Observação <span className="text-xs text-muted-foreground">(opcional)</span>
                        </Label>
                        <Textarea
                          id="resolve-observation"
                          placeholder="Adicione uma observação sobre este atendimento..."
                          value={resolveObservation}
                          onChange={(e) => setResolveObservation(e.target.value)}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                    </div>

                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setResolveDialogOpen(false);
                          setSelectedReasonId("");
                          setResolveObservation("");
                        }}
                        disabled={resolve.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => resolve.mutate({ reasonId: selectedReasonId, observation: resolveObservation })}
                        disabled={!selectedReasonId || resolve.isPending || (!resolutionReasons || resolutionReasons.length === 0)}
                      >
                        {resolve.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Confirmar Encerramento
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            <button 
              className={cn("rounded-md p-2 text-muted-foreground hover:bg-accent transition-colors ml-1", showSidebar && "bg-accent text-foreground")}
              onClick={onToggleSidebar}
              title="Informações do Contato"
            >
              <PanelRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Messages History */}
        {loadingMessages && (!messages || messages.length === 0) ? (
          <div className="flex-1 space-y-4 px-6 py-6 overflow-hidden animate-pulse bg-muted/20">
            <div className="flex items-start gap-2.5 max-w-[65%]">
              <div className="w-8 h-8 rounded-full bg-muted/80 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-20 bg-muted/60 rounded" />
                <div className="h-12 bg-muted/80 rounded-2xl rounded-tl-none p-3" />
              </div>
            </div>
            <div className="flex items-end justify-end">
              <div className="max-w-[65%] space-y-1.5 flex flex-col items-end">
                <div className="h-10 w-44 bg-primary/20 rounded-2xl rounded-br-none" />
              </div>
            </div>
            <div className="flex items-start gap-2.5 max-w-[55%]">
              <div className="w-8 h-8 rounded-full bg-muted/80 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-10 bg-muted/80 rounded-2xl rounded-tl-none" />
              </div>
            </div>
            <div className="flex items-end justify-end">
              <div className="max-w-[65%] space-y-1.5 flex flex-col items-end">
                <div className="h-14 w-60 bg-primary/20 rounded-2xl rounded-br-none" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4"
            >
              {hasMoreOlder && (
                <div className="flex justify-center py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground h-7 gap-1.5 bg-background/50 border border-border/40 shadow-xs"
                    onClick={loadOlderMessages}
                    disabled={isLoadingOlder}
                  >
                    {isLoadingOlder ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Carregando mensagens anteriores...
                      </>
                    ) : (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        Carregar mensagens anteriores
                      </>
                    )}
                  </Button>
                </div>
              )}

              {messages?.map((m) => (
                <MessageBubble 
                  key={m.id} 
                  m={m} 
                  isGroup={isGroup}
                  onReact={(emoji) => {
                    const isAlreadyActive = m.reactions && Boolean(m.reactions[emoji]);
                    react.mutate({ messageId: m.id, emoji: isAlreadyActive ? "" : emoji });
                  }} 
                  onReply={(msg) => { setReplyingTo(msg); document.getElementById("chat-input")?.focus(); }}
                  onEdit={startEdit}
                  onDelete={(msg) => deleteMsg.mutate(msg.id)}
                  onTranscribe={(id) => transcribeAudio.mutate(id)}
                  isTranscribingId={transcribeAudio.isPending ? transcribeAudio.variables : null}
                />
              ))}
            </div>

            {/* Botão flutuante para rolar para as mensagens mais recentes */}
            {showScrollBottomBtn && (
              <div className="absolute bottom-4 right-6 z-20 animate-in fade-in zoom-in-95 duration-200">
                <Button
                  type="button"
                  variant={newMessagesBelow > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={scrollToBottomSmooth}
                  className={cn(
                    "shadow-lg border gap-1.5 transition-all cursor-pointer",
                    newMessagesBelow > 0
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3.5 py-1.5 h-8 font-medium border-primary/20 shadow-primary/20"
                      : "bg-background/90 hover:bg-background text-muted-foreground hover:text-foreground rounded-full h-8 w-8 p-0 backdrop-blur-sm border-border/80"
                  )}
                  title="Rolar para as mensagens mais recentes"
                >
                  <ChevronDown className="h-4 w-4" />
                  {newMessagesBelow > 0 && (
                    <span className="text-xs">
                      {newMessagesBelow === 1 ? "Nova mensagem" : `${newMessagesBelow} novas`}
                    </span>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Input / Composer */}
        <div className="border-t border-border bg-card p-3 flex flex-col gap-2 relative">
          {(conv.status === "waiting" || (conv.status === "active" && (!conv.assigned_agent_id || conv.assigned_agent_id !== profile?.id || (conv.ai_active && !conv.assigned_agent_id)))) && !isGroup && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card gap-2">
              {(!conv.assigned_agent_id || conv.assigned_agent_id === profile?.id || profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager") ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground text-center px-4">
                    {!conv.assigned_agent_id
                      ? (conv.status === "waiting" 
                          ? "Esta conversa está na fila e aguardando um agente." 
                          : "Esta conversa está em andamento sem atendente atribuído.")
                      : conv.assigned_agent_id === profile?.id 
                        ? "Esta conversa foi transferida para você." 
                        : conv.status === "active"
                          ? `Esta conversa está sendo atendida por ${conv.ai_active ? `🤖 ${conv.ai_agent?.name || "IA"}` : conv.assigned_agent?.name || "outro agente"}.`
                          : `Esta conversa foi transferida para ${conv.assigned_agent?.name || "outro agente"}.`}
                  </p>
                  <Button onClick={() => assignConv.mutate()} disabled={assignConv.isPending}>
                    {assignConv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {!conv.assigned_agent_id ? "Atender Cliente" : (conv.assigned_agent_id === profile?.id ? "Aceitar Transferência" : "Assumir Conversa")}
                  </Button>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  {conv.status === "active" 
                    ? `Em atendimento por ${conv.ai_active ? `🤖 ${conv.ai_agent?.name || "IA"}` : conv.assigned_agent?.name || "outro agente"}.` 
                    : `Aguardando aceite de ${conv.assigned_agent?.name || "outro agente"}.`}
                </p>
              )}
            </div>
          )}

          {/* Indicador Proativo da Janela de 24h Meta */}
          {is24hExpired && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-lg text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Janela de 24h da Meta expirada. Envie um Template oficial para retomar.</span>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[11px] px-2 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                onClick={() => setTemplateDialogOpen(true)}
              >
                Modelos
              </Button>
            </div>
          )}

          {selectedFile && (
            <div className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8">
              <button 
                onClick={() => setSelectedFile(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              {selectedFile.type === "image" ? (
                <img src={selectedFile.base64} alt="preview" className="h-12 w-12 object-cover rounded-md" />
              ) : (
                <div className="h-12 w-12 bg-muted rounded-md flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-xs truncate max-w-[150px]">
                {selectedFile.file?.name || "Anexo"}
              </div>
            </div>
          )}
          
          {replyingTo && (
            <div className="flex items-center gap-3 p-2 border-l-4 border-l-primary rounded-md bg-muted/30 relative pr-8 text-sm">
              <button 
                onClick={() => setReplyingTo(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block mb-0.5 text-[10px] uppercase opacity-70">Respondendo a</span>
                <span className="line-clamp-2 opacity-90 text-xs">{replyingTo.content || `[${replyingTo.media_type}]`}</span>
              </div>
            </div>
          )}

          {editingMessage && (
            <div className="flex items-center gap-3 p-2 border-l-4 border-l-amber-500 rounded-md bg-amber-500/10 relative pr-8 text-sm">
              <button 
                onClick={() => { setEditingMessage(null); setText(""); }} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block mb-0.5 text-[10px] uppercase text-amber-600 opacity-90">Editando mensagem</span>
                <span className="line-clamp-2 opacity-90 text-xs">{editingMessage.content?.replace(/^\*(.+?)\*:\s*/, "")}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {!isRecording ? (
              <>
                <div className={cn(
                  "flex-1 flex items-end bg-muted/50 rounded-3xl border border-transparent shadow-sm px-1 py-1 focus-within:border-border transition-colors",
                  isInternalNote && "bg-amber-100/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
                )}>
                  
                  {/* Left Side: Emoji */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-full p-2.5 text-muted-foreground hover:text-foreground mb-0.5 shrink-0 transition-colors" title="Emoji">
                        <Smile className="h-6 w-6" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="p-0 border-none w-auto shadow-xl" sideOffset={10}>
                      <EmojiPicker onEmojiClick={(e) => setText(prev => prev + e.emoji)} />
                    </PopoverContent>
                  </Popover>

                  {/* Left Side: Sales Coach */}
                  {showCoach && (
                    <button 
                      className="rounded-full p-2.5 text-amber-500 hover:text-amber-600 mb-0.5 shrink-0 transition-colors bg-amber-500/10 hover:bg-amber-500/20" 
                      title="Sales Coach (Analisar com IA)"
                      disabled={isCoaching}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isCoaching) return;
                        setIsCoaching(true);
                        try {
                          toast.loading("Sales Coach analisando a conversa...", { id: "coach" });
                          await salesCoachAction({ data: { conversationId: conv.id } });
                          const res = await salesCoachSuggestAction({ data: { conversationId: conv.id } });
                          if (res?.success && res.text) {
                            await send.mutateAsync({ 
                              content: `🤖 **Guia Tático do Coach**\n\n${res.text}`,
                              isInternal: true
                            });
                            toast.success("Guia Tático adicionado às notas internas!", { id: "coach" });
                          } else {
                            toast.dismiss("coach");
                          }
                        } catch (err: any) {
                          toast.error(err.message || "Falha ao gerar análise", { id: "coach" });
                        } finally {
                          setIsCoaching(false);
                        }
                      }}
                    >
                      {isCoaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
                    </button>
                  )}

                  {/* Left Side: Playbook */}
                  <button 
                    type="button"
                    className="rounded-full p-2.5 text-emerald-600 hover:text-emerald-700 mb-0.5 shrink-0 transition-colors bg-emerald-500/10 hover:bg-emerald-500/20" 
                    title="Playbook Comercial (Procedimentos e Scripts)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaybookSheetOpen(true);
                    }}
                  >
                    <BookOpen className="h-5 w-5" />
                  </button>

                  <PlaybookSheet
                    isOpen={isPlaybookSheetOpen}
                    onClose={() => setIsPlaybookSheetOpen(false)}
                    companyId={activeCompanyId || ""}
                    onInsertText={(content) => {
                      setText((prev) => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + content);
                      setTimeout(() => document.getElementById("chat-input")?.focus(), 100);
                    }}
                  />

                  {/* Text Input */}
                  <TextareaAutosize
                    id="chat-input"
                    spellCheck={true}
                    autoCorrect="on"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setQuickMsgIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (quickMsgItems.focusableCount > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setQuickMsgIndex(prev => Math.min(prev + 1, quickMsgItems.focusableCount - 1));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setQuickMsgIndex(prev => Math.max(prev - 1, 0));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const selectedItem = quickMsgItems.items.find(i => i.type === "message" && i.index === quickMsgIndex);
                          if (selectedItem) insertQuickMessage(selectedItem.qm);
                          setQuickMsgIndex(0);
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Mensagem"
                    minRows={1}
                    maxRows={6}
                    className={cn(
                      "flex-1 w-full bg-transparent px-1 py-2.5 pb-2.5 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none resize-none leading-relaxed",
                      isInternalNote && "placeholder:text-amber-700/50 dark:placeholder:text-amber-400/50"
                    )}
                  />

                  {/* Right Side: Attach Menu */}
                  <input type="file" id="file-upload" hidden onChange={handleFileChange} />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-full p-2.5 text-muted-foreground hover:text-foreground mb-0.5 shrink-0 transition-colors" title="Anexos e Ações">
                        <Paperclip className="h-5 w-5 -rotate-45" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" sideOffset={16}>
                      <DropdownMenuItem asChild>
                        <label htmlFor="file-upload" className="cursor-pointer flex items-center w-full">
                          <ImageIcon className="mr-2 h-4 w-4 text-blue-500" />
                          Galeria / Arquivo
                        </label>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />

                      <DropdownMenuItem onClick={() => setText(prev => prev.startsWith("/") ? prev : "/" + prev)}>
                        <MessageSquarePlus className="mr-2 h-4 w-4 text-violet-500" />
                        Mensagens Rápidas
                      </DropdownMenuItem>
                      
                      {conv.channel === "whatsapp" && (
                        <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
                          <LayoutTemplate className="mr-2 h-4 w-4 text-emerald-500" />
                          Enviar Template
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem onClick={() => setIsInternalNote(!isInternalNote)}>
                        <FileText className="mr-2 h-4 w-4 text-amber-500" />
                        {isInternalNote ? "Desativar Nota Interna" : "Nota Interna"}
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => fixTextMutation.mutate(text)}
                        disabled={!text.trim()}
                      >
                        <Sparkles className="mr-2 h-4 w-4 text-sky-500" />
                        Corrigir texto com IA
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Quick Messages Popover */}
                  <Popover open={quickMsgItems.items.length > 0} onOpenChange={() => {}}>
                    <PopoverTrigger className="sr-only" />
                    <PopoverContent 
                      side="top" 
                      align="start" 
                      className="w-80 p-0 shadow-lg border-border"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onCloseAutoFocus={(e) => {
                        e.preventDefault();
                        document.getElementById("chat-input")?.focus();
                      }}
                    >
                      <div className="max-h-[300px] overflow-y-auto p-1 relative">
                        {quickMsgItems.items.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">Nenhum atalho encontrado.</div>
                        )}
                        {quickMsgItems.items.map((item) => {
                          if (item.type === "header") {
                            return (
                              <div 
                                key={`header-${item.id}`}
                                onClick={() => {
                                  if (item.folderId) {
                                    setExpandedFolders(prev => {
                                      const next = new Set(prev);
                                      if (next.has(item.folderId)) next.delete(item.folderId);
                                      else next.add(item.folderId);
                                      return next;
                                    });
                                  }
                                }}
                                className={cn(
                                  "px-2 py-1.5 mt-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/50 sticky top-0 backdrop-blur-md z-10 flex items-center justify-between rounded-sm",
                                  item.folderId ? "cursor-pointer hover:bg-muted/80 transition-colors" : ""
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  {item.folderId === null ? <MessageSquarePlus className="h-3 w-3" /> : (item.isExpanded ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />)}
                                  {item.name}
                                </div>
                              </div>
                            );
                          }

                          const { qm, index } = item;
                          return (
                            <div
                              key={qm.id}
                              onClick={() => {
                                insertQuickMessage(qm);
                                setQuickMsgIndex(0);
                              }}
                              className={cn(
                                "flex flex-col items-start gap-1 p-2 cursor-pointer rounded-sm mb-0.5", 
                                index === quickMsgIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-foreground"
                              )}
                            >
                              <div className="flex items-center gap-2 w-full">
                                <span className="font-semibold text-xs flex-1 truncate">{qm.name || "Mensagem sem nome"}</span>
                                <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{qm.shortcut}</span>
                                {qm.media_url && (
                                  <span className="shrink-0 text-muted-foreground ml-1">
                                    {qm.media_type === "image" ? <ImageIcon className="h-3 w-3" /> :
                                     qm.media_type === "audio" ? <Headphones className="h-3 w-3" /> :
                                     qm.media_type === "video" ? <Video className="h-3 w-3" /> :
                                     <Paperclip className="h-3 w-3" />}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground line-clamp-1">{qm.content || "Contém apenas anexo"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                </div>

                {/* Send / Mic */}
                {(text.trim() || selectedFile) ? (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={send.isPending}
                    className={cn(
                      "mb-0.5 rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all",
                      isInternalNote && "bg-amber-500 hover:bg-amber-600 text-amber-950"
                    )}
                  >
                    <Send className="h-5 w-5 ml-1" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "mb-0.5 rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all",
                      isInternalNote && "bg-amber-500 hover:bg-amber-600 text-amber-950"
                    )}
                    onClick={startRecording}
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between flex-1 bg-destructive/10 text-destructive px-4 py-2 rounded-md border border-destructive/20 h-[40px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
                  <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 hover:bg-destructive/20 hover:text-destructive text-destructive/80" onClick={cancelRecording}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 px-3 bg-destructive hover:bg-destructive/90 text-white" onClick={stopRecording}>
                    <Send className="h-3 w-3 mr-1" />
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeCompanyId && conv.whatsapp_instance_id && (
        <WhatsappTemplateSender 
          open={templateDialogOpen} 
          onOpenChange={setTemplateDialogOpen} 
          companyId={activeCompanyId} 
          instanceId={conv.whatsapp_instance_id} 
          onSend={async (payload) => {
            await send.mutateAsync({ 
              content: JSON.stringify(payload), 
              mediaType: "template" 
            });
          }}
          isSending={send.isPending}
        />
      )}
    </div>
  );
}
