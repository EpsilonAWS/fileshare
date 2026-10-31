import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Expired / not-found / locked won't fix themselves on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
