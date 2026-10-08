import React, { memo, useMemo, useState, useEffect } from "react";
import { Users, Phone, Clock, AlertTriangle } from "lucide-react";
import { ContactAvatar } from "./contact-avatar";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/common/channel-icon";
import { getSourceIcon } from "@/lib/use-contact-sources";
import { cn } from "@/lib/utils";
import { formatConversationTime } from "@/lib/format";
import { calculateConversationSla, type SlaSettings } from "@/lib/sla";
import type { ConvRow } from "./conversation-types";

interface ConversationItemProps {
  conv: ConvRow;
  selected: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
  currentUserId?: string;
  showUnitInfo?: boolean;
  slaSettings?: SlaSettings;
}

export const ConversationItem = memo(function ConversationItem({
  conv,
  selected,
  onClick,
  onPrefetch,
  currentUserId,
  showUnitInfo,
  slaSettings,
}: ConversationItemProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!slaSettings?.enabled || conv.status === "resolved") return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [slaSettings?.enabled, conv.status]);

  const isGroup =
    conv.contact?.phone &&
    (conv.contact.phone.startsWith("120363") ||
      (conv.contact.phone.includes("-") && conv.contact.phone.length > 18));
  const contactName =
    isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;
  const slaInfo = calculateConversationSla(conv, slaSettings);

  const previewDisplay = useMemo(() => {
    if (!conv.last_message_preview) return null;
    const raw = conv.last_message_preview.trim();
    const sigMatch = raw.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    const text = sigMatch ? sigMatch[2] : raw;
    const lastMsg = conv.last_message?.find((m) => !m.is_internal) || conv.last_message?.[0];
    const isFromAgent = (lastMsg && lastMsg.sender_type === "agent") || !!sigMatch;
    return { text, isFromAgent };
  }, [conv.last_message_preview, conv.last_message]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onTouchStart={onPrefetch}
      className={cn(
        "flex w-full max-w-full overflow-hidden items-start gap-3 border-b border-border pl-3 pr-4 py-3 text-left transition-colors hover:bg-accent/40",
        selected && "bg-accent/60",
        slaInfo.status === "breached" && "border-l-4 border-l-destructive bg-destructive/[0.02]",
        slaInfo.status === "warning" && "border-l-2 border-l-amber-500/70",
      )}
    >
      <div className="relative shrink-0">
        <ContactAvatar
          url={conv.contact?.avatar_url}
          name={contactName}
          isGroup={!!isGroup}
          className="h-10 w-10 shrink-0"
        />
        <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center">
          <ChannelIcon
            channel={conv.channel}
            className="h-4 w-4 rounded-full ring-2 ring-card shadow-xs"
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 grid">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "truncate text-sm font-medium flex-1 min-w-0",
              conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground",
            )}
          >
            {contactName}
          </span>
          {slaInfo.isWaiting && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 transition-colors shadow-xs",
                slaInfo.status === "breached" &&
                  "bg-destructive/15 text-destructive border-destructive/30 animate-pulse font-bold",
                slaInfo.status === "warning" &&
                  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                slaInfo.status === "ok" &&
                  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
              )}
              title={slaInfo.tooltipText}
            >
              {slaInfo.status === "breached" ? (
                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              ) : (
                <Clock className="h-2.5 w-2.5 shrink-0" />
              )}
              <span>{slaInfo.badgeLabel}</span>
            </span>
          )}
          <span
            className={cn(
              "whitespace-nowrap shrink-0 text-[11px]",
              conv.unread_count && conv.unread_count > 0
                ? "font-bold text-success"
                : "text-muted-foreground",
            )}
            title={
              conv.last_message_at
                ? new Date(conv.last_message_at).toLocaleString("pt-BR")
                : undefined
            }
          >
            {formatConversationTime(conv.last_message_at)}
          </span>
        </div>
        {previewDisplay && (
          <div
            className={cn(
              "mt-0.5 truncate text-xs flex items-center gap-1",
              conv.unread_count && conv.unread_count > 0
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {previewDisplay.isFromAgent && (
              <span className="shrink-0 font-normal text-muted-foreground/80">Você:</span>
            )}
            <span className="truncate">{previewDisplay.text}</span>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showUnitInfo && conv.unit?.name ? (
            <div
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50"
              style={{
                backgroundColor: conv.unit.color ? `${conv.unit.color}20` : "var(--muted)",
                color: conv.unit.color || "var(--muted-foreground)",
                borderColor: conv.unit.color ? `${conv.unit.color}40` : "var(--border)",
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: conv.unit.color || "var(--muted-foreground)" }}
              />
              <span className="font-medium">{conv.unit.name}</span>
              {conv.whatsapp_instance?.name && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="truncate">{conv.whatsapp_instance.name}</span>
                </>
              )}
            </div>
          ) : conv.whatsapp_instance?.name ? (
            <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50 bg-muted/50 text-muted-foreground">
              <Phone className="h-2 w-2 opacity-70" />
              <span className="truncate">{conv.whatsapp_instance.name}</span>
            </div>
          ) : null}
          {conv.contact?.source && (
            <div
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-[130px] truncate border border-border/50 bg-muted/40 text-muted-foreground"
              title={
                conv.contact.source_details
                  ? `Origem: ${conv.contact.source} • ${conv.contact.source_details}`
                  : `Origem: ${conv.contact.source}`
              }
            >
              {getSourceIcon(conv.contact.source, "h-2.5 w-2.5 shrink-0")}
              <span className="truncate font-medium">{conv.contact.source}</span>
            </div>
          )}
          {conv.department?.name && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {conv.department.name}
            </Badge>
          )}
          {conv.status === "active" &&
            (conv.ai_active || conv.assigned_agent?.name || conv.assigned_agent_id) && (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/30"
              >
                {conv.ai_active
                  ? `🤖 ${conv.ai_agent?.name || "IA"}`
                  : conv.assigned_agent?.name ||
                    (conv.assigned_agent_id === currentUserId ? "Você" : "Atendente")}
              </Badge>
            )}
          {conv.status === "waiting" &&
            conv.assigned_agent_id &&
            conv.assigned_agent_id === currentUserId && (
              <Badge
                variant="default"
                className="px-1.5 py-0 text-[10px] font-normal bg-orange-500 hover:bg-orange-600"
              >
                Transferido
              </Badge>
            )}
          {conv.tags?.map((t) => (
            <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {t}
            </Badge>
          ))}
          {conv.unread_count && conv.unread_count > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold text-white shadow-sm">
              {conv.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
});
