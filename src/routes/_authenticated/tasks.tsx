import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: () => (
    <div className="p-6">
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">Tarefas</h2>
        <p className="max-w-md text-sm text-muted-foreground">Em breve.</p>
      </Card>
    </div>
  ),
});
