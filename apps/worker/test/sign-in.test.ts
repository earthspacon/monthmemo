import { PLANS, TRIAL_DAYS } from "@monthmemo/contract";
import { describe, expect, it } from "vitest";

import { api, countRows, db, googleProfile, signInWithGoogle, startSignIn, uniqueEmail } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_DAY = 4;
const RUN_HOUR_UTC = 6;
const TRIAL_AFTER_FIRST_RUN_DAYS = 3;
const TOLERANCE_MS = 5 * 60 * 1000;

// The next monthly run (the 4th, 06:00 UTC) after `from`.
function nextRunAfter(from: Date) {
  const thisMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), RUN_DAY, RUN_HOUR_UTC));
  if (thisMonth.getTime() > from.getTime()) {
    return thisMonth;
  }
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, RUN_DAY, RUN_HOUR_UTC));
}

describe("Google sign-in", () => {
  it("MM-R1 social sign-in without a Turnstile token answers 403 captcha_failed", async () => {
    const missing = await startSignIn({ turnstileToken: null });
    const wrong = await startSignIn({ turnstileToken: "not-a-real-token" });

    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: "captcha_failed" });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toMatchObject({ error: "captcha_failed" });
  });

  it("MM-R1 social sign-in with a Turnstile token answers a Google URL with the basic scopes only", async () => {
    const response = await startSignIn();
    const { url } = await response.json<{ url: string }>();
    const google = new URL(url);

    expect(response.status).toBe(200);
    expect(google.origin).toBe("https://accounts.google.com");
    expect(new Set(google.searchParams.get("scope")?.split(" "))).toEqual(new Set(["openid", "email", "profile"]));
  });

  it("MM-R2 the first Google sign-in creates one trialing starter agency with brand defaults, a second creates none", async () => {
    const signedUpAt = new Date();
    const profile = googleProfile({ email: uniqueEmail("first"), name: "Riley Park" });
    const { cookie } = await signInWithGoogle({ profile });

    const agency = await db
      .prepare("SELECT agencies.* FROM agencies JOIN users ON users.id = agencies.user_id WHERE users.email = ?")
      .bind(profile.email)
      .first<{
        plan: string;
        status: string;
        trial_ends_at: string;
        display_name: string;
        reply_to: string;
        accent_color: string;
        logo_url: string | null;
      }>();
    const expectedTrialEnd = Math.max(
      signedUpAt.getTime() + TRIAL_DAYS * DAY_MS,
      nextRunAfter(signedUpAt).getTime() + TRIAL_AFTER_FIRST_RUN_DAYS * DAY_MS,
    );

    expect(agency).toMatchObject({
      plan: "starter",
      status: "trialing",
      display_name: "Riley Park",
      reply_to: profile.email,
      accent_color: "#2563eb",
      logo_url: null,
    });
    expect(Math.abs(Date.parse(agency?.trial_ends_at ?? "") - expectedTrialEnd)).toBeLessThan(TOLERANCE_MS);

    const me = await api({ path: "/api/me", cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      email: profile.email,
      agency: { plan: "starter", status: "trialing", clientLimit: PLANS.starter.clientLimit, clientCount: 0 },
    });

    await signInWithGoogle({ profile });
    const agencies = await countRows({
      sql: "SELECT COUNT(*) AS count FROM agencies JOIN users ON users.id = agencies.user_id WHERE users.email = ?",
      params: [profile.email],
    });
    expect(agencies).toBe(1);
  });
});
