import { cn } from "@/lib/utils";

interface Props {
  status: "waiting" | "active" | "resolved";
  className?: string;
}

const map = {
  waiting: { label: "Aguardando", cls: "bg-warning/15 text-warning border-warning/30" },
  active: { label: "Em andamento", cls: "bg-info/15 text-info border-info/30" },
  resolved: { label: "Resolvido", cls: "bg-success/15 text-success border-success/30" },
};

export function StatusBadge({ status, className }: Props) {
  const cfg = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cfg.cls,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
