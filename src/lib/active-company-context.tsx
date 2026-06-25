/**
 * ActiveCompanyContext
 *
 * Para usuários normais: retorna sempre profile.company_id
 * Para super_admin: retorna o ID da empresa selecionada no sidebar
 * (persistido em localStorage)
 *
 * Use `useActiveCompany()` no lugar de `profile?.company_id` em queries
 * que devem responder ao seletor de empresa do super_admin.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";

const STORAGE_KEY = "omni_selected_company_id";

interface ActiveCompanyContextType {
  /** ID da empresa ativa (pode ser null se super_admin não selecionou nenhuma) */
  activeCompanyId: string | null;
  /** Só relevante para super_admin — as demais roles sempre usam profile.company_id */
  setActiveCompanyId: (id: string | null) => void;
  /** true quando o usuário é super_admin */
  isSuperAdmin: boolean;
}

const ActiveCompanyContext = createContext<ActiveCompanyContextType | undefined>(undefined);

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";

  const [superCompanyId, setSuperCompanyId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const setActiveCompanyId = (id: string | null) => {
    setSuperCompanyId(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Quando o perfil carrega e não é super_admin, limpa eventual valor salvo
  useEffect(() => {
    if (profile && !isSuperAdmin) {
      setSuperCompanyId(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [profile, isSuperAdmin]);

  const activeCompanyId = isSuperAdmin ? superCompanyId : (profile?.company_id ?? null);

  return (
    <ActiveCompanyContext.Provider value={{ activeCompanyId, setActiveCompanyId, isSuperAdmin }}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany() {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) throw new Error("useActiveCompany must be used within ActiveCompanyProvider");
  return ctx;
}
