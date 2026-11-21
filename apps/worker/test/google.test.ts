import { describe, expect, it } from "vitest";

import { BASIC_SCOPE, callsTo, fake, GA4_SCOPE, GOOGLE_ACCOUNT_SUMMARIES_URL, GOOGLE_TOKEN_URL } from "./fakes";
import {
  api,
  BASE,
  connectGoogle,
  cookiePairs,
  createConnectedAgency,
  db,
  expireAccessToken,
  joinCookies,
  signInWithGoogle,
  startConnect,
} from "./helpers";

async function readStatus(cookie: string) {
  const response = await api({ path: "/api/google/status", cookie });
  expect(response.status).toBe(200);
  return response.json();
}

describe("Google data connection", () => {
  it("MM-R3 connect asks for both read scopes offline with consent and stores the refresh token encrypted", async () => {
    const { profile, cookie } = await signInWithGoogle();
    const { authorizeUrl, callback, refreshToken } = await connectGoogle({ cookie, profile });
    const scopes = authorizeUrl.searchParams.get("scope")?.split(" ") ?? [];

    expect(authorizeUrl.origin).toBe("https://accounts.google.com");
    expect(scopes).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/webmasters.readonly");
    expect(authorizeUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizeUrl.searchParams.get("prompt")).toBe("consent");
    expect(callback.status).toBe(302);
    expect(new URL(callback.headers.get("location") ?? "", BASE).pathname).toBe("/app/connect");

    const raw = await db
      .prepare(
        "SELECT * FROM auth_identities WHERE provider_id = 'google' AND user_id = (SELECT id FROM users WHERE email = ?)",
      )
      .bind(profile.email)
      .first<Record<string, unknown>>();
    expect(raw?.refresh_token).toBeTruthy();
    expect(JSON.stringify(raw)).not.toContain(refreshToken ?? "missing");

    expect(await readStatus(cookie)).toEqual({ connected: true, ga4: true, gsc: true, needsReconnect: false });
  });

  it("MM-R4 a grant without the Search Console scope shows gsc false", async () => {
    const { profile, cookie } = await signInWithGoogle();
    await connectGoogle({ cookie, profile, scope: `${BASIC_SCOPE} ${GA4_SCOPE}` });

    expect(await readStatus(cookie)).toEqual({ connected: true, ga4: true, gsc: false, needsReconnect: false });
  });

  it("MM-R4 a denied consent stores nothing and redirects to the connect page with the error", async () => {
    const { cookie } = await signInWithGoogle();
    const started = await startConnect(cookie);
    const { url } = await started.json<{ url: string }>();
    const state = new URL(url).searchParams.get("state") ?? "";

    const callback = await api({
      path: `/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(state)}`,
      cookie: joinCookies([cookie], cookiePairs(started)),
    });
    const location = new URL(callback.headers.get("location") ?? "", BASE);

    expect(callback.status).toBe(302);
    expect(location.pathname).toBe("/app/connect");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(await readStatus(cookie)).toEqual({ connected: false, ga4: false, gsc: false, needsReconnect: false });
  });

  it("MM-R5 sources list the GA4 properties and the verified Search Console sites", async () => {
    const { cookie } = await createConnectedAgency();
    const response = await api({ path: "/api/google/sources", cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ga4: [
        { propertyId: "310000001", name: "Example Bakery - GA4", account: "Example Bakery LLC" },
        { propertyId: "310000002", name: "northsidedental.com", account: "Northside Dental" },
      ],
      gsc: [{ siteUrl: "https://examplebakery.com/" }, { siteUrl: "sc-domain:northsidedental.com" }],
    });
  });

  it("MM-R5 an expired access token is refreshed before the sources are read", async () => {
    const { cookie, profile } = await createConnectedAgency();
    await expireAccessToken(profile.email);
    fake.calls.length = 0;

    const response = await api({ path: "/api/google/sources", cookie });
    const refreshIndex = fake.calls.findIndex((call) => {
      return call.url === GOOGLE_TOKEN_URL && new URLSearchParams(call.body).get("grant_type") === "refresh_token";
    });
    const summariesIndex = fake.calls.findIndex((call) => {
      return call.url.startsWith(GOOGLE_ACCOUNT_SUMMARIES_URL);
    });

    expect(response.status).toBe(200);
    expect(refreshIndex).toBeGreaterThanOrEqual(0);
    expect(summariesIndex).toBeGreaterThan(refreshIndex);
  });

  it("MM-R5 a revoked refresh token answers 409 google_reconnect_needed and sets needsReconnect", async () => {
    const { cookie, profile, refreshToken } = await createConnectedAgency();
    fake.revokedRefreshTokens.add(refreshToken ?? "");
    await expireAccessToken(profile.email);

    const response = await api({ path: "/api/google/sources", cookie });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "google_reconnect_needed" });
    expect(await readStatus(cookie)).toMatchObject({ needsReconnect: true });
  });

  it("MM-R5 an account without properties or sites answers empty lists", async () => {
    const { cookie } = await createConnectedAgency();
    fake.emptyAccount = true;

    const response = await api({ path: "/api/google/sources", cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ga4: [], gsc: [] });
    expect(callsTo(GOOGLE_ACCOUNT_SUMMARIES_URL).length).toBeGreaterThan(0);
  });
});
