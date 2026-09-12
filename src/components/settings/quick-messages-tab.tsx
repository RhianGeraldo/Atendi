import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquarePlus,
  Trash2,
  Pencil,
  Paperclip,
  X,
  FileText,
  Headphones,
  Image as ImageIcon,
  Folder,
  FolderPlus,
  FolderOpen,
  Search,
  Copy,
  Check,
  Sparkles,
  Plus,
  Video,
  ArrowLeft,
  ChevronRight,
  LayoutGrid,
  List,
  MoreVertical,
  ExternalLink,
  Download,
  Play,
  CornerDownRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const QUICK_VARIABLES = [
  { key: "cliente", label: "Nome do Cliente", example: "{{cliente}}" },
  { key: "atendente", label: "Seu Nome", example: "{{atendente}}" },
  { key: "saudacao", label: "Bom dia / Boa tarde", example: "{{saudacao}}" },
  { key: "telefone", label: "Telefone", example: "{{telefone}}" },
  { key: "protocolo", label: "Nº Protocolo", example: "{{protocolo}}" },
  { key: "empresa", label: "Nome da Empresa", example: "{{empresa}}" },
];

interface QuickMessageFolder {
  id: string;
  name: string;
  company_id?: string;
  created_at?: string;
}

interface QuickMessageItem {
  id: string;
  name?: string | null;
  shortcut: string;
  content?: string | null;
  media_url?: string | null;
  media_type?: "text" | "image" | "video" | "audio" | "document" | null;
  folder_id?: string | null;
  company_id?: string;
  created_at?: string;
}

