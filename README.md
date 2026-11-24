# MonthMemo

MonthMemo writes the monthly report a small marketing agency sends its clients. The agency connects Google Analytics 4
and Search Console once, adds its clients, and on the 4th of every month MonthMemo builds a draft per client: the numbers
plus a short plain-English narrative of up to 150 words. The agency approves or skips each draft and the branded HTML
email goes out to the client's recipients. Billing is through Paddle, with a free first month.

Live at [monthmemo.spacesonlabs.com](https://monthmemo.spacesonlabs.com). TypeScript end to end: a React + Effector + Tailwind app, a Cloudflare Worker on D1 with Cron Triggers for the monthly run, the GA4 and Search Console APIs, Groq for the narrative, Brevo for mail and Paddle for billing. Tested with Vitest (the worker tests run inside workerd) and Playwright flows against a real build.

## Layout

- `apps/worker` is the Cloudflare Worker: Google sign-in, data connection, clients, monthly run, narrative, sending,
  unsubscribe links and Paddle billing, on D1. Its routes are listed in `apps/worker/API.md`.
- `apps/web` is the React app and the public site (landing, pricing, legal pages), prerendered at build time.
- `packages/contract` holds the types shared by the two.
- `DEPLOY.md` is the production runbook.

## Run locally

```sh
pnpm install
cd apps/worker
cp .dev.vars.example .dev.vars   # fill in the keys you have; DEV_ROUTES=1 and GOOGLE_FAKE=1 need none
pnpm db:migrate
pnpm wrangler dev                # the API on http://localhost:8787
```

In a second terminal run `pnpm --dir apps/web dev` for the app with hot reload.

## Tests

- `pnpm test` runs every package's unit and integration tests (the worker's run inside workerd against a local D1).
- `pnpm typecheck` type-checks all packages.
- `pnpm --dir apps/web test:e2e` runs the browser tests against a local `wrangler dev` with the fake Google client.

## License

MIT, see [LICENSE](LICENSE).
