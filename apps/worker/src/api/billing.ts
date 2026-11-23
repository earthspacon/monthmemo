import { PLAN, type BillingDto } from "@monthmemo/contract";

import { createPortalSession, getPaddleEnvironment } from "../billing/paddle-api";
import { planPriceId } from "../billing/prices";
import { HttpError, json, route, type Route } from "../http";
import { getBillingRow } from "../repo/agencies";
import type { ApiContext } from "./context";

export const billingRoutes: Route<ApiContext>[] = [
  route("GET", "/api/billing", async ({ deps, agency }) => {
    const body: BillingDto = {
      status: agency.status,
      trialEndsAt: agency.trialEndsAt,
      priceCents: PLAN.priceCents,
      clientLimit: PLAN.clientLimit,
      paddlePriceId: planPriceId(deps.env) ?? "",
      paddleClientToken: deps.env.PADDLE_CLIENT_TOKEN ?? "",
      paddleEnv: getPaddleEnvironment(deps.env),
    };
    return json(body);
  }),

  route("POST", "/api/billing/portal", async ({ deps, agency }) => {
    const row = await getBillingRow({ db: deps.db, agencyId: agency.id });

    if (!row?.paddleCustomerId) {
      throw new HttpError(409, "no_customer", "There is no Paddle subscription to manage yet");
    }
    if (!deps.env.PADDLE_API_KEY) {
      throw new HttpError(503, "billing_unavailable", "Billing isn't configured on this server");
    }
    const url = await createPortalSession({
      env: deps.env,
      apiKey: deps.env.PADDLE_API_KEY,
      customerId: row.paddleCustomerId,
      subscriptionId: row.paddleSubscriptionId,
    });
    return json({ url });
  }),
];
