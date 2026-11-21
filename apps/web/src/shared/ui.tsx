import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50";
export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const BUTTON_DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50";
export const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

const SKELETON_ROWS = 3;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
};

export const PageHeader = ({ title, subtitle }: { title: string; subtitle?: ReactNode }) => {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
};

export const LoadingState = ({ label = "Loading…" }: { label?: string }) => {
  return (
    <Card className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
      <span role="status" aria-label="Loading" className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        {label}
      </span>
    </Card>
  );
};

// Placeholder rows while a list loads; one status landmark so screen readers announce it once.
export const SkeletonRows = ({ rows = SKELETON_ROWS }: { rows?: number }) => {
  return (
    <Card className="space-y-3 p-4">
      <div role="status" aria-label="Loading" className="space-y-3">
        {Array.from({ length: rows }, (_, index) => {
          return <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />;
        })}
      </div>
    </Card>
  );
};

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => {
  return (
    <Card className="space-y-3 p-8 text-center text-sm">
      <p className="flex items-center justify-center gap-2 font-medium text-rose-700">
        <AlertTriangle className="size-4" />
        {message}
      </p>
      <button type="button" onClick={onRetry} className={BUTTON_SECONDARY}>
        Retry
      </button>
    </Card>
  );
};

export const Banner = ({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) => {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${BANNER_TONES[tone]}`}>{children}</div>;
};

export function formatDate(iso: string) {
  return DATE_FORMAT.format(new Date(iso));
}

export function formatDay(iso: string) {
  return DAY_FORMAT.format(new Date(iso));
}

const BANNER_TONES = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  info: "border-brand-100 bg-brand-50 text-brand-700",
};
