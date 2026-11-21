import type { ReportStatus } from "@monthmemo/contract";

const PERIOD_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SENT_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Writing",
  building: "Writing",
  draft: "Draft",
  failed: "Failed",
  sending: "Sending",
  sent: "Sent",
  send_failed: "Email failed",
  skipped: "Skipped",
};

export function formatPeriod(period: string) {
  return PERIOD_FORMAT.format(new Date(`${period}-01T00:00:00Z`));
}

export function formatSentDay(iso: string) {
  return SENT_DAY_FORMAT.format(new Date(iso));
}

export function recipientLabel(count: number) {
  return count === 1 ? "1 recipient" : `${count} recipients`;
}
