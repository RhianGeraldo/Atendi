import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Target,
  Trophy,
  History,
  Info,
  Filter,
  FilterX,
  UserPlus,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { useWavoip } from "@/hooks/use-wavoip";
import { TodooLead, TodooOutcomeType, TodooCampaign } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import { formatTodooPhone } from "./todoo-period";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Abas da página do Todoo, exibidas na mesma barra dos controles do quadro */
  tabs?: ReactNode;
  onCreateCampaignClick?: () => void;
  onCreateContactsClick?: () => void;
}

// Leads fechados (venda / sem sucesso) aparecem no quadro por este período
const CLOSED_LEADS_DAYS = 30;

interface KanbanColumnConfig {
  id: string;
  title: string;
  color: string;
  icon: any;
  statusMatch: string[];
}

const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  {
    id: "pending",
    title: "A Contatar",
    color: "#3b82f6", // Azul
    icon: Flame,
    statusMatch: ["pending"],
  },
  {
    id: "in_progress",
    title: "Em Atendimento",
    color: "#8b5cf6", // Roxo
    icon: MessageSquare,
    statusMatch: ["contacted", "quoted"],
  },
  {
    id: "scheduled",
    title: "Agendado",
    color: "#0ea5e9", // Azul céu
    icon: Calendar,
    statusMatch: ["scheduled"],
  },
  {
    id: "callback",
    title: "Retorno Agendado",
    color: "#f59e0b", // Âmbar
    icon: Clock,
    statusMatch: ["callback"],
  },
  {
    id: "won",
    title: "Venda Realizada",
    color: "#10b981", // Verde Esmeralda
    icon: CheckCircle2,
    statusMatch: ["won"],
  },
  {
    id: "lost",
    title: "Sem Sucesso",
    color: "#ef4444", // Vermelho
    icon: XCircle,
    statusMatch: ["lost"],
  },
];

