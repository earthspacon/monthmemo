# MonthMemo web app

React + Vite single-page app for agencies: sign in, connect Google, manage clients, set the brand, approve monthly emails and pick a plan.

## Commands

```sh
pnpm --dir apps/web dev        # Vite dev server
pnpm --dir apps/web build      # typecheck and production build into dist/
pnpm --dir apps/web typecheck  # tsc --noEmit
pnpm --dir apps/web test:e2e   # browser tests in e2e/*.e2e.ts
```

## End-to-end tests

The browser tests drive headless Chromium against the built app and a local worker. Test data is seeded through the worker's dev-only routes (`/dev/session`, `/dev/google`, `/dev/reports`, `/dev/run`), so the worker must be started in dev mode. Set `CHROME_PATH` to use a specific Chromium binary.

Helpers in `e2e/helpers.ts`:

- `delayApi` / `failApi` hold or fail API calls to show loading and error states;
- `expectNoHorizontalScroll(page)` checks that a page fits a 390 px wide phone screen.
