import type { AgencyStatus, ReportMetrics, ReportStatus } from "@monthmemo/contract";
import { createExecutionContext, createScheduledController, env, SELF, waitOnExecutionContext } from "cloudflare:test";

import type { Env } from "../src/env";
import { BASIC_SCOPE, fake, FULL_SCOPE, type GoogleProfile, TEST_ACCESS_TOKEN, TURNSTILE_TEST_TOKEN } from "./fakes";

export const BASE = "http://localhost:8787";
export const db = env.DB;

// Production has this one trigger; the Worker picks the hourly and monthly jobs from the tick time.
export const EVERY_MINUTE_CRON = "* * * * *";
// A tick that is not at the top of an hour runs only the minute job.
const PLAIN_TICK = new Date("2026-01-10T12:01:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;
const UNSUBSCRIBE_TOKEN_BYTES = 16;

export const GA4_PROPERTY_ID = "310000001";
export const GA4_PROPERTY_NAME = "Example Bakery - GA4";
export const SECOND_GA4_PROPERTY_ID = "310000002";
export const GSC_SITE_URL = "https://examplebakery.com/";
export const SECOND_GSC_SITE_URL = "sc-domain:northsidedental.com";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@agency.example`;
}

// Every auth write is rate limited per IP, so each sign-in comes from its own address.
export function uniqueIp() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

export function googleProfile({ email = uniqueEmail("owner"), name = "Riley Agency" } = {}): GoogleProfile {
  return {
    sub: `google-${crypto.randomUUID()}`,
    email,
    name,
    email_verified: true,
  };
}

export function cookiePairs(response: Response) {
  return response.headers.getSetCookie().map((value) => {
    return value.split(";")[0];
  });
}

export function joinCookies(...groups: string[][]) {
  return groups.flat().join("; ");
}

export function readSessionCookie(response: Response) {
  const pair = cookiePairs(response).find((value) => {
    return value.includes("session_token=");
  });

  if (!pair) {
    throw new Error(`No session cookie (status ${response.status})`);
  }
  return pair;
}

export function startSignIn({
  turnstileToken = TURNSTILE_TEST_TOKEN,
  ip = uniqueIp(),
}: { turnstileToken?: string | null; ip?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip });

  if (turnstileToken !== null) {
    headers.set("x-turnstile-token", turnstileToken);
  }
  return SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
    method: "POST",
    headers,
    body: JSON.stringify({ provider: "google", callbackURL: "/app", errorCallbackURL: "/sign-in" }),
  });
}

async function readRedirectUrl(response: Response) {
  if (response.status !== 200) {
    throw new Error(`Expected an authorize URL, got status ${response.status}`);
  }
  const { url } = await response.json<{ url: string }>();
  return new URL(url);
}

// The whole Google sign-in: start (Turnstile passed), Google answers the code with `profile`, the callback signs in.
export async function signInWithGoogle({ profile = googleProfile() }: { profile?: GoogleProfile } = {}) {
  const started = await startSignIn();
  const authorizeUrl = await readRedirectUrl(started);
  fake.nextGrant = { profile, scope: BASIC_SCOPE, refreshToken: null };

  const callback = await SELF.fetch(
    `${BASE}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(authorizeUrl.searchParams.get("state") ?? "")}`,
    { headers: { cookie: joinCookies(cookiePairs(started)) }, redirect: "manual" },
  );
  return {
    profile,
    callback,
    cookie: readSessionCookie(callback),
  };
}

export async function startConnect(cookie: string) {
  return SELF.fetch(`${BASE}/api/google/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, cookie },
    body: "{}",
  });
}

// Connect step: Google grants `scope` (both data scopes by default) and a refresh token for the same Google user.
export async function connectGoogle({
  cookie,
  profile,
  scope = FULL_SCOPE,
  refreshToken = `1//refresh-${crypto.randomUUID()}`,
}: {
  cookie: string;
  profile: GoogleProfile;
  scope?: string;
  refreshToken?: string | null;
}) {
  const started = await startConnect(cookie);
  const authorizeUrl = await readRedirectUrl(started);
  fake.nextGrant = { profile, scope, refreshToken };

  const callback = await SELF.fetch(
    `${BASE}/api/auth/callback/google?code=test-connect-code&state=${encodeURIComponent(authorizeUrl.searchParams.get("state") ?? "")}`,
    { headers: { cookie: joinCookies([cookie], cookiePairs(started)) }, redirect: "manual" },
  );
  return {
    authorizeUrl,
    callback,
    refreshToken,
  };
}

export async function agencyIdOf(email: string) {
  const row = await db
    .prepare("SELECT agencies.id FROM agencies JOIN users ON users.id = agencies.user_id WHERE users.email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!row) {
    throw new Error(`No agency for ${email}`);
  }
  return row.id;
}

