import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { u as useQuery } from "../_libs/tanstack__react-query.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { C as Card } from "./card-t5bxWKAo.mjs";
import { f as formatRelative, A as Avatar, a as AvatarFallback, i as initials } from "./format-DolZ3YMa.mjs";
import { C as Checkbox$1, a as CheckboxIndicator } from "../_libs/radix-ui__react-checkbox.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { a as useUnit } from "./router-BZupuT9_.mjs";
import { C as ChannelIcon } from "./channel-icon-6enHNb56.mjs";
import "../_libs/sonner.mjs";
import { q as Clock, W as MessageCircle, I as CircleCheck, U as Users, o as Check } from "../_libs/lucide-react.mjs";
import { R as ResponsiveContainer, B as BarChart, C as CartesianGrid, X as XAxis, Y as YAxis, T as Tooltip, a as Bar } from "../_libs/recharts.mjs";
import { s as subDays, f as format, p as ptBR } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/radix-ui__react-avatar.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/@radix-ui/react-use-is-hydrated+[...].mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/lodash.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/react-is.mjs";
import "../_libs/d3-shape.mjs";
import "../_libs/d3-path.mjs";
import "../_libs/react-smooth.mjs";
import "../_libs/prop-types.mjs";
import "../_libs/fast-equals.mjs";
import "../_libs/victory-vendor.mjs";
import "../_libs/d3-scale.mjs";
import "../_libs/internmap.mjs";
import "../_libs/d3-array.mjs";
import "../_libs/d3-time-format.mjs";
import "../_libs/d3-time.mjs";
import "../_libs/d3-interpolate.mjs";
import "../_libs/d3-color.mjs";
import "../_libs/d3-format.mjs";
import "../_libs/recharts-scale.mjs";
import "../_libs/decimal.js-light.mjs";
import "../_libs/eventemitter3.mjs";
const Checkbox = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Checkbox$1,
  {
    ref,
    className: cn(
      "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(CheckboxIndicator, { className: cn("grid place-content-center text-current"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "h-4 w-4" }) })
  }
));
Checkbox.displayName = Checkbox$1.displayName;
function DashboardPage() {
  const {
    selectedUnitId
  } = useUnit();
  const {
    data: metrics
  } = useQuery({
    queryKey: ["dashboard-metrics", selectedUnitId],
    queryFn: async () => {
      let qWaiting = supabase.from("conversations").select("*", {
        count: "exact",
        head: true
      }).eq("status", "waiting");
      let qActive = supabase.from("conversations").select("*", {
        count: "exact",
        head: true
      }).eq("status", "active");
      let qResolved = supabase.from("conversations").select("*", {
        count: "exact",
        head: true
      }).eq("status", "resolved").gte("resolved_at", new Date((/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0)).toISOString());
      if (selectedUnitId) {
        qWaiting = qWaiting.eq("unit_id", selectedUnitId);
        qActive = qActive.eq("unit_id", selectedUnitId);
        qResolved = qResolved.eq("unit_id", selectedUnitId);
      }
      const [waiting, active, resolved, agents] = await Promise.all([qWaiting, qActive, qResolved, supabase.from("profiles").select("*", {
        count: "exact",
        head: true
      }).eq("online", true)]);
      return {
        waiting: waiting.count ?? 0,
        active: active.count ?? 0,
        resolvedToday: resolved.count ?? 0,
        agentsOnline: agents.count ?? 0
      };
    }
  });
  const {
    data: chartData
  } = useQuery({
    queryKey: ["dashboard-chart", selectedUnitId],
    queryFn: async () => {
      const since = subDays(/* @__PURE__ */ new Date(), 6);
      let qChart = supabase.from("conversations").select("started_at").gte("started_at", since.toISOString());
      if (selectedUnitId) qChart = qChart.eq("unit_id", selectedUnitId);
      const {
        data
      } = await qChart;
      const days = Array.from({
        length: 7
      }).map((_, i) => {
        const d = subDays(/* @__PURE__ */ new Date(), 6 - i);
        return {
          day: format(d, "EEE", {
            locale: ptBR
          }),
          date: format(d, "yyyy-MM-dd"),
          total: 0
        };
      });
      data?.forEach((row) => {
        const k = format(new Date(row.started_at), "yyyy-MM-dd");
        const slot = days.find((x) => x.date === k);
        if (slot) slot.total += 1;
      });
      return days;
    }
  });
  const {
    data: oldestWaiting
  } = useQuery({
    queryKey: ["oldest-waiting", selectedUnitId],
    queryFn: async () => {
      let qOldest = supabase.from("conversations").select("id, started_at, channel, contact:contacts(name)").eq("status", "waiting").order("started_at", {
        ascending: true
      }).limit(5);
      if (selectedUnitId) qOldest = qOldest.eq("unit_id", selectedUnitId);
      const {
        data
      } = await qOldest;
      return data ?? [];
    }
  });
  const {
    data: myTasks
  } = useQuery({
    queryKey: ["my-tasks-today", selectedUnitId],
    queryFn: async () => {
      const end = /* @__PURE__ */ new Date();
      end.setHours(23, 59, 59, 999);
      let qTasks = supabase.from("tasks").select("id,title,due_date,priority,status").eq("status", "pending").lte("due_date", end.toISOString()).order("due_date", {
        ascending: true
      }).limit(6);
      if (selectedUnitId) qTasks = qTasks.eq("unit_id", selectedUnitId);
      const {
        data
      } = await qTasks;
      return data ?? [];
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6 p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(MetricCard, { label: "Aguardando", value: metrics?.waiting ?? 0, icon: Clock, alert: (metrics?.waiting ?? 0) > 5 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(MetricCard, { label: "Em andamento", value: metrics?.active ?? 0, icon: MessageCircle }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(MetricCard, { label: "Resolvidos hoje", value: metrics?.resolvedToday ?? 0, icon: CircleCheck }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(MetricCard, { label: "Agentes online", value: metrics?.agentsOnline ?? 0, icon: Users })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-6 xl:grid-cols-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "xl:col-span-2 p-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mb-1 text-sm font-semibold", children: "Volume de atendimentos" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-4 text-xs text-muted-foreground", children: "Últimos 7 dias" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-64", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(BarChart, { data: chartData ?? [], children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "var(--border)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(XAxis, { dataKey: "day", stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(YAxis, { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { contentStyle: {
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12
          } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Bar, { dataKey: "total", fill: "var(--primary)", radius: [6, 6, 0, 0] })
        ] }) }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mb-1 text-sm font-semibold", children: "Tarefas de hoje" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mb-4 text-xs text-muted-foreground", children: [
          myTasks?.length ?? 0,
          " pendentes"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          (myTasks ?? []).map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Checkbox, { className: "mt-0.5" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-sm", children: t.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: t.due_date ? formatRelative(t.due_date) : "Sem prazo" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(PriorityDot, { p: t.priority })
          ] }, t.id)),
          !myTasks?.length && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Nenhuma tarefa para hoje. 🎉" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mb-4 text-sm font-semibold", children: "Aguardando há mais tempo" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        (oldestWaiting ?? []).map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, { className: "h-8 w-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AvatarFallback, { className: "bg-muted text-xs", children: initials(c.contact?.name) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-sm font-medium", children: c.contact?.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground", children: [
              "Iniciado ",
              formatRelative(c.started_at)
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ChannelIcon, { channel: c.channel })
        ] }, c.id)),
        !oldestWaiting?.length && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Sem atendimentos aguardando. ✨" })
      ] })
    ] })
  ] });
}
function MetricCard({
  label,
  value,
  icon: Icon,
  alert
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "p-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium uppercase tracking-wide text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("grid h-9 w-9 place-items-center rounded-lg", alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-4 w-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: cn("mt-3 text-3xl font-semibold", alert && "text-destructive"), children: value })
  ] });
}
function PriorityDot({
  p
}) {
  const cls = p === "high" ? "bg-destructive" : p === "medium" ? "bg-warning" : "bg-muted-foreground/40";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("mt-1.5 h-2 w-2 rounded-full", cls) });
}
export {
  DashboardPage as component
};
