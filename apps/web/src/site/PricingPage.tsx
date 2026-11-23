import { Link } from "react-router-dom";

import { PlanCard } from "../pricing/PlanCard";
import { BUTTON_PRIMARY } from "../shared/ui";
import { START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

const PricingCard = () => {
  return (
    <PlanCard
      action={
        <Link to="/sign-in" className={`${BUTTON_PRIMARY} w-full`}>
          {START_CTA}
        </Link>
      }
    />
  );
};

export const PricingSection = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-center text-2xl font-semibold">Pricing</h2>
      <PricingCard />
    </div>
  );
};

export const PricingPage = () => {
  return (
    <SiteLayout>
      <div className="space-y-8">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Simple pricing for small agencies</h1>
          <p className="text-slate-600">One plan for every agency. The first month is free, no card needed.</p>
        </div>
        <PricingCard />
      </div>
    </SiteLayout>
  );
};
