import accountSummaries from "../fixtures/google/account-summaries.json";
import ga4RunReport from "../fixtures/google/ga4-run-report.json";
import gscQuery from "../fixtures/google/gsc-query.json";
import sites from "../fixtures/google/sites.json";

// Every outbound call of the worker goes through this one fetch: Google, Groq, Resend, Paddle and Turnstile
// answer from here, any other URL throws, so no test can reach a real service.
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ACCOUNT_SUMMARIES_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
export const GOOGLE_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const RESEND_URL = "https://api.resend.com/emails";
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RUN_REPORT_PATTERN = /^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/([^/:]+):runReport$/;
const SEARCH_ANALYTICS_PATTERN =
  /^https:\/\/www\.googleapis\.com\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/;
const PADDLE_HOSTS = ["https://sandbox-api.paddle.com", "https://api.paddle.com"];

export const BASIC_SCOPE = "openid email profile";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const FULL_SCOPE = `${BASIC_SCOPE} ${GA4_SCOPE} ${GSC_SCOPE}`;

// Cloudflare's documented test behaviour: secret 1x…AA accepts only the dummy token.
export const TURNSTILE_PASSING_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

// A token any test may hand to the Google client directly (function-level tests); always accepted.
export const TEST_ACCESS_TOKEN = "ya29.test-access-token";
const ACCESS_TOKEN_TTL_SECONDS = 3599;
const GOOD_NARRATIVE_WORDS = 90;

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
};

export type GoogleGrant = {
  profile: GoogleProfile;
  scope: string;
  refreshToken: string | null;
};

export type GroqReply = { text: string } | { status: number };

type RecordedCall = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

type FakeState = {
  calls: RecordedCall[];
  nextGrant: GoogleGrant | null;
  issuedAccessTokens: Set<string>;
  staleAccessTokens: Set<string>;
  revokedRefreshTokens: Set<string>;
  currentPeriod: string;
  emptyPeriods: Set<string>;
  missingGa4Properties: Set<string>;
  brokenGa4Properties: Set<string>;
  missingGscSites: Set<string>;
  emptyAccount: boolean;
  groqReplies: GroqReply[];
  failingRecipients: Set<string>;
  resendFailsAll: boolean;
};

export const fake: FakeState = createState();

function createState(): FakeState {
  return {
    calls: [],
    nextGrant: null,
    issuedAccessTokens: new Set([TEST_ACCESS_TOKEN]),
    staleAccessTokens: new Set(),
    revokedRefreshTokens: new Set(),
    currentPeriod: previousPeriodOf(new Date()),
    emptyPeriods: new Set(),
    missingGa4Properties: new Set(),
    brokenGa4Properties: new Set(),
    missingGscSites: new Set(),
    emptyAccount: false,
    groqReplies: [],
    failingRecipients: new Set(),
    resendFailsAll: false,
  };
}

export function resetFakes() {
  Object.assign(fake, createState());
  sentMails.length = 0;
}

// The month a run on `date` reports on: the previous calendar month in UTC, as YYYY-MM.
export function previousPeriodOf(date: Date) {
  const firstOfPrevious = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return firstOfPrevious.toISOString().slice(0, 7);
}

export function monthBefore(period: string) {
  const [year, month] = period.split("-").map(Number);
  return previousPeriodOf(new Date(Date.UTC(year, month - 1, 15)));
}

export function callsTo(prefix: string) {
  return fake.calls.filter((call) => {
    return call.url.startsWith(prefix);
  });
}

export type ResendMail = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  headers?: Record<string, string>;
};

// Mails Resend accepted (a failed call is recorded in fake.calls but is not a sent mail).
export const sentMails: ResendMail[] = [];

export function mailsTo(address: string) {
  return sentMails.filter((mail) => {
    return mail.to.includes(address);
  });
}

export function installFakes() {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.clone().text();
    fake.calls.push({ url: request.url, method: request.method, headers: request.headers, body });
    return route({ request, body });
  };
}

