import { PLAN, type MeDto } from "@monthmemo/contract";

import { json, route, type Route } from "../http";
import { countClients } from "../repo/agencies";
import type { ApiContext } from "./context";

export const meRoutes: Route<ApiContext>[] = [
  route("GET", "/api/me", async ({ deps, user, agency }) => {
    const me: MeDto = {
      email: user.email,
      agency: {
        id: agency.id,
        status: agency.status,
        trialEndsAt: agency.trialEndsAt,
        clientLimit: PLAN.clientLimit,
        clientCount: await countClients({ db: deps.db, agencyId: agency.id }),
      },
    };
    return json(me);
  }),
];
