import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error("Falha no login", { description: error });
    else toast.success("Bem-vindo!");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand */}
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="h-5 w-5" />
          </div>
          Omni
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold leading-tight">
            Atendimento omnichannel com CRM integrado.
          </h2>
          <p className="text-sm text-sidebar-foreground/70">
            Centralize WhatsApp e Instagram, organize equipes por unidade e
            transforme conversas em oportunidades de venda.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Grupo Exemplo
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm border-border p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Entrar na plataforma</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use suas credenciais para acessar.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-6 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Conta de demonstração:</strong>
            <br />
            admin@demo.com / demo1234
          </div>
        </Card>
      </div>
    </div>
  );
}
