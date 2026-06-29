import { useRouterState } from "@tanstack/react-router";
import { Bell, Search, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/conversations": "Atendimentos",
  "/calls": "Histórico de Ligações",
  "/contacts": "Contatos",
  "/pipeline": "Funil de Vendas",
  "/tasks": "Tarefas",
  "/campaigns": "Campanhas",
  "/reports": "Relatórios",
  "/settings": "Configurações",
};

export function AppHeader({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] ?? "Omni";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-3">
        {onMobileMenuToggle && (
          <button 
            onClick={onMobileMenuToggle}
            className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar... (Ctrl+K)"
            className="h-9 w-64 pl-8 text-sm"
          />
        </div>
        <button className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}
