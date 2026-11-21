import type { FailureReason, Plan, ReportStatus } from "@monthmemo/contract";

import { newId } from "../ids";

export type RunnableAgency = {
  id: string;
  plan: Plan;
};

export type ClientIdRow = {
  id: string;
};

export type PendingReport = {
  id: string;
  agencyId: string;
  clientId: string;
  period: string;
  clientName: string;
  ga4PropertyId: string | null;
  gscSiteUrl: string | null;
  userId: string;
};

export type StatusCount = {
  status: ReportStatus;
  count: number;
};

export type FailedClient = {
  name: string;
  failureReason: FailureReason | null;
};

const PENDING_REPORTS_SQL = `SELECT reports.id, reports.agency_id AS agencyId, reports.client_id AS clientId,
    reports.period, clients.name AS clientName, clients.ga4_property_id AS ga4PropertyId,
    clients.gsc_site_url AS gscSiteUrl, agencies.user_id AS userId
  FROM reports
  JOIN clients ON clients.id = reports.client_id
  JOIN agencies ON agencies.id = reports.agency_id
  WHERE reports.status = 'pending'
  ORDER BY reports.created_at, reports.id
  LIMIT ?`;

export async function listRunnableAgencies({ db }: { db: D1Database }) {
  const { results } = await db
    .prepare("SELECT id, plan FROM agencies WHERE status IN ('trialing', 'active') ORDER BY created_at, id")
    .all<RunnableAgency>();
  return results ?? [];
}

// Clients past the plan limit stay, but only the first ones by creation order get a report (E15).
export async function listClientsWithinLimit({
  db,
  agencyId,
  limit,
}: {
  db: D1Database;
  agencyId: string;
  limit: number;
}) {
  const { results } = await db
    .prepare("SELECT id FROM clients WHERE agency_id = ? ORDER BY created_at, id LIMIT ?")
    .bind(agencyId, limit)
    .all<ClientIdRow>();
  return results ?? [];
}

export async function insertPendingReports({
  db,
  agencyId,
  period,
  clientIds,
  now,
}: {
  db: D1Database;
  agencyId: string;
  period: string;
  clientIds: string[];
  now: string;
}) {
  if (clientIds.length === 0) {
    return;
  }
  const insert = db.prepare(
    `INSERT INTO reports (id, agency_id, client_id, period, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT (client_id, period) DO NOTHING`,
  );
  await db.batch(
    clientIds.map((clientId) => {
      return insert.bind(newId(), agencyId, clientId, period, now, now);
    }),
  );
}

export async function listPendingReports({ db, limit }: { db: D1Database; limit: number }) {
  const { results } = await db.prepare(PENDING_REPORTS_SQL).bind(limit).all<PendingReport>();
  return results ?? [];
}

// The conditional update is the claim: one tick wins the row, every other tick sees zero changes (E8).
export async function claimReport({ db, id, now }: { db: D1Database; id: string; now: string }) {
  const result = await db
    .prepare("UPDATE reports SET status = 'building', updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markReportDraft({
  db,
  id,
  metricsJson,
  narrative,
  now,
}: {
  db: D1Database;
  id: string;
  metricsJson: string;
  narrative: string;
  now: string;
}) {
  await db
    .prepare(
      `UPDATE reports SET status = 'draft', metrics_json = ?, narrative = ?, updated_at = ?
       WHERE id = ? AND status = 'building'`,
    )
    .bind(metricsJson, narrative, now, id)
    .run();
}

export async function markReportFailed({
  db,
  id,
  reason,
  now,
}: {
  db: D1Database;
  id: string;
  reason: FailureReason;
  now: string;
}) {
  await db
    .prepare(
      `UPDATE reports SET status = 'failed', failure_reason = ?, updated_at = ?
       WHERE id = ? AND status = 'building'`,
    )
    .bind(reason, now, id)
    .run();
}

export async function releaseReport({ db, id, now }: { db: D1Database; id: string; now: string }) {
  await db
    .prepare("UPDATE reports SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'building'")
    .bind(now, id)
    .run();
}

export async function countReportsByStatus({
  db,
  agencyId,
  period,
}: {
  db: D1Database;
  agencyId: string;
  period: string;
}) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS count FROM reports WHERE agency_id = ? AND period = ? GROUP BY status")
    .bind(agencyId, period)
    .all<StatusCount>();
  return results ?? [];
}

export async function listFailedClients({
  db,
  agencyId,
  period,
}: {
  db: D1Database;
  agencyId: string;
  period: string;
}) {
  const { results } = await db
    .prepare(
      `SELECT clients.name, reports.failure_reason AS failureReason
       FROM reports
       JOIN clients ON clients.id = reports.client_id
       WHERE reports.agency_id = ? AND reports.period = ? AND reports.status = 'failed'
       ORDER BY clients.name, clients.id`,
    )
    .bind(agencyId, period)
    .all<FailedClient>();
  return results ?? [];
}

// One notice per agency, period and kind: the insert decides which caller sends the mail.
export async function claimAgencyNotice({
  db,
  agencyId,
  period,
  kind,
}: {
  db: D1Database;
  agencyId: string;
  period: string;
  kind: string;
}) {
  const result = await db
    .prepare("INSERT OR IGNORE INTO agency_notices (agency_id, period, kind) VALUES (?, ?, ?)")
    .bind(agencyId, period, kind)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function readAgencyOwnerEmail({ db, agencyId }: { db: D1Database; agencyId: string }) {
  const row = await db
    .prepare("SELECT users.email FROM agencies JOIN users ON users.id = agencies.user_id WHERE agencies.id = ?")
    .bind(agencyId)
    .first<{ email: string }>();
  return row?.email ?? null;
}

export async function seedReport({
  db,
  agencyId,
  clientId,
  period,
  status,
  failureReason,
  now,
}: {
  db: D1Database;
  agencyId: string;
  clientId: string;
  period: string;
  status: ReportStatus;
  failureReason: FailureReason | null;
  now: string;
}) {
  const row = await db
    .prepare(
      `INSERT INTO reports (id, agency_id, client_id, period, status, failure_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_id, period) DO UPDATE SET
         status = excluded.status,
         failure_reason = excluded.failure_reason,
         updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(newId(), agencyId, clientId, period, status, failureReason, now, now)
    .first<{ id: string }>();

  if (!row) {
    throw new Error("Could not seed the report");
  }
  return row.id;
}