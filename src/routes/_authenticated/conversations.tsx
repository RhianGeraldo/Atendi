import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Send, Paperclip, Smile, MoreVertical, Search, MessageCircle, Phone, Mail, Tag } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
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
import { formatRelative, initials, formatPhone } from "@/lib/format";

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
  contact: { id: string; name: string; phone: string | null; email: string | null; tags: string[] };
  department: { name: string } | null;
}

function ConversationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>("waiting");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ["conversations", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, channel, status, last_message_at, started_at, tags, contact:contacts(id,name,phone,email,tags), department:departments(name)"
        )
        .eq("status", tab)
        .order("last_message_at", { ascending: false });
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* List */}
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome ou número"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
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
        {selected ? <ChatPanel conv={selected} /> : <EmptyChat />}
      </section>
    </div>
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
          <span className="truncate text-sm font-medium">{conv.contact?.name}</span>
          <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
            {formatRelative(conv.last_message_at)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
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
  created_at: string;
}

function ChatPanel({ conv }: { conv: ConvRow }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_type, content, media_type, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, conv.id]);

  const send = useMutation({
    mutationFn: async (content: string) => {
      const now = new Date().toISOString();
      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conv.id,
        sender_type: "agent",
        sender_id: user?.id,
        content,
        media_type: "text",
      });
      if (msgErr) throw msgErr;
      await supabase
        .from("conversations")
        .update({ last_message_at: now, status: conv.status === "waiting" ? "active" : conv.status, assigned_agent_id: user?.id })
        .eq("id", conv.id);
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error("Erro ao enviar", { description: (e as Error).message }),
  });

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
          {messages?.map((m) => <MessageBubble key={m.id} m={m} />)}
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-3">
          <div className="flex items-end gap-2">
            <button className="rounded p-2 text-muted-foreground hover:bg-accent">
              <Paperclip className="h-4 w-4" />
            </button>
            <button className="rounded p-2 text-muted-foreground hover:bg-accent">
              <Smile className="h-4 w-4" />
            </button>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) send.mutate(text.trim());
                }
              }}
              placeholder="Digite uma mensagem..."
              rows={1}
              className="min-h-[40px] flex-1 resize-none"
            />
            <Button
              size="icon"
              onClick={() => text.trim() && send.mutate(text.trim())}
              disabled={!text.trim() || send.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
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

function MessageBubble({ m }: { m: MessageRow }) {
  const mine = m.sender_type === "agent";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card text-foreground border border-border",
        )}
      >
        {m.content}
        <div
          className={cn(
            "mt-1 text-[10px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatRelative(m.created_at)}
        </div>
      </div>
    </div>
  );
}
