import { randomUUID } from "node:crypto";

import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

import { E2E_URL, findChromePath } from "./config";

export const DESKTOP = { width: 1440, height: 900 };
export const MOBILE = { width: 390, height: 844 };

export const MONTHLY_RUN_CRON = "0 6 4 * *";
export const JOBS_CRON = "* * * * *";

export const GENERIC_ERROR = "Something went wrong";
const SERVER_ERROR_BODY = { error: "internal", message: GENERIC_ERROR };

const DEFAULT_TIMEOUT_MS = 10_000;
const MONTHLY_RUN_DAY = 4;
const MONTHLY_RUN_HOUR_UTC = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/**";
const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";
const UNSUBSCRIBE_LINK = /https?:\/\/[^\s"'<>]+\/u\/[A-Za-z0-9_-]+/;
// Cloudflare's dummy token that the "always passes" test secret accepts.
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const RUN_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SENT_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export type Viewport = typeof DESKTOP;
export type Plan = "starter" | "growth";
export type AgencyStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type ReportStatus = "pending" | "building" | "draft" | "failed" | "sending" | "sent" | "send_failed" | "skipped";
export type FailureReason = "narrative_failed" | "google_reconnect_needed" | "source_not_found" | "google_error";

export type Sources = {
  ga4: Array<{ propertyId: string; name: string; account: string }>;
  gsc: Array<{ siteUrl: string }>;
};

export type ClientRow = {
  id: string;
  name: string;
  ga4PropertyId: string | null;
  ga4PropertyName: string | null;
  gscSiteUrl: string | null;
  recipients: Array<{ email: string; unsubscribed: boolean }>;
  nextReportOn: string;
};

export type ReportRow = {
  id: string;
  clientId: string;
  clientName: string;
  period: string;
  status: ReportStatus;
  failureReason: FailureReason | null;
  sentAt: string | null;
  recipientCount: number;
};

export type Billing = {
  plan: Plan;
  status: AgencyStatus;
  trialEndsAt: string | null;
  clientLimit: number;
  plans: Array<{ plan: Plan; priceCents: number; clientLimit: number; paddlePriceId: string }>;
  paddleClientToken: string;
  paddleEnv: string;
};

export type Brand = {
  displayName: string;
  accentColor: string;
  logoUrl: string | null;
  replyTo: string;
};

type ApiTarget = {
  page: Page;
  path: string;
  method?: string;
};

let browser: Promise<Browser> | null = null;
const openContexts: BrowserContext[] = [];

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@agency.example`;
}

export async function openPage({ viewport = DESKTOP }: { viewport?: Viewport } = {}) {
  browser ??= chromium.launch({ executablePath: findChromePath() });
  const context = await (
    await browser
  ).newContext({
    baseURL: E2E_URL,
    viewport,
  });
  openContexts.push(context);
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  return { context, page };
}

export async function closePages() {
  const contexts = openContexts.splice(0);
  await Promise.all(
    contexts.map((context) => {
      return context.close();
    }),
  );
}

export async function closeBrowser() {
  const running = browser;
  browser = null;
  // A browser that never launched has nothing to close; its error is already on the test that needed it.
  await running?.then((launched) => launched.close()).catch(() => {});
}

// Calls the Worker with the browser context's cookies, so a seeded session signs these requests too.
export async function apiJson<T>({
  context,
  path,
  method = "GET",
  body,
}: {
  context: BrowserContext;
  path: string;
  method?: string;
  body?: unknown;
}) {
  const response = await context.request.fetch(`${E2E_URL}${path}`, {
    method,
    data: body,
    headers: { origin: E2E_URL },
  });
  return {
    status: response.status(),
    body: (await response.json().catch(() => null)) as T,
  };
}

function expectOk({ response, label }: { response: { status: number }; label: string }) {
  if (response.status >= 300) {
    throw new Error(`${label} answered ${response.status}`);
  }
}

// Signs the context in as an agency. Calling it again for the same email keeps the agency and sets plan/status.
export async function seedSession({
  context,
  email = uniqueEmail("agency"),
  plan,
  status,
}: {
  context: BrowserContext;
  email?: string;
  plan?: Plan;
  status?: AgencyStatus;
}) {
  const response = await apiJson({ context, path: "/dev/session", method: "POST", body: { email, plan, status } });
  expectOk({ response, label: "POST /dev/session" });
  return { email };
}

export async function seedGoogle({
  context,
  ga4 = true,
  gsc = true,
  needsReconnect = false,
}: {
  context: BrowserContext;
  ga4?: boolean;
  gsc?: boolean;
  needsReconnect?: boolean;
}) {
  const response = await apiJson({ context, path: "/dev/google", method: "POST", body: { ga4, gsc, needsReconnect } });
  expectOk({ response, label: "POST /dev/google" });
}

// A signed-in agency with both Google sources connected: the starting point of most app pages.
export async function seedConnectedAgency({
  context,
  plan,
  status,
}: {
  context: BrowserContext;
  plan?: Plan;
  status?: AgencyStatus;
}) {
  const session = await seedSession({ context, plan, status });
  await seedGoogle({ context });
  return session;
}

export async function readSources({ context }: { context: BrowserContext }) {
  const response = await apiJson<Sources>({ context, path: "/api/google/sources" });
  expectOk({ response, label: "GET /api/google/sources" });
  return response.body;
}

export async function createClient({
  context,
  name = `Client ${randomUUID().slice(0, 6)}`,
  recipients = [uniqueEmail("owner")],
}: {
  context: BrowserContext;
  name?: string;
  recipients?: string[];
}) {
  const sources = await readSources({ context });
  const response = await apiJson<ClientRow>({
    context,
    path: "/api/clients",
    method: "POST",
    body: {
      name,
      recipients,
      ga4PropertyId: sources.ga4[0]?.propertyId ?? null,
      gscSiteUrl: sources.gsc[0]?.siteUrl ?? null,
    },
  });
  expectOk({ response, label: "POST /api/clients" });
  return response.body;
}

export async function listClients({ context }: { context: BrowserContext }) {
  const response = await apiJson<ClientRow[]>({ context, path: "/api/clients" });
  expectOk({ response, label: "GET /api/clients" });
  return response.body;
}

export async function seedReport({
  context,
  clientId,
  period = previousPeriod(),
  status,
  failureReason,
}: {
  context: BrowserContext;
  clientId: string;
  period?: string;
  status: ReportStatus;
  failureReason?: FailureReason;
}) {
  const response = await apiJson<{ id: string }>({
    context,
    path: "/dev/reports",
    method: "POST",
    body: { clientId, period, status, failureReason },
  });
  expectOk({ response, label: "POST /dev/reports" });
  return response.body;
}

export async function readReport({ context, id }: { context: BrowserContext; id: string }) {
  const response = await apiJson<ReportRow>({ context, path: `/api/reports/${id}` });
  expectOk({ response, label: "GET /api/reports/:id" });
  return response.body;
}

export async function readBilling({ context }: { context: BrowserContext }) {
  const response = await apiJson<Billing>({ context, path: "/api/billing" });
  expectOk({ response, label: "GET /api/billing" });
  return response.body;
}

export async function readBrand({ context }: { context: BrowserContext }) {
  const response = await apiJson<Brand>({ context, path: "/api/brand" });
  expectOk({ response, label: "GET /api/brand" });
  return response.body;
}

export async function runCron(cron: string) {
  const response = await fetch(`${E2E_URL}/dev/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cron }),
  });
  expectOk({ response, label: "POST /dev/run" });
}

// Approves a draft and runs the minute job, which sends it.
export async function sendReport({ context, id }: { context: BrowserContext; id: string }) {
  const response = await apiJson({ context, path: `/api/reports/${id}/approve`, method: "POST" });
  expectOk({ response, label: "POST /api/reports/:id/approve" });
  await runCron(JOBS_CRON);
}

export async function readOutbox(to: string) {
  const response = await fetch(`${E2E_URL}/dev/outbox?to=${encodeURIComponent(to)}`);
  expectOk({ response, label: "GET /dev/outbox" });
  return (await response.json()) as Array<{ subject: string; body: string; html: string | null }>;
}

// Clicks the unsubscribe link of the first report mail the recipient got, as a mail client's one-click would.
export async function unsubscribe(email: string) {
  const mails = await readOutbox(email);
  const link = mails
    .map((mail) => {
      return `${mail.body}\n${mail.html ?? ""}`.match(UNSUBSCRIBE_LINK)?.[0];
    })
    .find(Boolean);
  if (!link) {
    throw new Error(`no unsubscribe link in the mails to ${email}`);
  }
  const response = await fetch(link.replace(/^https?:\/\/[^/]+/, E2E_URL), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  expectOk({ response, label: "POST /u/:token" });
}

// Routes `/api/*` calls of one path and method to `handle`; with `once` only the first such call, later ones go through.
async function interceptApi({
  page,
  path,
  method = "GET",
  once,
  handle,
}: ApiTarget & { once: boolean; handle: (route: Route) => Promise<void> }) {
  let handled = false;
  await page.route(
    (url) => {
      return url.pathname === path;
    },
    async (route) => {
      if (route.request().method() !== method || (once && handled)) {
        await route.fallback();
        return;
      }
      handled = true;
      await handle(route);
    },
  );
}

// Holds the next matching request until the test releases it (to look at a loading state) or fails it.
export async function delayApi(target: ApiTarget) {
  let settle: (outcome: "release" | "fail") => void = () => {};
  const decided = new Promise<"release" | "fail">((resolve) => {
    settle = resolve;
  });
  await interceptApi({
    ...target,
    once: true,
    handle: async (route) => {
      const outcome = await decided;
      if (outcome === "fail") {
        await fulfillJson({ route, status: 500, body: SERVER_ERROR_BODY });
        return;
      }
      await route.continue();
    },
  });
  return {
    release: () => {
      settle("release");
    },
    fail: () => {
      settle("fail");
    },
  };
}

// Answers the next matching request with a 500, as the Worker does for an unhandled error; a retry goes through.
export async function failApi(target: ApiTarget) {
  await interceptApi({
    ...target,
    once: true,
    handle: async (route) => {
      await fulfillJson({ route, status: 500, body: SERVER_ERROR_BODY });
    },
  });
}

// Answers every matching request with a fixed JSON body (an upstream state the dev fakes can't produce).
export async function answerApi({ body, ...target }: ApiTarget & { body: unknown }) {
  await interceptApi({
    ...target,
    once: false,
    handle: async (route) => {
      await fulfillJson({ route, status: 200, body });
    },
  });
}

async function fulfillJson({ route, status, body }: { route: Route; status: number; body: unknown }) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

// Replaces Cloudflare's Turnstile script: the widget is a "Verify you are human" button that hands out the test token.
export async function stubTurnstile({ page }: { page: Page }) {
  await page.route(TURNSTILE_JS, async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        window.turnstile = {
          render(container, options) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Verify you are human";
            button.addEventListener("click", () => options.callback(${JSON.stringify(TURNSTILE_TEST_TOKEN)}));
            container.append(button);
            return "e2e-widget";
          },
          remove() {},
          reset() {},
        };
      `,
    });
  });
  await page.route("https://accounts.google.com/**", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<title>Google</title>" });
  });
}

// Replaces Paddle.js; every Checkout.open call is recorded with its price ids instead of opening Paddle's overlay.
export async function stubPaddle({ page }: { page: Page }) {
  const openedPriceIds: string[] = [];
  await page.exposeFunction("recordPaddleCheckout", (priceIds: string[]) => {
    openedPriceIds.push(...priceIds);
  });
  await page.route(PADDLE_JS, async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        window.Paddle = {
          Environment: { set() {} },
          Initialize() {},
          Checkout: {
            open(options) {
              window.recordPaddleCheckout(options.items.map((item) => item.priceId));
            },
          },
        };
      `,
    });
  });
  return { openedPriceIds };
}

// The page fits a 390 px phone: nothing is wider than the viewport.
export async function expectNoHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => {
    return document.documentElement.scrollWidth;
  });
  if (scrollWidth > MOBILE.width) {
    throw new Error(`page scrolls sideways: scrollWidth ${scrollWidth} > ${MOBILE.width}`);
  }
}

export async function countVisibleTables(page: Page) {
  return page.locator("table:visible").count();
}

// The month the next run reports on: the previous calendar month in UTC, as `YYYY-MM`.
export function previousPeriod(now = new Date()) {
  return shiftPeriod({ now, months: -1 });
}

export function shiftPeriod({ now = new Date(), months }: { now?: Date; months: number }) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  return date.toISOString().slice(0, 7);
}

export function periodLabel(period: string) {
  return MONTH_FORMAT.format(new Date(`${period}-01T00:00:00Z`));
}

// "4 December 2026": the date the monthly cron fires next (the 4th, 06:00 UTC).
export function nextRunLabel(now = new Date()) {
  const thisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), MONTHLY_RUN_DAY, MONTHLY_RUN_HOUR_UTC);
  if (now.getTime() < thisMonth) {
    return RUN_DAY_FORMAT.format(new Date(thisMonth));
  }
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, MONTHLY_RUN_DAY, MONTHLY_RUN_HOUR_UTC);
  return RUN_DAY_FORMAT.format(new Date(nextMonth));
}

export function sentDayLabel(iso: string) {
  return SENT_DAY_FORMAT.format(new Date(iso));
}

export function daysLeft(iso: string, now = new Date()) {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);
}

export function formatPrice(cents: number) {
  return `$${cents / 100}`;
}
