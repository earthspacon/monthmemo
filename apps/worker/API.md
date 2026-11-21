# Worker routes

All JSON routes answer `{ error, message }` on failure. `/api/*` routes need a session cookie unless noted; the ones
that change data also need an active plan (a 402 `plan_inactive` otherwise).

## Auth (Better Auth)

- `POST /api/auth/sign-in/social` — start Google sign-in; body `{ provider: "google" }` plus a Turnstile token; answers the Google URL.
- `GET /api/auth/callback/google` — Google redirects back here; sets the session and redirects into the app.
- `POST /api/auth/sign-out` — ends the session.

## Account

- `GET /api/me` — the signed-in user and agency.
- `POST /api/google/connect` — answers `{ url }` to link the Analytics and Search Console read scopes.
- `GET /api/google/status` — `{ connected, ga4, gsc, needsReconnect }`.
- `GET /api/google/sources` — `{ ga4: [...], gsc: [...] }`; 409 `google_reconnect_needed` when the grant is gone.
- `GET /api/billing` — plan, trial and limits.
- `POST /api/billing/portal` — a Paddle customer portal link.
- `GET /api/brand`, `PUT /api/brand` — display name, accent colour, logo URL, reply-to.

## Clients

- `GET /api/clients` — list.
- `POST /api/clients` — create (name, 1–3 recipients, GA4 property and/or Search Console site).
- `PUT /api/clients/:id` — update.
- `DELETE /api/clients/:id` — delete.

## Monthly drafts

- `GET /api/reports?period=YYYY-MM` — reports of a month.
- `GET /api/reports/:id` — one report with its metrics and narrative.
- `GET /api/reports/:id/preview` — the email HTML, served with its own CSP.
- `POST /api/reports/:id/approve` — queue it for sending.
- `POST /api/reports/:id/skip` — skip it.

## Public

- `GET /u/:token` — unsubscribe confirm page.
- `POST /u/:token` — unsubscribe (form or RFC 8058 one-click); limited per IP.
- `POST /paddle/webhook` — Paddle subscription events, signature checked.

## Development only (`DEV_ROUTES=1`, otherwise 404)

- `POST /dev/session` — create a signed-in session.
- `POST /dev/google` — seed fake Google state.
- `POST /dev/reports` — insert a report row.
- `POST /dev/run` — run a cron by name.
- `GET /dev/outbox?to=` — emails captured instead of sent.
