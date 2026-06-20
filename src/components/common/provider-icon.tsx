import { Instagram, BadgeCheck, Smartphone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./channel-icon";

interface Props {
  provider?: string | null;
  className?: string;
}

export function ProviderIcon({ provider, className }: Props) {
  if (provider === "instagram") {
    return <ChannelIcon channel="instagram" className={className} />;
  }
  
  if (provider === "official") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)} title="WhatsApp Oficial">
        <ChannelIcon channel="whatsapp" />
        <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
      </span>
    );
  }

  // Evogo / Coex
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title="WhatsApp Coex (Evogo)">
      <ChannelIcon channel="whatsapp" />
      <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  );
}
