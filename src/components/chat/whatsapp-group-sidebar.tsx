import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Users,
  Search,
  MessageSquarePlus,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  X,
  Phone,
  Shield,
  Crown,
  AlertCircle,
  Lock,
  Pencil,
  Check,
  Loader2,
  Info,
  Maximize2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ContactAvatar } from "./contact-avatar";
import { StartConversationDialog } from "./start-conversation-dialog";
import {
  getWhatsAppGroupDetailsAction,
  updateWhatsAppGroupNameAction,
  updateWhatsAppGroupDescriptionAction,
  syncWhatsAppGroupPhotoAction,
  type WhatsAppGroupParticipant,
} from "@/lib/api/chat.functions";
import { ConvRow } from "./conversation-types";
import { initials, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WhatsAppGroupSidebarProps {
  conv: ConvRow;
  onClose?: () => void;
}

export function WhatsAppGroupSidebar({ conv, onClose }: WhatsAppGroupSidebarProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCallParticipant, setActiveCallParticipant] = useState<WhatsAppGroupParticipant | null>(
    null,
  );

  // Estados de edição de Nome e Descrição
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);

  const {
    data: groupDetails,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["whatsapp-group-details", conv.id],
    queryFn: async () => {
      const res = await getWhatsAppGroupDetailsAction({
        data: { conversationId: conv.id },
      });
      return res;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const groupName =
    groupDetails?.name ||
    (conv.contact?.name !== "Desconhecido" ? conv.contact?.name : "") ||
    "Grupo do WhatsApp";

  useEffect(() => {
    if (groupDetails?.name) {
      setEditNameValue(groupDetails.name);
    }
  }, [groupDetails?.name]);

  useEffect(() => {
    if (groupDetails?.topic !== undefined) {
      setEditDescValue(groupDetails.topic || "");
    }
  }, [groupDetails?.topic]);

  // Mutação para atualizar nome do grupo no WhatsApp
  const updateGroupName = useMutation({
    mutationFn: async (newName: string) => {
      return await updateWhatsAppGroupNameAction({
        data: {
          conversationId: conv.id,
          name: newName.trim(),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Nome do grupo atualizado no WhatsApp!");
      setIsEditingName(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-group-details", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["direct-conversation", conv.id] });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("admin") ||
        msg.toLowerCase().includes("forbidden") ||
        msg.toLowerCase().includes("permission")
      ) {
        toast.error("Apenas administradores do grupo no WhatsApp podem alterar o nome.");
      } else {
        toast.error(msg || "Erro ao atualizar nome do grupo.");
      }
    },
  });

  // Mutação para atualizar descrição do grupo no WhatsApp
  const updateGroupDesc = useMutation({
    mutationFn: async (newDesc: string) => {
      return await updateWhatsAppGroupDescriptionAction({
        data: {
          conversationId: conv.id,
          description: newDesc,
        },
      });
    },
    onSuccess: () => {
      toast.success("Descrição do grupo atualizada no WhatsApp!");
      setIsEditingDesc(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-group-details", conv.id] });
      qc.invalidateQueries({ queryKey: ["direct-conversation", conv.id] });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("admin") ||
        msg.toLowerCase().includes("forbidden") ||
        msg.toLowerCase().includes("permission")
      ) {
        toast.error("Apenas administradores do grupo no WhatsApp podem alterar a descrição.");
      } else {
        toast.error(msg || "Erro ao atualizar descrição do grupo.");
      }
    },
  });

  // Mutação para sincronizar foto do grupo direto do WhatsApp
  const syncGroupPhoto = useMutation({
    mutationFn: async () => {
      return await syncWhatsAppGroupPhotoAction({
        data: { conversationId: conv.id },
      });
    },
    onSuccess: (res) => {
      toast.success("Foto do grupo atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-group-details", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["direct-conversation", conv.id] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao sincronizar foto do grupo.");
    },
  });

  const participants = useMemo(() => {
    return groupDetails?.participants || [];
  }, [groupDetails?.participants]);

  const filteredParticipants = useMemo(() => {
    if (!searchTerm.trim()) return participants;
    const term = searchTerm.toLowerCase().trim();
    return participants.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const pushName = (p.pushName || "").toLowerCase();
      const phone = (p.phone || "").toLowerCase();
      return name.includes(term) || pushName.includes(term) || phone.includes(term);
    });
  }, [participants, searchTerm]);

  const inBaseCount = useMemo(() => {
    return participants.filter((p) => p.inBase).length;
  }, [participants]);

  const avatarUrl = groupDetails?.avatarUrl || conv.contact?.avatar_url;

  return (
    <div className="flex h-full flex-col bg-background/50">
      {/* Header com título e botão de fechar */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-sm md:text-base font-semibold text-foreground truncate">
            Dados do grupo
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => {
              refetch();
              toast.info("Atualizando participantes e dados...");
            }}
            disabled={isLoading || isRefetching}
            title="Atualizar dados do grupo"
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching ? "animate-spin" : "")} />
          </Button>
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClose}
              title="Fechar informações"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-w-0 flex flex-col p-4 space-y-4">
        {/* Card Principal do Grupo (Foto e Nome) */}
        <div className="bg-card border border-border/60 rounded-xl p-4 shadow-xs space-y-3 shrink-0">
          <div className="flex items-start gap-3">
            {/* Foto do grupo com ação de sincronizar e clique para ampliar */}
            <div className="relative shrink-0 group">
              <div
                className={cn(
                  "relative rounded-full cursor-pointer overflow-hidden transition-transform active:scale-95",
                  avatarUrl ? "ring-2 ring-primary/20 hover:ring-primary/40" : "",
                )}
                onClick={() => {
                  if (avatarUrl) setPhotoPreviewOpen(true);
                }}
                title={avatarUrl ? "Clique para ver a imagem ampliada" : undefined}
              >
                <ContactAvatar
                  url={avatarUrl}
                  name={groupName}
                  isGroup={true}
                  className="h-14 w-14 shadow-md"
                  fallbackClassName="text-xl font-medium"
                />
                {avatarUrl && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Maximize2 className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Botão flutuante para sincronizar foto do WhatsApp */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full shadow-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-background/90 hover:bg-background border border-border"
                title="Sincronizar foto do WhatsApp"
                onClick={(e) => {
                  e.stopPropagation();
                  syncGroupPhoto.mutate();
                }}
                disabled={syncGroupPhoto.isPending}
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3 text-muted-foreground",
                    syncGroupPhoto.isPending ? "animate-spin" : "",
                  )}
                />
              </Button>
            </div>

            {/* Nome do grupo e subtítulo */}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <Input
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (editNameValue.trim() && !updateGroupName.isPending) {
                          updateGroupName.mutate(editNameValue);
                        }
                      } else if (e.key === "Escape") {
                        setIsEditingName(false);
                        setEditNameValue(groupName);
                      }
                    }}
                    className="h-8 text-xs bg-background"
                    placeholder="Nome do grupo"
                    autoFocus
                    maxLength={100}
                  />
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 text-[11px] px-2 gap-1"
                      onClick={() => updateGroupName.mutate(editNameValue)}
                      disabled={!editNameValue.trim() || updateGroupName.isPending}
                    >
                      {updateGroupName.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 text-muted-foreground"
                      onClick={() => {
                        setIsEditingName(false);
                        setEditNameValue(groupName);
                      }}
                      disabled={updateGroupName.isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 group/title">
                    <h3
                      className="font-bold text-base text-foreground truncate"
                      title={groupName}
                    >
                      {groupName}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground opacity-0 group-hover/title:opacity-100 hover:text-foreground transition-opacity shrink-0 cursor-pointer"
                      title="Editar nome do grupo no WhatsApp"
                      onClick={() => {
                        setEditNameValue(groupName);
                        setIsEditingName(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    Grupo do WhatsApp · {groupDetails?.participantCount || participants.length || 0}{" "}
                    participantes
                  </p>

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {groupDetails?.isAnnounce && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 font-medium flex items-center gap-0.5"
                      >
                        <Shield className="h-2.5 w-2.5" />
                        Somente administradores enviam
                      </Badge>
                    )}
                    {groupDetails?.isLocked && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 font-medium flex items-center gap-0.5"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Dados restritos a admins
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Descrição / Tópico do Grupo */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-1.5 shrink-0 group/desc">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Info className="h-3 w-3" />
              Descrição do grupo
            </span>
            {!isEditingDesc && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground opacity-0 group-hover/desc:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
                title="Editar descrição do grupo no WhatsApp"
                onClick={() => {
                  setEditDescValue(groupDetails?.topic || "");
                  setIsEditingDesc(true);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>

          {isEditingDesc ? (
            <div className="space-y-2 pt-1 animate-in fade-in duration-150">
              <Textarea
                value={editDescValue}
                onChange={(e) => setEditDescValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingDesc(false);
                    setEditDescValue(groupDetails?.topic || "");
                  }
                }}
                className="text-xs bg-background resize-none min-h-[70px]"
                placeholder="Insira a descrição do grupo..."
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2 text-muted-foreground"
                  onClick={() => setIsEditingDesc(false)}
                  disabled={updateGroupDesc.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1"
                  onClick={() => updateGroupDesc.mutate(editDescValue)}
                  disabled={updateGroupDesc.isPending}
                >
                  {updateGroupDesc.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
              {groupDetails?.topic || (
                <span className="text-muted-foreground/60 italic">
                  Nenhuma descrição adicionada neste grupo.
                </span>
              )}
            </p>
          )}
        </div>

        {/* Bloco de Participantes */}
        <div className="bg-card border border-border/60 rounded-xl shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="p-3.5 border-b border-border/60 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                Participantes ({filteredParticipants.length})
              </span>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground"
                >
                  {inBaseCount} na base
                </Badge>
              </div>
            </div>

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/40 border-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista com Scroll */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0 divide-y divide-border/40">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span>Carregando participantes do WhatsApp...</span>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                <AlertCircle className="h-6 w-6 text-amber-500 mx-auto" />
                <p className="font-medium text-foreground">
                  Não foi possível obter participantes ao vivo.
                </p>
                <p className="text-[11px] leading-relaxed">
                  {(error as any)?.message || "Verifique a conexão da instância do WhatsApp."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                  className="h-7 text-xs mt-1"
                >
                  Tentar novamente
                </Button>
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {searchTerm
                  ? "Nenhum participante encontrado para esta busca."
                  : "Nenhum participante listado no grupo."}
              </div>
            ) : (
              filteredParticipants.map((p, idx) => {
                const displayName =
                  p.name || (p.phone ? formatPhone(p.phone) : "Participante");
                const hasSeparatePushName =
                  p.pushName && p.pushName !== p.name && p.pushName !== displayName;

                return (
                  <div
                    key={p.phone || p.jid || idx}
                    className="flex items-center justify-between gap-2.5 py-2.5 px-2 hover:bg-muted/40 rounded-lg transition-colors group"
                  >
                    {/* Avatar & Nome */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border/60">
                        {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={displayName} />}
                        <AvatarFallback className="text-[10px] font-semibold bg-muted text-foreground">
                          {initials(displayName)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-xs font-medium text-foreground truncate max-w-[140px]"
                            title={displayName}
                          >
                            {displayName}
                          </span>

                          {/* Badge Criador */}
                          {p.isSuperAdmin && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 h-3.5 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 font-medium shrink-0 flex items-center gap-0.5"
                            >
                              <Crown className="h-2.5 w-2.5" />
                              Criador
                            </Badge>
                          )}

                          {/* Badge Admin */}
                          {p.isAdmin && !p.isSuperAdmin && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 h-3.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 font-medium shrink-0 flex items-center gap-0.5"
                            >
                              <Shield className="h-2.5 w-2.5" />
                              Admin
                            </Badge>
                          )}
                        </div>

                        {/* Telefone e pushName */}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate mt-0.5">
                          {p.phone ? (
                            <span className="font-mono">{formatPhone(p.phone)}</span>
                          ) : (
                            <span className="italic">Sem número visível</span>
                          )}

                          {hasSeparatePushName && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[90px]" title={p.pushName || ""}>
                                ~{p.pushName}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Status na base */}
                        <div className="mt-1">
                          {p.inBase ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-3.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Na base
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-3.5 border-border text-muted-foreground/80 font-normal inline-flex items-center gap-1"
                            >
                              <HelpCircle className="h-2.5 w-2.5" />
                              Não cadastrado
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botão de ação Chamar / Conversar */}
                    {p.phone && (
                      <Button
                        size="sm"
                        variant={p.inBase ? "secondary" : "default"}
                        onClick={() => setActiveCallParticipant(p)}
                        className={cn(
                          "h-7 text-xs px-2 gap-1 shrink-0 font-medium",
                          !p.inBase && "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                        title={
                          p.inBase
                            ? `Conversar no privado com ${displayName}`
                            : `Adicionar contato e chamar ${displayName}`
                        }
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        <span>{p.inBase ? "Conversar" : "+ Chamar"}</span>
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Diálogo de visualização da foto do grupo ampliada */}
      {photoPreviewOpen && avatarUrl && (
        <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
          <DialogContent className="max-w-md p-2 bg-background/95 backdrop-blur-sm border-border flex flex-col items-center justify-center">
            <img
              src={avatarUrl}
              alt={groupName}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            <p className="text-xs font-medium text-muted-foreground mt-2">{groupName}</p>
          </DialogContent>
        </Dialog>
      )}

      {/* Diálogo único para iniciar conversa privada com o participante */}
      {activeCallParticipant && (
        <StartConversationDialog
          open={Boolean(activeCallParticipant)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setActiveCallParticipant(null);
          }}
          initialPhone={activeCallParticipant.phone}
          contactName={activeCallParticipant.name || activeCallParticipant.pushName || ""}
          unitId={conv.unit_id}
          onCreated={(newConvId?: string) => {
            setActiveCallParticipant(null);
            qc.invalidateQueries({ queryKey: ["whatsapp-group-details", conv.id] });
            qc.invalidateQueries({ queryKey: ["conversations"] });
            qc.invalidateQueries({ queryKey: ["contacts"] });
            if (newConvId) {
              navigate({ search: (prev: any) => ({ ...prev, c: newConvId, tab: "active" }) });
            }
          }}
        />
      )}
    </div>
  );
}
