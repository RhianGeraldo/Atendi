import React, { useState } from "react";
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
import { Globe, Building2, Users, Megaphone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (data: {
    name: string;
    description?: string;
    scope: "company" | "unit" | "custom";
    unitId?: string | null;
    isAnnouncement?: boolean;
  }) => Promise<string | void>;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onCreateChannel({
        name: name.trim(),
        description: description.trim() || undefined,
        scope,
        unitId: scope === "unit" ? unitId || null : null,
        isAnnouncement,
      });
      setName("");
      setDescription("");
      setScope("company");
      setUnitId("");
      setIsAnnouncement(false);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Criar Canal da Equipe</DialogTitle>
          <DialogDescription>
            Crie um novo espaço de comunicação para sua empresa ou unidade.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="channel-name" className="text-xs">
              Nome do Canal *
            </Label>
            <Input
              id="channel-name"
              placeholder="ex: avisos-gerais, vendas-centro, projetos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-desc" className="text-xs">
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
            <Label className="text-xs">Escopo de Visibilidade</Label>
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
                    Todos os colaboradores de todas as filiais terão acesso.
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
                    Apenas colaboradores vinculados a essa filial terão acesso.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="custom" className="mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
                    <span>Grupo Especial / Personalizado</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Grupo fechado para tópicos ou membros específicos.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {scope === "unit" && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Selecione a Unidade *</Label>
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

          {/* Opção: Canal de Avisos / Somente Leitura */}
          <div className="pt-1 border-t border-border/60">
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

          <DialogFooter className="pt-2">
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
              disabled={!name.trim() || (scope === "unit" && !unitId) || isSubmitting}
            >
              Criar Canal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
