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
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  PhoneMissed,
  RefreshCw,
  Sparkles,
  Loader2,
  FileText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transcribeCallAction } from "@/lib/api/chat.functions";
import { toast } from "sonner";
import { useState, useMemo } from "react";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [instanceFilter, setInstanceFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");

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

  const uniqueInstances = useMemo(() => {
    if (!calls) return [];
    const set = new Set<string>();
    calls.forEach((c) => {
      if (c.whatsapp_instance?.name) set.add(c.whatsapp_instance.name);
    });
    return Array.from(set).sort();
  }, [calls]);

  const uniqueAgents = useMemo(() => {
    if (!calls) return [];
    const set = new Set<string>();
    calls.forEach((c) => {
      if (c.assigned_agent?.name) set.add(c.assigned_agent.name);
    });
    return Array.from(set).sort();
  }, [calls]);

  const filteredCalls = (calls || []).filter((call) => {
    if (directionFilter !== "all" && call.direction !== directionFilter) {
      return false;
    }
    if (statusFilter !== "all" && call.status !== statusFilter) {
      return false;
    }
    if (instanceFilter !== "all" && call.whatsapp_instance?.name !== instanceFilter) {
      return false;
    }
    if (agentFilter !== "all" && call.assigned_agent?.name !== agentFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const contactName = (call.contact?.name || "").toLowerCase();
      const phone = (call.peer_number || call.contact?.phone || "").toLowerCase();
      const agentName = (call.assigned_agent?.name || "").toLowerCase();
      const instanceName = (call.whatsapp_instance?.name || "").toLowerCase();

      if (
        !contactName.includes(term) &&
        !phone.includes(term) &&
        !agentName.includes(term) &&
        !instanceName.includes(term)
      ) {
        return false;
      }
    }
    return true;
  });

  // Helper to extract clean duration in seconds for ENDED calls
  const getCallDurationSeconds = (c: CallLog): number | null => {
    if (c.status !== "ENDED") return null;
    let secs = c.duration_seconds;
    if (secs !== null && secs > 0) {
      // If duration is stored in milliseconds (> 24 hours in seconds), convert to seconds
      if (secs > 86400) {
        secs = Math.round(secs / 1000);
      }
      return secs;
    }
    // Fallback using started_at & ended_at timestamps if valid
    if (c.started_at && c.ended_at) {
      const diff = Math.round(
        (new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000
      );
      if (diff > 0 && diff < 7200) {
        return diff;
      }
    }
    return null;
  };

  // KPI Calculations
  const totalCount = filteredCalls.length;
  const incomingCount = filteredCalls.filter((c) => c.direction === "INCOMING").length;
  const outgoingCount = filteredCalls.filter((c) => c.direction === "OUTGOING").length;
  const missedCount = filteredCalls.filter(
    (c) => c.status === "NOT_ANSWERED" || c.status === "REJECTED"
  ).length;

  const endedCallsWithDuration = filteredCalls
    .map((c) => ({ call: c, secs: getCallDurationSeconds(c) }))
    .filter((item): item is { call: CallLog; secs: number } => item.secs !== null && item.secs > 0);

  const totalDurationSecs = endedCallsWithDuration.reduce((acc, item) => acc + item.secs, 0);
  const avgSecs = endedCallsWithDuration.length > 0 ? Math.round(totalDurationSecs / endedCallsWithDuration.length) : 0;
  const avgDurationFormatted = `${Math.floor(avgSecs / 60)}m ${(avgSecs % 60).toString().padStart(2, "0")}s`;

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
    durationSecs: number | null,
    status?: string
  ) => {
    if (status && status !== "ENDED" && status !== "ACTIVE") {
      return "--:--";
    }
    let secs = durationSecs;
    if (secs !== null && secs > 0) {
      if (secs > 86400) secs = Math.round(secs / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    if (!end || !start) return "--:--";
    const diff = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 1000
    );
    if (diff <= 0 || diff > 7200) return "--:--";
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
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Chamadas
            </span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Phone className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{totalCount}</div>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recebidas
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <PhoneIncoming className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {incomingCount}
          </div>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Realizadas
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <PhoneOutgoing className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {outgoingCount}
          </div>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Não Atendidas
            </span>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
              <PhoneMissed className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
            {missedCount}
          </div>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Duração Média
            </span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{avgDurationFormatted}</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <CardTitle className="text-lg font-semibold">Últimas 100 Chamadas</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-48 md:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar contato, número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Direction Filter */}
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[125px] h-8 text-xs">
                <SelectValue placeholder="Direção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Direções</SelectItem>
                <SelectItem value="INCOMING">Recebidas</SelectItem>
                <SelectItem value="OUTGOING">Realizadas</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[135px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="ENDED">Atendidas</SelectItem>
                <SelectItem value="NOT_ANSWERED">Não Atendidas</SelectItem>
                <SelectItem value="REJECTED">Rejeitadas</SelectItem>
                <SelectItem value="ACTIVE">Em Andamento</SelectItem>
              </SelectContent>
            </Select>

            {/* Instance Filter */}
            {uniqueInstances.length > 0 && (
              <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                <SelectTrigger className="w-[135px] h-8 text-xs">
                  <SelectValue placeholder="Instância" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Instâncias</SelectItem>
                  {uniqueInstances.map((inst) => (
                    <SelectItem key={inst} value={inst}>
                      {inst}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Agent Filter */}
            {uniqueAgents.length > 0 && (
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[135px] h-8 text-xs">
                  <SelectValue placeholder="Atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Atendentes</SelectItem>
                  {uniqueAgents.map((ag) => (
                    <SelectItem key={ag} value={ag}>
                      {ag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => qc.invalidateQueries({ queryKey: ["call_logs"] })}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1000px]">
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
                ) : !filteredCalls || filteredCalls.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-muted-foreground"
                    >
                      Nenhuma chamada encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCalls.map((call) => (
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
                            call.duration_seconds,
                            call.status
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
