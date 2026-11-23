import { describe, expect, it } from "vitest";

import { fetchWithEnv } from "./helpers";

const NOT_FOUND_HTML =
  '<!doctype html><html><head><meta name="robots" content="noindex" /></head>' +
  '<body><div id="root" data-prerendered="/404"><h1>Page not found</h1></div></body></html>';

// Mirrors the assets binding with not_found_handling = "none": only built files exist, everything else is an empty 404.
const fakeAssets = {
  fetch: async (input: RequestInfo | URL) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input);

    if (pathname === "/404") {
      return new Response(NOT_FOUND_HTML, { headers: { "content-type": "text/html" } });
    }
    return new Response(null, { status: 404 });
  },
} as Fetcher;

describe("unknown public paths", () => {
  it("serve the prerendered not-found page with status 404 and noindex", async () => {
    const response = await fetchWithEnv({ overrides: { ASSETS: fakeAssets }, path: "/nope-404" });
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(body).toContain("Page not found");
    expect(body).toContain('content="noindex"');
  });

  it("answer HEAD with 404 and an empty body", async () => {
    const response = await fetchWithEnv({
      overrides: { ASSETS: fakeAssets },
      path: "/nope-404",
      init: { method: "HEAD" },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
