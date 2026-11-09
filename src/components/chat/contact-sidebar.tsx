import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, RefreshCw, Tag, Plus, Square, Target, Check, Edit2, X, Building2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleContactLabelAction,
  createLabelAction,
  updateContactFromWhatsappAction,
} from "@/lib/api/chat.functions";
import { updateContactUnitAction } from "@/lib/api/contacts.functions";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ContactDetailsTabs, ContactEditDialog } from "@/components/contacts/contact-details-sheet";
import { ContactBlockDialog } from "@/components/contacts/contact-block-dialog";
import { useContactSources, getSourceIcon } from "@/lib/use-contact-sources";
import { ConvRow, isGroupConversation } from "./conversation-types";
import { WhatsAppGroupSidebar } from "./whatsapp-group-sidebar";

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
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);

  const { data: allLabels } = useQuery({
    queryKey: ["labels", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase
        .from("labels")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("name");
      return data || [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: contactLabels, isLoading: isLoadingContactLabels } = useQuery({
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
    staleTime: 5 * 1000,
  });

  const effectiveLabels =
    !isLoadingContactLabels && contactLabels !== undefined
      ? contactLabels
      : conv.contact?.contact_labels || [];

  const { allSources, addSource, updateContactSource } = useContactSources();
  const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";

  const { data: companyUnits } = useQuery({
    queryKey: ["units", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, color")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: async (newUnitId: string | null) => {
      if (!conv.contact?.id) return;
      const compId = activeCompanyId || conv.contact?.company_id || profile?.company_id;
      if (!compId) throw new Error("Empresa não selecionada.");
      return await updateContactUnitAction({
        data: {
          contactId: conv.contact.id,
          unitId: newUnitId,
          companyId: compId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Unidade do contato atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts-counts"] });
      qc.invalidateQueries({ queryKey: ["contact-details", conv.contact?.id] });
    },
    onError: (err: any) => {
      toast.error("Erro ao alterar unidade", { description: err.message });
    },
  });

  const contactUnit = companyUnits?.find((u: any) => u.id === conv.contact?.unit_id);

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
    mutationFn: async ({ labelId, action }: { labelId: string; action: "add" | "remove" }) => {
      if (!conv.contact?.id) throw new Error("Contato não identificado");
      const unitId = selectedUnitId || conv.unit_id || null;
      const res = await toggleContactLabelAction({
        data: {
          unitId,
          contactId: conv.contact.id,
          labelId,
          action,
        },
      });
      if (!res?.success) throw new Error(res?.error || "Erro ao atualizar etiqueta");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-labels", conv.contact?.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar etiqueta"),
  });

  const createLabel = useMutation({
    mutationFn: async (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("O nome da etiqueta é obrigatório");
      const unitId = selectedUnitId || conv.unit_id || null;
      const res = await createLabelAction({
        data: {
          unitId,
          companyId: activeCompanyId,
          name: trimmedName,
        },
      });
      if (!res?.success || !res.label) throw new Error(res?.error || "Falha ao criar etiqueta");
      return res.label;
    },
    onSuccess: async (label) => {
      qc.invalidateQueries({ queryKey: ["labels", activeCompanyId] });
      // Auto assign the newly created label
      if (conv.contact?.id) {
        toggleLabel.mutate({ labelId: label.id, action: "add" });
      }
      setSearchLabel("");
      toast.success("Etiqueta criada!");
    },
    onError: (e: any) => toast.error(e.message || "Falha ao criar etiqueta"),
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      return await updateContactFromWhatsappAction({
        data: {
          contactId: conv.contact?.id,
          unitId: conv.unit_id,
          whatsappInstanceId: conv.whatsapp_instance_id,
        },
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
    },
  });

  const isGroup = isGroupConversation(conv);

  if (isGroup) {
    return <WhatsAppGroupSidebar conv={conv} onClose={onClose} />;
  }

  const contactName = conv.contact?.name;

  return (
    <div className="flex h-full flex-col bg-background/50">
      {/* Header com título e botão de fechar X no canto superior direito */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60">
        <h2 className="text-sm md:text-base font-semibold text-foreground truncate">
          {isGroup ? "Dados do grupo" : "Dados do contato"}
        </h2>
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={onClose}
            title="Fechar informações"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

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
                    title={
                      conv.channel === "instagram"
                        ? "Sincronizar perfil e foto do Instagram"
                        : "Sincronizar foto do WhatsApp"
                    }
                    onClick={() => updateContact.mutate()}
                    disabled={updateContact.isPending}
                  >
                    <RefreshCw
                      className={`h-3 w-3 text-muted-foreground ${updateContact.isPending ? "animate-spin" : ""}`}
                    />
                  </Button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <h3
                    className="font-bold text-base text-foreground truncate"
                    title={contactName || "Desconhecido"}
                  >
                    {contactName || "Desconhecido"}
                  </h3>
                  <div className="flex items-center shrink-0">
                    <ContactEditDialog contact={conv.contact} />
                    {(profile?.role === "admin_company" ||
                      profile?.role === "super_admin" ||
                      profile?.role === "manager") &&
                      conv.contact && <ContactBlockDialog contact={conv.contact} />}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {isGroup
                    ? "Grupo do WhatsApp"
                    : conv.contact?.phone
                      ? formatPhone(conv.contact.phone)
                      : conv.contact?.instagram_username
                        ? `@${conv.contact.instagram_username}`
                        : "Sem número"}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary"
                      title={conv.contact?.source ? "Alterar origem" : "Adicionar origem"}
                    >
                      {conv.contact?.source ? (
                        <Edit2 className="h-3 w-3" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
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
                          ) : (
                            "Nenhuma origem encontrada."
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Origens">
                          {allSources.map((src) => {
                            const isSelected =
                              conv.contact?.source?.toLowerCase() === src.toLowerCase();
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
                                {isSelected && (
                                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
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
                              if (e.key === "Enter") {
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
                      <span
                        className="text-[11px] text-muted-foreground truncate max-w-[180px]"
                        title={conv.contact.source_details}
                      >
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

            {/* Unidade do Contato */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Unidade
                </h4>

                {isAdmin && companyUnits && companyUnits.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary cursor-pointer"
                        title="Alterar unidade do contato (Administrador)"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-1.5 w-56" align="end">
                      <div className="text-[11px] font-semibold text-muted-foreground px-2 py-1 flex items-center gap-1 border-b border-border/40 pb-1 mb-1">
                        <Building2 className="h-3 w-3" /> Alterar Unidade do Contato
                      </div>
                      <div className="space-y-0.5 max-h-48 overflow-y-auto">
                        <Button
                          variant={!conv.contact?.unit_id ? "secondary" : "ghost"}
                          size="sm"
                          className="w-full justify-start text-xs h-7 font-normal"
                          onClick={() => updateUnitMutation.mutate(null)}
                          disabled={updateUnitMutation.isPending}
                        >
                          Sem unidade (Geral / Matriz)
                          {!conv.contact?.unit_id && <Check className="h-3 w-3 ml-auto text-primary" />}
                        </Button>
                        {companyUnits.map((u: any) => (
                          <Button
                            key={u.id}
                            variant={conv.contact?.unit_id === u.id ? "secondary" : "ghost"}
                            size="sm"
                            className="w-full justify-start text-xs h-7 font-normal gap-1.5"
                            onClick={() => updateUnitMutation.mutate(u.id)}
                            disabled={updateUnitMutation.isPending}
                          >
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: u.color || "#6366f1" }}
                            />
                            <span className="truncate">{u.name}</span>
                            {conv.contact?.unit_id === u.id && (
                              <Check className="h-3 w-3 ml-auto text-primary" />
                            )}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Badge
                  variant={contactUnit?.name ? "outline" : "secondary"}
                  className="text-xs py-0.5 px-2 flex items-center gap-1.5 font-medium border-border/80"
                  style={contactUnit?.color ? { borderColor: `${contactUnit.color}60`, color: contactUnit.color } : undefined}
                >
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span>{contactUnit?.name || "Sem unidade (Geral / Matriz)"}</span>
                </Badge>
              </div>
            </div>

            {/* Etiquetas integradas no mesmo card */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  Etiquetas
                </h4>
                <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-60" align="end">
                    <Command>
                      <CommandInput
                        placeholder="Buscar ou criar etiqueta..."
                        className="h-8 text-xs"
                        value={searchLabel}
                        onValueChange={setSearchLabel}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {searchLabel.trim().length > 0 ? (
                            <Button
                              variant="ghost"
                              className="w-full justify-start text-xs h-8 font-normal cursor-pointer text-primary hover:text-primary"
                              onClick={() => createLabel.mutate(searchLabel.trim())}
                              disabled={createLabel.isPending}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Criar "{searchLabel.trim()}"
                            </Button>
                          ) : (
                            "Nenhuma etiqueta encontrada."
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {allLabels?.map((label) => {
                            const isSelected = effectiveLabels.some(
                              (cl) => cl.labels?.id === label.id,
                            );
                            return (
                              <CommandItem
                                key={label.id}
                                onSelect={() => {
                                  toggleLabel.mutate({
                                    labelId: label.id,
                                    action: isSelected ? "remove" : "add",
                                  });
                                }}
                                className="text-xs cursor-pointer flex items-center justify-between py-1.5"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: label.color || "#6b7280" }}
                                  />
                                  <span className="truncate">{label.name}</span>
                                </div>
                                {isSelected && (
                                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {searchLabel.trim().length > 0 &&
                          !allLabels?.some(
                            (l) => l.name.toLowerCase() === searchLabel.trim().toLowerCase(),
                          ) && (
                            <div className="p-1 border-t border-border/50">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs h-8 font-normal text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                                onClick={() => createLabel.mutate(searchLabel.trim())}
                                disabled={createLabel.isPending}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Criar "{searchLabel.trim()}"
                              </Button>
                            </div>
                          )}
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
                      className="font-normal text-[10px] pl-2 pr-1 py-0 h-5 flex items-center gap-1 group/badge"
                      style={{
                        backgroundColor: `${hexColor}15`,
                        color: hexColor,
                        borderColor: `${hexColor}30`,
                      }}
                    >
                      <span>{label.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLabel.mutate({ labelId: label.id, action: "remove" });
                        }}
                        className="h-3.5 w-3.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                        title={`Remover etiqueta ${label.name}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
                {!effectiveLabels.length && (
                  <span className="text-xs text-muted-foreground/70 italic">
                    Nenhuma etiqueta atribuída.
                  </span>
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
