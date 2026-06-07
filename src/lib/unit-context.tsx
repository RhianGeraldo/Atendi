import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
    const saved = localStorage.getItem("omni_selected_unit_id");
    return saved ? saved : null;
  });

  const setSelectedUnitId = (id: string | null) => {
    setSelectedUnitIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("omni_selected_unit_id", id);
      } else {
        localStorage.removeItem("omni_selected_unit_id");
      }
    }
  };

  // Se o usuário deslogar ou trocar de empresa (hipoteticamente), reseta a unidade
  useEffect(() => {
    if (!profile) {
      setSelectedUnitId(null);
    }
  }, [profile]);

  return (
    <UnitContext.Provider value={{ selectedUnitId, setSelectedUnitId }}>
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
