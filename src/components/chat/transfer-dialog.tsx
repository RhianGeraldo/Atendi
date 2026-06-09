import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowRightLeft, Users, Building2, User, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { transferConversationAction } from "@/lib/api/chat.functions";
import { useUnit } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

export function TransferDialog({ conv }: { conv: any }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"department" | "agent">("department");
  const qc = useQueryClient();

  const { data: departments, isLoading: loadingDepts } = useQuery({
    queryKey: ["departments", conv.unit_id],
    queryFn: async () => {
      let query = supabase
        .from("departments")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (conv.unit_id) {
        query = query.or(`unit_id.eq.${conv.unit_id},unit_id.is.null`);
      } else {
        query = query.is("unit_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ["unit_agents", conv.unit_id],
    queryFn: async () => {
      if (conv.unit_id) {
        const { data, error } = await supabase
          .from("user_units")
          .select("user_id, profiles!inner(id, name, email, avatar_url, role, departments!profiles_department_id_fkey(name))")
          .eq("unit_id", conv.unit_id);
        if (error) throw error;
        return data.map((d: any) => d.profiles);
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name, email, avatar_url, role, departments!profiles_department_id_fkey(name)")
          .or('has_matriz_access.eq.true,role.eq.admin_company');
        if (error) throw error;
        return data;
      }
    },
    enabled: open,
  });

  const transfer = useMutation({
    mutationFn: async ({ targetId, targetType }: { targetId: string; targetType: "department" | "agent" }) => {
      await transferConversationAction({
        data: { conversationId: conv.id, targetId, targetType },
      });
    },
    onSuccess: () => {
      toast.success("Atendimento transferido com sucesso.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => {
      toast.error("Erro ao transferir", { description: (e as Error).message });
    },
  });

  const returnToQueue = useMutation({
    mutationFn: async () => {
      await supabase
        .from("conversations")
        .update({ status: "waiting", assigned_agent_id: null })
        .eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento retornado para a fila");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Transferir Atendimento">
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Atendimento</DialogTitle>
          <DialogDescription>
            Escolha para onde deseja transferir este atendimento.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="department">
              <Building2 className="w-4 h-4 mr-2" />
              Departamento
            </TabsTrigger>
            <TabsTrigger value="agent">
              <User className="w-4 h-4 mr-2" />
              Atendente
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="department" className="mt-4">
            <ScrollArea className="h-[250px] rounded-md border p-2">
              {loadingDepts ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>
              ) : departments?.length ? (
                <div className="flex flex-col gap-1">
                  {departments.map((dept) => (
                    <button
                      key={dept.id}
                      onClick={() => transfer.mutate({ targetId: dept.id, targetType: "department" })}
                      disabled={transfer.isPending}
                      className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent text-left transition-colors"
                    >
                      <span className="font-medium">{dept.name}</span>
                      {transfer.isPending && transfer.variables?.targetId === dept.id && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center p-4">Nenhum departamento encontrado.</div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="agent" className="mt-4">
            <ScrollArea className="h-[250px] rounded-md border p-2">
              {loadingAgents ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>
              ) : agents?.length ? (
                <div className="flex flex-col gap-1">
                  {agents.map((agent: any) => (
                    <button
                      key={agent.id}
                      onClick={() => transfer.mutate({ targetId: agent.id, targetType: "agent" })}
                      disabled={transfer.isPending || agent.id === conv.assigned_agent_id}
                      className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent text-left transition-colors disabled:opacity-50"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-[10px]">{initials(agent.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-medium truncate">{agent.name}</div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <span>{agent.email}</span>
                          {agent.departments?.name && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-foreground">{agent.departments.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {agent.id === conv.assigned_agent_id && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Atual</span>
                      )}
                      {transfer.isPending && transfer.variables?.targetId === agent.id && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center p-4">Nenhum atendente encontrado.</div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="pt-4 mt-2 border-t flex justify-between items-center">
          <span className="text-xs text-muted-foreground flex-1 pr-4">
            Você também pode devolver este atendimento para a fila, deixando-o livre para outro consultor.
          </span>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => returnToQueue.mutate()} 
            disabled={returnToQueue.isPending}
            className="shrink-0"
          >
            {returnToQueue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
            Devolver para a fila
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
