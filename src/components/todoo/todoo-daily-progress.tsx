import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";
import { currentTodooMonth, todooRange, type TodooRangeKey } from "./todoo-period";
import { fetchAllPages } from "./todoo-stages";

type MetricKey = "captures" | "contacts" | "scheduled" | "won";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "captures", label: "Cadastros", color: "var(--primary)" },
  { key: "contacts", label: "1º contato", color: "#f59e0b" },
  { key: "scheduled", label: "Agendamentos", color: "#2563eb" },
  { key: "won", label: "Fechamentos", color: "#059669" },
];

/** Dia (YYYY-MM-DD) de um timestamp no horário de Brasília. */
const dayInSaoPaulo = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Evolução dia a dia do mês: cadastros, primeiros contatos, agendamentos e fechamentos.
 * Em "Todo período" mostra o mês atual, porque um gráfico por dia só faz sentido dentro de um mês.
 */
export function TodooDailyProgress({ range }: { range: TodooRangeKey }) {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const [metric, setMetric] = useState<MetricKey>("captures");

  const monthRange = range === "all" ? "month" : range;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["todoo-daily-progress", activeCompanyId, monthRange, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { from, to } = todooRange(monthRange);
      const monthKey = dayInSaoPaulo(from!).slice(0, 7);
      const [y, m] = monthKey.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      // No mês atual o gráfico vai só até hoje
      const lastDay =
        monthKey === currentTodooMonth()
          ? Number(dayInSaoPaulo(new Date().toISOString()).slice(8))
          : daysInMonth;

      const inRange = (q: any, column: string) => {
        q = q.gte(column, from);
        if (to) q = q.lt(column, to);
        if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
        return q;
      };
      const leadsBy = (column: string) =>
        fetchAllPages(() =>
          inRange(
            (supabase.from("todoo_leads") as any)
              .select(`id, ${column}`)
              .eq("company_id", activeCompanyId)
              .order(column, { ascending: true })
              .order("id", { ascending: true }),
            column,
          ),
        );

      const [capturesRes, contactsRes, scheduledRes, wonRes, goalsRes] = await Promise.all([
        fetchAllPages(() =>
          inRange(
            (supabase.from("todoo_referrals") as any)
              .select("id, created_at")
              .eq("company_id", activeCompanyId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true }),
            "created_at",
          ),
        ),
        // 1º contato como nos Indicadores (todoo_metrics): o primeiro entre contato, tentativa
        // e resposta. Lead fechado direto de "A contatar" não tem first_attempt_at.
        fetchAllPages(() => {
          let q = (supabase.from("todoo_leads") as any)
            .select("id, first_contact_at, first_attempt_at, responded_at")
            .eq("company_id", activeCompanyId)
            .or(
              `first_contact_at.gte.${from},first_attempt_at.gte.${from},responded_at.gte.${from}`,
            )
            .order("id", { ascending: true });
          if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
          return q;
        }),
        leadsBy("scheduled_at"),
        leadsBy("won_at"),
        (supabase.from("todoo_goals") as any)
          .select("target_contacts, contacts_period")
          .eq("company_id", activeCompanyId)
          .eq("month_year", monthKey)
          .gt("target_contacts", 0),
      ]);
      for (const res of [capturesRes, contactsRes, scheduledRes, wonRes, goalsRes]) {
        if (res.error) throw res.error;
      }

      const days = Array.from({ length: lastDay }, (_, i) => ({
        day: String(i + 1).padStart(2, "0"),
        captures: 0,
        contacts: 0,
        scheduled: 0,
        won: 0,
      }));
      const count = (rows: any[], column: string, key: MetricKey) => {
        for (const r of rows) {
          if (!r[column]) continue;
          const d = days[Number(dayInSaoPaulo(r[column]).slice(8)) - 1];
          if (d) d[key] += 1;
        }
      };
      count(capturesRes.data, "created_at", "captures");
      // Conta pelo primeiro dos três; quem teve o 1º contato antes do período fica de fora
      count(
        contactsRes.data
          .map((r: any) => ({
            at: r.first_contact_at || r.first_attempt_at || r.responded_at,
          }))
          .filter((r: { at: string }) => {
            const t = new Date(r.at).getTime();
            return t >= new Date(from!).getTime() && (!to || t < new Date(to).getTime());
          }),
        "at",
        "contacts",
      );
      count(scheduledRes.data, "scheduled_at", "scheduled");
      count(wonRes.data, "won_at", "won");

      // Meta diária de cadastros da equipe: metas diárias somam direto, mensais viram média por dia
      const dailyGoal = (goalsRes.data || []).reduce(
        (sum: number, g: { target_contacts: number; contacts_period: string }) =>
          sum +
          (g.contacts_period === "daily" ? g.target_contacts : g.target_contacts / daysInMonth),
        0,
      );

      return { days, dailyGoal: Math.round(dailyGoal * 10) / 10 };
    },
  });

  const active = METRICS.find((m) => m.key === metric)!;
  const totals = Object.fromEntries(
    METRICS.map((m) => [m.key, (data?.days || []).reduce((s, d) => s + d[m.key], 0)]),
  ) as Record<MetricKey, number>;
  // Metas são por consultora, sem unidade; com filtro de unidade a linha ficaria errada
  const showGoal = metric === "captures" && !selectedUnitId && (data?.dailyGoal || 0) > 0;
  const workedDays = data?.days.length || 0;

  return (
    <Card>
      <CardHeader className="p-4 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Evolução diária
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {range === "all" ? "Mês atual, dia a dia" : "Dia a dia do período"}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                metric === m.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label}
              </span>
              <strong className="block text-lg leading-tight">{totals[m.key]}</strong>
              <span className="text-[10px] text-muted-foreground">
                {workedDays > 0
                  ? `média ${(totals[m.key] / workedDays).toFixed(1).replace(".", ",")}/dia`
                  : "—"}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="py-16 text-center text-xs text-muted-foreground">
            Carregando evolução diária...
          </p>
        ) : isError ? (
          <p className="py-16 text-center text-xs text-destructive">
            Não foi possível carregar a evolução diária.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.days ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  labelFormatter={(day) => `Dia ${day}`}
                  formatter={(value) => [value, active.label]}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {showGoal && (
                  <ReferenceLine
                    y={data!.dailyGoal}
                    stroke="var(--destructive)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Meta ${String(data!.dailyGoal).replace(".", ",")}/dia`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                )}
                <Bar dataKey={metric} fill={active.color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
