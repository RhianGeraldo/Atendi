import { useQuery } from "@tanstack/react-query";
import { useActiveCompany } from "@/lib/active-company-context";
import { getSlaSettingsAction } from "@/lib/api/sla.functions";
import { DEFAULT_SLA_SETTINGS, type SlaSettings } from "@/lib/sla";

export function useSlaSettings() {
  const { activeCompanyId } = useActiveCompany();

  const { data: slaSettings, isLoading } = useQuery<SlaSettings>({
    queryKey: ["sla-settings", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!activeCompanyId) return DEFAULT_SLA_SETTINGS;
      const res = await getSlaSettingsAction({ data: { companyId: activeCompanyId } });
      return res || DEFAULT_SLA_SETTINGS;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos de cache
  });

  return {
    slaSettings: slaSettings || DEFAULT_SLA_SETTINGS,
    isLoadingSla: isLoading,
  };
}
