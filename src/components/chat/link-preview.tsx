import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
  mine?: boolean;
}

export function LinkPreview({ url, mine }: LinkPreviewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPreview = async () => {
      try {
        const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const result = await response.json();
        
        if (isMounted && result.status === 'success' && result.data) {
          setData(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch link preview", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPreview();
    
    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className={cn(
        "mt-2 h-32 w-full sm:w-[350px] animate-pulse rounded-md border",
        mine ? "bg-primary-foreground/10 border-transparent" : "bg-muted/50 border-border/50"
      )}></div>
    );
  }

  if (!data || (!data.title && !data.image && !data.description)) {
    return null; // Return nothing if no useful metadata was found
  }

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={cn(
        "mt-1 flex flex-col overflow-hidden rounded-md border transition-colors group w-full sm:w-[350px]",
        mine 
          ? "bg-black/10 hover:bg-black/20 text-primary-foreground border-transparent" 
          : "bg-card/50 hover:bg-card text-foreground border-border/50"
      )}
    >
      {data.image?.url && (
        <div className="h-36 w-full overflow-hidden bg-black/5">
          <img 
            src={data.image.url} 
            alt={data.title || "Link preview"} 
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-col p-3 text-left">
        {data.title && (
          <span className="line-clamp-1 font-semibold text-sm mb-1">{data.title}</span>
        )}
        {data.description && (
          <span className={cn(
            "line-clamp-2 text-xs mb-2 leading-relaxed opacity-90",
            mine ? "text-primary-foreground/80" : "text-muted-foreground"
          )}>
            {data.description}
          </span>
        )}
        <div className={cn(
          "flex items-center gap-1.5 text-[10px] opacity-70",
          mine ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  );
}
