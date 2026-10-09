import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Users,
  Target,
  DollarSign,
  TrendingUp,
  Clock,
  Sparkles,
  Flame,
  CheckCircle2,
  AlertTriangle,
  MoreVertical,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { TodooCampaign } from "@/types/todoo";
import { TodooEditCampaignDialog } from "./todoo-edit-campaign-dialog";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onCreateClick: () => void;
}

export function TodooCampaignsList({ onCreateClick }: Props) {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const queryClient = useQueryClient();

  // Estados para edição e exclusão
  const [editingCampaign, setEditingCampaign] = useState<TodooCampaign | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [deletingCampaign, setDeletingCampaign] = useState<TodooCampaign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Busca as unidades da empresa para identificação visual
  const { data: units = [] } = useQuery({
    queryKey: ["company-units", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id, name, color")
        .eq("company_id", activeCompanyId);
      return data || [];
    },
  });

  const activeUnit = units.find((u: any) => u.id === selectedUnitId);

  // Busca as campanhas com agregação de leads
  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["todoo-campaigns-list", activeCompanyId, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data: rawCampaigns, error } = await (supabase.from("todoo_campaigns") as any)
        .select(`
          *,
          unit:units(id, name, color),
          leads:todoo_leads(id, status, outcome_value, sla_breached, unit_id)
        `)
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (rawCampaigns || [])
        .filter((c: any) => {
          if (!selectedUnitId) return true;
          // Se a ação for exclusiva de outra unidade, não exibe
          if (c.unit_id && c.unit_id !== selectedUnitId) return false;
          return true;
        })
        .map((c: any) => {
          const allLeads = c.leads || [];
          const leads = selectedUnitId
            ? allLeads.filter((l: any) => l.unit_id === selectedUnitId)
            : allLeads;

          const total = leads.length;
          const won = leads.filter((l: any) => l.status === "won").length;
          const worked = leads.filter((l: any) => l.status !== "pending").length;
          const revenue = leads
            .filter((l: any) => l.status === "won")
            .reduce((acc: number, curr: any) => acc + (Number(curr.outcome_value) || 0), 0);

          return {
            ...c,
            total_leads: total,
            completed_leads: worked,
            won_leads: won,
            won_revenue: revenue,
            raw_total_leads: allLeads.length,
          } as TodooCampaign & { raw_total_leads: number };
        });
    },
  });

  // Pausar / Retomar Campanha
  const handleToggleStatus = async (campaign: TodooCampaign) => {
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      const { error } = await (supabase.from("todoo_campaigns") as any)
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", campaign.id);

      if (error) throw error;
      toast.success(nextStatus === "active" ? "Ação comercial retomada!" : "Ação comercial pausada.");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao alterar status: " + err.message);
    }
  };

  // Excluir Campanha
  const handleDeleteCampaign = async () => {
    if (!deletingCampaign) return;
    setIsDeleting(true);

    try {
      // 1. Exclui os leads vinculados à campanha
      const { error: leadsErr } = await (supabase.from("todoo_leads") as any)
        .delete()
        .eq("campaign_id", deletingCampaign.id);

      if (leadsErr) throw leadsErr;

      // 2. Exclui os eventos vinculados
      await (supabase.from("todoo_events") as any)
        .delete()
        .eq("campaign_id", deletingCampaign.id);

      // 3. Exclui a campanha
      const { error: campErr } = await (supabase.from("todoo_campaigns") as any)
        .delete()
        .eq("id", deletingCampaign.id);

      if (campErr) throw campErr;

      toast.success("Ação comercial e seus leads excluídos com sucesso!");
      setDeleteDialogOpen(false);
      setDeletingCampaign(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
    } catch (err: any) {
      console.error("Erro ao excluir campanha:", err);
      toast.error("Erro ao excluir ação comercial: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const getBadgeType = (type: string) => {
    switch (type) {
      case "retention_saldo":
        return { label: "Saldo ≤ 3 Sessões", color: "bg-blue-600/10 text-blue-700 dark:text-blue-400" };
      case "upsell_zones":
        return { label: "Zonas em Aberto", color: "bg-purple-600/10 text-purple-700 dark:text-purple-400" };
      case "reactivation":
        return { label: "Reativação de Inativos", color: "bg-amber-600/10 text-amber-700 dark:text-amber-400" };
      case "mgm_referral":
        return { label: "Desafio 3 Amigas (MGM)", color: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" };
      case "quote_followup":
        return { label: "Follow-up Orçamento", color: "bg-rose-600/10 text-rose-700 dark:text-rose-400" };
      default:
        return { label: "Personalizada", color: "bg-muted text-muted-foreground" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ações Comerciais & Listas Quentes</h2>
          <p className="text-xs text-muted-foreground">
            Gerencie as campanhas ativas, edite scripts, acompanhe a taxa de conversão e os resultados.
          </p>
        </div>
        <Button onClick={onCreateClick} size="sm" className="gap-2 shrink-0 h-9 text-xs">
          <Plus className="h-4 w-4" />
          Nova Ação Comercial
        </Button>
      </div>

      {/* Alerta de Unidade Ativa */}
      {activeUnit && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
          <Building2 className="h-4 w-4 shrink-0" />
          <span>
            Exibindo métricas da unidade <strong>{activeUnit.name}</strong>. Campanhas corporativas exibem apenas os contatos desta filial.
          </span>
        </div>
      )}

      {/* Listagem */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p>Carregando ações comerciais...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold mt-3">Nenhuma ação comercial criada</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
            Crie sua primeira lista de clientes para abastecer a esteira diária de trabalho da equipe.
          </p>
          <Button onClick={onCreateClick} size="sm" className="mt-4 gap-2 text-xs">
            <Plus className="h-4 w-4" />
            Criar Minha Primeira Ação
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((camp) => {
            const badge = getBadgeType(camp.type);
            const progress = camp.total_leads ? Math.round(((camp.completed_leads || 0) / camp.total_leads) * 100) : 0;
            const convRate = camp.completed_leads ? Math.round(((camp.won_leads || 0) / camp.completed_leads) * 100) : 0;

            return (
              <Card key={camp.id} className="flex flex-col justify-between shadow-xs hover:border-primary/40 transition-colors">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`${badge.color} border-none text-[11px] font-medium`}>
                        {badge.label}
                      </Badge>
                      {camp.unit ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium truncate max-w-[130px]"
                          style={{
                            backgroundColor: camp.unit.color ? `${camp.unit.color}18` : undefined,
                            color: camp.unit.color || undefined,
                            border: `1px solid ${camp.unit.color ? `${camp.unit.color}35` : "var(--border)"}`,
                          }}
                        >
                          {camp.unit.name}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border/60">
                          Rede Geral
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant={camp.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {camp.status === "active" ? "Ativa" : camp.status === "paused" ? "Pausada" : "Concluída"}
                      </Badge>

                      {/* Menu de Ações (CRUD) */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs w-44">
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onClick={() => {
                              setEditingCampaign(camp);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5 text-primary" />
                            <span>Editar Ação</span>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            onClick={() => handleToggleStatus(camp)}
                          >
                            {camp.status === "active" ? (
                              <>
                                <Pause className="h-3.5 w-3.5 text-amber-500" />
                                <span>Pausar Ação</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Retomar Ação</span>
                              </>
                            )}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => {
                              setDeletingCampaign(camp);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Excluir Ação</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <CardTitle className="text-sm font-bold mt-2 line-clamp-1 text-foreground">
                    {camp.title}
                  </CardTitle>

                  {camp.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {camp.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3.5">
                  {/* Oferta Comercial */}
                  {camp.offer_details && (
                    <div className="p-2 rounded bg-muted/50 border border-border/80 text-[11px] text-foreground line-clamp-2">
                      <strong className="text-primary font-medium block">Oferta:</strong>
                      {camp.offer_details}
                    </div>
                  )}

                  {/* Progresso de Execução */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Execução da Fila:</span>
                      <strong className="text-foreground font-medium">
                        {camp.completed_leads} / {camp.total_leads} ({progress}%)
                      </strong>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>

                  {/* Métricas Principais */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Fechamentos:</span>
                      <strong className="text-emerald-600 font-semibold text-sm">
                        {camp.won_leads} ({convRate}%)
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Receita Gerada:</span>
                      <strong className="text-foreground font-semibold text-sm">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(camp.won_revenue || 0)}
                      </strong>
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      SLA: {camp.sla_hours}h
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCampaign(camp);
                          setEditDialogOpen(true);
                        }}
                        className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                      >
                        <Edit className="h-3 w-3" />
                        Editar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Edição (CRUD: Update) */}
      <TodooEditCampaignDialog
        campaign={editingCampaign}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
        }}
      />

      {/* Modal de Exclusão (CRUD: Delete) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">Excluir Ação Comercial?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2">
              <p>
                Tem certeza que deseja excluir a ação comercial{" "}
                <strong className="text-foreground">{deletingCampaign?.title}</strong>?
              </p>
              {deletingCampaign?.total_leads ? (
                <div className="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  Atenção: Existem <strong>{deletingCampaign.total_leads} leads vinculados</strong> a esta ação. Ao excluir, esses leads também serão removidos da fila de trabalho.
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeleting} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCampaign}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs gap-1.5"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
