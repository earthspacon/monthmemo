import { NARRATIVE_WORDS_MAX, type FailureReason, type ReportMetrics, type ReportStatus } from "@monthmemo/contract";

import type { Deps } from "../deps";
import { GoogleApiError } from "../google/client";
import { createGoogleClientFor, GoogleReconnectNeeded, refreshGoogleAccessTokenFor } from "../google/tokens";
import { countWords } from "../narrative/prompt";
import {
  claimAgencyNotice,
  claimReport,
  countReportsByStatus,
  listFailedClients,
  listPendingReports,
  markReportDraft,
  markReportFailed,
  readAgencyOwnerEmail,
  releaseReport,
  type PendingReport,
  type StatusCount,
} from "../repo/reports";
import { claimOwnerAlert, readDailyUsage, recordUsage } from "../repo/usage";
import { buildClientMetrics } from "./metrics";
import { processSendingReports } from "./send";

export const JOBS_CRON = "* * * * *";

const PENDING_BATCH = 10;
const NARRATIVE_ATTEMPTS = 2;
const CAP_ALERT_KIND = "llm_daily_cap";
const FAILED_NOTICE_KIND = "failed";
const READY_NOTICE_KIND = "ready";
const SOURCE_GONE_STATUSES = new Set([403, 404]);
const STALE_TOKEN_STATUS = 401;
const OPEN_STATUSES = new Set<ReportStatus>(["pending", "building"]);

const FAILURE_LABELS: Record<FailureReason, string> = {
  google_reconnect_needed: "Google access expired",
  source_not_found: "the Analytics property or Search Console site is unavailable",
  narrative_failed: "the summary could not be written",
  google_error: "Google returned an error",
};

// Claims up to 10 pending reports and turns each into a draft or a failed row without blocking the tick.
export async function processPendingReports({ deps }: { deps: Deps }) {
  const reports = await listPendingReports({ db: deps.db, limit: PENDING_BATCH });
  const touched = new Map<string, { agencyId: string; period: string }>();

  for (const report of reports) {
    touched.set(`${report.agencyId}|${report.period}`, { agencyId: report.agencyId, period: report.period });
    await processReport({ deps, report });
  }

  for (const { agencyId, period } of touched.values()) {
    await sendAgencyNotices({ deps, agencyId, period });
  }
  await processSendingReports({ deps });
}

async function processReport({ deps, report }: { deps: Deps; report: PendingReport }) {
  const day = deps.now().toISOString().slice(0, 10);
  const usage = await readDailyUsage({ db: deps.db, day, agencyId: report.agencyId });

  if (usage.globalUsd >= deps.budget.dailyCapUsd || usage.agencyUsd >= deps.budget.agencyDailyCapUsd) {
    await alertBudgetReached({ deps, day });
    return;
  }

  if (!(await claimReport({ db: deps.db, id: report.id, now: deps.now().toISOString() }))) {
    return;
  }

  try {
    const metrics = await loadMetricsOrRefresh({ deps, report });

    if (!metrics) {
      return;
    }
    const narrative = await writeNarrative({ deps, report, metrics, day });
    const now = deps.now().toISOString();

    if (narrative === null) {
      await markReportFailed({ db: deps.db, id: report.id, reason: "narrative_failed", now });
      return;
    }
    await markReportDraft({
      db: deps.db,
      id: report.id,
      metricsJson: JSON.stringify(metrics),
      narrative,
      now,
    });
  } catch (error) {
    await failOrRetry({ deps, report, error });
  }
}

// A token Google rejects before its stored expiry gets one forced refresh, then the metrics read runs again.
async function loadMetricsOrRefresh({ deps, report }: { deps: Deps; report: PendingReport }) {
  try {
    return await loadMetrics({ deps, report });
  } catch (error) {
    if (!isStaleToken(error)) {
      await failOrRetry({ deps, report, error });
      return null;
    }
    try {
      await refreshGoogleAccessTokenFor({ deps, userId: report.userId });
      return await loadMetrics({ deps, report });
    } catch (retryError) {
      await failOrRetry({ deps, report, error: retryError });
      return null;
    }
  }
}

async function loadMetrics({ deps, report }: { deps: Deps; report: PendingReport }) {
  const google = await createGoogleClientFor({ deps, userId: report.userId });
  return buildClientMetrics({
    google,
    client: {
      id: report.clientId,
      name: report.clientName,
      ga4PropertyId: report.ga4PropertyId,
      gscSiteUrl: report.gscSiteUrl,
    },
    period: report.period,
  });
}

function isStaleToken(error: unknown) {
  return error instanceof GoogleApiError && error.status === STALE_TOKEN_STATUS;
}

