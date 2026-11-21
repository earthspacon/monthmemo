import { PLANS } from "@monthmemo/contract";
import { Link } from "react-router-dom";

import { PlanCards } from "../pricing/PlanCards";
import { BUTTON_PRIMARY } from "../shared/ui";
import { START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

export const PricingSection = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-center text-2xl font-semibold">Pricing</h2>
      <PlanCards
        renderAction={(plan) => {
          return (
            <Link to="/sign-in" className={BUTTON_PRIMARY}>
              {START_CTA} · {PLANS[plan].label}
            </Link>
          );
        }}
      />
    </div>
  );
};

export const PricingPage = () => {
  return (
    <SiteLayout>
      <div className="space-y-8">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Simple pricing for small agencies</h1>
          <p className="text-slate-600">
            The first month is free, no card. Pick a plan by the number of clients you report on. Cancel any time.
          </p>
        </div>
        <PricingSection />
      </div>
    </SiteLayout>
  );
};
