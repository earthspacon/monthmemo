import { useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { $hasSession } from "../session/model";
import { BUTTON_PRIMARY } from "../shared/ui";
import { DASHBOARD_CTA, START_CTA } from "./config";

const DASHBOARD_PATH = "/app/reports";

// Both states sit in one grid cell, so the wider one holds the space and nothing moves when the session check answers.
export const HeaderEntry = () => {
  const { hasSession } = useUnit({ hasSession: $hasSession });

  return (
    <div className="grid items-center justify-items-end">
      <div className={`col-start-1 row-start-1 flex items-center gap-2 sm:gap-3 ${hasSession ? "invisible" : ""}`}>
        <Link to="/sign-in" className="inline-flex min-h-11 items-center px-1 text-slate-600 hover:text-slate-900">
          Sign in
        </Link>
        <Link to="/sign-in" className={`${BUTTON_PRIMARY} whitespace-nowrap`}>
          {START_CTA}
        </Link>
      </div>
      <Link
        to={DASHBOARD_PATH}
        className={`col-start-1 row-start-1 ${BUTTON_PRIMARY} whitespace-nowrap ${hasSession ? "" : "invisible"}`}
      >
        {DASHBOARD_CTA}
      </Link>
    </div>
  );
};

export const StartLink = ({ className }: { className: string }) => {
  const { hasSession } = useUnit({ hasSession: $hasSession });

  return (
    <Link to={hasSession ? DASHBOARD_PATH : "/sign-in"} className={className}>
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${hasSession ? "invisible" : ""}`}>{START_CTA}</span>
        <span className={`col-start-1 row-start-1 ${hasSession ? "" : "invisible"}`}>{DASHBOARD_CTA}</span>
      </span>
    </Link>
  );
};
