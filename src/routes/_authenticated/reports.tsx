import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  format, 
  subDays, 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from "recharts";
import { 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  Users, 
  DollarSign, 
  Calendar as CalendarIcon, 
  CheckSquare, 
  CalendarClock, 
  Link as LinkIcon, 
  UserPlus,
  Award, 
  Loader2,
  BarChart3,
  PieChart as PieIcon,
  Percent,
  Filter
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "react-day-picker";
import { formatBRL, initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      preset: (search.preset as string) || "30d",
      from: search.from as string | undefined,
      to: search.to as string | undefined,
      pipelineId: search.pipelineId as string | undefined,
    };
  },
  component: () => (
    <ProtectedMenuRoute menuKey="reports">
      <ReportsPage />
    </ProtectedMenuRoute>
  ),
});

function formatTMA(minutes: number) {
  if (!minutes || minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"];

function ReportsPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const preset = search.preset || "30d";
  const selectedPipelineId = search.pipelineId || "all";

  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const [activeTab, setActiveTab] = useState("conversations");

  // Fetch Pipelines for dropdown
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch Stages for the selected pipeline (or all company pipelines)
  const { data: stagesData } = useQuery({
    queryKey: ["reports-stages", activeCompanyId, selectedPipelineId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase.from("pipeline_stages").select("id, name, color, pipeline_id, order");

      if (selectedPipelineId !== "all") {
        query = query.eq("pipeline_id", selectedPipelineId);
      } else {
        const { data: companyPipelines } = await supabase
          .from("pipelines")
          .select("id")
          .eq("company_id", activeCompanyId!);
        const pIds = (companyPipelines || []).map((p) => p.id);
        if (pIds.length === 0) return [];
        query = query.in("pipeline_id", pIds);
      }

      const { data, error } = await query.order("order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute fromDate & toDate based on preset / URL search params
  const { fromDate, toDate, dateRange } = useMemo(() => {
    const today = new Date();
    if (preset === "7d") {
      const from = subDays(today, 6);
      return { fromDate: from, toDate: today, dateRange: { from, to: today } };
    }
    if (preset === "month") {
      const from = startOfMonth(today);
      const to = endOfMonth(today);
      return { fromDate: from, toDate: to, dateRange: { from, to } };
    }
    if (preset === "all") {
      return { fromDate: undefined, toDate: undefined, dateRange: undefined };
    }
    if (preset === "custom" && search.from && search.to) {
      const from = new Date(search.from);
      const to = new Date(search.to);
      return { fromDate: from, toDate: to, dateRange: { from, to } };
    }
    // Default: "30d" (Últimos 30 dias)
    const from = subDays(today, 29);
    return { fromDate: from, toDate: today, dateRange: { from, to: today } };
  }, [preset, search.from, search.to]);

  // Handle Preset Changes in URL
  const handlePresetChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        preset: value,
        from: undefined,
        to: undefined,
      }),
      replace: true,
    });
  };

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      navigate({
        search: (prev) => ({
          ...prev,
          preset: "custom",
          from: range.from!.toISOString(),
          to: range.to!.toISOString(),
        }),
        replace: true,
      });
    }
  };

  const fromStr = fromDate?.toISOString();
  const toStr = toDate?.toISOString();

  // Query 1: Conversations Data
  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ["reports-conversations", activeCompanyId, selectedUnitId, preset, fromStr, toStr],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          id,
          status,
          channel,
          started_at,
          resolved_at,
          assigned_agent_id,
          unit_id,
          contacts!inner(company_id),
          assigned_agent:profiles!conversations_assigned_agent_id_fkey(id, name, avatar_url)
        `)
        .eq("contacts.company_id", activeCompanyId!);

      if (fromDate) {
        query = query.gte("started_at", startOfDay(fromDate).toISOString());
      }
      if (toDate) {
        query = query.lte("started_at", endOfDay(toDate).toISOString());
      }
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as any[];
    },
  });

  // Query 2: Opportunities Data
  const { data: opportunities, isLoading: loadingOpps } = useQuery({
    queryKey: ["reports-opportunities", activeCompanyId, selectedUnitId, preset, fromStr, toStr],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // 1. Get pipelines for stage mapping
      const { data: companyPipelines } = await supabase
        .from("pipelines")
        .select("id")
        .eq("company_id", activeCompanyId!);

      const pipelineIds = (companyPipelines || []).map((p) => p.id);
      let stagesMap = new Map<string, { id: string; name: string; color: string }>();

      if (pipelineIds.length > 0) {
        const { data: stages } = await supabase
          .from("pipeline_stages")
          .select("id, name, color")
          .in("pipeline_id", pipelineIds);

        (stages || []).forEach((s) => {
          stagesMap.set(s.id, s);
        });
      }

      let query = supabase
        .from("opportunities")
        .select(`
          id,
          title,
          value,
          status,
          created_at,
          updated_at,
          owner_id,
          unit_id,
          stage_id,
          contacts!inner(company_id),
          owner:profiles!opportunities_owner_id_fkey(id, name)
        `)
        .eq("contacts.company_id", activeCompanyId!);

      if (fromDate) {
        query = query.gte("created_at", startOfDay(fromDate).toISOString());
      }
      if (toDate) {
        query = query.lte("created_at", endOfDay(toDate).toISOString());
      }
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((o: any) => ({
        ...o,
        stage: stagesMap.get(o.stage_id) || { name: "Em Negociação", color: "#3b82f6" },
      })) as any[];
    },
  });

  // Query 3: Contacts & Ad Leads Data
  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ["reports-contacts", activeCompanyId, selectedUnitId, preset, fromStr, toStr],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let qContacts = supabase
        .from("contacts")
        .select("id, created_at, phone, instagram_username, company_id")
        .eq("company_id", activeCompanyId!);

      if (fromDate) {
        qContacts = qContacts.gte("created_at", startOfDay(fromDate).toISOString());
      }
      if (toDate) {
        qContacts = qContacts.lte("created_at", endOfDay(toDate).toISOString());
      }

      let qAdLeads = supabase
        .from("ad_leads")
        .select(`
          id,
          created_at,
          ad_title,
          conversion_source,
          unit_id,
          contacts!inner(company_id)
        `)
        .eq("contacts.company_id", activeCompanyId!);

      if (fromDate) {
        qAdLeads = qAdLeads.gte("created_at", startOfDay(fromDate).toISOString());
      }
      if (toDate) {
        qAdLeads = qAdLeads.lte("created_at", endOfDay(toDate).toISOString());
      }
      if (selectedUnitId) {
        qAdLeads = qAdLeads.eq("unit_id", selectedUnitId);
      }

      const [resContacts, resAdLeads] = await Promise.all([qContacts, qAdLeads]);
      if (resContacts.error) throw resContacts.error;
      if (resAdLeads.error) throw resAdLeads.error;

      return {
        contacts: (resContacts.data || []) as any[],
        adLeads: (resAdLeads.data || []) as any[],
      };
    },
  });

  // Query 4: Tasks Data
  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: ["reports-tasks", activeCompanyId, selectedUnitId, preset, fromStr, toStr],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select(`
          id,
          status,
          due_date,
          task_type,
          created_at,
          assigned_to,
          unit_id,
          assigned:profiles!tasks_assigned_to_fkey!inner(id, name, company_id)
        `)
        .eq("assigned.company_id", activeCompanyId!);

      if (fromDate) {
        query = query.gte("created_at", startOfDay(fromDate).toISOString());
      }
      if (toDate) {
        query = query.lte("created_at", endOfDay(toDate).toISOString());
      }
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as any[];
    },
  });

  // --- KPI COMPUTATIONS ---
  const convList: any[] = (conversations || []) as any[];
  const oppList: any[] = (opportunities || []) as any[];
  const contactsList: any[] = (contactsData?.contacts || []) as any[];
  const adLeadsList: any[] = (contactsData?.adLeads || []) as any[];
  const tasksList: any[] = (tasksData || []) as any[];

  // 1. Total Conversations & TMA
  const totalConversations = convList.length;
  const resolvedConversations = convList.filter((c) => c.status === "resolved");

  const totalTmaMs = resolvedConversations.reduce((acc, c) => {
    if (c.started_at && c.resolved_at) {
      return acc + (new Date(c.resolved_at).getTime() - new Date(c.started_at).getTime());
    }
    return acc;
  }, 0);

  const avgTmaMinutes = resolvedConversations.length > 0
    ? Math.round(totalTmaMs / resolvedConversations.length / 60000)
    : 0;

  // 2. Sales & CRM KPIs
  const wonOpps = oppList.filter((o) => o.status === "won");

  const totalSalesAmount = wonOpps.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
  const conversionRate = oppList.length > 0 
    ? Math.round((wonOpps.length / oppList.length) * 100) 
    : 0;

  // --- CHART DATA GENERATION ---

  // 1. Conversations per Day (Timeline)
  const conversationTimeline = useMemo(() => {
    try {
      if (!fromDate || !toDate) {
        // Fallback for "all time" timeline (group by date string)
        const dateMap = new Map<string, { date: string; Iniciadas: number; Resolvidas: number }>();
        convList.forEach((c) => {
          const dayStr = format(new Date(c.started_at), "dd/MM", { locale: ptBR });
          if (!dateMap.has(dayStr)) {
            dateMap.set(dayStr, { date: dayStr, Iniciadas: 0, Resolvidas: 0 });
          }
          const item = dateMap.get(dayStr)!;
          item.Iniciadas += 1;
          if (c.status === "resolved") item.Resolvidas += 1;
        });
        return Array.from(dateMap.values()).slice(-30);
      }

      const intervalDays = eachDayOfInterval({ start: fromDate, end: toDate });
      return intervalDays.map((d) => {
        const dayStr = format(d, "dd/MM", { locale: ptBR });
        const dateFormatted = format(d, "yyyy-MM-dd");

        const iniciadas = convList.filter((c) => 
          format(new Date(c.started_at), "yyyy-MM-dd") === dateFormatted
        ).length;

        const finalizadas = convList.filter((c) => 
          c.resolved_at && format(new Date(c.resolved_at), "yyyy-MM-dd") === dateFormatted
        ).length;

        return {
          date: dayStr,
          Iniciadas: iniciadas,
          Resolvidas: finalizadas,
        };
      });
    } catch {
      return [];
    }
  }, [fromDate, toDate, convList]);

  // 2. Peak Hours Distribution (00:00 to 23:00)
  const peakHoursData = useMemo(() => {
    const hoursArr = Array.from({ length: 24 }).map((_, i) => ({
      hour: `${i.toString().padStart(2, "0")}h`,
      Conversas: 0,
    }));

    convList.forEach((c) => {
      const h = new Date(c.started_at).getHours();
      hoursArr[h].Conversas += 1;
    });

    return hoursArr;
  }, [convList]);

  // 3. Channels Distribution
  const channelData = useMemo(() => {
    const channelCounts: Record<string, number> = {};
    convList.forEach((c) => {
      const ch = c.channel || "whatsapp";
      let label = "WhatsApp";
      if (ch === "instagram") label = "Instagram";
      else if (ch === "messenger") label = "Messenger";
      else if (ch === "web") label = "Web / Widget";
      
      channelCounts[label] = (channelCounts[label] || 0) + 1;
    });

    return Object.entries(channelCounts).map(([name, value]) => ({ name, value }));
  }, [convList]);

  // 4. Attendant Performance Table
  const attendantPerformance = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; resolved: number; tmaSumMs: number }>();

    convList.forEach((c: any) => {
      const agentId = c.assigned_agent_id || "unassigned";
      const agentName = c.assigned_agent?.name || (agentId === "unassigned" ? "Não Atribuído" : "Desconhecido");

      if (!map.has(agentId)) {
        map.set(agentId, { id: agentId, name: agentName, total: 0, resolved: 0, tmaSumMs: 0 });
      }

      const item = map.get(agentId)!;
      item.total += 1;

      if (c.status === "resolved") {
        item.resolved += 1;
        if (c.started_at && c.resolved_at) {
          item.tmaSumMs += (new Date(c.resolved_at).getTime() - new Date(c.started_at).getTime());
        }
      }
    });

    return Array.from(map.values()).map((item) => {
      const avgMs = item.resolved > 0 ? item.tmaSumMs / item.resolved : 0;
      const tmaMin = Math.round(avgMs / 60000);
      const resolutionRate = item.total > 0 ? Math.round((item.resolved / item.total) * 100) : 0;

      return {
        ...item,
        tmaMin,
        resolutionRate,
      };
    }).sort((a, b) => b.total - a.total);
  }, [convList]);

  // 5. Sales Won vs Lost per Day
  const salesTimeline = useMemo(() => {
    try {
      if (!fromDate || !toDate) {
        const dateMap = new Map<string, { date: string; Ganhas: number; Perdidas: number }>();
        oppList.forEach((o) => {
          const dayStr = format(new Date(o.updated_at || o.created_at), "dd/MM", { locale: ptBR });
          if (!dateMap.has(dayStr)) {
            dateMap.set(dayStr, { date: dayStr, Ganhas: 0, Perdidas: 0 });
          }
          const item = dateMap.get(dayStr)!;
          if (o.status === "won") item.Ganhas += 1;
          if (o.status === "lost") item.Perdidas += 1;
        });
        return Array.from(dateMap.values()).slice(-30);
      }

      const intervalDays = eachDayOfInterval({ start: fromDate, end: toDate });
      return intervalDays.map((d) => {
        const dayStr = format(d, "dd/MM", { locale: ptBR });
        const dateFormatted = format(d, "yyyy-MM-dd");

        const ganhas = oppList.filter((o) => 
          o.status === "won" && format(new Date(o.updated_at || o.created_at), "yyyy-MM-dd") === dateFormatted
        ).length;

        const perdidas = oppList.filter((o) => 
          o.status === "lost" && format(new Date(o.updated_at || o.created_at), "yyyy-MM-dd") === dateFormatted
        ).length;

        return {
          date: dayStr,
          Ganhas: ganhas,
          Perdidas: perdidas,
        };
      });
    } catch {
      return [];
    }
  }, [fromDate, toDate, oppList]);

  // 6. Pipeline Value per Stage
  const pipelineStageData = useMemo(() => {
    const stageMap = new Map<string, { id: string; name: string; color: string; totalValue: number; count: number }>();

    // Pre-populate stageMap with all defined stages from DB
    (stagesData || []).forEach((s: any) => {
      stageMap.set(s.id, {
        id: s.id,
        name: s.name,
        color: s.color || "#3b82f6",
        totalValue: 0,
        count: 0,
      });
    });

    oppList.forEach((o: any) => {
      if (o.stage_id && stageMap.has(o.stage_id)) {
        const item = stageMap.get(o.stage_id)!;
        item.count += 1;
        item.totalValue += Number(o.value) || 0;
      } else if (o.stage?.name) {
        const key = o.stage.name;
        if (!stageMap.has(key)) {
          stageMap.set(key, { id: key, name: key, color: o.stage.color || "#3b82f6", totalValue: 0, count: 0 });
        }
        const item = stageMap.get(key)!;
        item.count += 1;
        item.totalValue += Number(o.value) || 0;
      }
    });

    return Array.from(stageMap.values());
  }, [stagesData, oppList]);

  // 7. Seller Ranking Table
  const sellerRanking = useMemo(() => {
    const map = new Map<string, { 
      id: string; 
      name: string; 
      wonCount: number; 
      lostCount: number; 
      openCount: number; 
      totalWonValue: number; 
      totalOpenValue: number 
    }>();

    oppList.forEach((o: any) => {
      const sellerId = o.owner_id || "unassigned";
      const sellerName = o.owner?.name || (sellerId === "unassigned" ? "Sem Vendedor" : "Desconhecido");

      if (!map.has(sellerId)) {
        map.set(sellerId, { 
          id: sellerId, 
          name: sellerName, 
          wonCount: 0, 
          lostCount: 0, 
          openCount: 0, 
          totalWonValue: 0, 
          totalOpenValue: 0 
        });
      }

      const item = map.get(sellerId)!;
      if (o.status === "won") {
        item.wonCount += 1;
        item.totalWonValue += Number(o.value) || 0;
      } else if (o.status === "lost") {
        item.lostCount += 1;
      } else {
        item.openCount += 1;
        item.totalOpenValue += Number(o.value) || 0;
      }
    });

    return Array.from(map.values()).map((item) => {
      const closedTotal = item.wonCount + item.lostCount;
      const winRate = closedTotal > 0 ? Math.round((item.wonCount / closedTotal) * 100) : 0;
      return {
        ...item,
        winRate,
      };
    }).sort((a, b) => b.totalWonValue - a.totalWonValue || b.totalOpenValue - a.totalOpenValue);
  }, [oppList]);

  // 8. Lead Origin (Organic vs Ads)
  const leadOriginData = useMemo(() => {
    const totalLeads = contactsList.length;
    const adsCount = adLeadsList.length;
    const organicCount = Math.max(0, totalLeads - adsCount);

    return [
      { name: "Orgânico / Direto", value: organicCount },
      { name: "Meta Ads (Anúncios)", value: adsCount },
    ];
  }, [contactsList, adLeadsList]);

  // 9. Tasks Status & Types
  const taskStatusData = useMemo(() => {
    const done = tasksList.filter((t) => t.status === "done").length;
    const pending = tasksList.filter((t) => t.status === "pending").length;
    const overdue = tasksList.filter((t) => t.status === "pending" && t.due_date && new Date(t.due_date) < new Date()).length;

    return [
      { name: "Concluídas", value: done, color: "#10b981" },
      { name: "Pendentes (No Prazo)", value: Math.max(0, pending - overdue), color: "#3b82f6" },
      { name: "Atrasadas", value: overdue, color: "#ef4444" },
    ];
  }, [tasksList]);

  const taskTypeData = useMemo(() => {
    const map: Record<string, number> = {
      Ligação: 0,
      Mensagem: 0,
      Reunião: 0,
      "Follow-up": 0,
      Outros: 0,
    };

    tasksList.forEach((t) => {
      if (t.task_type === "call") map["Ligação"]++;
      else if (t.task_type === "message") map["Mensagem"]++;
      else if (t.task_type === "meeting") map["Reunião"]++;
      else if (t.task_type === "follow_up") map["Follow-up"]++;
      else map["Outros"]++;
    });

    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [tasksList]);

  const isLoadingAll = loadingConvs || loadingOpps || loadingContacts || loadingTasks;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Filter Controls Bar */}
      <Card className="p-3 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Filter className="h-4 w-4 text-primary" />
            <span>Período de Análise:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Mês Atual</SelectItem>
                <SelectItem value="all">Todo o Período</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-normal">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yy")} - {format(dateRange.to, "dd/MM/yy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    "Selecionar Período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleCustomDateSelect}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </Card>

      {/* Top Summary KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Conversations */}
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total de Atendimentos
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{totalConversations}</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {resolvedConversations.length} encerrados ({totalConversations > 0 ? Math.round((resolvedConversations.length / totalConversations) * 100) : 0}%)
          </p>
        </Card>

        {/* KPI 2: Avg TMA */}
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tempo Médio (TMA)
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatTMA(avgTmaMinutes)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Por atendimento concluído</p>
        </Card>

        {/* KPI 3: Total Sales */}
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Vendas Fechadas
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatBRL(totalSalesAmount)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{wonOpps.length} oportunidades ganhas</p>
        </Card>

        {/* KPI 4: Conversion Rate */}
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Taxa de Conversão
            </span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {conversionRate}%
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">De oportunidades para vendas</p>
        </Card>
      </div>

      {/* Main Tabbed Analytics Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-10">
          <TabsTrigger value="conversations" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4" />
            Atendimentos
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5 text-xs sm:text-sm">
            <TrendingUp className="h-4 w-4" />
            Vendas & CRM
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            Contatos & Leads
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5 text-xs sm:text-sm">
            <CheckSquare className="h-4 w-4" />
            Tarefas & Equipe
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ATENDIMENTOS & COMUNICAÇÃO */}
        <TabsContent value="conversations" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Chart: Timeline of Conversations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Evolução dos Atendimentos
                </CardTitle>
                <CardDescription className="text-xs">
                  Volume diário de conversas iniciadas vs. finalizadas
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {isLoadingAll ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={conversationTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Iniciadas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Resolvidas" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Chart: Peak Hours Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Horários de Pico (Demanda por Hora)
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribuição de início de conversas nas 24h do dia
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {isLoadingAll ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="Conversas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Attendant Performance Table & Channel Distribution */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Desempenho por Atendente
                </CardTitle>
                <CardDescription className="text-xs">
                  Métricas individuais de atendimento no período selecionado
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAll ? (
                  <div className="flex py-12 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : attendantPerformance.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">Nenhum atendimento registrado no período.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Atendente</TableHead>
                        <TableHead className="text-xs text-center">Atendimentos</TableHead>
                        <TableHead className="text-xs text-center">Finalizados</TableHead>
                        <TableHead className="text-xs text-center">Taxa de Resolução</TableHead>
                        <TableHead className="text-xs text-right">TMA Médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendantPerformance.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium text-xs flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">{initials(row.name)}</AvatarFallback>
                            </Avatar>
                            <span>{row.name}</span>
                          </TableCell>
                          <TableCell className="text-xs text-center font-semibold">{row.total}</TableCell>
                          <TableCell className="text-xs text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                            {row.resolved}
                          </TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant="secondary" className="text-[11px] font-normal">
                              {row.resolutionRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground font-mono">
                            {formatTMA(row.tmaMin)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart: Channels */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-blue-500" />
                  Divisão por Canal
                </CardTitle>
                <CardDescription className="text-xs">
                  Proporção de conversas por canal de entrada
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[260px] flex flex-col items-center justify-center">
                {isLoadingAll ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : channelData.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem dados de canais.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {channelData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: VENDAS & CRM */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Chart: Sales Won vs Lost */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Vendas Ganhas vs. Perdidas
                </CardTitle>
                <CardDescription className="text-xs">
                  Quantidade de oportunidades encerradas por dia
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {isLoadingAll ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Ganhas" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Perdidas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Chart: Pipeline Value per Stage */}
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Valor do Funil por Estágio
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Acumulado financeiro (R$) em cada etapa do Kanban
                  </CardDescription>
                </div>

                {/* Pipeline Select Dropdown */}
                {pipelines && pipelines.length > 0 && (
                  <Select
                    value={selectedPipelineId}
                    onValueChange={(val) => {
                      navigate({
                        search: (prev) => ({ ...prev, pipelineId: val }),
                        replace: true,
                      });
                    }}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs bg-background">
                      <SelectValue placeholder="Selecione o Funil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Funis</SelectItem>
                      {pipelines.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardHeader>
              <CardContent className="h-[280px]">
                {isLoadingAll ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : pipelineStageData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Nenhuma oportunidade no funil.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineStageData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip formatter={(value: number) => [formatBRL(value), "Valor em R$"]} />
                      <Bar dataKey="totalValue" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                        {pipelineStageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Seller Ranking Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                Ranking de Vendedores (Comercial)
              </CardTitle>
              <CardDescription className="text-xs">
                Desempenho de vendas fechadas e receita gerada por vendedor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAll ? (
                <div className="flex py-12 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sellerRanking.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">Nenhuma venda registrada no período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs text-center">Em Negociação</TableHead>
                      <TableHead className="text-xs text-center">Vendas Ganhas</TableHead>
                      <TableHead className="text-xs text-center">Perdidas</TableHead>
                      <TableHead className="text-xs text-center">Taxa de Conversão</TableHead>
                      <TableHead className="text-xs text-right">Valor Ganho (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellerRanking.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-xs flex items-center gap-2">
                          <Badge variant={idx === 0 ? "default" : "outline"} className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                            {idx + 1}
                          </Badge>
                          <span>{row.name}</span>
                        </TableCell>
                        <TableCell className="text-xs text-center text-blue-600 dark:text-blue-400 font-medium">
                          {row.openCount} {row.totalOpenValue > 0 && `(${formatBRL(row.totalOpenValue)})`}
                        </TableCell>
                        <TableCell className="text-xs text-center font-bold text-emerald-600 dark:text-emerald-400">
                          {row.wonCount}
                        </TableCell>
                        <TableCell className="text-xs text-center text-muted-foreground">
                          {row.lostCount}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {row.winRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBRL(row.totalWonValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: CONTATOS & LEADS */}
        <TabsContent value="leads" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Card Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-500" />
                  Novos Contatos Cadastrados
                </CardTitle>
                <CardDescription className="text-xs">
                  Entrada de contatos na base no período selecionado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-xs text-muted-foreground">Novos Contatos no Período</span>
                  <span className="text-xl font-bold">{contactsList.length}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-xs text-muted-foreground">Provenientes de Meta Ads</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{adLeadsList.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">% Origem de Anúncios</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {contactsList.length > 0 ? Math.round((adLeadsList.length / contactsList.length) * 100) : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Chart: Origin of Leads */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-purple-500" />
                  Origem dos Leads
                </CardTitle>
                <CardDescription className="text-xs">
                  Proporção de cadastros orgânicos vs. campanhas no Meta Ads
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[240px] flex items-center justify-center">
                {isLoadingAll ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leadOriginData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: TAREFAS & PRODUTIVIDADE */}
        <TabsContent value="tasks" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Chart: Task Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-emerald-500" />
                  Status das Tarefas
                </CardTitle>
                <CardDescription className="text-xs">
                  Tarefas concluídas no prazo vs. pendentes e atrasadas
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[260px] flex items-center justify-center">
                {isLoadingAll ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : tasksList.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nenhuma tarefa criada no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taskStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {taskStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Chart: Task Types */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-amber-500" />
                  Distribuição por Tipo de Tarefa
                </CardTitle>
                <CardDescription className="text-xs">
                  Volume de tarefas por modalidade de ação
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[260px]">
                {isLoadingAll ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={taskTypeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
