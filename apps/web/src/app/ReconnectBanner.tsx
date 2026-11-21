import { useUnit } from "effector-react";
import { AlertTriangle } from "lucide-react";

import { $connecting, $needsReconnect, connectClicked } from "../connect/model";
import { BUTTON_PRIMARY, Banner } from "../shared/ui";

// Shown on every app page while Google refuses the stored token, because every report of the agency fails until then.
export const ReconnectBanner = () => {
  const { needsReconnect, connecting, connect } = useUnit({
    needsReconnect: $needsReconnect,
    connecting: $connecting,
    connect: connectClicked,
  });

  if (!needsReconnect) {
    return null;
  }
  return (
    <div className="mb-4">
      <Banner tone="danger">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            Google access has expired, so reports can't read your clients' data.
          </p>
          <button type="button" className={BUTTON_PRIMARY} disabled={connecting} onClick={() => connect()}>
            Reconnect Google
          </button>
        </div>
      </Banner>
    </div>
  );
};
