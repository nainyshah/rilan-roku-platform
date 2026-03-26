import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, retryLink, TRPCClientError } from "@trpc/client";
import { retryEvents } from "@/lib/retryEvents";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// Determine whether an error is a transient network failure that should be retried
const isTransientNetworkError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  const msg = error.message?.toLowerCase() ?? "";
  // "Failed to fetch" = network unreachable (sandbox wake-up, brief disconnect)
  // "Load failed" = Safari equivalent; "NetworkError" = Firefox equivalent
  return (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry up to 3 times for transient network errors only
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        return isTransientNetworkError(error);
      },
      // Exponential backoff: 1s → 2s → 4s
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      // Keep stale data visible while retrying in background
      staleTime: 30_000,
    },
    mutations: {
      retry: 0, // Never auto-retry mutations — they may have side effects
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated") {
    if (event.action.type === "error") {
      const error = event.query.state.error;
      redirectToLoginIfUnauthorized(error);
      if (isTransientNetworkError(error)) {
        // All retries exhausted — emit the failed event for UI feedback
        retryEvents.emit({ type: 'failed' });
      } else {
        console.error("[API Query Error]", error);
      }
    }
    // When a previously-failing query succeeds (e.g. after retry), emit recovered
    if (event.action.type === "success" && event.query.state.fetchFailureCount > 0) {
      retryEvents.emit({ type: 'recovered' });
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isTransientNetworkError(error)) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    // Retry transient network failures at the transport level (up to 3 attempts)
    retryLink({
      retry({ attempts, error }) {
        // attempts = total calls made including the first (1-indexed)
        if (attempts >= 4) return false; // max 3 retries (attempts 2, 3, 4)
        // Don't retry application-level 4xx errors
        if (error.data?.httpStatus && error.data.httpStatus < 500) return false;
        if (isTransientNetworkError(error)) {
          // Emit retrying event so the ReconnectToast can show attempt counter
          retryEvents.emit({ type: 'retrying', attempt: attempts });
          return true;
        }
        return false;
      },
      retryDelayMs: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 10_000),
    }),
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
