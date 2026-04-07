import { QueryClient } from "@tanstack/react-query"

const globalForQuery = globalThis as unknown as { queryClient: QueryClient }

export const queryClient =
  globalForQuery.queryClient ??
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })

if (typeof window !== "undefined") globalForQuery.queryClient = queryClient
