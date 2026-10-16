import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TodooRangeKey } from "./todoo-period";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Cabeçalho padrão das abas do Todoo (título, descrição e ações à direita). */
export function TodooSectionHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Seletor de período usado na Gincana e nos Indicadores. */
export function TodooRangeTabs({
  value,
  onChange,
}: {
  value: TodooRangeKey;
  onChange: (value: TodooRangeKey) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TodooRangeKey)}>
      <TabsList className="h-8">
        <TabsTrigger value="month" className="text-xs h-6">
          Este mês
        </TabsTrigger>
        <TabsTrigger value="last_month" className="text-xs h-6">
          Mês passado
        </TabsTrigger>
        <TabsTrigger value="all" className="text-xs h-6">
          Tudo
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
