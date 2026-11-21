import { PLANS, type BillingDto, type Plan } from "@monthmemo/contract";

import { createPortalSession, getPaddleEnvironment } from "../billing/paddle-api";
import { buildPriceTable } from "../billing/prices";
import { HttpError, json, route, type Route } from "../http";
import { clientLimitOf, getBillingRow } from "../repo/agencies";
import type { ApiContext } from "./context";

const PLAN_ORDER: Plan[] = ["starter", "growth"];

export const billingRoutes: Route<ApiContext>[] = [
  route("GET", "/api/billing", async ({ deps, agency }) => {
    const prices = buildPriceTable(deps.env);
    const body: BillingDto = {
      plan: agency.plan,
      status: agency.status,
      trialEndsAt: agency.trialEndsAt,
      clientLimit: clientLimitOf(agency.plan),
      plans: PLAN_ORDER.map((plan) => {
        return {
          plan,
          priceCents: PLANS[plan].priceCents,
          clientLimit: PLANS[plan].clientLimit,
          paddlePriceId: prices[plan] ?? "",
        };
      }),
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
