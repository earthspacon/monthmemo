export type Plan = "starter" | "growth";

export type PlanConfig = {
  label: string;
  priceCents: number;
  clientLimit: number;
};

export const PLANS: Record<Plan, PlanConfig> = {
  starter: {
    label: "Starter",
    priceCents: 900,
    clientLimit: 10,
  },
  growth: {
    label: "Growth",
    priceCents: 1900,
    clientLimit: 30,
  },
};

export const TRIAL_DAYS = 30;
