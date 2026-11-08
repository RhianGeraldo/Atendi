import React, { useState } from "react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smile, Sticker, Plus, Trash2, Loader2, Upload, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  getCompanyStickersAction,
  createCompanyStickerAction,
  deleteCompanyStickerAction,
  CompanySticker,
} from "@/lib/api/stickers.functions";
import { convertImageToStickerWebp, ConvertedSticker } from "@/lib/sticker-converter";
import { toast } from "sonner";

interface StickersPickerProps {
  companyId: string;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onSelectSticker: (stickerUrl: string, stickerName: string) => void;
  isSendingSticker?: boolean;
}

export function StickersPicker({
  companyId,
  onEmojiClick,
  onSelectSticker,
  isSendingSticker,
}: StickersPickerProps) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = profile?.role === "super_admin";

  const [activeTab, setActiveTab] = useState<"emojis" | "stickers">("emojis");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stickerName, setStickerName] = useState("");
  const [previewSticker, setPreviewSticker] = useState<ConvertedSticker | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Consulta das figurinhas da empresa
  const { data: stickers = [], isLoading: isLoadingStickers } = useQuery({
    queryKey: ["company-stickers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return await getCompanyStickersAction({ data: { companyId } });
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  });

  // Mutação para salvar figurinha (exclusivo super_admin)
  const createStickerMutation = useMutation({
    mutationFn: async (payload: { name: string; imageBase64: string }) => {
      return await createCompanyStickerAction({
        data: {
          companyId,
          name: payload.name,
          imageBase64: payload.imageBase64,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-stickers", companyId] });
      toast.success("Figurinha adicionada com sucesso!");
      handleCloseAddModal();
    },
    onError: (err: Error) => {
      toast.error("Erro ao adicionar figurinha", {
        description: err.message || "Tente novamente mais tarde.",
      });
    },
  });

  // Mutação para excluir figurinha (exclusivo super_admin)
  const deleteStickerMutation = useMutation({
    mutationFn: async (stickerId: string) => {
      return await deleteCompanyStickerAction({
        data: { stickerId, companyId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-stickers", companyId] });
      toast.success("Figurinha removida.");
    },
    onError: (err: Error) => {
      toast.error("Erro ao remover figurinha", {
        description: err.message || "Tente novamente.",
      });
    },
  });

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setStickerName("");
    setPreviewSticker(null);
    setIsProcessingImage(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      if (!stickerName) {
        // Sugere o nome sem a extensão
        const defaultName = file.name.replace(/\.[^/.]+$/, "");
        setStickerName(defaultName);
      }
      const converted = await convertImageToStickerWebp(file);
      setPreviewSticker(converted);
    } catch (err: unknown) {
      toast.error("Erro ao processar imagem", {
        description: err instanceof Error ? err.message : "Verifique o formato da imagem.",
      });
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleSaveSticker = () => {
    if (!previewSticker) {
      toast.warning("Por favor, selecione uma imagem.");
      return;
    }

    createStickerMutation.mutate({
      name: stickerName.trim() || "Figurinha",
      imageBase64: previewSticker.dataUrl,
    });
  };

  return (
    <div className="flex flex-col w-[360px] sm:w-[380px] bg-popover text-popover-foreground rounded-xl overflow-hidden shadow-2xl border border-border">
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "emojis" | "stickers")}
        className="w-full"
      >
        {/* Cabeçalho de Abas Superior */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-border/60 bg-muted/40">
          <TabsList className="h-9 bg-background/80 p-0.5 border border-border/50">
            <TabsTrigger
              value="emojis"
              className="flex items-center gap-1.5 text-xs px-3 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-medium"
            >
              <Smile className="h-4 w-4" />
              <span>Emojis</span>
            </TabsTrigger>
            <TabsTrigger
              value="stickers"
              className="flex items-center gap-1.5 text-xs px-3 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-medium"
            >
              <Sticker className="h-4 w-4" />
              <span>Figurinhas</span>
              {stickers.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-muted text-foreground/80">
                  {stickers.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {activeTab === "stickers" && isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 bg-background hover:bg-accent border-primary/30 text-primary hover:text-primary cursor-pointer shadow-2xs"
              onClick={() => setIsAddModalOpen(true)}
              title="Adicionar nova figurinha (Super Admin)"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova</span>
            </Button>
          )}
        </div>

        {/* Aba 1: Emojis */}
        <TabsContent value="emojis" className="m-0 p-0 focus-visible:outline-none">
          <div className="[&_.epr-main]:border-none [&_.epr-main]:rounded-none [&_.epr-body]:scrollbar-thin">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              width="100%"
              height={380}
              previewConfig={{ showPreview: false }}
              searchPlaceHolder="Buscar emoji..."
            />
          </div>
        </TabsContent>

        {/* Aba 2: Figurinhas */}
        <TabsContent value="stickers" className="m-0 p-3 focus-visible:outline-none">
          <div className="h-[380px] flex flex-col">
            {isLoadingStickers ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Carregando figurinhas...</span>
              </div>
            ) : stickers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-3">
                <div className="p-3 rounded-full bg-muted/60 border border-border/60">
                  <Sticker className="h-8 w-8 text-muted-foreground/60" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Nenhuma figurinha cadastrada
                  </p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    {isSuperAdmin
                      ? "Como super admin, você pode adicionar figurinhas personalizadas para toda a empresa usar."
                      : "O super admin ainda não adicionou figurinhas personalizadas para esta empresa."}
                  </p>
                </div>
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    className="text-xs gap-1.5 mt-2"
                    onClick={() => setIsAddModalOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar Primeira Figurinha
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                <div className="grid grid-cols-4 gap-2.5">
                  {stickers.map((sticker) => (
                    <div
                      key={sticker.id}
                      className="group relative flex flex-col items-center justify-center p-1.5 rounded-lg border border-transparent hover:border-primary/40 hover:bg-accent/40 transition-all cursor-pointer"
                      onClick={() =>
                        !isSendingSticker && onSelectSticker(sticker.url, sticker.name)
                      }
                      title={`${sticker.name} (Clique para enviar)`}
                    >
                      <div className="w-16 h-16 flex items-center justify-center relative">
                        <img
                          src={sticker.url}
                          alt={sticker.name}
                          loading="lazy"
                          className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform drop-shadow-xs"
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate w-full text-center mt-1 group-hover:text-foreground">
                        {sticker.name}
                      </span>

                      {/* Botão de Excluir (Super Admin) */}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 p-1 rounded-md bg-background/90 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground shadow-xs"
                          title="Excluir figurinha"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Deseja excluir a figurinha "${sticker.name}"?`)) {
                              deleteStickerMutation.mutate(sticker.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé informativo */}
            <div className="pt-2 mt-auto border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Figurinhas da empresa
              </span>
              <span>Clique para enviar</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal para Super Admin Adicionar Nova Figurinha */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => !open && handleCloseAddModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sticker className="h-5 w-5 text-primary" />
              Adicionar Figurinha à Empresa
            </DialogTitle>
            <DialogDescription>
              Apenas super administradores podem cadastrar figurinhas. A imagem será convertida
              automaticamente para WebP 512x512 com fundo transparente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Input de Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="sticker-name" className="text-xs font-medium">
                Nome / Tag da Figurinha (Opcional)
              </Label>
              <Input
                id="sticker-name"
                placeholder="Opcional (Ex: Obrigado, Boleto, Joinha...)"
                value={stickerName}
                onChange={(e) => setStickerName(e.target.value)}
                disabled={createStickerMutation.isPending}
              />
            </div>

            {/* Upload e Pré-visualização */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Arquivo de Imagem (PNG, JPG, WebP)</Label>
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 bg-muted/20 hover:bg-muted/40 transition-colors relative">
                {isProcessingImage ? (
                  <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-xs">Convertendo para WebP transparente...</span>
                  </div>
                ) : previewSticker ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-28 h-28 p-2 rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center border border-border/60">
                      <img
                        src={previewSticker.dataUrl}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain drop-shadow-sm"
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground text-center">
                      <span>
                        {previewSticker.width}x{previewSticker.height} px
                      </span>
                      <span className="mx-1">•</span>
                      <span>{(previewSticker.sizeBytes / 1024).toFixed(1)} KB (WebP)</span>
                    </div>
                    <label
                      htmlFor="sticker-file-replace"
                      className="text-xs text-primary hover:underline cursor-pointer font-medium mt-1"
                    >
                      Trocar imagem
                    </label>
                    <input
                      id="sticker-file-replace"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                ) : (
                  <label
                    htmlFor="sticker-file-input"
                    className="flex flex-col items-center justify-center py-6 cursor-pointer w-full text-center"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground/60 mb-2" />
                    <span className="text-xs font-medium text-foreground">
                      Clique para escolher uma imagem
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      PNG com transparência, WebP ou JPG (máx 5MB)
                    </span>
                    <input
                      id="sticker-file-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseAddModal}
              disabled={createStickerMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveSticker}
              disabled={!previewSticker || createStickerMutation.isPending}
              className="gap-1.5"
            >
              {createStickerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Salvar Figurinha
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
