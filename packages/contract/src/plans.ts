export type Plan = "starter" | "growth";

export type PlanConfig = {
  label: string;
  priceCents: number;
  clientLimit: number;
};

export const PLANS: Record<Plan, PlanConfig> = {
  starter: {
    label: "Starter",
    priceCents: 2900,
    clientLimit: 5,
  },
  growth: {
    label: "Growth",
    priceCents: 5900,
    clientLimit: 15,
  },
};

export const TRIAL_DAYS = 30;
