import React, { useState, useMemo } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAuth } from "@/lib/auth-context";
import { Globe, Building2, Users, Megaphone, Search, Check, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { initials } from "@/lib/format";
import { TeamMember } from "./team-chat-types";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers?: TeamMember[];
  onCreateChannel: (data: {
    name: string;
    description?: string;
    scope: "company" | "unit" | "custom";
    unitId?: string | null;
    isAnnouncement?: boolean;
    memberIds?: string[];
  }) => Promise<string | void>;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  teamMembers = [],
  onCreateChannel,
}: CreateChannelDialogProps) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId || profile?.company_id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"company" | "unit" | "custom">("company");
  const [unitId, setUnitId] = useState<string>("");
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de membros
  const [autoAddCompany, setAutoAddCompany] = useState(true);
  const [autoAddUnit, setAutoAddUnit] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  // Lista as unidades da empresa
  const { data: units } = useQuery({
    queryKey: ["company-units-dialog", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Colaboradores filtráveis para seleção manual (apenas ativos)
  const availableMembers = useMemo(() => {
    // Exclui o próprio usuário e colaboradores desativados da lista manual de seleção
    const others = teamMembers.filter((m) => m.id !== profile?.id && m.active !== false);

    // Se escopo for unidade e autoAddUnit desmarcado, filtra colaboradores daquela unidade
    if (scope === "unit" && unitId) {
      return others.filter((m) => m.units?.some((u) => u.id === unitId));
    }

    return others;
  }, [teamMembers, profile?.id, scope, unitId]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return availableMembers;
    const term = memberSearch.toLowerCase().trim();
    return availableMembers.filter((m) => {
      const n = m.name?.toLowerCase() || "";
      const r = m.role?.toLowerCase() || "";
      const u = m.units?.map((unit) => unit.name.toLowerCase()).join(" ") || "";
      return n.includes(term) || r.includes(term) || u.includes(term);
    });
  }, [availableMembers, memberSearch]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const idsToAdd = filteredMembers.map((m) => m.id);
    setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleDeselectAll = () => {
    setSelectedMemberIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Determina os IDs finais de membros a serem adicionados
      let finalMemberIds: string[] = [];

      if (scope === "company" && autoAddCompany) {
        // Todos os colaboradores ativos da empresa
        finalMemberIds = teamMembers
          .map((m) => m.id)
          .filter((id) => id !== profile?.id);
      } else if (scope === "unit" && autoAddUnit && unitId) {
        // Todos os colaboradores da filial selecionada
        finalMemberIds = teamMembers
          .filter((m) => m.units?.some((u) => u.id === unitId) && m.id !== profile?.id)
          .map((m) => m.id);
      } else {
        // Membros selecionados manualmente
        finalMemberIds = selectedMemberIds;
      }

      await onCreateChannel({
        name: name.trim(),
        description: description.trim() || undefined,
        scope,
        unitId: scope === "unit" ? unitId || null : null,
        isAnnouncement,
        memberIds: finalMemberIds,
      });

      // Reset
      setName("");
      setDescription("");
      setScope("company");
      setUnitId("");
      setIsAnnouncement(false);
      setSelectedMemberIds([]);
      setAutoAddCompany(true);
      setAutoAddUnit(true);
      setMemberSearch("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="text-base font-semibold">Criar Canal da Equipe</DialogTitle>
          <DialogDescription className="text-xs">
            Crie um novo canal de comunicação e defina quais colaboradores terão acesso.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 px-5 py-1">
            <div className="space-y-4 pb-4">
              <div className="space-y-1.5">
                <Label htmlFor="channel-name" className="text-xs font-medium">
                  Nome do Canal *
                </Label>
                <Input
                  id="channel-name"
                  placeholder="ex: avisos-gerais, vendas-sp, novidades"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="channel-desc" className="text-xs font-medium">
                  Descrição (opcional)
                </Label>
                <Textarea
                  id="channel-desc"
                  placeholder="Qual o objetivo desse canal?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs resize-none"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Escopo de Visibilidade</Label>
                <RadioGroup
                  value={scope}
                  onValueChange={(val: any) => setScope(val)}
                  className="space-y-2"
                >
                  <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="company" className="mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        <span>Geral da Empresa</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Canal aberto para todas as filiais e colaboradores da empresa.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="unit" className="mt-0.5" />
                    <div className="space-y-0.5 text-xs flex-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Building2 className="h-3.5 w-3.5 text-amber-500" />
                        <span>Específico de uma Unidade</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Restrito a colaboradores vinculados a uma filial específica.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="custom" className="mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Users className="h-3.5 w-3.5 text-blue-500" />
                        <span>Grupo Fechado / Personalizado</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Apenas os colaboradores explicitamente convidados poderão ver e participar.
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {scope === "unit" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs font-medium">Selecione a Unidade *</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Escolha a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Seção de Membros do Grupo */}
              <div className="space-y-2 pt-2 border-t border-border/70">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5 text-primary" />
                    <span>Participantes do Grupo</span>
                  </Label>
                  {scope === "custom" && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {selectedMemberIds.length} selecionado{selectedMemberIds.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>

                {scope === "company" && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border/80 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors text-xs">
                      <Checkbox
                        checked={autoAddCompany}
                        onCheckedChange={(checked) => setAutoAddCompany(Boolean(checked))}
                      />
                      <div className="flex-1">
                        <span className="font-medium text-foreground">
                          Adicionar todos os colaboradores automaticamente
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {teamMembers.length} pessoas da empresa receberão acesso e notificações.
                        </p>
                      </div>
                    </label>

                    {!autoAddCompany && (
                      <div className="pt-1 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Selecione manualmente quem deve participar deste canal geral:
                        </p>
                        <MemberSelector
                          search={memberSearch}
                          onSearchChange={setMemberSearch}
                          members={filteredMembers}
                          selectedIds={selectedMemberIds}
                          onToggle={toggleMember}
                          onSelectAll={handleSelectAllFiltered}
                          onDeselectAll={handleDeselectAll}
                        />
                      </div>
                    )}
                  </div>
                )}

                {scope === "unit" && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-border/80 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors text-xs">
                      <Checkbox
                        checked={autoAddUnit}
                        onCheckedChange={(checked) => setAutoAddUnit(Boolean(checked))}
                      />
                      <div className="flex-1">
                        <span className="font-medium text-foreground">
                          Adicionar todos os colaboradores desta unidade automaticamente
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          Todos vinculados à filial terão acesso imediato.
                        </p>
                      </div>
                    </label>

                    {!autoAddUnit && (
                      <div className="pt-1 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Selecione manualmente os colaboradores da filial:
                        </p>
                        <MemberSelector
                          search={memberSearch}
                          onSearchChange={setMemberSearch}
                          members={filteredMembers}
                          selectedIds={selectedMemberIds}
                          onToggle={toggleMember}
                          onSelectAll={handleSelectAllFiltered}
                          onDeselectAll={handleDeselectAll}
                        />
                      </div>
                    )}
                  </div>
                )}

                {scope === "custom" && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Escolha quais colaboradores farão parte deste grupo exclusivo:
                    </p>
                    <MemberSelector
                      search={memberSearch}
                      onSearchChange={setMemberSearch}
                      members={filteredMembers}
                      selectedIds={selectedMemberIds}
                      onToggle={toggleMember}
                      onSelectAll={handleSelectAllFiltered}
                      onDeselectAll={handleDeselectAll}
                    />
                  </div>
                )}
              </div>

              {/* Opção: Canal de Avisos / Somente Leitura */}
              <div className="pt-2 border-t border-border/60">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors">
                  <Checkbox
                    checked={isAnnouncement}
                    onCheckedChange={(checked) => setIsAnnouncement(Boolean(checked))}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Megaphone className="h-3.5 w-3.5 text-amber-500" />
                      <span>Canal de Avisos da Matriz</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Somente administradores e gestores podem publicar. Colaboradores podem ler e reagir com emojis.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="p-4 pt-3 border-t border-border/60 bg-muted/20 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                !name.trim() ||
                (scope === "unit" && !unitId) ||
                (scope === "custom" && selectedMemberIds.length === 0) ||
                isSubmitting
              }
            >
              Criar Canal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Subcomponente reutilizável para seleção de membros
function MemberSelector({
  search,
  onSearchChange,
  members,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  search: string;
  onSearchChange: (val: string) => void;
  members: TeamMember[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      <div className="p-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar colaboradores..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 pl-8 text-xs bg-background"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 px-2 text-[11px]"
          >
            Todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDeselectAll}
            className="h-7 px-2 text-[11px] text-muted-foreground"
          >
            Limpar
          </Button>
        </div>
      </div>

      <div className="max-h-[160px] overflow-y-auto divide-y divide-border/50">
        {members.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhum colaborador encontrado.
          </div>
        ) : (
          members.map((member) => {
            const isSelected = selectedIds.includes(member.id);
            return (
              <label
                key={member.id}
                className="flex items-center gap-2.5 p-2 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(member.id)}
                  className="rounded-sm"
                />
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={member.avatar_url || ""} />
                  <AvatarFallback className="text-[10px]">
                    {initials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {member.name}
                    </span>
                    {member.units && member.units.length > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {member.units[0].name}
                      </span>
                    )}
                  </div>
                  {member.role && (
                    <span className="text-[10px] text-muted-foreground capitalize block truncate">
                      {member.role.replace("_", " ")}
                    </span>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
