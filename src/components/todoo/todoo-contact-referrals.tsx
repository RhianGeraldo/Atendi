import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, Loader2, MessageSquare, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import { TODOO_LEAD_STATUS, formatTodooPhone } from "./todoo-period";
import type { TodooLeadStatus } from "@/types/todoo";

interface ReferralRow {
  id: string;
  created_at: string;
  unit_id: string | null;
  referrer_name: string | null;
  referrer_phone: string | null;
  referrer_contact_id: string | null;
  referred_contact_id: string | null;
  referred_name: string;
  referred_phone: string;
  interested_service: string | null;
  captured_by: { name: string } | null;
  lead: { status: TodooLeadStatus } | null;
}

const SELECT = `
  id, created_at, unit_id, referrer_name, referrer_phone, referrer_contact_id,
  referred_contact_id, referred_name, referred_phone, interested_service,
  captured_by:profiles(name),
  lead:todoo_leads(status)
`;

/** Indicações ligadas ao contato: quem ele indicou e quem indicou ele. */
export function TodooContactReferrals({ contactId }: { contactId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["todoo-contact-referrals", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const [made, received] = await Promise.all([
        (supabase.from("todoo_referrals") as any)
          .select(SELECT)
          .eq("referrer_contact_id", contactId)
          .order("created_at", { ascending: false }),
        (supabase.from("todoo_referrals") as any)
          .select(SELECT)
          .eq("referred_contact_id", contactId)
          .eq("origin", "indicacao")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (made.error) throw made.error;
      if (received.error) throw received.error;
      return {
        made: (made.data || []) as ReferralRow[],
        referredBy: ((received.data || []) as ReferralRow[])[0] ?? null,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive py-4">Erro ao carregar indicações.</p>;
  }

  const made = data?.made ?? [];
  const referredBy = data?.referredBy;
  const won = made.filter((r) => r.lead?.status === "won").length;
  const scheduled = made.filter((r) => r.lead?.status === "scheduled").length;

  return (
    <div className="space-y-4">
      {referredBy && (
        <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-2.5 text-xs">
          <span className="text-muted-foreground">Foi indicada por </span>
          <strong>{referredBy.referrer_name}</strong>
          {referredBy.referrer_phone && (
            <span className="text-muted-foreground"> · {formatTodooPhone(referredBy.referrer_phone)}</span>
          )}
          <span className="text-muted-foreground">
            {" "}
            em {format(new Date(referredBy.created_at), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
        <div>
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5 text-pink-600" />
            Indicações feitas
          </span>
          <p className="text-[10px] text-muted-foreground">Pessoas que esta cliente indicou</p>
        </div>
        {made.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <Badge variant="outline" className="text-[10px] font-normal">
              {made.length} indicada{made.length > 1 ? "s" : ""}
            </Badge>
            {scheduled > 0 && (
              <Badge className="text-[10px] bg-blue-600 text-white">{scheduled} agendou</Badge>
            )}
            {won > 0 && (
              <Badge className="text-[10px] bg-emerald-600 text-white gap-1">
                <Trophy className="h-3 w-3" />
                {won} fechou
              </Badge>
            )}
          </div>
        )}
      </div>

      {made.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhuma indicação registrada para esta cliente.
        </p>
      ) : (
        <div className="space-y-2">
          {made.map((r) => {
            const status = r.lead ? TODOO_LEAD_STATUS[r.lead.status] : null;
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{r.referred_name}</span>
                    {status && (
                      <Badge className={`text-[10px] px-1.5 py-0 ${status.className}`}>{status.label}</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {formatTodooPhone(r.referred_phone)}
                    {r.interested_service ? ` · ${r.interested_service}` : ""}
                    {" · "}
                    {format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    {r.captured_by?.name ? ` · por ${r.captured_by.name}` : ""}
                  </p>
                </div>
                <ContactChatButton
                  contactId={r.referred_contact_id}
                  contactName={r.referred_name}
                  phone={r.referred_phone}
                  unitId={r.unit_id}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      title="Abrir conversa"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                    </Button>
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
