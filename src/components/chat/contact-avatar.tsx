import React, { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const failedAvatarUrls = new Set<string>();

export function markAvatarFailed(url?: string | null) {
  if (url) failedAvatarUrls.add(url);
}

export function isAvatarFailed(url?: string | null): boolean {
  if (!url) return true;
  return failedAvatarUrls.has(url);
}

interface ContactAvatarProps {
  url?: string | null;
  name?: string | null;
  isGroup?: boolean;
  className?: string;
  fallbackClassName?: string;
}

export function ContactAvatar({
  url,
  name,
  isGroup,
  className,
  fallbackClassName,
}: ContactAvatarProps) {
  const [hasError, setHasError] = useState(() => isAvatarFailed(url));

  useEffect(() => {
    setHasError(isAvatarFailed(url));
  }, [url]);

  const canShowImage = !!url && !hasError;

  return (
    <Avatar className={cn("h-10 w-10 shrink-0", className)}>
      {canShowImage && (
        <AvatarImage
          src={url}
          alt={name || ""}
          className="object-cover"
          referrerPolicy="no-referrer"
          onError={() => {
            markAvatarFailed(url);
            setHasError(true);
          }}
        />
      )}
      <AvatarFallback
        className={cn(
          "text-xs font-medium",
          isGroup ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
          fallbackClassName
        )}
      >
        {isGroup ? <Users className="h-4 w-4" /> : initials(name || "Sem Nome")}
      </AvatarFallback>
    </Avatar>
  );
}
