import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";
import { JOBS_CRON, processPendingReports } from "./reports/jobs";
import { MONTHLY_RUN_CRON, runMonthlyReports } from "./reports/run";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  scheduled: async (controller, env, ctx) => {
    const deps = createDeps({ env, ctx });

    if (controller.cron === MONTHLY_RUN_CRON) {
      await runMonthlyReports({ deps, scheduledTime: controller.scheduledTime });
      return;
    }
    if (controller.cron === JOBS_CRON) {
      await processPendingReports({ deps });
    }
  },
} satisfies ExportedHandler<Env>;
