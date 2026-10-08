import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target, Loader2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TodooGoalsDialog({ open, onOpenChange, onSuccess }: Props) {
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();

  const currentMonthYear = new Date().toISOString().slice(0, 7); // Ex: '2026-10'
  const [goalsMap, setGoalsMap] = useState<Record<string, { contacts: number; conversions: number; revenue: number }>>({});
  const [saving, setSaving] = useState(false);

  // Busca equipe e metas atuais do mês
  const { data: teamWithGoals = [], isLoading } = useQuery({
    queryKey: ["todoo-team-goals-config", activeCompanyId, currentMonthYear],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      // 1. Busca usuários da empresa
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, role")
        .eq("company_id", activeCompanyId!)
        .order("name");

      if (pErr) throw pErr;

      // 2. Busca metas cadastradas do mês
      const { data: goals, error: gErr } = await (supabase.from("todoo_goals") as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("month_year", currentMonthYear);

      if (gErr) throw gErr;

      const goalsByUserId = new Map();
      (goals || []).forEach((g: any) => goalsByUserId.set(g.user_id, g));

      const initialMap: Record<string, any> = {};
      const result = (profiles || []).map((p: any) => {
        const existing = goalsByUserId.get(p.id);
        initialMap[p.id] = {
          contacts: existing?.target_contacts ?? 20,
          conversions: existing?.target_conversions ?? 5,
          revenue: existing?.target_revenue ?? 10000,
        };
        return {
          ...p,
          goal: existing,
        };
      });

      setGoalsMap(initialMap);
      return result;
    },
  });

  const handleChange = (userId: string, field: "contacts" | "conversions" | "revenue", value: number) => {
    setGoalsMap((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!activeCompanyId) return;
    setSaving(true);

    try {
      const recordsToUpsert = Object.entries(goalsMap).map(([userId, g]) => ({
        company_id: activeCompanyId,
        user_id: userId,
        month_year: currentMonthYear,
        target_contacts: Number(g.contacts) || 0,
        target_conversions: Number(g.conversions) || 0,
        target_revenue: Number(g.revenue) || 0,
        updated_at: new Date().toISOString(),
      }));

      for (const rec of recordsToUpsert) {
        const { error } = await (supabase.from("todoo_goals") as any).upsert(rec, {
          onConflict: "company_id,user_id,month_year",
        });
        if (error) throw error;
      }

      toast.success("Metas de cadastros e vendas salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["todoo-goals-overview"] });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao salvar metas: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base">
                Definir Metas do Mês ({currentMonthYear})
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure a meta de cadastros de contatos/indicações e vendas por consultora.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Carregando equipe e metas...
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground uppercase px-2">
              <span className="col-span-5">Consultora / Profissional</span>
              <span className="col-span-3 text-center">Meta Cadastros</span>
              <span className="col-span-4 text-center">Meta Faturamento (R$)</span>
            </div>

            <div className="space-y-2">
              {teamWithGoals.map((member: any) => {
                const current = goalsMap[member.id] || { contacts: 20, revenue: 10000 };
                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl border border-border bg-card"
                  >
                    <div className="col-span-5 min-w-0">
                      <h4 className="text-xs font-semibold truncate text-foreground">{member.name}</h4>
                      <span className="text-[10px] text-muted-foreground capitalize">{member.role}</span>
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        className="h-8 text-xs text-center"
                        value={current.contacts}
                        onChange={(e) =>
                          handleChange(member.id, "contacts", parseInt(e.target.value) || 0)
                        }
                      />
                    </div>

                    <div className="col-span-4">
                      <Input
                        type="number"
                        className="h-8 text-xs text-center"
                        value={current.revenue}
                        onChange={(e) =>
                          handleChange(member.id, "revenue", parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Salvar Metas
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
