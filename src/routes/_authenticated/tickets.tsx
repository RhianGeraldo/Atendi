import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Ticket,
  Plus,
  Search,
  Building2,
  User,
  Users,
  AlertCircle,
  Clock,
  CheckCircle2,
  LayoutList,
  KanbanSquare,
  Filter,
  Loader2,
  MoreVertical,
  Trash2,
  Edit2,
  FolderOpen,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { TicketDialog } from "@/components/tickets/ticket-dialog";
import { TicketDetailsSheet } from "@/components/tickets/ticket-details-sheet";

export const Route = createFileRoute("/_authenticated/tickets")({
  component: () => (
    <ProtectedMenuRoute menuKey="tickets">
      <TicketsPage />
    </ProtectedMenuRoute>
  ),
});

function TicketsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const isSuperAdmin = profile?.role === "super_admin";
  const effectiveCompanyId = isSuperAdmin ? activeCompanyId : profile?.company_id;

  // Estados de navegação e filtros
  const [tab, setTab] = useState<"queue" | "my_tickets" | "all">("queue");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modais
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ticketToEdit, setTicketToEdit] = useState<any>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Busca lista de tickets
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: [
      "tickets",
      effectiveCompanyId,
      selectedUnitId,
    ],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      let query = (supabase as any)
        .from("tickets")
        .select(`
          *,
          unit:units!unit_id(id, name),
          department:departments!department_id(id, name),
          requester_user:profiles!requester_user_id(id, name, email),
          requester_contact:contacts!requester_contact_id(id, name, phone, email),
          assigned_user:profiles!assigned_to_user_id(id, name, email)
        `)
        .eq("company_id", effectiveCompanyId)
        .order("created_at", { ascending: false });

      // Filtro de unidade ativa selecionada no topo
      if (selectedUnitId && selectedUnitId !== "all") {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Atualização em tempo real da lista de tickets
  useEffect(() => {
    if (!effectiveCompanyId) return;

    const channel = supabase
      .channel(`tickets-realtime-${effectiveCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `company_id=eq.${effectiveCompanyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["tickets"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveCompanyId, qc]);

  // Filtragem local
  const filteredTickets = tickets.filter((t: any) => {
    // Filtro por Aba
    if (tab === "my_tickets" && t.requester_user_id !== profile?.id) return false;
    if (tab === "queue" && ["resolved", "closed", "cancelled"].includes(t.status)) return false;

    // Escopo
    if (scopeFilter !== "all" && t.scope !== scopeFilter) return false;
    // Prioridade
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    // Status
    if (statusFilter !== "all" && t.status !== statusFilter) return false;

    // Busca textual
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      const numMatch = String(t.ticket_number || "").includes(lower);
      const titleMatch = t.title?.toLowerCase().includes(lower);
      const descMatch = t.description?.toLowerCase().includes(lower);
      const requesterName = (
        t.scope === "internal" ? t.requester_user?.name : t.requester_contact?.name
      )?.toLowerCase();
      const reqMatch = requesterName?.includes(lower);
      if (!numMatch && !titleMatch && !descMatch && !reqMatch) return false;
    }

    return true;
  });

  // Métricas
  const metrics = {
    totalOpen: tickets.filter((t: any) => ["new", "in_progress"].includes(t.status)).length,
    urgent: tickets.filter((t: any) => t.priority === "urgent" && !["resolved", "closed"].includes(t.status)).length,
    myTickets: tickets.filter((t: any) => t.requester_user_id === profile?.id).length,
    resolved: tickets.filter((t: any) => ["resolved", "closed"].includes(t.status)).length,
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "urgent":
        return <Badge variant="destructive">Urgente</Badge>;
      case "high":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Alta</Badge>;
      case "medium":
        return <Badge variant="secondary">Média</Badge>;
      case "low":
        return <Badge variant="outline">Baixa</Badge>;
      default:
        return <Badge variant="outline">{p}</Badge>;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "new":
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Novo</Badge>;
      case "in_progress":
        return <Badge className="bg-indigo-500 hover:bg-indigo-600 text-white">Em Andamento</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Pendente</Badge>;
      case "resolved":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Resolvido</Badge>;
      case "closed":
        return <Badge variant="outline" className="text-muted-foreground">Fechado</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{s}</Badge>;
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket excluído.");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao excluir ticket.");
    },
  });

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Em Aberto / Fila</p>
            <p className="text-2xl font-bold">{metrics.totalOpen}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center font-bold">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Urgentes</p>
            <p className="text-2xl font-bold text-destructive">{metrics.urgent}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Meus Chamados</p>
            <p className="text-2xl font-bold">{metrics.myTickets}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Resolvidos</p>
            <p className="text-2xl font-bold text-emerald-600">{metrics.resolved}</p>
          </div>
        </Card>
      </div>

      {/* Barra de Abas e Ferramentas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <Tabs value={tab} onValueChange={(val: any) => setTab(val)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="h-4 w-4" /> Fila de Atendimento
            </TabsTrigger>
            <TabsTrigger value="my_tickets" className="gap-2">
              <User className="h-4 w-4" /> Meus Chamados
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <FolderOpen className="h-4 w-4" /> Todos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Alternador de Visão (Lista / Kanban) e Botão de Novo Ticket */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            size="sm"
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
            className="h-8 gap-1"
          >
            <LayoutList className="h-4 w-4" /> Lista
          </Button>
          <Button
            size="sm"
            variant={viewMode === "kanban" ? "default" : "outline"}
            onClick={() => setViewMode("kanban")}
            className="h-8 gap-1"
          >
            <KanbanSquare className="h-4 w-4" /> Kanban
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setTicketToEdit(null);
              setDialogOpen(true);
            }}
            className="h-8 gap-1.5 shadow-sm ml-1"
          >
            <Plus className="h-4 w-4" /> Novo Ticket
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por #nº, título ou solicitante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="relative">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            aria-label="Filtrar por tipo de chamado"
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="internal">Apenas Internos</option>
            <option value="external">Apenas Externos (Clientes)</option>
          </select>
        </div>

        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filtrar por prioridade"
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="all">Todas as Prioridades</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status"
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="new">Novo</option>
            <option value="in_progress">Em Andamento</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Resolvido</option>
            <option value="closed">Fechado</option>
          </select>
        </div>
      </div>

      {/* Conteúdo Principal */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
          Carregando tickets...
        </div>
      ) : filteredTickets.length === 0 ? (
        <Card className="p-12 text-center space-y-3 border-dashed">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Ticket className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-lg">Nenhum ticket encontrado</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Não há chamados com os filtros selecionados para esta unidade ou categoria.
          </p>
          <Button
            onClick={() => {
              setTicketToEdit(null);
              setDialogOpen(true);
            }}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Abrir Primeiro Ticket
          </Button>
        </Card>
      ) : viewMode === "list" ? (
        /* VISUALIZAÇÃO EM LISTA */
        <div className="space-y-2">
          {filteredTickets.map((t: any) => (
            <Card
              key={t.id}
              onClick={() => {
                setSelectedTicketId(t.id);
                setDetailsOpen(true);
              }}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-muted-foreground">
                    #{t.ticket_number || t.id.slice(0, 6)}
                  </span>
                  <Badge variant={t.scope === "internal" ? "outline" : "default"} className="text-[10px]">
                    {t.scope === "internal" ? "Interno" : "Cliente"}
                  </Badge>
                  {getStatusBadge(t.status)}
                  {getPriorityBadge(t.priority)}
                </div>

                <h4 className="font-semibold text-base truncate">{t.title}</h4>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {t.unit?.name} {t.department ? `• ${t.department.name}` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    {t.scope === "internal" ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {t.scope === "internal"
                      ? t.requester_user?.name || "Interno"
                      : t.requester_contact?.name || "Cliente"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <div className="text-right text-xs">
                  <p className="font-medium text-foreground">
                    {t.assigned_user?.name || (
                      <span className="text-muted-foreground italic">Não atribuído</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Responsável</p>
                </div>

                {/* Ações administrativas (Editar/Excluir apenas para quem tem permissão de suporte) */}
                {(() => {
                  const isTicketRequester = t.requester_user_id === profile?.id;
                  const canManageThis = isSuperAdmin || profile?.role === "admin_company" || profile?.role === "manager" || (profile?.role === "agent" && !isTicketRequester);
                  if (!canManageThis) return null;

                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setTicketToEdit(t);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        {(isSuperAdmin || profile?.role === "admin_company") && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Tem certeza que deseja excluir este ticket?")) {
                                deleteMutation.mutate(t.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })()}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM KANBAN */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { key: "new", title: "Novos", color: "border-blue-500" },
            { key: "in_progress", title: "Em Andamento", color: "border-indigo-500" },
            { key: "pending", title: "Pendentes", color: "border-amber-500" },
            { key: "resolved", title: "Resolvidos", color: "border-emerald-500" },
          ].map((col) => {
            const colTickets = filteredTickets.filter((t: any) => t.status === col.key);
            return (
              <div key={col.key} className="space-y-3 bg-muted/30 p-3 rounded-xl border">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.color.replace("border-", "bg-")}`} />
                    {col.title}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {colTickets.length}
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  {colTickets.map((t: any) => (
                    <Card
                      key={t.id}
                      onClick={() => {
                        setSelectedTicketId(t.id);
                        setDetailsOpen(true);
                      }}
                      className="p-3 bg-card hover:shadow cursor-pointer transition-shadow space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-muted-foreground">
                          #{t.ticket_number || t.id.slice(0, 6)}
                        </span>
                        {getPriorityBadge(t.priority)}
                      </div>
                      <p className="font-semibold text-sm line-clamp-2 leading-snug">{t.title}</p>
                      <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-1 border-t">
                        <span>{t.unit?.name}</span>
                        <span>{t.assigned_user?.name?.split(" ")[0] || "Fila"}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      <TicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ticketToEdit={ticketToEdit}
      />

      {/* Gaveta de Detalhes e Mensagens */}
      <TicketDetailsSheet
        ticketId={selectedTicketId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEditTicket={(ticket) => {
          setTicketToEdit(ticket);
          setDialogOpen(true);
        }}
      />
    </div>
  );
}
