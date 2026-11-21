import { PLANS } from "@monthmemo/contract";

import type { Deps } from "../deps";
import { insertPendingReports, listClientsWithinLimit, listRunnableAgencies } from "../repo/reports";

export const MONTHLY_RUN_CRON = "0 6 4 * *";

const FIRST_DAY_OF_MONTH = 1;

// The run on the 4th reports on the previous calendar month in UTC (D6).
export function periodOf({ date }: { date: Date }) {
  const previousMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, FIRST_DAY_OF_MONTH));
  return previousMonth.toISOString().slice(0, 7);
}

// Only inserts pending rows: the minute job does the Google and model calls in small batches (D8).
export async function runMonthlyReports({ deps, scheduledTime }: { deps: Deps; scheduledTime: number }) {
  const period = periodOf({ date: new Date(scheduledTime) });
  const now = deps.now().toISOString();
  const agencies = await listRunnableAgencies({ db: deps.db });

  for (const agency of agencies) {
    const clients = await listClientsWithinLimit({
      db: deps.db,
      agencyId: agency.id,
      limit: PLANS[agency.plan].clientLimit,
    });
    await insertPendingReports({
      db: deps.db,
      agencyId: agency.id,
      period,
      clientIds: clients.map((client) => client.id),
      now,
    });
  }
  return { period };
}