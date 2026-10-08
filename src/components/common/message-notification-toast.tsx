import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelIcon } from "@/components/common/channel-icon";
import { initials } from "@/lib/format";
import { ArrowRight, AtSign, MessageSquare, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageNotificationToastProps {
  toastId: string | number;
  type: "client" | "team";
  senderName: string;
  avatarUrl?: string | null;
  channel?: "whatsapp" | "instagram" | "messenger" | "facebook" | null;
  badgeLabel?: string | null;
  previewText: string;
  messages?: string[];
  isMention?: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export function MessageNotificationToast({
  type,
  senderName,
  avatarUrl,
  channel,
  badgeLabel,
  previewText,
  messages,
  isMention = false,
  onOpen,
  onDismiss,
}: MessageNotificationToastProps) {
  const isClient = type === "client";

  return (
    <div
      data-message-notification-toast=""
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className={cn(
        "relative w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-3.5 shadow-2xl transition-all duration-200 cursor-pointer text-left select-none",
        "bg-card/95 backdrop-blur-md border border-border/80 dark:border-border/60",
        "hover:border-primary/50 hover:shadow-primary/5 hover:translate-y-[-1px] active:translate-y-[0px]",
        "group"
      )}
    >
      {/* Barra de Acento Superior */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1",
          isMention
            ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500"
            : isClient
            ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500"
            : "bg-gradient-to-r from-primary via-indigo-400 to-primary"
        )}
      />

      <div className="flex items-start gap-3">
        {/* Avatar com Mini-Badge */}
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10 border border-border/60 shadow-xs">
            <AvatarImage src={avatarUrl || ""} alt={senderName} className="object-cover" />
            <AvatarFallback
              className={cn(
                "text-xs font-bold text-white",
                isClient
                  ? "bg-gradient-to-br from-emerald-600 to-teal-700"
                  : "bg-gradient-to-br from-primary to-indigo-600"
              )}
            >
              {initials(senderName)}
            </AvatarFallback>
          </Avatar>

          {/* Badge do Canal acoplado ao Avatar */}
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full ring-2 ring-card shadow-xs">
            {isClient && channel ? (
              <ChannelIcon channel={channel} className="h-4 w-4 rounded-full" />
            ) : isMention ? (
              <span className="h-4 w-4 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center">
                <AtSign className="h-2.5 w-2.5" />
              </span>
            ) : (
              <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Users className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        </div>

        {/* Informações Centrais */}
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-semibold text-xs text-foreground truncate max-w-[180px]">
              {senderName}
            </h4>

            {isMention ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <AtSign className="h-2 w-2" />
                Mencionou você
              </span>
            ) : badgeLabel ? (
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border",
                  isClient
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                    : "bg-primary/10 text-primary border-primary/20"
                )}
              >
                {badgeLabel}
              </span>
            ) : null}
          </div>

          {/* Última mensagem + contador das anteriores */}
          <p className="text-xs text-muted-foreground/90 line-clamp-2 mt-1 leading-relaxed break-words font-normal">
            {messages && messages.length > 0 ? messages[messages.length - 1] : previewText}
          </p>
          {messages && messages.length > 1 && (
            <p className="mt-1 text-[10px] font-medium text-muted-foreground/70">
              +{messages.length - 1} {messages.length - 1 === 1 ? "mensagem anterior" : "mensagens anteriores"}
            </p>
          )}
        </div>

        {/* Botão de Fechar */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          title="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Rodapé do Card */}
      <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
          {isClient ? (
            <>
              <MessageSquare className="h-3 w-3 text-emerald-500" />
              <span>Novo atendimento</span>
            </>
          ) : (
            <>
              <Users className="h-3 w-3 text-primary" />
              <span>Chat da equipe</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
          <span>Abrir conversa</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}
