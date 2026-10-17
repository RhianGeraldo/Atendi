import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Users,
  Calendar,
  FileText,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  PieChart,
  BarChart2,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { todooRange, type TodooRangeKey } from "./todoo-period";
import { TodooRangeTabs, TodooSectionHeader } from "./todoo-section-header";
import { TodooCadenceFunnel } from "./todoo-cadence-funnel";

export function TodooMetrics() {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const [range, setRange] = useState<TodooRangeKey>("month");

  const { data: metrics, isLoading, isError } = useQuery({
    queryKey: ["todoo-overall-metrics", activeCompanyId, range, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // Leads que entraram no período (e na unidade selecionada), agregados no banco.
      // Agendados e orçamentos contam quem passou pela etapa, mesmo que depois tenha fechado.
      const { from, to } = todooRange(range);
      const { data: m, error } = await (supabase.rpc as any)("todoo_metrics", {
        p_company_id: activeCompanyId,
        p_unit_id: selectedUnitId || null,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;

      const totalLeads = Number(m?.total) || 0;
      const contactedLeads = Number(m?.contacted) || 0;
      const scheduledLeads = Number(m?.scheduled) || 0;
      const quotedLeads = Number(m?.quoted) || 0;
      const wonLeads = Number(m?.won) || 0;
      const lostLeads = Number(m?.lost) || 0;
      const totalRevenue = Number(m?.revenue) || 0;
      const slaOnTime = Number(m?.sla_on_time) || 0;
      const slaBreachedCount = Number(m?.sla_late) || 0;

      const contactRate = totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0;
      const scheduleRate = contactedLeads > 0 ? Math.round((scheduledLeads / contactedLeads) * 100) : 0;
      const conversionRate = contactedLeads > 0 ? Math.round((wonLeads / contactedLeads) * 100) : 0;
      const averageTicket = wonLeads > 0 ? totalRevenue / wonLeads : 0;
      // SLA do 1º contato: no prazo ÷ (no prazo + atrasados); leads ainda dentro do prazo ficam fora
      const slaJudged = slaOnTime + slaBreachedCount;
      const slaOnTimeRate = slaJudged > 0 ? Math.round((slaOnTime / slaJudged) * 100) : 100;

      return {
        totalLeads,
        contactedLeads,
        scheduledLeads,
        quotedLeads,
        wonLeads,
        lostLeads,
        totalRevenue,
        contactRate,
        scheduleRate,
        conversionRate,
        averageTicket,
        slaOnTimeRate,
        slaBreachedCount,
      };
    },
  });

  const header = (
    <TodooSectionHeader
      title="Indicadores"
      description="Funil da cadência e taxas de contato, agendamento e conversão dos leads do período."
      actions={<TodooRangeTabs value={range} onChange={setRange} />}
    />
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <div className="p-12 text-center text-xs text-destructive">
          Não foi possível calcular os indicadores. Tente novamente em instantes.
        </div>
      </div>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className="space-y-6">
        {header}
        <div className="p-12 text-center text-xs text-muted-foreground">Calculando indicadores...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <TodooCadenceFunnel range={range} />

      {/* 4 Cards Principais com Fórmulas do Manual Todoo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Taxa de Contato</span>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold text-foreground">{metrics.contactRate}%</h3>
              <span className="text-xs text-muted-foreground">Produtividade</span>
            </div>
            <Progress value={metrics.contactRate} className="h-1.5 mt-2" />
            <p className="text-[11px] text-muted-foreground pt-1">
              {metrics.contactedLeads} de {metrics.totalLeads} leads trabalhados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Taxa de Agendamento</span>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold text-blue-600">{metrics.scheduleRate}%</h3>
              <span className="text-xs text-muted-foreground">Qualidade da Abordagem</span>
            </div>
            <Progress value={metrics.scheduleRate} className="h-1.5 mt-2 bg-blue-100" />
            <p className="text-[11px] text-muted-foreground pt-1">
              {metrics.scheduledLeads} avaliações/sessões agendadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Taxa de Conversão Final</span>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold text-emerald-600">{metrics.conversionRate}%</h3>
              <span className="text-xs text-muted-foreground">Eficiência Comercial</span>
            </div>
            <Progress value={metrics.conversionRate} className="h-1.5 mt-2 bg-emerald-100" />
            <p className="text-[11px] text-muted-foreground pt-1">
              {metrics.wonLeads} contratos fechados com sucesso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Ticket Médio por Venda</span>
            <div className="flex items-baseline justify-between">
              <h3 className="text-2xl font-bold text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metrics.averageTicket)}
              </h3>
              <span className="text-xs text-muted-foreground">Receita/Contrato</span>
            </div>
            <div className="pt-2 text-[11px] text-muted-foreground">
              Total Faturado:{" "}
              <strong className="text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metrics.totalRevenue)}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funil Visual de Conversão */}
      <Card>
        <CardHeader className="p-4 border-b border-border">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Funil de Execução Comercial das Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center">
            <div className="p-4 rounded-xl bg-muted/40 border border-border">
              <span className="text-xs text-muted-foreground block">1. Leads na Fila</span>
              <strong className="text-2xl font-bold mt-1 block">{metrics.totalLeads}</strong>
              <span className="text-[11px] text-muted-foreground">100% da base</span>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border">
              <span className="text-xs text-muted-foreground block">2. Contatados</span>
              <strong className="text-2xl font-bold mt-1 block">{metrics.contactedLeads}</strong>
              <span className="text-[11px] text-muted-foreground">{metrics.contactRate}% alcançados</span>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300">
              <span className="text-xs block opacity-80">3. Agendados</span>
              <strong className="text-2xl font-bold mt-1 block">{metrics.scheduledLeads}</strong>
              <span className="text-[11px] opacity-80">{metrics.scheduleRate}% dos contatados</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300">
              <span className="text-xs block opacity-80">4. Orçamentos</span>
              <strong className="text-2xl font-bold mt-1 block">{metrics.quotedLeads}</strong>
              <span className="text-[11px] opacity-80">receberam orçamento</span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-300">
              <span className="text-xs block opacity-80">5. Fechados</span>
              <strong className="text-2xl font-bold mt-1 block">{metrics.wonLeads}</strong>
              <span className="text-[11px] opacity-80">{metrics.conversionRate}% conversão</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cumprimento de SLA (Regra de Ouro) */}
      <Card>
        <CardHeader className="p-4 border-b border-border">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Índice de Cumprimento de SLA Comercial
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-3xl font-black text-foreground">{metrics.slaOnTimeRate}%</h3>
              <p className="text-xs text-muted-foreground">
                dos primeiros contatos foram feitos dentro do SLA da ação comercial.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">1º contato atrasado:</span>
                <strong className="text-sm font-semibold text-destructive">{metrics.slaBreachedCount} leads</strong>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