async function route({ request, body }: { request: Request; body: string }) {
  const url = request.url.split("?")[0];

  if (url === SITEVERIFY_URL) {
    return siteverify(body);
  }
  if (url === GOOGLE_TOKEN_URL) {
    return googleToken(body);
  }
  if (url === GOOGLE_ACCOUNT_SUMMARIES_URL) {
    return withGoogleAuth(request, () => {
      return Response.json(fake.emptyAccount ? {} : accountSummaries);
    });
  }
  if (url === GOOGLE_SITES_URL) {
    return withGoogleAuth(request, () => {
      return Response.json(fake.emptyAccount ? {} : sites);
    });
  }
  const runReport = RUN_REPORT_PATTERN.exec(url);
  if (runReport) {
    return withGoogleAuth(request, () => {
      return ga4Report({ propertyId: runReport[1], body });
    });
  }
  const searchAnalytics = SEARCH_ANALYTICS_PATTERN.exec(url);
  if (searchAnalytics) {
    return withGoogleAuth(request, () => {
      return gscReport({ siteUrl: decodeURIComponent(searchAnalytics[1]), body });
    });
  }
  if (url === GROQ_URL) {
    return groq(body);
  }
  if (url === RESEND_URL) {
    return resend(body);
  }
  if (
    PADDLE_HOSTS.some((host) => {
      return url.startsWith(host);
    })
  ) {
    return Response.json({
      data: {
        id: `cpls_${crypto.randomUUID().replaceAll("-", "")}`,
        urls: { general: { overview: "https://sandbox-customer-portal.paddle.com/cpl_test/overview" } },
      },
    });
  }
  throw new Error(`Unexpected outbound fetch in a test: ${request.method} ${request.url}`);
}

function siteverify(body: string) {
  const form = new URLSearchParams(body);

  if (form.get("secret") === TURNSTILE_PASSING_SECRET && form.get("response") === TURNSTILE_TEST_TOKEN) {
    return Response.json({ success: true, "error-codes": [] });
  }
  return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
}

function encodeSegment(value: object) {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function issueAccessToken() {
  const token = `ya29.${crypto.randomUUID()}`;
  fake.issuedAccessTokens.add(token);
  return token;
}

function googleToken(body: string) {
  const form = new URLSearchParams(body);
  const grantType = form.get("grant_type");

  if (grantType === "refresh_token") {
    if (fake.revokedRefreshTokens.has(form.get("refresh_token") ?? "")) {
      return Response.json(
        { error: "invalid_grant", error_description: "Token has been expired or revoked." },
        { status: 400 },
      );
    }
    return Response.json({
      access_token: issueAccessToken(),
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      token_type: "Bearer",
    });
  }
  const grant = fake.nextGrant;

  if (!grant) {
    throw new Error("A Google code exchange happened without fake.nextGrant set");
  }
  const clientId = form.get("client_id") ?? "test-client-id.apps.googleusercontent.com";
  const idToken = [
    encodeSegment({ alg: "RS256", kid: "test" }),
    encodeSegment({ iss: "https://accounts.google.com", aud: clientId, ...grant.profile }),
    "signature",
  ].join(".");

  return Response.json({
    access_token: issueAccessToken(),
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    token_type: "Bearer",
    scope: grant.scope,
    id_token: idToken,
    ...(grant.refreshToken ? { refresh_token: grant.refreshToken } : {}),
  });
}

function withGoogleAuth(request: Request, answer: () => Response) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");

  if (!fake.issuedAccessTokens.has(token) || fake.staleAccessTokens.has(token)) {
    return Response.json(
      { error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } },
      { status: 401 },
    );
  }
  return answer();
}

function googleNotFound() {
  return Response.json(
    { error: { code: 403, message: "User does not have sufficient permissions.", status: "PERMISSION_DENIED" } },
    { status: 403 },
  );
}

type Ga4Row = {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
};

type Ga4Fixture = {
  dimensionHeaders: Array<{ name: string }>;
  metricHeaders: Array<{ name: string; type: string }>;
  rows: Ga4Row[];
};

type Ga4Request = {
  dateRanges?: Array<{ startDate: string; endDate: string; name?: string }>;
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  limit?: string | number;
  orderBys?: Array<{ metric?: { metricName: string }; desc?: boolean }>;
};

