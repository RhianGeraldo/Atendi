import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { sendProactiveMessageAction } from "@/lib/api/chat.functions";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, Loader2, MessageCircle, Send } from "lucide-react";
import { ProviderIcon } from "@/components/common/provider-icon";
import { toast } from "sonner";

export function StartConversationDialog({
  initialPhone = "",
  contactName,
  onCreated,
  trigger
}: {
  initialPhone?: string;
  contactName?: string;
  onCreated?: (id: string) => void;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(initialPhone || "");
  const [text, setText] = useState("");
  const [instanceName, setInstanceName] = useState("");

  useEffect(() => {
    if (open && initialPhone) setPhone(initialPhone);
  }, [open, initialPhone]);

  const { selectedUnitId } = useUnit();

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances", selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let query = supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider")
        .eq("company_id", activeCompanyId);
      
      if (selectedUnitId && selectedUnitId !== "all") {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId && open,
  });

  const send = useMutation({
    mutationFn: async (overrideText?: string) => {
      const textToUse = overrideText !== undefined ? overrideText : text;
      if (!activeCompanyId) throw new Error("Usuário sem empresa");
      const res = await sendProactiveMessageAction({
        data: {
          phone,
          text: textToUse,
          instanceName,
          companyId: activeCompanyId,
        }
      });
      return { res, isOpening: overrideText === "" };
    },
    onSuccess: ({ res, isOpening }) => {
      if (res.conversationId && onCreated) {
        onCreated(res.conversationId);
      }
      setOpen(false);
      setPhone(initialPhone || "");
      setText("");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(isOpening ? "Chat aberto com sucesso!" : "Mensagem enviada com sucesso!");
    },
    onError: (e) => {
      toast.error("Erro ao iniciar conversa", { description: (e as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conversa {contactName ? `com ${contactName}` : ""}</DialogTitle>
          <DialogDescription>
            {contactName 
              ? "Selecione a instância para iniciar o atendimento. Se o contato já estiver em andamento com outro atendente, você será avisado."
              : "Inicie um atendimento enviando uma mensagem ativa para o cliente ou abrindo o chat diretamente."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Instância (Remetente)</Label>
            <Select value={instanceName} onValueChange={setInstanceName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {instances?.map((inst) => (
                  <SelectItem key={inst.instance_name} value={inst.instance_name}>
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={inst.provider} />
                      <span>{inst.name || inst.instance_name}</span>
                    </div>
                  </SelectItem>
                ))}
                {!instances?.length && (
                  <SelectItem value="none" disabled>Nenhuma instância encontrada</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número do Cliente</Label>
            <Input 
              placeholder="Ex: 5511999999999" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              disabled={!!initialPhone} // Block if passed via prop
            />
            {!initialPhone && <p className="text-[10px] text-muted-foreground">Inclua o DDI (55) e o DDD.</p>}
          </div>
          <div className="space-y-2">
            <Label>Mensagem <span className="text-muted-foreground font-normal">(Opcional se for apenas abrir o chat)</span></Label>
            <Textarea 
              placeholder="Digite a primeira mensagem..." 
              value={text} 
              onChange={e => setText(e.target.value)} 
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            variant="secondary"
            onClick={() => send.mutate("")} 
            disabled={!phone || !instanceName || send.isPending}
          >
            {send.isPending && send.variables === "" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            Abrir Chat
          </Button>
          <Button 
            onClick={() => send.mutate()} 
            disabled={!phone || !instanceName || !text.trim() || send.isPending}
          >
            {send.isPending && send.variables !== "" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
