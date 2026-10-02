/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useEffect, useState } from "react";

interface CopilotContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  screenContext: Record<string, any>;
  setScreenContext: (ctx: Record<string, any>) => void;
  initialPrompt: string | null;
  openWithPrompt: (prompt: string) => void;
}

const CopilotContext = createContext<CopilotContextType | undefined>(undefined);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [screenContext, setScreenContext] = useState<Record<string, any>>({});
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

  const toggleOpen = () => setIsOpen((prev) => !prev);

  const openWithPrompt = (prompt: string) => {
    setInitialPrompt(prompt);
    setIsOpen(true);
  };

  // Atalho global: Ctrl+J ou Cmd+J para abrir/fechar o Copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CopilotContext.Provider
      value={{
        isOpen,
        setIsOpen,
        toggleOpen,
        screenContext,
        setScreenContext,
        initialPrompt,
        openWithPrompt,
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error("useCopilot must be used within a CopilotProvider");
  }
  return context;
}
