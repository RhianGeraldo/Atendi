import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Plus,
  Trophy,
  CheckCircle2,
  Heart,
  Pencil,
  Trash2,
  Calendar,
  Settings2,
  Users,
  Compass,
  ArrowUpRight,
  PartyPopper,
  Check,
  Flame,
  Star,
  Target,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { toast } from "sonner";
import {
  calculateDreamProgress,
  getMotivationalMessage,
  triggerConfetti,
  formatCurrency,
} from "./todoo-dreams";
import { TodooDreamDialog } from "./todoo-dream-dialog";
import type { TodooDream } from "@/types/todoo";

export function TodooDreamBoard() {
  const { user, profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();

  const isManagerOrAdmin =
    profile?.role === "super_admin" ||
    profile?.role === "admin_company" ||
    profile?.role === "manager";
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id || "");

  // Sincroniza selectedUserId quando user carrega de forma assíncrona
  useEffect(() => {
    if (user?.id && !selectedUserId) {
      setSelectedUserId(user.id);
    }
  }, [user?.id, selectedUserId]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dreamToEdit, setDreamToEdit] = useState<TodooDream | null>(null);
  const [dreamToDelete, setDreamToDelete] = useState<TodooDream | null>(null);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [tempCommission, setTempCommission] = useState<number>(5);
  const [savingCommission, setSavingCommission] = useState(false);
  const [activeTab, setActiveTab] = useState<"in_progress" | "completed">("in_progress");

  // Comissão padrão da empresa
  const { data: companyCommission = 5 } = useQuery({
    queryKey: ["todoo-dream-company-commission", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_dream_settings") as any)
        .select("commission_rate")
        .eq("company_id", activeCompanyId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao buscar comissão da empresa:", error);
      }
      return Number(data?.commission_rate) || 5;
    },
  });

  // Lista de usuários para gestor
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["todoo-dreams-team", activeCompanyId],
    enabled: isManagerOrAdmin && !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const targetUserId = isManagerOrAdmin && selectedUserId ? selectedUserId : user?.id;

  // Busca os sonhos do usuário
  const { data: dreams = [], isLoading } = useQuery({
    queryKey: ["todoo-dreams", activeCompanyId, targetUserId],
    enabled: !!activeCompanyId && !!targetUserId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_dreams") as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("user_id", targetUserId)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TodooDream[];
    },
  });

  // Contabilização de Vendas: Buscamos as vendas no CRM (tabela opportunities com status = 'won')
  // e complementamos com vendas ganhas no Todoo (todoo_leads com outcome_type = 'won')
  const { data: salesByDream = {} } = useQuery({
    queryKey: [
      "todoo-dreams-crm-sales",
      activeCompanyId,
      targetUserId,
      dreams.map((d) => `${d.id}_${d.started_at}`).join(","),
    ],
    enabled: !!activeCompanyId && !!targetUserId && dreams.length > 0,
    queryFn: async () => {
      const salesMap: Record<string, number> = {};

      // 1. Busca todas as oportunidades ganhas do usuário no CRM
      // Consulta direta por company_id e owner_id para máxima robustez
      const { data: crmOpps, error: crmErr } = await supabase
        .from("opportunities")
        .select("id, value, status, created_at, stage_entered_at, owner_id, company_id")
        .eq("company_id", activeCompanyId!)
        .eq("owner_id", targetUserId!)
        .eq("status", "won");

      if (crmErr) {
        console.error("Erro ao buscar oportunidades do CRM:", crmErr);
      }

      // 2. Busca também leads ganhos no Todoo
      const { data: todooLeads, error: todooErr } = await (supabase.from("todoo_leads") as any)
        .select("id, outcome_value, completed_at, updated_at")
        .eq("company_id", activeCompanyId!)
        .eq("assigned_user_id", targetUserId!)
        .eq("outcome_type", "won");

      if (todooErr) {
        console.error("Erro ao buscar leads ganhos do Todoo:", todooErr);
      }

      // Calcula as vendas para cada sonho respeitando a data started_at
      for (const dream of dreams) {
        const dreamStart = dream.started_at
          ? new Date(`${dream.started_at}T00:00:00`).getTime()
          : 0;

        // Vendas no CRM
        const crmTotal = (crmOpps || []).reduce((acc, curr) => {
          const rawDate = curr.stage_entered_at || curr.created_at || "";
          const wonTime = new Date(rawDate).getTime();
          const wonDateStr = rawDate.substring(0, 10);
          if (wonTime >= dreamStart || (dream.started_at && wonDateStr >= dream.started_at)) {
            return acc + (Number(curr.value) || 0);
          }
          return acc;
        }, 0);

        // Vendas no Todoo
        const todooTotal = (todooLeads || []).reduce((acc, curr) => {
          const rawDate = curr.completed_at || curr.updated_at || "";
          const leadTime = new Date(rawDate).getTime();
          const leadDateStr = rawDate.substring(0, 10);
          if (leadTime >= dreamStart || (dream.started_at && leadDateStr >= dream.started_at)) {
            return acc + (Number(curr.outcome_value) || 0);
          }
          return acc;
        }, 0);

        // Total consolidado (CRM como fonte principal)
        salesMap[dream.id] = Math.max(crmTotal, todooTotal, crmTotal > 0 ? crmTotal : todooTotal);
      }

      return salesMap;
    },
  });

  const enrichedDreams = useMemo(() => {
    return dreams.map((d) => {
      const wonRevenue = salesByDream[d.id] || 0;
      const progress = calculateDreamProgress(d, wonRevenue);
      return {
        ...d,
        won_revenue: wonRevenue,
        accumulated_commission: progress.accumulatedCommission,
        progress_pct: progress.progressPct,
        remaining_revenue: progress.remainingRevenue,
        target_revenue_needed: progress.targetRevenueNeeded,
      };
    });
  }, [dreams, salesByDream]);

  const inProgressDreams = useMemo(
    () => enrichedDreams.filter((d) => d.status === "in_progress"),
    [enrichedDreams]
  );
  const completedDreams = useMemo(
    () => enrichedDreams.filter((d) => d.status === "completed"),
    [enrichedDreams]
  );

  // O sonho em foco: primeiro o que tem is_featured = true, senão o primeiro da lista
  const featuredDream = useMemo(() => {
    if (inProgressDreams.length === 0) return null;
    const explicitlyFeatured = inProgressDreams.find((d) => d.is_featured);
    if (explicitlyFeatured) return explicitlyFeatured;
    return inProgressDreams[0];
  }, [inProgressDreams]);

  const otherInProgress = useMemo(() => {
    if (!featuredDream) return inProgressDreams;
    return inProgressDreams.filter((d) => d.id !== featuredDream.id);
  }, [inProgressDreams, featuredDream]);

  // Função para definir um sonho como o foco principal (persiste no banco)
  const handleSetFeatured = async (dream: TodooDream) => {
    try {
      // 1. Remove o foco de outros sonhos deste usuário
      if (activeCompanyId) {
        await (supabase.from("todoo_dreams") as any)
          .update({ is_featured: false })
          .eq("company_id", activeCompanyId)
          .eq("user_id", targetUserId);
      } else {
        await (supabase.from("todoo_dreams") as any)
          .update({ is_featured: false })
          .eq("user_id", targetUserId);
      }

      // 2. Define o escolhido como foco ativo
      const { error } = await (supabase.from("todoo_dreams") as any)
        .update({ is_featured: true, updated_at: new Date().toISOString() })
        .eq("id", dream.id);

      if (error) throw error;

      toast.success(`"${dream.title}" definido como seu foco principal!`);
      await queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
      await queryClient.invalidateQueries({ queryKey: ["todoo-active-dream"] });
    } catch (err: any) {
      console.error("Erro ao focar sonho:", err);
      toast.error(err?.message || "Erro ao definir foco.");
    }
  };

  const handleSaveCommission = async () => {
    if (!activeCompanyId || tempCommission <= 0) return;
    setSavingCommission(true);
    try {
      const { error } = await (supabase.from("todoo_dream_settings") as any).upsert(
        {
          company_id: activeCompanyId,
          commission_rate: tempCommission,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

      if (error) throw error;
      toast.success(`Taxa de comissão atualizada para ${tempCommission}%!`);
      setCommissionDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["todoo-dream-company-commission"] });
      await queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar comissão.");
    } finally {
      setSavingCommission(false);
    }
  };

  const handleMarkAsCompleted = async (dream: TodooDream) => {
    try {
      const { error } = await (supabase.from("todoo_dreams") as any)
        .update({
          status: "completed",
          is_featured: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", dream.id);

      if (error) throw error;
      triggerConfetti();
      toast.success(`🎉 Parabéns! "${dream.title}" conquistado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-active-dream"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao marcar como realizado.");
    }
  };

  const handleReopenDream = async (dream: TodooDream) => {
    try {
      const { error } = await (supabase.from("todoo_dreams") as any)
        .update({
          status: "in_progress",
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dream.id);

      if (error) throw error;
      toast.success(`"${dream.title}" voltou para as metas ativas.`);
      queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-active-dream"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao reabrir sonho.");
    }
  };

  const handleDelete = async () => {
    if (!dreamToDelete) return;
    try {
      const { error } = await (supabase.from("todoo_dreams") as any)
        .delete()
        .eq("id", dreamToDelete.id);

      if (error) throw error;
      toast.success("Sonho removido do quadro.");
      setDreamToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-active-dream"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir sonho.");
    }
  };

  const isOwnBoard = targetUserId === user?.id;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Topo Limpo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isOwnBoard ? "Quadro dos Sonhos" : "Quadro dos Sonhos da Consultora"}
            </h1>
            <Badge variant="outline" className="text-[11px] font-medium border-border/80">
              Vendas no CRM
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Acompanhe suas vendas fechadas no CRM e veja a evolução até a realização do seu objetivo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Consultora para Gestor */}
          {isManagerOrAdmin && teamMembers.length > 0 && (
            <div className="w-44">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <Users className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Escolha a consultora" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name || "Sem nome"} {m.id === user?.id ? "(Você)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Ajuste de Comissão pelo Gerente */}
          {isManagerOrAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempCommission(companyCommission);
                setCommissionDialogOpen(true);
              }}
              className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Comissão: {companyCommission}%
            </Button>
          )}

          <Button
            onClick={() => {
              setDreamToEdit(null);
              setDialogOpen(true);
            }}
            size="sm"
            className="h-8 text-xs gap-1.5 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Sonho
          </Button>
        </div>
      </div>

      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Button
          variant={activeTab === "in_progress" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("in_progress")}
          className="text-xs h-7 gap-1.5"
        >
          <Compass className="w-3.5 h-3.5" />
          Em Andamento ({inProgressDreams.length})
        </Button>
        <Button
          variant={activeTab === "completed" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("completed")}
          className="text-xs h-7 gap-1.5 text-amber-600 dark:text-amber-400"
        >
          <Trophy className="w-3.5 h-3.5" />
          Conquistados ({completedDreams.length})
        </Button>
      </div>

      {activeTab === "in_progress" ? (
        <>
          {featuredDream ? (
            /* ========================================================= */
            /* HERO CARD: O Sonho Ativo em Destaque                      */
            /* ========================================================= */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-foreground font-bold">
                  <Flame className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                  Meta em Foco Atual
                </span>
                {otherInProgress.length > 0 && (
                  <span className="text-[11px] font-normal normal-case text-muted-foreground">
                    Clique em &quot;Focar neste&quot; abaixo para alternar a meta
                  </span>
                )}
              </div>

              <Card className="overflow-hidden border border-border/80 bg-card rounded-2xl shadow-sm hover:shadow-md transition-all">
                <div className="p-5 sm:p-7">
                  <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
                    {/* Foto do Sonho */}
                    <div className="relative w-full md:w-52 lg:w-60 aspect-[4/3] md:aspect-square rounded-2xl overflow-hidden bg-muted shrink-0 border border-border/60 shadow-xs group">
                      {featuredDream.image_url ? (
                        <img
                          src={featuredDream.image_url}
                          alt={featuredDream.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                          <Heart className="w-10 h-10 text-muted-foreground/30 mb-2" />
                          <span className="text-xs">Sem foto cadastrada</span>
                        </div>
                      )}

                      {/* Tag do Valor */}
                      <div className="absolute bottom-3 left-3 right-3 bg-background/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm border border-border/80 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                          Valor do Sonho
                        </span>
                        <span className="text-sm font-black text-foreground">
                          {formatCurrency(featuredDream.target_value)}
                        </span>
                      </div>
                    </div>

                    {/* Informações da Jornada */}
                    <div className="flex-1 w-full space-y-5">
                      {/* Topo com Título e Ações */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                              {featuredDream.title}
                            </h2>
                            <Badge className="bg-pink-600/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 text-[10px] font-semibold gap-1">
                              <Star className="w-3 h-3 fill-pink-500" /> Foco Ativo
                            </Badge>
                          </div>
                          {featuredDream.started_at && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground/80" />
                              <span>
                                Contabilizando vendas no CRM desde:{" "}
                                <strong className="text-foreground font-semibold">
                                  {new Date(
                                    `${featuredDream.started_at}T12:00:00`
                                  ).toLocaleDateString("pt-BR")}
                                </strong>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 shrink-0 bg-muted/50 p-1 rounded-xl border border-border/50">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                            onClick={() => {
                              setDreamToEdit(featuredDream);
                              setDialogOpen(true);
                            }}
                            title="Editar sonho"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => setDreamToDelete(featuredDream)}
                            title="Excluir sonho"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="space-y-2.5">
                        <div className="flex items-baseline justify-between">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black tracking-tight text-foreground">
                              {featuredDream.progress_pct || 0}%
                            </span>
                            <span className="text-xs text-muted-foreground font-medium">
                              do objetivo alcançado
                            </span>
                          </div>

                          <div className="text-right text-xs">
                            <span className="text-muted-foreground">Comissão gerada: </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency(featuredDream.accumulated_commission)}
                            </span>
                          </div>
                        </div>

                        <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden border border-border/60">
                          <div
                            className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, featuredDream.progress_pct || 0))}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Trilogia das Métricas do CRM */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="p-3 rounded-xl bg-muted/40 border border-border/70 space-y-0.5 min-w-0">
                          <div className="text-[11px] text-muted-foreground font-medium">
                            Meta no CRM
                          </div>
                          <div className="text-sm font-extrabold text-foreground truncate">
                            {formatCurrency(featuredDream.target_revenue_needed)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Taxa de comissão: {featuredDream.commission_rate}%
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-muted/40 border border-border/70 space-y-0.5 min-w-0">
                          <div className="text-[11px] text-muted-foreground font-medium">
                            Vendido no CRM
                          </div>
                          <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 truncate">
                            {formatCurrency(featuredDream.won_revenue)}
                          </div>
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            Em oportunidades ganhas
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-muted/40 border border-border/70 space-y-0.5 min-w-0">
                          <div className="text-[11px] text-muted-foreground font-medium">
                            Falta Vender
                          </div>
                          <div className="text-sm font-extrabold text-pink-600 dark:text-pink-400 truncate">
                            {formatCurrency(featuredDream.remaining_revenue)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {(featuredDream.remaining_revenue || 0) <= 0
                              ? "Meta batida! 🎉"
                              : "No funil do CRM"}
                          </div>
                        </div>
                      </div>

                      {/* Rodapé do Card */}
                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60">
                        <p className="text-xs text-muted-foreground italic">
                          {getMotivationalMessage(
                            featuredDream.progress_pct || 0,
                            featuredDream.title
                          )}
                        </p>

                        <Button
                          onClick={() => handleMarkAsCompleted(featuredDream)}
                          className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold rounded-xl shrink-0 shadow-xs"
                        >
                          <PartyPopper className="w-4 h-4" />
                          Comprei / Realizei este Sonho!
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            /* Sem Sonhos */
            <Card className="p-12 text-center border-dashed border-2 rounded-2xl bg-card/40">
              <div className="max-w-sm mx-auto space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Heart className="w-6 h-6 text-pink-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold">Nenhum sonho ativo no momento</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cadastre uma meta pessoal (ex: uma bolsa, uma viagem, um jantar) para acompanhar o progresso das suas vendas no CRM.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setDreamToEdit(null);
                    setDialogOpen(true);
                  }}
                  className="gap-1.5 text-xs rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Cadastrar Primeiro Sonho
                </Button>
              </div>
            </Card>
          )}

          {/* ========================================================= */}
          {/* GRID DOS PRÓXIMOS SONHOS                                  */}
          {/* ========================================================= */}
          <div className="space-y-3 pt-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Outros Sonhos no Mural ({otherInProgress.length})
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherInProgress.map((dream) => (
                <Card
                  key={dream.id}
                  className="overflow-hidden border border-border/80 bg-card rounded-2xl shadow-xs hover:border-pink-500/40 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Imagem */}
                    <div className="relative h-40 bg-muted overflow-hidden">
                      {dream.image_url ? (
                        <img
                          src={dream.image_url}
                          alt={dream.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <Heart className="w-8 h-8 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="absolute bottom-2.5 right-2.5 bg-background/95 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs font-black text-foreground shadow-xs border border-border">
                        {formatCurrency(dream.target_value)}
                      </div>
                    </div>

                    {/* Informações */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-foreground line-clamp-1">
                          {dream.title}
                        </h4>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                            onClick={() => {
                              setDreamToEdit(dream);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => setDreamToDelete(dream)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Progresso */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-muted-foreground text-[11px]">Progresso</span>
                          <span className="text-foreground font-bold">{dream.progress_pct || 0}%</span>
                        </div>
                        <Progress value={dream.progress_pct || 0} className="h-2 rounded-full" />
                      </div>

                      {/* Meta vs Falta */}
                      <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                        <span>
                          Meta: {formatCurrency(dream.target_revenue_needed)}
                        </span>
                        <span className="font-semibold text-pink-600 dark:text-pink-400">
                          Falta: {formatCurrency(dream.remaining_revenue)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé com Focar Neste funcionando */}
                  <div className="p-3 bg-muted/20 border-t border-border/70 flex items-center justify-between">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetFeatured(dream)}
                      className="text-xs h-7 rounded-lg border-pink-500/30 text-pink-700 dark:text-pink-300 hover:bg-pink-500/10 gap-1 font-semibold"
                    >
                      <Star className="w-3 h-3" /> Focar neste
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMarkAsCompleted(dream)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 h-7 rounded-lg font-medium"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Concluir
                    </Button>
                  </div>
                </Card>
              ))}

              {/* Card Adicionar Novo */}
              <button
                type="button"
                onClick={() => {
                  setDreamToEdit(null);
                  setDialogOpen(true);
                }}
                className="min-h-[220px] rounded-2xl border-2 border-dashed border-border/80 hover:border-pink-500/50 bg-card/40 hover:bg-muted/40 transition-all flex flex-col items-center justify-center p-6 text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">Novo Sonho</div>
                  <div className="text-[11px] text-muted-foreground">Cadastre outro objetivo pessoal</div>
                </div>
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Aba de Sonhos Conquistados */
        <div className="space-y-4">
          <div className="flex items-center justify-between p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Sonhos Realizados</h3>
                <p className="text-xs text-muted-foreground">
                  Objetivos que você conquistou com suas vendas fechadas no CRM.
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                Total Realizado
              </div>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                {formatCurrency(
                  completedDreams.reduce((sum, d) => sum + (Number(d.target_value) || 0), 0)
                )}
              </div>
            </div>
          </div>

          {completedDreams.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-2xl">
              Nenhum sonho concluído ainda. Ao atingir a meta no CRM, marque como realizado para registrar sua conquista aqui.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedDreams.map((dream) => (
                <Card key={dream.id} className="overflow-hidden border border-border/80 bg-card rounded-2xl">
                  <div className="relative h-40 bg-muted overflow-hidden">
                    {dream.image_url ? (
                      <img
                        src={dream.image_url}
                        alt={dream.title}
                        className="w-full h-full object-cover grayscale-[15%]"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <Trophy className="w-8 h-8 text-amber-400/50" />
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5">
                      <Badge className="bg-amber-500 text-white text-[10px] font-bold gap-1 shadow-xs rounded-full">
                        <Trophy className="w-3 h-3" /> Realizado
                      </Badge>
                    </div>
                    <div className="absolute bottom-2.5 right-2.5 bg-background/90 px-2.5 py-1 rounded-xl text-xs font-black border border-border shadow-xs">
                      {formatCurrency(dream.target_value)}
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="font-bold text-sm text-foreground line-clamp-1">
                      {dream.title}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Conquistado em:{" "}
                      <strong>
                        {dream.completed_at
                          ? new Date(dream.completed_at).toLocaleDateString("pt-BR")
                          : "Recentemente"}
                      </strong>
                    </p>

                    <div className="pt-2 flex justify-between items-center border-t border-border/70">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReopenDream(dream)}
                        className="text-xs text-muted-foreground hover:text-foreground h-7"
                      >
                        Reabrir Meta
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDreamToDelete(dream)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Criação / Edição do Sonho */}
      <TodooDreamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        dreamToEdit={dreamToEdit}
        targetUserId={targetUserId}
      />

      {/* Modal de Comissão para Gerente */}
      <Dialog open={commissionDialogOpen} onOpenChange={setCommissionDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Taxa de Comissão da Empresa
            </DialogTitle>
            <DialogDescription className="text-xs">
              Taxa média usada para calcular a meta em vendas no CRM para o Quadro dos Sonhos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <Label htmlFor="comm-rate" className="text-xs font-semibold">
              Comissão Média das Vendas (%)
            </Label>
            <div className="relative">
              <Input
                id="comm-rate"
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={tempCommission}
                onChange={(e) => setTempCommission(Number(e.target.value) || 0)}
                className="pr-8 text-sm font-bold rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exemplo: a 5%, uma bolsa de R$ 300 exige R$ 6.000 em vendas fechadas no CRM.
            </p>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCommissionDialogOpen(false)}
              disabled={savingCommission}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveCommission}
              disabled={savingCommission}
              className="rounded-xl text-xs"
            >
              {savingCommission ? "Salvando..." : "Salvar Taxa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog
        open={!!dreamToDelete}
        onOpenChange={(open) => !open && setDreamToDelete(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              Remover sonho do quadro?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza que deseja remover o sonho &quot;{dreamToDelete?.title}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs rounded-xl"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
