import { PLANS } from "@monthmemo/contract";
import { Link } from "react-router-dom";

import { BUTTON_PRIMARY } from "../shared/ui";
import {
  COMPARE_ROWS,
  COMPETITOR_CHECKED,
  COMPETITOR_PER_CLIENT_RANGE,
  COMPETITOR_SOURCES,
  GROWTH_PRICE,
  PER_CLIENT_RANGE,
  START_CTA,
  STARTER_PRICE,
} from "./config";
import { SiteLayout } from "./SiteLayout";

export const AgencyAnalyticsAlternativePage = () => {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">An AgencyAnalytics alternative for small agencies</h1>
          <p className="text-slate-700">
            AgencyAnalytics is a full reporting platform with dashboards for many data sources. If you run a handful of
            small clients on GA4 and Search Console, you pay per client for a lot you don't use. MonthMemo does one
            thing: it writes the monthly email.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Cost per client</h2>
          <p className="text-slate-700">
            MonthMemo is {STARTER_PRICE} a month for {PLANS.starter.clientLimit} clients or {GROWTH_PRICE} a month for{" "}
            {PLANS.growth.clientLimit}. That works out to {PER_CLIENT_RANGE} per client, against AgencyAnalytics'{" "}
            {COMPETITOR_PER_CLIENT_RANGE} per client.
          </p>
          <p className="text-sm text-slate-600">
            AgencyAnalytics lists $20 per client a month billed yearly and $25 billed monthly. Prices checked{" "}
            {COMPETITOR_CHECKED}; they may have changed. Sources:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {COMPETITOR_SOURCES.map((source) => {
              return (
                <li key={source.url}>
                  <a href={source.url} rel="noopener noreferrer nofollow" className="text-brand-700 underline">
                    {source.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Side by side</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 font-medium">MonthMemo</th>
                  <th className="px-3 py-2 font-medium">AgencyAnalytics</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => {
                  return (
                    <tr key={row.label} className="border-t border-slate-100">
                      <th className="px-3 py-2 font-medium">{row.label}</th>
                      <td className="px-3 py-2">{row.us}</td>
                      <td className="px-3 py-2">{row.them}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600">
            Choose AgencyAnalytics if you need live dashboards, ads data or many integrations. Choose MonthMemo if a
            clear monthly email is what your clients actually read.
          </p>
        </section>

        <Link to="/sign-in" className={BUTTON_PRIMARY}>
          {START_CTA}
        </Link>
      </article>
    </SiteLayout>
  );
};
