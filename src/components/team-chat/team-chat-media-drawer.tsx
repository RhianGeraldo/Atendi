import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  FileText,
  Image as ImageIcon,
  Mic,
  Download,
  FolderOpen,
} from "lucide-react";
import { InternalChannel, InternalMessage } from "./team-chat-types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TeamChatMediaDrawerProps {
  channel: InternalChannel;
  messages: InternalMessage[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (messageId: string) => void;
}

export function TeamChatMediaDrawer({
  channel,
  messages,
  isOpen,
  onClose,
  onSelectMessage,
}: TeamChatMediaDrawerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Filtra itens de mídia ativos (não apagados)
  const images = messages.filter(
    (m) => !m.is_deleted && m.media_type === "image" && m.media_url
  );
  const docs = messages.filter(
    (m) => !m.is_deleted && m.media_type === "document" && m.media_url
  );
  const audios = messages.filter(
    (m) => !m.is_deleted && m.media_type === "audio" && m.media_url
  );

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const channelTitle =
    channel.name || (channel.type === "direct" ? channel.other_user?.name || "Conversa" : "Canal");

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full bg-background">
          <SheetHeader className="p-4 border-b border-border text-left">
            <SheetTitle className="text-base font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span>Arquivos & Mídias</span>
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground truncate">
              Compartilhados em #{channelTitle}
            </SheetDescription>
          </SheetHeader>

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
                        <span className="font-semibold truncate">{img.sender?.name || "Colega"}</span>
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
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
                      asChild
                    >
                      <a href={doc.media_url!} target="_blank" rel="noreferrer" download>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
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
                    <audio
                      src={audio.media_url!}
                      controls
                      className="w-full h-8 rounded-md"
                    />
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Visualização de imagem em tela cheia */}
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
    </>
  );
}
