import type { FailureReason, ReportListItemDto, ReportStatus } from "@monthmemo/contract";
import { useGate, useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { formatPeriod, formatSentDay, recipientLabel, STATUS_LABELS } from "../reports/format";
import { $reportsError, $reportsPage, $reportsStatus, ReportsGate, reportsRequested } from "../reports/model";
import { Card, ErrorState, PageHeader, SkeletonRows } from "../shared/ui";

const RUN_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const FAILURE_LABELS: Record<FailureReason, string> = {
  google_reconnect_needed: "Google access needs to be reconnected",
  source_not_found: "The Analytics property or Search Console site is unavailable",
  narrative_failed: "The summary could not be written",
  google_error: "Google returned an error",
};

const STATUS_TONES: Record<ReportStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  building: "bg-slate-100 text-slate-600",
  draft: "bg-brand-50 text-brand-700",
  failed: "bg-rose-50 text-rose-700",
  sending: "bg-amber-50 text-amber-800",
  sent: "bg-emerald-50 text-emerald-700",
  send_failed: "bg-rose-50 text-rose-700",
  skipped: "bg-slate-100 text-slate-600",
};

function formatRunDay(iso: string) {
  return RUN_DAY_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONES[status]}`}>{STATUS_LABELS[status]}</span>
  );
}

function FailureNote({ reason }: { reason: FailureReason }) {
  const needsReconnect = reason === "google_reconnect_needed";

  return (
    <p className="text-sm text-rose-700">
      {FAILURE_LABELS[reason]}
      {needsReconnect && (
        <>
          {" "}
          <Link to="/app/connect" className="font-medium underline">
            Reconnect
          </Link>
        </>
      )}
    </p>
  );
}

function ReportCard({ report }: { report: ReportListItemDto }) {
  const showsRecipients = report.status === "sent" || report.status === "sending" || report.status === "send_failed";

  return (
    <Card className="min-w-0 space-y-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/app/reports/${report.id}`} className="min-w-0 truncate font-medium text-slate-900 underline">
          {report.clientName}
        </Link>
        <StatusBadge status={report.status} />
      </div>
      <p className="text-sm text-slate-500">{formatPeriod(report.period)}</p>
      {report.status === "sent" && report.sentAt && (
        <div className="text-sm text-slate-600">
          <p>{formatSentDay(report.sentAt)}</p>
          <p>{recipientLabel(report.recipientCount)}</p>
        </div>
      )}
      {showsRecipients && report.status !== "sent" && (
        <p className="text-sm text-slate-600">{recipientLabel(report.recipientCount)}</p>
      )}
      {report.failureReason && <FailureNote reason={report.failureReason} />}
    </Card>
  );
}

const EmptyState = ({ nextRunOn }: { nextRunOn: string }) => {
  return (
    <Card className="p-8 text-center text-sm text-slate-600">
      Your first drafts arrive on {formatRunDay(nextRunOn)}
    </Card>
  );
};

const ReportList = () => {
  const { reports } = useUnit({ reports: $reportsPage });

  return (
    <div className="space-y-3">
      {reports.reports.map((report) => {
        return <ReportCard key={report.id} report={report} />;
      })}
    </div>
  );
};

export const ReportsPage = () => {
  useGate(ReportsGate);
  const { status, error, page } = useUnit({
    status: $reportsStatus,
    error: $reportsError,
    page: $reportsPage,
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Drafts wait for your approval before they reach a client." />
      {status === "loading" && <SkeletonRows />}
      {status === "error" && <ErrorState message={error} onRetry={() => reportsRequested()} />}
      {status === "ready" && page.reports.length === 0 && <EmptyState nextRunOn={page.nextRunOn} />}
      {status === "ready" && page.reports.length > 0 && <ReportList />}
    </div>
  );
};
