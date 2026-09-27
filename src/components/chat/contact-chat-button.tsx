import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  Loader2, 
  ArrowRight, 
  Building, 
  Clock, 
  MessageSquare
} from "lucide-react";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { formatRelative } from "@/lib/format";
import { toast } from "sonner";

interface ContactChatButtonProps {
  contactId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  conversationId?: string | null;
  trigger?: React.ReactNode;
  onOpen?: () => void;
  onNavigate?: () => void;
  className?: string;
  tooltipText?: string;
}

interface InstanceOption {
  instanceId: string;
  instanceName: string;
  unitName?: string | null;
  unitColor?: string | null;
  conversation: any;
}

export function ContactChatButton({
  contactId,
  contactName,
  phone,
  conversationId,
  trigger,
  onOpen,
  onNavigate,
  className,
  tooltipText = "Ir para conversa",
}: ContactChatButtonProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [instanceOptions, setInstanceOptions] = useState<InstanceOption[]>([]);
  const [startConvOpen, setStartConvOpen] = useState(false);

  const getTabForStatus = (status?: string): "waiting" | "active" | "resolved" => {
    if (status === "resolved") return "resolved";
    if (status === "waiting") return "waiting";
    return "active";
  };

  const executeNavigation = (convId: string, status?: string) => {
    if (onNavigate) onNavigate();
    if (onOpen) onOpen();
    navigate({
      to: "/conversations",
      search: { c: convId, tab: getTabForStatus(status) } as any,
    });
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!contactId && !phone && !conversationId) {
      toast.error("Contato sem número de telefone ou identificador.");
      return;
    }

    try {
      setIsLoading(true);

      let convList: any[] = [];

      // 1. Busca conversas pelo contactId
      if (contactId) {
        const { data, error } = await supabase
          .from("conversations")
          .select(`
            id,
            status,
            channel,
            last_message_at,
            last_message_preview,
            whatsapp_instance_id,
            whatsapp_instance:whatsapp_instances (
              id,
              name,
              instance_name,
              provider,
              unit_id,
              units ( name, color )
            )
          `)
          .eq("contact_id", contactId)
          .order("last_message_at", { ascending: false });

        if (!error && data) {
          convList = data;
        }
      }

      // 2. Se não encontrou por contactId mas tem telefone, busca contatos com variações do número
      if ((!convList || convList.length === 0) && phone) {
        const clean = phone.replace(/\D/g, "");
        if (clean.length >= 10) {
          const rawPhone = clean.startsWith("55") ? clean : "55" + clean;
          const phoneVariants = [
            rawPhone,
            rawPhone.slice(2),
            ...(rawPhone.length === 13 ? [rawPhone.slice(0, 4) + rawPhone.slice(5)] : []),
            ...(rawPhone.length === 12 ? [rawPhone.slice(0, 4) + "9" + rawPhone.slice(4)] : []),
          ];

          const { data: phoneContacts } = await supabase
            .from("contacts")
            .select("id")
            .in("phone", phoneVariants);

          if (phoneContacts && phoneContacts.length > 0) {
            const cIds = phoneContacts.map((c) => c.id);
            const { data: phoneConvs } = await supabase
              .from("conversations")
              .select(`
                id,
                status,
                channel,
                last_message_at,
                last_message_preview,
                whatsapp_instance_id,
                whatsapp_instance:whatsapp_instances (
                  id,
                  name,
                  instance_name,
                  provider,
                  unit_id,
                  units ( name, color )
                )
              `)
              .in("contact_id", cIds)
              .order("last_message_at", { ascending: false });

            if (phoneConvs && phoneConvs.length > 0) {
              convList = phoneConvs;
            }
          }
        }
      }

      // 3. Avalia as conversas encontradas agrupando por instância
      if (!convList || convList.length === 0) {
        // Se já tínhamos um conversationId explícito vinculado, abre direto
        if (conversationId) {
          setIsLoading(false);
          executeNavigation(conversationId, "active");
          return;
        }

        // Nenhuma conversa existente: abre diálogo para iniciar novo atendimento
        setIsLoading(false);
        setStartConvOpen(true);
        return;
      }

      // Agrupa uma conversa representativa por instância (priorizando conversas ativas/aguardando sobre resolvidas)
      const instanceMap = new Map<string, any>();
      for (const conv of convList) {
        const instId = conv.whatsapp_instance_id || "sem_instancia";
        const existing = instanceMap.get(instId);
        if (!existing) {
          instanceMap.set(instId, conv);
        } else if (existing.status === "resolved" && conv.status !== "resolved") {
          instanceMap.set(instId, conv);
        }
      }

      const options: InstanceOption[] = Array.from(instanceMap.entries()).map(([instId, conv]) => {
        const inst = conv.whatsapp_instance as any;
        return {
          instanceId: instId,
          instanceName: inst?.name || inst?.instance_name || "Instância WhatsApp",
          unitName: inst?.units?.name || null,
          unitColor: inst?.units?.color || null,
          conversation: conv,
        };
      });

      // CASO A: Existe apenas UMA instância -> abre DIRETO no chat!
      if (options.length === 1) {
        const targetConv = options[0].conversation;
        setIsLoading(false);
        executeNavigation(targetConv.id, targetConv.status);
        return;
      }

      // CASO B: Existe em MAIS DE UMA instância -> pergunta qual instância deseja abrir
      setInstanceOptions(options);
      setSelectorOpen(true);
      setIsLoading(false);
    } catch (err: any) {
      console.error("Erro ao verificar conversas do contato:", err);
      toast.error("Não foi possível localizar a conversa do contato.");
      setIsLoading(false);
    }
  };

  const handleSelectInstance = (option: InstanceOption) => {
    const targetConv = option.conversation;
    setSelectorOpen(false);
    executeNavigation(targetConv.id, targetConv.status);
  };

  return (
    <>
      {/* Botão Gatilho */}
      {React.isValidElement(trigger) ? (
        React.cloneElement(trigger as React.ReactElement<any>, {
          onClick: (e: React.MouseEvent) => {
            (trigger as any).props?.onClick?.(e);
            handleClick(e);
          },
          disabled: isLoading || (trigger as any).props?.disabled,
        })
      ) : trigger ? (
        <span onClick={handleClick} className={className}>
          {trigger}
        </span>
      ) : (
        <Button
          variant="secondary"
          size="icon"
          className={className || "h-7 w-7 rounded-full shadow-sm bg-background border hover:bg-primary hover:text-primary-foreground transition-colors"}
          onClick={handleClick}
          disabled={isLoading}
          title={tooltipText}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      {/* Modal quando o contato tem atendimento em mais de uma instância */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-500" />
              Escolha a Instância para Atender
            </DialogTitle>
            <DialogDescription>
              O contato <strong>{contactName || "selecionado"}</strong> possui atendimentos em mais de uma instância. Clique na instância que deseja abrir:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-3">
            {instanceOptions.map((opt) => {
              const conv = opt.conversation;
              const isResolved = conv.status === "resolved";
              const isWaiting = conv.status === "waiting";

              return (
                <div
                  key={opt.instanceId}
                  onClick={() => handleSelectInstance(opt)}
                  className="group flex flex-col p-3 rounded-xl border border-border/70 bg-card hover:border-primary hover:bg-primary/5 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                      <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{opt.instanceName}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.unitName && (
                        <div className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                          <span 
                            className="h-1.5 w-1.5 rounded-full shrink-0" 
                            style={{ backgroundColor: opt.unitColor || "#3b82f6" }} 
                          />
                          <span>{opt.unitName}</span>
                        </div>
                      )}

                      <Badge 
                        variant="outline" 
                        className={`text-[10px] px-1.5 h-4 font-semibold ${
                          isResolved 
                            ? "bg-muted text-muted-foreground" 
                            : isWaiting 
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/30" 
                            : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        }`}
                      >
                        {isResolved ? "Resolvido" : isWaiting ? "Aguardando" : "Em andamento"}
                      </Badge>
                    </div>
                  </div>

                  {conv.last_message_preview && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1 pl-6">
                      "{conv.last_message_preview}"
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground pl-6">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {conv.last_message_at ? formatRelative(conv.last_message_at) : "Sem mensagens"}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-medium text-xs group-hover:translate-x-0.5 transition-transform">
                      Abrir conversa <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fallback caso não haja nenhuma conversa criada ainda */}
      {startConvOpen && (
        <StartConversationDialog
          initialPhone={phone || ""}
          contactName={contactName || ""}
          onCreated={(id) => {
            setStartConvOpen(false);
            navigate({ to: "/conversations", search: { c: id, tab: "active" } as any });
          }}
          trigger={<span className="hidden" />}
        />
      )}
    </>
  );
}
