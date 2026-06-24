import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  channel: "whatsapp" | "instagram" | "messenger" | "facebook";
  className?: string;
}

export function ChannelIcon({ channel, className }: Props) {
  if (channel === "messenger") {
    return (
      <span
        className={cn(
          "inline-grid h-5 w-5 place-items-center rounded text-white",
          className,
        )}
        style={{
          background: "linear-gradient(45deg, #00B2FF, #006AFF)",
        }}
        title="Messenger"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.145 2 11.26c0 2.91 1.488 5.497 3.792 7.155V22l3.454-1.884c.883.253 1.81.393 2.754.393 5.523 0 10-4.145 10-9.26S17.523 2 12 2zm1.093 12.385l-2.825-3.018-5.503 3.018 6.035-6.425 2.89 3.018 5.438-3.018-6.035 6.425z"/></svg>
      </span>
    );
  }
  
  if (channel === "facebook") {
    return (
      <span
        className={cn(
          "inline-grid h-5 w-5 place-items-center rounded bg-[#1877F2] text-white",
          className,
        )}
        title="Facebook"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </span>
    );
  }

  if (channel === "instagram") {
    return (
      <span
        className={cn(
          "inline-grid h-5 w-5 place-items-center rounded text-white",
          className,
        )}
        style={{
          background:
            "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
        }}
        title="Instagram"
      >
        <Instagram className="h-3 w-3" />
      </span>
    );
  }
  // WhatsApp
  return (
    <span
      className={cn(
        "inline-grid h-5 w-5 place-items-center rounded bg-[#25D366] text-white",
        className,
      )}
      title="WhatsApp"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
        <path d="M20.52 3.48A11.78 11.78 0 0 0 12.04 0C5.5 0 .19 5.31.19 11.85c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.84 11.84 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.31 11.85-11.85 0-3.17-1.23-6.14-3.38-8.43Zm-8.48 18.2h-.01a9.84 9.84 0 0 1-5.01-1.37l-.36-.21-3.8 1 1.02-3.7-.23-.38a9.83 9.83 0 0 1-1.51-5.18c0-5.44 4.43-9.86 9.87-9.86 2.64 0 5.12 1.03 6.98 2.89a9.78 9.78 0 0 1 2.89 6.98c0 5.44-4.43 9.85-9.84 9.85Z" />
      </svg>
    </span>
  );
}
