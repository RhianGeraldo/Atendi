import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, CheckCircle2, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface ResolutionReason {
  id: string;
  company_id: string;
  label: string;
  order: number;
  active: boolean;
  created_at: string;
}

const DEFAULT_REASONS = [
  "Dúvida Resolvida",
  "Venda Concluída",
  "Sem Resposta do Cliente",
  "Problema Resolvido",
  "Transferido para Outro Setor",
  "Cancelamento Realizado",
  "Reclamação Tratada",
  "Solicitação Atendida",
];

export function ResolutionReasonsTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

  const { data: reasons, isLoading } = useQuery({
    queryKey: ["resolution-reasons-settings", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resolution_reasons" as any)
        .select("id, company_id, label, order, active, created_at")
        .eq("company_id", profile!.company_id!)
        .order("order", { ascending: true });
      if (error && error.code !== "42P01") throw error;
      return (data || []) as ResolutionReason[];
    },
  });

  const addReason = useMutation({
    mutationFn: async (label: string) => {
      const maxOrder = reasons?.length ? Math.max(...reasons.map((r) => r.order)) : -1;
      const { error } = await supabase.from("resolution_reasons" as any).insert({
        company_id: profile!.company_id!,
        label: label.trim(),
        order: maxOrder + 1,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLabel("");
      toast.success("Motivo adicionado!");
      qc.invalidateQueries({ queryKey: ["resolution-reasons-settings"] });
      qc.invalidateQueries({ queryKey: ["resolution-reasons"] });
    },
    onError: (e) => toast.error("Erro ao adicionar", { description: (e as Error).message }),
  });

  const deleteReason = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resolution_reasons" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Motivo removido!");
      qc.invalidateQueries({ queryKey: ["resolution-reasons-settings"] });
      qc.invalidateQueries({ queryKey: ["resolution-reasons"] });
    },
    onError: (e) => toast.error("Erro ao remover", { description: (e as Error).message }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("resolution_reasons" as any)
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resolution-reasons-settings"] });
      qc.invalidateQueries({ queryKey: ["resolution-reasons"] });
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: (e as Error).message }),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => {
      const existing = reasons?.map((r) => r.label.toLowerCase()) || [];
      const toInsert = DEFAULT_REASONS.filter(
        (label) => !existing.includes(label.toLowerCase())
      ).map((label, i) => ({
        company_id: profile!.company_id!,
        label,
        order: (reasons?.length || 0) + i,
        active: true,
      }));

      if (toInsert.length === 0) {
        toast.info("Todos os motivos padrão já estão cadastrados!");
        return;
      }

      const { error } = await supabase.from("resolution_reasons" as any).insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Motivos padrão adicionados!");
      qc.invalidateQueries({ queryKey: ["resolution-reasons-settings"] });
      qc.invalidateQueries({ queryKey: ["resolution-reasons"] });
    },
    onError: (e) => toast.error("Erro ao adicionar padrões", { description: (e as Error).message }),
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Left: Add new + seed defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Motivos de Encerramento
          </CardTitle>
          <CardDescription>
            Configure os motivos que os atendentes precisam selecionar ao encerrar uma conversa. Esses
            dados estarão disponíveis nos relatórios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seed defaults */}
          {(!reasons || reasons.length === 0) && (
            <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhum motivo cadastrado ainda. Adicione os padrões ou crie os seus próprios.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedDefaults.mutate()}
                disabled={seedDefaults.isPending}
              >
                {seedDefaults.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Adicionar Motivos Padrão
              </Button>
            </div>
          )}

          {reasons && reasons.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => seedDefaults.mutate()}
              disabled={seedDefaults.isPending}
            >
              {seedDefaults.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Adicionar Motivos Padrão
            </Button>
          )}

          {/* Add custom */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Novo Motivo Personalizado</label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Acordo Comercial Fechado"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLabel.trim() && !addReason.isPending) {
                    addReason.mutate(newLabel);
                  }
                }}
              />
              <Button
                onClick={() => addReason.mutate(newLabel)}
                disabled={!newLabel.trim() || addReason.isPending}
              >
                {addReason.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Motivos Cadastrados{" "}
            {reasons && (
              <Badge variant="secondary" className="ml-2">
                {reasons.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Alterne o status para ativar ou desativar um motivo sem excluí-lo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !reasons || reasons.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
              Nenhum motivo cadastrado.
            </div>
          ) : (
            <div className="space-y-2">
              {reasons.map((reason) => (
                <div
                  key={reason.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                    <span
                      className={`text-sm truncate ${
                        !reason.active ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {reason.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={reason.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: reason.id, active: v })}
                      disabled={toggleActive.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteReason.mutate(reason.id)}
                      disabled={deleteReason.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
