import { Link } from "react-router-dom";

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "../shared/ui";
import { BEFORE_ROWS, EXAMPLE_REPORT, FAQ, HERO, HOW_IT_WORKS } from "./config";
import { ExampleEmail, ExampleLabel } from "./ExampleEmail";
import { PricingSection } from "./PricingPage";
import { StartLink } from "./SessionLinks";
import { SiteLayout } from "./SiteLayout";

const BeforeSheet = () => {
  return (
    <div className="force-light overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span>{EXAMPLE_REPORT.client}_report_oct.xlsx</span>
        <ExampleLabel />
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="px-3 py-1.5 font-medium">Metric</th>
            <th className="px-3 py-1.5 font-medium">Oct</th>
            <th className="px-3 py-1.5 font-medium">Sep</th>
            <th className="px-3 py-1.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {BEFORE_ROWS.map((row) => {
            return (
              <tr key={row.metric} className="border-t border-slate-100 font-mono">
                <td className="px-3 py-1.5">{row.metric}</td>
                <td className="px-3 py-1.5">{row.thisMonth}</td>
                <td className="px-3 py-1.5">{row.lastMonth}</td>
                <td className="px-3 py-1.5 text-slate-400">{row.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const LandingPage = () => {
  return (
    <SiteLayout>
      <div className="space-y-16">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl tracking-tight">{HERO.title}</h1>
          <p className="text-lg text-slate-700">{HERO.subtitle}</p>
          <p className="text-slate-600">{HERO.detail}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <StartLink className={BUTTON_PRIMARY} />
            <Link to="/pricing" className={BUTTON_SECONDARY}>
              See pricing
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-center text-2xl font-semibold">From a spreadsheet to a client email</h2>
          <div className="grid items-start gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">Before: numbers pasted by hand</p>
              <BeforeSheet />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">After: the email your client reads</p>
              <ExampleEmail />
            </div>
          </div>
        </div>

        <section className="space-y-6">
          <h2 className="text-center text-2xl font-semibold">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => {
              return (
                <li key={step.title} className="space-y-2 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
                  <span className="text-sm font-semibold text-brand-ink">Step {index + 1}</span>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-slate-600">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <PricingSection />

        <section className="mx-auto max-w-3xl space-y-4">
          <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
          {FAQ.map((item) => {
            return (
              <div key={item.question} className="space-y-1">
                <h3 className="font-medium">{item.question}</h3>
                <p className="text-sm text-slate-600">{item.answer}</p>
              </div>
            );
          })}
        </section>
      </div>
    </SiteLayout>
  );
};
