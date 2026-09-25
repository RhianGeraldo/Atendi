import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Users, RefreshCw, Bot, Tag, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toggleContactLabelAction, createLabelAction, updateContactFromWhatsappAction } from "@/lib/api/chat.functions";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";
import { initials, formatPhone } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ContactDetailsTabs, ContactEditDialog } from "@/components/contacts/contact-details-sheet";
import { ContactBlockDialog } from "@/components/contacts/contact-block-dialog";
import type { ConvRow } from "./conversation-types";

interface ContactSidebarProps {
  conv: ConvRow;
  onClose?: () => void;
}

export function ContactSidebar({ conv, onClose }: ContactSidebarProps) {
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [searchLabel, setSearchLabel] = useState("");

  const { data: allLabels } = useQuery({
    queryKey: ["labels", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase.from('labels').select('*').eq('company_id', activeCompanyId);
      return data || [];
    },
    enabled: !!activeCompanyId
  });

  const toggleAi = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("conversations").update({ ai_active: active }).eq("id", conv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error("Erro ao alterar IA", { description: (e as Error).message })
  });

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, action }: { labelId: string, action: "add" | "remove" }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({ data: { unitId: selectedUnitId, contactId: conv.contact?.id, labelId, action } });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(e.message)
  });

  const createLabel = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedUnitId) return;
      const res = await createLabelAction({ data: { unitId: selectedUnitId, name } });
      if (!res?.success || !res.label) throw new Error(res?.error || "Falha ao criar etiqueta");
      return res.label;
    },
    onSuccess: async (label) => {
      qc.invalidateQueries({ queryKey: ["labels", activeCompanyId] });
      // Auto assign the newly created label
      if (conv.contact?.id && selectedUnitId) {
        toggleLabel.mutate({ labelId: label.id, action: "add" });
      }
      setSearchLabel("");
      toast.success("Etiqueta criada!");
    },
    onError: (e) => toast.error((e as Error).message)
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      return await updateContactFromWhatsappAction({
        data: { contactId: conv.contact?.id, unitId: conv.unit_id, whatsappInstanceId: conv.whatsapp_instance_id }
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        if (data.updatedName === "Foto Encontrada") {
          toast.success(data.message || "Foto de perfil atualizada!");
        } else {
          toast.success(`Nome atualizado para: ${data.updatedName}`);
        }
      } else if (data?.message) {
        toast.info(data.message);
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao atualizar contato.");
    }
  });

  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || (conv.contact.phone.includes('-') && conv.contact.phone.length > 18));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <div className="flex h-full flex-col bg-background/50">
      <div className="flex justify-between items-center p-3 pb-0">
        <h3 className="text-sm font-semibold ml-2 text-muted-foreground">Perfil</h3>
        <Button variant="ghost" size="icon" className="hidden lg:flex h-8 w-8 text-muted-foreground rounded-full hover:bg-muted" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        <div className="px-4 pb-4 space-y-4 pt-1 flex-1 flex flex-col min-h-0">
          {/* Dados do Contato e Etiquetas no mesmo card/div igual ao da IA */}
          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm space-y-3 shrink-0">
            {/* Foto do perfil no canto esquerdo, Nome e Telefone na direita */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 group">
                <Avatar className="h-14 w-14 ring-2 ring-background shadow-md">
                  {conv.contact?.avatar_url ? (
                    <img src={conv.contact.avatar_url} alt={conv.contact?.name} className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className={cn("text-xl font-medium", isGroup ? "bg-primary/20 text-primary" : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary")}>
                      {isGroup ? <Users className="h-7 w-7 opacity-80" /> : initials(contactName || "?")}
                    </AvatarFallback>
                  )}
                </Avatar>
                {conv.contact && (
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title={conv.channel === 'instagram' ? "Sincronizar perfil e foto do Instagram" : "Sincronizar foto do WhatsApp"}
                    onClick={() => updateContact.mutate()}
                    disabled={updateContact.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 text-muted-foreground ${updateContact.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <h3 className="font-bold text-base text-foreground truncate" title={contactName || "Desconhecido"}>
                    {contactName || "Desconhecido"}
                  </h3>
                  <div className="flex items-center shrink-0">
                    <ContactEditDialog contact={conv.contact} />
                    {(profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager") && conv.contact && (
                      <ContactBlockDialog contact={conv.contact} />
                    )}
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {isGroup 
                    ? "Grupo do WhatsApp" 
                    : (conv.contact?.phone 
                        ? formatPhone(conv.contact.phone) 
                        : (conv.contact?.instagram_username 
                            ? `@${conv.contact.instagram_username}` 
                            : "Sem número"))}
                </p>
              </div>
            </div>

            {/* Etiquetas integradas no mesmo card */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" /> 
                  Etiquetas
                </h4>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-56" align="end">
                    <Command>
                      <CommandInput 
                        placeholder="Buscar etiqueta..." 
                        className="h-8 text-xs" 
                        value={searchLabel}
                        onValueChange={setSearchLabel}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {searchLabel.length > 0 ? (
                            <Button 
                              variant="ghost" 
                              className="w-full justify-start text-xs h-8 font-normal"
                              onClick={() => createLabel.mutate(searchLabel)}
                              disabled={createLabel.isPending}
                            >
                              Criar "{searchLabel}"
                            </Button>
                          ) : "Nenhuma etiqueta encontrada."}
                        </CommandEmpty>
                        <CommandGroup>
                          {allLabels?.map(label => {
                            const isSelected = conv.contact?.contact_labels?.some(cl => cl.labels?.id === label.id);
                            return (
                              <CommandItem
                                key={label.id}
                                onSelect={() => {
                                  toggleLabel.mutate({ labelId: label.id, action: isSelected ? "remove" : "add" });
                                }}
                                className="text-xs"
                              >
                                <div 
                                  className="w-2 h-2 rounded-full mr-2" 
                                  style={{ backgroundColor: label.color || "#6b7280" }}
                                />
                                <span className="flex-1">{label.name}</span>
                                {isSelected && <Square className="h-3 w-3 opacity-50 bg-primary/20" />}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {conv.contact?.contact_labels?.map((cl) => {
                  const label = cl.labels;
                  if (!label) return null;
                  const hexColor = label.color || "#6b7280";
                  return (
                    <Badge 
                      key={label.id} 
                      variant="outline" 
                      className="font-normal text-[10px] px-2 py-0 h-5"
                      style={{ 
                        backgroundColor: `${hexColor}15`, 
                        color: hexColor, 
                        borderColor: `${hexColor}30` 
                      }}
                    >
                      {label.name}
                    </Badge>
                  );
                })}
                {!conv.contact?.contact_labels?.length && (
                  <span className="text-xs text-muted-foreground/70 italic">Nenhuma etiqueta atribuída.</span>
                )}
              </div>
            </div>
          </div>
          {/* AI Status Container */}
          {!isGroup && (
            <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", conv.ai_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Inteligência Artificial</h4>
                  <p className="text-xs text-muted-foreground">
                    {conv.ai_active ? "A IA está respondendo" : "IA pausada neste ticket"}
                  </p>
                </div>
              </div>
              <Switch 
                checked={conv.ai_active || false} 
                onCheckedChange={(v) => toggleAi.mutate(v)} 
                disabled={toggleAi.isPending}
              />
            </div>
          )}

          {/* Ficha Completa */}
          {conv.contact?.id && (
            <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[350px]">
              <ContactDetailsTabs contactId={conv.contact?.id} conversationId={conv.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
