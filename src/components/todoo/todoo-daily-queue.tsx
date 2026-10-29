import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  DollarSign,
  User,
  Building2,
  Search,
  X,
  RefreshCw,
  Plus,
  Flame,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  ChevronRight,
  Sparkles,
  FileText,
  SlidersHorizontal,
  Columns3,
  Target,
  Trophy,
  History,
  Info,
  Filter,
  FilterX,
  UserPlus,
  Zap,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { useWavoip } from "@/hooks/use-wavoip";
import { TodooLead, TodooOutcomeType, TodooCampaign } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { formatTodooPhone } from "./todoo-period";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TodooReferrerLink } from "./todoo-referrer-link";
import { TodooStagesDialog } from "./todoo-stages-dialog";
import { TodooAutoDialog } from "./todoo-auto-dialog";
import { useTodooAutoPending } from "./todoo-auto";
import { TodooSendMessageDialog } from "./todoo-send-message-dialog";
import {
  TODOO_CARD_BEHAVIORS,
  TODOO_STAGE_KINDS,
  nextTodooStage,
  fetchAllPages,
  refreshTodooCadence,
  resolveTodooCardStatus,
  resolveTodooLeadStage,
  todooCadenceInfo,
  todooStageActionLabel,
  useTodooPipeline,
  type TodooCardStatus,
  type TodooStage,
} from "./todoo-stages";

interface Props {
  /** Abas da página do Todoo, exibidas na mesma barra dos controles do quadro */
  tabs?: ReactNode;
  onCreateCampaignClick?: () => void;
  onCreateContactsClick?: () => void;
}

// Leads fechados (venda / sem sucesso) aparecem no quadro por este período
const CLOSED_LEADS_DAYS = 30;
// Cards por página em cada coluna ("Carregar mais" busca a próxima)
const BOARD_PAGE_SIZE = 20;

