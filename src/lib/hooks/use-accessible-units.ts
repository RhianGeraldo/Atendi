import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";

export interface AccessibleUnit {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Unidades que o usuário logado pode ver/atuar (mesma regra do RLS):
 * admin_company e super_admin -> todas as unidades da empresa ativa;
 * demais -> apenas as unidades vinculadas (user_units).
 */
export function useAccessibleUnits() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";

  const query = useQuery({
    queryKey: ["accessible-units", activeCompanyId, profile?.id, isAdmin],
    enabled: !!activeCompanyId && !!profile?.id,
    queryFn: async () => {
      const { data: units, error } = await supabase
        .from("units")
        .select("id, name, color")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      if (isAdmin) return (units || []) as AccessibleUnit[];

      const { data: links } = await supabase
        .from("user_units")
        .select("unit_id")
        .eq("user_id", profile!.id);
      const allowed = new Set((links || []).map((l: any) => l.unit_id));
      return ((units || []) as AccessibleUnit[]).filter((u) => allowed.has(u.id));
    },
  });

  return {
    units: query.data ?? [],
    unitIds: (query.data ?? []).map((u) => u.id),
    isAdmin,
    hasRedeAccess: isAdmin || Boolean(profile?.has_matriz_access),
    isLoading: query.isLoading,
  };
}
