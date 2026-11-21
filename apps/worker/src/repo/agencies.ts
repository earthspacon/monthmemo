import { PLANS, TRIAL_DAYS, type AgencyStatus, type Plan } from "@monthmemo/contract";

import { newId } from "../ids";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_DAY = 4;
const RUN_HOUR_UTC = 6;
const TRIAL_AFTER_FIRST_RUN_DAYS = 3;
const DEFAULT_ACCENT = "#2563eb";

export type AgencyRow = {
  id: string;
  userId: string;
  plan: Plan;
  status: AgencyStatus;
  trialEndsAt: string | null;
  displayName: string;
};

function nextRunAfter(from: Date) {
  const thisMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), RUN_DAY, RUN_HOUR_UTC));
  if (thisMonth.getTime() > from.getTime()) {
    return thisMonth;
  }
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, RUN_DAY, RUN_HOUR_UTC));
}

// A free first month must contain one real report cycle.
export function trialEndsAt(signedUpAt: Date) {
  const byLength = signedUpAt.getTime() + TRIAL_DAYS * DAY_MS;
  const byFirstRun = nextRunAfter(signedUpAt).getTime() + TRIAL_AFTER_FIRST_RUN_DAYS * DAY_MS;
  return new Date(Math.max(byLength, byFirstRun));
}

export async function createAgency({
  db,
  userId,
  email,
  name,
  now,
  plan = "starter",
  status = "trialing",
}: {
  db: D1Database;
  userId: string;
  email: string;
  name: string;
  now: Date;
  plan?: Plan;
  status?: AgencyStatus;
}) {
  const at = now.toISOString();
  const id = newId();
  await db
    .prepare(
      `INSERT INTO agencies (id, user_id, plan, status, trial_ends_at, display_name, accent_color, reply_to, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT (user_id) DO NOTHING`,
    )
    .bind(id, userId, plan, status, trialEndsAt(now).toISOString(), name.trim() || email, DEFAULT_ACCENT, email, at)
    .run();
  return id;
}

export async function getAgencyByUserId({ db, userId }: { db: D1Database; userId: string }) {
  return db
    .prepare(
      `SELECT id, user_id AS userId, plan, status, trial_ends_at AS trialEndsAt, display_name AS displayName
       FROM agencies WHERE user_id = ?`,
    )
    .bind(userId)
    .first<AgencyRow>();
}

export async function countClients({ db, agencyId }: { db: D1Database; agencyId: string }) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM clients WHERE agency_id = ?")
    .bind(agencyId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export function clientLimitOf(plan: Plan) {
  return PLANS[plan].clientLimit;
}
