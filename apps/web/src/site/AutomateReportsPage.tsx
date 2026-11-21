import { Link } from "react-router-dom";

import { BUTTON_PRIMARY } from "../shared/ui";
import { HOW_IT_WORKS, PROBLEM_POINTS, START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

export const AutomateReportsPage = () => {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Automate your GA4 and Search Console client reports</h1>
          <p className="text-slate-700">
            Every month the same chore: open GA4, open Search Console, copy the numbers, then try to explain them.
            MonthMemo does the pull and the first draft of the explanation, and leaves the decision to you.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">The problem</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {PROBLEM_POINTS.map((point) => {
              return <li key={point}>{point}</li>;
            })}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Three steps</h2>
          <ol className="list-decimal space-y-3 pl-5">
            {HOW_IT_WORKS.map((step) => {
              return (
                <li key={step.title}>
                  <span className="font-medium">{step.title}.</span> <span className="text-slate-700">{step.text}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <Link to="/sign-in" className={BUTTON_PRIMARY}>
          {START_CTA}
        </Link>
      </article>
    </SiteLayout>
  );
};
