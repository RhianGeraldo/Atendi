import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import {
  Users,
  Search,
  UserPlus,
  Shield,
  ShieldCheck,
  MoreVertical,
  LogOut,
  Trash2,
  Megaphone,
  Globe,
  Building2,
  Loader2,
  Check,
  X,
  User,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  FileText,
  Mic,
  Pencil,
  Bell,
  BellOff,
  Star,
  Lock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { initials } from "@/lib/format";
import { PdfViewer } from "@/components/chat/message-bubble";
import { InternalChannel, InternalMessage, TeamMember } from "./team-chat-types";

export interface ChannelMembersSidebarProps {
  channel: InternalChannel;
  messages?: InternalMessage[];
  teamMembers: TeamMember[];
  onlineUserIds?: string[];
  currentUserId?: string;
  isCurrentUserAdminOrManager?: boolean;
  onAddMembers?: (channelId: string, userIds: string[]) => Promise<void>;
  onRemoveMember?: (channelId: string, userId: string) => Promise<void>;
  onUpdateMemberRole?: (
    channelId: string,
    userId: string,
    role: "admin" | "member"
  ) => Promise<void>;
  onLeaveChannel?: (channelId: string) => Promise<void>;
  onUpdateChannel?: (
    channelId: string,
    data: { name?: string; description?: string; isAnnouncement?: boolean }
  ) => Promise<void>;
  onToggleMuteChannel?: (channelId: string, isMuted: boolean) => Promise<void>;
  onOpenSearch?: () => void;
  onClose?: () => void;
}

export function ChannelMembersSidebar({
  channel,
  messages = [],
  teamMembers,
  onlineUserIds = [],
  currentUserId,
  isCurrentUserAdminOrManager = false,
  onAddMembers,
  onRemoveMember,
  onUpdateMemberRole,
  onLeaveChannel,
  onUpdateChannel,
  onToggleMuteChannel,
  onOpenSearch,
  onClose,
}: ChannelMembersSidebarProps) {
  // Navegação interna: 'info' (Dados do grupo) ou 'media' (Mídias, links e docs)
  const [view, setView] = useState<"info" | "media">("info");

  // Estado de silenciar / notificações
  const myMembership = useMemo(
    () => channel.members?.find((m) => m.user_id === currentUserId),
    [channel.members, currentUserId]
  );
  const [isMuted, setIsMuted] = useState(Boolean(myMembership?.is_muted));
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  React.useEffect(() => {
    setIsMuted(Boolean(myMembership?.is_muted));
  }, [myMembership?.is_muted, channel.id]);

  const handleToggleMute = async (newVal: boolean) => {
    if (!onToggleMuteChannel) return;
    try {
      setIsTogglingMute(true);
      setIsMuted(newVal);
      await onToggleMuteChannel(channel.id, newVal);
    } catch {
      setIsMuted(!newVal);
    } finally {
      setIsTogglingMute(false);
    }
  };
  const [memberSearch, setMemberSearch] = useState("");
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Estados de edição do canal
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [editName, setEditName] = useState(channel.name || "");
  const [editDescription, setEditDescription] = useState(channel.description || "");
  const [editIsAnnouncement, setEditIsAnnouncement] = useState(
    Boolean(channel.is_announcement)
  );
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Estados de visualização expandida de mídias
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<{ url: string; fileName: string } | null>(null);

  // Estados de confirmação
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Identifica se o usuário atual é admin do canal ou criador
  const isChannelAdmin = useMemo(() => {
    if (isCurrentUserAdminOrManager) return true;
    if (channel.created_by === currentUserId) return true;
    return (
      channel.members?.some(
        (m) => m.user_id === currentUserId && m.role === "admin"
      ) || false
    );
  }, [channel, currentUserId, isCurrentUserAdminOrManager]);

  // Lista dos membros atuais do canal (apenas colaboradores ativos)
  const currentMembersList = useMemo(() => {
    const list = (channel.members || [])
      .filter((m) => {
        // Exclui usuários desativados
        if (m.profile?.active === false) return false;
        const fullProfile = teamMembers.find((tm) => tm.id === m.user_id);
        if (fullProfile && fullProfile.active === false) return false;
        return true;
      })
      .map((m) => {
        const fullProfile = teamMembers.find((tm) => tm.id === m.user_id);
        const isOnline = onlineUserIds.includes(m.user_id);
        const isCreator = channel.created_by === m.user_id;

        return {
          ...m,
          name: m.profile?.name || fullProfile?.name || "Colaborador",
          avatarUrl: m.profile?.avatar_url || fullProfile?.avatar_url || null,
          roleInGroup: m.role || "member",
          companyRole: m.profile?.role || fullProfile?.role || null,
          units: fullProfile?.units || [],
          isOnline,
          isCreator,
        };
      });

    // Ordenação estilo WhatsApp: 
    // 1. Você (usuário atual)
    // 2. Criador do grupo
    // 3. Administradores do grupo
    // 4. Membros ordenados alfabeticamente pelo nome
    list.sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      if (a.isCreator && !b.isCreator) return -1;
      if (!a.isCreator && b.isCreator) return 1;
      if (a.roleInGroup === "admin" && b.roleInGroup !== "admin") return -1;
      if (a.roleInGroup !== "admin" && b.roleInGroup === "admin") return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    if (!memberSearch.trim()) return list;
    const term = memberSearch.toLowerCase().trim();
    return list.filter((m) => {
      const name = m.name.toLowerCase();
      const role = m.companyRole?.toLowerCase() || "";
      const unit = m.units.map((u) => u.name.toLowerCase()).join(" ");
      return name.includes(term) || role.includes(term) || unit.includes(term);
    });
  }, [channel.members, channel.created_by, teamMembers, onlineUserIds, memberSearch, currentUserId]);

  // Membros da equipe que AINDA NÃO ESTÃO no canal (apenas colaboradores ativos)
  const nonMembers = useMemo(() => {
    const existingIds = new Set((channel.members || []).map((m) => m.user_id));
    const available = teamMembers.filter(
      (tm) => tm.active !== false && !existingIds.has(tm.id)
    );

    if (!addSearch.trim()) return available;
    const term = addSearch.toLowerCase().trim();
    return available.filter((tm) => {
      const name = tm.name?.toLowerCase() || "";
      const role = tm.role?.toLowerCase() || "";
      const unit = tm.units?.map((u) => u.name.toLowerCase()).join(" ") || "";
      return name.includes(term) || role.includes(term) || unit.includes(term);
    });
  }, [channel.members, teamMembers, addSearch]);

  // Mídias do canal
  const images = useMemo(
    () => messages.filter((m) => !m.is_deleted && m.media_type === "image" && m.media_url),
    [messages]
  );
  const docs = useMemo(
    () => messages.filter((m) => !m.is_deleted && m.media_type === "document" && m.media_url),
    [messages]
  );
  const audios = useMemo(
    () => messages.filter((m) => !m.is_deleted && m.media_type === "audio" && m.media_url),
    [messages]
  );
  const pinnedMessagesCount = useMemo(
    () => messages.filter((m) => !m.is_deleted && m.is_pinned).length,
    [messages]
  );
  const totalMediaCount = images.length + docs.length + audios.length;

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Reset de estados quando o canal mudar
  React.useEffect(() => {
    setView("info");
    setEditName(channel.name || "");
    setEditDescription(channel.description || "");
    setEditIsAnnouncement(Boolean(channel.is_announcement));
    setIsAddingMode(false);
    setIsEditingChannel(false);
    setSelectedToAdd([]);
    setMemberSearch("");
    setAddSearch("");
  }, [channel.id]);

  // Handler para adicionar membros selecionados
  const handleConfirmAddMembers = async () => {
    if (selectedToAdd.length === 0 || !onAddMembers) return;
    try {
      setIsSubmittingAdd(true);
      await onAddMembers(channel.id, selectedToAdd);
      setSelectedToAdd([]);
      setIsAddingMode(false);
      setAddSearch("");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Handler para salvar edição do canal
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !onUpdateChannel) return;
    try {
      setIsSubmittingEdit(true);
      await onUpdateChannel(channel.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        isAnnouncement: editIsAnnouncement,
      });
      setIsEditingChannel(false);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const toggleSelectToAdd = (userId: string) => {
    setSelectedToAdd((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const isDirect = channel.type === "direct";
  const otherUser = channel.other_user;
  const channelTitle =
    channel.name || (isDirect ? otherUser?.name || "Conversa" : "Canal");
  const memberCount = currentMembersList.length || channel.members?.length || 1;

  return (
    <div className="flex h-full flex-col bg-background/50 border-border overflow-hidden">
      {/* Header do Aside / Drawer: Título na esquerda e ÚNICO BOTÃO X no canto direito */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60">
        <div className="flex items-center gap-2 min-w-0">
          {view === "media" && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer -ml-1"
              onClick={() => setView("info")}
              title="Voltar aos dados do grupo"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <h2 className="text-sm md:text-base font-semibold text-foreground truncate">
            {view === "media"
              ? "Mídia, links e docs"
              : isDirect
              ? "Dados do contato"
              : "Dados do grupo"}
          </h2>
        </div>

        {/* ÚNICO botão X no canto direito */}
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={onClose}
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* VIEW: MÍDIA, LINKS E DOCS (EXPANDIDO) */}
      {view === "media" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs defaultValue="images" className="flex-1 flex flex-col min-h-0">
            <div className="px-4 pt-3 pb-2 border-b border-border/50 bg-muted/20">
              <TabsList className="grid grid-cols-3 w-full h-8">
                <TabsTrigger value="images" className="text-xs gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Fotos ({images.length})</span>
                </TabsTrigger>
                <TabsTrigger value="docs" className="text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Docs ({docs.length})</span>
                </TabsTrigger>
                <TabsTrigger value="audios" className="text-xs gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  <span>Áudios ({audios.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Galeria de Fotos */}
            <TabsContent value="images" className="flex-1 overflow-y-auto p-4 m-0">
              {images.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center">
                  <ImageIcon className="h-10 w-10 stroke-[1.2] opacity-40 mb-2" />
                  <p className="text-xs font-medium">Nenhuma foto compartilhada</p>
                  <p className="text-[11px] opacity-70">Envie imagens ou cole com Ctrl+V</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setSelectedImage(img.media_url!)}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-border/60 bg-muted cursor-pointer hover:border-primary/50 transition-all shadow-2xs"
                    >
                      <img
                        src={img.media_url!}
                        alt={img.file_name || "Imagem"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5 text-[9px] text-white">
                        <span className="font-semibold truncate">
                          {img.sender?.name || "Colega"}
                        </span>
                        <span className="opacity-80">
                          {format(new Date(img.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Lista de Documentos */}
            <TabsContent value="docs" className="flex-1 overflow-y-auto p-3 m-0 space-y-2">
              {docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center">
                  <FileText className="h-10 w-10 stroke-[1.2] opacity-40 mb-2" />
                  <p className="text-xs font-medium">Nenhum documento compartilhado</p>
                  <p className="text-[11px] opacity-70">Envie PDFs, planilhas ou arquivos</p>
                </div>
              ) : (
                docs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() =>
                      setSelectedDoc({
                        url: doc.media_url!,
                        fileName: doc.file_name || "Documento",
                      })
                    }
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/60 transition-colors cursor-pointer group select-none"
                  >
                    <div className="h-9 w-9 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate group-hover:underline">
                        {doc.file_name || "Documento sem nome"}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>{doc.sender?.name || "Colega"}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(doc.created_at), "dd/MM", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Lista de Áudios */}
            <TabsContent value="audios" className="flex-1 overflow-y-auto p-3 m-0 space-y-2">
              {audios.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center">
                  <Mic className="h-10 w-10 stroke-[1.2] opacity-40 mb-2" />
                  <p className="text-xs font-medium">Nenhum áudio compartilhado</p>
                  <p className="text-[11px] opacity-70">Grave recados de voz rápidos no chat</p>
                </div>
              ) : (
                audios.map((audio) => (
                  <div
                    key={audio.id}
                    className="p-2.5 rounded-lg border border-border bg-card space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {audio.sender?.name || "Colega"}
                      </span>
                      <span>
                        {format(new Date(audio.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <audio src={audio.media_url!} controls className="w-full h-8 rounded-md" />
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        /* VIEW PRINCIPAL: DADOS DO GRUPO (ESTILO WHATSAPP) */
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* 1. Bloco de Cabeçalho Centralizado com Foto, Nome e Subtítulo */}
            <div className="flex flex-col items-center text-center pt-2 pb-1 space-y-3">
              <div className="relative">
                {isDirect ? (
                  <Avatar className="h-24 w-24 border-2 border-border shadow-md">
                    <AvatarImage src={otherUser?.avatar_url || ""} />
                    <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                      {initials(otherUser?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-24 w-24 rounded-full bg-gradient-to-tr from-primary/20 via-primary/10 to-muted border-2 border-border flex items-center justify-center text-primary shadow-md">
                    <span className="text-3xl font-bold">#</span>
                  </div>
                )}
                {isDirect && (otherUser?.id ? onlineUserIds.includes(otherUser.id) : Boolean(otherUser?.online)) && (
                  <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background" />
                )}
              </div>

              <div className="space-y-1 max-w-full px-2">
                <div className="flex items-center justify-center gap-1.5">
                  <h3 className="text-base font-bold text-foreground truncate">
                    {channelTitle}
                  </h3>
                  {!isDirect && isChannelAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsEditingChannel(!isEditingChannel)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Editar nome e descrição"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                  {!isDirect ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Grupo · {memberCount} membros
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {otherUser?.role?.replace("_", " ") || "Colaborador"}
                      {(otherUser?.id ? onlineUserIds.includes(otherUser.id) : Boolean(otherUser?.online))
                        ? " · Online agora"
                        : " · Offline"}
                    </span>
                  )}
                  {channel.is_announcement && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 flex items-center gap-1"
                    >
                      <Megaphone className="h-2.5 w-2.5" />
                      Avisos
                    </Badge>
                  )}
                </div>
              </div>

              {/* 2. Botões de Ação Rápida Circulares (Adicionar / Pesquisar) */}
              <div className="flex items-center justify-center gap-6 pt-1">
                {!isDirect && isChannelAdmin && onAddMembers && (
                  <button
                    type="button"
                    onClick={() => setIsAddingMode(true)}
                    className="flex flex-col items-center gap-1.5 group cursor-pointer"
                  >
                    <div className="h-10 w-10 rounded-full bg-muted/60 border border-border group-hover:bg-primary/10 group-hover:border-primary/40 group-hover:text-primary transition-all flex items-center justify-center text-muted-foreground">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                      Adicionar
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onOpenSearch?.();
                  }}
                  className="flex flex-col items-center gap-1.5 group cursor-pointer"
                >
                  <div className="h-10 w-10 rounded-full bg-muted/60 border border-border group-hover:bg-primary/10 group-hover:border-primary/40 group-hover:text-primary transition-all flex items-center justify-center text-muted-foreground">
                    <Search className="h-4 w-4" />
                  </div>
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                    Pesquisar
                  </span>
                </button>
              </div>
            </div>

            {/* Formulário de Edição do Grupo (Inline quando clicado no lápis) */}
            {isEditingChannel && (
              <form
                onSubmit={handleSaveEdit}
                className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in duration-150"
              >
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    Nome do Grupo
                  </label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-xs bg-background"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    Descrição do Grupo
                  </label>
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="text-xs resize-none bg-background"
                    rows={2}
                  />
                </div>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={editIsAnnouncement}
                    onCheckedChange={(checked) =>
                      setEditIsAnnouncement(Boolean(checked))
                    }
                    className="mt-0.5"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Canal de Avisos da Matriz (somente admins publicam)
                  </span>
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingChannel(false)}
                    className="h-7 text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!editName.trim() || isSubmittingEdit}
                    className="h-7 text-xs gap-1"
                  >
                    {isSubmittingEdit && <Loader2 className="h-3 w-3 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </form>
            )}

            {/* 3. Bloco de Descrição do Grupo */}
            {(channel.description || (!isDirect && isChannelAdmin)) && !isEditingChannel && (
              <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium block">
                  Descrição do grupo
                </span>
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {channel.description || "Nenhuma descrição adicionada."}
                </p>
              </div>
            )}

            {/* 4. Bloco "Mídia, links e docs" (com miniaturas e clique para abrir) */}
            <div
              onClick={() => setView("media")}
              className="p-3.5 rounded-xl border border-border bg-card/60 hover:bg-muted/40 transition-colors cursor-pointer group space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  <span>Mídia, links e docs</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  <span>{totalMediaCount}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>

              {images.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {images.slice(0, 4).map((img) => (
                    <div
                      key={img.id}
                      className="aspect-square rounded-md overflow-hidden bg-muted border border-border/60"
                    >
                      <img
                        src={img.media_url!}
                        alt="Prévia"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Fotos, documentos e áudios compartilhados no chat.
                </p>
              )}
            </div>

            {/* Bloco de Mensagens Favoritas, Configurações de Notificação e Criptografia (WhatsApp) */}
            <div className="rounded-xl border border-border bg-card/60 divide-y divide-border overflow-hidden">
              {/* Mensagens favoritas */}
              <div
                className="flex items-center justify-between p-3.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                onClick={() => {
                  if (pinnedMessagesCount > 0) {
                    toast.info(`Este canal possui ${pinnedMessagesCount} mensagem(ns) fixada(s)/favorita(s).`);
                  } else {
                    toast.info("Nenhuma mensagem favoritada ou fixada neste grupo.");
                  }
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Star className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    Mensagens favoritas
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {pinnedMessagesCount > 0 && (
                    <span className="font-semibold text-foreground">{pinnedMessagesCount}</span>
                  )}
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>

              {/* Configurações de notificação */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                    onClick={() => setNotifDialogOpen(true)}
                  >
                    {isMuted ? (
                      <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Bell className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        Configurações de notificação
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {isMuted ? "Silenciadas" : "Ativadas (Padrão)"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={!isMuted}
                      onCheckedChange={(checked) => handleToggleMute(!checked)}
                      disabled={isTogglingMute}
                      title={isMuted ? "Ativar notificações" : "Silenciar notificações"}
                    />
                  </div>
                </div>
              </div>

              {/* Criptografia */}
              <div className="p-3.5 flex items-start gap-3">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0 space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Criptografia</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    As mensagens são protegidas de ponta a ponta com acesso restrito aos membros da sua empresa.
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Bloco de Participantes / Membros (apenas para grupos) */}
            {!isDirect && (
              <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {currentMembersList.length} participante
                    {currentMembersList.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Modo Adicionar Membros inline */}
                {isAddingMode ? (
                  <div className="space-y-2.5 pt-1 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <UserPlus className="h-3.5 w-3.5 text-primary" />
                        Adicionar ao grupo
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsAddingMode(false);
                          setSelectedToAdd([]);
                        }}
                        className="h-6 text-xs text-muted-foreground gap-1 px-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar colaboradores..."
                        value={addSearch}
                        onChange={(e) => setAddSearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-background"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border/60 bg-background">
                      {nonMembers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          {addSearch
                            ? "Nenhum colaborador encontrado."
                            : "Todos os colaboradores já estão no grupo!"}
                        </div>
                      ) : (
                        nonMembers.map((user) => {
                          const isSelected = selectedToAdd.includes(user.id);
                          return (
                            <label
                              key={user.id}
                              className="flex items-center gap-2.5 p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectToAdd(user.id)}
                              />
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarImage src={user.avatar_url || ""} />
                                <AvatarFallback className="text-[10px]">
                                  {initials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-foreground block truncate">
                                  {user.name}
                                </span>
                                {user.role && (
                                  <span className="text-[10px] text-muted-foreground capitalize block truncate">
                                    {user.role.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {selectedToAdd.length} selecionado{selectedToAdd.length === 1 ? "" : "s"}
                      </span>
                      <Button
                        size="sm"
                        disabled={selectedToAdd.length === 0 || isSubmittingAdd}
                        onClick={handleConfirmAddMembers}
                        className="h-7 text-xs gap-1"
                      >
                        {isSubmittingAdd ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Adicionar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Linha "Adicionar participante" estilo WhatsApp */}
                    {isChannelAdmin && onAddMembers && (
                      <button
                        type="button"
                        onClick={() => setIsAddingMode(true)}
                        className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted/60 transition-colors text-left cursor-pointer group"
                      >
                        <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          Adicionar participante
                        </span>
                      </button>
                    )}

                    {/* Campo de Busca de Membros */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar participantes..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="h-8 pl-8 text-xs bg-muted/40 border-none"
                      />
                    </div>

                    {/* Lista de Membros */}
                    <div className="divide-y divide-border/50">
                      {currentMembersList.map((member) => {
                        const isSelf = member.user_id === currentUserId;
                        const canManage = isChannelAdmin && !member.isCreator && !isSelf;

                        return (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between gap-2.5 py-2 hover:bg-muted/30 px-1 rounded-md transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={member.avatarUrl || ""} />
                                  <AvatarFallback className="text-[11px]">
                                    {initials(member.name)}
                                  </AvatarFallback>
                                </Avatar>
                                {member.isOnline ? (
                                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                                ) : (
                                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 border-2 border-background" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {member.name}
                                  </span>
                                  {isSelf && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1 py-0 h-3.5 text-muted-foreground font-normal"
                                    >
                                      Você
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                                  {member.companyRole && (
                                    <span className="capitalize">
                                      {member.companyRole.replace("_", " ")}
                                    </span>
                                  )}
                                  {member.units.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>{member.units[0].name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Badge "Admin do grupo" estilo WhatsApp */}
                              {member.isCreator ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 font-medium"
                                >
                                  Criador
                                </Badge>
                              ) : member.roleInGroup === "admin" ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 font-medium"
                                >
                                  Admin do grupo
                                </Badge>
                              ) : null}

                              {/* Menu de Gestão do Membro */}
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="text-xs w-48">
                                    {member.roleInGroup === "admin" ? (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          onUpdateMemberRole?.(
                                            channel.id,
                                            member.user_id,
                                            "member"
                                          )
                                        }
                                        className="cursor-pointer"
                                      >
                                        <Shield className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                        Remover como Admin
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          onUpdateMemberRole?.(
                                            channel.id,
                                            member.user_id,
                                            "admin"
                                          )
                                        }
                                        className="cursor-pointer"
                                      >
                                        <ShieldCheck className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                                        Tornar Admin do grupo
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setMemberToRemove({
                                          id: member.user_id,
                                          name: member.name,
                                        })
                                      }
                                      className="text-destructive focus:text-destructive cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                                      Remover do grupo
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 6. Botão Sair do Grupo (Vermelho estilo WhatsApp) */}
            {!isDirect && onLeaveChannel && (
              <button
                type="button"
                onClick={() => setConfirmLeaveOpen(true)}
                className="flex items-center gap-3 w-full p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive text-left transition-colors cursor-pointer group"
              >
                <LogOut className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-xs font-semibold">Sair do grupo</span>
              </button>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Visualização de foto em tela cheia */}
      <Dialog open={Boolean(selectedImage)} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-none shadow-none flex items-center justify-center">
          <DialogTitle className="sr-only">Visualizar Imagem</DialogTitle>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Visualização"
              className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain bg-background/90"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Visualização de documento / PDF */}
      <Dialog open={Boolean(selectedDoc)} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl p-0 bg-white dark:bg-zinc-900 border border-border shadow-2xl flex flex-col h-[85vh] overflow-hidden">
          <DialogTitle className="sr-only">Visualizar Documento</DialogTitle>
          <div className="flex justify-between items-center px-4 py-3 border-b bg-muted/40">
            <h2 className="text-sm font-semibold truncate pr-4 flex items-center gap-2 text-foreground">
              <FileText className="h-4 w-4 text-red-500 shrink-0" />
              <span className="truncate">{selectedDoc?.fileName || "Documento"}</span>
            </h2>
          </div>
          <div className="flex-1 w-full relative bg-muted/20 overflow-hidden">
            {selectedDoc?.url && <PdfViewer url={selectedDoc.url} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Saída do Grupo */}
      <AlertDialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja sair do grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você não receberá mais notificações nem verá novas mensagens de{" "}
              <strong>#{channel.name}</strong> a menos que seja adicionado novamente por um administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await onLeaveChannel?.(channel.id);
                setConfirmLeaveOpen(false);
                onClose?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, sair do grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Remoção de Membro */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro do grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{memberToRemove?.name}</strong> do canal{" "}
              <strong>#{channel.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (memberToRemove) {
                  await onRemoveMember?.(channel.id, memberToRemove.id);
                  setMemberToRemove(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Configurações de Notificação (Igual ao WhatsApp) */}
      <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-card border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Configurações de Notificação
          </DialogTitle>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-muted/30">
              <div className="space-y-0.5 pr-3">
                <span className="text-sm font-medium text-foreground block">
                  Silenciar notificações
                </span>
                <p className="text-xs text-muted-foreground">
                  Nenhum som ou alerta de área de trabalho será emitido para mensagens deste grupo.
                </p>
              </div>
              <Switch
                checked={isMuted}
                onCheckedChange={(checked) => handleToggleMute(checked)}
                disabled={isTogglingMute}
              />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Outros participantes não verão se você silenciou este grupo. Você continuará recebendo notificações se alguém mencionar você com @.
            </p>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setNotifDialogOpen(false)}>
                Concluído
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
