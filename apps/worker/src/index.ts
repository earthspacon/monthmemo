import { handleRequest } from "./app";
import { createDeps } from "./deps";
import type { Env } from "./env";

export default {
  fetch: async (request, env, ctx) => {
    return handleRequest({ deps: createDeps({ env, ctx }), request });
  },

  scheduled: async () => {},
} satisfies ExportedHandler<Env>;
