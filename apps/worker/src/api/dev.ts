import { PLANS, type AgencyStatus, type Plan } from "@monthmemo/contract";

import { createAuth } from "../auth";
import { HttpError, json, readJson, readString, route, type Route } from "../http";
import { newId } from "../ids";
import { createAgency } from "../repo/agencies";
import type { PublicContext } from "./context";

const EMAIL_MAX_LENGTH = 254;
const OUTBOX_LIMIT = 20;
const STATUSES: AgencyStatus[] = ["trialing", "active", "past_due", "canceled", "expired"];
const COOKIE_SIGNATURE_BYTES_HASH = { name: "HMAC", hash: "SHA-256" };

function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && value in PLANS;
}

function isStatus(value: unknown): value is AgencyStatus {
  return typeof value === "string" && STATUSES.some((status) => status === value);
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
