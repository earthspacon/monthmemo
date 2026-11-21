import type { Deps } from "./deps";
import { expireTrials } from "./repo/agencies";
import { purgeOldRateLimitHits } from "./repo/shield";

export const MAINTENANCE_CRON = "0 * * * *";

// Hourly: trials past their end become expired, and old rate-limit hits go.
export async function runMaintenance({ deps, now }: { deps: Pick<Deps, "db">; now: Date }) {
  const expired = await expireTrials({ db: deps.db, now });
  await purgeOldRateLimitHits({ db: deps.db, now });
  return { expired };
}
