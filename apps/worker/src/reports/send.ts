import type { BrandDto, ReportMetrics } from "@monthmemo/contract";

import type { Deps } from "../deps";
import { renderReportEmail } from "../email/render";
import { getBrand } from "../repo/agencies";
import {
  claimAgencyNotice,
  countUndeliveredRecipients,
  incrementReportAttempts,
  insertDelivery,
  listSendingReports,
  listUndeliveredRecipients,
  markReportSendFailed,
  markReportSent,
  readAgencyOwnerEmail,
  type ReportRecipient,
  type SendingReport,
} from "../repo/reports";

export const SENDING_BATCH = 10;
export const SEND_FAILED_NOTICE_KIND = "send_failed";

const MAX_SEND_ATTEMPTS = 3;
const ONE_CLICK_VALUE = "List-Unsubscribe=One-Click";

export function reportMetricsOf({
  metricsJson,
  period,
}: {
  metricsJson: string | null;
  period: string;
}): ReportMetrics {
  if (!metricsJson) {
    return {
      period,
      previousPeriod: previousPeriodOf(period),
      ga4: null,
      gsc: null,
    };
  }
  try {
    return JSON.parse(metricsJson) as ReportMetrics;
  } catch {
    return {
      period,
      previousPeriod: previousPeriodOf(period),
      ga4: null,
      gsc: null,
    };
  }
}

function previousPeriodOf(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function unsubscribeUrl({ appUrl, token }: { appUrl: string; token: string }) {
  return `${appUrl}/u/${token}`;
}

async function deliverToRecipient({
  deps,
  report,
  brand,
  recipient,
  metrics,
}: {
  deps: Deps;
  report: SendingReport;
  brand: BrandDto;
  recipient: ReportRecipient;
  metrics: ReportMetrics;
}) {
  const link = unsubscribeUrl({ appUrl: deps.env.APP_URL, token: recipient.token });
  const letter = renderReportEmail({
    brand,
    client: { name: report.clientName },
    period: report.period,
    metrics,
    narrative: report.narrative ?? "",
    unsubscribeUrl: link,
  });

  await deps.mailer.send({
    to: recipient.email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    fromName: `${brand.displayName} via MonthMemo`,
    replyTo: brand.replyTo,
    headers: {
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": ONE_CLICK_VALUE,
    },
  });
}

async function sendReport({ deps, report }: { deps: Deps; report: SendingReport }) {
  const brand = await getBrand({ db: deps.db, agencyId: report.agencyId });

  if (!brand) {
    console.error("Report send skipped: the agency has no brand");
    return;
  }
  const recipients = await listUndeliveredRecipients({
    db: deps.db,
    reportId: report.id,
    clientId: report.clientId,
  });
  const metrics = reportMetricsOf({ metricsJson: report.metricsJson, period: report.period });
  let failed = false;

  for (const recipient of recipients) {
    try {
      await deliverToRecipient({ deps, report, brand, recipient, metrics });
      await insertDelivery({
        db: deps.db,
        reportId: report.id,
        recipientId: recipient.id,
        now: deps.now().toISOString(),
      });
    } catch (error) {
      failed = true;
      console.error("Report delivery failed", error instanceof Error ? error.name : "unknown");
    }
  }

  const remaining = await countUndeliveredRecipients({
    db: deps.db,
    reportId: report.id,
    clientId: report.clientId,
  });

  if (remaining === 0) {
    await markReportSent({ db: deps.db, id: report.id, now: deps.now().toISOString() });
    return;
  }
  if (!failed) {
    return;
  }
  const now = deps.now().toISOString();
  const attempts = await incrementReportAttempts({ db: deps.db, id: report.id, now });

  if (attempts < MAX_SEND_ATTEMPTS) {
    return;
  }
  await markReportSendFailed({ db: deps.db, id: report.id, now });
  await sendFailureNotice({ deps, report });
}

async function sendFailureNotice({ deps, report }: { deps: Deps; report: SendingReport }) {
  if (
    !(await claimAgencyNotice({
      db: deps.db,
      agencyId: report.agencyId,
      period: report.period,
      kind: `${SEND_FAILED_NOTICE_KIND}:${report.id}`,
    }))
  ) {
    return;
  }
  const to = await readAgencyOwnerEmail({ db: deps.db, agencyId: report.agencyId });

  if (!to) {
    return;
  }
  await deps.mailer.send({
    to,
    subject: `${report.clientName} report could not be sent`,
    text: `We tried ${MAX_SEND_ATTEMPTS} times to send the ${report.period} report for ${report.clientName}, but the email service kept failing.\n\nCheck the recipient addresses or contact support from ${deps.env.APP_URL}.`,
  });
}

export async function processSendingReports({ deps }: { deps: Deps }) {
  const reports = await listSendingReports({ db: deps.db, limit: SENDING_BATCH });

  for (const report of reports) {
    await sendReport({ deps, report });
  }
}