export function TodooDailyQueue({ tabs, onCreateCampaignClick, onCreateContactsClick }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId, setSelectedUnitId } = useUnit();
  const queryClient = useQueryClient();
  const { startCall, instances: wavoipInstances } = useWavoip();

  // Filtros
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Drawer / Sheet de detalhes do lead
  const [selectedLeadForSheet, setSelectedLeadForSheet] = useState<TodooLead | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Dialog de Desfecho
  const [leadForOutcome, setLeadForOutcome] = useState<TodooLead | null>(null);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeInitialType, setOutcomeInitialType] = useState<TodooOutcomeType>("won");

  // Feedback de cópia
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // 1. Busca todas as campanhas para o filtro
  const { data: campaigns = [] } = useQuery({
    queryKey: ["todoo-campaigns-filter", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_campaigns") as any)
        .select("id, title, type, status, unit_id")
        .eq("company_id", activeCompanyId)
        .order("title");
      if (error) throw error;
      return (data || []) as TodooCampaign[];
    },
  });

  // 2. Unidades que o usuário pode ver
  const { units: allUnits, unitIds: myUnitIds, isAdmin: isCompanyAdmin } = useAccessibleUnits();

  // 3. Consultoras / usuários da empresa (gerente: só a equipe das suas unidades)
  const { data: consultants = [] } = useQuery({
    queryKey: ["todoo-consultants-filter", activeCompanyId, isCompanyAdmin, myUnitIds.join(",")],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, user_units(unit_id)")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      const list = (data || []) as any[];
      if (isCompanyAdmin) return list;
      return list.filter(
        (p) => p.id === profile?.id || (p.user_units || []).some((uu: any) => myUnitIds.includes(uu.unit_id)),
      );
    },
  });

  // 4. Busca todos os leads do Todoo
  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["todoo-leads", activeCompanyId, profile?.id, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = (supabase.from("todoo_leads") as any)
        .select(`
          *,
          campaign:todoo_campaigns(id, title, type, message_template, offer_details, sla_hours),
          assigned_user:profiles(id, name, avatar_url),
          unit:units(id, name, color)
        `)
        .eq("company_id", activeCompanyId)
        .or(
          `status.not.in.(won,lost),updated_at.gte.${new Date(
            Date.now() - CLOSED_LEADS_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString()}`,
        )
        .order("created_at", { ascending: false });

      // Se for consultor normal, apenas os seus leads
      const isManagerOrAdmin =
        profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager";
      if (!isManagerOrAdmin) {
        query = query.eq("assigned_user_id", profile?.id);
      }

      // Filtro de unidade do seletor global (consultora vê todos os seus leads)
      if (isManagerOrAdmin && selectedUnitId && selectedUnitId !== "all") {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TodooLead[];
    },
  });

  // 5. Histórico de eventos do lead para a gaveta lateral
  const { data: leadEvents = [] } = useQuery({
    queryKey: ["todoo-lead-events", selectedLeadForSheet?.id],
    enabled: !!selectedLeadForSheet?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_events") as any)
        .select("*")
        .eq("lead_id", selectedLeadForSheet!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const isManagerOrAdmin =
    profile?.role === "admin_company" ||
    profile?.role === "super_admin" ||
    profile?.role === "manager";

  const hasActiveFilters =
    selectedCampaignId !== "all" || selectedConsultantId !== "all" || !!selectedUnitId;

  const handleClearFilters = () => {
    setSelectedCampaignId("all");
    setSelectedConsultantId("all");
    setSelectedUnitId(null);
  };

  // Leads filtrados pelos controles da barra do Kanban
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Filtro de campanha
      if (selectedCampaignId !== "all" && lead.campaign_id !== selectedCampaignId) {
        return false;
      }

      // Filtro de consultora
      if (selectedConsultantId !== "all" && lead.assigned_user_id !== selectedConsultantId) {
        return false;
      }

      // Busca por texto (nome, telefone, título)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = (lead.contact_name || "").toLowerCase().includes(term);
        const matchPhone = (lead.contact_phone || "").includes(term);
        const matchCamp = (lead.campaign?.title || "").toLowerCase().includes(term);
        if (!matchName && !matchPhone && !matchCamp) return false;
      }

      return true;
    });
  }, [leads, selectedCampaignId, selectedConsultantId, searchTerm]);

  // Agrupamento dos leads por coluna do Kanban
  const columnsData = useMemo(() => {
    const map: Record<string, TodooLead[]> = {
      pending: [],
      in_progress: [],
      scheduled: [],
      callback: [],
      won: [],
      lost: [],
    };

    filteredLeads.forEach((lead) => {
      if (lead.status === "pending") {
        map.pending.push(lead);
      } else if (lead.status === "scheduled") {
        map.scheduled.push(lead);
      } else if (["contacted", "quoted"].includes(lead.status)) {
        map.in_progress.push(lead);
      } else if (lead.status === "callback") {
        map.callback.push(lead);
      } else if (lead.status === "won") {
        map.won.push(lead);
      } else if (lead.status === "lost") {
        map.lost.push(lead);
      } else {
        map.pending.push(lead);
      }
    });

    return map;
  }, [filteredLeads]);

  // Drag and Drop Handler
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const lead = leads.find((l) => l.id === draggableId);
    if (!lead) return;

    const targetColId = destination.droppableId;

    // Se arrastou para Venda, Retorno ou Perdido -> Abre o diálogo de desfecho
    if (targetColId === "won") {
      setLeadForOutcome(lead);
      setOutcomeInitialType("won");
      setOutcomeDialogOpen(true);
      return;
    }

    if (targetColId === "scheduled") {
      setLeadForOutcome(lead);
      setOutcomeInitialType("scheduled");
      setOutcomeDialogOpen(true);
      return;
    }

    if (targetColId === "callback") {
      setLeadForOutcome(lead);
      setOutcomeInitialType("callback");
      setOutcomeDialogOpen(true);
      return;
    }

    if (targetColId === "lost") {
      setLeadForOutcome(lead);
      setOutcomeInitialType("lost");
      setOutcomeDialogOpen(true);
      return;
    }

    // Se arrastou para Em Atendimento ou Pendente -> Atualização direta otimista
    const newStatus = targetColId === "pending" ? "pending" : "contacted";

    // Atualização otimista no cache do React Query
    queryClient.setQueryData(
      ["todoo-leads", activeCompanyId, profile?.id, selectedUnitId],
      (old: TodooLead[] | undefined) => {
        if (!old) return old;
        return old.map((item) => (item.id === lead.id ? { ...item, status: newStatus as any } : item));
      }
    );

    try {
      const now = new Date().toISOString();
      const { error } = await (supabase.from("todoo_leads") as any)
        .update({
          status: newStatus,
          last_interaction_at: now,
          updated_at: now,
          ...(newStatus === "contacted" && !lead.first_contact_at ? { first_contact_at: now } : {}),
        })
        .eq("id", lead.id);

      if (error) throw error;

      toast.success(newStatus === "contacted" ? "Lead movido para Em Atendimento" : "Lead retornado para A Contatar");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao mover lead: " + err.message);
      refetch();
    }
  };

  // Disparar ligação
  const handleCall = async (lead: TodooLead, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.contact_phone) {
      toast.error("Telefone não disponível.");
      return;
    }

    if (wavoipInstances && wavoipInstances.length > 0) {
      try {
        const cleanPhone = lead.contact_phone.replace(/\D/g, "");
        const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        await startCall(formattedPhone, wavoipInstances[0].instance_name);
        toast.success(`Iniciando chamada com ${lead.contact_name}...`);

        if (profile) {
          await (supabase.from("todoo_events") as any).insert({
            lead_id: lead.id,
            campaign_id: lead.campaign_id,
            company_id: lead.company_id,
            user_id: profile.id,
            event_type: "call_attempted",
            notes: "Chamada iniciada via WaVoIP",
            metadata: { phone: lead.contact_phone },
          });
        }
        return;
      } catch (err: any) {
        console.warn("Falha no WaVoIP, abrindo discador:", err);
      }
    }

    window.open(`tel:${lead.contact_phone}`, "_self");
  };

  const handleCopyPhone = (phone: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    toast.success("Telefone copiado!");
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  const handleCopyScript = (script: string) => {
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    toast.success("Script comercial copiado!");
    setTimeout(() => setCopiedScript(false), 2000);
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

  // Abre drawer de detalhes do lead
  const handleOpenLeadSheet = (lead: TodooLead) => {
    setSelectedLeadForSheet(lead);
    setIsSheetOpen(true);
  };

  // Script personalizado com primeiro nome do lead
  const personalizedScript = useMemo(() => {
    if (!selectedLeadForSheet?.campaign?.message_template) return "";
    const firstName = selectedLeadForSheet.contact_name ? selectedLeadForSheet.contact_name.split(" ")[0] : "Cliente";
    return selectedLeadForSheet.campaign.message_template
      .replace(/{nome}/gi, firstName)
      .replace(/{cliente}/gi, firstName);
  }, [selectedLeadForSheet]);

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
                  title="Filtrar por Ação Comercial, Unidade e Consultora"
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
                      {campaigns.map((camp) => (
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

                {/* Submenu 2: Unidade */}
                {allUnits.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer text-xs">
                      <span>Unidade</span>
                      {selectedUnitId && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                        <DropdownMenuItem
                          onClick={() => setSelectedUnitId(null)}
                          className="cursor-pointer text-xs flex items-center justify-between"
                        >
                          <span>Todas as Unidades</span>
                          {!selectedUnitId && (
                            <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {allUnits.map((u) => (
                          <DropdownMenuItem
                            key={u.id}
                            onClick={() => setSelectedUnitId(u.id)}
                            className="cursor-pointer text-xs flex items-center justify-between"
                          >
                            <span className="truncate max-w-[170px]">{u.name}</span>
                            {selectedUnitId === u.id && (
                              <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                )}

                {/* Submenu 3: Consultora (gestor ou admin) */}
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
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-md mx-auto">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3">
              <Target className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-foreground">Nenhum lead na fila comercial</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Crie uma Ação Comercial ou importe sua lista de contatos para abastecer a esteira diária de vendas.
            </p>
            {onCreateCampaignClick && (
              <Button size="sm" onClick={onCreateCampaignClick} className="mt-4 gap-2 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Criar Ação Comercial
              </Button>
            )}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex h-full items-start gap-4 pb-4">
              {KANBAN_COLUMNS.map((column) => {
                const columnLeads = columnsData[column.id] || [];
                const columnRevenue = column.id === "won"
                  ? columnLeads.reduce((acc, curr) => acc + (Number(curr.outcome_value) || 0), 0)
                  : 0;
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
                          {columnLeads.length}
                        </Badge>
                      </div>

                      {/* Totalizador de R$ Ganho */}
                      {column.id === "won" && columnRevenue > 0 && (
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {formatCurrency(columnRevenue)}
                        </span>
                      )}
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
                              const isBreached = lead.sla_deadline && new Date(lead.sla_deadline) < new Date();

                              return (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(dragProvided, dragSnapshot) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      {...dragProvided.dragHandleProps}
                                      style={dragProvided.draggableProps.style}
                                      onClick={() => handleOpenLeadSheet(lead)}
                                      className={cn(
                                        "group rounded-xl border bg-card p-3 shadow-xs transition-all duration-200 cursor-pointer hover:border-primary/50 hover:shadow-md",
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
                                        {lead.unit && (
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
                                              Indicada por <strong className="text-foreground font-medium">{lead.custom_fields.indicadora}</strong>
                                            </p>
                                          )}
                                          {lead.custom_fields?.servico && (
                                            <p className="truncate">Interesse: {lead.custom_fields.servico}</p>
                                          )}
                                        </div>
                                      )}

                                      {/* Informações Específicas da Etapa */}
                                      {lead.status === "callback" && lead.callback_scheduled_at ? (
                                        <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded">
                                          <Clock className="h-3 w-3" />
                                          Retorno: {format(new Date(lead.callback_scheduled_at), "dd/MM 'às' HH:mm")}
                                        </div>
                                      ) : lead.status === "won" && lead.outcome_value ? (
                                        <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                                          <DollarSign className="h-3 w-3" />
                                          {formatCurrency(Number(lead.outcome_value))}
                                        </div>
                                      ) : lead.sla_deadline && !["won", "lost"].includes(lead.status) ? (
                                        <div className="mt-2 text-[10px] text-muted-foreground flex items-center justify-between">
                                          {isBreached ? (
                                            <span className="text-destructive font-medium flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3" /> SLA Atrasado
                                            </span>
                                          ) : (
                                            <span className="opacity-80">
                                              SLA {formatDistanceToNow(new Date(lead.sla_deadline), { addSuffix: true, locale: ptBR })}
                                            </span>
                                          )}
                                        </div>
                                      ) : null}

                                      {/* Ações Rápidas no Rodapé do Card */}
                                      <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                            onClick={(e) => handleCall(lead, e)}
                                            title="Fazer ligação"
                                          >
                                            <Phone className="h-3 w-3 text-blue-500" />
                                            <span>Ligar</span>
                                          </Button>

                                          <ContactChatButton
                                            contactId={lead.contact_id}
                                            contactName={lead.contact_name}
                                            phone={lead.contact_phone}
                                            unitId={lead.unit_id}
                                            trigger={
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                title="Abrir no atendimento"
                                              >
                                                <MessageSquare className="h-3 w-3 text-emerald-500" />
                                                <span>Mensagem</span>
                                              </Button>
                                            }
                                          />
                                        </div>

                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })
                          )}
                          {provided.placeholder}
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

      {/* ======================================================== */}
      {/* GAVETA LATERAL (SHEET) COM DETALHES DO LEAD & SCRIPT     */}
      {/* ======================================================== */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto p-5 space-y-5">
          {selectedLeadForSheet && (
            <>
              <SheetHeader className="text-left space-y-1.5 pb-3 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {selectedLeadForSheet.unit && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: selectedLeadForSheet.unit.color ? `${selectedLeadForSheet.unit.color}18` : undefined,
                          color: selectedLeadForSheet.unit.color || undefined,
                          border: `1px solid ${selectedLeadForSheet.unit.color ? `${selectedLeadForSheet.unit.color}35` : "var(--border)"}`,
                        }}
                      >
                        {selectedLeadForSheet.unit.name}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-muted text-muted-foreground">
                      {selectedLeadForSheet.campaign?.title}
                    </span>
                  </div>
                </div>

                <SheetTitle className="text-lg font-bold text-foreground">
                  {selectedLeadForSheet.contact_name}
                </SheetTitle>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatTodooPhone(selectedLeadForSheet.contact_phone)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopyPhone(selectedLeadForSheet.contact_phone, selectedLeadForSheet.id)}
                    title="Copiar telefone"
                  >
                    {copiedPhoneId === selectedLeadForSheet.id ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </SheetHeader>

              {/* Botões de Ação Imediata */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs h-9"
                  onClick={() => handleCall(selectedLeadForSheet)}
                >
                  <Phone className="h-3.5 w-3.5 text-blue-500" />
                  <span>Fazer Ligação</span>
                </Button>

                <ContactChatButton
                  contactId={selectedLeadForSheet.contact_id}
                  contactName={selectedLeadForSheet.contact_name}
                  phone={selectedLeadForSheet.contact_phone}
                  unitId={selectedLeadForSheet.unit_id}
                  trigger={
                    <Button size="sm" className="gap-2 text-xs h-9 bg-primary text-primary-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Abrir Atendimento</span>
                    </Button>
                  }
                />
              </div>

              {/* Oferta Comercial da Ação */}
              {selectedLeadForSheet.campaign?.offer_details && (
                <div className="p-3.5 rounded-xl bg-muted/50 border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Oferta Comercial</span>
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap">
                    {selectedLeadForSheet.campaign.offer_details}
                  </p>
                </div>
              )}

              {/* Script Comercial Recomendado */}
              {personalizedScript && (
                <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>Script Sugerido</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] gap-1 text-primary hover:bg-primary/10"
                      onClick={() => handleCopyScript(personalizedScript)}
                    >
                      {copiedScript ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedScript ? "Copiado!" : "Copiar Script"}</span>
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap select-all">
                    {personalizedScript}
                  </div>
                </div>
              )}

              {/* Desfecho Rápido (Se desejar mudar sem arrastar) */}
              <div className="p-3.5 rounded-xl border border-border space-y-2">
                <span className="text-xs font-semibold text-foreground block">
                  Registrar Desfecho
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-500/30"
                    onClick={() => {
                      setLeadForOutcome(selectedLeadForSheet);
                      setOutcomeInitialType("won");
                      setOutcomeDialogOpen(true);
                      setIsSheetOpen(false);
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Ganho
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-amber-500/30"
                    onClick={() => {
                      setLeadForOutcome(selectedLeadForSheet);
                      setOutcomeInitialType("callback");
                      setOutcomeDialogOpen(true);
                      setIsSheetOpen(false);
                    }}
                  >
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Retorno
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 text-destructive hover:bg-destructive/10 border-destructive/30"
                    onClick={() => {
                      setLeadForOutcome(selectedLeadForSheet);
                      setOutcomeInitialType("lost");
                      setOutcomeDialogOpen(true);
                      setIsSheetOpen(false);
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Perdido
                  </Button>
                </div>
              </div>

              {/* Histórico do Lead */}
              <div className="space-y-2 pt-2 border-t border-border">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  Histórico de Atividades
                </span>

                {leadEvents.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    Nenhuma atividade registrada ainda para este lead.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {leadEvents.map((evt: any) => (
                      <div key={evt.id} className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <strong className="text-foreground capitalize">
                            {evt.event_type.replace(/_/g, " ")}
                          </strong>
                          <span>{format(new Date(evt.created_at), "dd/MM HH:mm")}</span>
                        </div>
                        {evt.notes && <p className="text-foreground/80">{evt.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog para registrar desfecho (Venda, Retorno Agendado, Perdido) */}
      <TodooOutcomeDialog
        lead={leadForOutcome}
        open={outcomeDialogOpen}
        onOpenChange={setOutcomeDialogOpen}
        initialType={outcomeInitialType}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["todoo-campaigns-list"] });
          queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
        }}
      />
    </div>
  );
}
