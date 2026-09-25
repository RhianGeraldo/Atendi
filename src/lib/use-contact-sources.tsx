import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  MessageCircle, 
  Instagram, 
  Share2, 
  Globe, 
  UserCheck, 
  Compass, 
  Megaphone, 
  Building2, 
  Target 
} from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/lib/active-company-context";
import { 
  INITIAL_CONTACT_SOURCES,
  DEFAULT_CONTACT_SOURCES, 
  getCompanyContactSourcesAction, 
  addCompanyContactSourceAction, 
  removeCompanyContactSourceAction,
  renameCompanyContactSourceAction,
  resetCompanyContactSourcesAction,
  updateContactSourceAction
} from "@/lib/api/contact-sources.functions";

export { INITIAL_CONTACT_SOURCES, DEFAULT_CONTACT_SOURCES };

/**
 * Retorna o ícone temático correspondente para a origem informada
 */
export function getSourceIcon(source?: string | null, className: string = "h-3.5 w-3.5") {
  if (!source) return <Target className={className} />;
  const s = source.toLowerCase();

  if (s.includes("whatsapp")) {
    return <MessageCircle className={`${className} text-emerald-500`} />;
  }
  if (s.includes("instagram")) {
    return <Instagram className={`${className} text-pink-500`} />;
  }
  if (s.includes("facebook") || s.includes("messenger")) {
    return <Share2 className={`${className} text-blue-500`} />;
  }
  if (s.includes("site") || s.includes("web") || s.includes("landing")) {
    return <Globe className={`${className} text-indigo-500`} />;
  }
  if (s.includes("indicação") || s.includes("indicacao")) {
    return <UserCheck className={`${className} text-amber-500`} />;
  }
  if (s.includes("google")) {
    return <Compass className={`${className} text-rose-500`} />;
  }
  if (s.includes("meta") || s.includes("ads") || s.includes("tráfego") || s.includes("trafego") || s.includes("anúncio") || s.includes("anuncio")) {
    return <Megaphone className={`${className} text-purple-500`} />;
  }
  if (s.includes("prospecção") || s.includes("prospeccao")) {
    return <Compass className={`${className} text-cyan-500`} />;
  }
  if (s.includes("presencial") || s.includes("balcão") || s.includes("balcao") || s.includes("loja")) {
    return <Building2 className={`${className} text-amber-600`} />;
  }

  return <Target className={`${className} text-muted-foreground`} />;
}

export function useContactSources() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  // Consulta as origens configuradas da empresa (100% customizáveis)
  const { data: sources = [], isLoading } = useQuery<string[]>({
    queryKey: ["company-contact-sources", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const res = await getCompanyContactSourcesAction({ data: { companyId: activeCompanyId } });
      return res || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const addSource = useMutation({
    mutationFn: async (source: string) => {
      if (!activeCompanyId) throw new Error("Nenhuma empresa ativa.");
      return await addCompanyContactSourceAction({
        data: { companyId: activeCompanyId, source },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      toast.success("Origem adicionada!");
    },
    onError: (e: any) => {
      toast.error("Erro ao adicionar origem", { description: e.message });
    },
  });

  const removeSource = useMutation({
    mutationFn: async (args: string | { source: string; clearContacts?: boolean }) => {
      if (!activeCompanyId) throw new Error("Nenhuma empresa ativa.");
      const source = typeof args === "string" ? args : args.source;
      const clearContacts = typeof args === "object" ? args.clearContacts : false;

      return await removeCompanyContactSourceAction({
        data: { companyId: activeCompanyId, source, clearContacts },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Origem removida!");
    },
    onError: (e: any) => {
      toast.error("Erro ao remover origem", { description: e.message });
    },
  });

  const renameSource = useMutation({
    mutationFn: async ({
      oldSource,
      newSource,
      updateContacts = true,
    }: {
      oldSource: string;
      newSource: string;
      updateContacts?: boolean;
    }) => {
      if (!activeCompanyId) throw new Error("Nenhuma empresa ativa.");
      return await renameCompanyContactSourceAction({
        data: {
          companyId: activeCompanyId,
          oldSource,
          newSource,
          updateContacts,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Origem atualizada!");
    },
    onError: (e: any) => {
      toast.error("Erro ao atualizar origem", { description: e.message });
    },
  });

  const resetSources = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Nenhuma empresa ativa.");
      return await resetCompanyContactSourcesAction({
        data: { companyId: activeCompanyId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-contact-sources", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["contact-sources-stats", activeCompanyId] });
      toast.success("Sugestões padrão restauradas com sucesso!");
    },
    onError: (e: any) => {
      toast.error("Erro ao restaurar sugestões", { description: e.message });
    },
  });

  const updateContactSource = useMutation({
    mutationFn: async ({
      contactId,
      source,
      sourceDetails,
    }: {
      contactId: string;
      source: string | null;
      sourceDetails?: string | null;
    }) => {
      return await updateContactSourceAction({
        data: {
          contactId,
          source,
          source_details: sourceDetails,
        },
      });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-details", variables.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Origem do contato atualizada!");
    },
    onError: (e: any) => {
      toast.error("Erro ao atualizar origem do contato", { description: e.message });
    },
  });

  return {
    allSources: sources,
    sources,
    customSources: sources,
    isLoadingSources: isLoading,
    addSource,
    removeSource,
    renameSource,
    resetSources,
    updateContactSource,
  };
}
