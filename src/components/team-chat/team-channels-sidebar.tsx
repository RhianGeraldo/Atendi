import React, { useState, useMemo } from "react";
import { 
  Hash, 
  Building2, 
  Globe, 
  Users, 
  MessageSquare, 
  Plus, 
  Search, 
  UserPlus,
  Bell,
  Megaphone
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { initials, formatConversationTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { InternalChannel } from "./team-chat-types";

interface TeamChannelsSidebarProps {
  channels: InternalChannel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onOpenCreateChannel: () => void;
  onOpenNewDirectChat: () => void;
  // Pilar 3: Presença e Notificações
  onlineUserIds?: string[];
  notificationPermission?: NotificationPermission;
  onRequestNotificationPermission?: () => void;
}

type TeamChatTab = "all" | "channels" | "direct";

export function TeamChannelsSidebar({
  channels,
  selectedChannelId,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenNewDirectChat,
  onlineUserIds = [],
  notificationPermission = "default",
  onRequestNotificationPermission,
}: TeamChannelsSidebarProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TeamChatTab>("all");

  // Filtragem dos canais pelo termo de busca
  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const term = search.toLowerCase().trim();
    return channels.filter((ch) => {
      const name = ch.name?.toLowerCase() || "";
      const otherUserName = ch.other_user?.name?.toLowerCase() || "";
      const preview = ch.last_message_preview?.toLowerCase() || "";
      return name.includes(term) || otherUserName.includes(term) || preview.includes(term);
    });
  }, [channels, search]);

  // Contadores para as abas
  const counts = useMemo(() => {
    const all = channels;
    const chs = channels.filter((c) => c.type !== "direct");
    const dms = channels.filter((c) => c.type === "direct");

    return {
      all: {
        total: all.length,
        unread: all.reduce((acc, c) => acc + (c.unread_count || 0), 0),
      },
      channels: {
        total: chs.length,
        unread: chs.reduce((acc, c) => acc + (c.unread_count || 0), 0),
      },
      direct: {
        total: dms.length,
        unread: dms.reduce((acc, c) => acc + (c.unread_count || 0), 0),
      },
    };
  }, [channels]);

  // Itens visíveis conforme a aba ativa
  const displayedChannels = useMemo(() => {
    if (tab === "channels") {
      return filteredChannels.filter((c) => c.type !== "direct");
    }
    if (tab === "direct") {
      return filteredChannels.filter((c) => c.type === "direct");
    }
    return filteredChannels;
  }, [filteredChannels, tab]);

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Busca e Ações Rápidas (idêntico ao cabeçalho da listagem de clientes) */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar grupo ou colega..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs bg-background/50"
            />
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            title="Criar novo grupo ou canal"
            onClick={onOpenCreateChannel}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0"
            title="Conversar com um colega (1:1)"
            onClick={onOpenNewDirectChat}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        {/* Abas com contadores e badges de não lidas (estilo da listagem de clientes) */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TeamChatTab)} className="mt-3">
          <TabsList className="grid w-full grid-cols-3 h-auto py-1">
            <TabsTrigger
              value="all"
              className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5"
            >
              <span>Todos</span>
              <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                {counts.all.total}
              </span>
              {counts.all.unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                  {counts.all.unread > 99 ? "99+" : counts.all.unread}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="channels"
              className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5"
            >
              <span>Grupos</span>
              <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                {counts.channels.total}
              </span>
              {counts.channels.unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                  {counts.channels.unread > 99 ? "99+" : counts.channels.unread}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="direct"
              className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5"
            >
              <span>Conversas</span>
              <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                {counts.direct.total}
              </span>
              {counts.direct.unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                  {counts.direct.unread > 99 ? "99+" : counts.direct.unread}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Banner de Ativação de Notificações do Navegador */}
        {notificationPermission === "default" && onRequestNotificationPermission && (
          <div className="mt-2.5 p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-primary min-w-0">
              <Bell className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px] font-medium truncate">Notificações no navegador</span>
            </div>
            <Button
              size="sm"
              variant="default"
              className="h-6 text-[10px] px-2.5 py-0 shrink-0 font-semibold"
              onClick={onRequestNotificationPermission}
            >
              Ativar
            </Button>
          </div>
        )}
      </div>

      {/* Lista de Conversas (estilo idêntico ao ConversationItem dos clientes) */}
      <div className="flex-1 overflow-y-auto">
        {displayedChannels.map((channel) => (
          <TeamConversationCard
            key={channel.id}
            channel={channel}
            isSelected={selectedChannelId === channel.id}
            onSelect={() => onSelectChannel(channel.id)}
            isOnline={Boolean(
              (channel.other_user?.id && onlineUserIds.includes(channel.other_user.id)) ||
              channel.other_user?.online
            )}
          />
        ))}

        {displayedChannels.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
            <p>
              {search.trim()
                ? "Nenhuma conversa encontrada na busca."
                : tab === "direct"
                ? "Nenhuma conversa iniciada."
                : tab === "channels"
                ? "Nenhum grupo encontrado."
                : "Nenhuma conversa encontrada."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Card de conversa interna (estilo idêntico ao dos clientes)
function TeamConversationCard({
  channel,
  isSelected,
  onSelect,
  isOnline = false,
}: {
  channel: InternalChannel;
  isSelected: boolean;
  onSelect: () => void;
  isOnline?: boolean;
}) {
  const { profile } = useAuth();
  const isDirect = channel.type === "direct";
  const otherUser = channel.other_user;
  const hasUnread = (channel.unread_count || 0) > 0;

  // Verifica se a última mensagem foi enviada pelo próprio usuário logado
  const isFromMe = Boolean(
    profile?.id && channel.last_message_sender_id === profile.id
  );

  // Nome exibido
  const name = isDirect
    ? otherUser?.name || "Conversa Direta"
    : channel.name || "Canal de Equipe";

  // Foto de perfil / Avatar
  const avatarUrl = isDirect ? otherUser?.avatar_url : channel.avatar_url;

  // Unidade associada
  const unitName = isDirect ? otherUser?.unit_name : channel.unit?.name;
  const unitColor = !isDirect ? channel.unit?.color : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full max-w-full overflow-hidden items-start gap-3 border-b border-border pl-3 pr-4 py-3 text-left transition-colors hover:bg-accent/40 cursor-pointer",
        isSelected && "bg-accent/60"
      )}
    >
      {/* Avatar com badge de tipo/status no canto inferior */}
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10 shrink-0">
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
          )}
          <AvatarFallback
            className={cn(
              "font-medium text-xs",
              isDirect
                ? "bg-primary/10 text-primary"
                : channel.scope === "company"
                ? "bg-primary/15 text-primary"
                : channel.scope === "unit"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
            )}
          >
            {isDirect ? (
              initials(name)
            ) : channel.scope === "company" ? (
              <Globe className="h-4 w-4" />
            ) : channel.scope === "unit" ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>

        {/* Ícone no canto inferior direito do Avatar */}
        <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
          {isDirect ? (
            isOnline ? (
              <span className="relative flex h-3.5 w-3.5" title="Online agora">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-card shadow-xs" />
              </span>
            ) : (
              <span
                className="h-3.5 w-3.5 rounded-full bg-muted-foreground/35 border-2 border-card shadow-xs"
                title="Offline"
              />
            )
          ) : (
            <div
              className={cn(
                "h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-card shadow-xs text-white",
                channel.scope === "company"
                  ? "bg-primary text-primary-foreground"
                  : channel.scope === "unit"
                  ? "bg-amber-500"
                  : "bg-blue-500"
              )}
            >
              <Hash className="h-2.5 w-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo à direita: Nome, Horário, Prévia e Badges */}
      <div className="min-w-0 flex-1 grid">
        {/* Linha 1: Nome do canal/colega + Horário */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "truncate text-sm font-medium flex-1 min-w-0",
              hasUnread && "font-bold text-foreground"
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "whitespace-nowrap shrink-0 text-[11px]",
              hasUnread ? "font-bold text-success" : "text-muted-foreground"
            )}
            title={
              channel.last_message_at
                ? new Date(channel.last_message_at).toLocaleString("pt-BR")
                : undefined
            }
          >
            {formatConversationTime(channel.last_message_at)}
          </span>
        </div>

        {/* Linha 2: Prévia da última mensagem com Você: */}
        <div
          className={cn(
            "mt-0.5 truncate text-xs flex items-center gap-1",
            hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {channel.last_message_preview ? (
            <>
              {isFromMe && (
                <span className="shrink-0 font-normal text-muted-foreground/80">Você:</span>
              )}
              <span className="truncate">{channel.last_message_preview}</span>
            </>
          ) : (
            <span className="italic text-muted-foreground/70">Nenhuma mensagem recente</span>
          )}
        </div>

        {/* Linha 3: Badges de Unidade e Indicador de Menção/Não Lidas */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Badge de Unidade com pílula colorida (idêntico ao conversation-item dos clientes) */}
          {unitName && (
            <div
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50"
              style={{
                backgroundColor: unitColor ? `${unitColor}20` : "var(--muted)",
                color: unitColor || "var(--muted-foreground)",
                borderColor: unitColor ? `${unitColor}40` : "var(--border)",
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: unitColor || "var(--muted-foreground)" }}
              />
              <span className="font-medium">{unitName}</span>
            </div>
          )}

          {/* Badge de Avisos se for canal de anúncios */}
          {!isDirect && channel.is_announcement && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 flex items-center gap-1">
              <Megaphone className="h-2.5 w-2.5" />
              <span>Avisos</span>
            </Badge>
          )}

          {/* Badge de Escopo apenas para Grupos (sem badges de cargo nas conversas diretas) */}
          {!isDirect && (
            channel.scope === "company" ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                Geral
              </Badge>
            ) : channel.scope === "unit" ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                Unidade
              </Badge>
            ) : (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                Grupo
              </Badge>
            )
          )}

          {/* Badges de Menção (@ 1) ou Contador de Não Lidas à direita */}
          {channel.has_mention ? (
            <span
              className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0 text-[10px] font-bold text-white shadow-xs"
              title="Você foi mencionado nesta conversa"
            >
              @ {channel.mention_count || channel.unread_count || 1}
            </span>
          ) : hasUnread ? (
            <span
              className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold text-white shadow-sm"
            >
              {channel.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
