import type { GoogleStatusDto } from "@monthmemo/contract";
import { combine, createEffect, createEvent, sample } from "effector";
import { createGate } from "effector-react";

import { apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

export type ConnectView = "loading" | "error" | "denied" | "failed" | "empty" | "partial" | "connected";

const NOT_CONNECTED: GoogleStatusDto = { connected: false, ga4: false, gsc: false, needsReconnect: false };
const DENIED_ERROR = "access_denied";

// The connect page passes the `?error=` Google's consent screen sent it back with.
export const ConnectGate = createGate<{ callbackError: string | null }>();
// Fired once by the app shell (the reconnect banner needs the status on every page) and by Retry.
export const googleStatusRequested = createEvent();
export const connectClicked = createEvent();

const googleStatus = createRemote({
  handler: () => {
    return apiRequest<GoogleStatusDto>({ path: "/api/google/status" });
  },
  initial: NOT_CONNECTED,
});

export const $googleStatus = googleStatus.$data;
export const $googleStatusError = googleStatus.$error;
export const $needsReconnect = googleStatus.$data.map((status) => {
  return status.needsReconnect;
});

// Better Auth answers with Google's consent URL; the browser leaves and comes back to the connect page.
export const connectFx = createEffect(async () => {
  const { url } = await apiRequest<{ url: string }>({ path: "/api/google/connect", method: "POST", body: {} });
  window.location.assign(url);
});

export const $connecting = connectFx.pending;

export const $connectView = combine(
  googleStatus.$status,
  googleStatus.$data,
  ConnectGate.state,
  (remote, status, { callbackError }): ConnectView => {
    if (remote !== "ready") {
      return remote;
    }
    if (!status.connected && callbackError === DENIED_ERROR) {
      return "denied";
    }
    if (!status.connected && callbackError) {
      return "failed";
    }
    if (!status.connected) {
      return "empty";
    }
    if (status.ga4 && status.gsc) {
      return "connected";
    }
    return "partial";
  },
);

sample({
  clock: googleStatusRequested,
  filter: googleStatus.fx.pending.map((pending) => !pending),
  target: googleStatus.fx,
});

sample({
  clock: connectClicked,
  filter: connectFx.pending.map((pending) => !pending),
  target: connectFx,
});

sample({
  clock: connectFx.failData,
  fn: (error) => {
    return { text: error.message, tone: "error" as const };
  },
  target: toastShown,
});
