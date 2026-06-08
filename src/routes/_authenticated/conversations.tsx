import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Send, Paperclip, Smile, MoreVertical, Search, MessageCircle, Phone, Mail, Tag, MessageSquarePlus, Loader2, Mic, Square, X, Image as ImageIcon, SmilePlus, Plus, PanelRight } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendMessageAction, sendProactiveMessageAction, reactToMessageAction, fetchContactInfoAction, syncLabelsAction } from "@/lib/api/chat.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/common/channel-icon";
import { StatusBadge } from "@/components/common/status-badge";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { formatRelative, initials, formatPhone, formatMessageTime } from "@/lib/format";
import { useUnit } from "@/lib/unit-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import EmojiPicker from "emoji-picker-react";
import TextareaAutosize from "react-textarea-autosize";

export const Route = createFileRoute("/_authenticated/conversations")({
  component: ConversationsPage,
});

type Status = "waiting" | "active" | "resolved";

interface ConvRow {
  id: string;
  channel: "whatsapp" | "instagram";
  status: Status;
  last_message_at: string;
  started_at: string;
  tags: string[];
  unread_count?: number;
  last_message_preview?: string | null;
  contact: { 
    id: string; 
    name: string; 
    phone: string | null; 
    email: string | null; 
    tags: string[];
    contact_labels?: { labels: { id: string; name: string; color: string | null } }[];
  };
  department: { name: string } | null;
}

function ConversationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>("waiting");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const { selectedUnitId } = useUnit();

  const { data: conversations } = useQuery({
    queryKey: ["conversations", tab, selectedUnitId],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(
          "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, contact:contacts(id,name,phone,email,tags,contact_labels(labels(id,name,color))), department:departments(name)"
        )
        .eq("status", tab);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }
      // Se for nulo (Sede/Empresa Mãe), não filtra por unit_id. O RLS garante que verá todas da empresa.

      const { data, error } = await query.order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConvRow[];
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("conversations-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.contact?.name.toLowerCase().includes(s) ||
      (c.contact?.phone ?? "").includes(s)
    );
  });

  const selected = filtered.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou número"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <NewConversationDialog onCreated={(id) => {
              setTab("active");
              setSelectedId(id);
            }} />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Status)} className="mt-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="waiting">Aguard.</TabsTrigger>
              <TabsTrigger value="active">Andamento</TabsTrigger>
              <TabsTrigger value="resolved">Resolvidos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="flex-1">
          {filtered.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              selected={selectedId === c.id}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
          {!filtered.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {selected ? (
          <ChatPanel 
            conv={selected} 
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
          />
        ) : (
          <EmptyChat />
        )}
      </section>

      {/* Contact Info Sidebar */}
      {selected && showSidebar && (
        <aside className="hidden w-[280px] shrink-0 flex-col border-l border-border bg-card lg:flex xl:w-[320px]">
          <ContactSidebar conv={selected} onClose={() => setShowSidebar(false)} />
        </aside>
      )}
    </div>
  );
}

