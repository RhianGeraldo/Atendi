import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Gift,
  Plus,
  Trash2,
  Users,
  Sparkles,
  User,
  Loader2,
  Megaphone,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { TodooCaptureOrigin } from "@/types/todoo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CapturedContact {
  name: string;
  phone: string;
  service: string;
}

const emptyContact = (): CapturedContact => ({ name: "", phone: "", service: "" });

export function TodooCreateReferralDialog({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const [origin, setOrigin] = useState<TodooCaptureOrigin>("indicacao");
  const [referrerName, setReferrerName] = useState("");
  const [contacts, setContacts] = useState<CapturedContact[]>([emptyContact()]);
  const [capturedById, setCapturedById] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Formulário limpo a cada abertura
  useEffect(() => {
    if (!open) return;
    setOrigin("indicacao");
    setReferrerName("");
    setContacts([emptyContact()]);
    setCapturedById(profile?.id || "");
  }, [open, profile?.id]);

  // Equipe para atribuir quem captou (conta na meta)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["todoo-team-members-referrals", activeCompanyId],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleContactChange = (index: number, field: keyof CapturedContact, val: string) => {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: val } : c)));
  };

  const handleSubmit = async () => {
    if (!profile || !activeCompanyId) return;

    if (origin === "indicacao" && !referrerName.trim()) {
      toast.error("Informe o nome da cliente que está indicando.");
      return;
    }

    const filled = contacts.filter((c) => c.name.trim() || c.phone.trim());
    const invalid = filled.find((c) => !c.name.trim() || c.phone.replace(/\D/g, "").length < 10);
    if (invalid) {
      toast.error("Cada contato precisa de nome e WhatsApp com DDD.");
      return;
    }
    if (filled.length === 0) {
      toast.error("Preencha o nome e o WhatsApp de pelo menos 1 contato.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase.rpc as any)("todoo_register_contacts", {
        p_company_id: activeCompanyId,
        p_origin: origin,
        p_referrer_name: origin === "indicacao" ? referrerName.trim() : null,
        p_captured_by: capturedById || profile.id,
        p_unit_id: selectedUnitId && selectedUnitId !== "all" ? selectedUnitId : null,
        p_contacts: filled.map((c) => ({
          name: c.name.trim(),
          phone: c.phone,
          service: c.service.trim(),
        })),
      });
      if (error) throw error;

      const created: number = data?.created ?? 0;
      const duplicates: { name: string }[] = data?.duplicates ?? [];

      if (created > 0) {
        toast.success(
          created === 1
            ? "1 contato cadastrado e adicionado ao Quadro Comercial!"
            : `${created} contatos cadastrados e adicionados ao Quadro Comercial!`,
        );
      }
      if (duplicates.length > 0) {
        toast.warning(
          `Já cadastrado${duplicates.length > 1 ? "s" : ""} antes, não contou de novo: ${duplicates
            .map((d) => d.name)
            .join(", ")}`,
        );
      }

      if (created > 0) {
        onOpenChange(false);
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao cadastrar contatos: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Cadastrar Contatos</DialogTitle>
              <DialogDescription className="text-xs">
                Contatos de prospecção ativa ou indicação entram no Quadro Comercial e contam na sua
                meta.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Origem */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "indicacao", label: "Indicação", icon: Gift },
                { value: "prospeccao", label: "Prospecção Ativa", icon: Megaphone },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOrigin(opt.value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-2.5 text-sm font-medium transition-colors",
                  origin === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Cliente que indicou */}
          {origin === "indicacao" && (
            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/80 space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Cliente que está indicando *
              </Label>
              <Input
                placeholder="Ex: Maria Clara Silva"
                value={referrerName}
                onChange={(e) => setReferrerName(e.target.value)}
              />
            </div>
          )}

          {/* Contatos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                {origin === "indicacao" ? "Pessoas indicadas" : "Contatos"}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setContacts((prev) => [...prev, emptyContact()])}
                className="h-7 text-xs text-primary gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar contato
              </Button>
            </div>

            <div className="space-y-2.5">
              {contacts.map((contact, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                    {idx + 1}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                    <Input
                      placeholder="Nome"
                      value={contact.name}
                      onChange={(e) => handleContactChange(idx, "name", e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="WhatsApp (com DDD)"
                      value={contact.phone}
                      onChange={(e) => handleContactChange(idx, "phone", e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="Interesse (opcional)"
                      value={contact.service}
                      onChange={(e) => handleContactChange(idx, "service", e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>

                  {contacts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setContacts((prev) => prev.filter((_, i) => i !== idx))}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quem captou */}
          <div className="pt-2 border-t border-border sm:w-1/2">
            <Label className="text-xs">Captado por (conta na meta)</Label>
            <Select value={capturedById} onValueChange={setCapturedById}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m: any) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cadastrando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Cadastrar e enviar ao Quadro
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
