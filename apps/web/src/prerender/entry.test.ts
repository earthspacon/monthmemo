import { describe, expect, it } from "vitest";

import TEMPLATE from "../../index.html?raw";
import { buildPrerenderedFiles } from "./entry";

describe("web analytics beacon", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef";
  const htmlFiles = (token?: string) => {
    return buildPrerenderedFiles(TEMPLATE, token ? { beaconToken: token } : undefined).filter(({ file }) => {
      return file.endsWith(".html");
    });
  };

  it("a production build puts the Cloudflare beacon on every public page and the app shell", () => {
    const withBeacon = htmlFiles(TOKEN);
    expect(withBeacon.length).toBeGreaterThan(3);
    for (const { file, content } of withBeacon) {
      expect(content, file).toContain("https://static.cloudflareinsights.com/beacon.min.js");
      expect(content, file).toContain(`data-cf-beacon='{"token":"${TOKEN}","spa":true}'`);
    }
  });

  it("a build without the token (dev, e2e, sandbox) loads no analytics", () => {
    for (const { file, content } of htmlFiles()) {
      expect(content, file).not.toContain("cloudflareinsights");
    }
  });
});

describe("pricing card", () => {
  it("the prerendered pricing page shows the monthly price and keeps the yearly one hidden in place", () => {
    const pricing = buildPrerenderedFiles(TEMPLATE).find(({ file }) => file === "pricing.html");
    const html = pricing?.content ?? "";

    expect(html).toMatch(/aria-pressed="true"[^>]*>Monthly</);
    expect(html).toMatch(/<p class="[^"]*"><span[^>]*>\$4<\/span><span[^>]*>\/ month · cancel anytime<\/span>/);
    expect(html).toMatch(
      /<p hidden="" class="[^"]*"><span[^>]*>\$40<\/span><span[^>]*>\/ year · 2 months free<\/span>/,
    );
  });
});

describe("studio link", () => {
  it("every page footer links Spaceson Labs to the studio site", () => {
    const pages = buildPrerenderedFiles(TEMPLATE).filter(({ content }) => {
      return content.includes("<footer");
    });

    expect(pages.length).toBeGreaterThan(3);
    for (const { file, content } of pages) {
      const footer = content.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
      expect(footer, file).toMatch(/<a [^>]*href="https:\/\/spacesonlabs\.com"[^>]*>Spaceson Labs<\/a>/);
    }
  });
});
