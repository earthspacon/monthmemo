import { useEffect, useRef } from "react";

import { loadTurnstile, TURNSTILE_SITE_KEY } from "./turnstile";

type TurnstileWidgetProps = {
  // A new round remounts the widget: a token works once.
  round: number;
  onSolved: (token: string) => void;
  onExpired: () => void;
};

export const TurnstileWidget = ({ round, onSolved, onExpired }: TurnstileWidgetProps) => {
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
          callback: onSolved,
          "expired-callback": onExpired,
          "error-callback": onExpired,
        });
      })
      .catch(() => {
        onExpired();
      });
    return () => {
      isCancelled = true;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [round, onSolved, onExpired]);

  return <div ref={container} className="min-h-16" />;
};
