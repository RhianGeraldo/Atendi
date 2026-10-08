import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Copy,
  ExternalLink,
  Flame,
  UserCheck,
  Check,
  Phone,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { TodooLead, TodooLeadStatus } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { toast } from "sonner";

interface Props {
  onCreateCampaignClick?: () => void;
}

export function TodooDailyQueue({ onCreateCampaignClick }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active_all");
  const [selectedLeadForOutcome, setSelectedLeadForOutcome] = useState<TodooLead | null>(null);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  // Busca os leads da fila
  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["todoo-leads", activeCompanyId, profile?.id],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = (supabase.from("todoo_leads") as any)
        .select(`
          *,
          campaign:todoo_campaigns(id, title, type, message_template, offer_details),
          assigned_user:profiles(id, name, avatar_url)
        `)
        .eq("company_id", activeCompanyId)
        .order("sla_deadline", { ascending: true });

      // Se não for admin/manager, filtra para a consultora logada
      if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
        query = query.eq("assigned_user_id", profile?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TodooLead[];
    },
  });

  // Renderiza o script com variáveis substituídas
  const renderScript = (lead: TodooLead) => {
    let template =
      lead.campaign?.message_template ||
      "Olá {nome}! Tudo bem? Gostaria de conversar com você sobre uma condição especial.";

    const firstName = lead.contact_name ? lead.contact_name.split(" ")[0] : "Cliente";
    const custom = lead.custom_fields || {};

    template = template.replace(/\{nome\}/gi, lead.contact_name);
    template = template.replace(/\{primeiro_nome\}/gi, firstName);
    template = template.replace(/\{saldo\}/gi, custom.saldo || custom.saldo_sessoes || "seu saldo de sessões");
    template = template.replace(/\{zona\}/gi, custom.zona || custom.zonas || "nova área");
    template = template.replace(/\{consultora\}/gi, profile?.name || "sua consultora");
    template = template.replace(/\{voucher\}/gi, custom.voucher || "VOUCHER150");

    return template;
  };

  const handleCopyScript = (leadId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScriptId(leadId);
    toast.success("Script copiado para a área de transferência!");
    setTimeout(() => setCopiedScriptId(null), 2500);
  };

  // Abrir conversa no chat do Atendi
  const handleOpenChat = async (lead: TodooLead) => {
    try {
      // Se tiver contact_id, tenta redirecionar para a conversa
      if (lead.contact_id) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("id, contact:contacts!inner(company_id)")
          .eq("contact_id", lead.contact_id)
          .eq("contact.company_id", activeCompanyId!)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv) {
          navigate({ to: "/conversations", search: { conversationId: conv.id } as any });
          return;
        }
      }

      // Se não achar conversa ou contato, abre link externo do WhatsApp Web
      const cleanPhone = lead.contact_phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const text = encodeURIComponent(renderScript(lead));
      window.open(`https://wa.me/${fullPhone}?text=${text}`, "_blank");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao abrir atendimento.");
    }
  };

  // Filtros aplicados
  const filteredLeads = leads.filter((lead) => {
    // Busca
    if (searchTerm) {
      const matchName = lead.contact_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchPhone = lead.contact_phone.includes(searchTerm);
      if (!matchName && !matchPhone) return false;
    }

    // Status
    if (statusFilter === "active_all") {
      return ["pending", "contacted", "callback"].includes(lead.status);
    }
    if (statusFilter === "urgent") {
      if (["won", "lost"].includes(lead.status)) return false;
      if (lead.sla_breached) return true;
      if (lead.sla_deadline && isPast(new Date(lead.sla_deadline))) return true;
      return false;
    }
    if (statusFilter === "pending") return lead.status === "pending";
    if (statusFilter === "callback") return lead.status === "callback";
    if (statusFilter === "contacted") return lead.status === "contacted";
    if (statusFilter === "won") return lead.status === "won";
    if (statusFilter === "lost") return lead.status === "lost";

    return true;
  });

  // Métricas rápidas
  const pendingCount = leads.filter((l) => ["pending", "contacted", "callback"].includes(l.status)).length;
  const urgentCount = leads.filter((l) => {
    if (["won", "lost"].includes(l.status)) return false;
    return l.sla_breached || (l.sla_deadline && isPast(new Date(l.sla_deadline)));
  }).length;
  const wonCount = leads.filter((l) => l.status === "won").length;
  const wonRevenue = leads.filter((l) => l.status === "won").reduce((acc, curr) => acc + (Number(curr.outcome_value) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Banner de Pergunta Guia do Todoo & Métricas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Fila de Trabalho de Hoje
              </p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">
                {pendingCount} <span className="text-sm font-normal text-muted-foreground">leads ativos</span>
              </h3>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Flame className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={urgentCount > 0 ? "bg-destructive/5 border-destructive/30" : ""}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Urgência / SLA Crítico
              </p>
              <h3 className={`text-2xl font-bold mt-1 ${urgentCount > 0 ? "text-destructive" : "text-foreground"}`}>
                {urgentCount} <span className="text-sm font-normal text-muted-foreground">expirando</span>
              </h3>
            </div>
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${urgentCount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Fechamentos Concluídos
              </p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600">
                {wonCount} <span className="text-sm font-normal text-muted-foreground">contratos</span>
              </h3>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Receita Gerada no Todoo
              </p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(wonRevenue)}
              </h3>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do cliente ou WhatsApp..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SlidersHorizontal className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active_all">Ativos para Hoje ({pendingCount})</SelectItem>
              <SelectItem value="urgent">Urgentes / SLA ({urgentCount})</SelectItem>
              <SelectItem value="pending">Aguardando Contato</SelectItem>
              <SelectItem value="callback">Retornos Marcados</SelectItem>
              <SelectItem value="contacted">Em Negociação</SelectItem>
              <SelectItem value="won">Fechados ({wonCount})</SelectItem>
              <SelectItem value="lost">Sem Interesse</SelectItem>
              <SelectItem value="all">Todos os Leads ({leads.length})</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => refetch()} title="Atualizar fila">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Fila de Trabalho */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">
          Carregando fila de trabalho do Todoo...
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold mt-3">Nenhum lead pendente nesta visão</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
            {statusFilter === "active_all"
              ? "Excelente! Toda a sua fila de contatos ativos do Todoo foi atendida hoje."
              : "Não há registros para o filtro selecionado."}
          </p>
          {onCreateCampaignClick && (
            <Button onClick={onCreateCampaignClick} variant="outline" className="mt-4">
              Criar Nova Ação Comercial
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => {
            const isBreached = lead.sla_breached || (lead.sla_deadline && isPast(new Date(lead.sla_deadline)));
            const script = renderScript(lead);

            return (
              <Card
                key={lead.id}
                className={`transition-all hover:border-primary/40 ${
                  isBreached && !["won", "lost"].includes(lead.status)
                    ? "border-destructive/40 bg-destructive/2"
                    : ""
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Informações Principais do Lead */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base text-foreground truncate">
                          {lead.contact_name}
                        </span>

                        {/* Badge da Ação Comercial */}
                        <Badge variant="outline" className="text-xs font-normal">
                          {lead.campaign?.title || "Lista Comercial"}
                        </Badge>

                        {/* Badge de SLA */}
                        {["won", "lost"].includes(lead.status) ? (
                          <Badge
                            className={
                              lead.status === "won"
                                ? "bg-emerald-600 text-white"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {lead.status === "won" ? "✓ Fechado" : "Recusado"}
                          </Badge>
                        ) : isBreached ? (
                          <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3" />
                            SLA Vencido
                          </Badge>
                        ) : lead.sla_deadline ? (
                          <Badge variant="secondary" className="flex items-center gap-1 text-[11px]">
                            <Clock className="h-3 w-3" />
                            Prazo: {formatDistanceToNow(new Date(lead.sla_deadline), { locale: ptBR, addSuffix: true })}
                          </Badge>
                        ) : null}

                        {/* Status do Lead */}
                        {lead.status === "callback" && lead.callback_scheduled_at && (
                          <Badge className="bg-purple-600 text-white flex items-center gap-1 text-[11px]">
                            <Clock className="h-3 w-3" />
                            Retorno: {format(new Date(lead.callback_scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </Badge>
                        )}
                      </div>

                      {/* Dados Clínicos / ERP */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.contact_phone}
                        </span>

                        {lead.custom_fields?.saldo && (
                          <span className="font-medium text-foreground">
                            Saldo: <strong>{lead.custom_fields.saldo} sessões</strong>
                          </span>
                        )}

                        {lead.custom_fields?.zona && (
                          <span className="font-medium text-foreground">
                            Área/Zona: <strong>{lead.custom_fields.zona}</strong>
                          </span>
                        )}

                        {lead.custom_fields?.ultima_sessao && (
                          <span>Última sessão: {lead.custom_fields.ultima_sessao}</span>
                        )}

                        {lead.assigned_user && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <UserCheck className="h-3 w-3" />
                            Resp: {lead.assigned_user.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações Rápidas */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyScript(lead.id, script)}
                        title="Copiar script com variáveis"
                        className="gap-1.5"
                      >
                        {copiedScriptId === lead.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-xs">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span className="text-xs">Copiar Script</span>
                          </>
                        )}
                      </Button>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenChat(lead)}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="text-xs">Chamar no WhatsApp</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedLeadForOutcome(lead);
                          setOutcomeDialogOpen(true);
                        }}
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="text-xs">Registrar Desfecho</span>
                      </Button>
                    </div>
                  </div>

                  {/* Acordeão com Script Sugerido da Abordagem */}
                  <Collapsible className="mt-3 pt-3 border-t border-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1.5 font-medium text-primary hover:underline cursor-pointer">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Ver Script Comercial Sugerido</span>
                        </button>
                      </CollapsibleTrigger>
                      {lead.campaign?.offer_details && (
                        <span className="text-[11px] text-muted-foreground">
                          Oferta: {lead.campaign.offer_details}
                        </span>
                      )}
                    </div>

                    <CollapsibleContent className="mt-2.5 bg-muted/50 rounded-lg p-3 text-xs leading-relaxed text-foreground border border-border/50">
                      <p className="whitespace-pre-wrap">{script}</p>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Registro de Desfecho */}
      <TodooOutcomeDialog
        lead={selectedLeadForOutcome}
        open={outcomeDialogOpen}
        onOpenChange={setOutcomeDialogOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
