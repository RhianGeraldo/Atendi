import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { formatTodooPhone } from "./todoo-period";

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Cliente da conversa, que vira a indicadora do contato enviado. */
export interface TodooChatReferrer {
  contactId: string;
  phone: string | null;
  unitId: string | null;
}

interface Props {
  contact: { name?: string | null; phone?: string | null; waid?: string | null };
  referrer: TodooChatReferrer;
  /** Quando o cartão chegou: só quem já era contato antes dele fica sem o botão */
  receivedAt?: string | null;
  mine?: boolean;
}

/** Formas do mesmo celular: com e sem 55, com e sem o 9 (como o banco pode ter salvo). */
function phoneVariants(raw: string | null | undefined): string[] {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55") || d.length < 12) return d ? [d] : [];
  const ddd = d.slice(2, 4);
  const rest = d.slice(4);
  const local = rest.length === 9 && rest.startsWith("9") ? [rest, rest.slice(1)] : [rest, `9${rest}`];
  return local.flatMap((n) => [`55${ddd}${n}`, `${ddd}${n}`]);
}

/**
 * "+ Indicação" no cartão de contato recebido no chat: salva o contato no Todoo como
 * indicação da cliente da conversa, sem abrir formulário.
 */
export function TodooChatReferralButton({ contact, referrer, receivedAt, mine }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const digits = (contact.waid || contact.phone || "").replace(/\D/g, "");
  const variants = phoneVariants(digits);
  const isSelf = phoneVariants(referrer.phone).some((v) => variants.includes(v));

  // O que já existe com esse número: indicação (de qualquer cliente), card aberto no Todoo
  // e contato na base (o banco responde por todas as unidades, sem revelar qual)
  const { data: status, isLoading, isError, refetch } = useQuery({
    queryKey: ["todoo-chat-referral", activeCompanyId, digits, receivedAt],
    enabled: !!activeCompanyId && variants.length > 0 && !isSelf,
    queryFn: async () => {
      const [referrals, leads, isContact] = await Promise.all([
        (supabase.from("todoo_referrals") as any)
          .select("referrer_name, referrer_contact_id, created_at")
          .eq("company_id", activeCompanyId)
          .in("referred_phone", variants)
          .order("created_at", { ascending: true })
          .limit(1),
        (supabase.from("todoo_leads") as any)
          .select("created_at, campaign:todoo_campaigns(title), assigned_user:profiles(name)")
          .eq("company_id", activeCompanyId)
          .in("contact_phone", variants)
          .not("status", "in", "(won,lost)")
          .order("created_at", { ascending: false })
          .limit(1),
        (supabase.rpc as any)("todoo_phone_is_contact", {
          p_company_id: activeCompanyId,
          p_phone: digits,
          // Contato criado depois do cartão (conversa iniciada, mensagem dela) não conta
          p_before: receivedAt ?? null,
        }),
      ]);
      if (referrals.error) throw referrals.error;
      if (leads.error) throw leads.error;
      if (isContact.error) throw isContact.error;
      return {
        referral: (referrals.data?.[0] ?? null) as {
          referrer_name: string | null;
          referrer_contact_id: string | null;
          created_at: string;
        } | null,
        lead: (leads.data?.[0] ?? null) as {
          created_at: string;
          campaign: { title: string | null } | null;
          assigned_user: { name: string | null } | null;
        } | null,
        isContact: isContact.data === true,
      };
    },
  });
  const name = contact.name?.trim() || formatTodooPhone(digits);

  if (digits.length < 10 || !activeCompanyId) return null;

  const save = async () => {
    if (!profile || !activeCompanyId) return;
    setSaving(true);
    try {
      // O banco confere de novo se já é contato (de qualquer unidade) antes de salvar
      const { data, error } = await (supabase.rpc as any)("todoo_register_chat_referral", {
        p_company_id: activeCompanyId,
        p_referrer_contact_id: referrer.contactId,
        p_unit_id: referrer.unitId,
        p_name: name,
        p_phone: digits,
        p_before: receivedAt ?? null,
      });
      if (error) throw error;
      if (data?.already_contact) {
        toast.info(`${name} já é contato: não entra como indicação.`);
      } else if ((data?.created ?? 0) > 0) {
        toast.success(`${name} salvo no Todoo como indicação!`);
      } else {
        toast.info(`${name} já estava no Todoo: a indicação conta uma vez só.`);
      }
      // Segura o "salvando" até o cartão recarregar: sem isso o botão volta por um instante
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("todoo-"),
      });
    } catch (err: any) {
      toast.error("Erro ao salvar indicação: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const tone = mine
    ? "bg-white/20 text-white hover:bg-white/30"
    : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400";

  if (isSelf) {
    return (
      <span className="text-[10px] opacity-60" title="O contato enviado é o próprio cliente da conversa">
        Próprio contato da conversa
      </span>
    );
  }

  const chip = (text: string, title?: string) => (
    <span
      title={title}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
        mine ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      <Check className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin opacity-60" />;
  }

  // Sem a checagem não dá para saber se já é contato: não oferece o botão às cegas
  if (isError) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="text-[10px] underline opacity-60 hover:opacity-100"
      >
        Não foi possível verificar o contato. Tentar de novo
      </button>
    );
  }

  // Já indicada: o primeiro que salvou fica com a indicação; os próximos só veem o aviso
  if (status?.referral) {
    const { referral } = status;
    const bySameClient = referral.referrer_contact_id === referrer.contactId;
    return chip(
      bySameClient
        ? `No Todoo desde ${formatShortDate(referral.created_at)}`
        : `Já indicada por ${referral.referrer_name || "outra cliente"} em ${formatShortDate(referral.created_at)}`,
      "A indicação conta uma vez só, para quem cadastrou primeiro",
    );
  }

  // Já tem card aberto no Todoo por outra ação (campanha, prospecção)
  if (status?.lead) {
    const { lead } = status;
    return chip(
      `Já no Todoo: ${lead.campaign?.title || "ação"}${lead.assigned_user?.name ? ` · ${lead.assigned_user.name}` : ""}`,
      `Card aberto desde ${formatShortDate(lead.created_at)}`,
    );
  }

  // Já é contato da base: não é indicação nova, só avisa
  if (status?.isContact) {
    return chip("Já é contato");
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={saving}
      onClick={save}
      className={cn("h-6 text-[10px] px-2 w-fit", tone)}
    >
      {saving ? (
        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
      ) : (
        <Gift className="h-3 w-3 mr-1.5" />
      )}
      + Indicação
    </Button>
  );
}
