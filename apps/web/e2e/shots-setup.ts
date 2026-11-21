import { E2E_PORT } from "./config";
import { startWorker, type RunningWorker } from "./worker";

let worker: RunningWorker | null = null;

// Serves the already built `dist` (run `pnpm build` first): a plain vite build would drop the prerendered pages.
export async function setup() {
  worker = await startWorker({ port: E2E_PORT });
}

export async function teardown() {
  worker?.stop();
}