export function QuickMessagesTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  // Navigation State (Windows Explorer style)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Message Form States
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Media states
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<
    "text" | "image" | "video" | "audio" | "document" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folder States
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");

  // Confirmation Modals
  const [deletingMessage, setDeletingMessage] = useState<QuickMessageItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<QuickMessageFolder | null>(null);

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
        .order("shortcut");
      if (error) throw error;
      return data || [];
    },
  });

  // Current folder information
  const currentFolder = useMemo(() => {
    if (!currentFolderId || !folders) return null;
    return folders.find((f) => f.id === currentFolderId) || null;
  }, [currentFolderId, folders]);

  const resetMessageForm = () => {
    setName("");
    setShortcut("");
    setContent("");
    setMediaUrl(null);
    setMediaType(null);
    setFolderId(currentFolderId || "root");
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openNewMessageModal = () => {
    setName("");
    setShortcut("");
    setContent("");
    setMediaUrl(null);
    setMediaType(null);
    setFolderId(currentFolderId || "root");
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsOpen(true);
  };

  const resetFolderForm = () => {
    setFolderName("");
    setEditingFolderId(null);
  };

  const handleShortcutChange = (val: string) => {
    let clean = val.replace(/\s+/g, "");
    if (clean && !clean.startsWith("/")) {
      clean = "/" + clean;
    }
    setShortcut(clean);
  };

  const insertVariable = (variableKey: string) => {
    const textarea = textareaRef.current;
    const tag = `{{${variableKey}}}`;
    if (!textarea) {
      setContent((prev) => (prev ? `${prev} ${tag}` : tag));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = content;
    const before = current.substring(0, start);
    const after = current.substring(end);
    const updated = before + tag + after;
    setContent(updated);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const copyToClipboard = (text: string, id: string) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Mensagem copiada para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: "image" | "audio" | "document" | "video" = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("audio/")) type = "audio";

    if (type === "audio" || type === "document") {
      setContent("");
    }

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
          .update({ name: folderName.trim() })
          .eq("id", editingFolderId)
          .eq("company_id", profile.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_message_folders")
          .insert({ company_id: profile.company_id, name: folderName.trim() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingFolderId ? "Pasta atualizada!" : "Pasta criada!");
      setIsFolderOpen(false);
      resetFolderForm();
      qc.invalidateQueries({ queryKey: ["quick-message-folders"] });
    },
    onError: (e) => toast.error("Erro ao salvar pasta", { description: (e as Error).message }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_message_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pasta excluída!");
      if (currentFolderId === deletingFolder?.id) {
        setCurrentFolderId(null);
      }
      setDeletingFolder(null);
      qc.invalidateQueries({ queryKey: ["quick-message-folders"] });
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao excluir pasta", { description: (e as Error).message }),
  });

  // Message Mutations
  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      let cleanShortcut = shortcut.trim().replace(/\s+/g, "");
      if (!cleanShortcut.startsWith("/")) {
        cleanShortcut = "/" + cleanShortcut;
      }
      if (cleanShortcut.length <= 1) {
        throw new Error("Defina um atalho válido (ex: /saudacao)");
      }

      const payload = {
        name: name.trim() || cleanShortcut,
        shortcut: cleanShortcut,
        content: content.trim(),
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
      toast.success(editingId ? "Mensagem atualizada!" : "Mensagem rápida criada!");
      setIsOpen(false);
      resetMessageForm();
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao salvar mensagem", { description: (e as Error).message }),
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mensagem excluída!");
      setDeletingMessage(null);
      qc.invalidateQueries({ queryKey: ["quick-messages"] });
    },
    onError: (e) => toast.error("Erro ao excluir mensagem", { description: (e as Error).message }),
  });

  // Filtering messages
  const displayedMessages = useMemo(() => {
    if (!quickMessages) return [];
    const list = quickMessages;

    // If searching, search across all messages regardless of folder
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return list.filter(
        (qm) =>
          qm.name?.toLowerCase().includes(q) ||
          qm.shortcut?.toLowerCase().includes(q) ||
          qm.content?.toLowerCase().includes(q),
      );
    }

    // Otherwise, filter by current folder
    if (currentFolderId === null) {
      return list.filter((qm) => !qm.folder_id);
    } else {
      return list.filter((qm) => qm.folder_id === currentFolderId);
    }
  }, [quickMessages, currentFolderId, searchQuery]);

  // Counts
  const totalMessagesCount = quickMessages?.length || 0;
  const foldersCount = folders?.length || 0;

  // Render text with highlighted {{tags}}
  const renderFormattedContent = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, idx) => {
      if (part.startsWith("{{") && part.endsWith("}}")) {
        return (
          <span
            key={idx}
            className="inline-block px-1.5 py-0.2 mx-0.5 rounded bg-primary/15 text-primary font-mono text-[11px] font-semibold"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Rich Message Card component
  const RichMessageCard = ({ qm }: { qm: QuickMessageItem }) => {
    const parentFolder = folders?.find((f) => f.id === qm.folder_id);
    const isCopied = copiedId === qm.id;

    return (
      <div className="flex flex-col justify-between border rounded-2xl bg-card hover:border-primary/50 hover:shadow-md transition-all overflow-hidden group">
        {/* Top Header: Shortcut Badge & Actions */}
        <div className="p-4 pb-3 border-b bg-muted/20">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center bg-primary text-primary-foreground font-mono px-2.5 py-0.5 rounded-md text-xs font-bold shadow-2xs">
                  {qm.shortcut}
                </span>
                {searchQuery.trim() && parentFolder && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground gap-1"
                  >
                    <Folder className="h-3 w-3" />
                    {parentFolder.name}
                  </Badge>
                )}
              </div>
              <h4 className="font-semibold text-sm text-foreground truncate pt-0.5">
                {qm.name || "Mensagem Rápida"}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {qm.content && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => copyToClipboard(qm.content, qm.id)}
                  title="Copiar texto da mensagem"
                >
                  {isCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingId(qm.id);
                      setName(qm.name || "");
                      setShortcut(qm.shortcut);
                      setContent(qm.content || "");
                      setMediaUrl(qm.media_url || null);
                      setMediaType(qm.media_type || null);
                      setFolderId(qm.folder_id || "root");
                      setIsOpen(true);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar Atalho
                  </DropdownMenuItem>
                  {qm.content && (
                    <DropdownMenuItem onClick={() => copyToClipboard(qm.content, qm.id)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar Conteúdo
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => setDeletingMessage(qm)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Media Preview Section */}
        {qm.media_url && (
          <div className="p-4 pb-2">
            {qm.media_type === "image" && (
              <div className="relative rounded-xl overflow-hidden border bg-muted/40 aspect-video flex items-center justify-center group/img">
                <img
                  src={qm.media_url}
                  alt={qm.name}
                  className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                />
                <button
                  type="button"
                  onClick={() => window.open(qm.media_url, "_blank")}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1.5 font-medium"
                >
                  <ExternalLink className="h-4 w-4" /> Ver Imagem Completa
                </button>
              </div>
            )}

            {qm.media_type === "video" && (
              <div className="rounded-xl overflow-hidden border bg-black aspect-video flex items-center justify-center">
                <video controls src={qm.media_url} className="w-full h-full object-contain" />
              </div>
            )}

            {qm.media_type === "audio" && (
              <div className="rounded-xl p-3 border bg-violet-500/5 border-violet-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-400">
                  <Headphones className="h-4 w-4" />
                  Áudio Pronto para Envio
                </div>
                <audio controls src={qm.media_url} className="w-full h-9" />
              </div>
            )}

            {qm.media_type === "document" && (
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-500/5 border-amber-500/20">
                <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Documento Anexado
                  </p>
                  <p className="text-[11px] text-muted-foreground">PDF / Arquivo Pronto</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => window.open(qm.media_url, "_blank")}
                >
                  <Download className="h-3 w-3" /> Baixar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Content Preview */}
        {qm.content ? (
          <div className="p-4 pt-3 flex-1 flex flex-col justify-between">
            <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-4 bg-muted/20 p-3 rounded-xl border border-border/50 font-sans">
              {renderFormattedContent(qm.content)}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>{qm.content.length} caracteres</span>
              <button
                type="button"
                onClick={() => copyToClipboard(qm.content, qm.id)}
                className="text-primary hover:underline font-medium flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copiar texto
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 pt-1">
            <p className="text-xs text-muted-foreground italic">Somente anexo de mídia.</p>
          </div>
        )}
      </div>
    );
  };

  // Compact List Card component
  const ListMessageCard = ({ qm }: { qm: QuickMessageItem }) => {
    const parentFolder = folders?.find((f) => f.id === qm.folder_id);
    const isCopied = copiedId === qm.id;

    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-card hover:border-primary/40 hover:shadow-xs transition-all">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="inline-flex items-center bg-primary/10 text-primary border border-primary/20 font-mono px-2.5 py-0.5 rounded-md text-xs font-bold shrink-0">
            {qm.shortcut}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-xs text-foreground truncate">
                {qm.name || "Mensagem Rápida"}
              </p>
              {searchQuery.trim() && parentFolder && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground gap-1"
                >
                  <Folder className="h-3 w-3" />
                  {parentFolder.name}
                </Badge>
              )}
              {qm.media_url && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                  {qm.media_type === "image" && <ImageIcon className="h-3 w-3 text-pink-500" />}
                  {qm.media_type === "audio" && <Headphones className="h-3 w-3 text-violet-500" />}
                  {qm.media_type === "video" && <Video className="h-3 w-3 text-blue-500" />}
                  {qm.media_type === "document" && <FileText className="h-3 w-3 text-amber-500" />}
                  Mídia
                </Badge>
              )}
            </div>
            {qm.content && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{qm.content}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {qm.content && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => copyToClipboard(qm.content, qm.id)}
              title="Copiar texto"
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setEditingId(qm.id);
              setName(qm.name || "");
              setShortcut(qm.shortcut);
              setContent(qm.content || "");
              setMediaUrl(qm.media_url || null);
              setMediaType(qm.media_type || null);
              setFolderId(qm.folder_id || "root");
              setIsOpen(true);
            }}
            title="Editar atalho"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeletingMessage(qm)}
            title="Excluir atalho"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="border-border">
      {/* Top Header */}
      <CardHeader className="border-b bg-muted/10 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              Mensagens Rápidas & Atalhos
            </CardTitle>
            <CardDescription>
              Navegue pelas pastas como no gerenciador de arquivos e use{" "}
              <code className="font-mono text-foreground font-semibold">/atalho</code> no chat.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Folder Modal */}
            <Dialog
              open={isFolderOpen}
              onOpenChange={(open) => {
                setIsFolderOpen(open);
                if (!open) resetFolderForm();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <FolderPlus className="h-4 w-4 text-amber-500" />
                  Nova Pasta
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>{editingFolderId ? "Editar Pasta" : "Criar Nova Pasta"}</DialogTitle>
                  <DialogDescription>
                    Organize suas mensagens por categoria (ex: Vendas, Dúvidas Frequentes).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Nome da Pasta</label>
                    <Input
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="Ex: Vendas, Suporte, Propostas..."
                      className="text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && folderName.trim()) {
                          e.preventDefault();
                          saveFolder.mutate();
                        }
                      }}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full text-xs"
                    onClick={() => saveFolder.mutate()}
                    disabled={saveFolder.isPending || !folderName.trim()}
                  >
                    {saveFolder.isPending ? "Salvando..." : "Salvar Pasta"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* New Shortcut Button */}
            <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={openNewMessageModal}>
              <Plus className="h-4 w-4" />
              Novo Atalho
            </Button>
          </div>
        </div>

        {/* Windows Explorer Navigation Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-4 border-t mt-3">
          {/* Breadcrumbs / Path */}
          <div className="flex items-center gap-1.5 text-xs">
            {currentFolderId !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentFolderId(null)}
                className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground mr-1"
                title="Voltar para a pasta raiz"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
            )}

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background text-xs font-medium shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                className={cn(
                  "hover:underline flex items-center gap-1",
                  currentFolderId === null ? "text-primary font-semibold" : "text-muted-foreground",
                )}
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                Início
              </button>

              {currentFolder && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-foreground font-semibold flex items-center gap-1">
                    <Folder className="h-3.5 w-3.5 text-amber-500" />
                    {currentFolder.name}
                  </span>
                </>
              )}
            </div>

            <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
              ({displayedMessages.length} {displayedMessages.length === 1 ? "atalho" : "atalhos"})
            </span>
          </div>

          {/* Search & View Controls */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar /atalho, nome ou texto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center border rounded-lg p-0.5 bg-muted/40 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "grid"
                    ? "bg-background shadow-2xs text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Visualização em Grade"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "list"
                    ? "bg-background shadow-2xs text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Visualização em Lista"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {isLoadingMessages || isLoadingFolders ? (
          <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
            Carregando mensagens rápidas...
          </div>
        ) : totalMessagesCount === 0 && foldersCount === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center space-y-3 bg-muted/10">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Folder className="h-7 w-7 text-amber-500 fill-amber-500/20" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h4 className="font-semibold text-sm">Seu catálogo de atalhos está vazio</h4>
              <p className="text-xs text-muted-foreground">
                Crie pastas para organizar suas respostas e adicione atalhos rápidos com texto,
                fotos, vídeos ou áudios gravados.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsFolderOpen(true)}
                variant="outline"
                className="text-xs"
              >
                <FolderPlus className="mr-1 h-3.5 w-3.5 text-amber-500" />
                Criar Pasta
              </Button>
              <Button size="sm" onClick={openNewMessageModal} className="text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Criar Primeiro Atalho
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* FOLDERS SECTION (Shown on Root when not searching) */}
            {currentFolderId === null && !searchQuery.trim() && folders && folders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Folder className="h-3.5 w-3.5 text-amber-500" />
                    Pastas ({folders.length})
                  </h3>
                  <span className="text-[11px] text-muted-foreground">Clique para abrir</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {folders.map((folder) => {
                    const count =
                      quickMessages?.filter((m) => m.folder_id === folder.id).length || 0;
                    return (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="group relative flex flex-col justify-between p-3.5 rounded-2xl border bg-card hover:bg-muted/30 hover:border-amber-500/40 hover:shadow-sm transition-all cursor-pointer select-none"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
                            <Folder className="h-6 w-6 fill-amber-500/20" />
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingFolderId(folder.id);
                                  setFolderName(folder.name);
                                  setIsFolderOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Renomear Pasta
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onClick={() => setDeletingFolder(folder)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Excluir Pasta
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="mt-3 space-y-0.5 min-w-0">
                          <p className="font-semibold text-xs text-foreground truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                            {folder.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {count} {count === 1 ? "atalho" : "atalhos"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SHORTCUTS / MESSAGES SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                  {searchQuery.trim()
                    ? `Resultados da busca (${displayedMessages.length})`
                    : currentFolderId === null
                      ? `Atalhos na Raiz (${displayedMessages.length})`
                      : `Atalhos em "${currentFolder?.name}" (${displayedMessages.length})`}
                </h3>

                {currentFolderId !== null && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openNewMessageModal}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Adicionar nesta pasta
                  </Button>
                )}
              </div>

              {displayedMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center space-y-2 bg-muted/10">
                  <p className="text-xs text-muted-foreground">
                    {searchQuery.trim()
                      ? `Nenhum atalho encontrado para "${searchQuery}".`
                      : currentFolderId !== null
                        ? "Esta pasta ainda não possui mensagens rápidas cadastradas."
                        : "Nenhum atalho na raiz. Crie um atalho ou entre em uma pasta."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openNewMessageModal}
                    className="text-xs"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Criar Atalho
                  </Button>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedMessages.map((qm) => (
                    <RichMessageCard key={qm.id} qm={qm} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedMessages.map((qm) => (
                    <ListMessageCard key={qm.id} qm={qm} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Message Modal (Create / Edit) */}
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) resetMessageForm();
        }}
      >
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              {editingId ? "Editar Mensagem Rápida" : "Criar Nova Mensagem Rápida"}
            </DialogTitle>
            <DialogDescription>
              Defina o comando de disparo, a pasta e o conteúdo (texto, áudio, foto, vídeo ou PDF).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-xs">Nome / Título da Mensagem</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Saudação Padrão, Link Catálogo..."
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-xs">Pasta Organizadora</label>
                <Select value={folderId || "root"} onValueChange={(val) => setFolderId(val)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione a pasta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">📁 Pasta Raiz (Início)</SelectItem>
                    {folders?.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        📁 {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-xs">Atalho no Teclado (ex: /saudacao)</label>
              <Input
                value={shortcut}
                onChange={(e) => handleShortcutChange(e.target.value)}
                placeholder="/saudacao"
                className="font-mono text-xs font-semibold"
              />
              <p className="text-[11px] text-muted-foreground">
                Basta digitar{" "}
                <code className="font-mono text-primary font-semibold">
                  {shortcut || "/comando"}
                </code>{" "}
                no chat para o texto ou mídia carregar instantaneamente.
              </p>
            </div>

            {/* Anexo de Mídia */}
            <div className="space-y-1.5">
              <label className="font-semibold text-xs">Anexo de Mídia (Opcional)</label>
              {mediaUrl ? (
                <div className="relative border rounded-2xl p-3 flex items-center justify-center bg-muted/30 overflow-hidden">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 z-10 rounded-full shadow-xs"
                    onClick={() => {
                      setMediaUrl(null);
                      setMediaType(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>

                  {mediaType === "image" && (
                    <img
                      src={mediaUrl}
                      className="max-h-44 object-contain rounded-lg shadow-xs"
                      alt="Preview"
                    />
                  )}
                  {mediaType === "video" && (
                    <video controls src={mediaUrl} className="max-h-44 rounded-lg" />
                  )}
                  {mediaType === "audio" && (
                    <div className="w-full py-2 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-violet-600">
                        <Headphones className="h-4 w-4" /> Áudio Anexado
                      </div>
                      <audio controls src={mediaUrl} className="w-full h-9" />
                    </div>
                  )}
                  {mediaType === "document" && (
                    <div className="flex flex-col items-center py-2">
                      <FileText className="h-10 w-10 text-primary mb-1" />
                      <span className="text-xs font-medium text-foreground">
                        Documento / PDF Pronto para Envio
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    accept="image/*,audio/*,video/*,application/pdf"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed text-xs h-12 gap-2 hover:bg-muted/40"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    Anexar Imagem, Áudio Gravado, Vídeo ou Documento PDF
                  </Button>
                </div>
              )}
            </div>

            {mediaType !== "audio" && mediaType !== "document" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-xs">Texto da Mensagem</label>
                  <span className="text-[11px] text-muted-foreground">
                    {content.length} caracteres
                  </span>
                </div>
                <Textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá {{cliente}}, tudo bem? Sou o {{atendente}} da {{empresa}}..."
                  rows={5}
                  className="text-xs leading-relaxed resize-none font-sans"
                />

                {/* Variáveis Dinâmicas */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Variáveis Disponíveis (clique para inserir no texto):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted hover:bg-primary/10 hover:text-primary border transition-colors cursor-pointer"
                        title={v.label}
                      >
                        {v.example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveMessage.mutate()}
              disabled={saveMessage.isPending || !shortcut || (!content && !mediaUrl)}
              className="text-xs"
            >
              {saveMessage.isPending ? "Salvando..." : "Salvar Mensagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog
        open={!!deletingMessage}
        onOpenChange={(open) => !open && setDeletingMessage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Atalho?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o atalho{" "}
              <strong className="font-mono">{deletingMessage?.shortcut}</strong> (
              {deletingMessage?.name})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMessage && deleteMessage.mutate(deletingMessage.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              Sim, Excluir Atalho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={!!deletingFolder}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a pasta <strong>{deletingFolder?.name}</strong>? As
              mensagens contidas nela não serão perdidas, sendo transferidas automaticamente para a
              Pasta Raiz (Início).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFolder && deleteFolder.mutate(deletingFolder.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              Sim, Excluir Pasta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
