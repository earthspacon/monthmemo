import { useUnit } from "effector-react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { TurnstileWidget } from "../session/TurnstileWidget";
import { BUTTON_PRIMARY, Banner, Card, INPUT } from "../shared/ui";
import { SiteLayout } from "../site/SiteLayout";
import { FIELD_LABELS, MONTH_FIELDS, MONTH_LABELS, type MonthKey, type SummaryResult } from "./lib";
import {
  $form,
  $formError,
  $result,
  $turnstileRound,
  $turnstileToken,
  clientNameChanged,
  monthFieldChanged,
  summarizeClicked,
  summarizeFx,
  turnstileExpired,
  turnstileSolved,
} from "./model";

const MONTHS: MonthKey[] = ["thisMonth", "lastMonth"];
const CLIENT_NAME_MAX = 80;
const TOP_PAGE_MAX = 200;
const COUNT_MAX = 20;
const CTA_LABEL = "Get this for every client on the 4th";

const FAQ = [
  {
    question: "Where do I find these numbers?",
    answer:
      "In Google Analytics, open Reports, then Acquisition and Pages and screens, and set the date to one full month. Search clicks are on the Performance page of Search Console.",
  },
  {
    question: "Is anything I type saved?",
    answer:
      "No. Your numbers and the summary are not stored. We keep a scrambled version of your IP address for 24 hours, only to count the daily limit.",
  },
  {
    question: "How many can I make?",
    answer:
      "10 summaries per day from one internet connection. If a lot of people use it on the same day, it can pause until tomorrow.",
  },
  {
    question: "Do I have to connect Google?",
    answer:
      "Not here. You type the numbers yourself. The paid version pulls them for each client and writes the email for you.",
  },
];

export const ReportSummaryToolPage = () => {
  const { form, error, result, token, round, isWriting } = useUnit({
    form: $form,
    error: $formError,
    result: $result,
    token: $turnstileToken,
    round: $turnstileRound,
    isWriting: summarizeFx.pending,
  });

  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Turn last month's GA4 numbers into a client-ready paragraph
          </h1>
          <p className="text-slate-700">
            Type four numbers for this month and last month. You get a short, plain summary you can paste into your
            client email. Free, no sign-up, up to 10 summaries a day.
          </p>
        </header>

        <Card className="space-y-5 p-4 sm:p-6">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              summarizeClicked();
            }}
          >
            <label className="block text-sm font-medium text-slate-700">
              Client name
              <input
                className={INPUT}
                value={form.clientName}
                maxLength={CLIENT_NAME_MAX}
                placeholder="Your client"
                onChange={(event) => clientNameChanged(event.target.value)}
              />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              {MONTHS.map((month) => {
                return (
                  <fieldset key={month} className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-900">{MONTH_LABELS[month]}</legend>
                    {MONTH_FIELDS.map((field) => {
                      return (
                        <label key={field} className="block text-sm font-medium text-slate-700">
                          {FIELD_LABELS[field]}
                          <input
                            className={INPUT}
                            value={form[month][field]}
                            maxLength={field === "topPage" ? TOP_PAGE_MAX : COUNT_MAX}
                            inputMode={field === "topPage" ? "url" : "numeric"}
                            onChange={(event) => monthFieldChanged({ month, field, value: event.target.value })}
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                );
              })}
            </div>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <TurnstileWidget round={round} onSolved={turnstileSolved} onExpired={turnstileExpired} />
            <button type="submit" className={`${BUTTON_PRIMARY} w-full sm:w-auto`} disabled={token === "" || isWriting}>
              {isWriting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isWriting ? "Writing…" : "Write the summary"}
            </button>
            <p className="text-xs text-slate-500">
              Limit: 10 free summaries per day from one connection. Nothing you type is saved.
            </p>
          </form>
        </Card>

        {result ? <SummaryCard result={result} /> : null}

        <section className="space-y-3 rounded-xl bg-brand-50 p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Skip the typing next month</h2>
          <p className="text-slate-700">
            MonthMemo pulls these numbers for each client, writes the email and waits for your approval before it goes
            out.
          </p>
          <Link to="/pricing" className={BUTTON_PRIMARY}>
            {CTA_LABEL}
          </Link>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Questions</h2>
          <dl className="space-y-4">
            {FAQ.map((item) => {
              return (
                <div key={item.question}>
                  <dt className="font-medium">{item.question}</dt>
                  <dd className="text-slate-700">{item.answer}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      </article>
    </SiteLayout>
  );
};

const SummaryCard = ({ result }: { result: SummaryResult }) => {
  return (
    <section aria-live="polite" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 p-4">
        <p className="text-sm font-semibold text-brand-700">{result.clientName}</p>
        <p className="text-xs text-slate-500">{result.period}</p>
        <p className="text-sm leading-6 whitespace-pre-line text-slate-700">{result.narrative}</p>
        <dl className="grid grid-cols-3 gap-2">
          {result.stats.map((stat) => {
            return (
              <div key={stat.label} className="rounded-lg bg-slate-50 p-2">
                <dt className="text-xs text-slate-500">{stat.label}</dt>
                <dd className="text-base font-semibold">{stat.value}</dd>
                <dd className="text-xs text-slate-600">{stat.change}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
};
