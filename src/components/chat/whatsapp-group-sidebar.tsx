import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ContactAvatar } from "./contact-avatar";
import { StartConversationDialog } from "./start-conversation-dialog";
import {
  getWhatsAppGroupDetailsAction,
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
              toast.info("Atualizando participantes...");
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
        {/* Card Principal do Grupo */}
        <div className="bg-card border border-border/60 rounded-xl p-4 shadow-xs space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <ContactAvatar
                url={groupDetails?.avatarUrl || conv.contact?.avatar_url}
                name={groupName}
                isGroup={true}
                className="h-14 w-14 ring-2 ring-background shadow-md"
                fallbackClassName="text-xl font-medium"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base text-foreground truncate" title={groupName}>
                {groupName}
              </h3>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                Grupo do WhatsApp · {groupDetails?.participantCount || participants.length || 0}{" "}
                participantes
              </p>
              {groupDetails?.isAnnounce && (
                <Badge
                  variant="outline"
                  className="mt-1 text-[10px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 font-medium"
                >
                  Somente administradores enviam
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Descrição / Tópico do Grupo */}
        {groupDetails?.topic ? (
          <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-1 shrink-0">
            <span className="text-[11px] text-muted-foreground font-medium block">
              Descrição do grupo
            </span>
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
              {groupDetails.topic}
            </p>
          </div>
        ) : null}

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
                            <span className="italic">Sem número</span>
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
