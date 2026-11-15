import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Plus, Clock, Building2, User, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TicketDialog } from "@/components/tickets/ticket-dialog";
import { TicketDetailsSheet } from "@/components/tickets/ticket-details-sheet";

interface Props {
  contactId: string;
  unitId?: string | null;
  conversationId?: string | null;
}

export function ContactTickets({ contactId, unitId, conversationId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["contact-tickets", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select(`
          *,
          unit:units!unit_id(id, name),
          department:departments!department_id(id, name),
          assigned_user:profiles!assigned_to_user_id(id, name, email)
        `)
        .eq("requester_contact_id", contactId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "urgent":
        return <Badge variant="destructive" className="text-[10px]">Urgente</Badge>;
      case "high":
        return <Badge className="bg-amber-500 text-white text-[10px]">Alta</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-[10px]">Média</Badge>;
      case "low":
        return <Badge variant="outline" className="text-[10px]">Baixa</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{p}</Badge>;
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "new":
        return <Badge className="bg-blue-500 text-white text-[10px]">Novo</Badge>;
      case "in_progress":
        return <Badge className="bg-indigo-500 text-white text-[10px]">Em Andamento</Badge>;
      case "pending":
        return <Badge className="bg-amber-500 text-white text-[10px]">Pendente</Badge>;
      case "resolved":
        return <Badge className="bg-emerald-600 text-white text-[10px]">Resolvido</Badge>;
      case "closed":
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">Fechado</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="text-[10px]">Cancelado</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
    }
  };

  const openTicketsCount = tickets.filter(
    (t: any) => !["resolved", "closed", "cancelled"].includes(t.status)
  ).length;

  return (
    <div className="space-y-3">
      {/* Barra de Ação */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div>
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5 text-primary" />
            Tickets do Contato
            {openTicketsCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[9px] font-bold">
                {openTicketsCount} aberto{openTicketsCount > 1 ? "s" : ""}
              </Badge>
            )}
          </span>
          <p className="text-[10px] text-muted-foreground">Chamados e suporte deste cliente</p>
        </div>

        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="h-7 text-xs gap-1 font-medium shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Ticket
        </Button>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin mb-1 text-primary" />
          Carregando chamados...
        </div>
      ) : tickets.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg space-y-2">
          <Ticket className="h-6 w-6 text-muted-foreground/50 mx-auto" />
          <p className="font-medium text-foreground">Nenhum chamado aberto</p>
          <p className="text-[11px]">Este cliente não possui tickets registrados até o momento.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-7 text-xs mt-1"
          >
            Abrir Primeiro Chamado
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket: any) => {
            const isOpen = !["resolved", "closed", "cancelled"].includes(ticket.status);
            return (
              <Card
                key={ticket.id}
                onClick={() => {
                  setSelectedTicketId(ticket.id);
                  setDetailsOpen(true);
                }}
                className={`p-3 cursor-pointer hover:shadow-xs transition-colors border text-xs space-y-1.5 ${
                  isOpen ? "bg-card border-primary/20" : "bg-muted/20 border-border/60 opacity-80"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-muted-foreground">
                    #{ticket.ticket_number || ticket.id.slice(0, 6)}
                  </div>
                  <div className="flex items-center gap-1">
                    {getStatusBadge(ticket.status)}
                    {getPriorityBadge(ticket.priority)}
                  </div>
                </div>

                <p className="font-semibold text-foreground text-xs line-clamp-1">
                  {ticket.title}
                </p>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span className="flex items-center gap-1 truncate max-w-[140px]">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {ticket.unit?.name || "Sem unidade"}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {format(new Date(ticket.created_at), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Criação com pré-preenchimento */}
      <TicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultScope="external"
        defaultContactId={contactId}
        defaultUnitId={unitId || undefined}
        defaultConversationId={conversationId || undefined}
      />

      {/* Sheet de Detalhes */}
      <TicketDetailsSheet
        ticketId={selectedTicketId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
