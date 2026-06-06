import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: () => <Soon title="Contatos" />,
});

function Soon({ title }: { title: string }) {
  return (
    <div className="p-6">
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta tela faz parte das próximas entregas do MVP. Foque em
          <strong> Dashboard </strong> e <strong>Atendimentos</strong> por enquanto.
        </p>
      </Card>
    </div>
  );
}
