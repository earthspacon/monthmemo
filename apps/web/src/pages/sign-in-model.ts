import { createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { apiRequest } from "../shared/api";

const DEFAULT_NEXT = "/app/reports";
const ERROR_CALLBACK_URL = "/sign-in";
const TURNSTILE_HEADER = "x-turnstile-token";

// Only in-app paths are followed after sign-in, so `?next=` cannot send the visitor elsewhere.
export function readNext(raw: string | null) {
  if (raw && raw.startsWith("/app") && !raw.startsWith("//")) {
    return raw;
  }
  return DEFAULT_NEXT;
}

export const SignInGate = createGate();
export const turnstileSolved = createEvent<string>();
export const turnstileExpired = createEvent();
export const googleClicked = createEvent<string>();

// Better Auth answers with Google's consent URL; the browser leaves for Google and comes back via the callback.
export const googleSignInFx = createEffect(async ({ token, next }: { token: string; next: string }) => {
  const { url } = await apiRequest<{ url: string }>({
    path: "/api/auth/sign-in/social",
    method: "POST",
    headers: { [TURNSTILE_HEADER]: token },
    body: { provider: "google", callbackURL: next, errorCallbackURL: ERROR_CALLBACK_URL },
  });
  window.location.assign(url);
});

export const $turnstileToken = createStore("");
export const $signInError = createStore("");
// A Turnstile token works once, so every failed attempt remounts the widget for a fresh one.
export const $turnstileRound = createStore(0);

sample({
  clock: turnstileSolved,
  target: $turnstileToken,
});

sample({
  clock: [turnstileExpired, googleSignInFx.fail],
  fn: () => "",
  target: $turnstileToken,
});

sample({
  clock: googleSignInFx.fail,
  source: $turnstileRound,
  fn: (round) => round + 1,
  target: $turnstileRound,
});

sample({
  clock: googleClicked,
  source: $turnstileToken,
  filter: (token) => token !== "",
  fn: (token, next) => ({ token, next }),
  target: googleSignInFx,
});

sample({
  clock: googleClicked,
  target: $signInError.reinit,
});

sample({
  clock: googleSignInFx.failData,
  fn: (error) => error.message,
  target: $signInError,
});
