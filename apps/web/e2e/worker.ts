import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PADDLE_TEST_CLIENT_TOKEN,
  PADDLE_TEST_PRICE_GROWTH,
  PADDLE_TEST_PRICE_STARTER,
  PADDLE_TEST_SECRET,
  TURNSTILE_TEST_SECRET,
} from "./config";

export const WORKER_DIR = path.resolve(import.meta.dirname, "../../worker");
const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 500;

export type RunningWorker = {
  url: string;
  stop: () => void;
};

// `wrangler dev` on a fresh local D1, serving the built SPA, with dev routes and the Google fixtures switched on.
export async function startWorker({
  port,
  vars = {},
}: {
  port: number;
  vars?: Record<string, string>;
}): Promise<RunningWorker> {
  const url = `http://localhost:${port}`;
  const persistDir = mkdtempSync(path.join(tmpdir(), "monthmemo-e2e-"));
  execFileSync("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistDir], {
    cwd: WORKER_DIR,
    stdio: "ignore",
  });
  const allVars: Record<string, string> = {
    DEV_ROUTES: "1",
    GOOGLE_FAKE: "1",
    APP_URL: url,
    BETTER_AUTH_SECRET: "e2e-only-secret-that-is-at-least-32-chars",
    GOOGLE_CLIENT_ID: "e2e-google-client-id",
    GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
    PADDLE_WEBHOOK_SECRET: PADDLE_TEST_SECRET,
    PADDLE_CLIENT_TOKEN: PADDLE_TEST_CLIENT_TOKEN,
    PADDLE_PRICE_STARTER: PADDLE_TEST_PRICE_STARTER,
    PADDLE_PRICE_GROWTH: PADDLE_TEST_PRICE_GROWTH,
    TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
    ...vars,
  };
  const server: ChildProcess = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--port",
      String(port),
      "--persist-to",
      persistDir,
      ...Object.entries(allVars).flatMap(([name, value]) => {
        return ["--var", `${name}:${value}`];
      }),
    ],
    {
      cwd: WORKER_DIR,
      stdio: "ignore",
      detached: true,
    },
  );
  const stop = () => {
    if (server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    rmSync(persistDir, { recursive: true, force: true });
  };

  try {
    await waitForServer(url);
  } catch (error) {
    stop();
    throw error;
  }
  return { url, stop };
}

// Any HTTP answer means wrangler is listening; the routes themselves are what the tests check.
async function waitForServer(url: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const ready = await fetch(`${url}/api/me`)
      .then(() => true)
      .catch(() => false);
    if (ready) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
  throw new Error(`wrangler dev did not start on ${url}`);
}
