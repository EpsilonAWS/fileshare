import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { queryClient } from "@/lib/query-client";
import { router } from "./router";
import "@fontsource-variable/outfit";
import "./index.css";

async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.VITE_API_MOCKING !== "enabled") return;
  const { worker } = await import("./mocks/browser");
  // Let requests we don't mock (Vite assets, fonts) pass through silently.
  try {
    await worker.start({ onUnhandledRequest: "bypass" });
  } catch (err) {
    // Some embedded browsers block service workers — fall back to patching fetch/XHR in the page.
    console.warn("[mocks] Service worker unavailable, using in-page mocks instead.", err);
    const { startInPageMocks } = await import("./mocks/fallback");
    startInPageMocks();
  }
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
