import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  PhoneMissed,
  RefreshCw,
  Sparkles,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { transcribeCallAction } from "@/lib/api/chat.functions";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/calls")({
  component: CallsPage,
});

type CallLog = {
  id: string;
  direction: "INCOMING" | "OUTGOING";
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcription: string | null;
  peer_number: string | null;
  assigned_agent?: { name: string } | null;
  contact?: { name: string; phone: string } | null;
  whatsapp_instance?: { name: string } | null;
};

function TranscriptionDialog({ call }: { call: CallLog }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Player de áudio */}
      {call.recording_url && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Gravação
          </span>
          <audio controls src={call.recording_url} className="w-full h-10" />
        </div>
      )}

      {/* Transcrição */}
      {call.transcription && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Transcrição Automática
          </span>
          <div className="rounded-lg border border-border bg-muted/30 p-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {call.transcription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CallsPage() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  const { data: calls, isLoading } = useQuery({
    queryKey: ["call_logs", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];

      const { data, error } = await supabase
        .from("call_logs")
        .select(`
          *,
          assigned_agent:profiles!call_logs_assigned_agent_id_fkey(name),
          contact:contacts!call_logs_contact_id_fkey(name, phone),
          whatsapp_instance:whatsapp_instances!call_logs_whatsapp_instance_id_fkey(name)
        `)
        .eq("company_id", activeCompanyId)
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as CallLog[];
    },
    enabled: !!activeCompanyId,
  });

  const transcribeMutation = useMutation({
    mutationFn: async (callId: string) => {
      return transcribeCallAction({ data: { callId } });
    },
    onSuccess: (data, callId) => {
      toast.success("Transcrição concluída!");
      qc.setQueryData(
        ["call_logs", activeCompanyId],
        (old: CallLog[] | undefined) => {
          if (!old) return old;
          const updated = old.map((c) =>
            c.id === callId ? { ...c, transcription: data.text } : c
          );
          // Atualizar o dialog se estiver aberto para esta ligação
          setSelectedCall((prev) =>
            prev?.id === callId ? { ...prev, transcription: data.text } : prev
          );
          return updated;
        }
      );
    },
    onError: (e) =>
      toast.error("Erro na transcrição", { description: (e as Error).message }),
  });

  const formatDuration = (
    start: string,
    end: string | null,
    durationSecs: number | null
  ) => {
    if (durationSecs !== null) {
      const m = Math.floor(durationSecs / 60);
      const s = durationSecs % 60;
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    if (!end) return "--:--";
    const diff = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 1000
    );
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Histórico de Chamadas
        </h1>
        <Button
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["call_logs"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas 100 Chamadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direção</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gravação</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      Carregando chamadas...
                    </TableCell>
                  </TableRow>
                ) : !calls || calls.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-muted-foreground"
                    >
                      Nenhuma chamada encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {call.direction === "INCOMING" ? (
                            call.status === "NOT_ANSWERED" ||
                            call.status === "REJECTED" ? (
                              <PhoneMissed className="h-4 w-4 text-red-500" />
                            ) : (
                              <PhoneIncoming className="h-4 w-4 text-blue-500" />
                            )
                          ) : (
                            <PhoneOutgoing className="h-4 w-4 text-green-500" />
                          )}
                          <span className="text-sm font-medium">
                            {call.direction === "INCOMING"
                              ? "Recebida"
                              : "Realizada"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {call.whatsapp_instance?.name || "Desconhecido"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {call.contact?.name || "Desconhecido"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {call.peer_number || call.contact?.phone}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {call.assigned_agent?.name || "Nenhum"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            call.status === "ENDED"
                              ? "default"
                              : call.status === "ACTIVE"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {call.status}
                        </Badge>
                      </TableCell>

                      {/* Coluna de Gravação */}
                      <TableCell>
                        {call.recording_url ? (
                          <div className="flex flex-col gap-1.5">
                            {/* Player compacto inline — fixo em altura, não quebra layout */}
                            <audio
                              controls
                              preload="metadata"
                              src={call.recording_url}
                              className="h-8"
                              style={{ width: 200 }}
                            />
                            {/* Botão de ação contextual */}
                            {call.transcription ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/5 w-full"
                                onClick={() => setSelectedCall(call)}
                              >
                                <FileText className="h-3 w-3" />
                                Ver Transcrição
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] gap-1 border border-border/60 text-muted-foreground hover:text-primary w-full"
                                onClick={() => transcribeMutation.mutate(call.id)}
                                disabled={
                                  transcribeMutation.isPending &&
                                  transcribeMutation.variables === call.id
                                }
                              >
                                {transcribeMutation.isPending &&
                                transcribeMutation.variables === call.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                Transcrever
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Sem gravação
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatDuration(
                            call.started_at,
                            call.ended_at,
                            call.duration_seconds
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(call.started_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Transcrição */}
      <Dialog
        open={!!selectedCall}
        onOpenChange={(open) => !open && setSelectedCall(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {selectedCall?.direction === "INCOMING" ? (
                  <PhoneIncoming className="h-4 w-4 text-blue-500" />
                ) : (
                  <PhoneOutgoing className="h-4 w-4 text-green-500" />
                )}
                <span>
                  {selectedCall?.direction === "INCOMING"
                    ? "Ligação Recebida"
                    : "Ligação Realizada"}
                </span>
              </div>
              <span className="text-muted-foreground font-normal text-sm">
                —{" "}
                {selectedCall?.contact?.name ||
                  selectedCall?.peer_number ||
                  "Desconhecido"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedCall && (
            <>
              {/* Metadados da chamada */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-b pb-3">
                <span>
                  📅{" "}
                  {selectedCall.started_at
                    ? formatDate(selectedCall.started_at)
                    : "—"}
                </span>
                <span>
                  ⏱{" "}
                  {formatDuration(
                    selectedCall.started_at,
                    selectedCall.ended_at,
                    selectedCall.duration_seconds
                  )}
                </span>
                {selectedCall.assigned_agent?.name && (
                  <span>👤 {selectedCall.assigned_agent.name}</span>
                )}
              </div>

              <TranscriptionDialog call={selectedCall} />

              {/* Botão de transcrever se não tiver ainda */}
              {!selectedCall.transcription && selectedCall.recording_url && (
                <div className="flex justify-end pt-2 border-t">
                  <Button
                    onClick={() => {
                      transcribeMutation.mutate(selectedCall.id);
                    }}
                    disabled={
                      transcribeMutation.isPending &&
                      transcribeMutation.variables === selectedCall.id
                    }
                    className="gap-2"
                  >
                    {transcribeMutation.isPending &&
                    transcribeMutation.variables === selectedCall.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Transcrever Gravação
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
