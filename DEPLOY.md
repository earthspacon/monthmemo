# Deploying MonthMemo

Everything runs on one Cloudflare Worker (`apps/worker`) that also serves the built SPA (`apps/web/dist`). Work through the
sections in order; the commands run from the repository root unless noted.

## 1. Cloudflare resources

```sh
cd apps/worker
pnpm wrangler d1 create monthmemo          # copy the id into [env.production.d1_databases] database_id
pnpm wrangler d1 migrations apply monthmemo --env production --remote
```

Fill every `REPLACE_WITH_…` value in the `[env.production]` block of `apps/worker/wrangler.toml`. The block repeats the
`AUTH_LIMITER` binding, the three crons, `DEV_ROUTES = "0"`, `GOOGLE_FAKE = "0"` and the LLM spend caps, because bindings
and vars are not inherited from the top level.

## 2. Secrets

Set each one with `--env production` (values are prompted, never put them in a file that is committed):

```sh
cd apps/worker
pnpm wrangler secret put BETTER_AUTH_SECRET --env production      # openssl rand -base64 32
pnpm wrangler secret put GOOGLE_CLIENT_ID --env production
pnpm wrangler secret put GOOGLE_CLIENT_SECRET --env production
MODEL_API_KEY_NAME=$(grep -o "[A-Z_]*_API_KEY" src/env.ts | head -1)   # the key declared first in src/env.ts for the narrative writer
pnpm wrangler secret put "$MODEL_API_KEY_NAME" --env production
pnpm wrangler secret put RESEND_API_KEY --env production
pnpm wrangler secret put PADDLE_API_KEY --env production
pnpm wrangler secret put PADDLE_WEBHOOK_SECRET --env production
pnpm wrangler secret put TURNSTILE_SECRET_KEY --env production
```

Without `TURNSTILE_SECRET_KEY` sign-in is refused on purpose (it fails closed).

## 3. Google Cloud console

1. Create a project and enable three APIs: **Analytics Admin API**, **Analytics Data API** and **Search Console API**.
2. OAuth consent screen: user type External, app name and support email filled in, links to the privacy page and terms.
3. Add the scopes `openid`, `email`, `profile`, `https://www.googleapis.com/auth/analytics.readonly` and
   `https://www.googleapis.com/auth/webmasters.readonly`.
4. Set the publishing status to **In production**. In "Testing" mode refresh tokens expire after 7 days and every
   agency would have to reconnect weekly.
5. Until Google verifies the app (a separate review of the two read scopes), the unverified-app screen is shown and the
   project is capped at **100 users**. That is enough for the first agencies; apply for verification before reaching it.
6. Create an OAuth client of type Web application. Authorised redirect URIs:
   `https://monthmemo.com/api/auth/callback/google`; sign-in and the data connection both return through it.
   Put the client id and secret into the secrets above.

## 4. Paddle

1. In the Paddle dashboard create two products with a monthly price each: Starter and Growth.
2. Put the price ids into `PADDLE_PRICE_STARTER` and `PADDLE_PRICE_GROWTH` and the client-side token into
   `PADDLE_CLIENT_TOKEN` in the production vars.
3. Add a notification destination pointing to `https://monthmemo.com/paddle/webhook`, subscribe it to the subscription
   events, and store its secret as `PADDLE_WEBHOOK_SECRET`. Store an API key as `PADDLE_API_KEY`.
4. Set `PADDLE_ENV = "production"` and add the domain to Paddle's approved checkout domains.

## 5. Resend

Add and verify the sending domain in Resend (the production `MAIL_FROM` uses `mail.monthmemo.com`): add the SPF and DKIM
DNS records it shows, wait until the domain is verified, then create the API key for `RESEND_API_KEY`.

## 6. Turnstile

Create a Turnstile widget for `monthmemo.com`. The site key goes into `TURNSTILE_SITE_KEY` (production vars) and into
`VITE_TURNSTILE_SITE_KEY` for the web build; the secret key goes into `TURNSTILE_SECRET_KEY`.

## 7. Model provider spend

Required: set a monthly spend limit on the model provider's organisation before the key is used in production. The worker also
caps spend (`LLM_DAILY_USD_CAP`, `LLM_AGENCY_DAILY_USD_CAP`), but the provider-side limit is the backstop. Without the key in
production every narrative fails: the template writer is dev-only (`DEV_ROUTES=1`).

## 8. Build and deploy

```sh
VITE_TURNSTILE_SITE_KEY=<site key> pnpm --dir apps/web build
cd apps/worker && pnpm wrangler deploy --env production
```

## 9. 10-minute smoke test

1. Open `https://monthmemo.com/` and check the landing page and `/pricing` load; response headers include
   `Content-Security-Policy` and `Strict-Transport-Security`.
2. `curl -i https://monthmemo.com/dev/outbox` answers 404 (dev routes are off).
3. Sign in with Google (the Turnstile widget appears), create the agency.
4. Connect Google Analytics and Search Console, add one client with a GA4 property or a Search Console site.
5. Start the free month through the Paddle checkout (try it in the Paddle sandbox first).
6. Check the Paddle webhook delivery log shows 200, and the agency's plan is active on `/app/billing`.
7. Send yourself a test: check the unsubscribe link in an email opens the confirm page.
8. Watch `pnpm wrangler tail --env production` for the first minute cron; no `Unhandled request error` lines.

## Dependency audit

`pnpm audit --prod` reports no high or critical advisories at the time of writing. If a later run does, record the
package, the advisory and the reason it is accepted here before deploying.
