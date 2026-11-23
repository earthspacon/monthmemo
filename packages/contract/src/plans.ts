export type PlanConfig = {
  priceCents: number;
  clientLimit: number;
};

// MonthMemo sells one paid plan; every price and limit on the site, in the app and in billing comes from here.
export const PLAN: PlanConfig = {
  priceCents: 400,
  clientLimit: 15,
};

export const TRIAL_DAYS = 30;
