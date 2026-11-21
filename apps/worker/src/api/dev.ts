import { PLANS, type AgencyStatus, type FailureReason, type Plan, type ReportStatus } from "@monthmemo/contract";

import { createAuth } from "../auth";
import { GA4_SCOPE, GSC_SCOPE } from "../google/client";
import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { newId } from "../ids";
import { createAgency, getAgencyByUserId, setGoogleNeedsReconnect } from "../repo/agencies";
import { seedReport } from "../repo/reports";
import { JOBS_CRON, processPendingReports } from "../reports/jobs";
import { MONTHLY_RUN_CRON, runMonthlyReports } from "../reports/run";
import type { PublicContext } from "./context";

const EMAIL_MAX_LENGTH = 254;
const OUTBOX_LIMIT = 20;
const ID_MAX_LENGTH = 64;
const CRON_MAX_LENGTH = 40;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const STATUSES: AgencyStatus[] = ["trialing", "active", "past_due", "canceled", "expired"];
const REPORT_STATUSES: ReportStatus[] = [
  "pending",
  "building",
  "draft",
  "failed",
  "sending",
  "sent",
  "send_failed",
  "skipped",
];
const FAILURE_REASONS: FailureReason[] = [
  "narrative_failed",
  "google_reconnect_needed",
  "source_not_found",
  "google_error",
];
const COOKIE_SIGNATURE_BYTES_HASH = { name: "HMAC", hash: "SHA-256" };
const BASIC_SCOPES = ["openid", "email", "profile"];
// The fake Google client never sends it anywhere; it only marks the identity as able to refresh.
const DEV_REFRESH_TOKEN = "dev-refresh-token";

function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && value in PLANS;
}

function isStatus(value: unknown): value is AgencyStatus {
  return typeof value === "string" && STATUSES.some((status) => status === value);
}

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && REPORT_STATUSES.some((status) => status === value);
}

function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === "string" && FAILURE_REASONS.some((reason) => reason === value);
}

async function signCookieValue({ value, secret }: { value: string; secret: string }) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    COOKIE_SIGNATURE_BYTES_HASH,
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(COOKIE_SIGNATURE_BYTES_HASH.name, key, new TextEncoder().encode(value));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${encoded}`);
}

async function ensureUser({ db, email, now }: { db: D1Database; email: string; now: Date }) {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (email) DO UPDATE SET updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(newId(), email.split("@")[0], email, at, at)
    .first<{ id: string }>();

  if (!row) {
    throw new Error("Could not create the user");
  }
  return row.id;
}

function readFlag({ data, key, fallback }: { data: Record<string, unknown>; key: string; fallback: boolean }) {
  const value = data[key];

  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new HttpError(400, "invalid_field", `"${key}" must be true or false`);
  }
  return value;
}

async function upsertGoogleIdentity({
  db,
  userId,
  scope,
  now,
}: {
  db: D1Database;
  userId: string;
  scope: string;
  now: Date;
}) {
  const at = now.toISOString();
  const updated = await db
    .prepare(
      "UPDATE auth_identities SET scope = ?, refresh_token = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'google'",
    )
    .bind(scope, DEV_REFRESH_TOKEN, at, userId)
    .run();

  if (updated.meta.changes > 0) {
    return;
  }
  await db
    .prepare(
      `INSERT INTO auth_identities (id, provider_account_id, provider_id, user_id, refresh_token, scope, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), `dev-${userId}`, userId, DEV_REFRESH_TOKEN, scope, at, at)
    .run();
}

