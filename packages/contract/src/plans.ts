export type BillingPeriod = "monthly" | "yearly";

export type PlanConfig = {
  priceCents: number;
  yearlyPriceCents: number;
  clientLimit: number;
};

// MonthMemo sells one paid plan, $4 a month or $40 a year (2 months free); every price and limit on the site, in the
// app and in billing comes from here.
export const PLAN: PlanConfig = {
  priceCents: 400,
  yearlyPriceCents: 4000,
  clientLimit: 15,
};

export const TRIAL_DAYS = 30;
