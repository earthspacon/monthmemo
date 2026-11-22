import type { ReportDetailDto, ReportStatus } from "@monthmemo/contract";
import { useGate, useUnit } from "effector-react";
import { AlertTriangle } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { formatPeriod, formatSentDay, recipientLabel, STATUS_LABELS } from "../reports/format";
import {
  $approving,
  $planInactive,
  $report,
  $reportActionsEnabled,
  $reportError,
  $reportStatus,
  $skipping,
  approveClicked,
  ReportGate,
  reportReloadRequested,
  skipClicked,
} from "../reports/model";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Banner, Card, ErrorState, PageHeader, SkeletonRows } from "../shared/ui";

const PlanNotice = () => {
  return (
    <Banner tone="warning">
      Your plan is inactive, so reports can't be approved.{" "}
      <Link to="/app/billing" className="font-medium underline">
        Choose a plan in billing
      </Link>
    </Banner>
  );
};

const PreviewFrame = ({ reportId }: { reportId: string }) => {
  return (
    <iframe
      title="Report preview"
      src={`/api/reports/${reportId}/preview`}
      sandbox=""
      className="h-[600px] w-full max-w-full rounded-xl border border-slate-200 bg-white"
    />
  );
};

const ActionBar = ({ report }: { report: ReportDetailDto }) => {
  const { approving, skipping, actionsEnabled } = useUnit({
    approving: $approving,
    skipping: $skipping,
    actionsEnabled: $reportActionsEnabled,
  });
  const skipEnabled = report.status === "draft" && !approving && !skipping;

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON_PRIMARY} disabled={!actionsEnabled} onClick={() => approveClicked()}>
        {approving ? "Sending…" : "Approve"}
      </button>
      <button type="button" className={BUTTON_SECONDARY} disabled={!skipEnabled} onClick={() => skipClicked()}>
        Skip
      </button>
    </div>
  );
};

const ProgressState = ({ status }: { status: ReportStatus }) => {
  if (status === "pending" || status === "building") {
    return (
      <Card className="p-8 text-sm text-slate-600">
        <span role="status">Writing the summary…</span>
      </Card>
    );
  }
  if (status === "sending") {
    return <Card className="p-8 text-sm text-slate-600">Sending…</Card>;
  }
  if (status === "skipped") {
    return <Card className="p-8 text-sm text-slate-600">Skipped</Card>;
  }
  if (status === "send_failed") {
    return (
      <Card className="space-y-2 p-8 text-sm">
        <p className="flex items-center gap-2 font-medium text-rose-800">
          <AlertTriangle className="size-4" />
          Email could not be sent
        </p>
        <p className="text-slate-600">The email service kept failing, so MonthMemo stopped after 3 tries.</p>
      </Card>
    );
  }
  return null;
};

const FailureState = ({ report }: { report: ReportDetailDto }) => {
  const needsReconnect = report.failureReason === "google_reconnect_needed";

  return (
    <Card className="space-y-2 p-8 text-sm">
      <p className="flex items-center gap-2 font-medium text-rose-800">
        <AlertTriangle className="size-4" />
        This report could not be built
      </p>
      {needsReconnect && (
        <p className="text-slate-600">
          Google access needs to be reconnected.{" "}
          <Link to="/app/connect" className="font-medium underline">
            Reconnect
          </Link>
        </p>
      )}
    </Card>
  );
};

const SentState = ({ report }: { report: ReportDetailDto }) => {
  if (!report.sentAt) {
    return null;
  }
  return (
    <Card className="space-y-1 p-8 text-sm text-slate-600">
      <p className="font-medium text-slate-900">Sent</p>
      <p>
        {formatSentDay(report.sentAt)} · {recipientLabel(report.recipientCount)}
      </p>
    </Card>
  );
};

const ReportBody = ({ report }: { report: ReportDetailDto }) => {
  if (report.status === "draft") {
    return (
      <div className="space-y-3">
        <PreviewFrame reportId={report.id} />
        <ActionBar report={report} />
      </div>
    );
  }
  if (report.status === "failed") {
    return <FailureState report={report} />;
  }
  if (report.status === "sent") {
    return <SentState report={report} />;
  }
  return <ProgressState status={report.status} />;
};

export const ReportPage = () => {
  const { id = "" } = useParams();
  useGate(ReportGate, { id });
  const { status, error, report, planInactive } = useUnit({
    status: $reportStatus,
    error: $reportError,
    report: $report,
    planInactive: $planInactive,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={report?.clientName ?? "Report"}
        subtitle={report ? `${formatPeriod(report.period)} · ${STATUS_LABELS[report.status]}` : undefined}
      />
      {planInactive && report?.status === "draft" && <PlanNotice />}
      {status === "loading" && <SkeletonRows />}
      {status === "error" && <ErrorState message={error} onRetry={() => reportReloadRequested(id)} />}
      {status === "ready" && report !== null && <ReportBody report={report} />}
    </div>
  );
};
