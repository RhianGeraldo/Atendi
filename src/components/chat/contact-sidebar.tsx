import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, RefreshCw, Tag, Plus, Square, Target, Check, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toggleContactLabelAction, createLabelAction, updateContactFromWhatsappAction } from "@/lib/api/chat.functions";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";
import { initials, formatPhone } from "@/lib/format";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ContactAvatar } from "./contact-avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { ContactDetailsTabs, ContactEditDialog } from "@/components/contacts/contact-details-sheet";
import { ContactBlockDialog } from "@/components/contacts/contact-block-dialog";
import { useContactSources, getSourceIcon } from "@/lib/use-contact-sources";
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

  const { data: contactLabels = [] } = useQuery({
    queryKey: ["contact-labels", conv.contact?.id],
    queryFn: async () => {
      if (!conv.contact?.id) return [];
      const { data, error } = await supabase
        .from("contact_labels")
        .select("labels(id, name, color)")
        .eq("contact_id", conv.contact.id);
      if (error) return [];
      return (data || []) as { labels: { id: string; name: string; color: string | null } }[];
    },
    enabled: !!conv.contact?.id,
    staleTime: 30 * 1000,
  });

  const effectiveLabels = contactLabels.length > 0 ? contactLabels : (conv.contact?.contact_labels || []);

  const { allSources, addSource, updateContactSource } = useContactSources();
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [searchSource, setSearchSource] = useState("");
  const [detailsInput, setDetailsInput] = useState(conv.contact?.source_details || "");

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [conv.contact?.avatar_url]);

  useEffect(() => {
    setDetailsInput(conv.contact?.source_details || "");
  }, [conv.contact?.source_details]);

  const handleSelectSource = (selectedSource: string | null) => {
    if (!conv.contact?.id) return;
    updateContactSource.mutate({
      contactId: conv.contact.id,
      source: selectedSource,
      sourceDetails: selectedSource ? detailsInput : null,
    });
    setSourcePopoverOpen(false);
    setSearchSource("");
  };

  const handleCreateAndSelectSource = async (newSource: string) => {
    if (!conv.contact?.id || !newSource.trim()) return;
    const trimmed = newSource.trim();
    await addSource.mutateAsync(trimmed);
    updateContactSource.mutate({
      contactId: conv.contact.id,
      source: trimmed,
      sourceDetails: detailsInput,
    });
    setSourcePopoverOpen(false);
    setSearchSource("");
  };

  const handleSaveDetails = () => {
    if (!conv.contact?.id) return;
    updateContactSource.mutate({
      contactId: conv.contact.id,
      source: conv.contact.source || null,
      sourceDetails: detailsInput.trim() || null,
    });
  };

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, action }: { labelId: string, action: "add" | "remove" }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({ data: { unitId: selectedUnitId, contactId: conv.contact?.id, labelId, action } });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-labels", conv.contact?.id] });
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
      <div className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        <div className="px-4 pb-4 space-y-4 pt-4 flex-1 flex flex-col min-h-0">
          {/* Dados do Contato e Etiquetas no mesmo card/div igual ao da IA */}
          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm space-y-3 shrink-0">
            {/* Foto do perfil no canto esquerdo, Nome e Telefone na direita */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 group">
                <ContactAvatar
                  url={conv.contact?.avatar_url}
                  name={contactName}
                  isGroup={!!isGroup}
                  className="h-14 w-14 ring-2 ring-background shadow-md"
                  fallbackClassName="text-xl font-medium"
                />
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

            {/* Origem do Contato */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" /> 
                  Origem
                </h4>
                <Popover open={sourcePopoverOpen} onOpenChange={setSourcePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary" title={conv.contact?.source ? "Alterar origem" : "Adicionar origem"}>
                      {conv.contact?.source ? <Edit2 className="h-3 w-3" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-64" align="end">
                  <Command>
                    <CommandInput 
                      placeholder="Buscar ou criar origem..." 
                      className="h-8 text-xs" 
                      value={searchSource}
                      onValueChange={setSearchSource}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {searchSource.trim().length > 0 ? (
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start text-xs h-8 font-normal"
                            onClick={() => handleCreateAndSelectSource(searchSource)}
                            disabled={addSource.isPending || updateContactSource.isPending}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1 text-primary" />
                            Criar "{searchSource.trim()}"
                          </Button>
                        ) : "Nenhuma origem encontrada."}
                      </CommandEmpty>
                      <CommandGroup heading="Origens">
                        {allSources.map(src => {
                          const isSelected = conv.contact?.source?.toLowerCase() === src.toLowerCase();
                          return (
                            <CommandItem
                              key={src}
                              onSelect={() => handleSelectSource(src)}
                              className="text-xs flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 truncate flex-1">
                                {getSourceIcon(src)}
                                <span className="truncate">{src}</span>
                              </div>
                              {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                      {conv.contact?.source && (
                        <>
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem 
                              onSelect={() => handleSelectSource(null)}
                              className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5 mr-1.5" />
                              Remover origem
                            </CommandItem>
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>

                  {conv.contact?.source && (
                    <div className="p-2 border-t border-border/50 bg-muted/20">
                      <label className="text-[10px] text-muted-foreground font-medium block mb-1">
                        Detalhe (Campanha, Indicação, etc.)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input 
                          placeholder="Ex: Campanha Dia das Mães" 
                          value={detailsInput}
                          onChange={(e) => setDetailsInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveDetails();
                              setSourcePopoverOpen(false);
                            }
                          }}
                          className="h-7 text-xs"
                        />
                        <Button 
                          size="sm" 
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            handleSaveDetails();
                            setSourcePopoverOpen(false);
                          }}
                          disabled={updateContactSource.isPending}
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {conv.contact?.source ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge 
                      variant="outline" 
                      onClick={() => setSourcePopoverOpen(true)}
                      className="cursor-pointer hover:bg-accent text-xs py-0.5 px-2 flex items-center gap-1.5 font-medium transition-colors border-border/80"
                      title="Clique para alterar a origem"
                    >
                      {getSourceIcon(conv.contact.source)}
                      <span>{conv.contact.source}</span>
                    </Badge>

                    {conv.contact.source_details && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={conv.contact.source_details}>
                        • {conv.contact.source_details}
                      </span>
                    )}
                  </div>
                ) : (
                  <button 
                    onClick={() => setSourcePopoverOpen(true)}
                    className="text-xs text-muted-foreground/70 italic hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Definir origem do contato
                  </button>
                )}
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
                            const isSelected = effectiveLabels.some(cl => cl.labels?.id === label.id);
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
                {effectiveLabels.map((cl) => {
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
                {!effectiveLabels.length && (
                  <span className="text-xs text-muted-foreground/70 italic">Nenhuma etiqueta atribuída.</span>
                )}
              </div>
            </div>
          </div>

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
