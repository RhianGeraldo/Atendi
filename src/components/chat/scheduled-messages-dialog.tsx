/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarClock,
  Clock,
  Send,
  Trash2,
  AlertCircle,
  Bot,
  User,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  scheduleChatMessageAction,
  listScheduledMessagesAction,
  cancelScheduledMessageAction,
} from "@/lib/api/chat.functions";

interface ScheduledMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  initialText?: string;
  onScheduled?: () => void;
}

export function ScheduledMessagesDialog({
  open,
  onOpenChange,
  conversationId,
  initialText = "",
  onScheduled,
}: ScheduledMessagesDialogProps) {
  const qc = useQueryClient();
  const [content, setContent] = useState(initialText);

  // Helper para obter o momento atual no fuso de Brasília (UTC-3)
  const getBrasiliaNow = () => {
    const nowUtc = new Date();
    const spString = nowUtc.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    return new Date(spString);
  };

  // Data/hora padrão: amanhã às 10:00 (Horário de Brasília)
  const getDefaultDateTime = React.useCallback(() => {
    const d = getBrasiliaNow();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    // Formato local YYYY-MM-DDTHH:mm para input type="datetime-local"
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>(getDefaultDateTime);

  // Atualizar quando abrir se initialText mudou
  React.useEffect(() => {
    if (open) {
      if (initialText) setContent(initialText);
      setScheduledAtLocal(getDefaultDateTime());
    }
  }, [open, initialText, getDefaultDateTime]);

  // Query das mensagens agendadas desta conversa
  const { data: scheduledData, isLoading: isLoadingList } = useQuery({
    queryKey: ["scheduled-messages", conversationId],
    queryFn: async () => {
      const res = await listScheduledMessagesAction({ data: { conversationId } });
      return res.list || [];
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const pendingList = scheduledData || [];

  // Mutation para agendar mensagem
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!content.trim()) {
        throw new Error("Digite o texto da mensagem.");
      }

      // Garante parsing explícito no Horário de Brasília (-03:00) para evitar desvio de fuso
      const isoWithTz =
        scheduledAtLocal.includes("Z") ||
        scheduledAtLocal.includes("+") ||
        scheduledAtLocal.includes("-03:00")
          ? scheduledAtLocal
          : `${scheduledAtLocal}:00-03:00`;

      const targetDate = new Date(isoWithTz);
      if (Number.isNaN(targetDate.getTime())) {
        throw new Error("Data e horário inválidos.");
      }
      if (targetDate.getTime() <= Date.now()) {
        throw new Error("O agendamento deve ser para um horário futuro.");
      }

      return await scheduleChatMessageAction({
        data: {
          conversationId,
          text: content.trim(),
          scheduledAt: targetDate.toISOString(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Mensagem agendada com sucesso!");
      setContent("");
      qc.invalidateQueries({ queryKey: ["scheduled-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["has-scheduled-messages", conversationId] });
      if (onScheduled) onScheduled();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao agendar mensagem.");
    },
  });

  // Mutation para cancelar agendamento
  const cancelMutation = useMutation({
    mutationFn: async (scheduledId: string) => {
      return await cancelScheduledMessageAction({
        data: { scheduledId, reason: "Cancelado pelo usuário" },
      });
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado!");
      qc.invalidateQueries({ queryKey: ["scheduled-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["has-scheduled-messages", conversationId] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao cancelar agendamento.");
    },
  });

  // Atalhos rápidos de data/horário (baseados no Horário de Brasília)
  const applyPreset = (preset: "today_18" | "tomorrow_10" | "in_2_days" | "next_monday") => {
    const d = getBrasiliaNow();
    const pad = (n: number) => String(n).padStart(2, "0");

    if (preset === "today_18") {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() < getBrasiliaNow().getTime()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (preset === "tomorrow_10") {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else if (preset === "in_2_days") {
      d.setDate(d.getDate() + 2);
      d.setHours(10, 0, 0, 0);
    } else if (preset === "next_monday") {
      const daysUntilMonday = (1 + 7 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      d.setHours(10, 0, 0, 0);
    }

    setScheduledAtLocal(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">Agendamento de Mensagens</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Programe mensagens para envio automático no WhatsApp ou gerencie envios futuros.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pt-4 pr-1">
          {/* Seção de Novo Agendamento */}
          <div className="space-y-4 bg-muted/30 p-4 rounded-xl border">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                Nova Mensagem Agendada
              </Label>
              <span className="text-xs text-muted-foreground">Envio automático via WhatsApp</span>
            </div>

            {/* Presets Rápidos */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-full"
                onClick={() => applyPreset("today_18")}
              >
                Hoje às 18:00
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-full"
                onClick={() => applyPreset("tomorrow_10")}
              >
                Amanhã às 10:00
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-full"
                onClick={() => applyPreset("in_2_days")}
              >
                Em 2 dias às 10:00
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs rounded-full"
                onClick={() => applyPreset("next_monday")}
              >
                Segunda-feira às 10:00
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-3 space-y-1.5">
                <Label
                  htmlFor="scheduled-datetime"
                  className="text-xs text-muted-foreground flex items-center justify-between"
                >
                  <span>Data e Horário de Envio</span>
                  <span className="text-[10px] text-primary/80 font-medium">
                    Horário de Brasília (BRT / UTC-3)
                  </span>
                </Label>
                <Input
                  id="scheduled-datetime"
                  type="datetime-local"
                  value={scheduledAtLocal}
                  onChange={(e) => setScheduledAtLocal(e.target.value)}
                  className="bg-background text-sm"
                />
              </div>

              <div className="sm:col-span-3 space-y-1.5">
                <Label htmlFor="scheduled-content" className="text-xs text-muted-foreground">
                  Texto da Mensagem
                </Label>
                <Textarea
                  id="scheduled-content"
                  placeholder="Escreva a mensagem que será enviada no dia e horário agendados..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  className="bg-background resize-none text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={() => scheduleMutation.mutate()}
                disabled={!content.trim() || scheduleMutation.isPending}
                size="sm"
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {scheduleMutation.isPending ? "Agendando..." : "Confirmar Agendamento"}
              </Button>
            </div>
          </div>

          {/* Seção de Mensagens Pendentes nesta Conversa */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Mensagens Agendadas ({pendingList.length})
              </h4>
              {pendingList.length > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  {pendingList.length} envio(s) pendente(s)
                </span>
              )}
            </div>

            {isLoadingList ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Carregando mensagens agendadas...
              </div>
            ) : pendingList.length === 0 ? (
              <div className="p-8 text-center border rounded-xl border-dashed bg-muted/10 space-y-1">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-foreground">
                  Nenhuma mensagem agendada no momento
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Quando você ou a IA agendarem envios futuros, eles aparecerão listados aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingList.map((item: any) => {
                  const isAgent = item.creator_type === "agent" || item.creator_type === "system";
                  const scheduledDate = new Date(item.scheduled_at);
                  const isPast = scheduledDate.getTime() <= Date.now();

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border bg-card flex items-start justify-between gap-3 shadow-xs hover:border-primary/30 transition-all"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={isAgent ? "secondary" : "outline"}
                            className="text-[10px] h-5 gap-1 font-medium"
                          >
                            {isAgent ? (
                              <>
                                <Bot className="h-3 w-3 text-purple-600" />
                                IA Especialista
                              </>
                            ) : (
                              <>
                                <User className="h-3 w-3 text-blue-600" />
                                Atendente
                              </>
                            )}
                          </Badge>

                          <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3 text-primary" />
                            {scheduledDate.toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>

                          {isPast && (
                            <Badge variant="destructive" className="text-[10px] h-5">
                              Disparando agora...
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3 bg-muted/40 p-2 rounded-md">
                          "{item.content}"
                        </p>

                        {item.metadata?.reason && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-500" />
                            Motivo: {item.metadata.reason}
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                        title="Cancelar envio"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
