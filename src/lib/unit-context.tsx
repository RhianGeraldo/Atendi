import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useAuth } from "./auth-context";

interface UnitContextType {
  selectedUnitId: string | null;
  setSelectedUnitId: (id: string | null) => void;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

export function UnitProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  
  // Inicializa o estado a partir do localStorage, se existir (com proteção para SSR)
  const [selectedUnitId, setSelectedUnitIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("atendiai_selected_unit_id") || localStorage.getItem("omni_selected_unit_id");
    return saved ? saved : null;
  });

  const setSelectedUnitId = useCallback((id: string | null) => {
    setSelectedUnitIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("atendiai_selected_unit_id", id);
      } else {
        localStorage.removeItem("atendiai_selected_unit_id");
      }
    }
  }, []);

  // Se o usuário deslogar ou trocar de empresa, reseta a unidade se houver valor
  useEffect(() => {
    if (!profile && selectedUnitId !== null) {
      setSelectedUnitId(null);
    }
  }, [profile, selectedUnitId, setSelectedUnitId]);

  const value = useMemo(
    () => ({ selectedUnitId, setSelectedUnitId }),
    [selectedUnitId, setSelectedUnitId]
  );

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const context = useContext(UnitContext);
  if (context === undefined) {
    throw new Error("useUnit must be used within a UnitProvider");
  }
  return context;
}
