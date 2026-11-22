import { PLANS, type Plan } from "@monthmemo/contract";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";

const PLAN_ORDER: Plan[] = ["starter", "growth"];
const CENTS_PER_DOLLAR = 100;

export function formatPrice(cents: number) {
  return `$${cents / CENTS_PER_DOLLAR}`;
}

// One card per plan from the shared plan table; `renderAction` puts a button under it (the billing page) or nothing.
export const PlanCards = ({ renderAction }: { renderAction?: (plan: Plan) => ReactNode }) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PLAN_ORDER.map((plan) => {
        const config = PLANS[plan];
        return (
          <Card key={plan} className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">{config.label}</h2>
            <p>
              <span className="text-3xl font-semibold">{formatPrice(config.priceCents)}</span>
              <span className="text-sm text-slate-600"> / month</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <Check className="size-4 text-brand-ink" />
              Up to {config.clientLimit} clients
            </p>
            {renderAction?.(plan)}
          </Card>
        );
      })}
    </div>
  );
};
