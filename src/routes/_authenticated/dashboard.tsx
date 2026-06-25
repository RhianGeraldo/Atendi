import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, MessageCircle, CheckCircle2, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatRelative, initials } from "@/lib/format";
import { useUnit } from "@/lib/unit-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { ChannelIcon } from "@/components/common/channel-icon";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface Metrics {
  waiting: number;
  active: number;
  resolvedToday: number;
  agentsOnline: number;
}

function DashboardPage() {
  const { selectedUnitId } = useUnit();
  const { activeCompanyId } = useActiveCompany();

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["dashboard-metrics", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      let qWaiting = supabase.from("conversations").select("id, contact:contacts!inner(company_id)", { count: "exact", head: true }).eq("status", "waiting");
      let qActive = supabase.from("conversations").select("id, contact:contacts!inner(company_id)", { count: "exact", head: true }).eq("status", "active");
      let qResolved = supabase.from("conversations").select("id, contact:contacts!inner(company_id)", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
      
      if (activeCompanyId) {
        qWaiting = qWaiting.eq("contact.company_id", activeCompanyId);
        qActive = qActive.eq("contact.company_id", activeCompanyId);
        qResolved = qResolved.eq("contact.company_id", activeCompanyId);
      }

      if (selectedUnitId) {
        qWaiting = qWaiting.eq("unit_id", selectedUnitId);
        qActive = qActive.eq("unit_id", selectedUnitId);
        qResolved = qResolved.eq("unit_id", selectedUnitId);
      }

      let qAgents = supabase.from("profiles").select("*", { count: "exact", head: true }).eq("online", true);
      if (activeCompanyId) qAgents = qAgents.eq("company_id", activeCompanyId);

      const [waiting, active, resolved, agents] = await Promise.all([
        qWaiting,
        qActive,
        qResolved,
        qAgents,
      ]);
      
      return {
        waiting: waiting.count ?? 0,
        active: active.count ?? 0,
        resolvedToday: resolved.count ?? 0,
        agentsOnline: agents.count ?? 0,
      };
    },
  });

  const { data: chartData } = useQuery({
    queryKey: ["dashboard-chart", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      const since = subDays(new Date(), 6);
      
      let qChart = supabase.from("conversations").select("started_at, contact:contacts!inner(company_id)").gte("started_at", since.toISOString());
      if (activeCompanyId) qChart = qChart.eq("contact.company_id", activeCompanyId);
      if (selectedUnitId) qChart = qChart.eq("unit_id", selectedUnitId);

      const { data } = await qChart;
      
      const days = Array.from({ length: 7 }).map((_, i) => {
        const d = subDays(new Date(), 6 - i);
        return { day: format(d, "EEE", { locale: ptBR }), date: format(d, "yyyy-MM-dd"), total: 0 };
      });
      data?.forEach((row) => {
        const k = format(new Date(row.started_at), "yyyy-MM-dd");
        const slot = days.find((x) => x.date === k);
        if (slot) slot.total += 1;
      });
      return days;
    },
  });

  const { data: oldestWaiting } = useQuery({
    queryKey: ["oldest-waiting", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      let qOldest = supabase
        .from("conversations")
        .select("id, started_at, channel, contact:contacts!inner(name, company_id)")
        .eq("status", "waiting")
        .order("started_at", { ascending: true })
        .limit(5);

      if (activeCompanyId) qOldest = qOldest.eq("contact.company_id", activeCompanyId);
      if (selectedUnitId) qOldest = qOldest.eq("unit_id", selectedUnitId);

      const { data } = await qOldest;
      return data ?? [];
    },
  });

  const { data: myTasks } = useQuery({
    queryKey: ["my-tasks-today", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      let qTasks = supabase
        .from("tasks")
        .select("id,title,due_date,priority,status")
        .eq("status", "pending")
        .lte("due_date", end.toISOString())
        .order("due_date", { ascending: true })
        .limit(6);

      if (activeCompanyId) qTasks = qTasks.eq("company_id", activeCompanyId);
      if (selectedUnitId) qTasks = qTasks.eq("unit_id", selectedUnitId);

      const { data } = await qTasks;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Aguardando"
          value={metrics?.waiting ?? 0}
          icon={Clock}
          alert={(metrics?.waiting ?? 0) > 5}
        />
        <MetricCard label="Em andamento" value={metrics?.active ?? 0} icon={MessageCircle} />
        <MetricCard label="Resolvidos hoje" value={metrics?.resolvedToday ?? 0} icon={CheckCircle2} />
        <MetricCard label="Agentes online" value={metrics?.agentsOnline ?? 0} icon={Users} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 p-6">
          <h2 className="mb-1 text-sm font-semibold">Volume de atendimentos</h2>
          <p className="mb-4 text-xs text-muted-foreground">Últimos 7 dias</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold">Tarefas de hoje</h2>
          <p className="mb-4 text-xs text-muted-foreground">{myTasks?.length ?? 0} pendentes</p>
          <div className="space-y-3">
            {(myTasks ?? []).map((t) => (
              <div key={t.id} className="flex items-start gap-3">
                <Checkbox className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.due_date ? formatRelative(t.due_date) : "Sem prazo"}
                  </div>
                </div>
                <PriorityDot p={t.priority as "low" | "medium" | "high"} />
              </div>
            ))}
            {!myTasks?.length && (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa para hoje. 🎉</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">Aguardando há mais tempo</h2>
        <div className="space-y-2">
          {(oldestWaiting ?? []).map((c: any) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-muted text-xs">
                  {initials(c.contact?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.contact?.name}</div>
                <div className="text-xs text-muted-foreground">
                  Iniciado {formatRelative(c.started_at)}
                </div>
              </div>
              <ChannelIcon channel={c.channel} />
            </div>
          ))}
          {!oldestWaiting?.length && (
            <p className="text-sm text-muted-foreground">Sem atendimentos aguardando. ✨</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  alert,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  alert?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg",
            alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn("mt-3 text-3xl font-semibold", alert && "text-destructive")}>
        {value}
      </div>
    </Card>
  );
}

function PriorityDot({ p }: { p: "low" | "medium" | "high" }) {
  const cls = p === "high" ? "bg-destructive" : p === "medium" ? "bg-warning" : "bg-muted-foreground/40";
  return <span className={cn("mt-1.5 h-2 w-2 rounded-full", cls)} />;
}
