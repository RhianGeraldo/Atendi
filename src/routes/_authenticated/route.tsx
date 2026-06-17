import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  return (
    <WavoipProvider>
      <AppShell>
        <Outlet />
      </AppShell>
      <WavoipCallOverlay />
    </WavoipProvider>
  );
}
