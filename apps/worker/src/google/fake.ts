import accountSummaries from "../../fixtures/google/account-summaries.json";
import ga4RunReport from "../../fixtures/google/ga4-run-report.json";
import gscQuery from "../../fixtures/google/gsc-query.json";
import sites from "../../fixtures/google/sites.json";
import type { Ga4Report, GoogleClient, GscQueryResult } from "./client";

const TOTALS = "totals";

// The month before `now` (UTC, YYYY-MM): the newest month a report covers.
function lastFullMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

// Local runs and the browser tests read Google from the fixtures, so no real Google account is needed.
export function createFakeGoogleClient({ now }: { now: Date }): GoogleClient {
  return {
    listAccountSummaries: async () => {
      return accountSummaries.accountSummaries;
    },
    listSites: async () => {
      return sites.siteEntry;
    },
    runReport: async ({ request }) => {
      const reports: Record<string, Ga4Report> = ga4RunReport;
      const report = reports[request.dimensions?.[0]?.name ?? TOTALS] ?? { rows: [] };
      return { ...report, rows: (report.rows ?? []).slice(0, request.limit) };
    },
    querySearchAnalytics: async ({ request }) => {
      const month = request.startDate.slice(0, 7) >= lastFullMonth(now) ? gscQuery.current : gscQuery.previous;
      const answers: Record<string, GscQueryResult> = month;
      const answer = answers[request.dimensions?.[0] ?? TOTALS] ?? { rows: [] };
      return { rows: (answer.rows ?? []).slice(0, request.rowLimit) };
    },
  };
}
