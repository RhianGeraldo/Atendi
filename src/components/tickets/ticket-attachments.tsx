import { useState } from "react";
import { FileText, X, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface TicketAttachment {
  name: string;
  url: string;
  size?: number;
  type?: "image" | "pdf" | "document" | string;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function detectFileType(file: File): "image" | "pdf" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "document";
}

export function TicketAttachmentList({
  attachments = [],
  onRemove,
  readOnly = false,
}: {
  attachments: TicketAttachment[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}) {
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {attachments.map((att, idx) => {
          const isImg =
            att.type === "image" ||
            (typeof att.name === "string" && att.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));
          const isPdf =
            att.type === "pdf" ||
            (typeof att.name === "string" && att.name.toLowerCase().endsWith(".pdf"));

          return (
            <div
              key={att.url || idx}
              className="group flex items-center justify-between p-2 rounded-lg border bg-background/80 hover:bg-muted/40 transition-colors text-xs gap-2 min-w-0"
            >
              <div
                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                onClick={() => {
                  if (isImg) {
                    setSelectedPreviewImage(att.url);
                  } else {
                    window.open(att.url, "_blank");
                  }
                }}
              >
                {isImg ? (
                  <div className="h-9 w-9 rounded-md bg-muted border overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={att.url} alt={att.name} className="h-full w-full object-cover" />
                  </div>
                ) : isPdf ? (
                  <div className="h-9 w-9 rounded-md bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 font-bold text-[10px]">
                    PDF
                  </div>
                ) : (
                  <div className="h-9 w-9 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate text-foreground group-hover:text-primary transition-colors">
                    {att.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(att.size) || (isImg ? "Imagem" : isPdf ? "Documento PDF" : "Arquivo")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={att.name}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Abrir / Baixar arquivo"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                {!readOnly && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                    title="Remover anexo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Pré-visualização de Imagem */}
      {selectedPreviewImage && (
        <Dialog open={!!selectedPreviewImage} onOpenChange={() => setSelectedPreviewImage(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-none text-white flex flex-col items-center justify-center">
            <DialogTitle className="sr-only">Visualização de Anexo</DialogTitle>
            <DialogDescription className="sr-only">Visualização de imagem anexada ao ticket</DialogDescription>
            <img
              src={selectedPreviewImage}
              alt="Anexo"
              className="max-h-[85vh] max-w-full rounded-md object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
