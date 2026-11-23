import type { Env } from "../env";

// The Paddle price id of the one plan, or null while it isn't set up.
export function planPriceId(env: Env) {
  return env.PADDLE_PRICE || null;
}

export function isPlanPrice({ env, priceId }: { env: Env; priceId: string | null }) {
  const planPrice = planPriceId(env);
  return planPrice !== null && priceId === planPrice;
}
