import type { Ga4Metrics, GscMetrics, MetricChange, ReportMetrics, TopRow } from "@monthmemo/contract";

import type { Ga4Report, GoogleClient, GscRow } from "../google/client";

const TOP_ROWS = 5;
const CURRENT_RANGE = "current";
const PREVIOUS_RANGE = "previous";
const GA4_METRICS = ["sessions", "totalUsers", "keyEvents"] as const;

// The client fields buildClientMetrics needs; a report covers whichever sources the client has.
export type MetricsClient = {
  id: string;
  name: string;
  ga4PropertyId: string | null;
  gscSiteUrl: string | null;
};

type MonthBounds = {
  startDate: string;
  endDate: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parsePeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return { year, month };
}

// The period is a calendar month in UTC, so the last day is day 0 of the next month.
function monthBounds(period: string): MonthBounds {
  const { year, month } = parsePeriod(period);
  return {
    startDate: isoDate(new Date(Date.UTC(year, month - 1, 1))),
    endDate: isoDate(new Date(Date.UTC(year, month, 0))),
  };
}

function previousPeriodOf(period: string) {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function change(current: number, previous: number): MetricChange {
  return {
    current,
    previous,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

function toNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lastDimensionValue(row: { dimensionValues?: Array<{ value: string }> }) {
  const values = row.dimensionValues ?? [];
  return values[values.length - 1]?.value ?? "";
}

// The fake and the real API both label the two requested ranges; the label is the last dimension value.
function rangeOf(row: { dimensionValues?: Array<{ value: string }> }) {
  return lastDimensionValue(row);
}

function ga4TotalsByRange(report: Ga4Report) {
  const totals = new Map<string, { sessions: number; users: number; keyEvents: number }>();

  for (const row of report.rows ?? []) {
    const [sessions, users, keyEvents] = row.metricValues ?? [];
    totals.set(rangeOf(row), {
      sessions: toNumber(sessions?.value),
      users: toNumber(users?.value),
      keyEvents: toNumber(keyEvents?.value),
    });
  }
  return totals;
}

function topGa4Rows({ report }: { report: Ga4Report }) {
  return (report.rows ?? [])
    .map((row) => {
      const dimensionValues = row.dimensionValues ?? [];
      return {
        label: dimensionValues[0]?.value ?? "",
        value: toNumber(row.metricValues?.[0]?.value),
      };
    })
    .sort((left, right) => {
      return right.value - left.value;
    })
    .slice(0, TOP_ROWS)
    .map(({ label, value }): TopRow => ({ label, value }));
}

async function readGa4({ google, propertyId, period }: { google: GoogleClient; propertyId: string; period: string }) {
  const current = monthBounds(period);
  const previous = monthBounds(previousPeriodOf(period));
  // Totals compare two ranges; the top lists use only the reported month, so the row limit is not shared with the earlier one.
  const dateRanges = [
    { ...current, name: CURRENT_RANGE },
    { ...previous, name: PREVIOUS_RANGE },
  ];
  const metrics = GA4_METRICS.map((name) => {
    return { name };
  });

  const [totals, channels, landingPages] = await Promise.all([
    google.runReport({ propertyId, request: { dateRanges, metrics } }),
    google.runReport({
      propertyId,
      request: {
        dateRanges: [{ ...current, name: CURRENT_RANGE }],
        metrics,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: TOP_ROWS,
      },
    }),
    google.runReport({
      propertyId,
      request: {
        dateRanges: [{ ...current, name: CURRENT_RANGE }],
        metrics,
        dimensions: [{ name: "landingPage" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: TOP_ROWS,
      },
    }),
  ]);

  const byRange = ga4TotalsByRange(totals);
  const currentTotals = byRange.get(CURRENT_RANGE) ?? { sessions: 0, users: 0, keyEvents: 0 };
  const previousTotals = byRange.get(PREVIOUS_RANGE) ?? { sessions: 0, users: 0, keyEvents: 0 };

  const ga4: Ga4Metrics = {
    sessions: change(currentTotals.sessions, previousTotals.sessions),
    users: change(currentTotals.users, previousTotals.users),
    keyEvents: change(currentTotals.keyEvents, previousTotals.keyEvents),
    topChannels: topGa4Rows({ report: channels }),
    topLandingPages: topGa4Rows({ report: landingPages }),
  };
  return ga4;
}

function toTopRows(rows: GscRow[] | undefined): TopRow[] {
  return (rows ?? []).slice(0, TOP_ROWS).map((row) => {
    return { label: row.keys?.[0] ?? "", value: row.clicks };
  });
}

async function readGscTotals({
  google,
  siteUrl,
  bounds,
}: {
  google: GoogleClient;
  siteUrl: string;
  bounds: MonthBounds;
}) {
  const answer = await google.querySearchAnalytics({
    siteUrl,
    request: { ...bounds, dataState: "final" },
  });
  const row = answer.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

async function readGsc({ google, siteUrl, period }: { google: GoogleClient; siteUrl: string; period: string }) {
  const current = monthBounds(period);
  const previous = monthBounds(previousPeriodOf(period));

  const [currentTotals, previousTotals, queries, pages] = await Promise.all([
    readGscTotals({ google, siteUrl, bounds: current }),
    readGscTotals({ google, siteUrl, bounds: previous }),
    google.querySearchAnalytics({
      siteUrl,
      request: { ...current, dimensions: ["query"], rowLimit: TOP_ROWS, dataState: "final" },
    }),
    google.querySearchAnalytics({
      siteUrl,
      request: { ...current, dimensions: ["page"], rowLimit: TOP_ROWS, dataState: "final" },
    }),
  ]);

  const gsc: GscMetrics = {
    clicks: change(currentTotals.clicks, previousTotals.clicks),
    impressions: change(currentTotals.impressions, previousTotals.impressions),
    ctr: change(currentTotals.ctr, previousTotals.ctr),
    position: change(currentTotals.position, previousTotals.position),
    topQueries: toTopRows(queries.rows),
    topPages: toTopRows(pages.rows),
  };
  return gsc;
}

export async function buildClientMetrics({
  google,
  client,
  period,
}: {
  google: GoogleClient;
  client: MetricsClient;
  period: string;
}): Promise<ReportMetrics> {
  const [ga4, gsc] = await Promise.all([
    client.ga4PropertyId ? readGa4({ google, propertyId: client.ga4PropertyId, period }) : Promise.resolve(null),
    client.gscSiteUrl ? readGsc({ google, siteUrl: client.gscSiteUrl, period }) : Promise.resolve(null),
  ]);

  return {
    period,
    previousPeriod: previousPeriodOf(period),
    ga4,
    gsc,
  };
}
