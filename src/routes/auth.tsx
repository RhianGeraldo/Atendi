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
  const { signIn, signUp, session, loading } = useAuth();
  const navigate = useNavigate();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const companyId = searchParams.get("company");
  
  const [isRegister, setIsRegister] = useState(!!companyId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    
    if (isRegister) {
      const { error } = await signUp(name, email, password, companyId);
      setSubmitting(false);
      if (error) toast.error("Falha no cadastro", { description: error });
      else toast.success("Conta criada! Você já pode entrar.");
    } else {
      const { error } = await signIn(email, password);
      setSubmitting(false);
      if (error) toast.error("Falha no login", { description: error });
      else toast.success("Bem-vindo!");
    }
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
          © {new Date().getFullYear()} Grupo Omni
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm border-border p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">
              {isRegister ? "Criar conta" : "Entrar na plataforma"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isRegister 
                ? (companyId ? "Você foi convidado para participar de uma empresa." : "Crie sua conta para começar.")
                : "Use suas credenciais para acessar."}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
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
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde..." : (isRegister ? "Cadastrar" : "Entrar")}
            </Button>
          </form>

          {isRegister && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Já possui uma conta?
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className="ml-1 font-medium text-primary hover:underline"
              >
                Faça login
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
