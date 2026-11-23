import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Building2, User, Users, AlertCircle, Loader2, Tag, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUnit } from "@/lib/unit-context";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultScope?: "internal" | "external";
  defaultContactId?: string;
  defaultConversationId?: string;
  defaultUnitId?: string;
  ticketToEdit?: any;
}

const EMPTY_ARRAY: any[] = [];

export function TicketDialog({
  open,
  onOpenChange,
  defaultScope = "internal",
  defaultContactId,
  defaultConversationId,
  defaultUnitId,
  ticketToEdit,
}: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const isSuperAdmin = profile?.role === "super_admin";
  const effectiveCompanyId = isSuperAdmin ? activeCompanyId : profile?.company_id;

  const [scope, setScope] = useState<"internal" | "external">(defaultScope);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  
  // Unidade de destino (quem vai resolver)
  const [targetUnitId, setTargetUnitId] = useState<string>("");
  // Departamento responsável
  const [departmentId, setDepartmentId] = useState<string>("");
  // Atendente atribuído
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  // Contato externo (se scope == 'external')
  const [requesterContactId, setRequesterContactId] = useState<string>("");
  const [contactSearch, setContactSearch] = useState("");
  // Tag rápida
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // 1. Busca unidades disponíveis da empresa
  const { data: units = EMPTY_ARRAY } = useQuery({
    queryKey: ["ticket-units", effectiveCompanyId, profile?.id, isSuperAdmin],
    enabled: open && !!effectiveCompanyId,
    queryFn: async () => {
      const { data: allUnits, error } = await (supabase as any)
        .from("units")
        .select("id, name, slug, active")
        .eq("company_id", effectiveCompanyId)
        .eq("active", true)
        .order("name");
      if (error) throw error;

      if (isSuperAdmin || profile?.role === "admin_company") {
        return allUnits || [];
      }

      // Usuário comum: filtra pelas unidades vinculadas
      const { data: userUnits } = await (supabase as any)
        .from("user_units")
        .select("unit_id")
        .eq("user_id", profile?.id);
      const allowedIds = userUnits?.map((u: any) => u.unit_id) || [];
      return (allUnits || []).filter((u: any) => allowedIds.includes(u.id));
    },
  });

  // Regras de seleção de unidade:
  // Se o usuário está dentro de uma unidade específica (ex: Aracruz), ou a empresa/usuário só tem 1 unidade,
  // ou se ele não tiver permissão global, não deve escolher unidade — já assume a unidade atual automaticamente.
  const isInsideSpecificUnit = Boolean(selectedUnitId && selectedUnitId !== "all");
  const hasMultipleUnits = units.length > 1;
  const hasGlobalUnitAccess = isSuperAdmin || profile?.role === "admin_company";
  const canChooseUnit = hasMultipleUnits && !isInsideSpecificUnit && hasGlobalUnitAccess;
  const currentUnitName =
    units.find((u: any) => u.id === targetUnitId)?.name ||
    units.find((u: any) => u.id === selectedUnitId)?.name ||
    units[0]?.name ||
    "";

  // 2. Busca departamentos da unidade selecionada
  const activeUnitForDepts = targetUnitId || selectedUnitId;
  const { data: departments = EMPTY_ARRAY } = useQuery({
    queryKey: ["ticket-departments", activeUnitForDepts],
    enabled: open && !!activeUnitForDepts && activeUnitForDepts !== "all",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departments")
        .select("id, name, unit_id, active")
        .eq("unit_id", activeUnitForDepts)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // 3. Busca membros da equipe para atribuição
  const { data: teamMembers = EMPTY_ARRAY } = useQuery({
    queryKey: ["ticket-team-members", effectiveCompanyId],
    enabled: open && !!effectiveCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, name, email")
        .eq("company_id", effectiveCompanyId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Busca dados detalhados do contato selecionado (se houver requesterContactId)
  const { data: selectedContact } = useQuery({
    queryKey: ["ticket-selected-contact", requesterContactId],
    enabled: open && scope === "external" && !!requesterContactId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("id, name, phone, email, unit_id, unit:units(name)")
        .eq("id", requesterContactId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 5. Pesquisa dinâmica e em tempo real de contatos para clientes externos
  const { data: contactSearchResults = EMPTY_ARRAY, isLoading: isLoadingContactSearch } = useQuery({
    queryKey: ["ticket-contacts-search", effectiveCompanyId, contactSearch],
    enabled: open && scope === "external" && !requesterContactId && !!effectiveCompanyId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("contacts")
        .select("id, name, phone, email, unit_id, unit:units(name)")
        .eq("company_id", effectiveCompanyId)
        .is("merged_into_id", null);

      if (contactSearch.trim()) {
        const term = contactSearch.replace(/[,()*%\\]/g, " ").trim();
        const digits = contactSearch.replace(/\D/g, "");
        const filters: string[] = [];
        if (term) filters.push(`name.ilike.%${term}%`, `email.ilike.%${term}%`);
        if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
        if (filters.length > 0) {
          q = q.or(filters.join(","));
        }
      }

      const { data, error } = await q.order("name").limit(12);
      if (error) throw error;
      return data || [];
    },
  });

  const handleSelectContact = (contact: any) => {
    setRequesterContactId(contact.id);
    setContactSearch("");
    if (contact.unit_id && canChooseUnit && contact.unit_id !== targetUnitId) {
      setTargetUnitId(contact.unit_id);
      setDepartmentId("");
    }
  };

  // Inicialização ao abrir modal ou trocar de chamado
  useEffect(() => {
    if (!open) return;

    if (ticketToEdit) {
      setTitle(ticketToEdit.title || "");
      setDescription(ticketToEdit.description || "");
      setScope(ticketToEdit.scope || "internal");
      setPriority(ticketToEdit.priority || "medium");
      setTargetUnitId(ticketToEdit.unit_id || "");
      setDepartmentId(ticketToEdit.department_id || "");
      setAssignedToUserId(ticketToEdit.assigned_to_user_id || "");
      setRequesterContactId(ticketToEdit.requester_contact_id || "");
      setTags(ticketToEdit.tags || []);
      setContactSearch("");
    } else {
      const autoUnitId = defaultUnitId || (isInsideSpecificUnit ? selectedUnitId! : (units[0]?.id || ""));
      setTitle("");
      setDescription("");
      setScope(defaultScope);
      setPriority("medium");
      setTargetUnitId(autoUnitId);
      setDepartmentId("");
      setAssignedToUserId("");
      setRequesterContactId(defaultContactId || "");
      setTags([]);
      setContactSearch("");
    }
  }, [open, ticketToEdit?.id, defaultScope, defaultContactId, defaultUnitId, selectedUnitId, isInsideSpecificUnit]);

  // Se o modal for aberto em modo criação e as unidades terminarem de carregar após a abertura:
  useEffect(() => {
    if (open && !ticketToEdit && !targetUnitId && units.length > 0) {
      const autoUnitId = defaultUnitId || (isInsideSpecificUnit ? selectedUnitId! : (units[0]?.id || ""));
      if (autoUnitId) {
        setTargetUnitId(autoUnitId);
      }
    }
  }, [open, ticketToEdit, targetUnitId, units, defaultUnitId, isInsideSpecificUnit, selectedUnitId]);

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Mutação para criar ou atualizar
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompanyId) throw new Error("Empresa não selecionada.");
      if (!targetUnitId) throw new Error("Selecione uma unidade responsável.");
      if (!title.trim()) throw new Error("O título do ticket é obrigatório.");
      if (!description.trim()) throw new Error("A descrição do chamado é obrigatória.");
      if (scope === "external" && !requesterContactId) {
        throw new Error("Selecione o contato/cliente solicitante.");
      }

      const cleanDepartmentId = (!departmentId || departmentId === "none") ? null : departmentId;
      const cleanAssignedToUserId = (!assignedToUserId || assignedToUserId === "unassigned") ? null : assignedToUserId;
      const cleanRequesterContactId = (scope === "external" && requesterContactId && requesterContactId !== "none") ? requesterContactId : null;
      const cleanOriginUnitId = (selectedUnitId && selectedUnitId !== "all") ? selectedUnitId : (targetUnitId || null);

      const payload: any = {
        company_id: effectiveCompanyId,
        unit_id: targetUnitId,
        origin_unit_id: cleanOriginUnitId,
        department_id: cleanDepartmentId,
        scope,
        title: title.trim(),
        description: description.trim(),
        priority,
        assigned_to_user_id: cleanAssignedToUserId,
        requester_user_id: profile?.id || null,
        requester_contact_id: cleanRequesterContactId,
        conversation_id: defaultConversationId || null,
        origin: "manual",
        tags,
      };

      if (ticketToEdit?.id) {
        const { error } = await (supabase as any)
          .from("tickets")
          .update({
            unit_id: targetUnitId,
            origin_unit_id: cleanOriginUnitId,
            department_id: cleanDepartmentId,
            title: title.trim(),
            description: description.trim(),
            priority,
            assigned_to_user_id: cleanAssignedToUserId,
            requester_contact_id: cleanRequesterContactId,
            tags,
          })
          .eq("id", ticketToEdit.id);
        if (error) throw error;
      } else {
        const { data: newTicket, error } = await (supabase as any)
          .from("tickets")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;

        // Dispara triagem inteligente e diagnóstico por IA em background
        if (newTicket?.id && effectiveCompanyId) {
          fetch("/api/tickets/internal/analyze-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticketId: newTicket.id,
              companyId: effectiveCompanyId,
            }),
          }).catch((err) => console.warn("Falha ao acionar triagem por IA:", err));
        }
      }
    },
    onSuccess: () => {
      toast.success(ticketToEdit ? "Ticket atualizado com sucesso!" : "Ticket aberto com sucesso!");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["contact-tickets"] });
      qc.invalidateQueries({ queryKey: ["contact-sidebar-active-tickets"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar ticket.");
    },
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {ticketToEdit ? "Editar Ticket" : "Abrir Novo Ticket"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {ticketToEdit
              ? "Atualize as informações, departamento responsável ou atendente do chamado."
              : "Preencha as informações para abrir um novo chamado interno ou de suporte ao cliente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo de Ticket: Interno vs Externo */}
          {!ticketToEdit && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipo de Chamado</Label>
              <RadioGroup
                value={scope}
                onValueChange={(val: any) => setScope(val)}
                className="grid grid-cols-2 gap-4"
              >
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    scope === "internal"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setScope("internal")}
                >
                  <RadioGroupItem value="internal" id="scope-internal" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="scope-internal" className="font-medium cursor-pointer flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary" /> Chamado Interno
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Para solicitações entre setores da empresa (TI, RH, Financeiro, Manutenção, etc.)
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    scope === "external"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setScope("external")}
                >
                  <RadioGroupItem value="external" id="scope-external" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="scope-external" className="font-medium cursor-pointer flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-emerald-600" /> Suporte a Cliente
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Para problemas ou demandas de clientes externos / contatos da empresa
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Seleção de Contato se for Externo com Pesquisa Dinâmica */}
          {scope === "external" && (
            <div className="space-y-2 bg-muted/30 p-3 rounded-xl border border-dashed border-emerald-500/30">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-emerald-600" /> Cliente / Contato Solicitante *
                </Label>
                {selectedContact && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
                    onClick={() => {
                      setRequesterContactId("");
                      setContactSearch("");
                    }}
                  >
                    Trocar cliente
                  </Button>
                )}
              </div>

              {selectedContact ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                      {selectedContact.name ? selectedContact.name.slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate text-foreground">
                        {selectedContact.name || "Cliente sem nome"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {selectedContact.phone || selectedContact.email || "Sem telefone/e-mail cadastrado"}
                        {selectedContact.unit?.name ? ` • Unidade: ${selectedContact.unit.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0 ml-2"
                    onClick={() => {
                      setRequesterContactId("");
                      setContactSearch("");
                    }}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar por nome, telefone com DDD ou e-mail..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-8 h-8 text-xs bg-background"
                      autoFocus
                    />
                    {isLoadingContactSearch && (
                      <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Resultados da busca */}
                  <div className="max-h-44 overflow-y-auto rounded-lg border bg-background divide-y">
                    {isLoadingContactSearch && contactSearchResults.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando clientes...
                      </div>
                    ) : contactSearchResults.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        {contactSearch.trim()
                          ? `Nenhum cliente encontrado para "${contactSearch}".`
                          : "Digite para pesquisar clientes na base."}
                      </div>
                    ) : (
                      contactSearchResults.map((contact: any) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => handleSelectContact(contact)}
                          className="w-full text-left p-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {contact.name || "Cliente sem nome"}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {contact.phone || contact.email || "Sem dados de contato"}
                              {contact.unit?.name ? ` • Unidade: ${contact.unit.name}` : ""}
                            </p>
                          </div>
                          <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium shrink-0">
                            Selecionar →
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Seletor de Unidade apenas se o usuário for gestor global na sede com múltiplas unidades */}
          {canChooseUnit && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Unidade Responsável *
              </Label>
              <select
                value={targetUnitId || ""}
                onChange={(e) => {
                  setTargetUnitId(e.target.value);
                  setDepartmentId("");
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">Selecione a unidade...</option>
                {units.map((unit: any) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Título do Ticket */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Assunto / Título *</Label>
            <Input
              placeholder="Ex: Falha na impressora do balcão / Solicitação de novo crachá"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Descrição Detalhada */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Descrição Detalhada *</Label>
            <Textarea
              rows={4}
              placeholder="Descreva detalhadamente o ocorrido, passos para reproduzir ou o que é necessário para a resolução..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Campos administrativos — Visíveis apenas na edição por gestor/atendente */}
          {ticketToEdit && (
            <div className="space-y-4 pt-2 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Departamento</Label>
                  <select
                    value={departmentId || "none"}
                    onChange={(e) => setDepartmentId(e.target.value === "none" ? "" : e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="none">Nenhum (Geral da Unidade)</option>
                    {departments.map((dept: any) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Prioridade
                  </Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente / Crítica</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Atribuir a um Responsável</Label>
                <select
                  value={assignedToUserId || "unassigned"}
                  onChange={(e) => setAssignedToUserId(e.target.value === "unassigned" ? "" : e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="unassigned">Fila Geral (Não atribuído)</option>
                  {teamMembers.map((member: any) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Etiquetas / Tags
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: hardware, financeiro, reembolso..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    Adicionar
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-destructive text-muted-foreground ml-1 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {ticketToEdit ? "Salvar Alterações" : "Criar Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
