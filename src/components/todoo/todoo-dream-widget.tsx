import { useQuery } from "@tanstack/react-query";
import { Target, Heart, ArrowRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { calculateDreamProgress, formatCurrency } from "./todoo-dreams";
import type { TodooDream } from "@/types/todoo";

interface Props {
  onNavigateToDreams?: () => void;
  onOpenCreateDialog?: () => void;
}

export function TodooDreamWidget({ onNavigateToDreams, onOpenCreateDialog }: Props) {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();

  // Busca o sonho ativo: prioriza is_featured = true, com fallback para o mais recente
  const { data: activeDream, isLoading } = useQuery({
    queryKey: ["todoo-active-dream", activeCompanyId, user?.id],
    enabled: !!activeCompanyId && !!user?.id,
    queryFn: async (): Promise<TodooDream | null> => {
      // 1. Tenta o que tem is_featured = true
      const { data: featuredData } = await (supabase.from("todoo_dreams") as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("user_id", user!.id)
        .eq("status", "in_progress")
        .eq("is_featured", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (featuredData) return featuredData;

      // 2. Fallback: o mais recente em andamento
      const { data: fallbackData } = await (supabase.from("todoo_dreams") as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("user_id", user!.id)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return fallbackData;
    },
  });

  // Busca vendas para o sonho ativo no CRM (tabela opportunities) e no Todoo
  const { data: salesRevenue = 0 } = useQuery({
    queryKey: [
      "todoo-active-dream-crm-sales",
      activeCompanyId,
      user?.id,
      activeDream?.id,
      activeDream?.started_at,
    ],
    enabled: !!activeCompanyId && !!user?.id && !!activeDream,
    queryFn: async () => {
      const dreamStart = activeDream.started_at
        ? new Date(`${activeDream.started_at}T00:00:00`).getTime()
        : 0;

      // 1. CRM: busca direta por company_id e owner_id
      const { data: crmData } = await supabase
        .from("opportunities")
        .select("value, created_at, stage_entered_at, owner_id, company_id")
        .eq("company_id", activeCompanyId!)
        .eq("owner_id", user!.id)
        .eq("status", "won");

      const crmTotal = (crmData || []).reduce((acc, curr) => {
        const rawDate = curr.stage_entered_at || curr.created_at || "";
        const wonTime = new Date(rawDate).getTime();
        const wonDateStr = rawDate.substring(0, 10);
        if (wonTime >= dreamStart || (activeDream.started_at && wonDateStr >= activeDream.started_at)) {
          return acc + (Number(curr.value) || 0);
        }
        return acc;
      }, 0);

      // 2. Todoo Leads
      const { data: todooData } = await (supabase.from("todoo_leads") as any)
        .select("outcome_value, completed_at, updated_at")
        .eq("company_id", activeCompanyId!)
        .eq("assigned_user_id", user!.id)
        .eq("outcome_type", "won");

      const todooTotal = (todooData || []).reduce((acc: number, curr: any) => {
        const rawDate = curr.completed_at || curr.updated_at || "";
        const leadTime = new Date(rawDate).getTime();
        const leadDateStr = rawDate.substring(0, 10);
        if (leadTime >= dreamStart || (activeDream.started_at && leadDateStr >= activeDream.started_at)) {
          return acc + (Number(curr.outcome_value) || 0);
        }
        return acc;
      }, 0);

      return Math.max(crmTotal, todooTotal, crmTotal > 0 ? crmTotal : todooTotal);
    },
  });

  if (isLoading) return null;

  if (!activeDream) {
    return (
      <Card className="p-3 bg-muted/30 border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">
                Quadro dos Sonhos
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cadastre sua meta pessoal deste mês para acompanhar suas vendas fechadas no CRM.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onNavigateToDreams}
              className="text-xs h-7"
            >
              Ver Quadro
            </Button>
            {onOpenCreateDialog && (
              <Button
                size="sm"
                onClick={onOpenCreateDialog}
                className="text-xs h-7 gap-1"
              >
                <Plus className="w-3 h-3" />
                Cadastrar Sonho
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const progress = calculateDreamProgress(activeDream, salesRevenue);

  return (
    <Card className="p-3 bg-card border border-border shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Miniatura */}
          <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border bg-muted flex items-center justify-center">
            {activeDream.image_url ? (
              <img
                src={activeDream.image_url}
                alt={activeDream.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <Heart className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sonho Atual:
              </span>
              <span className="text-xs font-bold text-foreground truncate">
                {activeDream.title}
              </span>
              <span className="text-xs font-semibold text-primary shrink-0">
                ({formatCurrency(activeDream.target_value)})
              </span>
            </div>

            {/* Barra e Vendas */}
            <div className="flex items-center gap-3">
              <div className="w-28 sm:w-40 relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, progress.progressPct)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-foreground shrink-0">
                {progress.progressPct}%
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline truncate">
                {progress.remainingRevenue > 0
                  ? `Faltam ${formatCurrency(progress.remainingRevenue)} em vendas no CRM`
                  : "Meta no CRM batida! 🎉"}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onNavigateToDreams}
            className="text-xs h-7 text-primary hover:text-primary gap-1 font-medium"
          >
            Quadro dos Sonhos
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
