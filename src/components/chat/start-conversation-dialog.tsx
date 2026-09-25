import { useState, useEffect, useMemo } from "react";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquarePlus, Loader2, MessageCircle, Send, Building2, MapPin, AlertCircle } from "lucide-react";
import { ProviderIcon } from "@/components/common/provider-icon";
import { cn } from "@/lib/utils";
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

  const { data: company } = useQuery({
    queryKey: ["company_name", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data } = await supabase.from("companies").select("name").eq("id", activeCompanyId).single();
      return data;
    },
    enabled: !!activeCompanyId && open,
  });

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ["whatsapp_instances", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let query = supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider, network, unit_id, units(id, name, color)")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });
      
      if (selectedUnitId && selectedUnitId !== "all") {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      // Iniciar conversa ativa por número de telefone é exclusivo para WhatsApp
      const whatsAppOnly = (data ?? []).filter(
        (inst: any) => (!inst.network || inst.network === "whatsapp") && inst.provider !== "instagram" && inst.provider !== "messenger"
      );
      return whatsAppOnly;
    },
    enabled: !!activeCompanyId && open,
  });

  // Agrupa as instâncias: Sede (Empresa Mãe) e por Unidade
  const groupedInstances = useMemo(() => {
    if (!instances) return { matriz: [], byUnit: {} };

    const matriz: typeof instances = [];
    const byUnit: Record<string, { unitName: string; unitColor?: string; items: typeof instances }> = {};

    for (const inst of instances) {
      if (!inst.unit_id) {
        matriz.push(inst);
      } else {
        const uId = inst.unit_id;
        const uName = (inst.units as any)?.name || "Unidade";
        const uColor = (inst.units as any)?.color;
        if (!byUnit[uId]) {
          byUnit[uId] = { unitName: uName, unitColor: uColor, items: [] };
        }
        byUnit[uId].items.push(inst);
      }
    }

    return { matriz, byUnit };
  }, [instances]);

  const { profile } = useAuth();
  const cleanPhone = phone.replace(/\D/g, "");

  // Avalia previamente com quem está a conversa nesta instância
  const { data: existingConvInfo } = useQuery({
    queryKey: ["check_existing_conv", activeCompanyId, instanceName, cleanPhone],
    queryFn: async () => {
      if (!activeCompanyId || !instanceName || cleanPhone.length < 10) return null;
      
      const rawPhone = cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone;
      const phoneVariants = [
        rawPhone,
        rawPhone.slice(2),
        ...(rawPhone.length === 13 ? [rawPhone.slice(0, 4) + rawPhone.slice(5)] : []),
        ...(rawPhone.length === 12 ? [rawPhone.slice(0, 4) + '9' + rawPhone.slice(4)] : []),
      ];

      const selectedInst = instances?.find(i => i.instance_name === instanceName);
      if (!selectedInst) return null;

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("company_id", activeCompanyId)
        .in("phone", phoneVariants);

      if (!contacts || contacts.length === 0) return null;
      const contactIds = contacts.map(c => c.id);

      const { data: convs } = await supabase
        .from("conversations")
        .select("id, status, assigned_agent_id, assigned_agent:profiles!conversations_assigned_agent_id_fkey(name)")
        .in("contact_id", contactIds)
        .eq("whatsapp_instance_id", selectedInst.id)
        .order("last_message_at", { ascending: false })
        .limit(1);

      return convs?.[0] || null;
    },
    enabled: open && !!activeCompanyId && !!instanceName && cleanPhone.length >= 10 && !!instances?.length,
  });

  const isWithAnotherPerson = Boolean(
    existingConvInfo &&
    existingConvInfo.status === "active" &&
    existingConvInfo.assigned_agent_id &&
    existingConvInfo.assigned_agent_id !== profile?.id
  );

  const assignedAgentName = (existingConvInfo as any)?.assigned_agent?.name || "outro atendente";
  const isAdminOrManager = profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager";

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
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {isLoadingInstances ? (
                  <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando instâncias...
                  </div>
                ) : !instances?.length ? (
                  <SelectItem value="none" disabled>Nenhuma instância encontrada</SelectItem>
                ) : (
                  <>
                    {groupedInstances.matriz.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
                          <Building2 className="h-3.5 w-3.5 text-primary/70" />
                          <span>{company?.name ? `${company.name} (Sede)` : "Empresa Mãe (Sede)"}</span>
                        </SelectLabel>
                        {groupedInstances.matriz.map((inst) => (
                          <SelectItem 
                            key={inst.instance_name} 
                            value={inst.instance_name}
                            textValue={`${inst.name || inst.instance_name} (Empresa Mãe)`}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="flex items-center gap-2 truncate">
                                <ProviderIcon provider={inst.provider} network={inst.network} />
                                <span className="font-medium truncate">{inst.name || inst.instance_name}</span>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4 bg-muted/40 text-muted-foreground">
                                Empresa Mãe
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {Object.entries(groupedInstances.byUnit).map(([unitId, group], index) => (
                      <SelectGroup key={unitId}>
                        {(groupedInstances.matriz.length > 0 || index > 0) && <SelectSeparator />}
                        <SelectLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
                          <MapPin className="h-3.5 w-3.5" style={{ color: group.unitColor || "#6366f1" }} />
                          <span>{group.unitName}</span>
                        </SelectLabel>
                        {group.items.map((inst) => (
                          <SelectItem 
                            key={inst.instance_name} 
                            value={inst.instance_name}
                            textValue={`${inst.name || inst.instance_name} (${group.unitName})`}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <div className="flex items-center gap-2 truncate">
                                <ProviderIcon provider={inst.provider} network={inst.network} />
                                <span className="font-medium truncate">{inst.name || inst.instance_name}</span>
                              </div>
                              <Badge 
                                variant="secondary" 
                                className="text-[10px] shrink-0 font-normal px-1.5 py-0 h-4"
                                style={group.unitColor ? { borderColor: `${group.unitColor}40` } : undefined}
                              >
                                {group.unitName}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </>
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
              disabled={isWithAnotherPerson && !isAdminOrManager}
            />
          </div>

          {isWithAnotherPerson && (
            <div className={cn(
              "rounded-md border p-3 text-xs flex items-start gap-2.5",
              isAdminOrManager 
                ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" 
                : "bg-destructive/10 border-destructive/20 text-destructive"
            )}>
              <AlertCircle className={cn(
                "h-4 w-4 shrink-0 mt-0.5",
                isAdminOrManager ? "text-amber-600 dark:text-amber-400" : "text-destructive"
              )} />
              <div className="flex-1 space-y-0.5">
                <span className="font-semibold">Contato em andamento com {assignedAgentName}</span>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  {isAdminOrManager
                    ? "Como administrador, você possui permissão para abrir o chat e visualizar ou assumir o atendimento."
                    : "Este contato já está em atendimento com outro colega nesta instância. Apenas administradores possuem permissão para abrir ou intervir nesta conversa."}
                </p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            variant="secondary"
            onClick={() => send.mutate("")} 
            disabled={!phone || !instanceName || send.isPending || (isWithAnotherPerson && !isAdminOrManager)}
            title={isWithAnotherPerson && !isAdminOrManager ? `Bloqueado: em andamento com ${assignedAgentName}` : undefined}
          >
            {send.isPending && send.variables === "" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            Abrir Chat
          </Button>
          <Button 
            onClick={() => send.mutate(undefined)} 
            disabled={!phone || !instanceName || !text.trim() || send.isPending || (isWithAnotherPerson && !isAdminOrManager)}
            title={isWithAnotherPerson && !isAdminOrManager ? `Bloqueado: em andamento com ${assignedAgentName}` : undefined}
          >
            {send.isPending && send.variables !== "" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
