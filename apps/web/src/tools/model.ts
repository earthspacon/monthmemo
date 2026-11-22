import { createEffect, createEvent, createStore, sample } from "effector";

import { formatPeriod } from "../reports/format";
import { apiRequest } from "../shared/api";
import {
  buildStats,
  buildSummaryRequest,
  EXAMPLE_FORM,
  type MonthField,
  type MonthKey,
  type SummaryRequestBody,
  type SummaryResult,
} from "./lib";

const SUMMARY_PATH = "/api/tools/ga4-report-summary";
const TURNSTILE_HEADER = "x-turnstile-token";
const DEFAULT_CLIENT_NAME = "Your client";

export const clientNameChanged = createEvent<string>();
export const monthFieldChanged = createEvent<{ month: MonthKey; field: MonthField; value: string }>();
export const summarizeClicked = createEvent();
export const turnstileSolved = createEvent<string>();
export const turnstileExpired = createEvent();

export const summarizeFx = createEffect(
  async ({ token, body }: { token: string; body: SummaryRequestBody }): Promise<SummaryResult> => {
    const { narrative, period } = await apiRequest<{ narrative: string; period: string }>({
      path: SUMMARY_PATH,
      method: "POST",
      headers: { [TURNSTILE_HEADER]: token },
      body,
    });
    return {
      narrative,
      period: formatPeriod(period),
      clientName: body.clientName || DEFAULT_CLIENT_NAME,
      stats: buildStats(body),
    };
  },
);

export const $form = createStore(EXAMPLE_FORM);
export const $formError = createStore("");
export const $result = createStore<SummaryResult | null>(null);
export const $turnstileToken = createStore("");
// A Turnstile token works once, so every request remounts the widget for a fresh one.
export const $turnstileRound = createStore(0);

const requestBuilt = sample({
  clock: summarizeClicked,
  source: $form,
  fn: (form) => buildSummaryRequest(form),
});

$form
  .on(clientNameChanged, (form, clientName) => ({ ...form, clientName }))
  .on(monthFieldChanged, (form, { month, field, value }) => ({
    ...form,
    [month]: { ...form[month], [field]: value },
  }));

const requestFailed = sample({
  clock: requestBuilt,
  filter: (request): request is { error: string } => "error" in request,
});

const requestReady = sample({
  clock: requestBuilt,
  filter: (request): request is { body: SummaryRequestBody } => "body" in request,
});

sample({
  clock: requestFailed,
  fn: ({ error }) => error,
  target: $formError,
});

sample({
  clock: requestReady,
  source: $turnstileToken,
  filter: (token) => token !== "",
  fn: (token, { body }) => ({ token, body }),
  target: summarizeFx,
});

sample({
  clock: summarizeFx,
  target: $formError.reinit,
});

sample({
  clock: summarizeFx.failData,
  fn: (error) => error.message,
  target: $formError,
});

sample({
  clock: summarizeFx.doneData,
  target: $result,
});

sample({
  clock: turnstileSolved,
  target: $turnstileToken,
});

sample({
  clock: [turnstileExpired, summarizeFx],
  fn: () => "",
  target: $turnstileToken,
});

sample({
  clock: summarizeFx.finally,
  source: $turnstileRound,
  fn: (round) => round + 1,
  target: $turnstileRound,
});
