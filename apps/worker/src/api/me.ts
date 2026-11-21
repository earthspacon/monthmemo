import type { MeDto } from "@monthmemo/contract";

import { json, route, type Route } from "../http";
import { clientLimitOf, countClients } from "../repo/agencies";
import type { ApiContext } from "./context";

export const meRoutes: Route<ApiContext>[] = [
  route("GET", "/api/me", async ({ deps, user, agency }) => {
    const me: MeDto = {
      email: user.email,
      agency: {
        id: agency.id,
        plan: agency.plan,
        status: agency.status,
        trialEndsAt: agency.trialEndsAt,
        clientLimit: clientLimitOf(agency.plan),
        clientCount: await countClients({ db: deps.db, agencyId: agency.id }),
      },
    };
    return json(me);
  }),
];
