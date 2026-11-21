import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";
import { isMaintenanceTick, runMaintenance } from "./maintenance";
import { processPendingReports } from "./reports/jobs";
import { isMonthlyRunTick, runMonthlyReports } from "./reports/run";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  scheduled: async (controller, env, ctx) => {
    const deps = createDeps({ env, ctx });
    const at = new Date(controller.scheduledTime);

    // Three products share the Free plan's 5 cron triggers, so one minute trigger runs every job.
    // The top-of-hour tick does the hourly work instead of the minute job, keeping each invocation within its limits.
    if (!isMaintenanceTick({ at })) {
      await processPendingReports({ deps });
      return;
    }
    await runMaintenance({ deps, now: at });
    if (isMonthlyRunTick({ at })) {
      await runMonthlyReports({ deps, scheduledTime: controller.scheduledTime });
    }
  },
} satisfies ExportedHandler<Env>;
