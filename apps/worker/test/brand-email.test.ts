import type { BrandDto, ReportMetrics } from "@monthmemo/contract";
import { describe, expect, it } from "vitest";

import { api, SAMPLE_METRICS, SAMPLE_NARRATIVE, signInWithGoogle } from "./helpers";

const UNSUBSCRIBE_URL = "http://localhost:8787/u/0123456789abcdef0123456789abcdef";
const BRAND: BrandDto = {
  displayName: "Riley Studio",
  accentColor: "#0f766e",
  logoUrl: "https://cdn.rileystudio.example/logo.png",
  replyTo: "hello@rileystudio.example",
};
const LONG_TEXT_LIMIT = 80;

async function render({
  brand = BRAND,
  clientName = "Example Bakery",
  metrics = SAMPLE_METRICS,
  narrative = SAMPLE_NARRATIVE,
}: {
  brand?: BrandDto;
  clientName?: string;
  metrics?: ReportMetrics;
  narrative?: string;
} = {}) {
  const { renderReportEmail } = await import("../src/email/render");
  return renderReportEmail({
    brand,
    client: { name: clientName },
    period: metrics.period,
    metrics,
    narrative,
    unsubscribeUrl: UNSUBSCRIBE_URL,
  });
}

describe("Brand settings", () => {
  it("MM-R9 brand defaults come from the Google profile and a valid brand is saved", async () => {
    const { cookie, profile } = await signInWithGoogle();
    const defaults = await api({ path: "/api/brand", cookie });

    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toEqual({
      displayName: profile.name,
      accentColor: "#2563eb",
      logoUrl: null,
      replyTo: profile.email,
    });

    const saved = await api({ path: "/api/brand", method: "PUT", cookie, body: BRAND });
    expect(saved.status).toBe(200);
    expect(await (await api({ path: "/api/brand", cookie })).json()).toEqual(BRAND);
  });

  it("MM-R9 every invalid brand field answers 400 naming it", async () => {
    const { cookie } = await signInWithGoogle();
    const cases: Array<{ body: BrandDto; field: keyof BrandDto }> = [
      { body: { ...BRAND, displayName: "" }, field: "displayName" },
      { body: { ...BRAND, displayName: "x".repeat(61) }, field: "displayName" },
      { body: { ...BRAND, accentColor: "teal" }, field: "accentColor" },
      { body: { ...BRAND, accentColor: "#12345" }, field: "accentColor" },
      { body: { ...BRAND, logoUrl: "http://cdn.rileystudio.example/logo.png" }, field: "logoUrl" },
      { body: { ...BRAND, logoUrl: "not a url" }, field: "logoUrl" },
      { body: { ...BRAND, replyTo: "hello-at-studio" }, field: "replyTo" },
    ];

    for (const { body, field } of cases) {
      const response = await api({ path: "/api/brand", method: "PUT", cookie, body });

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json(), JSON.stringify(body)).toMatchObject({ field });
    }
  });
});

describe("Report email", () => {
  it("MM-R10 the email carries the subject, branding, narrative, KPI and top tables, and a text twin", async () => {
    const { subject, html, text } = await render();

    expect(subject).toBe("Example Bakery — October 2026 report");
    expect(html).toContain(`src="${BRAND.logoUrl}"`);
    expect(html).toContain(BRAND.displayName);
    expect(html).toContain(BRAND.accentColor);
    expect(html).toContain("Visits grew by about 12% in October, led by organic search.");
    expect(html).toContain("Search clicks rose 23% as the sourdough guide climbed in results.");
    expect(html).toMatch(/4,?820/);
    expect(html).toMatch(/4,?310/);
    expect(html).toMatch(/11\.8%|12%/);
    expect(html).toMatch(/1,?240/);
    for (const row of [...(SAMPLE_METRICS.gsc?.topQueries ?? []), ...(SAMPLE_METRICS.gsc?.topPages ?? [])]) {
      expect(html).toContain(row.label);
    }
    expect(html).toContain(UNSUBSCRIBE_URL);
    expect(html.toLowerCase()).toContain("reply");

    expect(text).toContain("Visits grew by about 12% in October, led by organic search.");
    expect(text).toMatch(/4,?820/);
    expect(text).toMatch(/1,?240/);
    expect(text).toContain("sourdough bread near me");
    expect(text).toContain(UNSUBSCRIBE_URL);
  });

  it("MM-R10 a GA4-only report without an earlier month renders without a Search Console table", async () => {
    const ga4 = SAMPLE_METRICS.ga4;
    if (!ga4) {
      throw new Error("sample metrics have GA4 data");
    }
    const noBase = { current: 4820, previous: 0, changePercent: null };
    const ga4Only: ReportMetrics = { ...SAMPLE_METRICS, ga4: { ...ga4, sessions: noBase }, gsc: null };
    const { html, text } = await render({ metrics: ga4Only });

    expect(html).toMatch(/4,?820/);
    expect(html).not.toContain("sourdough bread near me");
    expect(`${html}${text}`).not.toMatch(/NaN|Infinity|null|undefined/);
  });

  it("MM-R11 a script tag in a search query arrives escaped in the email html", async () => {
    const hostile = "<script>alert(1)</script>";
    const longQuery = `best bakery ${"very ".repeat(40)}long query`;
    const gsc = SAMPLE_METRICS.gsc;
    if (!gsc) {
      throw new Error("sample metrics have Search Console data");
    }
    const metrics: ReportMetrics = {
      ...SAMPLE_METRICS,
      gsc: {
        ...gsc,
        topQueries: [
          { label: hostile, value: 12 },
          { label: longQuery, value: 9 },
        ],
        topPages: [{ label: `https://examplebakery.com/${hostile}`, value: 3 }],
      },
    };

    const { html, text } = await render({
      brand: {
        ...BRAND,
        displayName: `<img src=x onerror=alert(1)>Studio`,
        logoUrl: "http://insecure.example/logo.png",
      },
      clientName: "<b>Bakery</b>",
      narrative: `${hostile} Visits grew.`,
      metrics,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Bakery</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Bakery&lt;/b&gt;");
    expect(html).not.toContain("http://insecure.example/logo.png");
    expect(html).not.toContain(longQuery);
    expect(html).toContain(`${longQuery.slice(0, LONG_TEXT_LIMIT - 10)}`);
    expect(html).toContain("…");
    expect(text).toContain("Visits grew.");
  });
});
