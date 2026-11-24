import type { BillingPeriod } from "@monthmemo/contract";
import { useUnit } from "effector-react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "../shared/ui";
import { BILLING_PERIODS, PERIOD_LABELS, PLAN_FEATURES, PLAN_PRICES } from "../site/config";
import { $period, periodSelected } from "./model";

// The one plan; `action` puts a button under it (the pricing section, the billing page) or nothing.
export const PlanCard = ({ action }: { action?: ReactNode }) => {
  const { period } = useUnit({
    period: $period,
  });

  return (
    <Card className="mx-auto w-full max-w-sm space-y-5 p-6 sm:p-8">
      <PeriodSwitch period={period} />
      {/* Both prices are in the prerendered page so switching never moves the card. */}
      {BILLING_PERIODS.map((option) => {
        return (
          <p key={option} hidden={option !== period} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-4xl font-semibold tracking-tight">{PLAN_PRICES[option].price}</span>
            <span className="text-sm text-slate-600">{PLAN_PRICES[option].line}</span>
          </p>
        );
      })}
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

const PeriodSwitch = ({ period }: { period: BillingPeriod }) => {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="group" aria-label="Billing period">
      {BILLING_PERIODS.map((option) => {
        const isActive = option === period;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => periodSelected(option)}
            className={`min-h-11 rounded-md px-4 font-medium ${isActive ? "bg-surface text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
          >
            {PERIOD_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
};
