import { useGate, useUnit } from "effector-react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { $me, $sessionStatus, appStarted } from "../session/model";
import { loadTurnstile, TURNSTILE_SITE_KEY } from "../session/turnstile";
import { BUTTON_PRIMARY, Banner, Card } from "../shared/ui";
import {
  $signInError,
  $turnstileRound,
  $turnstileToken,
  googleClicked,
  googleSignInFx,
  SignInGate,
  turnstileExpired,
  turnstileSolved,
} from "./sign-in-model";

const CANCELLED_MESSAGE = "Google sign-in was cancelled. Try again.";
const FAILED_MESSAGE = "Google sign-in didn't finish. Try again.";
const CANCELLED_ERRORS = new Set(["access_denied"]);
const DEFAULT_NEXT = "/app/reports";

function readNext(raw: string | null) {
  if (raw && raw.startsWith("/app") && !raw.startsWith("//")) {
    return raw;
  }
  return DEFAULT_NEXT;
}

function describeError(code: string | null) {
  if (!code) {
    return "";
  }
  return CANCELLED_ERRORS.has(code) ? CANCELLED_MESSAGE : FAILED_MESSAGE;
}

const TurnstileWidget = () => {
  const { round } = useUnit({ round: $turnstileRound });
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | null = null;
    let isCancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (isCancelled || !container.current) {
          return;
        }
        widgetId = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          size: "flexible",
          callback: turnstileSolved,
          "expired-callback": turnstileExpired,
          "error-callback": turnstileExpired,
        });
      })
      .catch(() => {
        turnstileExpired();
      });
    return () => {
      isCancelled = true;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [round]);

  return <div ref={container} className="min-h-16" />;
};

export const SignInPage = () => {
  useGate(SignInGate);
  const [params] = useSearchParams();
  const { me, status, token, error, isRedirecting } = useUnit({
    me: $me,
    status: $sessionStatus,
    token: $turnstileToken,
    error: $signInError,
    isRedirecting: googleSignInFx.pending,
  });

  useEffect(() => {
    appStarted();
  }, []);

  if (status === "ready" && me) {
    return <Navigate to={readNext(params.get("next"))} replace />;
  }
  const message = error || describeError(params.get("error"));

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-slate-900">Sign in to MonthMemo</h1>
        <p className="text-sm text-slate-600">
          Use your Google account. We only read your name and email here; Google Analytics access is a separate step.
        </p>
        {message ? <Banner tone="danger">{message}</Banner> : null}
        <TurnstileWidget />
        <button
          type="button"
          className={`${BUTTON_PRIMARY} w-full`}
          disabled={token === "" || isRedirecting}
          onClick={() => googleClicked()}
        >
          {isRedirecting ? <Loader2 className="size-4 animate-spin" /> : null}
          {isRedirecting ? "Redirecting…" : "Continue with Google"}
        </button>
      </Card>
    </main>
  );
};
