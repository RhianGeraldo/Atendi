import { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { canAccessMenu } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

interface Props {
  menuKey: string;
  children: ReactNode;
}

export function ProtectedMenuRoute({ menuKey, children }: Props) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando permissões...</div>;
  }

  if (!canAccessMenu(menuKey, profile)) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Acesso Restrito</h2>
            <p className="text-sm text-muted-foreground">
              Seu perfil ou cargo não possui permissão para visualizar este menu.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/conversations">Voltar para Atendimentos</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
