import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, FOOTER_LINKS, SELLER_LEGAL_NAME, SUB_PROCESSORS } from "./config";
import { LEGAL_DOCS } from "./legal";
import { buildLlmsTxt, SEO_PAGES, SITE_URL } from "./seo";

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
