import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";
import { JOBS_CRON, processPendingReports } from "./reports/jobs";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  scheduled: async (controller, env, ctx) => {
    if (controller.cron === JOBS_CRON) {
      await processPendingReports({ deps: createDeps({ env, ctx }) });
    }
  },
} satisfies ExportedHandler<Env>;
