import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // Keep unused queries in garbage collection for 24h
        staleTime: 1000 * 60 * 5,    // Consider queries fresh for 5 mins
      }
    }
  });

  if (typeof window !== "undefined") {
    // 1. Try to hydrate the cache from localStorage immediately on creation
    try {
      const persistedState = localStorage.getItem("ATENDI_QUERY_CACHE");
      if (persistedState) {
        const parsedState = JSON.parse(persistedState);
        hydrate(queryClient, parsedState);
      }
    } catch (e) {
      console.warn("Failed to hydrate query cache:", e);
      try { localStorage.removeItem("ATENDI_QUERY_CACHE"); } catch {}
    }

    // 2. Subscribe to query cache changes to persist new data safely
    let saveTimeout: any = null;
    queryClient.getQueryCache().subscribe(() => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        try {
          const dehydratedState = dehydrate(queryClient, {
            shouldDehydrateQuery: (query) => {
              // Only persist lightweight queries (unread counts) to save space.
              // Heavy objects (messages/conversations lists) are excluded to prevent localStorage quota errors.
              const queryKey = query.queryKey;
              const isUnread = queryKey[0] === "unread-counts";
              
              return isUnread && query.state.status === "success";
            }
          });
          const serialized = JSON.stringify(dehydratedState);
          if (serialized.length > 200000) {
            console.warn("[QueryCache] Cache payload exceeds 200KB limit, removing persisted cache.");
            try { localStorage.removeItem("ATENDI_QUERY_CACHE"); } catch {}
          } else {
            try {
              localStorage.setItem("ATENDI_QUERY_CACHE", serialized);
            } catch (e: any) {
              console.warn("[QueryCache] Failed to set item in localStorage:", e);
              try { localStorage.removeItem("ATENDI_QUERY_CACHE"); } catch {}
            }
          }
        } catch (e: any) {
          console.warn("Failed to persist query cache:", e);
          try { localStorage.removeItem("ATENDI_QUERY_CACHE"); } catch {}
        }
      }, 1000);
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
