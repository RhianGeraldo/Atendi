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

/** Cliente da conversa, que vira a indicadora do contato enviado. */
export interface TodooChatReferrer {
  contactId: string;
  phone: string | null;
  unitId: string | null;
}

interface Props {
  contact: { name?: string | null; phone?: string | null; waid?: string | null };
  referrer: TodooChatReferrer;
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
export function TodooChatReferralButton({ contact, referrer, mine }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const digits = (contact.waid || contact.phone || "").replace(/\D/g, "");
  const variants = phoneVariants(digits);
  const isSelf = phoneVariants(referrer.phone).some((v) => variants.includes(v));

  // Contato já cadastrado no Todoo (por esta ou outra indicação) e o nome dele na base:
  // o nome do cartão é o da agenda de quem enviou ("E&L - Patrícia"), o da base é o limpo
  const { data: status } = useQuery({
    queryKey: ["todoo-chat-referral", activeCompanyId, digits],
    enabled: !!activeCompanyId && variants.length > 0 && !isSelf,
    queryFn: async () => {
      const [referrals, contacts] = await Promise.all([
        (supabase.from("todoo_referrals") as any)
          .select("id")
          .eq("company_id", activeCompanyId)
          .in("referred_phone", variants)
          .limit(1),
        (supabase.from("contacts") as any)
          .select("name")
          .eq("company_id", activeCompanyId)
          .is("merged_into_id", null)
          .in("phone", variants)
          .limit(1),
      ]);
      if (referrals.error) throw referrals.error;
      return {
        saved: (referrals.data || []).length > 0,
        baseName: (contacts.data?.[0]?.name as string | null)?.trim() || null,
      };
    },
  });
  const alreadySaved = status?.saved ?? false;
  const name = status?.baseName || contact.name?.trim() || formatTodooPhone(digits);

  if (digits.length < 10) return null;

  const save = async () => {
    if (!profile || !activeCompanyId) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)("todoo_register_contacts", {
        p_company_id: activeCompanyId,
        p_origin: "indicacao",
        p_referrer_name: null,
        p_referrer_contact_id: referrer.contactId,
        p_referrer_phone: null,
        p_captured_by: profile.id,
        p_unit_id: referrer.unitId,
        p_contacts: [
          {
            name,
            phone: digits,
            service: "",
          },
        ],
      });
      if (error) throw error;
      if ((data?.created ?? 0) > 0) {
        toast.success(`${name} salvo no Todoo como indicação!`);
      } else {
        toast.info(`${name} já estava cadastrado no Todoo.`);
      }
      queryClient.invalidateQueries({
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

  if (alreadySaved) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium",
          mine ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        )}
      >
        <Check className="h-3 w-3" />
        No Todoo
      </span>
    );
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
