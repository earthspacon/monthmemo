import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeRateLimit } from "../src/repo/shield";
import { TURNSTILE_TEST_TOKEN } from "./fakes";
import { api, BASE, db, fetchWithEnv, randomToken, startSignIn, uniqueIp } from "./helpers";

const AUTH_LIMIT_PER_MINUTE = 30;
const UNSUBSCRIBE_FLOOD = 61;
const SECRET_DETAIL = "db-password=hunter2 at row 42";

function signInInit(ip: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "cf-connecting-ip": ip,
      "x-turnstile-token": TURNSTILE_TEST_TOKEN,
    },
    body: JSON.stringify({ provider: "google", callbackURL: "/app", errorCallbackURL: "/sign-in" }),
  };
}

function expectSecurityHeaders(response: Response) {
  const csp = response.headers.get("content-security-policy") ?? "";

  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("https://challenges.cloudflare.com");
  expect(csp).toContain("paddle.com");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBeTruthy();
}

// A D1 binding whose every query throws, to force an unhandled error inside a handler.
function brokenDb() {
  const failing = () => {
    throw new Error(SECRET_DETAIL);
  };
  return {
    prepare: failing,
    batch: failing,
    exec: failing,
    dump: failing,
    withSession: failing,
  } as unknown as D1Database;
}

function loggedText(spies: Array<{ mock: { calls: unknown[][] } }>) {
  return spies
    .flatMap((spy) => {
      return spy.mock.calls.flat();
    })
    .map((value) => {
      return value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ""}` : String(value);
    })
    .join("\n");
}

describe("Security headers and errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("MM-R26 every worker response carries the security headers", async () => {
    const responses = [
      await api({ path: "/api/me" }),
      await api({ path: "/api/does-not-exist" }),
      await SELF.fetch(`${BASE}/u/${randomToken()}`),
      await SELF.fetch(`${BASE}/paddle/webhook`, { method: "POST", body: "{}" }),
      await startSignIn({ turnstileToken: null }),
    ];

    for (const response of responses) {
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expectSecurityHeaders(response);
    }
  });

  it("MM-R26 an unhandled error answers a generic 500 and logs only the error name", async () => {
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];

    const response = await fetchWithEnv({
      overrides: { DB: brokenDb() },
      path: `/u/${randomToken()}`,
      init: { headers: { "cf-connecting-ip": uniqueIp() } },
    });

    expect(response.status).toBe(500);
    expectSecurityHeaders(response);
    expect(await response.text()).not.toContain(SECRET_DETAIL);
    const logged = loggedText(spies);
    expect(logged).toContain("Error");
    expect(logged).not.toContain(SECRET_DETAIL);
  });

  it("MM-R26 dev routes answer 404 unless dev routes are on", async () => {
    const outboxOff = await fetchWithEnv({ overrides: { DEV_ROUTES: "0" }, path: "/dev/outbox" });
    const sessionOff = await fetchWithEnv({
      overrides: { DEV_ROUTES: "0" },
      path: "/dev/session",
      init: {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ email: "dev@agency.example" }),
      },
    });
    const outboxOn = await SELF.fetch(`${BASE}/dev/outbox`);

    expect(outboxOff.status).toBe(404);
    expect(sessionOff.status).toBe(404);
    expect(outboxOn.status).toBe(200);
  });
});

describe("Abuse limits", () => {
  it("MM-R27 the 31st auth write from one address within a minute answers 429", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];

    for (let request = 0; request <= AUTH_LIMIT_PER_MINUTE; request += 1) {
      statuses.push((await SELF.fetch(`${BASE}/api/auth/sign-in/social`, signInInit(ip))).status);
    }

    expect(statuses.slice(0, AUTH_LIMIT_PER_MINUTE)).toEqual(Array(AUTH_LIMIT_PER_MINUTE).fill(200));
    expect(statuses[AUTH_LIMIT_PER_MINUTE]).toBe(429);
    expect((await SELF.fetch(`${BASE}/api/auth/sign-in/social`, signInInit(uniqueIp()))).status).toBe(200);
  });

  it("MM-R27 an unsubscribe flood from one address gets 429", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];

    for (let request = 0; request < UNSUBSCRIBE_FLOOD; request += 1) {
      const response = await SELF.fetch(`${BASE}/u/${randomToken()}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
        body: "List-Unsubscribe=One-Click",
      });
      statuses.push(response.status);
    }

    expect(statuses[0]).toBe(404);
    expect(statuses).toContain(429);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it("MM-R27 parallel hits on one rate-limit key never pass more than the limit", async () => {
    const key = `parallel:${uniqueIp()}`;
    const now = new Date();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumeRateLimit({ db, key, limit: 3, windowMs: 60_000, now })),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("MM-R27 sign-in fails closed without a Turnstile secret", async () => {
    const blocked = await fetchWithEnv({
      overrides: { TURNSTILE_SECRET_KEY: undefined },
      path: "/api/auth/sign-in/social",
      init: signInInit(uniqueIp()),
    });
    const allowed = await fetchWithEnv({
      overrides: { TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY },
      path: "/api/auth/sign-in/social",
      init: signInInit(uniqueIp()),
    });

    expect(blocked.status).not.toBe(200);
    expect(blocked.status).toBeGreaterThanOrEqual(400);
    expect(allowed.status).toBe(200);
  });
});
