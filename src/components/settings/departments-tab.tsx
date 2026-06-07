import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";

export function DepartmentsTab() {
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase.from("departments").select("*");
      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      // FIXME: The database is missing the migration that adds company_id and makes unit_id optional.
      // else q = q.is("unit_id", null);
      
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const createDept = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Nome é obrigatório");
      const { error } = await supabase.from("departments").insert({
        // company_id: profile!.company_id!, // FIXME: add back when DB is migrated
        unit_id: selectedUnitId || null,
        name,
        description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento criado!");
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => toast.error("Erro ao criar", { description: (e as Error).message })
  });

  const deleteDept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento excluído.");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message })
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo Departamento</CardTitle>
          <CardDescription>Crie setores para organizar o atendimento.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-2xl">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Nome do Setor</label>
              <Input placeholder="Ex: Financeiro" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Descrição</label>
              <Input placeholder="Opcional" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <Button onClick={() => createDept.mutate()} disabled={!name || createDept.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Departamentos {selectedUnitId ? "da Unidade" : "da Sede"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : departments?.length ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {departments.map(dept => (
                <div key={dept.id} className="rounded-lg border p-4 flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">{dept.name}</h4>
                    {dept.description && <p className="text-xs text-muted-foreground mt-1">{dept.description}</p>}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Users className="h-3 w-3" />
                      SLA: {dept.sla_minutes} min
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => {
                    if (confirm("Tem certeza que deseja apagar este departamento?")) deleteDept.mutate(dept.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Nenhum departamento criado neste contexto.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
