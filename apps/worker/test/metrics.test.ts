import { describe, expect, it } from "vitest";

import { callsTo, fake, TEST_ACCESS_TOKEN } from "./fakes";
import { GA4_PROPERTY_ID, GSC_SITE_URL } from "./helpers";

const PERIOD = "2026-10";
const PREVIOUS_PERIOD = "2026-09";
const RUN_REPORT_PREFIX = "https://analyticsdata.googleapis.com/v1beta/properties/";
const SEARCH_ANALYTICS_PREFIX = "https://www.googleapis.com/webmasters/v3/sites/";

type ClientSources = { ga4PropertyId: string | null; gscSiteUrl: string | null };

async function build({ ga4PropertyId, gscSiteUrl }: ClientSources) {
  const { buildClientMetrics } = await import("../src/reports/metrics");
  const { createGoogleClient } = await import("../src/google/client");
  fake.currentPeriod = PERIOD;

  return buildClientMetrics({
    google: createGoogleClient({ accessToken: TEST_ACCESS_TOKEN }),
    client: { id: crypto.randomUUID(), name: "Example Bakery", ga4PropertyId, gscSiteUrl },
    period: PERIOD,
  });
}

function percent(current: number, previous: number) {
  return ((current - previous) / previous) * 100;
}

describe("Client metrics", () => {
  it("MM-R12 a GA4 and Search Console client gets both sections for last month against the one before", async () => {
    const metrics = await build({ ga4PropertyId: GA4_PROPERTY_ID, gscSiteUrl: GSC_SITE_URL });

    expect(metrics.period).toBe(PERIOD);
    expect(metrics.previousPeriod).toBe(PREVIOUS_PERIOD);
    expect(metrics.ga4?.sessions).toMatchObject({ current: 4820, previous: 4310 });
    expect(metrics.ga4?.sessions.changePercent).toBeCloseTo(percent(4820, 4310), 0);
    expect(metrics.ga4?.users).toMatchObject({ current: 3610, previous: 3302 });
    expect(metrics.ga4?.keyEvents).toMatchObject({ current: 142, previous: 118 });
    expect(metrics.ga4?.topChannels).toEqual([
      { label: "Organic Search", value: 2410 },
      { label: "Direct", value: 1105 },
      { label: "Paid Search", value: 602 },
      { label: "Referral", value: 388 },
      { label: "Organic Social", value: 215 },
    ]);
    expect(metrics.ga4?.topLandingPages).toEqual([
      { label: "/", value: 1890 },
      { label: "/menu", value: 1010 },
      { label: "/order-online", value: 720 },
      { label: "/blog/sourdough-starter-guide", value: 418 },
      { label: "/contact", value: 402 },
    ]);

    expect(metrics.gsc?.clicks).toMatchObject({ current: 1240, previous: 1010 });
    expect(metrics.gsc?.clicks.changePercent).toBeCloseTo(percent(1240, 1010), 0);
    expect(metrics.gsc?.impressions).toMatchObject({ current: 38900, previous: 35200 });
    expect(metrics.gsc?.ctr.current).toBeCloseTo(1240 / 38900, 3);
    expect(metrics.gsc?.position).toMatchObject({ current: 14.2, previous: 15.8 });
    expect(metrics.gsc?.topQueries.map((row) => row.label)).toEqual([
      "sourdough bread near me",
      "example bakery",
      "best croissants downtown",
      "birthday cake order online",
      "gluten free bakery",
    ]);
    expect(metrics.gsc?.topQueries[0].value).toBe(310);
    expect(metrics.gsc?.topPages).toHaveLength(5);
    expect(metrics.gsc?.topPages[0]).toEqual({ label: "https://examplebakery.com/", value: 520 });

    const ga4Requests = callsTo(RUN_REPORT_PREFIX).map((call) => JSON.parse(call.body));
    for (const request of ga4Requests) {
      expect(request.metrics.map((metric: { name: string }) => metric.name)).toEqual([
        "sessions",
        "totalUsers",
        "keyEvents",
      ]);
      expect(request.dateRanges).toHaveLength(2);
    }
    const gscRequests = callsTo(SEARCH_ANALYTICS_PREFIX).map((call) => JSON.parse(call.body));
    expect(gscRequests.length).toBeGreaterThan(0);
    for (const request of gscRequests) {
      expect(request.dataState).toBe("final");
    }
  });

  it("MM-R12 a GA4-only client gets only the GA4 section", async () => {
    const metrics = await build({ ga4PropertyId: GA4_PROPERTY_ID, gscSiteUrl: null });

    expect(metrics.ga4?.sessions.current).toBe(4820);
    expect(metrics.gsc).toBeNull();
    expect(callsTo(SEARCH_ANALYTICS_PREFIX)).toHaveLength(0);
  });

  it("MM-R12 a Search Console-only client gets only the Search Console section", async () => {
    const metrics = await build({ ga4PropertyId: null, gscSiteUrl: GSC_SITE_URL });

    expect(metrics.gsc?.clicks.current).toBe(1240);
    expect(metrics.ga4).toBeNull();
    expect(callsTo(RUN_REPORT_PREFIX)).toHaveLength(0);
  });

  it("MM-R12 a zero earlier month gives a null change", async () => {
    fake.emptyPeriods.add(PREVIOUS_PERIOD);
    const metrics = await build({ ga4PropertyId: GA4_PROPERTY_ID, gscSiteUrl: GSC_SITE_URL });

    expect(metrics.ga4?.sessions).toEqual({ current: 4820, previous: 0, changePercent: null });
    expect(metrics.gsc?.clicks).toEqual({ current: 1240, previous: 0, changePercent: null });
  });
});
