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

  if (provider === "messenger") {
    return <ChannelIcon channel="messenger" className={className} />;
  }

  if (provider === "facebook") {
    return <ChannelIcon channel="facebook" className={className} />;
  }
  
  if (provider === "official") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0" title="WhatsApp Oficial">
        <ChannelIcon channel="whatsapp" className={className} />
        <div className="absolute -bottom-1 -right-1 rounded-full bg-background leading-none">
          <BadgeCheck className="h-3 w-3 text-blue-500" />
        </div>
      </span>
    );
  }

  // Evogo / Coex
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" title="WhatsApp Coex (Evogo)">
      <ChannelIcon channel="whatsapp" className={className} />
      <div className="absolute -bottom-1 -right-1 rounded-full bg-background p-[1px] leading-none">
        <Smartphone className="h-[10px] w-[10px] text-muted-foreground" />
      </div>
    </span>
  );
}
