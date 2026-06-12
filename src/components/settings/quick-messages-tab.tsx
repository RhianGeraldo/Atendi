import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquarePlus, Trash2, Pencil, Paperclip, X, FileText, Headphones, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function QuickMessagesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");
  
  // Media states
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"text"|"image"|"video"|"audio"|"document" | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: quickMessages, isLoading } = useQuery({
    queryKey: ["quick-messages", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_messages")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setShortcut("");
    setContent("");
    setMediaUrl(null);
    setMediaType(null);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: "image" | "audio" | "document" = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("audio/") || file.type.startsWith("video/")) type = "audio";

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      setMediaUrl(reader.result as string);
      setMediaType(type);
    };
    reader.readAsDataURL(file);
  };

  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!shortcut.startsWith("/")) throw new Error("O atalho deve começar com / (ex: /msg01)");

      const payload = {
        shortcut,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
      };

      if (editingId) {
        const { error } = await supabase
          .from("quick_messages")
          .update(payload)
          .eq("id", editingId)
          .eq("company_id", profile.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_messages")
          .insert({
            company_id: profile.company_id,
            ...payload
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mensagem rápida salva!");
      setIsOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message }),
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quick_messages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mensagem excluída!");
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            Mensagens Rápidas
          </CardTitle>
          <CardDescription>
            Configure atalhos como "/saudacao" para respostas prontas no chat.
          </CardDescription>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>Novo Atalho</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Atalho" : "Novo Atalho"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Atalho (ex: /saudacao)</label>
                <Input 
                  value={shortcut} 
                  onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))} 
                  placeholder="/msg01"
                />
              </div>
              
              {/* Anexo de Mídia */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Anexo (Opcional)</label>
                {mediaUrl ? (
                  <div className="relative border rounded p-2 flex items-center justify-center bg-muted/50 overflow-hidden">
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-1 right-1 h-6 w-6 z-10 rounded-full"
                      onClick={() => {
                        setMediaUrl(null);
                        setMediaType(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    
                    {mediaType === 'image' ? (
                      <img src={mediaUrl} className="max-h-32 object-contain rounded" alt="Preview" />
                    ) : mediaType === 'audio' ? (
                      <audio controls src={mediaUrl} className="w-full h-10" />
                    ) : (
                      <div className="flex flex-col items-center p-4">
                        <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                        <span className="text-xs text-muted-foreground">Documento Anexado</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileChange}
                      accept="image/*,audio/*,video/*,application/pdf"
                    />
                    <Button 
                      variant="outline" 
                      className="w-full border-dashed"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Anexar Imagem, Áudio ou PDF
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Conteúdo da Mensagem</label>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded cursor-help" title="{{atendente}}, {{cliente}}, {{saudacao}}, {{telefone}}, {{protocolo}}, {{data}}, {{hora}}">
                    Variáveis: {'{{atendente}}'}, {'{{cliente}}'}...
                  </span>
                </div>
                <Textarea 
                  value={content} 
                  onChange={(e) => setContent(e.target.value)} 
                  placeholder="Olá {{cliente}}, como podemos ajudar?"
                  rows={5}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={() => saveMessage.mutate()}
                disabled={saveMessage.isPending || !shortcut || (!content && !mediaUrl)}
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : quickMessages?.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem rápida configurada. Crie atalhos para agilizar o atendimento.
          </div>
        ) : (
          <div className="space-y-4">
            {quickMessages?.map((qm) => (
              <div key={qm.id} className="flex items-start justify-between border rounded-lg p-4 bg-muted/20">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block bg-primary/10 text-primary font-mono px-2 py-0.5 rounded text-xs font-bold">
                      {qm.shortcut}
                    </span>
                    {qm.media_url && (
                      <span className="inline-flex items-center text-xs text-muted-foreground bg-background border px-1.5 py-0.5 rounded gap-1">
                        {qm.media_type === 'image' && <ImageIcon className="h-3 w-3" />}
                        {qm.media_type === 'audio' && <Headphones className="h-3 w-3" />}
                        {qm.media_type === 'document' && <FileText className="h-3 w-3" />}
                        Anexo
                      </span>
                    )}
                  </div>
                  {qm.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{qm.content}</p>
                  )}
                  {qm.media_url && qm.media_type === 'audio' && (
                    <audio controls src={qm.media_url} className="h-8 w-[200px] mt-1" />
                  )}
                  {qm.media_url && qm.media_type === 'image' && (
                    <img src={qm.media_url} className="h-16 rounded mt-1 object-contain" alt="Anexo" />
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      setEditingId(qm.id);
                      setShortcut(qm.shortcut);
                      setContent(qm.content || "");
                      setMediaUrl(qm.media_url || null);
                      setMediaType(qm.media_type as any || null);
                      setIsOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Excluir atalho?")) {
                        deleteMessage.mutate(qm.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
