import type { Env } from "../env";

// The Paddle price id of the one plan, or null while it isn't set up.
export function planPriceId(env: Env) {
  return env.PADDLE_PRICE || null;
}

// The same plan billed yearly, or null while it isn't set up.
export function planYearlyPriceId(env: Env) {
  return env.PADDLE_PRICE_YEARLY || null;
}

// The monthly and the yearly price both buy the one plan.
export function isPlanPrice({ env, priceId }: { env: Env; priceId: string | null }) {
  return priceId !== null && [planPriceId(env), planYearlyPriceId(env)].includes(priceId);
}
