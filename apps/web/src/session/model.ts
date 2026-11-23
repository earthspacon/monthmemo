import type { MeDto } from "@monthmemo/contract";
import { createEffect, createEvent, createStore, sample } from "effector";

import { apiCommand, apiRequest, ApiRequestError } from "../shared/api";

export type SessionStatus = "loading" | "signed_out" | "error" | "ready";

export const appStarted = createEvent();
export const signOutClicked = createEvent();
export const sitePageOpened = createEvent();

export const meFx = createEffect(async () => {
  // get-session answers 200 null when signed out, so a visitor causes no 401 in the console.
  const session = await apiRequest<{ user: { id: string } } | null>({ path: "/api/auth/get-session" });

  if (!session) {
    throw new ApiRequestError(401, "unauthorized", "Sign in first");
  }
  return apiRequest<MeDto>({ path: "/api/me" });
});

// Set after the app loads with a session, so public pages ask about the session only on a browser that has signed in before.
const SIGNED_IN_HINT = "monthmemo.signedIn";

const readSignedInHintFx = createEffect(() => {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === "1";
  } catch {
    return false;
  }
});

const writeSignedInHintFx = createEffect((signedIn: boolean) => {
  try {
    if (signedIn) {
      localStorage.setItem(SIGNED_IN_HINT, "1");
    } else {
      localStorage.removeItem(SIGNED_IN_HINT);
    }
  } catch {
    // Storage can be blocked; public pages then keep the signed-out header.
  }
});

// Public pages only ask whether a session exists, so they never trigger /api/me.
export const siteSessionFx = createEffect(async () => {
  const session = await apiRequest<{ user: { id: string } } | null>({ path: "/api/auth/get-session" });
  return session !== null;
});

export const signOutFx = createEffect(() => {
  return apiCommand({ path: "/api/auth/sign-out", method: "POST", body: {} });
});

export const $me = createStore<MeDto | null>(null);
export const $sessionStatus = createStore<SessionStatus>("loading");
export const $sessionError = createStore("");
export const $hasSession = createStore(false);

sample({
  clock: appStarted,
  target: meFx,
});

sample({
  clock: meFx.doneData,
  target: $me,
});

sample({
  clock: meFx.doneData,
  fn: (): SessionStatus => "ready",
  target: $sessionStatus,
});

sample({
  clock: meFx.failData,
  fn: getFailedSessionStatus,
  target: $sessionStatus,
});

sample({
  clock: meFx.failData,
  fn: (error) => error.message,
  target: $sessionError,
});

sample({
  clock: meFx.failData,
  target: $me.reinit,
});

sample({
  clock: sitePageOpened,
  target: readSignedInHintFx,
});

sample({
  clock: readSignedInHintFx.doneData,
  filter: Boolean,
  target: siteSessionFx,
});

sample({
  clock: siteSessionFx.doneData,
  target: [$hasSession, writeSignedInHintFx],
});

sample({
  clock: meFx.doneData,
  fn: () => true,
  target: [$hasSession, writeSignedInHintFx],
});

sample({
  clock: signOutFx.finally,
  fn: () => false,
  target: [$hasSession, writeSignedInHintFx],
});

sample({
  clock: signOutClicked,
  target: signOutFx,
});

sample({
  clock: signOutFx.finally,
  target: $me.reinit,
});

sample({
  clock: signOutFx.finally,
  fn: (): SessionStatus => "signed_out",
  target: $sessionStatus,
});

function getFailedSessionStatus(error: Error): SessionStatus {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "signed_out";
  }
  return "error";
}
