import React, { useState, useEffect } from "react";
import { 
  CornerUpLeft, 
  Pencil, 
  Trash2, 
  SmilePlus, 
  FileText, 
  Sparkles, 
  PhoneMissed, 
  PhoneIncoming, 
  PhoneOutgoing, 
  MapPin, 
  User, 
  MessageSquarePlus, 
  List, 
  Video, 
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LinkPreview } from "@/components/chat/link-preview";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import type { MessageRow } from "./conversation-types";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const openMediaInNewTab = (mediaUrl: string) => {
  if (!mediaUrl) return;
  
  if (mediaUrl.startsWith("data:")) {
    try {
      const [header, base64] = mediaUrl.split(",");
      const mimeString = header.split(":")[1].split(";")[0];
      
      const byteCharacters = atob(base64);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      console.error("Failed to open data URI in new tab", e);
      window.open(mediaUrl, "_blank");
    }
  } else {
    window.open(mediaUrl, "_blank");
  }
};

export function FormattedText({ text, mine }: { text: string; mine?: boolean }) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*|_{1}[^_]+_{1}|~[^~]+~|https?:\/\/[^\s]+)/g);
  
  const firstUrlMatch = text.match(/https?:\/\/[^\s]+/);
  let firstUrl = firstUrlMatch ? firstUrlMatch[0] : null;
  if (firstUrl) {
    firstUrl = firstUrl.replace(/[*_~.)\]>]+$/, "");
  }

  return (
    <div className="whitespace-pre-wrap break-words flex flex-col gap-1">
      {firstUrl && <LinkPreview url={firstUrl} mine={mine} />}
      <div>
        {parts.map((part, i) => {
          if (part.startsWith("*") && part.endsWith("*")) return <strong key={i}>{part.slice(1, -1)}</strong>;
          if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>;
          if (part.startsWith("~") && part.endsWith("~")) return <del key={i}>{part.slice(1, -1)}</del>;
          if (part.match(/^https?:\/\//)) {
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 font-medium opacity-90 hover:opacity-100">
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    </div>
  );
}

export function PdfViewer({ url }: { url: string }) {
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    if (!url) return;
    if (url.startsWith("data:")) {
      try {
        const [header, base64] = url.split(",");
        const mimeString = header.split(":")[1].split(";")[0];
        
        const byteCharacters = atob(base64);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
          const slice = byteCharacters.slice(offset, offset + 512);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          byteArrays.push(byteArray);
        }
        
        const blob = new Blob(byteArrays, { type: mimeString });
        const newUrl = URL.createObjectURL(blob);
        setBlobUrl(newUrl);
        return () => URL.revokeObjectURL(newUrl);
      } catch (e) {
        console.error("Failed to parse data URI", e);
        setBlobUrl(url);
      }
    } else {
      setBlobUrl(url);
    }
  }, [url]);

  if (!blobUrl) return <div className="flex items-center justify-center h-full p-10 text-muted-foreground">Carregando PDF...</div>;

  return <iframe src={blobUrl} className="w-full h-full rounded-md border-0 min-h-[70vh]" title="PDF Viewer" />;
}

export function SystemMessageBubble({ m }: { m: MessageRow }) {
  const SYSTEM_LABELS: Record<string, string> = {
    "SYSTEM_FOLLOW_UP_1": "🤖 IA enviou follow-up automático (1º aviso)",
    "SYSTEM_FOLLOW_UP_2": "🤖 IA enviou follow-up automático (2º aviso)",
    "SYSTEM_RESOLVE_INACTIVE": "🤖 IA encerrou por inatividade do cliente",
  };
  const rawContent = m.content || "";
  const matchedKey = Object.keys(SYSTEM_LABELS).find((k) => rawContent.includes(k));
  const displayContent = matchedKey ? SYSTEM_LABELS[matchedKey] : rawContent;
  return (
    <div className="flex justify-center my-4 w-full">
      <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs px-4 py-1.5 rounded-full text-center border border-amber-200 dark:border-amber-800/50 font-medium">
        {displayContent}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  m: MessageRow;
  isGroup?: boolean;
  onReact?: (emoji: string) => void;
  onReply?: (m: MessageRow) => void;
  onEdit?: (m: MessageRow) => void;
  onDelete?: (m: MessageRow) => void;
  onTranscribe?: (id: string) => void;
  isTranscribingId?: string | null;
}

export function MessageBubble({ 
  m, 
  isGroup, 
  onReact, 
  onReply, 
  onEdit, 
  onDelete, 
  onTranscribe, 
  isTranscribingId 
}: MessageBubbleProps) {
  const [showMobileActions, setShowMobileActions] = useState(false);

  if (m.sender_type === "system") {
    return <SystemMessageBubble m={m} />;
  }

  const mine = m.sender_type === "agent";
  const isInternal = m.is_internal;
  
  let senderName = null;
  let displayContent = m.content || "";

  if (isGroup && m.sender_type === "contact") {
    const match = displayContent.match(/^(.+?):\n([\s\S]*)$/);
    if (match) {
      senderName = match[1];
      displayContent = match[2];
    }
  } else if (mine) {
    if (m.profiles?.name) {
      senderName = m.profiles.name;
    } else if (m.metadata?.ai_agent_name) {
      senderName = m.metadata.ai_agent_name;
    }
    
    const hasSignature = displayContent.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      displayContent = hasSignature[2];
      if (!senderName) {
        senderName = hasSignature[1];
      }
    }
  }

  const adReply = m.metadata?.externalAdReply;

  return (
    <div className={cn("flex relative", mine ? "justify-end" : "justify-start")} id={`msg-${m.id}`}>
      <div
        tabIndex={-1}
        onClick={() => setShowMobileActions(!showMobileActions)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setShowMobileActions(false);
          }
        }}
        className={cn(
          "max-w-[70%] flex flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group cursor-pointer lg:cursor-default",
          mine
            ? (isInternal ? "rounded-br-sm bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50" : "rounded-br-sm bg-primary text-primary-foreground")
            : "rounded-bl-sm bg-card text-foreground border border-border",
          m.is_deleted && "opacity-60",
          m.isOptimistic && "opacity-70"
        )}
      >
        {isInternal && (
          <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <FileText className="h-3 w-3" />
            Nota Interna
          </div>
        )}
        {senderName && (
          <div className={cn(
            "mb-1 text-xs font-bold",
            mine ? (isInternal ? "text-amber-700 dark:text-amber-300" : "text-primary-foreground/90") : "text-primary/80 dark:text-primary/90"
          )}>
            {senderName}
          </div>
        )}
        {onReact && !m.isOptimistic && !m.is_deleted && (
          <div className={cn(
            "absolute top-1 transition-opacity flex items-center gap-1 p-0.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground z-10",
            showMobileActions ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            mine ? "-left-20" : "-right-20"
          )}>
            {onReply && (
              <button 
                onClick={() => onReply(m)}
                className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors"
                title="Responder"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {onEdit && mine && m.media_type === "text" && (m.remote_msg_id || m.is_internal) && (
              <button 
                onClick={() => onEdit(m)}
                className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && mine && (m.remote_msg_id || m.is_internal) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button 
                    className="hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-full transition-colors"
                    title="Apagar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar Mensagem</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.is_internal
                        ? "Deseja realmente apagar esta nota interna?"
                        : "Deseja realmente apagar esta mensagem para todos? Esta ação não pode ser desfeita e a mensagem será removida do WhatsApp do cliente."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(m)} className="bg-red-500 hover:bg-red-600">
                      {m.is_internal ? "Apagar nota" : "Apagar para todos"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors" title="Reagir">
                  <SmilePlus className="h-3.5 w-3.5" />
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
          </div>
        )}

        {m.quoted_content && !m.is_deleted && (
          <div 
            className="mb-2 rounded bg-black/10 dark:bg-white/10 p-2 text-xs border-l-4 opacity-90 border-l-current cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => {
              if (m.quoted_message_id) {
                const el = document.getElementById(`msg-${m.quoted_message_id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-primary/20', 'transition-colors', 'duration-500');
                  setTimeout(() => el.classList.remove('bg-primary/20', 'transition-colors', 'duration-500'), 2000);
                }
              }
            }}
          >
            <span className="font-semibold flex items-center gap-1 mb-0.5 text-[10px] uppercase opacity-70">
              <CornerUpLeft className="h-3 w-3" />
              Mensagem Respondida
            </span>
            <span className="line-clamp-3 opacity-90">{m.quoted_content}</span>
          </div>
        )}

        {adReply && !m.is_deleted && (() => {
          const adThumb = adReply.thumbnailURL || 
                          adReply.thumbnailUrl || 
                          adReply.originalImageURL || 
                          adReply.originalImageUrl || 
                          (adReply.jpegThumbnail ? (adReply.jpegThumbnail.startsWith('data:') ? adReply.jpegThumbnail : `data:image/jpeg;base64,${adReply.jpegThumbnail}`) : null) ||
                          (adReply.thumbnail ? (adReply.thumbnail.startsWith('http') || adReply.thumbnail.startsWith('data:') ? adReply.thumbnail : `data:image/jpeg;base64,${adReply.thumbnail}`) : null);

          return (
            <div className="mb-2 w-full max-w-sm rounded-lg border border-border/60 bg-black/5 dark:bg-white/5 overflow-hidden">
              {adThumb ? (
                <a href={adReply.sourceURL || adReply.sourceUrl || '#'} target="_blank" rel="noopener noreferrer" className="block relative h-40 w-full bg-black/10 dark:bg-white/5 overflow-hidden flex items-center justify-center group/ad">
                  <div 
                    className="absolute inset-0 w-full h-full bg-cover bg-center blur-sm opacity-40 scale-110 transition-transform group-hover/ad:scale-125" 
                    style={{ backgroundImage: `url(${adThumb})` }} 
                  />
                  <img 
                    src={adThumb} 
                    alt="Ad Thumbnail" 
                    className="relative z-10 w-full h-full object-contain drop-shadow-md transition-transform group-hover/ad:scale-105" 
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute top-2 left-2 z-20 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                    <span>Anúncio</span>
                    {(adReply.sourceApp || adReply.source_app) && (
                      <span className="capitalize opacity-80">• {adReply.sourceApp || adReply.source_app}</span>
                    )}
                  </div>
                </a>
              ) : (
                <div className="bg-black/60 text-white text-[10px] font-bold px-2 py-1 flex justify-between items-center w-full">
                  <span>Anúncio</span>
                  {(adReply.sourceApp || adReply.source_app) && <span className="capitalize">{adReply.sourceApp || adReply.source_app}</span>}
                </div>
              )}
              <div className="p-2.5">
                <h4 className="font-bold text-xs truncate mb-1">{adReply.title || "Anúncio do Meta"}</h4>
                {adReply.body && (
                  <p className="text-[11px] opacity-80 line-clamp-3 whitespace-pre-wrap">{adReply.body}</p>
                )}
              </div>
            </div>
          );
        })()}

        {m.media_type === "image" && m.media_url ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" 
                />
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-6 flex flex-col items-center justify-center">
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-h-[75vh] w-auto rounded-md object-contain shadow-sm" 
                />
              </DialogContent>
            </Dialog>
            {displayContent && displayContent !== "📷 Imagem" && displayContent !== "🖼️ Figurinha" && (
              <div className="mt-2"><FormattedText text={displayContent} mine={mine} /></div>
            )}
          </div>
        ) : m.media_type === "audio" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <audio controls src={m.media_url} className="h-12 w-[260px]" />
            {m.transcription ? (
              <div className="mt-1 pt-1 border-t border-border/50 text-xs italic flex flex-col gap-0.5 w-[260px] opacity-90">
                <span className="flex items-center gap-1 font-semibold text-[10px] text-primary">
                  <Sparkles className="h-3 w-3" /> Transcrição Automática
                </span>
                <span className="whitespace-pre-wrap leading-tight">{m.transcription}</span>
              </div>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-1 h-6 text-[10px] w-[260px] border border-border/50 bg-background/50 text-muted-foreground hover:text-primary"
                onClick={() => onTranscribe?.(m.id)}
                disabled={isTranscribingId === m.id}
              >
                {isTranscribingId === m.id ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                Transcrever Áudio
              </Button>
            )}
            {displayContent && displayContent !== "🎵 Áudio" && <div className="text-xs"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.media_type === "video" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            {(m.metadata as any)?.is_ptv ? (
              <div className="relative w-56 h-56 mx-auto overflow-hidden rounded-full border-4 border-primary/20 shadow-md">
                {m.media_url.startsWith("data:image/") ? (
                  <img src={m.media_url} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <video 
                    controls 
                    src={m.media_url} 
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                )}
              </div>
            ) : (
              m.media_url.startsWith("data:image/") ? (
                <div className="relative max-w-[200px]">
                  <img src={m.media_url} className="rounded-lg w-full h-auto" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                    <Video className="w-8 h-8 text-white opacity-80" />
                  </div>
                </div>
              ) : (
                <video controls src={m.media_url} className="max-w-[200px] rounded-lg" />
              )
            )}
            {displayContent && displayContent !== "🎥 Vídeo" && displayContent !== "🎥 Vídeo Instantâneo" && (
              <div className="text-xs"><FormattedText text={displayContent} mine={mine} /></div>
            )}
          </div>
        ) : m.media_type === "document" ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border max-w-[260px] transition-opacity",
                    m.media_url ? "hover:opacity-90 cursor-pointer" : "cursor-default opacity-90",
                    mine ? "bg-black/10 dark:bg-white/10 border-transparent" : "bg-muted/80 border-border"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-500 text-white shadow-sm">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="truncate text-sm font-semibold leading-tight">{displayContent || "Documento"}</p>
                    <p className={cn("mt-1 truncate text-[10px] font-medium uppercase opacity-70")}>
                      {m.media_url ? "Documento PDF" : "Documento (sem arquivo)"}
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              {m.media_url && (
                <DialogContent className="max-w-4xl p-0 bg-white dark:bg-zinc-900 border-none shadow-xl flex flex-col h-[85vh]">
                  <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-sm font-semibold truncate pr-4 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-red-500" />
                      {displayContent || "Documento.pdf"}
                    </h2>
                    <a 
                      href={m.media_url} 
                      download={displayContent || "Documento.pdf"}
                      className="text-sm text-blue-500 hover:underline px-4 font-medium"
                    >
                      Baixar
                    </a>
                  </div>
                  <div className="flex-1 w-full relative bg-muted/30">
                    <PdfViewer url={m.media_url} />
                  </div>
                </DialogContent>
              )}
            </Dialog>
          </div>
        ) : m.metadata?.type === "call" ? (
          <div className="mb-1 flex flex-col gap-1 w-full max-w-[280px]">
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border w-full",
                mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-card text-foreground"
              )}
            >
              <div 
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm",
                  m.metadata.status === "missed" && m.metadata.direction === "incoming" 
                    ? "bg-red-500/10 text-red-500" 
                    : mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                )}
              >
                {m.metadata.direction === "incoming" ? (
                  m.metadata.status === "missed" ? (
                    <PhoneMissed className="h-5 w-5" />
                  ) : (
                    <PhoneIncoming className="h-5 w-5" />
                  )
                ) : (
                  <PhoneOutgoing className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-left">
                  {m.metadata.direction === "incoming" 
                    ? (m.metadata.status === "missed" ? "Ligação de voz perdida" : "Ligação de voz")
                    : (m.metadata.status === "missed" ? "Ligação de voz não atendida" : "Ligação de voz")
                  }
                </p>
                <p className={cn("mt-1 text-[11px] opacity-75 font-normal leading-none text-left")}>
                  {m.metadata.status === "completed" && m.metadata.duration !== undefined && m.metadata.duration !== null ? (
                    `Duração: ${(() => {
                      const secs = Number(m.metadata.duration);
                      const min = Math.floor(secs / 60);
                      const sec = secs % 60;
                      return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
                    })()}`
                  ) : (
                    "Retorne as ligações no seu celular"
                  )}
                </p>
              </div>
            </div>

            {(m.media_url || m.metadata.recording_url) && (
              <div className={cn(
                "p-2.5 rounded-lg border mt-1 flex flex-col gap-1.5 w-full",
                mine ? "border-transparent bg-black/10 dark:bg-white/10" : "border-border bg-muted/30"
              )}>
                <audio 
                  controls 
                  src={m.media_url || m.metadata.recording_url} 
                  className="h-9 w-full max-w-[260px] scale-95 origin-left" 
                />
                
                {m.transcription ? (
                  <div className="mt-1.5 pt-1.5 border-t border-border/50 text-xs italic flex flex-col gap-1 opacity-95 text-left w-full">
                    <span className="flex items-center gap-1 font-semibold text-[10px] text-primary">
                      <Sparkles className="h-3 w-3" /> Transcrição Automática
                    </span>
                    <span className="whitespace-pre-wrap leading-tight text-[11px] font-medium">{m.transcription}</span>
                  </div>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] w-full border border-border/40 bg-background/40 hover:bg-background/80 text-muted-foreground hover:text-primary mt-1"
                    onClick={() => onTranscribe?.(m.id)}
                    disabled={isTranscribingId === m.id}
                  >
                    {isTranscribingId === m.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    Transcrever Gravação
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : m.metadata?.location ? (
          <div className="mb-1">
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${m.metadata.location.lat},${m.metadata.location.lng}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "mt-1 flex flex-col overflow-hidden rounded-md border transition-opacity hover:opacity-90 group w-full sm:w-[350px]",
                mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border/50 bg-card/50 text-foreground"
              )}
            >
              {m.metadata.location.thumbnail && (
                <div className="h-40 w-full overflow-hidden bg-black/5">
                  <img src={`data:image/jpeg;base64,${m.metadata.location.thumbnail}`} alt="Mapa" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </div>
              )}
              <div className="flex flex-col p-3 text-left">
                <span className="font-semibold text-sm mb-1 truncate">{m.metadata.location.name || "Localização"}</span>
                <span className={cn(
                  "text-xs mb-2 truncate opacity-90",
                  mine ? "text-white/80" : "text-muted-foreground"
                )}>{m.metadata.location.address || "Ver no mapa"}</span>
                
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] opacity-70 mt-1",
                  mine ? "text-white/70" : "text-muted-foreground"
                )}>
                  <MapPin className="h-3 w-3" />
                  <span>Google Maps</span>
                </div>
              </div>
            </a>
            {displayContent && displayContent !== "📍 Localização recebida" && <div className="text-xs mt-2"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.metadata?.contacts ? (
          <div className="mb-1 flex flex-col gap-2">
            {m.metadata.contacts.map((contact: any, i: number) => (
              <div 
                key={i}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border max-w-[260px]",
                  mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-background text-foreground"
                )}
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm overflow-hidden", mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}>
                  {contact.photo ? (
                    <img src={`data:image/jpeg;base64,${contact.photo}`} alt={contact.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="font-semibold text-[13px] leading-tight truncate">{contact.name || "Contato"}</span>
                  {(contact.phone || contact.waid) && (
                    <div className="flex flex-col items-start gap-1.5 mt-0.5">
                      <a 
                        href={`https://wa.me/${contact.waid || (contact.phone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer" 
                        className="text-[11px] opacity-70 truncate hover:underline"
                      >
                        {contact.phone || contact.waid}
                      </a>
                      <StartConversationDialog 
                        initialPhone={contact.waid || (contact.phone || '').replace(/\D/g, '')}
                        contactName={contact.name || ""}
                        trigger={
                          <Button size="sm" variant="secondary" className={cn("h-6 text-[10px] px-2 w-fit", mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-primary/10 text-primary hover:bg-primary/20")}>
                            <MessageSquarePlus className="h-3 w-3 mr-1.5" />
                            Iniciar Conversa
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {displayContent && displayContent !== "👤 Contato(s) recebido(s)" && <div className="text-xs mt-1"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.metadata?.poll ? (
          <div className="mb-1 flex flex-col gap-2">
            <div className={cn(
              "p-3 rounded-lg border min-w-[200px] max-w-[280px]",
              mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-background text-foreground"
            )}>
              <div className="flex items-start gap-2.5 mb-3 pb-3 border-b border-border/20">
                <div className={cn("p-1.5 rounded-full shrink-0", mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}>
                  <List className="h-4 w-4" />
                </div>
                <span className="font-semibold text-[13px] leading-snug break-words mt-0.5">{m.metadata.poll.name}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {m.metadata.poll.options?.map((opt: string, i: number) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-[13px] border transition-colors",
                    mine ? "bg-black/20 border-white/10 hover:bg-black/30" : "bg-muted/50 border-border/50 hover:bg-muted"
                  )}>
                    <div className="h-3.5 w-3.5 rounded-full border border-current opacity-40 shrink-0" />
                    <span className="truncate opacity-90">{opt}</span>
                  </div>
                ))}
              </div>
            </div>
            {displayContent && !displayContent.startsWith("📊 Enquete:") && <div className="text-xs mt-1"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : (
          <FormattedText text={displayContent} mine={mine} />
        )}

        {m.is_deleted && (
          <div className={cn(
            "mt-1.5 pt-1.5 border-t text-xs flex items-center gap-1.5 italic opacity-80",
            mine ? "border-primary-foreground/20" : "border-border"
          )}>
            <span className="text-[14px]">🚫</span>
            Mensagem apagada
          </div>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
            mine ? (isInternal ? "text-amber-700/70 dark:text-amber-300/70" : "text-primary-foreground/70") : "text-muted-foreground",
          )}
        >
          {m.is_edited && <span className="italic">Editado</span>}
          <span>{formatMessageTime(m.created_at)}</span>
        </div>
        
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (onReact) {
                const firstEmoji = Object.keys(m.reactions!)[0];
                onReact(firstEmoji);
              }
            }}
            className="absolute -bottom-3 right-2 flex gap-1 bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-sm cursor-pointer hover:bg-accent transition-colors"
            title="Clique para remover reação"
          >
            {Object.entries(m.reactions).map(([emoji, count]) => (
              <span key={emoji}>{emoji} {count > 1 ? count : ''}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
