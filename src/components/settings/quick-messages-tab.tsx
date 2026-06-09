import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquarePlus, Trash2, Pencil } from "lucide-react";
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
    setEditingId(null);
  };

  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!shortcut.startsWith("/")) throw new Error("O atalho deve começar com / (ex: /msg01)");

      if (editingId) {
        const { error } = await supabase
          .from("quick_messages")
          .update({ shortcut, content })
          .eq("id", editingId)
          .eq("company_id", profile.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quick_messages")
          .insert({
            company_id: profile.company_id,
            shortcut,
            content,
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Conteúdo da Mensagem</label>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded cursor-help" title="{{atendente}}, {{cliente}}, {{saudacao}}, {{telefone}}, {{protocolo}}, {{data}}, {{hora}}">
                    Variáveis: {'{{atendente}}'}, {'{{cliente}}'}, {'{{saudacao}}'} e mais...
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
                disabled={saveMessage.isPending || !shortcut || !content}
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
                <div className="space-y-1">
                  <span className="inline-block bg-primary/10 text-primary font-mono px-2 py-0.5 rounded text-xs font-bold">
                    {qm.shortcut}
                  </span>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{qm.content}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      setEditingId(qm.id);
                      setShortcut(qm.shortcut);
                      setContent(qm.content);
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
