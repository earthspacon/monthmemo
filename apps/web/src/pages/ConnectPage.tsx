import { useGate, useUnit } from "effector-react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  $connecting,
  $connectView,
  $googleStatus,
  $googleStatusError,
  connectClicked,
  ConnectGate,
  googleStatusRequested,
} from "../connect/model";
import { BUTTON_PRIMARY, Card, ErrorState, PageHeader, SkeletonRows } from "../shared/ui";

const CONNECT_LABEL = "Connect Google Analytics and Search Console";
const SOURCES = [
  { key: "ga4", label: "Google Analytics" },
  { key: "gsc", label: "Search Console" },
] as const;

const SourceRow = ({ label, granted }: { label: string; granted: boolean }) => {
  if (granted) {
    return (
      <li className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="size-5 shrink-0" />
        <span>{label} connected</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-amber-800">
      <XCircle className="size-5 shrink-0" />
      <span>{label} access was not granted</span>
    </li>
  );
};

const ConnectButton = ({ label }: { label: string }) => {
  const { connecting, connect } = useUnit({ connecting: $connecting, connect: connectClicked });

  return (
    <button type="button" className={BUTTON_PRIMARY} disabled={connecting} onClick={() => connect()}>
      {label}
    </button>
  );
};

const Explainer = () => {
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <p>
        MonthMemo reads last month's numbers from your clients' Google Analytics 4 properties and Search Console sites
        to write their monthly reports.
      </p>
      <p>Access is read-only: MonthMemo never changes anything in your Google accounts.</p>
    </div>
  );
};

const CallbackError = ({ title }: { title: string }) => {
  return (
    <Card className="space-y-4 p-6">
      <p className="flex items-center gap-2 font-medium text-rose-800">
        <AlertTriangle className="size-5 shrink-0" />
        {title}
      </p>
      <Explainer />
      <ConnectButton label="Try again" />
    </Card>
  );
};

const SourcesCard = () => {
  const { status, view } = useUnit({ status: $googleStatus, view: $connectView });

  return (
    <Card className="space-y-4 p-6">
      <ul className="space-y-2 text-sm font-medium">
        {SOURCES.map((source) => {
          return <SourceRow key={source.key} label={source.label} granted={status[source.key]} />;
        })}
      </ul>
      {view === "partial" && (
        <div className="space-y-3 text-sm text-slate-600">
          <p>Clients can only use the source you granted. Reconnect and tick both boxes on Google's screen.</p>
          <ConnectButton label="Reconnect" />
        </div>
      )}
      <Link to="/app/clients" className={BUTTON_PRIMARY}>
        Add your first client
      </Link>
    </Card>
  );
};

export const ConnectPage = () => {
  const [searchParams] = useSearchParams();
  useGate(ConnectGate, { callbackError: searchParams.get("error") });
  const { view, error, retry } = useUnit({
    view: $connectView,
    error: $googleStatusError,
    retry: googleStatusRequested,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Google connection" subtitle="Reports are built from Google Analytics and Search Console." />
      {view === "loading" && <SkeletonRows rows={2} />}
      {view === "error" && <ErrorState message={error} onRetry={() => retry()} />}
      {view === "denied" && <CallbackError title="Google access was not granted" />}
      {view === "failed" && <CallbackError title="Google didn't finish connecting" />}
      {view === "empty" && (
        <Card className="space-y-4 p-6">
          <Explainer />
          <ConnectButton label={CONNECT_LABEL} />
        </Card>
      )}
      {(view === "partial" || view === "connected") && <SourcesCard />}
    </div>
  );
};
