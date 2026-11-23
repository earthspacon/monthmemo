import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";
import { PLAN_FEATURES, PLAN_PRICE, PLAN_PRICE_LINE } from "../site/config";

// The one plan; `action` puts a button under it (the pricing section, the billing page) or nothing.
export const PlanCard = ({ action }: { action?: ReactNode }) => {
  return (
    <Card className="mx-auto w-full max-w-sm space-y-5 p-6 sm:p-8">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-4xl font-semibold tracking-tight">{PLAN_PRICE}</span>
        <span className="text-sm text-slate-600">{PLAN_PRICE_LINE}</span>
      </p>
      <ul className="space-y-2.5">
        {PLAN_FEATURES.map((feature) => {
          return (
            <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden="true" />
              {feature}
            </li>
          );
        })}
      </ul>
      {action}
    </Card>
  );
};
