import { PLAN } from "@monthmemo/contract";
import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, FAQ, FOOTER_LINKS, PLAN_FEATURES, SELLER_LEGAL_NAME, SUB_PROCESSORS } from "./config";
import { LEGAL_DOCS } from "./legal";
import { buildJsonLd, buildLlmsTxt, SEO_PAGES, SITE_URL } from "./seo";

const PRODUCTION_HOST = "https://monthmemo.spacesonlabs.com";

describe("Production site identity", () => {
  it("canonical base is the spacesonlabs subdomain", () => {
    expect(SITE_URL).toBe(PRODUCTION_HOST);
  });

  it("llms.txt links only to the production host", () => {
    const links = buildLlmsTxt().match(/https?:\/\/[^\s)]+/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.startsWith(PRODUCTION_HOST)).toBe(true);
    }
  });

  it("legal pages name Spaceson Labs as the operator, with no placeholder", () => {
    expect(SELLER_LEGAL_NAME).toBe("Spaceson Labs");
    const text = JSON.stringify(LEGAL_DOCS);
    expect(text).toContain("MonthMemo is operated by Spaceson Labs.");
    expect(text).not.toMatch(/SELLER_LEGAL_NAME|REPLACE_WITH/);
  });

  it("contact email is the real mailbox", () => {
    expect(CONTACT_EMAIL).toBe("monthmemo@spacesonlabs.com");
  });

  it("lists Groq as the narrative sub-processor", () => {
    const names = SUB_PROCESSORS.map((entry) => entry.name);
    expect(names).toContain("Groq, Inc.");
  });
});

describe("Free report summary page", () => {
  const TOOL_PATH = "/tools/ga4-report-summary";

  it("is prerendered and listed in the sitemap", () => {
    expect(SEO_PAGES.map((page) => page.path)).toContain(TOOL_PATH);
  });

  it("is linked from the footer and llms.txt", () => {
    expect(FOOTER_LINKS.map((link) => link.to)).toContain(TOOL_PATH);
    expect(buildLlmsTxt()).toContain(`${SITE_URL}${TOOL_PATH}`);
  });
});

describe("One $4 plan", () => {
  const PUBLIC_COPY = () => {
    return JSON.stringify({ SEO_PAGES, FAQ, LEGAL_DOCS, PLAN_FEATURES, llms: buildLlmsTxt() });
  };

  it("sells one plan at $4 a month for up to 15 clients", () => {
    expect(PLAN).toEqual({ priceCents: 400, clientLimit: 15 });
    expect(buildLlmsTxt()).toContain("- One plan: $4/month, up to 15 clients, cancel anytime.");
  });

  it("names no tier, toggle or pack in public copy, and no price but $4", () => {
    const copy = PUBLIC_COPY();
    expect(copy).not.toMatch(/\b(Starter|Growth|Solo|Agency plan|Pro)\b|yearly|annual|\bpacks?\b/i);
    expect(new Set(copy.match(/\$\d+/g))).toEqual(new Set(["$4"]));
  });

  it("puts one $4 offer in the JSON-LD of every page", () => {
    for (const page of SEO_PAGES) {
      const graph = buildJsonLd(page)["@graph"] as Array<{ "@type": string; offers?: unknown }>;
      const app = graph.find((node) => node["@type"] === "SoftwareApplication");
      expect(app?.offers).toEqual({
        "@type": "Offer",
        price: "4",
        priceCurrency: "USD",
        url: `${SITE_URL}/pricing`,
      });
    }
  });
});
