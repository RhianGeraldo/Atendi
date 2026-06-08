import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tag, Trash2, Edit2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";

export function LabelsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<any>(null);
  
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");

  const { data: labels, isLoading } = useQuery({
    queryKey: ["labels", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labels")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const openModal = (label?: any) => {
    if (label) {
      setEditingLabel(label);
      setName(label.name);
      setColor(label.color || "#6b7280");
    } else {
      setEditingLabel(null);
      setName("");
      setColor(`#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`);
    }
    setIsModalOpen(true);
  };

  const saveLabel = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Sem empresa vinculada");
      if (!name.trim()) throw new Error("O nome da etiqueta é obrigatório");
      
      if (editingLabel) {
        const { error } = await supabase
          .from("labels")
          .update({ name, color })
          .eq("id", editingLabel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("labels")
          .insert({ 
            name, 
            color, 
            company_id: profile.company_id,
            external_id: crypto.randomUUID()
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", profile?.company_id] });
      toast.success(editingLabel ? "Etiqueta atualizada!" : "Etiqueta criada!");
      setIsModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", profile?.company_id] });
      qc.invalidateQueries({ queryKey: ["conversations"] }); // refresh UI sidebars
      toast.success("Etiqueta removida!");
    },
    onError: (e) => toast.error("Erro ao remover", { description: (e as Error).message })
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">Etiquetas do Sistema</CardTitle>
            <CardDescription>
              Crie e gerencie as etiquetas disponíveis para classificar contatos e conversas.
            </CardDescription>
          </div>
          <Button onClick={() => openModal()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Etiqueta
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando etiquetas...</div>
          ) : !labels?.length ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-8 text-center">
              Nenhuma etiqueta criada ainda.
            </div>
          ) : (
            <div className="space-y-4">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: label.color || "#6b7280" }}
                    />
                    <span className="font-medium text-sm">{label.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openModal(label)}>
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja apagar a etiqueta "${label.name}"?`)) {
                          deleteLabel.mutate(label.id);
                        }
                      }}
                      disabled={deleteLabel.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingLabel ? "Editar Etiqueta" : "Nova Etiqueta"}</DialogTitle>
            <DialogDescription>
              {editingLabel ? "Altere o nome e a cor da etiqueta." : "Crie uma nova etiqueta para organizar seus atendimentos."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ex: Cliente VIP, Suporte Técnico..."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-3">
                <Input 
                  type="color" 
                  value={color} 
                  onChange={e => setColor(e.target.value)} 
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground uppercase">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveLabel.mutate()} disabled={saveLabel.isPending}>
              {saveLabel.isPending ? "Salvando..." : "Salvar Etiqueta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
