import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { chromium } from "playwright";

// InboxSieve e2e uses 8790-8792 and PriceDawn 8795-8796; their runs can share this box.
export const E2E_PORT = 8798;
export const E2E_URL = `http://localhost:${E2E_PORT}`;
export const PADDLE_TEST_SECRET = "pdl_ntfset_e2e_test_secret";
export const PADDLE_TEST_CLIENT_TOKEN = "test_e2e_client_token";
export const PADDLE_TEST_PRICE = "pri_e2e_monthly";
export const PADDLE_TEST_YEARLY_PRICE = "pri_e2e_yearly";
// Cloudflare's "always passes" Turnstile secret; the SPA build uses the matching test sitekey.
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const BROWSERS_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(homedir(), ".cache", "ms-playwright");
const HEADLESS_SHELL_PREFIX = "chromium_headless_shell-";
const HEADLESS_SHELL_BINARY = path.join("chrome-headless-shell-linux64", "chrome-headless-shell");

// CHROME_PATH wins; else Playwright's own browser; else the newest headless shell already in its cache,
// so a Playwright patch release does not force a browser download before the suite can run.
export function findChromePath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  if (existsSync(chromium.executablePath()) || !existsSync(BROWSERS_DIR)) {
    return undefined;
  }
  const cached = readdirSync(BROWSERS_DIR)
    .filter((name) => {
      return name.startsWith(HEADLESS_SHELL_PREFIX);
    })
    .map((name) => {
      return path.join(BROWSERS_DIR, name, HEADLESS_SHELL_BINARY);
    })
    .filter((binary) => {
      return existsSync(binary);
    })
    .sort()
    .reverse();
  return cached[0];
}
