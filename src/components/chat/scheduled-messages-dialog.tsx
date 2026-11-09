/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarClock,
  Calendar as CalendarIcon,
  Clock,
  Send,
  Trash2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, isBefore, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("10:00");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [showPendingList, setShowPendingList] = useState(false);

  // Helper para obter data e hora padrão baseada no fuso de Brasília
  const resetScheduleToDefault = React.useCallback(() => {
    const nowUtc = new Date();
    const spString = nowUtc.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const spDate = new Date(spString);

    if (spDate.getHours() >= 18) {
      spDate.setDate(spDate.getDate() + 1);
      spDate.setHours(9, 0, 0, 0);
    } else {
      spDate.setHours(spDate.getHours() + 1, 0, 0, 0);
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    setSelectedDate(spDate);
    setSelectedTime(`${pad(spDate.getHours())}:${pad(spDate.getMinutes())}`);
  }, []);

  // Ao abrir o diálogo, atualiza com initialText e reseta para o default
  useEffect(() => {
    if (open) {
      if (initialText) {
        setContent(initialText);
      }
      resetScheduleToDefault();
    }
  }, [open, initialText, resetScheduleToDefault]);

  // Query das mensagens agendadas desta conversa
  const { data: scheduledData } = useQuery({
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
      if (!selectedDate) {
        throw new Error("Selecione a data de envio.");
      }
      if (!selectedTime) {
        throw new Error("Informe o horário de envio.");
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const year = selectedDate.getFullYear();
      const month = pad(selectedDate.getMonth() + 1);
      const day = pad(selectedDate.getDate());

      // Monta ISO string explícita em horário de Brasília (UTC-3)
      const targetIso = `${year}-${month}-${day}T${selectedTime}:00-03:00`;
      const targetDate = new Date(targetIso);

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
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 gap-5">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Agendar Mensagem</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Envio automático via WhatsApp na data e hora selecionadas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mensagem */}
          <div className="space-y-1.5">
            <Label htmlFor="scheduled-message-text" className="text-xs font-semibold">
              Mensagem
            </Label>
            <Textarea
              id="scheduled-message-text"
              placeholder="Digite a mensagem a ser enviada..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="resize-none text-sm bg-background"
            />
          </div>

          {/* Data e Horário */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Data e Horário do Envio
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="sm:col-span-3">
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal text-xs sm:text-sm h-10 bg-background",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary shrink-0" />
                      {selectedDate ? (
                        format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                      ) : (
                        <span>Selecione a data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[60]" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setIsCalendarOpen(false);
                        }
                      }}
                      disabled={(date) => isBefore(date, startOfToday())}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="sm:col-span-2">
                <div className="relative flex items-center">
                  <Clock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="h-10 pl-9 text-sm bg-background"
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Horário de Brasília (UTC-3)
            </p>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={scheduleMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => scheduleMutation.mutate()}
            disabled={!content.trim() || !selectedDate || !selectedTime || scheduleMutation.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {scheduleMutation.isPending ? "Agendando..." : "Agendar Mensagem"}
          </Button>
        </div>

        {/* Mensagens Agendadas Existentes (Colapsável sutil para não poluir o layout) */}
        {pendingList.length > 0 && (
          <div className="pt-3 border-t">
            <button
              type="button"
              onClick={() => setShowPendingList((prev) => !prev)}
              className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <CalendarClock className="h-3.5 w-3.5 text-primary" />
                {pendingList.length === 1
                  ? "1 mensagem agendada nesta conversa"
                  : `${pendingList.length} mensagens agendadas nesta conversa`}
              </span>
              <span className="text-[11px] font-semibold text-primary flex items-center gap-0.5">
                {showPendingList ? "Ocultar" : "Ver / Cancelar"}
                {showPendingList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </span>
            </button>

            {showPendingList && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                {pendingList.map((item: any) => {
                  const isAgent = item.creator_type === "agent" || item.creator_type === "system";
                  const scheduledDate = new Date(item.scheduled_at);

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg border bg-muted/30 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={isAgent ? "secondary" : "outline"}
                            className="text-[9px] h-4 gap-0.5 font-normal px-1"
                          >
                            {isAgent ? (
                              <>
                                <Bot className="h-2.5 w-2.5 text-purple-600" />
                                IA
                              </>
                            ) : (
                              <>
                                <User className="h-2.5 w-2.5 text-blue-600" />
                                Atendente
                              </>
                            )}
                          </Badge>
                          <span className="text-[11px] font-medium text-foreground">
                            {scheduledDate.toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          "{item.content}"
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                        title="Cancelar envio"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
