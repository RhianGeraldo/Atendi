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
    }

    // 2. Subscribe to query cache changes to persist new data
    let saveTimeout: any = null;
    queryClient.getQueryCache().subscribe(() => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        try {
          const dehydratedState = dehydrate(queryClient, {
            shouldDehydrateQuery: (query) => {
              // We only persist messages, unread counts and conversations list to save space and egress.
              // Also only persist successful queries that don't have errors.
              const queryKey = query.queryKey;
              const isConversations = queryKey[0] === "conversations";
              const isMessages = queryKey[0] === "messages";
              const isUnread = queryKey[0] === "unread-counts";
              
              return (isConversations || isMessages || isUnread) && query.state.status === "success";
            }
          });
          localStorage.setItem("ATENDI_QUERY_CACHE", JSON.stringify(dehydratedState));
        } catch (e) {
          console.warn("Failed to persist query cache:", e);
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
