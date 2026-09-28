import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth-context";
import { WavoipProvider } from "@/hooks/use-wavoip";
import { WavoipCallOverlay } from "@/components/whatsapp/wavoip-call-overlay";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground animate-pulse">Conectando ao Atendi...</p>
      </div>
    );
  }

  return (
    <WavoipProvider>
      <AppShell>
        <Outlet />
      </AppShell>
      <WavoipCallOverlay />
    </WavoipProvider>
  );
}
