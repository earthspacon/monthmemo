import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { E2E_PORT } from "./config";
import { startWorker, WORKER_DIR, type RunningWorker } from "./worker";

const WEB_DIR = path.resolve(import.meta.dirname, "..");

let worker: RunningWorker | null = null;

// A missing or broken Worker must not abort the run: each test then fails on its own request,
// so the report still lists every test.
export async function setup() {
  if (!existsSync(path.join(WORKER_DIR, "wrangler.toml"))) {
    console.warn("e2e: apps/worker has no wrangler.toml yet, every test will fail to connect");
    return;
  }
  try {
    execFileSync("pnpm", ["exec", "vite", "build"], {
      cwd: WEB_DIR,
      stdio: "ignore",
    });
    worker = await startWorker({ port: E2E_PORT });
  } catch (error) {
    console.warn(`e2e: the Worker did not start (${error instanceof Error ? error.message : "unknown error"})`);
  }
}

export async function teardown() {
  worker?.stop();
}
