import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
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
import { PhoneIncoming, PhoneOutgoing, Download, Clock, PhoneMissed, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/calls")({
  component: CallsPage,
});

function CallsPage() {
  const { profile } = useAuth();

  const { data: calls, isLoading } = useQuery({
    queryKey: ["call_logs", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      
      const { data, error } = await supabase
        .from("call_logs")
        .select(`
          *,
          assigned_agent:profiles!call_logs_assigned_agent_id_fkey(name),
          contact:contacts!call_logs_contact_id_fkey(name, phone),
          whatsapp_instance:whatsapp_instances!call_logs_whatsapp_instance_id_fkey(name)
        `)
        .eq("company_id", profile.company_id)
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const formatDuration = (start: string, end: string | null, durationSecs: number | null) => {
    if (durationSecs !== null) {
      const m = Math.floor(durationSecs / 60);
      const s = durationSecs % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    if (!end) return "--:--";
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Chamadas</h1>
        <Button variant="outline" onClick={() => window.location.reload()}>
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
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      Nenhuma chamada encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  calls.map((call: any) => (
                    <TableRow key={call.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {call.direction === "INCOMING" ? (
                            call.status === "NOT_ANSWERED" || call.status === "REJECTED" ? (
                              <PhoneMissed, RefreshCw className="h-4 w-4 text-red-500" />
                            ) : (
                              <PhoneIncoming className="h-4 w-4 text-blue-500" />
                            )
                          ) : (
                            <PhoneOutgoing className="h-4 w-4 text-green-500" />
                          )}
                          <span className="text-sm font-medium">
                            {call.direction === "INCOMING" ? "Recebida" : "Realizada"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {call.whatsapp_instance?.name || "Desconhecido"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{call.contact?.name || "Desconhecido"}</span>
                          <span className="text-xs text-muted-foreground">{call.peer_number || call.contact?.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {call.assigned_agent?.name || "Nenhum"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={call.status === "ENDED" ? "default" : call.status === "ACTIVE" ? "success" : "secondary"}>
                          {call.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={call.recording_url || `https://storage.wavoip.com/${call.wavoip_call_id}`} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatDuration(call.started_at, call.ended_at, call.duration_seconds)}
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
    </div>
  );
}