// Dev-only: signs a browser in as an agency without Google. Calling it again keeps the agency and sets plan/status.
export const devRoutes: Route<PublicContext>[] = [
  route("POST", "/dev/session", async ({ deps, request }) => {
    const data = await readJson(request);
    const email = readString({ data, key: "email", maxLength: EMAIL_MAX_LENGTH }).trim().toLowerCase();
    const plan = isPlan(data.plan) ? data.plan : undefined;
    const status = isStatus(data.status) ? data.status : undefined;
    const now = deps.now();

    if (!email.includes("@")) {
      throw new HttpError(400, "invalid_field", '"email" must be an email address');
    }

    const userId = await ensureUser({ db: deps.db, email, now });
    await createAgency({ db: deps.db, userId, email, name: email.split("@")[0], now });
    await deps.db
      .prepare(
        "UPDATE agencies SET plan = COALESCE(?, plan), status = COALESCE(?, status), updated_at = ? WHERE user_id = ?",
      )
      .bind(plan ?? null, status ?? null, now.toISOString(), userId)
      .run();

    const context = await createAuth(deps.env).$context;
    const session = await context.internalAdapter.createSession(userId);
    const cookie = context.authCookies.sessionToken;
    const signed = await signCookieValue({ value: session.token, secret: deps.env.BETTER_AUTH_SECRET });
    const response = json({ userId, email }, 201);
    response.headers.append(
      "set-cookie",
      `${cookie.name}=${signed}; Path=/; Max-Age=${cookie.attributes.maxAge ?? 2592000}; HttpOnly; SameSite=Lax`,
    );
    return response;
  }),

  // Dev-only: the signed-in agency's Google grant (which scopes, revoked or not) without a trip to Google.
  route("POST", "/dev/google", async ({ deps, request }) => {
    const data = await readJson(request);
    const session = await createAuth(deps.env).api.getSession({ headers: request.headers });

    if (!session) {
      throw new HttpError(401, "unauthorized", "Sign in first");
    }
    const ga4 = readFlag({ data, key: "ga4", fallback: true });
    const gsc = readFlag({ data, key: "gsc", fallback: true });
    const needsReconnect = readFlag({ data, key: "needsReconnect", fallback: false });
    const scopes = [...BASIC_SCOPES, ...(ga4 ? [GA4_SCOPE] : []), ...(gsc ? [GSC_SCOPE] : [])];
    const now = deps.now();

    await upsertGoogleIdentity({ db: deps.db, userId: session.user.id, scope: scopes.join(" "), now });
    await setGoogleNeedsReconnect({ db: deps.db, userId: session.user.id, needsReconnect, now });
    return json({ ga4, gsc, needsReconnect });
  }),

  // Dev-only: seeds one report for the signed-in agency, the state every reports test starts from.
  route("POST", "/dev/reports", async ({ deps, request }) => {
    const session = await createAuth(deps.env).api.getSession({ headers: request.headers });

    if (!session) {
      throw new HttpError(401, "unauthorized", "Sign in first");
    }
    const agency = await getAgencyByUserId({ db: deps.db, userId: session.user.id });

    if (!agency) {
      throw new HttpError(403, "no_agency", "This user has no agency");
    }
    const data = await readJson(request);
    const clientId = readString({ data, key: "clientId", maxLength: ID_MAX_LENGTH });
    const period = readString({ data, key: "period", maxLength: 7 });
    const status = data.status;

    if (!isReportStatus(status)) {
      throw new HttpError(400, "invalid_field", `"status" must be a report status`);
    }
    if (data.failureReason !== undefined && data.failureReason !== null && !isFailureReason(data.failureReason)) {
      throw new HttpError(400, "invalid_field", `"failureReason" must be a failure reason`);
    }
    if (!PERIOD_PATTERN.test(period)) {
      throw new HttpError(400, "invalid_field", `"period" must be YYYY-MM`);
    }
    const client = await deps.db
      .prepare("SELECT agency_id AS agencyId FROM clients WHERE id = ?")
      .bind(clientId)
      .first<{ agencyId: string }>();

    if (!client || client.agencyId !== agency.id) {
      throw new HttpError(404, "not_found", "Not found");
    }
    const id = await seedReport({
      db: deps.db,
      agencyId: agency.id,
      clientId,
      period,
      status,
      failureReason: isFailureReason(data.failureReason) ? data.failureReason : null,
      now: deps.now().toISOString(),
    });
    return json({ id });
  }),

  // Dev-only: fires one scheduled cron now, so a browser test does not wait for the minute or the 4th.
  route("POST", "/dev/run", async ({ deps, request }) => {
    const data = await readJson(request);
    const cron = readString({ data, key: "cron", maxLength: CRON_MAX_LENGTH });

    if (cron === MONTHLY_RUN_CRON) {
      const result = await runMonthlyReports({ deps, scheduledTime: deps.now().getTime() });
      return json({ cron, period: result.period });
    }
    if (cron === JOBS_CRON) {
      await processPendingReports({ deps });
      return json({ cron });
    }
    throw new HttpError(400, "invalid_field", `"cron" must be a scheduled cron`);
  }),

  route("GET", "/dev/outbox", async ({ deps, request }) => {
    const to = new URL(request.url).searchParams.get("to") ?? "";
    const { results } = await deps.db
      .prepare(
        'SELECT to_address AS "to", subject, body, html, created_at AS createdAt FROM dev_outbox WHERE to_address = ? ORDER BY id DESC LIMIT ?',
      )
      .bind(to.toLowerCase(), OUTBOX_LIMIT)
      .all();
    return json(results);
  }),
];
