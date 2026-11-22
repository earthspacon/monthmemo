import type { AgencyStatus, ReportDetailDto, ReportsPageDto } from "@monthmemo/contract";
import { combine, createEffect, createEvent, sample } from "effector";
import { createGate } from "effector-react";

import { $me } from "../session/model";
import { apiCommand, apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

const ACTIVE_STATUSES: AgencyStatus[] = ["trialing", "active"];
const EMPTY_PAGE: ReportsPageDto = {
  periods: [],
  nextRunOn: "",
  reports: [],
};

export const ReportsGate = createGate();
export const ReportGate = createGate<{ id: string }>();
export const reportsRequested = createEvent();
export const reportReloadRequested = createEvent<string>();
export const approveClicked = createEvent();
export const skipClicked = createEvent();

const reports = createRemote({
  handler: () => {
    return apiRequest<ReportsPageDto>({ path: "/api/reports" });
  },
  initial: EMPTY_PAGE,
});

const report = createRemote<{ id: string }, ReportDetailDto | null>({
  handler: ({ id }) => {
    return apiRequest<ReportDetailDto>({ path: `/api/reports/${id}` });
  },
  initial: null,
});

const approveFx = createEffect((id: string) => {
  return apiCommand({ path: `/api/reports/${id}/approve`, method: "POST" });
});

const skipFx = createEffect((id: string) => {
  return apiCommand({ path: `/api/reports/${id}/skip`, method: "POST" });
});

export const $reportsPage = reports.$data;
export const $reportsStatus = reports.$status;
export const $reportsError = reports.$error;
export const $report = report.$data;
export const $reportStatus = report.$status;
export const $reportError = report.$error;
export const $approving = approveFx.pending;
export const $skipping = skipFx.pending;
export const $reportId = ReportGate.state.map(({ id }) => {
  return id;
});

// An expired or unpaid plan keeps the drafts but blocks approving them until billing is fixed.
export const $planInactive = $me.map((me) => {
  return me !== null && !ACTIVE_STATUSES.includes(me.agency.status);
});

export const $reportActionsEnabled = combine(
  $report,
  $approving,
  $skipping,
  $planInactive,
  (current, approving, skipping, planInactive) => {
    return current?.status === "draft" && !approving && !skipping && !planInactive;
  },
);

sample({
  clock: [ReportsGate.open, reportsRequested],
  target: reports.fx,
});

sample({
  clock: ReportGate.open,
  fn: ({ id }) => {
    return { id };
  },
  target: report.fx,
});

sample({
  clock: ReportGate.close,
  target: report.reset,
});

sample({
  clock: reportReloadRequested,
  fn: (id) => {
    return { id };
  },
  target: report.fx,
});

sample({
  clock: approveClicked,
  source: $reportId,
  filter: Boolean,
  target: approveFx,
});

sample({
  clock: skipClicked,
  source: $reportId,
  filter: Boolean,
  target: skipFx,
});

sample({
  clock: [approveFx.done, skipFx.done],
  fn: ({ params }) => {
    return params;
  },
  target: reportReloadRequested,
});

sample({
  clock: [approveFx.failData, skipFx.failData],
  fn: (error) => {
    return {
      text: error.message,
      tone: "error" as const,
    };
  },
  target: toastShown,
});
