import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Users,
  Target,
  DollarSign,
  TrendingUp,
  Clock,
  Sparkles,
  Flame,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { TodooCampaign } from "@/types/todoo";
import { toast } from "sonner";

interface Props {
  onCreateClick: () => void;
}

export function TodooCampaignsList({ onCreateClick }: Props) {
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();

  // Busca as campanhas com agregação de leads
  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["todoo-campaigns-list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data: rawCampaigns, error } = await (supabase.from("todoo_campaigns") as any)
        .select(`
          *,
          leads:todoo_leads(id, status, outcome_value, sla_breached)
        `)
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (rawCampaigns || []).map((c: any) => {
        const leads = c.leads || [];
        const total = leads.length;
        const won = leads.filter((l: any) => l.status === "won").length;
        const worked = leads.filter((l: any) => l.status !== "pending").length;
        const revenue = leads
          .filter((l: any) => l.status === "won")
          .reduce((acc: number, curr: any) => acc + (Number(curr.outcome_value) || 0), 0);

        return {
          ...c,
          total_leads: total,
          completed_leads: worked,
          won_leads: won,
          won_revenue: revenue,
        } as TodooCampaign;
      });
    },
  });

  // Pausar / Retomar Campanha
  const handleToggleStatus = async (campaign: TodooCampaign) => {
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      const { error } = await (supabase.from("todoo_campaigns") as any)
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", campaign.id);

      if (error) throw error;
      toast.success(nextStatus === "active" ? "Campanha retomada!" : "Campanha pausada.");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao alterar status: " + err.message);
    }
  };

  const getBadgeType = (type: string) => {
    switch (type) {
      case "retention_saldo":
        return { label: "Saldo ≤ 3 Sessões", color: "bg-blue-600/10 text-blue-700 dark:text-blue-400" };
      case "upsell_zones":
        return { label: "Zonas em Aberto", color: "bg-purple-600/10 text-purple-700 dark:text-purple-400" };
      case "reactivation":
        return { label: "Reativação de Inativos", color: "bg-amber-600/10 text-amber-700 dark:text-amber-400" };
      case "mgm_referral":
        return { label: "Desafio 3 Amigas (MGM)", color: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" };
      case "quote_followup":
        return { label: "Follow-up Orçamento", color: "bg-rose-600/10 text-rose-700 dark:text-rose-400" };
      default:
        return { label: "Personalizada", color: "bg-muted text-muted-foreground" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ações Comerciais & Listas Quentes</h2>
          <p className="text-xs text-muted-foreground">
            Gerencie as campanhas ativas, volume de clientes distribuídos e resultados de conversão.
          </p>
        </div>
        <Button onClick={onCreateClick} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nova Ação Comercial
        </Button>
      </div>

      {/* Listagem */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">
          Carregando ações comerciais...
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold mt-3">Nenhuma lista ou ação comercial criada</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
            Crie sua primeira lista quente com clientes de saldo de sessões, inativos ou orçamentos para abastecer a fila de trabalho das consultoras.
          </p>
          <Button onClick={onCreateClick} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Criar Minha Primeira Ação
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((camp) => {
            const badge = getBadgeType(camp.type);
            const progress = camp.total_leads ? Math.round(((camp.completed_leads || 0) / camp.total_leads) * 100) : 0;
            const convRate = camp.completed_leads ? Math.round(((camp.won_leads || 0) / camp.completed_leads) * 100) : 0;

            return (
              <Card key={camp.id} className="flex flex-col justify-between">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className={`${badge.color} border-none text-[11px] font-medium`}>
                      {badge.label}
                    </Badge>
                    <Badge variant={camp.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {camp.status === "active" ? "Ativa" : "Pausada"}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-semibold mt-2 line-clamp-1">
                    {camp.title}
                  </CardTitle>
                  {camp.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {camp.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-4">
                  {/* Progresso de Execução */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Execução da Fila:</span>
                      <strong className="text-foreground">
                        {camp.completed_leads} / {camp.total_leads} ({progress}%)
                      </strong>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  {/* Métricas Principais */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Fechamentos:</span>
                      <strong className="text-emerald-600 font-semibold text-sm">
                        {camp.won_leads} ({convRate}%)
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Receita Gerada:</span>
                      <strong className="text-foreground font-semibold text-sm">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(camp.won_revenue || 0)}
                      </strong>
                    </div>
                  </div>

                  {/* Informações adicionais & Botões */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      SLA: {camp.sla_hours}h
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(camp)}
                      className="h-7 text-xs gap-1"
                    >
                      {camp.status === "active" ? (
                        <>
                          <Pause className="h-3 w-3" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          Retomar
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
