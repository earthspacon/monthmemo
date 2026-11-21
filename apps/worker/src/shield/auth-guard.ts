import type { Deps } from "../deps";
import { HttpError } from "../http";
import { readClientIp, sha256Hex } from "./client";
import { TURNSTILE_HEADER, verifyTurnstile } from "./turnstile";

export const SOCIAL_SIGN_IN_PATH = "/api/auth/sign-in/social";

// Runs before Better Auth: per-IP limit on every auth write, and the Turnstile check before Google is contacted.
export async function guardAuthRequest({ deps, request }: { deps: Deps; request: Request }) {
  if (request.method !== "POST") {
    return;
  }

  const ip = readClientIp(request);
  if (ip && !(await deps.env.AUTH_LIMITER.limit({ key: `auth:${await sha256Hex(ip)}` })).success) {
    throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again");
  }
  if (new URL(request.url).pathname !== SOCIAL_SIGN_IN_PATH) {
    return;
  }

  const isHuman = await verifyTurnstile({
    secret: deps.env.TURNSTILE_SECRET_KEY,
    token: request.headers.get(TURNSTILE_HEADER),
    ip,
  });
  if (!isHuman) {
    throw new HttpError(403, "captcha_failed", "We couldn't confirm you're human. Reload the page and try again");
  }
}