function ContactSidebar({ conv, onClose }: { conv: ConvRow, onClose?: () => void }) {
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();

  const { data: allLabels } = useQuery({
    queryKey: ["labels", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data } = await supabase.from('labels').select('*').eq('company_id', profile.company_id);
      return data || [];
    },
    enabled: !!profile?.company_id
  });

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, action }: { labelId: string, action: "add" | "remove" }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({ data: { unitId: selectedUnitId, contactId: conv.contact.id, labelId, action } });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(e.message)
  });

  const sync = useMutation({
    mutationFn: async () => {
      if (!selectedUnitId) return;
      const res = await syncLabelsAction({ data: { unitId: selectedUnitId } });
      if (!res.success) throw new Error("Falha ao sincronizar etiquetas");
      return res;
    },
    onSuccess: (data) => {
      toast.success(`${data?.count || 0} etiquetas sincronizadas`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error((e as Error).message)
  });
  
  const { data: profilePictureUrl } = useQuery({
    queryKey: ["contact-profile-pic", conv.contact?.id, selectedUnitId],
    queryFn: async () => {
      if (!conv.contact?.id || !selectedUnitId) return null;
      return await fetchContactInfoAction({ data: { contactId: conv.contact.id, unitId: selectedUnitId } });
    },
    enabled: !!conv.contact?.id && !!selectedUnitId,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end p-2 pb-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="border-b border-border p-4 pt-0 flex flex-col items-center justify-center space-y-3">
        <Avatar className="h-24 w-24 border">
          {profilePictureUrl ? (
            <img src={profilePictureUrl} alt={conv.contact?.name} className="object-cover" />
          ) : (
            <AvatarFallback className="text-xl bg-primary/10 text-primary">
              {initials(conv.contact?.name)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="text-center">
          <h3 className="font-semibold text-lg">{conv.contact?.name || "Desconhecido"}</h3>
          <p className="text-sm text-muted-foreground">{formatPhone(conv.contact?.phone)}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Tag className="h-3 w-3" />
              Etiquetas
            </h4>
            <div className="flex flex-wrap gap-2">
              {conv.contact?.contact_labels?.map((cl) => {
                const label = cl.labels;
                if (!label) return null;
                const hexColor = label.color || "#6b7280";
                return (
                  <Badge 
                    key={label.id} 
                    variant="outline" 
                    style={{ 
                      backgroundColor: `${hexColor}1a`, 
                      color: hexColor, 
                      borderColor: `${hexColor}33` 
                    }}
                  >
                    {label.name}
                  </Badge>
                );
              })}
              {!conv.contact?.contact_labels?.length && (
                <span className="text-xs text-muted-foreground">Nenhuma etiqueta</span>
              )}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] border-dashed">
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar etiqueta..." className="h-8" />
                    <CommandList>
                      <CommandEmpty>Nenhuma etiqueta encontrada.</CommandEmpty>
                      <CommandGroup>
                        {allLabels?.map(label => {
                          const isSelected = conv.contact?.contact_labels?.some(cl => cl.labels?.id === label.id);
                          return (
                            <CommandItem
                              key={label.id}
                              onSelect={() => {
                                toggleLabel.mutate({ labelId: label.id, action: isSelected ? "remove" : "add" });
                              }}
                            >
                              <div 
                                className="w-2 h-2 rounded-full mr-2" 
                                style={{ backgroundColor: label.color || "#6b7280" }}
                              />
                              <span className="flex-1 text-xs">{label.name}</span>
                              {isSelected && <Square className="h-3 w-3 opacity-50 bg-primary/20" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                title="Sincronizar etiquetas"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                <Loader2 className={cn("h-3 w-3", sync.isPending && "animate-spin")} />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detalhes
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">E-mail</span>
                <span>{conv.contact?.email || "—"}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Departamento</span>
                <span>{conv.department?.name || "—"}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Criado em</span>
                <span>{new Date(conv.started_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function NewConversationDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [instanceName, setInstanceName] = useState("");

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances"],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("company_id", profile.company_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id,
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Usuário sem empresa");
      const res = await sendProactiveMessageAction({
        data: {
          phone,
          text,
          instanceName,
          companyId: profile.company_id,
        }
      });
      return res;
    },
    onSuccess: (res) => {
      if (res.conversationId) {
        onCreated(res.conversationId);
      }
      setOpen(false);
      setPhone("");
      setText("");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Mensagem enviada com sucesso!");
    },
    onError: (e) => {
      toast.error("Erro ao enviar mensagem", { description: (e as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Inicie um atendimento enviando uma mensagem ativa para o cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Instância (Remetente)</Label>
            <Select value={instanceName} onValueChange={setInstanceName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {instances?.map((inst) => (
                  <SelectItem key={inst.instance_name} value={inst.instance_name}>
                    {inst.instance_name}
                  </SelectItem>
                ))}
                {!instances?.length && (
                  <SelectItem value="none" disabled>Nenhuma instância encontrada</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número do Cliente</Label>
            <Input 
              placeholder="Ex: 5511999999999" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
            <p className="text-[10px] text-muted-foreground">Inclua o DDI (55) e o DDD.</p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea 
              placeholder="Digite a primeira mensagem..." 
              value={text} 
              onChange={e => setText(e.target.value)} 
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            onClick={() => send.mutate()} 
            disabled={!phone || !text || !instanceName || send.isPending}
          >
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationItem({
  conv,
  selected,
  onClick,
}: {
  conv: ConvRow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40",
        selected && "bg-accent/60",
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-muted text-xs">
          {initials(conv.contact?.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ChannelIcon channel={conv.channel} className="h-4 w-4" />
          <span className={cn("truncate text-sm font-medium", conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground")}>{conv.contact?.name}</span>
          <span className={cn("ml-auto whitespace-nowrap text-[11px]", conv.unread_count && conv.unread_count > 0 ? "font-bold text-success" : "text-muted-foreground")}>
            {formatRelative(conv.last_message_at)}
          </span>
        </div>
        {conv.last_message_preview && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {conv.last_message_preview}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          {conv.department?.name && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {conv.department.name}
            </Badge>
          )}
          {conv.tags?.map((t) => (
            <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {t}
            </Badge>
          ))}
          {conv.unread_count && conv.unread_count > 0 ? (
            <Badge className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold hover:bg-success">
              {conv.unread_count}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
        <MessageCircle className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium">Selecione uma conversa</h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Escolha um atendimento na lista ao lado para visualizar as mensagens.
      </p>
    </div>
  );
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: "agent" | "contact" | "system";
  content: string | null;
  media_type: "text" | "image" | "audio" | "video" | "document";
  media_url?: string | null;
  created_at: string;
  quoted_content?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  reactions?: Record<string, number>;
  isOptimistic?: boolean;
}

function ChatPanel({ 
  conv,
  showSidebar,
  onToggleSidebar
}: { 
  conv: ConvRow;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_type, content, media_type, media_url, created_at, quoted_content, is_edited, is_deleted, reactions")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    
    // Reset unread count when chat is opened
    if (conv.id && conv.unread_count && conv.unread_count > 0) {
      supabase.rpc('reset_unread_count', { conv_id: conv.id }).then(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });
    }
  }, [messages?.length, conv.id, conv.unread_count, qc]);

  const send = useMutation({
    mutationFn: async (payload: { content: string; mediaType?: "text"|"image"|"video"|"audio"|"document"; mediaBase64?: string }) => {
      await sendMessageAction({ data: { conversationId: conv.id, text: payload.content, mediaType: payload.mediaType, mediaBase64: payload.mediaBase64 } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      const optimisticMsg: MessageRow = {
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_type: "agent",
        content: payload.content,
        media_type: payload.mediaType || "text",
        media_url: payload.mediaBase64 || null,
        created_at: new Date().toISOString(),
        isOptimistic: true
      };

      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => [...(old || []), optimisticMsg]);
      setText("");
      setSelectedFile(null);
      
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);

      return { previousMessages, content: payload.content };
    },
    onError: (e, variables, context) => {
      if (context?.previousMessages) {
        qc.setQueryData(["messages", conv.id], context.previousMessages);
      }
      setText(context?.content || "");
      toast.error("Erro ao enviar", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
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

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      let type = "document";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";
      
      setSelectedFile({ file, base64, type });
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // reset
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

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          send.mutate({ content: "", mediaType: "audio", mediaBase64: base64data });
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
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
      // prevent onstop from sending
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const handleSend = () => {
    if (selectedFile) {
      send.mutate({ content: text.trim(), mediaType: selectedFile.type as any, mediaBase64: selectedFile.base64 });
    } else if (text.trim()) {
      send.mutate({ content: text.trim() });
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resolve = useMutation({
    mutationFn: async () => {
      await supabase
        .from("conversations")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento encerrado");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-muted text-xs">
                {initials(conv.contact?.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {conv.contact?.name}
                <ChannelIcon channel={conv.channel} className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {conv.department?.name && <span>{conv.department.name}</span>}
                <span>•</span>
                <StatusBadge status={conv.status} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conv.status !== "resolved" && (
              <Button variant="outline" size="sm" onClick={() => resolve.mutate()}>
                Encerrar
              </Button>
            )}
            <button 
              className={cn("rounded p-2 text-muted-foreground hover:bg-accent", showSidebar && "bg-accent")}
              onClick={onToggleSidebar}
              title="Informações do Contato"
            >
              <PanelRight className="h-4 w-4" />
            </button>
            <button className="rounded p-2 text-muted-foreground hover:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4"
        >
          {messages?.map((m) => (
            <MessageBubble 
              key={m.id} 
              m={m} 
              onReact={(emoji) => react.mutate({ messageId: m.id, emoji })} 
            />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-3 flex flex-col gap-2">
          {selectedFile && (
            <div className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8">
              <button 
                onClick={() => setSelectedFile(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              {selectedFile.type === 'image' ? (
                <img src={selectedFile.base64} alt="preview" className="h-12 w-12 object-cover rounded-md" />
              ) : (
                <div className="h-12 w-12 bg-muted rounded-md flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-xs truncate max-w-[150px]">
                {selectedFile.file.name}
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {!isRecording ? (
              <>
                <input type="file" id="file-upload" hidden onChange={handleFileChange} />
                <label htmlFor="file-upload" className="rounded p-2 text-muted-foreground hover:bg-accent cursor-pointer">
                  <Paperclip className="h-4 w-4" />
                </label>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="rounded p-2 text-muted-foreground hover:bg-accent">
                      <Smile className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="p-0 border-none w-auto shadow-xl">
                    <EmojiPicker onEmojiClick={(e) => setText(prev => prev + e.emoji)} />
                  </PopoverContent>
                </Popover>
                
                <TextareaAutosize
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  minRows={1}
                  maxRows={6}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
                
                {(text.trim() || selectedFile) ? (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={send.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={startRecording}
                  >
                    <Mic className="h-4 w-4" />
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

      {/* Right panel */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card xl:flex">
        <div className="border-b border-border p-5 text-center">
          <Avatar className="mx-auto h-16 w-16">
            <AvatarFallback className="text-base">
              {initials(conv.contact?.name)}
            </AvatarFallback>
          </Avatar>
          <h3 className="mt-3 text-base font-semibold">{conv.contact?.name}</h3>
          <p className="text-xs text-muted-foreground">Cliente</p>
        </div>
        <div className="space-y-4 p-5 text-sm">
          {conv.contact?.phone && (
            <Field icon={Phone} label="Telefone" value={formatPhone(conv.contact.phone)} />
          )}
          {conv.contact?.email && (
            <Field icon={Mail} label="E-mail" value={conv.contact.email} />
          )}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3 w-3" /> Tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {conv.contact?.tags?.length ? (
                conv.contact.tags.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Sem tags</span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Iniciado
            </div>
            <div>{formatRelative(conv.started_at)}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="break-all">{value}</div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*|_{1}[^_]+_{1}|~[^~]+~)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith('~') && part.endsWith('~')) return <del key={i}>{part.slice(1, -1)}</del>;
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function MessageBubble({ m, onReact }: { m: MessageRow, onReact?: (emoji: string) => void }) {
  const mine = m.sender_type === "agent";
  return (
    <div className={cn("flex relative", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card text-foreground border border-border",
          m.is_deleted && "opacity-60",
          m.isOptimistic && "opacity-70"
        )}
      >
        {onReact && !m.isOptimistic && !m.is_deleted && (
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground z-10",
                mine ? "-left-10" : "-right-10"
              )}>
                <SmilePlus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-auto p-2 flex gap-1 rounded-full shadow-lg border-border">
              {QUICK_EMOJIS.map(e => (
                <button 
                  key={e} 
                  onClick={() => onReact(e)} 
                  className="hover:bg-accent rounded-full p-2 text-xl transition-transform hover:scale-125"
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {m.quoted_content && !m.is_deleted && (
          <div className="mb-2 rounded bg-black/10 dark:bg-white/10 p-2 text-xs border-l-4 opacity-90 border-l-current">
            <span className="font-semibold block mb-0.5 text-[10px] uppercase opacity-70">Mensagem Respondida</span>
            <span className="line-clamp-3 opacity-90">{m.quoted_content}</span>
          </div>
        )}

        {m.is_deleted ? (
          <div className="flex items-center gap-1.5 italic">
            <span className="text-[16px]">🚫</span>
            Mensagem apagada
          </div>
        ) : m.media_type === "image" && m.media_url ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <img 
                  src={m.media_url} 
                  alt={m.content || "Imagem recebida"} 
                  className="max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" 
                />
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none flex justify-center items-center">
                <img 
                  src={m.media_url} 
                  alt={m.content || "Imagem recebida"} 
                  className="max-h-[85vh] w-auto rounded-md object-contain" 
                />
              </DialogContent>
            </Dialog>
            {m.content && m.content !== "📷 Imagem" && (
              <div className="mt-2"><FormattedText text={m.content} /></div>
            )}
          </div>
        ) : m.media_type === "audio" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <audio controls src={m.media_url} className="h-10 w-48" />
            {m.content && m.content !== "🎵 Áudio" && <div className="text-xs"><FormattedText text={m.content} /></div>}
          </div>
        ) : m.media_type === "video" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <video controls src={m.media_url} className="max-w-[200px] rounded-lg" />
            {m.content && m.content !== "🎥 Vídeo" && <div className="text-xs"><FormattedText text={m.content} /></div>}
          </div>
        ) : (
          <FormattedText text={m.content || ""} />
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {m.is_edited && <span className="italic">Editado</span>}
          <span>{formatMessageTime(m.created_at)}</span>
        </div>
        
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className="absolute -bottom-3 right-2 flex gap-1 bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-sm">
            {Object.entries(m.reactions).map(([emoji, count]) => (
              <span key={emoji}>{emoji} {count > 1 ? count : ''}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
