/**
 * Dev-only fallback when the MSW service worker can't register (some embedded
 * browsers block service workers). Patches fetch + XHR in the page instead and
 * answers them with the same handlers.
 */
import { BatchInterceptor } from "@mswjs/interceptors";
import { FetchInterceptor } from "@mswjs/interceptors/fetch";
import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest";
import { getResponse } from "msw";
import { handlers } from "./handlers";

export function startInPageMocks() {
  const interceptor = new BatchInterceptor({
    name: "fileshare-mocks",
    interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
  });
  interceptor.apply();
  interceptor.on("request", async ({ request, controller }) => {
    const response = await getResponse(handlers, request);
    if (response) controller.respondWith(response);
  });
}
