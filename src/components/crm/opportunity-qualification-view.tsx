import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Circle,
  CheckSquare,
  ArrowRight,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Loader2,
  Settings2,
  ExternalLink,
  HelpCircle,
  Check,
  Edit3,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { triggerOpportunityCapiAction } from "@/lib/api/meta-capi.functions";
import {
  type StageChecklistItem,
  type OpportunityStageAnswer,
  type StageCompletionActionType,
  getSelectOptions,
  getSelectObservationConfig,
  getQuestionDisqualification,
  formatAnswerValue,
  parseAnswerValue,
} from "@/types/crm-qualification";

interface OpportunityQualificationViewProps {
  opportunityId: string;
  onStageAdvanced?: (newStageId: string, newStageName: string) => void;
  compact?: boolean;
}

const isItemCompleted = (
  item: StageChecklistItem,
  answer?: OpportunityStageAnswer | null,
): boolean => {
  if (!answer) return false;
  if (item.response_type === "select") {
    const obsConfig = getSelectObservationConfig(item.options);
    if (obsConfig && obsConfig.trigger_options && obsConfig.trigger_options.length > 0) {
      const { selected, observation } = parseAnswerValue(answer.value);
      if (!selected) return false;
      const isTrigger = obsConfig.trigger_options.includes(selected);
      if (isTrigger && obsConfig.observation_required !== false) {
        return answer.completed === true && !!observation && observation.trim() !== "";
      }
      return answer.completed === true && !!selected;
    }
    return answer.completed === true && !!answer.value && answer.value.trim() !== "";
  }
  if (item.response_type === "text") {
    return answer.completed === true && !!answer.value && answer.value.trim() !== "";
  }
  return answer.completed === true;
};

