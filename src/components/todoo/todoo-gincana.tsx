import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Medal,
  Flame,
  Award,
  TrendingUp,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  User,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { TodooConsultantScore } from "@/types/todoo";

export function TodooGincana() {
  const { activeCompanyId } = useActiveCompany();

  // Busca dados de desempenho para o ranking
  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["todoo-gincana-scores", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // 1. Busca todos os leads da empresa
      const { data: leads, error } = await (supabase.from("todoo_leads") as any)
        .select(`
          id,
          assigned_user_id,
          status,
          outcome_value,
          sla_breached,
          first_contact_at,
          assigned_user:profiles(id, name, avatar_url)
        `)
        .eq("company_id", activeCompanyId);

      if (error) throw error;

      // 2. Agrupa por usuário
      const userMap = new Map<string, TodooConsultantScore>();

      (leads || []).forEach((lead: any) => {
        if (!lead.assigned_user_id || !lead.assigned_user) return;

        const uid = lead.assigned_user_id;
        if (!userMap.has(uid)) {
          userMap.set(uid, {
            userId: uid,
            userName: lead.assigned_user.name || "Consultora",
            userAvatar: lead.assigned_user.avatar_url,
            leadsAssigned: 0,
            leadsContacted: 0,
            leadsWon: 0,
            leadsScheduled: 0,
            revenueWon: 0,
            slaBreaches: 0,
            conversionRate: 0,
            totalPoints: 0,
          });
        }

        const score = userMap.get(uid)!;
        score.leadsAssigned += 1;

        if (lead.status !== "pending") {
          score.leadsContacted += 1;
        }

        if (lead.status === "won") {
          score.leadsWon += 1;
          score.revenueWon += Number(lead.outcome_value) || 0;
          score.totalPoints += 10; // +10 por fechamento
        }

        if (lead.status === "scheduled") {
          score.leadsScheduled += 1;
          score.totalPoints += 5; // +5 por agendamento
        }

        if (lead.status === "quoted") {
          score.totalPoints += 2; // +2 por proposta
        }

        // Bônus SLA cumprido
        if (lead.first_contact_at && !lead.sla_breached) {
          score.totalPoints += 2;
        }

        // Penalidade SLA estourado
        if (lead.sla_breached) {
          score.slaBreaches += 1;
          score.totalPoints = Math.max(0, score.totalPoints - 5);
        }
      });

      // Calcula taxa de conversão e ordena por pontos
      const scoreList = Array.from(userMap.values()).map((s) => ({
        ...s,
        conversionRate: s.leadsContacted > 0 ? Math.round((s.leadsWon / s.leadsContacted) * 100) : 0,
      }));

      return scoreList.sort((a, b) => b.totalPoints - a.totalPoints || b.revenueWon - a.revenueWon);
    },
  });

  const top1 = scores[0];
  const top2 = scores[1];
  const top3 = scores[2];

  return (
    <div className="space-y-6">
      {/* Banner da Gincana */}
      <div className="bg-gradient-to-r from-amber-500/10 via-primary/10 to-transparent p-6 rounded-2xl border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            <h2 className="text-xl font-bold text-foreground">Gincana Comercial do Todoo</h2>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Competição saudável com base no manual operacional: premie resultados reais, agendamentos rápidos e cumprimento de SLA.
          </p>
        </div>

        {/* Regras de Pontuação */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            Contrato Fechado: +10 pts
          </Badge>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            Agendamento: +5 pts
          </Badge>
          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
            SLA no Prazo: +2 pts
          </Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
            SLA Vencido: -5 pts
          </Badge>
        </div>
      </div>

      {/* Pódio (Top 3) */}
      {scores.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          {/* 2º Lugar */}
          {top2 && (
            <Card className="order-2 md:order-1 border-muted-foreground/20 text-center flex flex-col justify-end">
              <CardContent className="p-6 space-y-3">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-lg">
                  🥈 2º
                </div>
                <Avatar className="h-16 w-16 mx-auto border-2 border-slate-300 shadow-sm">
                  <AvatarImage src={top2.userAvatar || undefined} />
                  <AvatarFallback>{top2.userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold text-sm">{top2.userName}</h4>
                  <p className="text-xs text-muted-foreground">{top2.leadsWon} contratos fechados</p>
                </div>
                <div className="pt-2 border-t border-border/60">
                  <span className="text-xl font-bold text-foreground">{top2.totalPoints} pts</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 1º Lugar (Destaque) */}
          {top1 && (
            <Card className="order-1 md:order-2 border-amber-500/40 bg-amber-500/5 text-center flex flex-col justify-end shadow-md relative overflow-hidden">
              <div className="absolute top-2 right-2">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              </div>
              <CardContent className="p-6 space-y-3">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/20 text-amber-600 font-bold text-xl">
                  👑 1º
                </div>
                <Avatar className="h-20 w-20 mx-auto border-4 border-amber-400 shadow-md">
                  <AvatarImage src={top1.userAvatar || undefined} />
                  <AvatarFallback>{top1.userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-bold text-base text-foreground">{top1.userName}</h4>
                  <p className="text-xs text-emerald-600 font-medium">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(top1.revenueWon)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{top1.leadsWon} contratos fechados</p>
                </div>
                <div className="pt-2 border-t border-amber-500/20">
                  <span className="text-2xl font-black text-amber-600">{top1.totalPoints} pts</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3º Lugar */}
          {top3 && (
            <Card className="order-3 md:order-3 border-muted-foreground/20 text-center flex flex-col justify-end">
              <CardContent className="p-6 space-y-3">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-800/10 text-amber-800 dark:text-amber-600 font-bold text-lg">
                  🥉 3º
                </div>
                <Avatar className="h-16 w-16 mx-auto border-2 border-amber-700/30 shadow-sm">
                  <AvatarImage src={top3.userAvatar || undefined} />
                  <AvatarFallback>{top3.userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold text-sm">{top3.userName}</h4>
                  <p className="text-xs text-muted-foreground">{top3.leadsWon} contratos fechados</p>
                </div>
                <div className="pt-2 border-t border-border/60">
                  <span className="text-xl font-bold text-foreground">{top3.totalPoints} pts</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabela de Ranking Geral */}
      <Card>
        <CardHeader className="p-4 border-b border-border">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Classificação Geral da Equipe
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Carregando pontuações da gincana...
            </div>
          ) : scores.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhuma consultora com leads registrados até o momento.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {scores.map((score, index) => (
                <div
                  key={score.userId}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-muted-foreground w-6 text-center">
                      #{index + 1}
                    </span>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={score.userAvatar || undefined} />
                      <AvatarFallback>{score.userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-semibold text-xs text-foreground">{score.userName}</h4>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{score.leadsContacted} contatados</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-medium">{score.leadsWon} fechamentos ({score.conversionRate}%)</span>
                        <span>•</span>
                        <span>{score.leadsScheduled} agendados</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div className="hidden sm:block">
                      <span className="text-[11px] text-muted-foreground block">Faturamento</span>
                      <strong className="text-xs font-semibold text-foreground">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(score.revenueWon)}
                      </strong>
                    </div>

                    <div className="w-20 text-right">
                      <Badge className="bg-primary text-primary-foreground font-mono font-bold text-xs px-2.5 py-1">
                        {score.totalPoints} pts
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
