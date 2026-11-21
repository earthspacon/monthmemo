import { NARRATIVE_WORDS_MAX } from "@monthmemo/contract";

import type { Deps } from "../deps";
import { createGoogleClientFor } from "../google/tokens";
import { countWords } from "../narrative/prompt";
import { claimOwnerAlert, readDailyUsage, recordUsage } from "../repo/usage";
import { buildClientMetrics } from "./metrics";

export const JOBS_CRON = "* * * * *";
const PENDING_BATCH = 10;
const NARRATIVE_ATTEMPTS = 2;
const CAP_ALERT_KIND = "llm_daily_cap";

type PendingReport = {
  id: string;
  agencyId: string;
  clientId: string;
  period: string;
  clientName: string;
  ga4PropertyId: string | null;
  gscSiteUrl: string | null;
  userId: string;
};

const PENDING_REPORTS_SQL = `SELECT reports.id, reports.agency_id AS agencyId, reports.client_id AS clientId,
    reports.period, clients.name AS clientName, clients.ga4_property_id AS ga4PropertyId,
    clients.gsc_site_url AS gscSiteUrl, agencies.user_id AS userId
  FROM reports
  JOIN clients ON clients.id = reports.client_id
  JOIN agencies ON agencies.id = reports.agency_id
  WHERE reports.status = 'pending'
  ORDER BY reports.created_at
  LIMIT ?`;

// Claims up to 10 pending reports and turns each into a draft (or failed narrative) without blocking the tick.
export async function processPendingReports({ deps }: { deps: Deps }) {
  const { results } = await deps.db.prepare(PENDING_REPORTS_SQL).bind(PENDING_BATCH).all<PendingReport>();

  for (const report of results ?? []) {
    await processReport({ deps, report });
  }
}

async function processReport({ deps, report }: { deps: Deps; report: PendingReport }) {
  const day = deps.now().toISOString().slice(0, 10);
  const usage = await readDailyUsage({ db: deps.db, day, agencyId: report.agencyId });

  if (usage.globalUsd >= deps.budget.dailyCapUsd || usage.agencyUsd >= deps.budget.agencyDailyCapUsd) {
    if (await claimOwnerAlert({ db: deps.db, kind: CAP_ALERT_KIND, day })) {
      await deps.budget.alertOwner({
        subject: "MonthMemo paused report writing: daily AI budget reached",
        text: `The daily AI budget was reached on ${day}. Pending client reports will resume when the cap resets.`,
      });
    }
    return;
  }

  const claim = await deps.db
    .prepare("UPDATE reports SET status = 'building', updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(deps.now().toISOString(), report.id)
    .run();

  if ((claim.meta.changes ?? 0) === 0) {
    return;
  }

  try {
    const google = await createGoogleClientFor({ deps, userId: report.userId });
    const metrics = await buildClientMetrics({
      google,
      client: {
        id: report.clientId,
        name: report.clientName,
        ga4PropertyId: report.ga4PropertyId,
        gscSiteUrl: report.gscSiteUrl,
      },
      period: report.period,
    });
    const narrative = await writeNarrative({ deps, report, metrics, day });

    if (narrative === null) {
      await deps.db
        .prepare(
          "UPDATE reports SET status = 'failed', failure_reason = 'narrative_failed', updated_at = ? WHERE id = ? AND status = 'building'",
        )
        .bind(deps.now().toISOString(), report.id)
        .run();
      return;
    }

    await deps.db
      .prepare(
        `UPDATE reports SET status = 'draft', metrics_json = ?, narrative = ?, updated_at = ?
         WHERE id = ? AND status = 'building'`,
      )
      .bind(JSON.stringify(metrics), narrative, deps.now().toISOString(), report.id)
      .run();
  } catch (error) {
    // A Google or model failure without a report reason stays pending for the next tick.
    console.error("Report build failed", error instanceof Error ? error.name : "unknown");
    await deps.db
      .prepare("UPDATE reports SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'building'")
      .bind(deps.now().toISOString(), report.id)
      .run();
  }
}

async function writeNarrative({
  deps,
  report,
  metrics,
  day,
}: {
  deps: Deps;
  report: PendingReport;
  metrics: Awaited<ReturnType<typeof buildClientMetrics>>;
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