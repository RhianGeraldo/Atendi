import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquarePlus, Trash2, Pencil, Paperclip, X, FileText, Headphones, Image as ImageIcon, Folder, FolderPlus, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function QuickMessagesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  // Message States
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  
  // Media states
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"text"|"image"|"video"|"audio"|"document" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder States
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");

  const { data: folders, isLoading: isLoadingFolders } = useQuery({
    queryKey: ["quick-message-folders", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_message_folders")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: quickMessages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["quick-messages", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_messages")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const resetMessageForm = () => {
    setName("");
    setShortcut("");
    setContent("");
    setMediaUrl(null);
    setMediaType(null);
    setFolderId(null);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetFolderForm = () => {
    setFolderName("");
    setEditingFolderId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: "image" | "audio" | "document" = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("audio/") || file.type.startsWith("video/")) type = "audio";

    const reader = new FileReader();
    reader.onload = () => {
      setMediaUrl(reader.result as string);
      setMediaType(type);
    };
    reader.readAsDataURL(file);
  };

  // Folder Mutations
  const saveFolder = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!folderName.trim()) throw new Error("O nome da pasta é obrigatório");

      if (editingFolderId) {
        const { error } = await supabase
          .from("quick_message_folders")
          .update({ name: folderName })
          .eq("id", editingFolderId)
          .eq("company_id", profile.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_message_folders")
          .insert({ company_id: profile.company_id, name: folderName });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Pasta salva!");
      setIsFolderOpen(false);
      resetFolderForm();
      qc.invalidateQueries({ queryKey: ["quick-message-folders"] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quick_message_folders")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pasta excluída!");
      qc.invalidateQueries({ queryKey: ["quick-message-folders"] });
      qc.invalidateQueries({ queryKey: ["quick-messages"] }); // Messages will move to root
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  // Message Mutations
  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!shortcut.startsWith("/")) throw new Error("O atalho deve começar com / (ex: /msg01)");

      const payload = {
        name: name || shortcut,
        shortcut,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        folder_id: folderId === "root" ? null : folderId,
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
          .insert({ company_id: profile.company_id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mensagem rápida salva!");
      setIsOpen(false);
      resetMessageForm();
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

  // Grouping
  const rootMessages = quickMessages?.filter((qm) => !qm.folder_id) || [];
  const foldersWithMessages = folders?.map(f => ({
    ...f,
    messages: quickMessages?.filter((qm) => qm.folder_id === f.id) || []
  })) || [];

  const MessageCard = ({ qm }: { qm: any }) => (
    <div key={qm.id} className="flex items-start justify-between border rounded-lg p-4 bg-muted/20">
      <div className="space-y-2 flex-1">
        <div className="font-semibold text-sm">{qm.name}</div>
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
      </div>
      <div className="flex gap-2 ml-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            setEditingId(qm.id);
            setName(qm.name || "");
            setShortcut(qm.shortcut);
            setContent(qm.content || "");
            setMediaUrl(qm.media_url || null);
            setMediaType(qm.media_type as any || null);
            setFolderId(qm.folder_id || "root");
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
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            Mensagens Rápidas
          </CardTitle>
          <CardDescription>
            Organize atalhos e crie pastas para respostas prontas no chat.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {/* Folder Modal */}
          <Dialog open={isFolderOpen} onOpenChange={(open) => {
            setIsFolderOpen(open);
            if (!open) resetFolderForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="outline"><FolderPlus className="h-4 w-4 mr-2" /> Nova Pasta</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingFolderId ? "Editar Pasta" : "Nova Pasta"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome da Pasta</label>
                  <Input 
                    value={folderName} 
                    onChange={(e) => setFolderName(e.target.value)} 
                    placeholder="Ex: Vendas, Suporte..."
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => saveFolder.mutate()}
                  disabled={saveFolder.isPending || !folderName.trim()}
                >
                  Salvar Pasta
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Message Modal */}
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) resetMessageForm();
          }}>
            <DialogTrigger asChild>
              <Button>Novo Atalho</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Atalho" : "Novo Atalho"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome da Mensagem</label>
                  <Input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Ex: Saudação Inicial"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pasta</label>
                  <Select value={folderId || "root"} onValueChange={(val) => setFolderId(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a pasta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">📁 Pasta Raiz (Nenhuma)</SelectItem>
                      {folders?.map(f => (
                        <SelectItem key={f.id} value={f.id}>📁 {f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoadingMessages || isLoadingFolders ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (quickMessages?.length === 0 && folders?.length === 0) ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem rápida configurada. Crie pastas ou atalhos para agilizar o atendimento.
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Root Messages */}
            {rootMessages.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4" /> Pasta Raiz
                </h3>
                {rootMessages.map(qm => <MessageCard key={qm.id} qm={qm} />)}
              </div>
            )}

            {/* Folders Accordion */}
            {foldersWithMessages.length > 0 && (
              <Accordion type="multiple" defaultValue={folders?.map(f => f.id)} className="w-full space-y-4">
                {foldersWithMessages.map(folder => (
                  <AccordionItem key={folder.id} value={folder.id} className="border rounded-lg bg-card px-4">
                    <div className="flex items-center justify-between">
                      <AccordionTrigger className="hover:no-underline flex-1 py-4">
                        <div className="flex items-center gap-2 font-semibold">
                          <Folder className="h-4 w-4 text-primary" />
                          {folder.name}
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            ({folder.messages.length} atalhos)
                          </span>
                        </div>
                      </AccordionTrigger>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolderId(folder.id);
                            setFolderName(folder.name);
                            setIsFolderOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Excluir pasta "${folder.name}"? As mensagens serão movidas para a raiz.`)) {
                              deleteFolder.mutate(folder.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent className="pt-2 pb-4 space-y-4">
                      {folder.messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem nesta pasta.</p>
                      ) : (
                        folder.messages.map((qm: any) => <MessageCard key={qm.id} qm={qm} />)
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            
          </div>
        )}
      </CardContent>
    </Card>
  );
}
