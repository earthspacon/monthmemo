import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, SUB_PROCESSORS } from "./config";
import { buildLlmsTxt, SITE_URL } from "./seo";

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

  it("contact email is the real mailbox", () => {
    expect(CONTACT_EMAIL).toBe("monthmemo@spacesonlabs.com");
  });

  it("lists Groq as the narrative sub-processor", () => {
    const names = SUB_PROCESSORS.map((entry) => entry.name);
    expect(names).toContain("Groq, Inc.");
  });
});
