# @monthmemo/worker

Cloudflare Worker behind MonthMemo: Google sign-in and data connection, clients, the monthly report run, sending,
unsubscribe links and Paddle billing.

## Run locally

```sh
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm dev
```

`DEV_ROUTES=1` turns on the `/dev/*` helpers and `GOOGLE_FAKE=1` makes the Google client read `fixtures/google/*.json`
instead of calling Google.

## Tests

```sh
pnpm test
pnpm exec vitest run -t 'MM-R19[ .]'
```

Tests run inside workerd with the D1 migrations applied. Every outbound call (Google, the LLM API, Resend, Paddle,
Turnstile) is answered by `test/fakes.ts`; an unexpected URL throws, so no test reaches a real service. Test names start
with the id of the behaviour they cover, so `-t` selects one behaviour.

## Crons

| Schedule    | Job                                                                   |
| ----------- | --------------------------------------------------------------------- |
| `0 6 4 * *` | Monthly run: one pending report per active client for the past month. |
| `* * * * *` | Report jobs: metrics and narrative for pending reports, then sending. |
| `0 * * * *` | Maintenance: expire ended trials, clear old rate-limit rows.          |
