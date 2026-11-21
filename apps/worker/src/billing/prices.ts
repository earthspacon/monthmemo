import type { Plan } from "@monthmemo/contract";

import type { Env } from "../env";

export function buildPriceTable(env: Env): Record<Plan, string | null> {
  return {
    starter: env.PADDLE_PRICE_STARTER || null,
    growth: env.PADDLE_PRICE_GROWTH || null,
  };
}

export function findPlanByPrice({ env, priceId }: { env: Env; priceId: string | null }): Plan | null {
  if (!priceId) {
    return null;
  }
  const table = buildPriceTable(env);
  const plans: Plan[] = ["starter", "growth"];
  return (
    plans.find((plan) => {
      return table[plan] === priceId;
    }) ?? null
  );
}
