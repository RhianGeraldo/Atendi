import { useState } from "react";
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
  Phone,
  User,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ReferredFriend {
  name: string;
  phone: string;
  service: string;
}

export function TodooCreateReferralDialog({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();

  // Dados da cliente indicadora
  const [referrerName, setReferrerName] = useState("");
  const [referrerPhone, setReferrerPhone] = useState("");
  const [referrerContactId, setReferrerContactId] = useState<string | null>(null);

  // Amigas indicadas (inicia com 3 amigos por padrão - Desafio 3 Amigas)
  const [friends, setFriends] = useState<ReferredFriend[]>([
    { name: "", phone: "", service: "Laser / Estética" },
    { name: "", phone: "", service: "Laser / Estética" },
    { name: "", phone: "", service: "Laser / Estética" },
  ]);

  // Detalhes do voucher e captador
  const [voucherCode, setVoucherCode] = useState("VOUCHER150");
  const [voucherValue, setVoucherValue] = useState("150,00");
  const [capturedById, setCapturedById] = useState<string>(profile?.id || "");
  const [submitting, setSubmitting] = useState(false);

  // Busca consultoras/aplicadoras para atribuir quem colheu
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["todoo-team-members-referrals", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .eq("company_id", activeCompanyId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleFriendChange = (index: number, field: keyof ReferredFriend, val: string) => {
    setFriends((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleAddFriend = () => {
    setFriends((prev) => [...prev, { name: "", phone: "", service: "Laser / Estética" }]);
  };

  const handleRemoveFriend = (index: number) => {
    if (friends.length <= 1) return;
    setFriends((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!profile || !activeCompanyId) return;

    if (!referrerName.trim()) {
      toast.error("Por favor, informe o nome da cliente indicadora.");
      return;
    }

    // Filtra amigos com pelo menos nome e telefone preenchidos
    const validFriends = friends.filter(
      (f) => f.name.trim() && f.phone.replace(/\D/g, "").length >= 8
    );

    if (validFriends.length === 0) {
      toast.error("Por favor, preencha o nome e WhatsApp de pelo menos 1 amiga indicada.");
      return;
    }

    setSubmitting(true);

    try {
      const numValue = voucherValue ? parseFloat(voucherValue.replace(",", ".")) : 150;
      const captorId = capturedById || profile.id;

      // 1. Localiza ou cria a campanha padrão do Desafio 3 Amigas / MGM
      let campaignId: string;
      const { data: existingCamp } = await (supabase.from("todoo_campaigns") as any)
        .select("id")
        .eq("company_id", activeCompanyId)
        .eq("type", "mgm_referral")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (existingCamp) {
        campaignId = existingCamp.id;
      } else {
        const { data: newCamp, error: campErr } = await (supabase.from("todoo_campaigns") as any)
          .insert({
            company_id: activeCompanyId,
            title: "Desafio 3 Amigas (Leads Indicados)",
            description: "Campanha contínua de captação de indicações de clientes em cabine.",
            type: "mgm_referral",
            source_type: "manual",
            status: "active",
            sla_hours: 24,
            message_template:
              "Olá {primeiro_nome}! Sua amiga {nome} esteve na clínica e liberou no seu nome um voucher nominal de R$ 150 para você realizar sua primeira sessão de cortesia! Vamos agendar seu horário desta semana?",
            offer_details: "Voucher de R$ 150 válido por 7 dias",
            created_by: profile.id,
          })
          .select("id")
          .single();

        if (campErr) throw campErr;
        campaignId = newCamp.id;
      }

      // 2. Para cada amiga indicada: cria contato, registra indicação e injeta no Todoo
      const now = new Date();
      const slaDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      for (const friend of validFriends) {
        const cleanPhone = friend.phone.replace(/\D/g, "");

        // A. Cria ou busca o contato na tabela contacts
        let contactId: string | null = null;
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id, tags")
          .eq("company_id", activeCompanyId)
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          const currentTags = existingContact.tags || [];
          if (!currentTags.includes("Lead Indicado")) {
            await supabase
              .from("contacts")
              .update({
                tags: [...currentTags, "Lead Indicado", `Indicado por: ${referrerName}`],
              })
              .eq("id", contactId);
          }
        } else {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({
              company_id: activeCompanyId,
              name: friend.name.trim(),
              phone: cleanPhone,
              tags: ["Lead Indicado", `Indicado por: ${referrerName}`],
              source: "Indicado por Cliente",
              source_details: `Indicada por ${referrerName} (${referrerPhone || "Sem tel"})`,
              created_by: profile.id,
            })
            .select("id")
            .single();

          if (newContact) contactId = newContact.id;
        }

        // B. Registra na tabela todoo_referrals
        await (supabase.from("todoo_referrals") as any).insert({
          company_id: activeCompanyId,
          referrer_contact_id: referrerContactId || null,
          referrer_name: referrerName.trim(),
          referrer_phone: referrerPhone || null,
          referred_contact_id: contactId,
          referred_name: friend.name.trim(),
          referred_phone: cleanPhone,
          interested_service: friend.service,
          voucher_code: voucherCode || "VOUCHER150",
          voucher_value: numValue,
          captured_by_user_id: captorId,
          status: "pending",
          reward_status: "pending",
          reward_details: `Crédito de R$ 50 para ${referrerName} quando ${friend.name} fechar pacote`,
        });

        // C. Injeta na fila do Todoo (todoo_leads) com SLA prioritário de 24h
        await (supabase.from("todoo_leads") as any).insert({
          campaign_id: campaignId,
          company_id: activeCompanyId,
          contact_id: contactId,
          contact_name: friend.name.trim(),
          contact_phone: cleanPhone,
          assigned_user_id: captorId,
          assigned_at: now.toISOString(),
          sla_deadline: slaDeadline,
          status: "pending",
          custom_fields: {
            indicadora: referrerName.trim(),
            servico: friend.service,
            voucher: voucherCode,
            valor_voucher: numValue,
          },
        });
      }

      toast.success(
        `🎉 ${validFriends.length} indicação(ões) cadastrada(s) e adicionada(s) à fila do Todoo!`
      );
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao cadastrar indicação: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-pink-500/10 text-pink-600">
              <Gift className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Cadastrar Novas Indicações</DialogTitle>
              <DialogDescription className="text-xs">
                Desafio 3 Amigas (Member-Get-Member): colete indicações e some pontos na sua meta!
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seção 1: Cliente Indicadora */}
          <div className="bg-muted/40 p-3.5 rounded-xl border border-border/80 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Quem está indicando? (Cliente na Clínica)
              </Label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">Nome da Cliente *</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex: Maria Clara Silva"
                  value={referrerName}
                  onChange={(e) => setReferrerName(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs">WhatsApp da Cliente</Label>
                <Input
                  className="mt-1"
                  placeholder="(00) 00000-0000"
                  value={referrerPhone}
                  onChange={(e) => setReferrerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Amigas Indicadas (Lista Dinâmica) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-pink-600" />
                Amigas Indicadas para Receber o Voucher
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddFriend}
                className="h-7 text-xs text-primary gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Amiga
              </Button>
            </div>

            <div className="space-y-2.5">
              {friends.map((friend, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                    {idx + 1}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                    <Input
                      placeholder="Nome da Amiga"
                      value={friend.name}
                      onChange={(e) => handleFriendChange(idx, "name", e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="WhatsApp (com DDD)"
                      value={friend.phone}
                      onChange={(e) => handleFriendChange(idx, "phone", e.target.value)}
                      className="text-xs h-8"
                    />
                    <Input
                      placeholder="Área de Interesse"
                      value={friend.service}
                      onChange={(e) => handleFriendChange(idx, "service", e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>

                  {friends.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFriend(idx)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Seção 3: Atribuição e Voucher */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border">
            <div>
              <Label className="text-xs">Código do Voucher</Label>
              <Input
                className="mt-1 text-xs"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Valor do Voucher (R$)</Label>
              <Input
                className="mt-1 text-xs"
                value={voucherValue}
                onChange={(e) => setVoucherValue(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs">Captado Por (Meta)</Label>
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
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
                Cadastrar e Injetar no Todoo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