export function TodooDailyQueue({ tabs, onCreateCampaignClick, onCreateContactsClick }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const queryClient = useQueryClient();
  const { startCall, instances: wavoipInstances } = useWavoip();

  // Filtros
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");


  // Dialog de Desfecho
  const [leadForOutcome, setLeadForOutcome] = useState<TodooLead | null>(null);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeInitialType, setOutcomeInitialType] = useState<TodooOutcomeType>("won");
  // Status do card escolhido quando ele pede desfecho (Agendado, Comprou, Sem interesse)
  const [outcomeCardStatusId, setOutcomeCardStatusId] = useState<string | null>(null);

  // Funil de prospecção (etapas da cadência e status dos cards)
  const { stages, statuses } = useTodooPipeline();
  const [stagesDialogOpen, setStagesDialogOpen] = useState(false);
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const autoPending = useTodooAutoPending();
  // Enviar mensagem sem sair do Quadro (com a próxima etapa, para registrar a tentativa)
  const [messageTarget, setMessageTarget] = useState<{ lead: TodooLead; nextStage: TodooStage | null } | null>(null);
  const canConfigureStages = profile?.role === "admin_company" || profile?.role === "super_admin";
  // Excluir card do quadro: só administrador (o contato do CRM continua)
  const canDeleteLeads = canConfigureStages;
  const [leadToDelete, setLeadToDelete] = useState<TodooLead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  // Feedback de cópia
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // 1. Busca todas as campanhas para o filtro
  const { data: campaigns = [] } = useQuery({
    queryKey: ["todoo-campaigns-filter", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_campaigns") as any)
        .select("id, title, type, status, unit_id")
        .eq("company_id", activeCompanyId)
        .eq("status", "active")
        .order("title");
      if (error) throw error;
      return (data || []) as TodooCampaign[];
    },
  });

  // 2. Unidades que o usuário pode ver
  const { unitIds: myUnitIds, isAdmin: isCompanyAdmin } = useAccessibleUnits();
  const unitContext = selectedUnitId && selectedUnitId !== "all" ? selectedUnitId : null;

  // Trocou a unidade na barra lateral: ação e consultora escolhidas podem não existir nela
  useEffect(() => {
    setSelectedCampaignId("all");
    setSelectedConsultantId("all");
  }, [unitContext]);

  // Listas do filtro restritas à unidade do contexto
  const unitCampaigns = useMemo(
    () => (unitContext ? campaigns.filter((c) => !c.unit_id || c.unit_id === unitContext) : campaigns),
    [campaigns, unitContext],
  );

  // 3. Consultoras / usuários da empresa (gerente: só a equipe das suas unidades)
  const { data: consultants = [] } = useQuery({
    queryKey: ["todoo-consultants-filter", activeCompanyId, isCompanyAdmin, myUnitIds.join(","), unitContext],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, user_units(unit_id)")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      const list = (data || []) as any[];
      const inUnits = (p: any, ids: string[]) => (p.user_units || []).some((uu: any) => ids.includes(uu.unit_id));
      if (unitContext) return list.filter((p) => p.id === profile?.id || inUnits(p, [unitContext]));
      if (isCompanyAdmin) return list;
      return list.filter((p) => p.id === profile?.id || inUnits(p, myUnitIds));
    },
  });

  const isManagerOrAdmin =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  // Busca no banco só depois que a pessoa para de digitar
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Cards carregados em cada coluna; filtro novo volta todas para a primeira página
  const [stageLimits, setStageLimits] = useState<Record<string, number>>({});
  useEffect(() => {
    setStageLimits({});
  }, [selectedCampaignId, selectedConsultantId, debouncedSearch, selectedUnitId]);

  // Card arrastado para outra etapa, até a coluna de destino recarregar do banco
  const [movedLeads, setMovedLeads] = useState<Record<string, string>>({});

  // Filtros do quadro aplicados no banco (todas as consultas das colunas usam os mesmos)
  const applyBoardFilters = (query: any) => {
    query = query
      .eq("company_id", activeCompanyId)
      // Ação pausada ou concluída sai da fila até ser retomada
      .eq("campaign.status", "active")
      .or(
        `status.not.in.(won,lost),updated_at.gte.${new Date(
          Date.now() - CLOSED_LEADS_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()}`,
      );

    // Se for consultor normal, apenas os seus leads
    if (!isManagerOrAdmin) query = query.eq("assigned_user_id", profile?.id);

    // Unidade do contexto (seletor da barra lateral), para todos: o quadro mostra só a unidade atual.
    // A consultora também vê os leads dela que estão sem unidade.
    if (selectedUnitId && selectedUnitId !== "all") {
      query = isManagerOrAdmin
        ? query.eq("unit_id", selectedUnitId)
        : query.or(`unit_id.eq.${selectedUnitId},unit_id.is.null`);
    }

    if (selectedCampaignId !== "all") query = query.eq("campaign_id", selectedCampaignId);
    if (selectedConsultantId !== "all") query = query.eq("assigned_user_id", selectedConsultantId);

    // Busca por nome ou telefone (vírgula e parênteses quebram o filtro "or" do PostgREST)
    const term = debouncedSearch.replace(/[,()*%\\"]/g, " ").trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      query = query.or(
        `contact_name.ilike.*${term}*` + (digits.length >= 3 ? `,contact_phone.ilike.*${digits}*` : ""),
      );
    }
    return query;
  };

  // Leads sem etapa (ou com etapa apagada) aparecem na primeira coluna
  const applyStage = (query: any, stage: TodooStage) =>
    stage.id === stages[0]?.id
      ? query.or(`stage_id.eq.${stage.id},stage_id.is.null`)
      : query.eq("stage_id", stage.id);

  const boardKey = [
    "todoo-leads",
    activeCompanyId,
    profile?.id,
    selectedUnitId,
    selectedCampaignId,
    selectedConsultantId,
    debouncedSearch,
  ];

  // Atrasados da coluna, no banco com a mesma regra de todooCadenceInfo: card ativo, fora da
  // quarentena e com o prazo da tentativa (ou o SLA do início) vencido. Devolve os filtros dos
  // atrasados e o filtro do resto (o contrário), ou null quando a coluna não tem atraso.
  const overdueFilters = (stage: TodooStage, now: string) => {
    if (stage.kind === "failed") return null;
    // Status: ativo / parado (sem status cadastrado, todo card conta como ativo)
    let active: string | null = null;
    let stopped: string[] = [];
    if (statuses.length > 0) {
      const activeIds = statuses.filter((st) => st.behavior === "active").map((st) => st.id);
      const fallback = statuses.find((st) => st.is_default) ?? statuses[0];
      const parts = activeIds.length ? [`card_status_id.in.(${activeIds.join(",")})`] : [];
      if (fallback.behavior === "active") parts.push("card_status_id.is.null");
      else stopped.push("card_status_id.is.null");
      if (parts.length === 0) return null;
      active = parts.join(",");
      stopped = [`card_status_id.not.in.(${activeIds.join(",")})`, ...stopped];
    }
    // Prazo: vencido / no prazo ou sem prazo
    const late =
      stage.kind === "start"
        ? `next_action_at.lt.${now},and(next_action_at.is.null,sla_deadline.lt.${now})`
        : `next_action_at.lt.${now}`;
    const onTime =
      stage.kind === "start"
        ? `next_action_at.gte.${now},and(next_action_at.is.null,or(sla_deadline.is.null,sla_deadline.gte.${now}))`
        : `next_action_at.is.null,next_action_at.gte.${now}`;
    return {
      overdue: active ? [active, late] : [late],
      rest: [...stopped, onTime].join(","),
    };
  };

  // 4. Uma página de leads por coluna, como no Kanban do CRM; o total e os atrasados vêm do banco.
  // Os atrasados vêm no topo (o mais atrasado primeiro), depois o resto do mais novo ao mais antigo.
  // Etapa e status entram na chave: mudar o tipo da etapa ou o comportamento de um
  // status muda a contagem de atrasados
  const columnQueryKey = (stage: TodooStage, limit: number) => [
    ...boardKey,
    stage.id,
    stage.kind,
    stage.id === stages[0]?.id,
    limit,
    statuses.map((st) => `${st.id}:${st.behavior}:${st.is_default ? 1 : 0}`).join(","),
  ];

  const columnQueries = useQueries({
    queries: stages.map((stage) => {
      const limit = stageLimits[stage.id] ?? BOARD_PAGE_SIZE;
      return {
        queryKey: columnQueryKey(stage, limit),
        enabled: !!activeCompanyId && !!profile?.id,
        // No useQueries a chave nova ganha outro observador, sem dado anterior: na próxima
        // página a coluna fica com a página que já tinha (do cache), sem recarregar o quadro
        placeholderData: (previous: any) =>
          previous ??
          (limit > BOARD_PAGE_SIZE
            ? queryClient.getQueryData(columnQueryKey(stage, limit - BOARD_PAGE_SIZE))
            : undefined),
        queryFn: async () => {
          // Quarentena vencida volta para o início antes de montar o quadro
          await refreshTodooCadence(activeCompanyId!);

          const baseQuery = (head = false) =>
            applyStage(
              applyBoardFilters(
                (supabase.from("todoo_leads") as any).select(
                  `
                  *,
                  campaign:todoo_campaigns!inner(id, title, type, status, message_template, offer_details, sla_hours),
                  assigned_user:profiles(id, name, avatar_url),
                  unit:units(id, name, color)
                `,
                  { count: "exact", head },
                ),
              ),
              stage,
            );

          const filters = overdueFilters(stage, new Date().toISOString());

          let overdueLeads: TodooLead[] = [];
          let overdue = 0;
          if (filters) {
            let query = baseQuery();
            for (const part of filters.overdue) query = query.or(part);
            const { data, count, error } = await query
              .order("next_action_at", { ascending: true, nullsFirst: true })
              .order("sla_deadline", { ascending: true })
              .order("id", { ascending: true })
              .range(0, limit - 1);
            if (error) throw error;
            overdueLeads = (data || []) as TodooLead[];
            overdue = (count as number | null) ?? 0;
          }

          // O resto completa a página; com a página cheia de atrasados, só a contagem
          const restLimit = limit - overdueLeads.length;
          let restQuery = baseQuery(restLimit <= 0);
          if (filters) restQuery = restQuery.or(filters.rest);
          if (restLimit > 0) {
            restQuery = restQuery
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(0, restLimit - 1);
          }
          const rest = await restQuery;
          if (rest.error) throw rest.error;

          return {
            leads: [...overdueLeads, ...((rest.data || []) as TodooLead[])],
            total: overdue + ((rest.count as number | null) ?? 0),
            overdue,
          };
        },
      };
    }),
  });

  // Faturado de cada coluna (vendas dos últimos 30 dias que estão no quadro)
  const { data: revenueByStage = {} } = useQuery({
    queryKey: [...boardKey, "revenue"],
    enabled: !!activeCompanyId && !!profile?.id && stages.length > 0,
    queryFn: async () => {
      const { data, error } = await fetchAllPages(() =>
        applyBoardFilters(
          (supabase.from("todoo_leads") as any)
            .select("id, stage_id, outcome_value, campaign:todoo_campaigns!inner(status)")
            .eq("status", "won")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true }),
        ),
      );
      if (error) throw error;
      const sums: Record<string, number> = {};
      for (const lead of data) {
        const stage = resolveTodooLeadStage(lead, stages);
        if (stage) sums[stage.id] = (sums[stage.id] || 0) + (Number(lead.outcome_value) || 0);
      }
      return sums;
    },
  });

  const isLoading = stages.length > 0 && columnQueries.some((q) => q.isLoading);
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });

  // Cards carregados de todas as colunas (um card movido aparece na etapa de destino)
  const leads = useMemo(() => {
    const byId = new Map<string, TodooLead>();
    for (const q of columnQueries) for (const lead of q.data?.leads || []) byId.set(lead.id, lead);
    return [...byId.values()].map((lead) =>
      movedLeads[lead.id] ? ({ ...lead, stage_id: movedLeads[lead.id] } as TodooLead) : lead,
    );
  }, [columnQueries, movedLeads]);

  // A unidade vem do contexto da barra lateral e não é filtro do quadro
  const hasActiveFilters = selectedCampaignId !== "all" || selectedConsultantId !== "all";

  const handleClearFilters = () => {
    setSelectedCampaignId("all");
    setSelectedConsultantId("all");
  };

  // Agrupamento dos leads por etapa do Kanban
  const columnsData = useMemo(() => {
    const map: Record<string, TodooLead[]> = {};
    stages.forEach((stage) => {
      map[stage.id] = [];
    });
    leads.forEach((lead) => {
      const stage = resolveTodooLeadStage(lead, stages);
      if (stage) map[stage.id].push(lead);
    });
    return map;
  }, [leads, stages]);

  // Total e atrasados de cada coluna, vindos do banco
  const columnStats = useMemo(() => {
    const map: Record<string, { total: number; overdue: number; loaded: number }> = {};
    stages.forEach((stage, i) => {
      const data = columnQueries[i]?.data;
      map[stage.id] = { total: data?.total ?? 0, overdue: data?.overdue ?? 0, loaded: data?.leads.length ?? 0 };
    });
    return map;
  }, [columnQueries, stages]);

  // Drag and Drop Handler (enquanto arrasta, as colunas não carregam a próxima página sozinhas)
  const [isDragging, setIsDragging] = useState(false);
  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    const { destination, source, draggableId } = result;

    if (!destination) return;
    // A ordem dentro da etapa não é salva: soltar na mesma coluna não muda nada
    if (destination.droppableId === source.droppableId) return;

    const lead = leads.find((l) => l.id === draggableId);
    if (!lead) return;

    const target = stages.find((stage) => stage.id === destination.droppableId);
    if (!target) return;
    await moveLeadToStage(lead, target);
  };

  // Move o card na cadência (a etapa, o prazo e o status são ajustados no banco)
  const moveLeadToStage = async (lead: TodooLead, target: TodooStage) => {
    setMovedLeads((prev) => ({ ...prev, [lead.id]: target.id }));

    try {
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({ stage_id: target.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;

      if (profile) {
        await (supabase.from("todoo_events") as any).insert({
          lead_id: lead.id,
          campaign_id: lead.campaign_id,
          company_id: lead.company_id,
          user_id: profile.id,
          event_type: target.kind === "attempt" ? "cadence_attempt" : "cadence_moved",
          notes: `Movido para ${target.name}`,
          metadata: { from: lead.stage_id ?? null, to: target.id },
        });
      }

      toast.success(`${lead.contact_name}: ${target.name}`);
    } catch (err: any) {
      toast.error("Erro ao mover lead: " + err.message);
    } finally {
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      // Só solta o card depois que todas as colunas recarregaram do banco
      await refetch();
      setMovedLeads((prev) => {
        // Movido de novo enquanto recarregava: a posição nova é de outro movimento
        if (prev[lead.id] !== target.id) return prev;
        const next = { ...prev };
        delete next[lead.id];
        return next;
      });
    }
  };

  // Troca o status do card; Agendado, Comprou e Sem interesse pedem o desfecho
  const changeCardStatus = async (lead: TodooLead, status: TodooCardStatus) => {
    const outcome = TODOO_CARD_BEHAVIORS[status.behavior].outcome;
    if (outcome && lead.status !== outcome) {
      setLeadForOutcome(lead);
      setOutcomeInitialType(outcome);
      setOutcomeCardStatusId(status.id);
      setOutcomeDialogOpen(true);
      return;
    }
    try {
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({ card_status_id: status.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;
      toast.success(`${lead.contact_name}: ${status.name}`);
    } catch (err: any) {
      toast.error("Erro ao mudar status: " + err.message);
    } finally {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
    }
  };

  // Disparar ligação
  const handleCall = async (lead: TodooLead, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.contact_phone) {
      toast.error("Telefone não disponível.");
      return;
    }

    // Liga pelo número da unidade do lead (senão o da sede); sem WaVoIP, abre o discador
    const instance =
      wavoipInstances?.find((i) => i.wavoip_token && i.unit_id === lead.unit_id) ??
      wavoipInstances?.find((i) => i.wavoip_token && !i.unit_id) ??
      wavoipInstances?.find((i) => i.wavoip_token);
    if (!instance) {
      window.open(`tel:${lead.contact_phone}`, "_self");
      return;
    }

    const cleanPhone = lead.contact_phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    // startCall já avisa o erro; só registra a tentativa quando a chamada saiu
    const started = await startCall(formattedPhone, lead.contact_name, instance.wavoip_token);
    if (started && profile) {
      const { error } = await (supabase.from("todoo_events") as any).insert({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        company_id: lead.company_id,
        user_id: profile.id,
        event_type: "call_attempted",
        notes: "Chamada iniciada via WaVoIP",
        metadata: { phone: lead.contact_phone, instance_id: instance.id },
      });
      if (error) console.warn("[todoo] evento da chamada:", error.message);
    }
  };

  // Exclui o card do Todoo (histórico e fila do envio automático saem junto, em cascata)
  const handleDeleteLead = async () => {
    if (!leadToDelete || !canDeleteLeads) return;
    setIsDeletingLead(true);
    try {
      const { data, error } = await (supabase.from("todoo_leads") as any)
        .delete()
        .eq("id", leadToDelete.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Você não tem permissão para excluir este contato.");
      toast.success(`${leadToDelete.contact_name} excluído do Todoo`);
      setLeadToDelete(null);
    } catch (err: any) {
      toast.error("Erro ao excluir contato: " + err.message);
    } finally {
      setIsDeletingLead(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-campaigns-list"] });
    }
  };

  const handleCopyPhone = (phone: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    toast.success("Telefone copiado!");
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ======================================================== */}
      {/* BARRA SUPERIOR DE FILTROS & INDICADORES DO QUADRO KANBAN */}
      {/* ======================================================== */}
      <header className="border-b border-border bg-card/60 backdrop-blur-xs px-4 py-2.5 sm:px-6 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Abas da página */}
          {tabs}

          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de Busca */}
            <div className="relative w-44 xl:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar cliente ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Ícone de Filtro com Dropdown (mesmo padrão do CRM e Atendimento) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant={hasActiveFilters ? "default" : "outline"}
                  className="h-8 w-8 shrink-0 relative cursor-pointer"
                  title="Filtrar por Ação Comercial e Consultora"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background animate-pulse" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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

                {/* Submenu 1: Ação Comercial */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                    <span>Ação Comercial</span>
                    {selectedCampaignId !== "all" && (
                      <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64 max-h-64 overflow-y-auto">
                      <DropdownMenuItem
                        onClick={() => setSelectedCampaignId("all")}
                        className="cursor-pointer text-xs flex items-center justify-between"
                      >
                        <span>Todas as Ações</span>
                        {selectedCampaignId === "all" && (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {unitCampaigns.map((camp) => (
                        <DropdownMenuItem
                          key={camp.id}
                          onClick={() => setSelectedCampaignId(camp.id)}
                          className="cursor-pointer text-xs flex items-center justify-between"
                        >
                          <span className="truncate max-w-[200px]">{camp.title}</span>
                          {selectedCampaignId === camp.id && (
                            <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Submenu 2: Consultora (gestor ou admin) */}
                {isManagerOrAdmin && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                      <span>Consultora</span>
                      {selectedConsultantId !== "all" && (
                        <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                        <DropdownMenuItem
                          onClick={() => setSelectedConsultantId("all")}
                          className="cursor-pointer text-xs flex items-center justify-between"
                        >
                          <span>Todas as Consultoras</span>
                          {selectedConsultantId === "all" && (
                            <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {consultants.map((c) => (
                          <DropdownMenuItem
                            key={c.id}
                            onClick={() => setSelectedConsultantId(c.id)}
                            className="cursor-pointer text-xs flex items-center justify-between"
                          >
                            <span className="truncate max-w-[170px]">{c.name}</span>
                            {selectedConsultantId === c.id && (
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

            {/* Configurar etapas (admins) */}
            {canConfigureStages && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5 bg-background shrink-0"
                onClick={() => setStagesDialogOpen(true)}
                title="Configurar etapas do quadro"
              >
                <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden md:inline">Etapas</span>
              </Button>
            )}

            {/* Envio automático (admins) */}
            {canConfigureStages && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5 bg-background shrink-0"
                onClick={() => setAutoDialogOpen(true)}
                title="Mensagens automáticas da cadência"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden md:inline">Automático</span>
              </Button>
            )}

            {/* Botão Atualizar */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs bg-background shrink-0"
              onClick={() => refetch()}
              title="Atualizar lista"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>

            <div className="h-5 w-px bg-border/60 mx-0.5 shrink-0 hidden sm:block" />

            {/* Cadastro de Contatos (prospecção / indicação) */}
            {onCreateContactsClick && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateContactsClick}
                className="h-8 text-xs gap-1.5 shrink-0 bg-background"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Cadastrar Contatos</span>
              </Button>
            )}

            {/* Ação de Criar Ação Comercial */}
            {onCreateCampaignClick && (
              <Button
                size="sm"
                onClick={onCreateCampaignClick}
                className="h-8 text-xs gap-1.5 shadow-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Ação</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* ÁREA PRINCIPAL DO KANBAN (DRAG & DROP CONTEXT)           */}
      {/* ======================================================== */}
      <div className="flex-1 overflow-x-auto p-4 sm:px-6 sm:py-5 scroll-smooth">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Carregando quadro comercial...</p>
          </div>
        ) : (
          <DragDropContext onDragStart={() => setIsDragging(true)} onDragEnd={handleDragEnd}>
            <div className="flex h-full items-start gap-4 pb-4">
              {stages.map((stage) => {
                const columnKey = stage.id;
                const column = {
                  id: columnKey,
                  title: stage.name,
                  color: stage.color,
                  icon: TODOO_STAGE_KINDS[stage.kind].icon,
                };
                const columnLeads = columnsData[columnKey] || [];
                const stats = columnStats[columnKey];
                const columnRevenue = revenueByStage[columnKey] || 0;
                const columnOverdue = stats?.overdue ?? 0;
                const remaining = Math.max(0, (stats?.total ?? 0) - (stats?.loaded ?? 0));
                const IconComponent = column.icon;

                return (
                  <div
                    key={column.id}
                    className="flex h-full max-h-full min-w-[250px] flex-1 basis-0 flex-col rounded-xl bg-card border border-border shadow-xs"
                  >
                    {/* Cabeçalho da Coluna */}
                    <div
                      className="p-3 border-b border-border/70 shrink-0 rounded-t-xl bg-card/90 flex items-center justify-between gap-2"
                      style={{ borderTop: `4px solid ${column.color}` }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <IconComponent className="h-4 w-4 shrink-0" style={{ color: column.color }} />
                        <h3 className="font-semibold text-xs text-foreground truncate">
                          {column.title}
                        </h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-bold shrink-0">
                          {stats?.total ?? columnLeads.length}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {columnOverdue > 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[10px] font-semibold text-destructive"
                            title="Tentativas atrasadas nesta etapa"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {columnOverdue}
                          </span>
                        )}
                        {/* Totalizador de R$ das vendas da etapa */}
                        {columnRevenue > 0 && (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(columnRevenue)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Área Droppable da Coluna */}
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[180px] transition-colors rounded-b-xl scroll-smooth",
                            snapshot.isDraggingOver ? "bg-primary/5 ring-1 ring-primary/20" : ""
                          )}
                        >
                          {columnLeads.length === 0 && !snapshot.isDraggingOver ? (
                            <div className="flex flex-col items-center justify-center py-10 px-3 text-center border border-dashed border-border/60 rounded-lg my-1 bg-muted/10 text-muted-foreground">
                              <p className="text-[11px]">Nenhum lead nesta etapa</p>
                              <span className="text-[10px] opacity-75 mt-0.5">
                                Arraste contatos para cá
                              </span>
                            </div>
                          ) : (
                            columnLeads.map((lead, index) => {
                              const cardStatus = resolveTodooCardStatus(lead, statuses);
                              const cadence = todooCadenceInfo(lead, stage, cardStatus);
                              const nextStage = nextTodooStage(stage, stages);

                              return (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(dragProvided, dragSnapshot) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      style={dragProvided.draggableProps.style}
                                      className={cn(
                                        "group rounded-xl border bg-card p-3 shadow-xs transition-all duration-200 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-md",
                                        dragSnapshot.isDragging
                                          ? "shadow-xl ring-2 ring-primary/60 z-50 opacity-95 scale-[1.02]"
                                          : "border-border/80"
                                      )}
                                    >
                                      {/* Topo do Card: Nome e Telefone */}
                                      <div className="flex items-start justify-between gap-1.5">
                                        <div className="min-w-0 flex-1">
                                          <h4 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                                            {lead.contact_name}
                                          </h4>
                                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                            <span>{formatTodooPhone(lead.contact_phone)}</span>
                                            <button
                                              type="button"
                                              onClick={(e) => handleCopyPhone(lead.contact_phone, lead.id, e)}
                                              className="text-muted-foreground hover:text-foreground"
                                              title="Copiar telefone"
                                            >
                                              {copiedPhoneId === lead.id ? (
                                                <Check className="h-2.5 w-2.5 text-emerald-600" />
                                              ) : (
                                                <Copy className="h-2.5 w-2.5" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Avatar da Consultora */}
                                        {lead.assigned_user?.name && (
                                          <Avatar className="h-5 w-5 shrink-0 border border-border" title={`Responsável: ${lead.assigned_user.name}`}>
                                            {lead.assigned_user.avatar_url && (
                                              <AvatarImage src={lead.assigned_user.avatar_url} />
                                            )}
                                            <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                              {getInitials(lead.assigned_user.name)}
                                            </AvatarFallback>
                                          </Avatar>
                                        )}
                                      </div>

                                      {/* Tags: Unidade e Campanha */}
                                      <div className="flex flex-wrap items-center gap-1 mt-2">
                                        {lead.unit && !unitContext && (
                                          <span
                                            className="text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-[120px]"
                                            style={{
                                              backgroundColor: lead.unit.color ? `${lead.unit.color}18` : undefined,
                                              color: lead.unit.color || undefined,
                                              border: `1px solid ${lead.unit.color ? `${lead.unit.color}35` : "var(--border)"}`,
                                            }}
                                          >
                                            {lead.unit.name}
                                          </span>
                                        )}
                                        {lead.campaign?.title && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground truncate max-w-[130px] border border-border/50">
                                            {lead.campaign.title}
                                          </span>
                                        )}
                                        {lead.status === "quoted" && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                                            Orçamento enviado
                                          </span>
                                        )}
                                      </div>

                                      {/* Origem do cadastro: quem indicou e interesse */}
                                      {(lead.custom_fields?.indicadora || lead.custom_fields?.servico) && (
                                        <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5">
                                          {lead.custom_fields?.indicadora && (
                                            <p className="truncate">
                                              Indicada por{" "}
                                              <TodooReferrerLink
                                                name={lead.custom_fields.indicadora}
                                                contactId={lead.custom_fields?.indicadora_id}
                                                className="text-foreground font-medium"
                                              />
                                            </p>
                                          )}
                                          {lead.custom_fields?.servico && (
                                            <p className="truncate">Interesse: {lead.custom_fields.servico}</p>
                                          )}
                                        </div>
                                      )}

                                      {/* Status do card e prazo da cadência */}
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <CardStatusMenu
                                          status={cardStatus}
                                          statuses={statuses}
                                          onChange={(st) => changeCardStatus(lead, st)}
                                        />
                                        {autoPending.has(lead.id) ? (
                                          <span
                                            className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                                            title="A próxima mensagem sai sozinha pelo envio automático"
                                          >
                                            <Zap className="h-3 w-3" />
                                            Envio automático na fila
                                          </span>
                                        ) : (
                                          <CadenceBadge info={cadence} stage={stage} />
                                        )}
                                      </div>
                                      {lead.status === "callback" && lead.callback_scheduled_at ? (
                                        <div className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded">
                                          <Clock className="h-3 w-3" />
                                          Retorno: {format(new Date(lead.callback_scheduled_at), "dd/MM 'às' HH:mm")}
                                        </div>
                                      ) : lead.status === "won" && lead.outcome_value ? (
                                        <div className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                                          <DollarSign className="h-3 w-3" />
                                          {formatCurrency(Number(lead.outcome_value))}
                                        </div>
                                      ) : null}

                                      {/* Ações Rápidas no Rodapé do Card */}
                                      <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center gap-1 min-w-0">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                          onClick={(e) => handleCall(lead, e)}
                                          title="Ligar"
                                        >
                                          <Phone className="h-3.5 w-3.5 text-blue-500" />
                                        </Button>

                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                          title="Enviar mensagem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMessageTarget({
                                              lead,
                                              nextStage:
                                                cardStatus?.behavior === "active" && stage.kind !== "failed"
                                                  ? nextStage ?? null
                                                  : null,
                                            });
                                          }}
                                        >
                                          <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                                        </Button>

                                        {canDeleteLeads && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            title="Excluir do Todoo"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setLeadToDelete(lead);
                                            }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}

                                        {nextStage && stage.kind !== "failed" ? (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={cn(
                                              "ml-auto h-6 min-w-0 px-2 text-[11px] font-medium gap-0.5",
                                              cadence.state === "overdue"
                                                ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                                                : "text-primary hover:text-primary hover:bg-primary/10",
                                            )}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              moveLeadToStage(lead, nextStage);
                                            }}
                                            title={`Mover para ${nextStage.name}`}
                                          >
                                            <span className="truncate">{todooStageActionLabel(stage, stages)}</span>
                                            <ChevronRight className="h-3 w-3 shrink-0" />
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })
                          )}
                          {provided.placeholder}

                          {/* Próxima página da coluna: carrega sozinha ao rolar até o fim */}
                          {remaining > 0 && (
                            <ColumnLoadMore
                              remaining={remaining}
                              fetching={!!columnQueries[stages.indexOf(stage)]?.isFetching}
                              paused={isDragging || !!columnQueries[stages.indexOf(stage)]?.isError}
                              onLoad={() =>
                                setStageLimits((prev) => ({
                                  ...prev,
                                  [stage.id]: (prev[stage.id] ?? BOARD_PAGE_SIZE) + BOARD_PAGE_SIZE,
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

      {/* Configuração do funil e diálogo de desfecho (Venda, Agendou, Retorno, Perdido) */}
      <TodooStagesDialog open={stagesDialogOpen} onOpenChange={setStagesDialogOpen} />
      <TodooAutoDialog open={autoDialogOpen} onOpenChange={setAutoDialogOpen} />

      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && !isDeletingLead && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">Excluir contato do Todoo?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              <strong className="text-foreground">{leadToDelete?.contact_name}</strong> sai do Quadro Comercial
              com o histórico de tentativas. O contato continua no CRM. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeletingLead} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteLead();
              }}
              disabled={isDeletingLead}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs gap-1.5"
            >
              {isDeletingLead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TodooSendMessageDialog
        lead={messageTarget?.lead ?? null}
        nextStage={messageTarget?.nextStage}
        open={!!messageTarget}
        onOpenChange={(open) => !open && setMessageTarget(null)}
        onSent={() => refetch()}
      />

      <TodooOutcomeDialog
        lead={leadForOutcome}
        open={outcomeDialogOpen}
        initialType={outcomeInitialType}
        onOpenChange={(open) => {
          setOutcomeDialogOpen(open);
          if (!open) setOutcomeCardStatusId(null);
        }}
        onSuccess={async (savedType) => {
          // Desfecho pedido pelo status do card: grava o card escolhido só se o desfecho
          // salvo for o mesmo do card. Se a consultora trocou o tipo no diálogo, o trigger
          // já sincroniza o card pelo status salvo.
          const chosenCard = statuses.find((s) => s.id === outcomeCardStatusId);
          if (chosenCard && leadForOutcome && TODOO_CARD_BEHAVIORS[chosenCard.behavior].outcome === savedType) {
            const { error } = await (supabase.from("todoo_leads") as any)
              .update({ card_status_id: chosenCard.id, updated_at: new Date().toISOString() })
              .eq("id", leadForOutcome.id);
            if (error) toast.error("Desfecho salvo, mas o status do card não foi atualizado: " + error.message);
          }
          setOutcomeCardStatusId(null);
          queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
          refetch();
          queryClient.invalidateQueries({ queryKey: ["todoo-campaigns-list"] });
          queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
        }}
      />
    </div>
  );
}

/**
 * Fim da coluna: busca a próxima página quando aparece na rolagem da coluna. O botão fica
 * como reserva. O observador é refeito ao terminar cada busca, para continuar carregando
 * se o fim da coluna ainda estiver visível (tela alta). Pausado (erro na busca ou card sendo
 * arrastado), só carrega pelo botão.
 */
function ColumnLoadMore({
  remaining,
  fetching,
  paused,
  onLoad,
}: {
  remaining: number;
  fetching: boolean;
  paused: boolean;
  onLoad: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    const el = ref.current;
    if (!el || fetching || paused) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onLoadRef.current();
        }
      },
      { root: el.parentElement, rootMargin: "0px 0px 300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetching, paused]);

  return (
    <Button
      ref={ref}
      variant="outline"
      size="sm"
      className="h-7 w-full border-dashed text-[11px] font-medium text-muted-foreground hover:text-foreground"
      disabled={fetching}
      onClick={onLoad}
    >
      {fetching ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        `Carregar mais (+${Math.min(BOARD_PAGE_SIZE, remaining)} de ${remaining})`
      )}
    </Button>
  );
}

/** Etiqueta do status do card; clicando, troca o status. */
function CardStatusMenu({
  status,
  statuses,
  onChange,
}: {
  status: TodooCardStatus | undefined;
  statuses: TodooCardStatus[];
  onChange: (status: TodooCardStatus) => void;
}) {
  if (!status) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border hover:opacity-80"
          style={{ color: status.color, backgroundColor: `${status.color}15`, borderColor: `${status.color}40` }}
          title="Mudar status"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
          {status.name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
        {statuses.map((st) => {
          const Icon = TODOO_CARD_BEHAVIORS[st.behavior].icon;
          return (
            <DropdownMenuItem
              key={st.id}
              className="text-xs cursor-pointer gap-2"
              onClick={(e) => {
                e.stopPropagation();
                if (st.id !== status.id) onChange(st);
              }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: st.color }} />
              <span className="flex-1">{st.name}</span>
              {st.id === status.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Prazo da cadência: próxima tentativa, atraso ou volta da quarentena. */
function CadenceBadge({
  info,
  stage,
}: {
  info: ReturnType<typeof todooCadenceInfo>;
  stage: TodooStage | undefined;
}) {
  if (info.state === "stopped" || !info.dueAt) return null;
  const distance = formatDistanceToNow(new Date(info.dueAt), { locale: ptBR });
  if (stage?.kind === "failed") {
    return (
      <span className="text-[10px] text-muted-foreground" title={format(new Date(info.dueAt), "dd/MM/yyyy HH:mm")}>
        Volta em {distance}
      </span>
    );
  }
  const what = stage?.kind === "start" ? "1ª tentativa" : "Próxima";
  if (info.state === "overdue") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-semibold text-destructive"
        title={format(new Date(info.dueAt), "dd/MM/yyyy HH:mm")}
      >
        <AlertTriangle className="h-3 w-3" />
        Atrasada há {distance}
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted-foreground" title={format(new Date(info.dueAt), "dd/MM/yyyy HH:mm")}>
      {what} em {distance}
    </span>
  );
}
