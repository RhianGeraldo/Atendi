import { useState, useMemo, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import {
  Plus,
  GripVertical,
  Settings2,
  Calendar,
  DollarSign,
  User,
  UserCheck,
  MessageCircle,
  CheckSquare,
  FileText,
  Building,
  Search,
  X,
  RefreshCw,
  TrendingUp,
  Target,
  Award,
  LayoutGrid,
  List,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Eye,
  Layers,
  FilterX,
  Clock,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { format, isSameDay, startOfMonth, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { calculateOpportunitySla, formatSlaDuration, type SlaStatus } from "@/types/crm-sla";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DateRangeCalendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import { triggerOpportunityCapiAction } from "@/lib/api/meta-capi.functions";
import { useNavigate } from "@tanstack/react-router";
import { initials } from "@/lib/format";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";

export const Route = createFileRoute("/_authenticated/pipeline")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      pipelineId: search.pipelineId as string | undefined,
      opportunityId: search.opportunityId as string | undefined,
      status: search.status as string | undefined,
    };
  },
  component: () => (
    <ProtectedMenuRoute menuKey="pipeline">
      <PipelinePage />
    </ProtectedMenuRoute>
  ),
});

// Cards por página: em cada coluna do Kanban e na tabela
const KANBAN_PAGE_SIZE = 20;
const TABLE_PAGE_SIZE = 30;

// Oportunidade como vem do banco (os campos de cima vêm sempre; os de baixo só no card completo)
type OpportunityRow = {
  id: string;
  title: string;
  value: number | null;
  stage_id: string;
  expected_close_date: string | null;
  contact_id: string | null;
  created_at: string;
  notes: string | null;
  owner_id: string | null;
  unit_id: string | null;
  status: string | null;
  conversation_id: string | null;
  stage_entered_at: string | null;
  contacts: { name: string | null; phone: string | null } | null;
  profiles?: { id: string; name: string | null; email: string | null } | null;
  tasks?: { id: string; status: string }[];
  opportunity_notes?: { id: string }[];
  units?: { name: string | null } | null;
};

function PipelinePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();

  const isManagerOrAdmin =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    search.pipelineId || null,
  );
  const [statusFilter, setStatusFilter] = useState<string>(search.status || "open");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  // Período de entrada da oportunidade no funil (created_at)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showMetrics, setShowMetrics] = useState<boolean>(false);
  const [tableSortField, setTableSortField] = useState<
    "created_at" | "value" | "title" | "expected_close_date"
  >("created_at");
  const [tableSortAsc, setTableSortAsc] = useState<boolean>(false);
  const [highlightedOppId, setHighlightedOppId] = useState<string | null>(
    search.opportunityId || null,
  );
  // Paginação sob demanda por coluna no Kanban (carrega inicialmente 20 por coluna)
  const [stageLimits, setStageLimits] = useState<Record<string, number>>({});
  // Paginação sob demanda no modo Tabela / Lista (carrega inicialmente 30 linhas)
  const [tableLimit, setTableLimit] = useState<number>(TABLE_PAGE_SIZE);
  // Durante o arraste a coluna não carrega mais cards sozinha
  const [isDragging, setIsDragging] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef<string | null>(null);

  // Busca dados da oportunidade alvo se veio na URL (garante pipeline correto e que não seja ocultada por filtro)
  const { data: targetOpp } = useQuery({
    queryKey: ["target-opportunity-lookup", search.opportunityId],
    enabled: !!search.opportunityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id, stage_id, status, created_at, pipeline_stages(pipeline_id)")
        .eq("id", search.opportunityId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Sincroniza pipeline e status quando a oportunidade alvo é carregada
  useEffect(() => {
    if (targetOpp) {
      const targetPipelineId = (targetOpp.pipeline_stages as any)?.pipeline_id;
      if (targetPipelineId && targetPipelineId !== selectedPipelineId) {
        setSelectedPipelineId(targetPipelineId);
      }
      if (targetOpp.status && statusFilter !== "all" && targetOpp.status !== statusFilter) {
        setStatusFilter("all");
      }
      // Garante que o período não esconda a oportunidade aberta pelo link
      setDateRange((range) => {
        if (!range?.from || !targetOpp.created_at) return range;
        const createdAt = new Date(targetOpp.created_at);
        const fromDate = new Date(range.from);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(range.to ?? range.from);
        toDate.setHours(23, 59, 59, 999);
        return createdAt < fromDate || createdAt > toDate ? undefined : range;
      });
    }
  }, [targetOpp]);

  // Sincroniza pipelineId da URL se mudar
  useEffect(() => {
    if (search.pipelineId && search.pipelineId !== selectedPipelineId) {
      setSelectedPipelineId(search.pipelineId);
    }
  }, [search.pipelineId]);

  // Atualiza oportunidade destacada caso search param mude
  useEffect(() => {
    if (search.opportunityId) {
      setHighlightedOppId(search.opportunityId);
      hasScrolledRef.current = null;
    }
  }, [search.opportunityId]);

  // Fetch Pipelines
  const { data: pipelines, isLoading: isLoadingPipelines } = useQuery({
    queryKey: ["pipelines", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch Company Users para filtro de responsável
  const { data: companyUsers } = useQuery({
    queryKey: ["company-users", activeCompanyId],
    enabled: !!activeCompanyId && isManagerOrAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, active")
        .eq("company_id", activeCompanyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Set default pipeline via effect
  useEffect(() => {
    if (!selectedPipelineId && pipelines && pipelines.length > 0) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [selectedPipelineId, pipelines]);

  // Fetch Stages
  const { data: stages, isLoading: isLoadingStages } = useQuery({
    queryKey: ["pipeline-stages", selectedPipelineId],
    enabled: !!selectedPipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", selectedPipelineId!)
        .order("order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Oportunidades do funil numa versão leve (sem tarefas, notas, responsável e unidade):
  // contagens, valores, SLA, métricas e ordenação usam todas; os cards completos são
  // buscados só para a página visível de cada coluna (ver opportunityDetails).
  const { data: opportunities, isLoading: isLoadingOpps } = useQuery({
    queryKey: [
      "opportunities",
      activeCompanyId,
      selectedPipelineId,
      profile?.role,
      profile?.id,
      selectedUnitId,
      statusFilter,
      ownerFilter,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    enabled:
      !!selectedPipelineId && !!stages && stages.length > 0 && !!profile?.id && !!activeCompanyId,
    queryFn: async () => {
      const stageIds = stages!.map((s) => s.id);
      const build = () => {
      let query = supabase
        .from("opportunities")
        .select(
          `
          id, title, value, stage_id, expected_close_date, contact_id, created_at, notes, owner_id, unit_id, status, conversation_id, stage_entered_at,
          contacts ( name, phone )
        `,
        )
        .in("stage_id", stageIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Filtro de permissão: agentes comuns veem as próprias oportunidades ou as sem responsável atribuído (null) para atenderem
      if (!isManagerOrAdmin) {
        query = query.or(`owner_id.eq.${profile!.id},owner_id.is.null`);
      } else if (ownerFilter === "unassigned") {
        query = query.is("owner_id", null);
      } else if (ownerFilter !== "all") {
        query = query.eq("owner_id", ownerFilter);
      }

      // Filtra pela unidade selecionada no painel superior
      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      if (dateRange?.from) {
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        query = query.gte("created_at", fromDate.toISOString());
        const toDate = new Date(dateRange.to ?? dateRange.from);
        toDate.setHours(23, 59, 59, 999);
        query = query.lte("created_at", toDate.toISOString());
      }
      return query;
      };

      // O PostgREST devolve no máximo 1.000 linhas por consulta
      const { data, error } = await fetchAllPages(build);
      if (error) throw error;
      return data as OpportunityRow[];
    },
  });

  // Supabase Realtime Subscription para sincronização instantânea
  useEffect(() => {
    if (!activeCompanyId) return;

    // Várias mudanças seguidas (automação, arrastar) viram uma recarga só: sem isso cada
    // evento cancelava a busca do funil inteiro em andamento e começava de novo
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reloadOpportunities = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["opportunities"] });
        qc.invalidateQueries({ queryKey: ["target-opportunity-lookup"] });
        qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      }, 800);
    };

    const channelName = `pipeline-realtime-${activeCompanyId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opportunities",
        },
        reloadOpportunities,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_stages",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
          reloadOpportunities();
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [activeCompanyId, qc]);

  const filteredOpportunities = useMemo(() => {
    if (!opportunities) return [];
    const term = searchTerm.trim().toLowerCase();

    return opportunities.filter((opp: any) => {
      if (term) {
        const title = (opp.title || "").toLowerCase();
        const contactName = (opp.contacts?.name || "").toLowerCase();
        const contactPhone = (opp.contacts?.phone || "").toLowerCase();
        const notes = (opp.notes || "").toLowerCase();
        const matches =
          title.includes(term) ||
          contactName.includes(term) ||
          contactPhone.includes(term) ||
          notes.includes(term);
        if (!matches) return false;
      }

      if (slaFilter !== "all") {
        const stage = stages?.find((s) => s.id === opp.stage_id);
        const sla = calculateOpportunitySla(opp, stage);
        if (sla.status !== slaFilter) return false;
      }

      return true;
    });
  }, [opportunities, searchTerm, slaFilter, stages]);

  // Métricas e Indicadores de Desempenho (KPIs)
  const metrics = useMemo(() => {
    const list = filteredOpportunities || [];
    const totalCount = list.length;
    const totalValue = list.reduce((sum, o) => sum + (o.value || 0), 0);

    const openOpps = list.filter((o) => o.status === "open" || !o.status);
    const openCount = openOpps.length;
    const openValue = openOpps.reduce((sum, o) => sum + (o.value || 0), 0);

    const wonOpps = list.filter((o) => o.status === "won");
    const wonCount = wonOpps.length;
    const wonValue = wonOpps.reduce((sum, o) => sum + (o.value || 0), 0);

    const lostOpps = list.filter((o) => o.status === "lost");
    const lostCount = lostOpps.length;
    const lostValue = lostOpps.reduce((sum, o) => sum + (o.value || 0), 0);

    const finishedCount = wonCount + lostCount;
    const conversionRate =
      finishedCount > 0
        ? (wonCount / finishedCount) * 100
        : totalCount > 0
          ? (wonCount / totalCount) * 100
          : 0;
    const avgTicket =
      wonCount > 0 ? wonValue / wonCount : openCount > 0 ? openValue / openCount : 0;

    let breachedCount = 0;
    let warningCount = 0;
    list.forEach((o) => {
      const stage = stages?.find((s) => s.id === o.stage_id);
      const sla = calculateOpportunitySla(o, stage);
      if (sla.status === "breached") breachedCount++;
      if (sla.status === "warning") warningCount++;
    });

    return {
      totalCount,
      totalValue,
      openCount,
      openValue,
      wonCount,
      wonValue,
      lostCount,
      lostValue,
      conversionRate,
      avgTicket,
      breachedCount,
      warningCount,
    };
  }, [filteredOpportunities, stages]);

  // Lista ordenada para o modo Tabela
  const sortedTableOpportunities = useMemo(() => {
    if (!filteredOpportunities) return [];
    return [...filteredOpportunities].sort((a: any, b: any) => {
      let valA: any = a[tableSortField];
      let valB: any = b[tableSortField];

      if (tableSortField === "created_at" || tableSortField === "expected_close_date") {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (tableSortField === "value") {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else if (tableSortField === "title") {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      }

      if (valA < valB) return tableSortAsc ? -1 : 1;
      if (valA > valB) return tableSortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredOpportunities, tableSortField, tableSortAsc]);

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    statusFilter !== "open" ||
    ownerFilter !== "all" ||
    slaFilter !== "all" ||
    !!dateRange?.from;

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("open");
    setOwnerFilter("all");
    setSlaFilter("all");
    setDateRange(undefined);
  };

  const datePresets: { label: string; range: () => DateRange }[] = [
    { label: "Hoje", range: () => ({ from: new Date(), to: new Date() }) },
    { label: "Últimos 7 dias", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
    { label: "Últimos 30 dias", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
    { label: "Este mês", range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  ];

  // Organize opportunities by stage
  const columns = useMemo(() => {
    if (!stages) return {};
    const cols: Record<string, any[]> = {};
    stages.forEach((s) => {
      // Como no Todoo: atrasadas no SLA da etapa no topo (a mais atrasada primeiro),
      // depois o resto da mais nova para a mais antiga
      const overdueOf = new Map<string, number>();
      const stageOpps = (filteredOpportunities || []).filter((o) => o.stage_id === s.id);
      for (const o of stageOpps) {
        const sla = calculateOpportunitySla(o, s);
        if (sla.status === "breached") overdueOf.set(o.id, sla.elapsedMinutes - sla.limitMinutes);
      }
      cols[s.id] = stageOpps.sort((a, b) => {
        const oa = overdueOf.get(a.id);
        const ob = overdueOf.get(b.id);
        if (oa !== undefined || ob !== undefined) {
          if (oa === undefined) return 1;
          if (ob === undefined) return -1;
          if (oa !== ob) return ob - oa;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });
    return cols;
  }, [stages, filteredOpportunities]);

  // Cards completos só da página visível: no Kanban, blocos de 20 de cada coluna; na
  // tabela, blocos de 30 linhas. "Carregar mais" busca só o bloco novo.
  const detailChunks = useMemo(() => {
    const chunks: string[][] = [];
    const split = (ids: string[], size: number) => {
      for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
    };
    if (viewMode === "kanban") {
      for (const stage of stages || []) {
        const limit = stageLimits[stage.id] ?? KANBAN_PAGE_SIZE;
        split((columns[stage.id] || []).slice(0, limit).map((o) => o.id), KANBAN_PAGE_SIZE);
      }
    } else {
      split(sortedTableOpportunities.slice(0, tableLimit).map((o) => o.id), TABLE_PAGE_SIZE);
    }
    return chunks;
  }, [viewMode, stages, stageLimits, columns, sortedTableOpportunities, tableLimit]);

  const detailQueries = useQueries({
    queries: detailChunks.map((ids) => ({
      queryKey: ["opportunities", "details", ids.join(",")],
      // Blocos mudam de chave quando a coluna muda: os antigos saem logo do cache
      gcTime: 60_000,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("opportunities")
          .select(
            `
            id, title, value, stage_id, expected_close_date, contact_id, created_at, notes, owner_id, unit_id, status, conversation_id, stage_entered_at,
            contacts ( name, phone ),
            profiles:owner_id ( id, name, email ),
            tasks ( id, status ),
            opportunity_notes ( id ),
            units ( name )
          `,
          )
          .in("id", ids);
        if (error) throw error;
        return data as OpportunityRow[];
      },
    })),
  });

  // Cards completos já buscados ficam guardados: quando a coluna muda (card arrastado,
  // oportunidade nova no topo) os blocos mudam de chave, e o card mantém a versão anterior
  // até o bloco novo chegar, em vez de piscar sem tarefas e responsável
  const detailsCacheRef = useRef(new Map<string, OpportunityRow>());
  const detailsById = useMemo(() => {
    const map = detailsCacheRef.current;
    for (const q of detailQueries) for (const opp of q.data || []) map.set(opp.id, opp);
    return map;
  }, [detailQueries]);

  // Card completo quando já chegou; a versão leve (sem tarefas e responsável) enquanto carrega.
  // Etapa e status vêm da versão leve, que é a que o arrastar atualiza na hora.
  const withDetails = (opp: OpportunityRow): OpportunityRow => {
    const full = detailsById.get(opp.id);
    // Campos da lista leve (mais nova) por cima; do bloco só vêm tarefas, notas, responsável e unidade
    return full ? { ...full, ...opp } : opp;
  };

  // Oportunidade aberta pelo link fora da primeira página da coluna: abre a coluna até ela
  useEffect(() => {
    if (!highlightedOppId || !stages) return;
    for (const stage of stages) {
      const index = (columns[stage.id] || []).findIndex((o) => o.id === highlightedOppId);
      if (index < 0) continue;
      const limit = stageLimits[stage.id] ?? KANBAN_PAGE_SIZE;
      if (index >= limit) {
        const needed = Math.ceil((index + 1) / KANBAN_PAGE_SIZE) * KANBAN_PAGE_SIZE;
        setStageLimits((prev) => ({ ...prev, [stage.id]: needed }));
      }
      return;
    }
  }, [highlightedOppId, columns, stages, stageLimits]);

  // Auto-scroll suave para o card da oportunidade destacada
  useEffect(() => {
    if (!highlightedOppId) return;
    if (hasScrolledRef.current === highlightedOppId) return;

    const timer = setTimeout(() => {
      const cardEl = document.getElementById(`opp-card-${highlightedOppId}`);
      if (cardEl) {
        hasScrolledRef.current = highlightedOppId;
        cardEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

        // Temporizador para encerrar o destaque intenso após 6 segundos
        const clearTimer = setTimeout(() => {
          setHighlightedOppId(null);
        }, 6000);

        return () => clearTimeout(clearTimer);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [highlightedOppId, opportunities, stages]);

  const moveOpportunity = useMutation({
    mutationFn: async ({ oppId, newStageId }: { oppId: string; newStageId: string }) => {
      const targetStageName = stages?.find((s) => s.id === newStageId)?.name || "Nova etapa";

      const { error: oppError } = await supabase
        .from("opportunities")
        .update({
          stage_id: newStageId,
        })
        .eq("id", oppId);
      if (oppError) throw oppError;

      // Record stage movement in opportunity_history
      const { error: histError } = await supabase.from("opportunity_history").insert({
        opportunity_id: oppId,
        user_id: profile?.id,
        action_type: "stage_change",
        description: `Oportunidade movida para a etapa "${targetStageName}"`,
      });
      if (histError && histError.code !== "42P01") {
        console.warn("Could not record stage history:", histError);
      }

      // Dispara evento CAPI da Meta para avanço de etapa no funil (se configurado)
      if (activeCompanyId) {
        triggerOpportunityCapiAction({
          data: {
            companyId: activeCompanyId,
            opportunityId: oppId,
            triggerType: "stage_change",
            stageId: newStageId,
          },
        }).catch((err) => console.warn("[CAPI] Falha ao disparar evento de etapa:", err));
      }
    },
    onMutate: async ({ oppId, newStageId }) => {
      // 1. Cancel any outgoing refetches for opportunities
      await qc.cancelQueries({ queryKey: ["opportunities"] });

      // 2. Snapshot all matching opportunity queries
      const previousQueries = qc.getQueriesData({ queryKey: ["opportunities"] });

      // 3. Optimistically update all opportunity queries in cache immediately
      qc.setQueriesData({ queryKey: ["opportunities"] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((opp: any) =>
          opp.id === oppId ? { ...opp, stage_id: newStageId } : opp,
        );
      });

      return { previousQueries };
    },
    onSuccess: () => {
      toast.success("Oportunidade movida para a nova etapa!");
    },
    onError: (err, _variables, context) => {
      toast.error("Erro ao mover oportunidade", { description: err.message });
      // Rollback to previous cache state if mutation fails
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          qc.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification"] });
      qc.invalidateQueries({ queryKey: ["opportunity-stage-answers"] });
      qc.invalidateQueries({ queryKey: ["opportunity"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history"] });
      qc.invalidateQueries({ queryKey: ["contact-journey"] });
    },
  });

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index)
      return;

    if (source.droppableId !== destination.droppableId) {
      moveOpportunity.mutate({ oppId: draggableId, newStageId: destination.droppableId });
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  if (isLoadingPipelines) return <div className="p-6">Carregando CRM...</div>;
  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="p-6">
        <Card className="flex flex-col items-center gap-3 p-12 text-center max-w-lg mx-auto mt-10">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <Settings2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Nenhum Funil Encontrado</h2>
          <p className="text-sm text-muted-foreground">
            Você ainda não configurou um funil de vendas. Acesse as Configurações para criar seu
            primeiro funil e etapas.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      {/* BARRA ÚNICA SUPERIOR: Contexto do Funil, Busca, Filtros em Dropdown, Visualização e Ações */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-2.5 shrink-0 gap-2.5 flex-nowrap overflow-x-auto">
        {/* Lado Esquerdo: Funil + Contador + Busca + Botão Filtros */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Seletor do Funil (mais compacto) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <Select value={selectedPipelineId || ""} onValueChange={setSelectedPipelineId}>
              <SelectTrigger className="h-8 font-semibold text-xs border-border/80 w-[140px] sm:w-[170px] bg-background">
                <SelectValue placeholder="Funil" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="font-medium text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 h-6 font-bold text-muted-foreground shrink-0 hidden sm:inline-flex"
            >
              {opportunities?.length || 0}
            </Badge>
          </div>

          <div className="h-5 w-px bg-border/60 mx-0.5 shrink-0" />

          {/* Campo de Busca Rápida */}
          <div className="relative w-40 sm:w-56 md:w-64 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar oportunidade, contato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Ícone de Filtro com Dropdown (idêntico ao Atendimento) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant={hasActiveFilters ? "default" : "outline"}
                className="h-8 w-8 shrink-0 relative cursor-pointer"
                title="Filtrar por Status, SLA e Atendente"
              >
                <Filter className="h-3.5 w-3.5" />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background animate-pulse" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {hasActiveFilters && (
                <>
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer font-medium text-xs flex items-center justify-between"
                    onClick={handleClearFilters}
                  >
                    <span>Limpar Filtros</span>
                    <FilterX className="h-3.5 w-3.5 text-destructive" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Submenu 1: Status */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                  <span>Status</span>
                  {statusFilter !== "all" && (
                    <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem
                      onClick={() => setStatusFilter("all")}
                      className="cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span>Todos</span>
                      {statusFilter === "all" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatusFilter("open")}
                      className="cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        Em Aberto
                      </span>
                      {statusFilter === "open" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatusFilter("won")}
                      className="cursor-pointer text-xs flex items-center justify-between text-emerald-600 dark:text-emerald-400"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Ganho
                      </span>
                      {statusFilter === "won" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatusFilter("lost")}
                      className="cursor-pointer text-xs flex items-center justify-between text-destructive"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Perdido
                      </span>
                      {statusFilter === "lost" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-destructive" />
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              {/* Submenu 2: SLA */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                  <span>SLA</span>
                  {slaFilter !== "all" && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuItem
                      onClick={() => setSlaFilter("all")}
                      className="cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span>Todos os SLAs</span>
                      {slaFilter === "all" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSlaFilter("breached")}
                      className="cursor-pointer text-xs flex items-center justify-between text-destructive"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        SLA Estourado
                      </span>
                      {slaFilter === "breached" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-destructive" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSlaFilter("warning")}
                      className="cursor-pointer text-xs flex items-center justify-between text-amber-600 dark:text-amber-400"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Em Risco
                      </span>
                      {slaFilter === "warning" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-amber-500" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSlaFilter("ok")}
                      className="cursor-pointer text-xs flex items-center justify-between text-emerald-600 dark:text-emerald-400"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        No Prazo
                      </span>
                      {slaFilter === "ok" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSlaFilter("none")}
                      className="cursor-pointer text-xs flex items-center justify-between text-muted-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                        Sem Limite de SLA
                      </span>
                      {slaFilter === "none" && (
                        <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              {/* Submenu 3: Atendentes / Responsáveis (para admins e gerentes) */}
              {isManagerOrAdmin && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                    <span>Atendente</span>
                    {ownerFilter !== "all" && (
                      <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                      <DropdownMenuItem
                        onClick={() => setOwnerFilter("all")}
                        className="cursor-pointer text-xs flex items-center justify-between"
                      >
                        <span>Todos os Atendentes</span>
                        {ownerFilter === "all" && (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setOwnerFilter("unassigned")}
                        className="cursor-pointer text-xs flex items-center justify-between text-amber-600 dark:text-amber-400 font-medium"
                      >
                        <span>Sem Responsável (Geral)</span>
                        {ownerFilter === "unassigned" && (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {companyUsers?.map((u) => (
                        <DropdownMenuItem
                          key={u.id}
                          onClick={() => setOwnerFilter(u.id)}
                          className="cursor-pointer text-xs flex items-center justify-between"
                        >
                          <span className="truncate max-w-[170px]">{u.name || u.email}</span>
                          {ownerFilter === u.id && (
                            <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filtro de Período (data de entrada da oportunidade) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={dateRange?.from ? "secondary" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs font-normal gap-1.5 shrink-0 cursor-pointer px-2.5",
                  !dateRange?.from && "text-muted-foreground",
                )}
                title="Filtrar pela data de entrada no funil"
              >
                <Calendar className="h-3.5 w-3.5" />
                {dateRange?.from ? (
                  dateRange.to && !isSameDay(dateRange.to, dateRange.from) ? (
                    <>
                      {format(dateRange.from, "dd/MM/yy")} - {format(dateRange.to, "dd/MM/yy")}
                    </>
                  ) : (
                    format(dateRange.from, "dd/MM/yyyy")
                  )
                ) : (
                  <span className="hidden sm:inline">Período</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex flex-col sm:flex-row">
                <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r flex-wrap">
                  {datePresets.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start text-xs cursor-pointer"
                      onClick={() => setDateRange(preset.range())}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  {dateRange?.from && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start text-xs text-destructive hover:text-destructive cursor-pointer"
                      onClick={() => setDateRange(undefined)}
                    >
                      Limpar período
                    </Button>
                  )}
                </div>
                <DateRangeCalendar
                  initialFocus
                  mode="range"
                  locale={ptBR}
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </div>
            </PopoverContent>
          </Popover>

          {/* Contador de Filtrados se houver filtro ativo */}
          {hasActiveFilters && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 bg-muted/30 px-2 py-0.5 rounded border border-border/40">
              <span>
                Exibindo <strong className="text-foreground">{filteredOpportunities.length}</strong>{" "}
                de {opportunities?.length || 0}
              </span>
              <button
                onClick={handleClearFilters}
                className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                title="Limpar filtros"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Lado Direito: Alternador Quadro/Lista (Apenas Ícone) + Métricas + Atualizar + Nova Oportunidade */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Alternador de Modo: Apenas Ícones */}
          <div className="flex items-center border rounded-lg p-0.5 bg-muted/40">
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 cursor-pointer"
              onClick={() => setViewMode("kanban")}
              title="Visualização em Quadro (Kanban)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 cursor-pointer"
              onClick={() => setViewMode("list")}
              title="Visualização em Lista (Tabela)"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Toggle de Métricas / KPIs */}
          <Button
            variant={showMetrics ? "secondary" : "outline"}
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() => setShowMetrics(!showMetrics)}
            title={showMetrics ? "Ocultar métricas" : "Exibir métricas"}
          >
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
          </Button>

          {/* Botão de Atualizar */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["opportunities"] });
              qc.invalidateQueries({ queryKey: ["pipelines"] });
              qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
              toast.info("Funil atualizado!");
            }}
            title="Atualizar funil"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <div className="h-5 w-px bg-border/60 mx-0.5 hidden sm:block" />

          {/* Botão Nova Oportunidade */}
          <OpportunityDialog defaultPipelineId={selectedPipelineId || ""}>
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs font-medium gap-1.5 shadow-xs cursor-pointer px-2.5 sm:px-3"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova Oportunidade</span>
            </Button>
          </OpportunityDialog>
        </div>
      </header>

      {/* Barra de Métricas e KPIs */}
      {showMetrics && (
        <div className="px-6 py-2.5 border-b bg-card/60 backdrop-blur-sm shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            {/* 1. Total Funil */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Total Funil</p>
                <p className="text-sm font-bold text-foreground">
                  {formatCurrency(metrics.totalValue)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {metrics.totalCount} oportunidades
                </span>
              </div>
              <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                <Target className="h-4 w-4" />
              </div>
            </div>

            {/* 2. Em Aberto */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Em Aberto</p>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(metrics.openValue)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {metrics.openCount} ativas
                </span>
              </div>
              <div className="p-2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>

            {/* 3. Ganhos */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Ganhos</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(metrics.wonValue)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {metrics.wonCount} fechadas
                </span>
              </div>
              <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>

            {/* 4. Perdidos */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Perdidos</p>
                <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(metrics.lostValue)}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {metrics.lostCount} perdidas
                </span>
              </div>
              <div className="p-2 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <XCircle className="h-4 w-4" />
              </div>
            </div>

            {/* 5. Taxa de Conversão */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Conversão</p>
                <p className="text-sm font-bold text-violet-600 dark:text-violet-400">
                  {metrics.conversionRate.toFixed(1)}%
                </p>
                <span className="text-[10px] text-muted-foreground">taxa de sucesso</span>
              </div>
              <div className="p-2 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>

            {/* 6. Ticket Médio */}
            <div className="bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Ticket Médio</p>
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(metrics.avgTicket)}
                </p>
                <span className="text-[10px] text-muted-foreground">por oportunidade</span>
              </div>
              <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Award className="h-4 w-4" />
              </div>
            </div>

            {/* 7. SLA Estourado */}
            <div
              className={`bg-background/80 border rounded-lg p-2.5 flex items-center justify-between shadow-xs ${metrics.breachedCount > 0 ? "border-rose-400/60 dark:border-rose-900/60 bg-rose-500/[0.04]" : ""}`}
            >
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">SLA Estourado</p>
                <p
                  className={`text-sm font-bold ${metrics.breachedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}
                >
                  {metrics.breachedCount}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {metrics.warningCount > 0 ? `${metrics.warningCount} em risco` : "sem atrasos"}
                </span>
              </div>
              <div
                className={`p-2 rounded-md shrink-0 ${metrics.breachedCount > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse" : "bg-muted text-muted-foreground"}`}
              >
                <Clock className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal: Modo Kanban ou Modo Lista/Tabela */}
      {viewMode === "kanban" ? (
        <div ref={boardContainerRef} className="flex-1 overflow-x-auto p-6 scroll-smooth">
          {isLoadingStages || isLoadingOpps ? (
            <div className="text-muted-foreground text-sm">Carregando quadro...</div>
          ) : !stages || stages.length === 0 ? (
            <div className="text-center mt-10 text-muted-foreground">
              Este funil ainda não tem etapas. Adicione etapas nas configurações.
            </div>
          ) : (
            <DragDropContext
              onDragStart={() => setIsDragging(true)}
              onDragEnd={(result) => {
                setIsDragging(false);
                onDragEnd(result);
              }}
            >
              <div className="flex h-full items-start gap-4 pb-4">
                {stages.map((stage) => {
                  const stageOpps = columns[stage.id] || [];
                  const currentLimit = stageLimits[stage.id] ?? KANBAN_PAGE_SIZE;
                  const visibleOpps = stageOpps.slice(0, currentLimit).map(withDetails);
                  const hasMoreInStage = stageOpps.length > currentLimit;
                  const remainingInStage = stageOpps.length - currentLimit;

                  const stageTotal = stageOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);
                  const stageBreachedCount = stageOpps.filter(
                    (o) => calculateOpportunitySla(o, stage).status === "breached",
                  ).length;

                  return (
                    <div
                      key={stage.id}
                      id={`opp-stage-col-${stage.id}`}
                      className="flex h-full max-h-full w-[310px] shrink-0 flex-col rounded-xl bg-card border border-border/70 shadow-sm"
                    >
                      <div
                        className="flex items-center justify-between p-3.5 border-b border-border/50 shrink-0 rounded-t-xl bg-card/80"
                        style={{ borderTop: `4px solid ${stage.color || "#3b82f6"}` }}
                      >
                        <div
                          className="flex items-center gap-1.5 truncate flex-1 flex-wrap"
                          title={stage.name}
                        >
                          <h3 className="font-semibold text-sm truncate">{stage.name}</h3>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 h-4 font-bold shrink-0"
                          >
                            {stageOpps.length}
                          </Badge>
                          {stage.sla_enabled && stage.sla_minutes ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 h-4 gap-0.5 font-medium border-border/70 text-muted-foreground bg-muted/40 shrink-0"
                              title={`SLA da Etapa: ${formatSlaDuration(stage.sla_minutes)}`}
                            >
                              <Clock className="h-2.5 w-2.5 text-muted-foreground/70" />
                              <span>{formatSlaDuration(stage.sla_minutes)}</span>
                            </Badge>
                          ) : null}
                          {stageBreachedCount > 0 ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5 h-4 font-bold shrink-0 animate-pulse bg-rose-600"
                              title={`${stageBreachedCount} oportunidade(s) atrasadas nesta etapa`}
                            >
                              {stageBreachedCount}{" "}
                              {stageBreachedCount === 1 ? "atrasada" : "atrasadas"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {stageTotal > 0 && (
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(stageTotal)}
                            </span>
                          )}
                          <OpportunityDialog
                            defaultPipelineId={selectedPipelineId || ""}
                            defaultStageId={stage.id}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                              title="Adicionar nesta etapa"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </OpportunityDialog>
                        </div>
                      </div>

                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            data-load-more-root
                            className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[160px] transition-colors rounded-b-xl scroll-smooth ${snapshot.isDraggingOver ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                          >
                            {stageOpps.length === 0 && !snapshot.isDraggingOver ? (
                              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-border/60 rounded-xl my-1 bg-muted/20">
                                <p className="text-xs text-muted-foreground font-medium">
                                  Nenhuma oportunidade
                                </p>
                                <OpportunityDialog
                                  defaultPipelineId={selectedPipelineId || ""}
                                  defaultStageId={stage.id}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[11px] mt-2 text-primary hover:bg-primary/5 cursor-pointer"
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Criar nesta etapa
                                  </Button>
                                </OpportunityDialog>
                              </div>
                            ) : (
                              visibleOpps.map((opp, index) => (
                                <Draggable key={opp.id} draggableId={opp.id} index={index}>
                                  {(provided, snapshot) => {
                                    const pendingTasksCount =
                                      opp.tasks?.filter(
                                        (t: any) => t.status === "pending" || t.status === "todo",
                                      ).length || 0;
                                    const completedTasksCount =
                                      opp.tasks?.filter((t: any) => t.status === "done").length ||
                                      0;
                                    const totalTasks = opp.tasks?.length || 0;
                                    const notesCount =
                                      (opp.notes && String(opp.notes).trim().length > 0 ? 1 : 0) +
                                      (Array.isArray(opp.opportunity_notes)
                                        ? opp.opportunity_notes.length
                                        : 0);
                                    const hasNotes = notesCount > 0;
                                    const isHighlighted = highlightedOppId === opp.id;
                                    const slaInfo = calculateOpportunitySla(opp, stage);
                                    const isBreached = slaInfo.status === "breached";

                                    return (
                                      <div
                                        id={`opp-card-${opp.id}`}
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        style={provided.draggableProps.style}
                                        className={`group relative rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all duration-300 ${
                                          snapshot.isDragging
                                            ? "shadow-2xl ring-2 ring-primary/60 transition-none z-50 opacity-95"
                                            : isHighlighted
                                              ? "ring-4 ring-primary ring-offset-2 ring-offset-background border-primary shadow-2xl scale-[1.02] z-30 bg-primary/[0.05] animate-pulse"
                                              : isBreached
                                                ? "border-rose-400/80 dark:border-rose-900/60 hover:border-rose-500 bg-rose-500/[0.02]"
                                                : "border-border/80 hover:border-primary/40"
                                        }`}
                                      >
                                        <OpportunityDialog
                                          opportunity={opp}
                                          defaultPipelineId={selectedPipelineId || ""}
                                        >
                                          <div className="cursor-pointer space-y-3">
                                            {/* Title */}
                                            <div className="font-semibold text-sm leading-tight text-foreground hover:text-primary transition-colors line-clamp-2 pr-6">
                                              {opp.title}
                                            </div>

                                            {/* Contact & Atendente row */}
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                                <Avatar className="h-6 w-6 border bg-background shrink-0">
                                                  <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                                                    {initials(opp.contacts?.name || "??")}
                                                  </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col truncate">
                                                  <span className="text-xs text-foreground font-medium truncate">
                                                    {opp.contacts?.name || "Contato Desconhecido"}
                                                  </span>
                                                  {opp.contacts?.phone && (
                                                    <span className="text-[10px] text-muted-foreground truncate">
                                                      {opp.contacts.phone}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Atendente Badge */}
                                              {opp.profiles?.name ? (
                                                <div
                                                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/70 text-muted-foreground shrink-0 border border-border/40"
                                                  title={`Atendente: ${opp.profiles.name}`}
                                                >
                                                  <UserCheck className="h-3 w-3 text-primary shrink-0" />
                                                  <span className="truncate max-w-[90px]">
                                                    {opp.profiles.name}
                                                  </span>
                                                </div>
                                              ) : (
                                                <div
                                                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/30"
                                                  title="Oportunidade sem responsável atribuído (disponível para a equipe da unidade)"
                                                >
                                                  <UserCheck className="h-3 w-3 text-amber-500 shrink-0" />
                                                  <span className="truncate max-w-[90px]">
                                                    Disponível
                                                  </span>
                                                </div>
                                              )}
                                            </div>

                                            {/* Middle Row: Unidade (1º), Status (2º), SLA (3º), Valor (Direita) */}
                                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {!selectedUnitId && opp.units?.name && (
                                                  <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit max-w-full">
                                                    <Building className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">
                                                      {opp.units.name}
                                                    </span>
                                                  </div>
                                                )}

                                                {opp.status && (
                                                  <Badge
                                                    variant={
                                                      opp.status === "won"
                                                        ? "default"
                                                        : opp.status === "lost"
                                                          ? "destructive"
                                                          : "secondary"
                                                    }
                                                    className={`text-[10px] px-1.5 h-5 font-medium ${opp.status === "won" ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
                                                  >
                                                    {opp.status === "won"
                                                      ? "Ganho"
                                                      : opp.status === "lost"
                                                        ? "Perdido"
                                                        : "Aberto"}
                                                  </Badge>
                                                )}

                                                {slaInfo.status !== "none" ? (
                                                  <Badge
                                                    variant="outline"
                                                    className={`text-[10px] px-1.5 h-5 gap-1 font-semibold ${
                                                      slaInfo.status === "breached"
                                                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
                                                        : slaInfo.status === "warning"
                                                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                          : "bg-muted/40 text-muted-foreground border-border/40 font-normal"
                                                    }`}
                                                    title={`SLA da Etapa: ${formatSlaDuration(slaInfo.limitMinutes)} (${slaInfo.percentElapsed}% decorrido)`}
                                                  >
                                                    {slaInfo.status === "breached" ? (
                                                      <AlertTriangle className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400 animate-pulse shrink-0" />
                                                    ) : (
                                                      <Clock className="h-2.5 w-2.5 shrink-0" />
                                                    )}
                                                    <span>{slaInfo.badgeLabel}</span>
                                                  </Badge>
                                                ) : (opp.status === "open" || !opp.status) &&
                                                  slaInfo.badgeLabel ? (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-normal text-muted-foreground bg-muted/30 border-border/40"
                                                    title="Tempo nesta etapa (sem limite de SLA definido)"
                                                  >
                                                    <Clock className="h-2.5 w-2.5 text-muted-foreground/70 shrink-0" />
                                                    <span>{slaInfo.badgeLabel}</span>
                                                  </Badge>
                                                ) : null}
                                              </div>

                                              <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0 whitespace-nowrap">
                                                {formatCurrency(opp.value || 0)}
                                              </div>
                                            </div>

                                            {/* Observação da Oportunidade */}
                                            {opp.notes && opp.notes.trim().length > 0 && (
                                              <p
                                                className="text-[11px] text-muted-foreground line-clamp-1 italic bg-muted/40 px-2 py-1 rounded border border-border/30 mt-1.5"
                                                title={`Observação: ${opp.notes}`}
                                              >
                                                "{opp.notes}"
                                              </p>
                                            )}

                                            {/* Footer: Tarefas e Notas (Esquerda) e Data (Direita) */}
                                            <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-border/40 gap-2">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {totalTasks > 0 ? (
                                                  pendingTasksCount > 0 ? (
                                                    <Badge
                                                      variant="outline"
                                                      className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                      title={`${pendingTasksCount} tarefa(s) pendente(s)`}
                                                    >
                                                      <CheckSquare className="h-3 w-3" />
                                                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                                      </span>
                                                      {pendingTasksCount}
                                                    </Badge>
                                                  ) : (
                                                    <Badge
                                                      variant="outline"
                                                      className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                      title="Todas as tarefas concluídas"
                                                    >
                                                      <CheckSquare className="h-3 w-3" />
                                                      {totalTasks}
                                                    </Badge>
                                                  )
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-normal text-muted-foreground/60 border-border/40 bg-muted/20"
                                                    title="Sem tarefas"
                                                  >
                                                    <CheckSquare className="h-3 w-3" />0
                                                  </Badge>
                                                )}

                                                {hasNotes ? (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                    title={`${notesCount} anotação(ões)`}
                                                  >
                                                    <FileText className="h-3 w-3" />
                                                    {notesCount}
                                                  </Badge>
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-5 gap-1 font-normal text-muted-foreground/60 border-border/40 bg-muted/20"
                                                    title="Sem notas"
                                                  >
                                                    <FileText className="h-3 w-3" />0
                                                  </Badge>
                                                )}
                                              </div>

                                              {opp.expected_close_date && (
                                                <div
                                                  className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 shrink-0"
                                                  title="Data Prevista de Fechamento"
                                                >
                                                  <Calendar className="h-3 w-3" />
                                                  {format(
                                                    new Date(opp.expected_close_date),
                                                    "dd/MMM",
                                                    { locale: ptBR },
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </OpportunityDialog>

                                        {/* Quick Actions (Hover) */}
                                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <div>
                                                  <ContactChatButton
                                                    contactId={opp.contact_id}
                                                    contactName={opp.contacts?.name || ""}
                                                    phone={opp.contacts?.phone || ""}
                                                    conversationId={opp.conversation_id}
                                                    unitId={opp.unit_id}
                                                  />
                                                </div>
                                              </TooltipTrigger>
                                              <TooltipContent side="top">
                                                <p className="text-xs">Ir para conversa</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        </div>
                                      </div>
                                    );
                                  }}
                                </Draggable>
                              ))
                            )}
                            {provided.placeholder}

                            {/* Próximos 20 cards: carregam sozinhos ao rolar até o fim da coluna (como no Todoo) */}
                            {hasMoreInStage && (
                              <ColumnLoadMore
                                loaded={currentLimit}
                                remaining={remainingInStage}
                                paused={isDragging}
                                onLoad={() =>
                                  setStageLimits((prev) => ({
                                    ...prev,
                                    [stage.id]: currentLimit + KANBAN_PAGE_SIZE,
                                  }))
                                }
                              />
                            )}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </div>
      ) : (
        /* Visualização em Lista / Tabela */
        <div data-load-more-root className="flex-1 overflow-auto p-6">
          <Card className="border border-border/70 shadow-sm overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none font-semibold text-xs"
                      onClick={() => {
                        if (tableSortField === "title") {
                          setTableSortAsc(!tableSortAsc);
                        } else {
                          setTableSortField("title");
                          setTableSortAsc(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Oportunidade
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-xs">Contato</TableHead>
                    <TableHead className="font-semibold text-xs">Etapa</TableHead>
                    <TableHead className="font-semibold text-xs">SLA / Tempo</TableHead>
                    <TableHead className="font-semibold text-xs">Status</TableHead>
                    <TableHead className="font-semibold text-xs">Responsável</TableHead>
                    {!selectedUnitId && (
                      <TableHead className="font-semibold text-xs">Unidade</TableHead>
                    )}
                    <TableHead
                      className="cursor-pointer select-none font-semibold text-xs"
                      onClick={() => {
                        if (tableSortField === "value") {
                          setTableSortAsc(!tableSortAsc);
                        } else {
                          setTableSortField("value");
                          setTableSortAsc(false);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Valor (R$)
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none font-semibold text-xs"
                      onClick={() => {
                        if (tableSortField === "expected_close_date") {
                          setTableSortAsc(!tableSortAsc);
                        } else {
                          setTableSortField("expected_close_date");
                          setTableSortAsc(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        Previsão
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="font-semibold text-xs">Tarefas & Notas</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingStages || isLoadingOpps ? (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="text-center py-10 text-muted-foreground text-sm"
                      >
                        Carregando oportunidades...
                      </TableCell>
                    </TableRow>
                  ) : sortedTableOpportunities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p className="text-sm font-medium text-muted-foreground">
                            Nenhuma oportunidade encontrada
                          </p>
                          <OpportunityDialog defaultPipelineId={selectedPipelineId || ""}>
                            <Button variant="outline" size="sm" className="h-8 text-xs mt-1">
                              <Plus className="h-3.5 w-3.5 mr-1" /> Criar Oportunidade
                            </Button>
                          </OpportunityDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTableOpportunities.slice(0, tableLimit).map(withDetails).map((opp: any) => {
                      const stage = stages?.find((s) => s.id === opp.stage_id);
                      const pendingTasksCount =
                        opp.tasks?.filter((t: any) => t.status === "pending" || t.status === "todo")
                          .length || 0;
                      const totalTasks = opp.tasks?.length || 0;
                      const notesCount =
                        (opp.notes && String(opp.notes).trim().length > 0 ? 1 : 0) +
                        (Array.isArray(opp.opportunity_notes) ? opp.opportunity_notes.length : 0);

                      return (
                        <TableRow
                          key={opp.id}
                          className="hover:bg-muted/40 transition-colors group cursor-pointer"
                        >
                          {/* Oportunidade */}
                          <TableCell className="font-medium text-xs">
                            <OpportunityDialog
                              opportunity={opp}
                              defaultPipelineId={selectedPipelineId || ""}
                            >
                              <div className="space-y-0.5">
                                <span className="font-semibold text-foreground hover:text-primary transition-colors block line-clamp-1">
                                  {opp.title}
                                </span>
                                {opp.notes && (
                                  <span className="text-[10px] text-muted-foreground italic line-clamp-1">
                                    "{opp.notes}"
                                  </span>
                                )}
                              </div>
                            </OpportunityDialog>
                          </TableCell>

                          {/* Contato */}
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 border bg-background shrink-0">
                                <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                                  {initials(opp.contacts?.name || "??")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col truncate max-w-[150px]">
                                <span className="text-foreground font-medium truncate">
                                  {opp.contacts?.name || "Contato Desconhecido"}
                                </span>
                                {opp.contacts?.phone && (
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {opp.contacts.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Etapa */}
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold px-2 py-0.5 border"
                              style={{
                                borderColor: stage?.color || "#3b82f6",
                                backgroundColor: `${stage?.color || "#3b82f6"}15`,
                                color: stage?.color || "#3b82f6",
                              }}
                            >
                              {stage?.name || "Sem etapa"}
                            </Badge>
                          </TableCell>

                          {/* SLA / Tempo */}
                          <TableCell className="text-xs">
                            {(() => {
                              const slaInfo = calculateOpportunitySla(opp, stage);
                              if (slaInfo.status === "none") {
                                const isOpen = opp.status === "open" || !opp.status;
                                if (isOpen && slaInfo.badgeLabel) {
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-2 py-0.5 gap-1 font-normal text-muted-foreground bg-muted/30 border-border/40"
                                      title="Tempo nesta etapa (sem limite de SLA definido)"
                                    >
                                      <Clock className="h-2.5 w-2.5 text-muted-foreground/70 shrink-0" />
                                      <span>{slaInfo.badgeLabel}</span>
                                    </Badge>
                                  );
                                }
                                return (
                                  <span className="text-[11px] text-muted-foreground/40">-</span>
                                );
                              }
                              return (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-2 py-0.5 gap-1 font-semibold ${
                                    slaInfo.status === "breached"
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 font-bold"
                                      : slaInfo.status === "warning"
                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                        : "bg-muted/40 text-muted-foreground border-border/40 font-normal"
                                  }`}
                                  title={`SLA da Etapa: ${formatSlaDuration(slaInfo.limitMinutes)} (${slaInfo.percentElapsed}% decorrido)`}
                                >
                                  {slaInfo.status === "breached" ? (
                                    <AlertTriangle className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400 animate-pulse shrink-0" />
                                  ) : (
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                  )}
                                  <span>{slaInfo.badgeLabel}</span>
                                </Badge>
                              );
                            })()}
                          </TableCell>

                          {/* Status */}
                          <TableCell className="text-xs">
                            <Badge
                              variant={
                                opp.status === "won"
                                  ? "default"
                                  : opp.status === "lost"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className={`text-[10px] px-1.5 h-5 font-medium ${opp.status === "won" ? "bg-emerald-600 text-white" : ""}`}
                            >
                              {opp.status === "won"
                                ? "Ganho"
                                : opp.status === "lost"
                                  ? "Perdido"
                                  : "Aberto"}
                            </Badge>
                          </TableCell>

                          {/* Responsável */}
                          <TableCell className="text-xs">
                            {opp.profiles?.name ? (
                              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                                <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate max-w-[120px]">{opp.profiles.name}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/50">
                                Não atribuído
                              </span>
                            )}
                          </TableCell>

                          {/* Unidade */}
                          {!selectedUnitId && (
                            <TableCell className="text-xs text-muted-foreground">
                              {opp.units?.name ? (
                                <div className="flex items-center gap-1 text-[11px]">
                                  <Building className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[100px]">{opp.units.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </TableCell>
                          )}

                          {/* Valor */}
                          <TableCell className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatCurrency(opp.value || 0)}
                          </TableCell>

                          {/* Previsão */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {opp.expected_close_date ? (
                              <div className="flex items-center gap-1 text-[11px]">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(opp.expected_close_date), "dd/MM/yyyy", {
                                  locale: ptBR,
                                })}
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )}
                          </TableCell>

                          {/* Tarefas & Notas */}
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              {totalTasks > 0 && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 h-5 gap-1 font-semibold ${
                                    pendingTasksCount > 0
                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  }`}
                                  title={`${pendingTasksCount} tarefa(s) pendente(s)`}
                                >
                                  <CheckSquare className="h-3 w-3" />
                                  {pendingTasksCount > 0 ? pendingTasksCount : totalTasks}
                                </Badge>
                              )}
                              {notesCount > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 h-5 gap-1 font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                  title={`${notesCount} nota(s)`}
                                >
                                  <FileText className="h-3 w-3" />
                                  {notesCount}
                                </Badge>
                              )}
                              {totalTasks === 0 && notesCount === 0 && (
                                <span className="text-[11px] text-muted-foreground/40">-</span>
                              )}
                            </div>
                          </TableCell>

                          {/* Ações */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <ContactChatButton
                                        contactId={opp.contact_id}
                                        contactName={opp.contacts?.name || ""}
                                        phone={opp.contacts?.phone || ""}
                                        conversationId={opp.conversation_id}
                                        unitId={opp.unit_id}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">Ir para conversa</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <OpportunityDialog
                                opportunity={opp}
                                defaultPipelineId={selectedPipelineId || ""}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                  title="Ver detalhes"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </OpportunityDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {sortedTableOpportunities.length > tableLimit && (
              <TableLoadMore
                loaded={tableLimit}
                total={sortedTableOpportunities.length}
                onLoad={() => setTableLimit((prev) => prev + TABLE_PAGE_SIZE)}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Chama onLoad quando o elemento chega perto do fim da rolagem ([data-load-more-root] mais
 * próximo). Rearma a cada página (loaded): o botão continua montado enquanto houver mais.
 */
function useAutoLoadMore<T extends HTMLElement>(
  loaded: number,
  paused: boolean,
  onLoad: () => void,
) {
  const ref = useRef<T>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    const el = ref.current;
    if (!el || paused) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onLoadRef.current();
        }
      },
      { root: el.closest("[data-load-more-root]"), rootMargin: "0px 0px 300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loaded, paused]);

  return ref;
}

/** "Carregar mais" da coluna do Kanban: carrega sozinho ao rolar até o fim (como no Todoo). */
function ColumnLoadMore({
  loaded,
  remaining,
  paused,
  onLoad,
}: {
  loaded: number;
  remaining: number;
  paused: boolean;
  onLoad: () => void;
}) {
  const ref = useAutoLoadMore<HTMLDivElement>(loaded, paused, onLoad);
  return (
    <div ref={ref} className="pt-1 pb-2 flex justify-center">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-background/80 hover:bg-muted border-dashed border-border/80 w-full cursor-pointer"
        onClick={onLoad}
      >
        Carregar mais (+{Math.min(KANBAN_PAGE_SIZE, remaining)} de {remaining})
      </Button>
    </div>
  );
}

/** Rodapé da tabela: as próximas 30 linhas carregam sozinhas ao rolar até o fim. */
function TableLoadMore({
  loaded,
  total,
  onLoad,
}: {
  loaded: number;
  total: number;
  onLoad: () => void;
}) {
  const ref = useAutoLoadMore<HTMLDivElement>(loaded, false, onLoad);
  return (
    <div ref={ref} className="p-3 border-t bg-muted/20 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        Exibindo <strong>{loaded}</strong> de <strong>{total}</strong> oportunidades
      </span>
      <Button variant="outline" size="sm" className="h-8 text-xs cursor-pointer" onClick={onLoad}>
        Carregar mais (+{Math.min(TABLE_PAGE_SIZE, total - loaded)})
      </Button>
    </div>
  );
}