// Fixture rows are labelled date_range_0 = the reported month, date_range_1 = the month before; the fake maps them
// onto the ranges the request asked for (by month) and projects the requested metrics, like the real API.
function ga4Report({ propertyId, body }: { propertyId: string; body: string }) {
  if (fake.missingGa4Properties.has(propertyId)) {
    return googleNotFound();
  }
  if (fake.brokenGa4Properties.has(propertyId)) {
    return Response.json({ error: { code: 500, message: "Internal error", status: "INTERNAL" } }, { status: 500 });
  }
  const request: Ga4Request = JSON.parse(body);
  const dimension = request.dimensions?.[0]?.name;
  const fixtures: Record<string, Ga4Fixture> = ga4RunReport;
  const fixture = fixtures[dimension ?? "totals"];

  if (!fixture) {
    throw new Error(`The GA4 fake has no fixture for dimension ${dimension}`);
  }
  const metricNames = (request.metrics ?? []).map((metric) => {
    return metric.name;
  });
  const fixtureMetricNames = fixture.metricHeaders.map((header) => {
    return header.name;
  });
  const ranges = request.dateRanges ?? [];
  const multipleRanges = ranges.length > 1;
  const rows: Ga4Row[] = [];

  ranges.forEach((range, index) => {
    const period = range.startDate.slice(0, 7);
    const source = sourceRangeFor(period);

    if (!source) {
      return;
    }
    for (const row of fixture.rows) {
      const rangeLabel = row.dimensionValues[row.dimensionValues.length - 1].value;
      if (rangeLabel !== source) {
        continue;
      }
      const dimensions = row.dimensionValues.slice(0, -1);
      const label = range.name ?? `date_range_${index}`;
      rows.push({
        dimensionValues: multipleRanges ? [...dimensions, { value: label }] : dimensions,
        metricValues: metricNames.map((name) => {
          return row.metricValues[fixtureMetricNames.indexOf(name)] ?? { value: "0" };
        }),
      });
    }
  });
  // Like GA4: rows of every range are ordered together by the first ordering metric, and only then cut to the limit.
  const order = request.orderBys?.[0];
  const orderIndex = order?.metric ? metricNames.indexOf(order.metric.metricName) : -1;
  if (orderIndex >= 0) {
    const direction = order?.desc ? -1 : 1;
    rows.sort((left, right) => {
      return direction * (Number(left.metricValues[orderIndex].value) - Number(right.metricValues[orderIndex].value));
    });
  }
  const limit = request.limit === undefined ? rows.length : Number(request.limit);
  const limited = rows.slice(0, limit);

  return Response.json({
    dimensionHeaders: [...(dimension ? [{ name: dimension }] : []), ...(multipleRanges ? [{ name: "dateRange" }] : [])],
    metricHeaders: metricNames.map((name) => {
      return fixture.metricHeaders.find((header) => header.name === name) ?? { name, type: "TYPE_INTEGER" };
    }),
    ...(limited.length > 0 ? { rows: limited } : {}),
    rowCount: limited.length,
    metadata: { currencyCode: "USD", timeZone: "America/New_York" },
    kind: "analyticsData#runReport",
  });
}

function sourceRangeFor(period: string) {
  if (fake.emptyPeriods.has(period)) {
    return null;
  }
  if (period === fake.currentPeriod) {
    return "date_range_0";
  }
  if (period === monthBefore(fake.currentPeriod)) {
    return "date_range_1";
  }
  return null;
}

type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GscRequest = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
};

function gscReport({ siteUrl, body }: { siteUrl: string; body: string }) {
  if (fake.missingGscSites.has(siteUrl)) {
    return googleNotFound();
  }
  const request: GscRequest = JSON.parse(body);
  const source = sourceRangeFor(request.startDate.slice(0, 7));

  if (!source) {
    return Response.json({ responseAggregationType: "byProperty" });
  }
  const month = source === "date_range_0" ? gscQuery.current : gscQuery.previous;
  const dimension = request.dimensions?.[0];
  const answers: Record<string, { rows: GscRow[] }> = month;
  const answer = answers[dimension ?? "totals"];

  if (!answer) {
    throw new Error(`The Search Console fake has no fixture for dimension ${dimension}`);
  }
  const rows = answer.rows.slice(0, request.rowLimit ?? answer.rows.length);
  return Response.json({ rows, responseAggregationType: "byProperty" });
}

function wordsOf(count: number) {
  const words = ["Organic", "search", "grew", "this", "month", "while", "direct", "visits", "held", "steady."];
  return Array.from({ length: count }, (_, index) => {
    return words[index % words.length];
  }).join(" ");
}

export function narrativeOfWords(count: number) {
  return wordsOf(count);
}

function groq(body: string) {
  const request: { model?: string } = JSON.parse(body);
  const reply = fake.groqReplies.shift() ?? { text: wordsOf(GOOD_NARRATIVE_WORDS) };

  if ("status" in reply) {
    return Response.json({ error: { message: "Upstream error", type: "api_error" } }, { status: reply.status });
  }
  return Response.json({
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    model: request.model ?? "openai/gpt-oss-120b",
    choices: [{ index: 0, message: { role: "assistant", content: reply.text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 900, completion_tokens: 220, total_tokens: 1120 },
  });
}

function resend(body: string) {
  const mail: ResendMail = JSON.parse(body);
  const recipients = Array.isArray(mail.to) ? mail.to : [mail.to];
  const failing = recipients.some((address) => {
    return fake.failingRecipients.has(address);
  });

  if (fake.resendFailsAll || failing) {
    return Response.json(
      { statusCode: 500, name: "internal_server_error", message: "Unexpected error" },
      { status: 500 },
    );
  }
  sentMails.push({ ...mail, to: recipients });
  return Response.json({ id: crypto.randomUUID() });
}
