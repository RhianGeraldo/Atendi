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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
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
  Search,
  Phone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { TodooCaptureOrigin } from "@/types/todoo";
import { cn } from "@/lib/utils";
import { formatTodooPhone } from "./todoo-period";
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

/** Cliente que indicou: contato da base ou nova cliente (nome + WhatsApp). */
export type ReferrerValue =
  | { mode: "existing"; id: string; name: string; phone: string | null; unitName?: string | null }
  | { mode: "new"; name: string; phone: string };

export function TodooCreateReferralDialog({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const [origin, setOrigin] = useState<TodooCaptureOrigin>("indicacao");
  const [referrer, setReferrer] = useState<ReferrerValue | null>(null);
  const [contacts, setContacts] = useState<CapturedContact[]>([emptyContact()]);
  const [capturedById, setCapturedById] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Formulário limpo a cada abertura
  useEffect(() => {
    if (!open) return;
    setOrigin("indicacao");
    setReferrer(null);
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

    if (origin === "indicacao") {
      if (!referrer) {
        toast.error("Busque e selecione a cliente que está indicando.");
        return;
      }
      if (
        referrer.mode === "new" &&
        (!referrer.name.trim() || referrer.phone.replace(/\D/g, "").length < 10)
      ) {
        toast.error("Informe o nome e o WhatsApp com DDD da cliente que está indicando.");
        return;
      }
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
        p_referrer_name: origin === "indicacao" && referrer ? referrer.name.trim() : null,
        p_referrer_contact_id:
          origin === "indicacao" && referrer?.mode === "existing" ? referrer.id : null,
        p_referrer_phone: origin === "indicacao" && referrer?.mode === "new" ? referrer.phone : null,
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
      // Indicação é só de quem ainda não é contato
      const existing: { name: string }[] = data?.existing ?? [];

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

      if (existing.length > 0) {
        toast.warning(
          `Já ${existing.length > 1 ? "são contatos" : "é contato"}, não entra como indicação: ${existing
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
              <ReferrerField
                open={open}
                companyId={activeCompanyId}
                value={referrer}
                onChange={setReferrer}
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

function ReferrerField({
  open,
  companyId,
  value,
  onChange,
}: {
  open: boolean;
  companyId: string | null | undefined;
  value: ReferrerValue | null;
  onChange: (value: ReferrerValue | null) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
    }
  }, [open]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["todoo-referrer-search", companyId, debounced],
    enabled: !!companyId && popoverOpen && debounced.length >= 2,
    queryFn: async () => {
      // Remove caracteres que quebram o filtro "or" do PostgREST
      const term = debounced.replace(/[,()*%\\]/g, " ").trim();
      const digits = debounced.replace(/\D/g, "");
      const filters: string[] = [];
      if (/[a-zA-ZÀ-ÿ]/.test(term)) filters.push(`name.ilike.%${term}%`);
      if (digits.length >= 4) filters.push(`phone.ilike.%${digits}%`);
      if (filters.length === 0) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, unit:units(name)")
        .eq("company_id", companyId!)
        .is("merged_into_id", null)
        .or(filters.join(","))
        .order("name")
        .limit(8);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const startNew = () => {
    const digits = search.replace(/\D/g, "");
    const isPhone = digits.length >= 8 && !/[a-zA-ZÀ-ÿ]/.test(search);
    onChange({ mode: "new", name: isPhone ? "" : search.trim(), phone: isPhone ? digits : "" });
    setPopoverOpen(false);
  };

  if (value?.mode === "existing") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-background p-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary shrink-0">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{value.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {formatTodooPhone(value.phone) || "Sem telefone"}
            {value.unitName ? ` · ${value.unitName}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange(null)}
        >
          Trocar
        </Button>
      </div>
    );
  }

  if (value?.mode === "new") {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-background p-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-primary">Nova cliente (será cadastrada na base)</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={() => onChange(null)}
          >
            <Search className="h-3 w-3" />
            Buscar na base
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="Nome da cliente"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="text-xs h-8"
            autoFocus={!value.name}
          />
          <Input
            placeholder="WhatsApp (com DDD) *"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className="text-xs h-8"
            autoFocus={!!value.name}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Se o WhatsApp já existir na base, a indicação é ligada a esse contato.
        </p>
      </div>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={popoverOpen}
          className="w-full h-9 justify-start gap-2 font-normal text-muted-foreground bg-background"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          Buscar cliente por nome ou WhatsApp...
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Nome ou WhatsApp da cliente..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {debounced.length < 2 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Digite ao menos 2 letras do nome ou 4 números do WhatsApp.
              </div>
            ) : isFetching && results.length === 0 ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              results.length === 0 && <CommandEmpty>Nenhuma cliente encontrada.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Clientes na base">
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    className="cursor-pointer"
                    onSelect={() => {
                      onChange({
                        mode: "existing",
                        id: c.id,
                        name: c.name || formatTodooPhone(c.phone) || "Cliente",
                        phone: c.phone,
                        unitName: c.unit?.name ?? null,
                      });
                      setPopoverOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium truncate">{c.name || "Sem nome"}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {formatTodooPhone(c.phone) || "Sem telefone"}
                        {c.unit?.name ? ` · ${c.unit.name}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem value="__new__" className="cursor-pointer text-primary" onSelect={startNew}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Cadastrar nova cliente{search.trim() ? `: "${search.trim()}"` : ""}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
