import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!loading && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      navigate({ to: session ? "/dashboard" : "/auth", replace: true });
    }
  }, [loading, session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
