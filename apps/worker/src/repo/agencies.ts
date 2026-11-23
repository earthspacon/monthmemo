import { TRIAL_DAYS, type AgencyStatus, type BrandDto } from "@monthmemo/contract";

import { newId } from "../ids";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_DAY = 4;
const RUN_HOUR_UTC = 6;
const TRIAL_AFTER_FIRST_RUN_DAYS = 3;
const DEFAULT_ACCENT = "#2563eb";

export type AgencyRow = {
  id: string;
  userId: string;
  status: AgencyStatus;
  trialEndsAt: string | null;
  displayName: string;
  googleNeedsReconnect: boolean;
};

export function nextRunAfter(from: Date) {
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
  status = "trialing",
}: {
  db: D1Database;
  userId: string;
  email: string;
  name: string;
  now: Date;
  status?: AgencyStatus;
}) {
  const at = now.toISOString();
  const id = newId();
  await db
    .prepare(
      `INSERT INTO agencies (id, user_id, status, trial_ends_at, display_name, accent_color, reply_to, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT (user_id) DO NOTHING`,
    )
    .bind(id, userId, status, trialEndsAt(now).toISOString(), name.trim() || email, DEFAULT_ACCENT, email, at)
    .run();
  return id;
}

export async function getAgencyByUserId({ db, userId }: { db: D1Database; userId: string }) {
  const row = await db
    .prepare(
      `SELECT id, user_id AS userId, status, trial_ends_at AS trialEndsAt, display_name AS displayName,
         google_needs_reconnect AS googleNeedsReconnect
       FROM agencies WHERE user_id = ?`,
    )
    .bind(userId)
    .first<Omit<AgencyRow, "googleNeedsReconnect"> & { googleNeedsReconnect: number }>();

  if (!row) {
    return null;
  }
  return { ...row, googleNeedsReconnect: row.googleNeedsReconnect === 1 };
}

export async function setGoogleNeedsReconnect({
  db,
  userId,
  needsReconnect,
  now,
}: {
  db: D1Database;
  userId: string;
  needsReconnect: boolean;
  now: Date;
}) {
  await db
    .prepare("UPDATE agencies SET google_needs_reconnect = ?, updated_at = ? WHERE user_id = ?")
    .bind(needsReconnect ? 1 : 0, now.toISOString(), userId)
    .run();
}

export async function countClients({ db, agencyId }: { db: D1Database; agencyId: string }) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM clients WHERE agency_id = ?")
    .bind(agencyId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getBrand({ db, agencyId }: { db: D1Database; agencyId: string }) {
  return db
    .prepare(
      `SELECT display_name AS displayName, accent_color AS accentColor, logo_url AS logoUrl, reply_to AS replyTo
       FROM agencies WHERE id = ?`,
    )
    .bind(agencyId)
    .first<BrandDto>();
}

export async function updateBrand({
  db,
  agencyId,
  brand,
  now,
}: {
  db: D1Database;
  agencyId: string;
  brand: BrandDto;
  now: Date;
}) {
  await db
    .prepare(
      `UPDATE agencies SET display_name = ?, accent_color = ?, logo_url = ?, reply_to = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(brand.displayName, brand.accentColor, brand.logoUrl, brand.replyTo, now.toISOString(), agencyId)
    .run();
}

export type BillingRow = {
  id: string;
  status: AgencyStatus;
  trialEndsAt: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
};

const BILLING_COLUMNS = `id, status, trial_ends_at AS trialEndsAt, paddle_customer_id AS paddleCustomerId,
  paddle_subscription_id AS paddleSubscriptionId`;

export async function getBillingRow({ db, agencyId }: { db: D1Database; agencyId: string }) {
  return db.prepare(`SELECT ${BILLING_COLUMNS} FROM agencies WHERE id = ?`).bind(agencyId).first<BillingRow>();
}

export async function findBillingRowBySubscription({ db, subscriptionId }: { db: D1Database; subscriptionId: string }) {
  return db
    .prepare(`SELECT ${BILLING_COLUMNS} FROM agencies WHERE paddle_subscription_id = ?`)
    .bind(subscriptionId)
    .first<BillingRow>();
}

export async function saveSubscription({
  db,
  agencyId,
  status,
  customerId,
  subscriptionId,
  now,
}: {
  db: D1Database;
  agencyId: string;
  status: AgencyStatus;
  customerId: string | null;
  subscriptionId: string;
  now: Date;
}) {
  await db
    .prepare(
      `UPDATE agencies SET status = ?, paddle_customer_id = COALESCE(?, paddle_customer_id),
         paddle_subscription_id = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(status, customerId, subscriptionId, now.toISOString(), agencyId)
    .run();
}

export async function expireTrials({ db, now }: { db: D1Database; now: Date }) {
  const result = await db
    .prepare(
      `UPDATE agencies SET status = 'expired', updated_at = ?1
       WHERE status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= ?1`,
    )
    .bind(now.toISOString())
    .run();
  return result.meta.changes ?? 0;
}