export function OpportunityQualificationView({
  opportunityId,
  onStageAdvanced,
  compact = false,
}: OpportunityQualificationViewProps) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  // 1. Fetch Opportunity
  const { data: opportunity, isLoading: isLoadingOpp } = useQuery({
    queryKey: ["opportunity-for-qualification", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(
          `
          id,
          title,
          value,
          status,
          stage_id,
          contact_id,
          pipeline_stages (
            id,
            name,
            color,
            order,
            pipeline_id,
            meta_event_name
          )
        `,
        )
        .eq("id", opportunityId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!opportunityId,
  });

  const currentStage = opportunity?.pipeline_stages as
    | { id: string; name: string; pipeline_id: string }
    | undefined
    | null;
  const pipelineId = currentStage?.pipeline_id;

  // 2. Fetch All Stages in this Pipeline
  const { data: stages, isLoading: isLoadingStages } = useQuery({
    queryKey: ["pipeline-stages-qualification", pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!pipelineId,
  });

  // 3. Fetch Checklist Items for all stages in this pipeline
  const stageIds = stages?.map((s) => s.id) || [];
  const { data: checklistItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ["stage-checklist-items-by-stages", stageIds.join(",")],
    queryFn: async () => {
      if (stageIds.length === 0) return [];
      const { data, error } = await supabase
        .from("stage_checklist_items" as never)
        .select("*")
        .in("stage_id", stageIds)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []) as StageChecklistItem[];
    },
    enabled: stageIds.length > 0,
  });

  // 4. Fetch Answers for this Opportunity
  const { data: answers, isLoading: isLoadingAnswers } = useQuery({
    queryKey: ["opportunity-stage-answers", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunity_stage_answers")
        .select("*")
        .eq("opportunity_id", opportunityId);
      if (error) throw error;
      return (data || []) as OpportunityStageAnswer[];
    },
    enabled: !!opportunityId,
  });

  // Realtime subscription: sync when opportunity stage or answers change elsewhere
  useEffect(() => {
    if (!opportunityId) return;

    const channelId = `opp-view-${opportunityId}-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opportunities",
          filter: `id=eq.${opportunityId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["opportunity-for-qualification", opportunityId] });
          qc.invalidateQueries({ queryKey: ["opportunity-stage-answers", opportunityId] });
          qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
          qc.invalidateQueries({ queryKey: ["opportunities"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opportunity_stage_answers",
          filter: `opportunity_id=eq.${opportunityId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["opportunity-stage-answers", opportunityId] });
          qc.invalidateQueries({ queryKey: ["opportunity-for-qualification", opportunityId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [opportunityId, qc]);

  // 5. Save Answer Mutation + Auto-Advance Logic
  const saveAnswer = useMutation({
    mutationFn: async ({
      item,
      completed,
      value,
    }: {
      item: StageChecklistItem;
      completed: boolean;
      value?: string | null;
    }) => {
      if (!profile?.id) throw new Error("Usuário não autenticado");

      // Save/Upsert Answer
      const { error: answerError } = await supabase.from("opportunity_stage_answers").upsert(
        {
          opportunity_id: opportunityId,
          item_id: item.id,
          completed,
          value: value ?? null,
          answered_by: profile.id,
          answered_at: new Date().toISOString(),
        },
        {
          onConflict: "opportunity_id,item_id",
        },
      );

      if (answerError) throw answerError;

      // 1. Verificação de Regra de Desqualificação na Pergunta
      const disq = getQuestionDisqualification(item.options);
      if (completed && disq && disq.enabled) {
        const { selected } = parseAnswerValue(value);
        if (selected && selected === disq.trigger_value) {
          const reasonText = disq.reason || `Critério eliminatório na pergunta "${item.title}"`;

          if (disq.action === "mark_lost") {
            const { error: oppError } = await supabase
              .from("opportunities")
              .update({ status: "lost" })
              .eq("id", opportunityId);
            if (oppError) throw oppError;

            await supabase.from("opportunity_history").insert({
              opportunity_id: opportunityId,
              user_id: profile.id,
              action_type: "status_change",
              description: `Oportunidade marcada como PERDIDA ❌ (Desqualificada na pergunta: "${item.title}" com resposta "${selected}"). Motivo: ${reasonText}`,
            });

            return {
              disqualified: true,
              action: "mark_lost",
              reason: reasonText,
              itemTitle: item.title,
            };
          } else if (disq.action === "move_to_stage" && disq.target_stage_id) {
            const targetStage = stages?.find((s) => s.id === disq.target_stage_id);
            const targetStageName = targetStage?.name || "Etapa de Descarte";

            const { error: oppError } = await supabase
              .from("opportunities")
              .update({ stage_id: disq.target_stage_id })
              .eq("id", opportunityId);
            if (oppError) throw oppError;

            await supabase.from("opportunity_history").insert({
              opportunity_id: opportunityId,
              user_id: profile.id,
              action_type: "stage_change",
              description: `Oportunidade movida para "${targetStageName}" por desqualificação na pergunta: "${item.title}" (Resposta: "${selected}").`,
            });

            return {
              disqualified: true,
              action: "move_to_stage",
              targetStageName,
              itemTitle: item.title,
            };
          }
        }
      }

      // 2. Verificação de Conclusão dos Passos e Automação da Etapa
      const currentStageId = opportunity?.stage_id;
      if (completed && item.stage_id === currentStageId) {
        const stageItems = (checklistItems || []).filter((i) => i.stage_id === currentStageId);
        const requiredItems = stageItems.filter((i) => i.is_required);
        const effectiveRequirements = requiredItems.length > 0 ? requiredItems : stageItems;

        if (effectiveRequirements.length > 0) {
          const allCriteriaMet = effectiveRequirements.every((reqItem) => {
            if (reqItem.id === item.id) {
              return isItemCompleted(reqItem, { completed, value } as OpportunityStageAnswer);
            }
            const ans = answers?.find((a) => a.item_id === reqItem.id);
            return isItemCompleted(reqItem, ans);
          });

          if (allCriteriaMet) {
            const companyId = activeCompanyId || profile?.company_id;
            let completionAction: StageCompletionActionType = "advance_next";
            let targetStageId: string | null = null;

            // Busca automação customizada configurada para esta etapa
            if (companyId) {
              const { data: autoData } = (await supabase
                .from("automations" as never)
                .select("actions")
                .eq("company_id", companyId)
                .eq("trigger_type", "stage_checklist_completed")
                .contains("trigger_config", { stage_id: currentStageId })
                .maybeSingle()) as {
                data: {
                  actions?: { type?: StageCompletionActionType; target_stage_id?: string }[];
                } | null;
              };

              if (autoData?.actions?.[0]?.type) {
                completionAction = autoData.actions[0].type;
                targetStageId = autoData.actions[0].target_stage_id || null;
              }
            }

            const currentStageName = currentStage?.name || "Etapa Atual";

            // Executa a automação personalizada da etapa
            if (completionAction === "mark_won") {
              const { error: oppError } = await supabase
                .from("opportunities")
                .update({ status: "won" })
                .eq("id", opportunityId);
              if (oppError) throw oppError;

              await supabase.from("opportunity_history").insert({
                opportunity_id: opportunityId,
                user_id: profile.id,
                action_type: "status_change",
                description: `Oportunidade marcada como GANHA 🎉 após conclusão de todos os passos da etapa "${currentStageName}".`,
              });

              if (companyId) {
                triggerOpportunityCapiAction({
                  data: {
                    companyId,
                    opportunityId,
                    triggerType: "stage_change",
                    stageId: currentStageId,
                  },
                }).catch((err) => console.warn("[CAPI] Erro ao disparar CAPI:", err));
              }

              return { autoStatus: "won", stageName: currentStageName };
            } else if (completionAction === "mark_lost") {
              const { error: oppError } = await supabase
                .from("opportunities")
                .update({ status: "lost" })
                .eq("id", opportunityId);
              if (oppError) throw oppError;

              await supabase.from("opportunity_history").insert({
                opportunity_id: opportunityId,
                user_id: profile.id,
                action_type: "status_change",
                description: `Oportunidade marcada como PERDIDA ❌ após conclusão dos passos da etapa "${currentStageName}".`,
              });

              return { autoStatus: "lost", stageName: currentStageName };
            } else if (completionAction === "move_to_stage" && targetStageId) {
              const targetStage = stages?.find((s) => s.id === targetStageId);
              const targetName = targetStage?.name || "Nova Etapa";

              const { error: oppError } = await supabase
                .from("opportunities")
                .update({ stage_id: targetStageId })
                .eq("id", opportunityId);
              if (oppError) throw oppError;

              await supabase.from("opportunity_history").insert({
                opportunity_id: opportunityId,
                user_id: profile.id,
                action_type: "stage_change",
                description: `Oportunidade movida para "${targetName}" por automação dos passos da etapa "${currentStageName}".`,
              });

              if (companyId) {
                triggerOpportunityCapiAction({
                  data: {
                    companyId,
                    opportunityId,
                    triggerType: "stage_change",
                    stageId: targetStageId,
                  },
                }).catch((err) => console.warn("[CAPI] Erro ao disparar CAPI:", err));
              }

              return { autoAdvanced: true, nextStage: targetStage };
            } else if (completionAction === "none") {
              return { autoStatus: "none", stageName: currentStageName };
            } else {
              // Padrão: 'advance_next'
              const sortedStages = [...(stages || [])].sort((a, b) => a.order - b.order);
              const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId);

              if (currentIndex !== -1 && currentIndex + 1 < sortedStages.length) {
                const nextStage = sortedStages[currentIndex + 1];

                const { error: oppError } = await supabase
                  .from("opportunities")
                  .update({ stage_id: nextStage.id })
                  .eq("id", opportunityId);
                if (oppError) throw oppError;

                await supabase.from("opportunity_history").insert({
                  opportunity_id: opportunityId,
                  user_id: profile.id,
                  action_type: "stage_change",
                  description: `Avanço automático para "${nextStage.name}" após conclusão de todos os passos da etapa "${currentStageName}".`,
                });

                if (companyId) {
                  triggerOpportunityCapiAction({
                    data: {
                      companyId,
                      opportunityId,
                      triggerType: "stage_change",
                      stageId: nextStage.id,
                    },
                  }).catch((err) =>
                    console.warn("[CAPI] Erro ao disparar CAPI de avanço de etapa:", err),
                  );
                }

                return { autoAdvanced: true, nextStage };
              }
            }
          }
        }
      }

      return { autoAdvanced: false, nextStage: null };
    },
    onSuccess: (result: {
      disqualified?: boolean;
      action?: string;
      reason?: string;
      targetStageName?: string;
      autoStatus?: string;
      autoAdvanced?: boolean;
      nextStage?: { id: string; name: string } | null;
    }) => {
      qc.invalidateQueries({ queryKey: ["opportunity-stage-answers", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-journey"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history"] });

      if (result.disqualified) {
        if (result.action === "mark_lost") {
          toast.error(`⚠️ Oportunidade desqualificada e marcada como Perdida (${result.reason}).`, {
            duration: 5000,
          });
        } else {
          toast.warning(
            `⚠️ Oportunidade redirecionada para "${result.targetStageName}" por desqualificação.`,
            { duration: 5000 },
          );
        }
      } else if (result.autoStatus === "won") {
        toast.success(`🎉 Etapa concluída! Oportunidade marcada como GANHA!`, { duration: 4000 });
      } else if (result.autoStatus === "lost") {
        toast.error(`Etapa concluída. Oportunidade marcada como PERDIDA.`, { duration: 4000 });
      } else if (result.autoAdvanced && result.nextStage) {
        toast.success(
          `🎉 Etapa concluída! Oportunidade avançada para "${result.nextStage.name}".`,
          {
            duration: 4000,
          },
        );
        onStageAdvanced?.(result.nextStage.id, result.nextStage.name);
      } else if (result.autoStatus === "none") {
        toast.success(`Todos os passos da etapa foram concluídos!`);
      }
    },
    onError: (err: Error) => {
      toast.error("Erro ao registrar passo: " + (err.message || "Tente novamente"));
    },
  });

  // Manual advance mutation
  const manualAdvance = useMutation({
    mutationFn: async (targetStage: { id: string; name: string }) => {
      if (!profile?.id) throw new Error("Usuário não autenticado");

      const { error: oppError } = await supabase
        .from("opportunities")
        .update({ stage_id: targetStage.id })
        .eq("id", opportunityId);
      if (oppError) throw oppError;

      await supabase.from("opportunity_history").insert({
        opportunity_id: opportunityId,
        user_id: profile.id,
        action_type: "stage_change",
        description: `Oportunidade avançada manualmente para "${targetStage.name}".`,
      });

      const companyId = activeCompanyId || profile?.company_id;
      if (companyId) {
        triggerOpportunityCapiAction({
          data: {
            companyId,
            opportunityId,
            triggerType: "stage_change",
            stageId: targetStage.id,
          },
        }).catch((err) => console.warn("[CAPI] Erro ao disparar CAPI:", err));
      }

      return targetStage;
    },
    onSuccess: (targetStage) => {
      qc.invalidateQueries({ queryKey: ["opportunity-stage-answers", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunity-for-qualification", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-journey"] });
      qc.invalidateQueries({ queryKey: ["opportunity-history"] });
      toast.success(`Oportunidade avançada para "${targetStage.name}"!`);
      onStageAdvanced?.(targetStage.id, targetStage.name);
    },
    onError: (err: Error) => {
      toast.error("Erro ao avançar etapa: " + (err.message || "Tente novamente"));
    },
  });

  const isLoading = isLoadingOpp || isLoadingStages || isLoadingItems || isLoadingAnswers;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-xs">Carregando passos da etapa...</span>
      </div>
    );
  }

  if (!opportunity || !stages || stages.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        Oportunidade ou funil não encontrado.
      </div>
    );
  }

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const currentStageIndex = sortedStages.findIndex((s) => s.id === opportunity.stage_id);
  const activeStage = expandedStageId
    ? sortedStages.find((s) => s.id === expandedStageId) || currentStage
    : currentStage;

  const activeStageIndex = sortedStages.findIndex((s) => s.id === activeStage?.id);
  const previousStage = currentStageIndex > 0 ? sortedStages[currentStageIndex - 1] : null;
  const nextStage =
    currentStageIndex !== -1 && currentStageIndex + 1 < sortedStages.length
      ? sortedStages[currentStageIndex + 1]
      : null;

  // Active stage items & progress
  const activeItems = (checklistItems || []).filter((i) => i.stage_id === activeStage?.id);
  const activeRequiredItems = activeItems.filter((i) => i.is_required);
  const isCurrentStageActive = activeStage?.id === currentStage?.id;

  const getAnswer = (itemId: string) => answers?.find((a) => a.item_id === itemId);
  const completedCount = activeItems.filter((i) => isItemCompleted(i, getAnswer(i.id))).length;
  const completedRequiredCount = activeRequiredItems.filter((i) =>
    isItemCompleted(i, getAnswer(i.id)),
  ).length;

  const totalCriteria =
    activeRequiredItems.length > 0 ? activeRequiredItems.length : activeItems.length;
  const currentCriteriaDone =
    activeRequiredItems.length > 0 ? completedRequiredCount : completedCount;
  const progressPercent =
    totalCriteria > 0 ? Math.round((currentCriteriaDone / totalCriteria) * 100) : 100;
  const isAllCriteriaDone = totalCriteria > 0 && currentCriteriaDone === totalCriteria;

  // COMPACT VIEW: Ultra-clean, direct layout for the Chat Aside
  // Sem stepper de bolinhas, sem seletores duplicados, sem caixas aninhadas
  if (compact) {
    return (
      <div className="space-y-2 pt-0.5">
        {opportunity.status === "lost" && (
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/25 text-red-700 dark:text-red-300 text-[11px] font-medium">
            <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
            <span className="truncate">
              Oportunidade <strong>PERDIDA ❌</strong>
            </span>
          </div>
        )}
        {opportunity.status === "won" && (
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">
              Oportunidade <strong>GANHA 🎉</strong>
            </span>
          </div>
        )}
        {/* Simple Progress Header */}
        <div className="flex items-center justify-between gap-2 text-xs px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: currentStage?.color || "#3b82f6" }}
            />
            <span className="font-semibold text-foreground truncate text-[11px]">
              {currentStage?.name || "Etapa Atual"}
            </span>
          </div>

          {activeItems.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium">
                {currentCriteriaDone}/{totalCriteria} ({progressPercent}%)
              </span>
              <div className="w-14">
                <Progress value={progressPercent} className="h-1.5" />
              </div>
            </div>
          )}
        </div>

        {/* When 100% done alert banner */}
        {isAllCriteriaDone && totalCriteria > 0 && (
          <div className="flex items-center justify-between gap-1.5 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">
                {nextStage ? `Passos concluídos! Avançar etapa?` : `Todos os passos concluídos!`}
              </span>
            </div>
            {nextStage && (
              <Button
                size="sm"
                variant="ghost"
                disabled={manualAdvance.isPending}
                onClick={() => manualAdvance.mutate(nextStage)}
                className="h-6 px-2 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/20 shrink-0"
              >
                Avançar <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        {/* Checklist Items list - Simple and direct */}
        {activeItems.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70 italic py-1 px-1">
            Nenhum passo cadastrado para esta etapa.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeItems.map((item) => {
              const answer = getAnswer(item.id);
              const isChecked = isItemCompleted(item, answer);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-2 rounded-lg border transition-all text-xs space-y-1",
                    isChecked
                      ? "bg-muted/30 border-border/40 text-muted-foreground"
                      : "bg-background border-border/70 hover:border-primary/40 text-foreground",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {item.response_type === "checkbox" && (
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          saveAnswer.mutate({ item, completed: !!checked });
                        }}
                        disabled={saveAnswer.isPending}
                        className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 shrink-0"
                      />
                    )}

                    {item.response_type !== "checkbox" && (
                      <div className="mt-0.5 shrink-0">
                        {isChecked ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "font-medium leading-tight text-xs",
                            item.response_type === "checkbox" &&
                              isChecked &&
                              "line-through text-muted-foreground/70",
                          )}
                        >
                          {item.title}
                        </span>

                        {item.is_required && (
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0 rounded font-semibold shrink-0",
                              isChecked
                                ? "bg-muted text-muted-foreground/60"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                            )}
                          >
                            Obrigatório
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Select */}
                  {item.response_type === "select" && (
                    <div className="pl-5 pt-0.5">
                      <SelectWithObservationField
                        item={item}
                        answer={answer}
                        disabled={saveAnswer.isPending}
                        compact={true}
                        onSave={({ completed, value }) => {
                          saveAnswer.mutate({ item, completed, value });
                        }}
                      />
                    </div>
                  )}

                  {/* Text */}
                  {item.response_type === "text" && (
                    <div className="pl-5 pt-0.5">
                      <TextInputField
                        defaultValue={answer?.value || ""}
                        placeholder="Digite a resposta..."
                        disabled={saveAnswer.isPending}
                        onSave={(val) => {
                          const isFilled = val.trim().length > 0;
                          saveAnswer.mutate({
                            item,
                            completed: isFilled,
                            value: isFilled ? val.trim() : null,
                          });
                        }}
                      />
                    </div>
                  )}

                  {/* Answer timestamp */}
                  {isChecked && answer?.answered_at && (
                    <div className="pl-5 text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Respondido em{" "}
                      {format(new Date(answer.answered_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {opportunity.status === "lost" && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 text-xs font-medium animate-in fade-in duration-150">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
          <span>
            Esta oportunidade está marcada como <strong>PERDIDA ❌</strong> no funil.
          </span>
        </div>
      )}
      {opportunity.status === "won" && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium animate-in fade-in duration-150">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Esta oportunidade está marcada como <strong>GANHA 🎉</strong>!
          </span>
        </div>
      )}

      {/* Header Pipeline Stepper */}
      <div className="bg-muted/30 border border-border/60 rounded-xl p-3">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Passos da Etapa / Qualificação
            </span>
          </div>
          {nextStage && isCurrentStageActive && (
            <Button
              variant="ghost"
              size="sm"
              disabled={manualAdvance.isPending}
              onClick={() => manualAdvance.mutate(nextStage)}
              className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
              title={`Pular e avançar direto para ${nextStage.name}`}
            >
              <span>Avançar para {nextStage.name}</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Stepper bubbles */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {sortedStages.map((stage, idx) => {
            const isCurrent = stage.id === currentStage?.id;
            const isPast = currentStageIndex > -1 && idx < currentStageIndex;
            const isSelected = stage.id === activeStage?.id;

            // Stage checklist stats
            const sItems = (checklistItems || []).filter((i) => i.stage_id === stage.id);
            const sReq = sItems.filter((i) => i.is_required);
            const sEffective = sReq.length > 0 ? sReq : sItems;
            const sDone = sEffective.filter((i) => isItemCompleted(i, getAnswer(i.id))).length;
            const isStageFullDone = sEffective.length > 0 && sDone === sEffective.length;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setExpandedStageId(stage.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0 cursor-pointer text-left",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                    : isCurrent
                      ? "border-primary/50 bg-background text-foreground hover:bg-muted"
                      : isPast
                        ? "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground"
                        : "border-border/40 bg-background/50 text-muted-foreground/80 hover:text-foreground",
                )}
              >
                <div className="flex items-center justify-center shrink-0">
                  {isPast || isStageFullDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : isCurrent ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-primary/30"
                      style={{ backgroundColor: stage.color || "#3b82f6" }}
                    />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground/60" />
                  )}
                </div>
                <span className="truncate max-w-[120px]">{stage.name}</span>
                {sItems.length > 0 && (
                  <span
                    className={cn(
                      "text-[10px] px-1 py-0 rounded font-semibold ml-0.5",
                      isStageFullDone
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : isCurrent
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {sDone}/{sEffective.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Stage Details & Checklist Card */}
      <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs space-y-4">
        {/* Stage Title and Progress */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/50">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: activeStage?.color || "#3b82f6" }}
              />
              <h4 className="font-semibold text-sm text-foreground">{activeStage?.name}</h4>
              {isCurrentStageActive ? (
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-bold border-primary/40 bg-primary/10 text-primary"
                >
                  Etapa Atual
                </Badge>
              ) : activeStageIndex < currentStageIndex ? (
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-medium border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                >
                  Concluída
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                  Futura
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {activeItems.length > 0
                ? activeRequiredItems.length > 0
                  ? `${activeRequiredItems.length} passo(s) obrigatório(s) para avançar a oportunidade`
                  : `${activeItems.length} passo(s) recomendados para esta etapa`
                : "Nenhum critério pré-definido para esta etapa."}
            </p>
          </div>

          {activeItems.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <span className="text-xs font-semibold text-foreground">
                  {currentCriteriaDone} de {totalCriteria}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {progressPercent}% concluído
                </span>
              </div>
              <div className="w-20">
                <Progress value={progressPercent} className="h-2" />
              </div>
            </div>
          )}
        </div>

        {/* All Required Criteria Completed Alert */}
        {isCurrentStageActive && isAllCriteriaDone && totalCriteria > 0 && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>
                {nextStage
                  ? "Critérios concluídos! Esta oportunidade avançará automaticamente para a próxima etapa."
                  : "Todos os critérios da etapa final foram concluídos com sucesso!"}
              </span>
            </div>
            {nextStage && (
              <Button
                size="sm"
                variant="outline"
                disabled={manualAdvance.isPending}
                onClick={() => manualAdvance.mutate(nextStage)}
                className="h-7 text-xs font-semibold border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500 hover:text-white shrink-0 cursor-pointer"
              >
                Avançar Agora <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {/* Checklist Items List */}
        {activeItems.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed rounded-lg bg-muted/20 space-y-2">
            <p className="text-xs text-muted-foreground">
              Não existem passos ou critérios de qualificação cadastrados para a etapa{" "}
              <strong>"{activeStage?.name}"</strong>.
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              Você pode avançar a oportunidade manualmente quando desejar.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeItems.map((item) => {
              const answer = getAnswer(item.id);
              const isChecked = isItemCompleted(item, answer);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-2 p-3 rounded-lg border transition-all select-none",
                    isChecked
                      ? "bg-muted/30 border-border/60"
                      : "bg-card border-border/80 hover:border-primary/40",
                  )}
                >
                  {/* Item Header: Title, Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Checkbox response type */}
                      {item.response_type === "checkbox" && (
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            saveAnswer.mutate({ item, completed: !!checked });
                          }}
                          disabled={saveAnswer.isPending}
                          className="mt-0.5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 shrink-0"
                        />
                      )}

                      {/* Select / Text response type icon indicator */}
                      {item.response_type !== "checkbox" && (
                        <div className="mt-0.5 shrink-0">
                          {isChecked ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                      )}

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-xs font-semibold leading-tight",
                              item.response_type === "checkbox" &&
                                isChecked &&
                                "line-through text-muted-foreground",
                            )}
                          >
                            {item.title}
                          </span>

                          {item.is_required ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1.5 py-0 h-4 border-amber-500/30 font-semibold",
                                isChecked
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                              )}
                            >
                              Obrigatório
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground/80"
                            >
                              Opcional
                            </Badge>
                          )}

                          {item.response_type === "select" && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            >
                              Seleção
                            </Badge>
                          )}

                          {(() => {
                            const disq = getQuestionDisqualification(item.options);
                            if (disq && disq.enabled) {
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-medium flex items-center gap-1"
                                  title={disq.reason || `Elimina se "${disq.trigger_value}"`}
                                >
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  Elimina se "{disq.trigger_value}"
                                </Badge>
                              );
                            }
                            return null;
                          })()}

                          {item.response_type === "text" && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                            >
                              Texto
                            </Badge>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-[11px] text-muted-foreground leading-normal">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Response Input for Select */}
                  {item.response_type === "select" && (
                    <div className="pl-6 pt-1">
                      <SelectWithObservationField
                        item={item}
                        answer={answer}
                        disabled={saveAnswer.isPending}
                        compact={false}
                        onSave={({ completed, value }) => {
                          saveAnswer.mutate({ item, completed, value });
                        }}
                      />
                    </div>
                  )}

                  {/* Response Input for Text */}
                  {item.response_type === "text" && (
                    <div className="pl-6 pt-1">
                      <TextInputField
                        defaultValue={answer?.value || ""}
                        placeholder="Digite a resposta do lead..."
                        disabled={saveAnswer.isPending}
                        onSave={(val) => {
                          const isFilled = val.trim().length > 0;
                          saveAnswer.mutate({
                            item,
                            completed: isFilled,
                            value: isFilled ? val.trim() : null,
                          });
                        }}
                      />
                    </div>
                  )}

                  {/* Answered Timestamp */}
                  {isChecked && answer?.answered_at && (
                    <div className="pl-6 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3 w-3" />
                      <span>
                        Respondido em{" "}
                        {format(new Date(answer.answered_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Subcomponent for Text Field with local state and onBlur/onKeyDown saving
function TextInputField({
  defaultValue,
  placeholder,
  disabled,
  onSave,
}: {
  defaultValue: string;
  placeholder?: string;
  disabled?: boolean;
  onSave: (val: string) => void;
}) {
  const [val, setVal] = useState(defaultValue);

  React.useEffect(() => {
    setVal(defaultValue);
  }, [defaultValue]);

  const handleBlur = () => {
    if (val !== defaultValue) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className="h-8 text-xs bg-background"
    />
  );
}

// Subcomponent for Select Field with conditional observation support (Google Forms style)
function SelectWithObservationField({
  item,
  answer,
  disabled,
  compact = false,
  onSave,
}: {
  item: StageChecklistItem;
  answer?: OpportunityStageAnswer | null;
  disabled?: boolean;
  compact?: boolean;
  onSave: (val: { completed: boolean; value: string | null }) => void;
}) {
  const choices = getSelectOptions(item.options);
  const obsConfig = getSelectObservationConfig(item.options);
  const { selected, observation } = parseAnswerValue(answer?.value);
  const isTrigger = obsConfig?.trigger_options?.includes(selected);

  const handleSelectChange = (val: string) => {
    if (val === "__empty__") {
      onSave({ completed: false, value: null });
      return;
    }

    const willTrigger = obsConfig?.trigger_options?.includes(val);
    if (willTrigger) {
      const hasObs = !!observation && observation.trim().length > 0;
      const isCompleted = obsConfig?.observation_required === false ? true : hasObs;
      onSave({
        completed: isCompleted,
        value: formatAnswerValue(val, observation),
      });
    } else {
      onSave({
        completed: true,
        value: val,
      });
    }
  };

  const handleObservationSave = (newObs: string) => {
    if (!selected) return;
    const hasObs = newObs.trim().length > 0;
    const isCompleted = obsConfig?.observation_required === false ? true : hasObs;
    onSave({
      completed: isCompleted,
      value: formatAnswerValue(selected, newObs),
    });
  };

  return (
    <div className="space-y-2 w-full max-w-md">
      <Select
        value={selected || "__empty__"}
        onValueChange={handleSelectChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn("text-xs bg-background w-full", compact ? "h-7" : "h-8")}>
          <SelectValue placeholder="Selecione uma opção..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__empty__" className="text-xs text-muted-foreground italic">
            (Não respondido)
          </SelectItem>
          {choices.map((choice, cIdx) => (
            <SelectItem key={cIdx} value={choice} className="text-xs">
              {choice}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Observation input appears if trigger option is selected */}
      {isTrigger && obsConfig && (
        <div className="p-2.5 rounded-lg border border-border/70 bg-muted/30 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {obsConfig.observation_placeholder || "Observação / Detalhes:"}
            </span>
            {obsConfig.observation_required !== false && !observation.trim() && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                Observação obrigatória
              </span>
            )}
          </div>
          <TextInputField
            defaultValue={observation}
            placeholder={obsConfig.observation_placeholder || "Digite a observação..."}
            disabled={disabled}
            onSave={handleObservationSave}
          />
        </div>
      )}
    </div>
  );
}