// A signed-in agency with Google connected (both scopes unless told otherwise).
export async function createConnectedAgency({ scope = FULL_SCOPE }: { scope?: string } = {}) {
  const { profile, cookie } = await signInWithGoogle();
  const { refreshToken } = await connectGoogle({ cookie, profile, scope });
  return {
    profile,
    cookie,
    refreshToken,
    agencyId: await agencyIdOf(profile.email),
  };
}

// Makes the stored Google access token of this user expired, so the next Google call must refresh it first.
export async function expireAccessToken(email: string) {
  await db
    .prepare(
      "UPDATE auth_identities SET access_token_expires_at = ? WHERE provider_id = 'google' AND user_id = (SELECT id FROM users WHERE email = ?)",
    )
    .bind(new Date(Date.now() - 60_000).toISOString(), email)
    .run();
  fake.staleAccessTokens = new Set(
    [...fake.issuedAccessTokens].filter((token) => {
      return token !== TEST_ACCESS_TOKEN;
    }),
  );
}

export async function clearRunState() {
  await db.batch([
    db.prepare("DELETE FROM reports"),
    db.prepare("DELETE FROM agency_notices"),
    db.prepare("DELETE FROM llm_usage"),
    db.prepare("DELETE FROM owner_alerts"),
  ]);
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function setAgency({
  agencyId,
  status,
  trialEndsAt,
}: {
  agencyId: string;
  status?: AgencyStatus;
  trialEndsAt?: string;
}) {
  if (status) {
    await db.prepare("UPDATE agencies SET status = ? WHERE id = ?").bind(status, agencyId).run();
  }
  if (trialEndsAt) {
    await db.prepare("UPDATE agencies SET trial_ends_at = ? WHERE id = ?").bind(trialEndsAt, agencyId).run();
  }
}

// An agency row without a Google login, for cron tests that never call Google.
export async function seedAgency({
  status = "trialing",
  email = uniqueEmail("seeded"),
}: { status?: AgencyStatus; email?: string } = {}) {
  const userId = crypto.randomUUID();
  const agencyId = crypto.randomUUID();
  const at = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 30 * DAY_MS).toISOString();

  await db
    .prepare("INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
    .bind(userId, "Seeded Agency", email, at, at)
    .run();
  await db
    .prepare(
      `INSERT INTO agencies (id, user_id, status, trial_ends_at, display_name, accent_color, reply_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Seeded Agency', '#2563eb', ?, ?, ?)`,
    )
    .bind(agencyId, userId, status, trialEndsAt, email, at, at)
    .run();
  return { agencyId, userId, email };
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(UNSUBSCRIBE_TOKEN_BYTES));
  return [...bytes]
    .map((byte) => {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

export async function seedClient({
  agencyId,
  name = "Example Bakery",
  ga4PropertyId = GA4_PROPERTY_ID,
  gscSiteUrl = GSC_SITE_URL,
  recipients = [uniqueEmail("client")],
  createdAt = new Date().toISOString(),
}: {
  agencyId: string;
  name?: string;
  ga4PropertyId?: string | null;
  gscSiteUrl?: string | null;
  recipients?: string[];
  createdAt?: string;
}) {
  const clientId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO clients (id, agency_id, name, ga4_property_id, ga4_property_name, gsc_site_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(clientId, agencyId, name, ga4PropertyId, ga4PropertyId ? GA4_PROPERTY_NAME : null, gscSiteUrl, createdAt)
    .run();
  const seeded: Array<{ id: string; email: string; token: string }> = [];

  for (const email of recipients) {
    const recipient = { id: crypto.randomUUID(), email, token: randomToken() };
    await db
      .prepare("INSERT INTO recipients (id, client_id, email, unsubscribe_token) VALUES (?, ?, ?, ?)")
      .bind(recipient.id, clientId, recipient.email, recipient.token)
      .run();
    seeded.push(recipient);
  }
  return { clientId, recipients: seeded };
}

export async function seedReport({
  agencyId,
  clientId,
  period,
  status,
  metrics = SAMPLE_METRICS,
  narrative = SAMPLE_NARRATIVE,
  attempts = 0,
}: {
  agencyId: string;
  clientId: string;
  period: string;
  status: ReportStatus;
  metrics?: ReportMetrics | null;
  narrative?: string | null;
  attempts?: number;
}) {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const pending = status === "pending";

  await db
    .prepare(
      `INSERT INTO reports (id, agency_id, client_id, period, status, metrics_json, narrative, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      agencyId,
      clientId,
      period,
      status,
      pending || !metrics ? null : JSON.stringify(metrics),
      pending ? null : narrative,
      attempts,
      at,
      at,
    )
    .run();
  return id;
}

export type ReportRow = {
  id: string;
  status: ReportStatus;
  failure_reason: string | null;
  narrative: string | null;
  metrics_json: string | null;
  attempts: number;
  sent_at: string | null;
};

export async function readReport(id: string) {
  const row = await db.prepare("SELECT * FROM reports WHERE id = ?").bind(id).first<ReportRow>();

  if (!row) {
    throw new Error(`No report ${id}`);
  }
  return row;
}

export async function countRows({ sql, params = [] }: { sql: string; params?: unknown[] }) {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

// Fires the trigger through the Worker's exported `scheduled` handler and waits for everything it scheduled.
export async function runTick({ at }: { at: Date }) {
  const worker = (await import("../src/index")).default;
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: EVERY_MINUTE_CRON, scheduledTime: at.getTime() }), env, ctx);
  await waitOnExecutionContext(ctx);
}

export async function runJobs(times = 1) {
  for (let tick = 0; tick < times; tick += 1) {
    await runTick({ at: PLAIN_TICK });
  }
}

// The first monthly run of the month `date` falls in: the 4th, 06:00 UTC.
export function monthlyRunOf(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 4, 6));
}

export function nextHourOf(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1));
}

// Calls the Worker's fetch handler with a changed env (for env-dependent behaviour SELF cannot vary).
export async function fetchWithEnv({
  overrides,
  path,
  init = {},
}: {
  overrides: Partial<Env>;
  path: string;
  init?: RequestInit;
}) {
  const worker = (await import("../src/index")).default;
  const ctx = createExecutionContext();
  // The handler is typed for incoming requests (with `cf`); a test-built one never carries it.
  const request = new Request(`${BASE}${path}`, init) as Request<unknown, IncomingRequestCfProperties>;
  const response = await worker.fetch(request, { ...env, ...overrides }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export function api({
  path,
  cookie,
  method = "GET",
  body,
  ip = uniqueIp(),
}: {
  path: string;
  cookie?: string;
  method?: string;
  body?: unknown;
  ip?: string;
}) {
  const headers = new Headers({ origin: BASE, "cf-connecting-ip": ip });

  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

export async function signPaddle({ body, secret, ts }: { body: string; secret: string; ts: number }) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}:${body}`));
  return [...new Uint8Array(mac)]
    .map((byte) => {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

export async function postPaddleEvent({ body, secret = env.PADDLE_WEBHOOK_SECRET }: { body: string; secret?: string }) {
  const ts = Math.floor(Date.now() / 1000);
  const h1 = await signPaddle({ body, secret, ts });
  return SELF.fetch(`${BASE}/paddle/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": `ts=${ts};h1=${h1}` },
    body,
  });
}

function change(current: number, previous: number) {
  return { current, previous, changePercent: previous === 0 ? null : ((current - previous) / previous) * 100 };
}

// The fixture month as stored metrics (GA4 + Search Console), for render and send tests.
export const SAMPLE_METRICS: ReportMetrics = {
  period: "2026-10",
  previousPeriod: "2026-09",
  ga4: {
    sessions: change(4820, 4310),
    users: change(3610, 3302),
    keyEvents: change(142, 118),
    topChannels: [
      { label: "Organic Search", value: 2410 },
      { label: "Direct", value: 1105 },
      { label: "Paid Search", value: 602 },
      { label: "Referral", value: 388 },
      { label: "Organic Social", value: 215 },
    ],
    topLandingPages: [
      { label: "/", value: 1890 },
      { label: "/menu", value: 1010 },
      { label: "/order-online", value: 720 },
      { label: "/blog/sourdough-starter-guide", value: 418 },
      { label: "/contact", value: 402 },
    ],
  },
  gsc: {
    clicks: change(1240, 1010),
    impressions: change(38900, 35200),
    ctr: change(0.031877, 0.028693),
    position: change(14.2, 15.8),
    topQueries: [
      { label: "sourdough bread near me", value: 310 },
      { label: "example bakery", value: 280 },
      { label: "best croissants downtown", value: 150 },
      { label: "birthday cake order online", value: 120 },
      { label: "gluten free bakery", value: 95 },
    ],
    topPages: [
      { label: "https://examplebakery.com/", value: 520 },
      { label: "https://examplebakery.com/menu", value: 260 },
      { label: "https://examplebakery.com/order-online", value: 190 },
      { label: "https://examplebakery.com/blog/sourdough-starter-guide", value: 140 },
      { label: "https://examplebakery.com/cakes", value: 80 },
    ],
  },
};

export const SAMPLE_NARRATIVE =
  "Visits grew by about 12% in October, led by organic search.\n\nSearch clicks rose 23% as the sourdough guide climbed in results.";