async function failOrRetry({ deps, report, error }: { deps: Deps; report: PendingReport; error: unknown }) {
  const now = deps.now().toISOString();

  if (error instanceof GoogleReconnectNeeded) {
    await markReportFailed({ db: deps.db, id: report.id, reason: "google_reconnect_needed", now });
    return;
  }
  if (error instanceof GoogleApiError && SOURCE_GONE_STATUSES.has(error.status)) {
    await markReportFailed({ db: deps.db, id: report.id, reason: "source_not_found", now });
    return;
  }
  // A transient Google or model error keeps the report pending for the next tick.
  console.error("Report build failed", error instanceof Error ? error.name : "unknown");
  await releaseReport({ db: deps.db, id: report.id, now });
}

async function writeNarrative({
  deps,
  report,
  metrics,
  day,
}: {
  deps: Deps;
  report: PendingReport;
  metrics: ReportMetrics;
  day: string;
}) {
  for (let attempt = 0; attempt < NARRATIVE_ATTEMPTS; attempt += 1) {
    const written = await deps.narrative.write({
      metrics,
      clientName: report.clientName,
      period: report.period,
    });
    await recordUsage({ db: deps.db, day, agencyId: report.agencyId, costUsd: written.costUsd });
    const words = countWords(written.text);

    if (words > 0 && words <= NARRATIVE_WORDS_MAX) {
      return written.text;
    }
  }
  return null;
}

async function alertBudgetReached({ deps, day }: { deps: Deps; day: string }) {
  if (!(await claimOwnerAlert({ db: deps.db, kind: CAP_ALERT_KIND, day }))) {
    return;
  }
  await deps.budget.alertOwner({
    subject: "MonthMemo paused report writing: daily AI budget reached",
    text: `The daily AI budget was reached on ${day}. Pending client reports will resume when the cap resets.`,
  });
}

// Once the agency's period settles, one failure mail and one ready mail at most (E6: all failed means one mail).
async function sendAgencyNotices({ deps, agencyId, period }: { deps: Deps; agencyId: string; period: string }) {
  const counts = await countReportsByStatus({ db: deps.db, agencyId, period });
  const hasOpen = counts.some((row) => {
    return OPEN_STATUSES.has(row.status);
  });

  if (hasOpen) {
    return;
  }
  if (countOf({ counts, status: "failed" }) > 0) {
    await sendFailureNotice({ deps, agencyId, period });
  }
  const drafts = countOf({ counts, status: "draft" });

  if (drafts > 0) {
    await sendReadyNotice({ deps, agencyId, period, count: drafts });
  }
}

async function sendFailureNotice({
  deps,
  agencyId,
  period,
}: {
  deps: Deps;
  agencyId: string;
  period: string;
}) {
  if (!(await claimAgencyNotice({ db: deps.db, agencyId, period, kind: FAILED_NOTICE_KIND }))) {
    return;
  }
  const to = await readAgencyOwnerEmail({ db: deps.db, agencyId });

  if (!to) {
    return;
  }
  const clients = await listFailedClients({ db: deps.db, agencyId, period });
  const lines = clients.map((client) => {
    return `- ${client.name}: ${labelFor(client.failureReason)}`;
  });
  await deps.mailer.send({
    to,
    subject: `${clients.length} client ${plural({ count: clients.length, one: "report" })} could not be built for ${period}`,
    text: `These reports for ${period} could not be built:\n\n${lines.join("\n")}\n\nOpen ${deps.env.APP_URL}/app/connect to check Google access or reconnect.`,
  });
}

async function sendReadyNotice({
  deps,
  agencyId,
  period,
  count,
}: {
  deps: Deps;
  agencyId: string;
  period: string;
  count: number;
}) {
  if (!(await claimAgencyNotice({ db: deps.db, agencyId, period, kind: READY_NOTICE_KIND }))) {
    return;
  }
  const to = await readAgencyOwnerEmail({ db: deps.db, agencyId });

  if (!to) {
    return;
  }
  const subject = `${count} client ${plural({ count, one: "report" })} ${count === 1 ? "is" : "are"} ready to review`;
  await deps.mailer.send({
    to,
    subject,
    text: `${subject} for ${period}.\n\nReview them at ${deps.env.APP_URL}/app/reports.`,
  });
}

function countOf({ counts, status }: { counts: StatusCount[]; status: ReportStatus }) {
  return counts.find((row) => {
    return row.status === status;
  })?.count ?? 0;
}

function labelFor(reason: FailureReason | null) {
  return reason ? FAILURE_LABELS[reason] : "an unknown error";
}

function plural({ count, one }: { count: number; one: string }) {
  return count === 1 ? one : `${one}s`;
}