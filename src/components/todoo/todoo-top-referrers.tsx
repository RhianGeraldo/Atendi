import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { todooRange, type TodooRangeKey } from "./todoo-period";
import { fetchAllPages } from "./todoo-stages";
import { TodooReferrerLink } from "./todoo-referrer-link";

interface TopReferrer {
  name: string;
  contactId: string | null;
  total: number;
  won: number;
}

/** Clientes que mais indicaram no período (vinculadas pelo contato ou, nas antigas, pelo nome). */
export function TodooTopReferrers({ range }: { range: TodooRangeKey }) {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();

  const { data: referrers = [], isLoading, isError } = useQuery({
    queryKey: ["todoo-top-referrers", activeCompanyId, range, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async (): Promise<TopReferrer[]> => {
      const { from, to } = todooRange(range);
      const build = () => {
        let q = (supabase.from("todoo_referrals") as any)
          .select("id, referrer_name, referrer_contact_id, lead:todoo_leads(status)")
          .eq("company_id", activeCompanyId)
          .eq("origin", "indicacao")
          .not("referrer_name", "is", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lt("created_at", to);
        if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
        return q;
      };
      const { data, error } = await fetchAllPages(build);
      if (error) throw error;

      const groups: Record<string, TopReferrer> = {};
      for (const r of data) {
        const name = String(r.referrer_name || "").trim();
        if (!name) continue;
        const key = r.referrer_contact_id || `nome:${name.toLowerCase()}`;
        const g = (groups[key] ||= { name, contactId: r.referrer_contact_id, total: 0, won: 0 });
        g.total += 1;
        if (r.lead?.status === "won") g.won += 1;
      }
      return Object.values(groups)
        .sort((a, b) => b.total - a.total || b.won - a.won || a.name.localeCompare(b.name, "pt-BR"))
        .slice(0, 10);
    },
  });

  return (
    <Card>
      <CardHeader className="p-4 border-b border-border">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Quem mais indicou
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando indicações...</p>
        ) : isError ? (
          <p className="text-xs text-destructive">Não foi possível carregar as indicações.</p>
        ) : referrers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma indicação cadastrada no período.</p>
        ) : (
          <ol className="divide-y divide-border">
            {referrers.map((r, i) => (
              <li key={r.contactId || r.name} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-muted-foreground">{i + 1}º</span>
                  <TodooReferrerLink name={r.name} contactId={r.contactId} className="truncate font-medium" />
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {r.total} indicaç{r.total > 1 ? "ões" : "ão"}
                  {r.won > 0 && <span className="text-emerald-600 font-medium"> · {r.won} fechou</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
