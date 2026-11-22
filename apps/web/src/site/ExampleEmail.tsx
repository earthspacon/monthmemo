import { EXAMPLE_REPORT } from "./config";

export const ExampleLabel = () => {
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Example</span>;
};

// A made-up report for the made-up "Example Bakery": what the client's inbox shows after the agency approves.
export const ExampleEmail = () => {
  return (
    <div className="force-light overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span className="truncate">{EXAMPLE_REPORT.subject}</span>
        <ExampleLabel />
      </div>
      <div className="space-y-4 p-4">
        <p className="text-sm font-semibold text-brand-ink">{EXAMPLE_REPORT.client}</p>
        <p className="text-xs text-slate-500">{EXAMPLE_REPORT.period}</p>
        <p className="text-sm leading-6 text-slate-700">{EXAMPLE_REPORT.narrative}</p>
        <dl className="grid grid-cols-3 gap-2">
          {EXAMPLE_REPORT.stats.map((stat) => {
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
    </div>
  );
};
