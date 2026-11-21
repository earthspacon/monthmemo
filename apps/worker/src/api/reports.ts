import type { ReportDetailDto, ReportListItemDto, ReportMetrics, ReportsPageDto } from "@monthmemo/contract";

import { renderReportEmail } from "../email/render";
import { HttpError, json, route, type Route } from "../http";
import { getBrand, nextRunAfter } from "../repo/agencies";
import {
  findReportDetail,
  listFirstRecipient,
  listReportPeriods,
  listReports,
  markReportSending,
  markReportSkipped,
  type ReportDetailRow,
  type ReportListRow,
} from "../repo/reports";
import { reportMetricsOf } from "../reports/send";
import { requireActivePlan, type ApiContext } from "./context";

const ISO_DAY_LENGTH = 10;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const PREVIEW_CSP = "default-src 'none'; img-src https:; style-src 'unsafe-inline'; frame-ancestors 'self'";

function listItemOf(row: ReportListRow): ReportListItemDto {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    period: row.period,
    status: row.status,
    failureReason: row.failureReason,
    sentAt: row.sentAt,
    recipientCount: Number(row.recipientCount),
  };
}

function detailOf(row: ReportDetailRow): ReportDetailDto {
  return {
    ...listItemOf(row),
    metrics: row.metricsJson ? reportMetricsOf({ metricsJson: row.metricsJson, period: row.period }) : null,
    narrative: row.narrative,
  };
}

function readPeriod(request: Request) {
  const period = new URL(request.url).searchParams.get("period");

  if (!period) {
    return null;
  }
  if (!PERIOD_PATTERN.test(period)) {
    throw new HttpError(400, "invalid_field", '"period" must be YYYY-MM');
  }
  return period;
}

async function requireReport({
  deps,
  agency,
  params,
}: Pick<ApiContext, "deps" | "agency"> & { params: Record<string, string> }) {
  const report = await findReportDetail({ db: deps.db, agencyId: agency.id, id: params.id ?? "" });

  if (!report) {
    throw new HttpError(404, "not_found", "Report not found");
  }
  return report;
}

function notDraft() {
  return new HttpError(409, "report_not_draft", "Only a draft can be approved or skipped");
}

export const reportRoutes: Route<ApiContext>[] = [
  route("GET", "/api/reports", async ({ deps, agency, request }) => {
    const period = readPeriod(request);
    const reports = await listReports({ db: deps.db, agencyId: agency.id, period });
    const body: ReportsPageDto = {
      periods: await listReportPeriods({ db: deps.db, agencyId: agency.id }),
      nextRunOn: nextRunAfter(deps.now()).toISOString().slice(0, ISO_DAY_LENGTH),
      reports: reports.map(listItemOf),
    };
    return json(body);
  }),

  route("GET", "/api/reports/:id", async (context) => {
    return json(detailOf(await requireReport(context)));
  }),

  route("GET", "/api/reports/:id/preview", async (context) => {
    const { deps } = context;
    const report = await requireReport(context);
    const brand = await getBrand({ db: deps.db, agencyId: context.agency.id });
    const recipient = await listFirstRecipient({ db: deps.db, clientId: report.clientId });
    const metrics: ReportMetrics = reportMetricsOf({ metricsJson: report.metricsJson, period: report.period });

    if (!brand) {
      throw new HttpError(404, "not_found", "Not found");
    }
    const letter = renderReportEmail({
      brand,
      client: { name: report.clientName },
      period: report.period,
      metrics,
      narrative: report.narrative ?? "",
      unsubscribeUrl: recipient ? `${deps.env.APP_URL}/u/${recipient.token}` : `${deps.env.APP_URL}/u/preview`,
    });
    return new Response(letter.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": PREVIEW_CSP,
      },
    });
  }),

  route("POST", "/api/reports/:id/approve", async (context) => {
    requireActivePlan(context);
    const report = await requireReport(context);
    const now = context.deps.now().toISOString();

    if (!(await markReportSending({ db: context.deps.db, id: report.id, now }))) {
      throw notDraft();
    }
    return json({ id: report.id, status: "sending" });
  }),

  route("POST", "/api/reports/:id/skip", async (context) => {
    const report = await requireReport(context);
    const now = context.deps.now().toISOString();

    if (!(await markReportSkipped({ db: context.deps.db, id: report.id, now }))) {
      throw notDraft();
    }
    return json({ id: report.id, status: "skipped" });
  }),
];
