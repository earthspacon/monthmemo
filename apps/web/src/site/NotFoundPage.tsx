import { Link } from "react-router-dom";

import { BUTTON_PRIMARY } from "../shared/ui";
import { SiteLayout } from "./SiteLayout";

export const NOT_FOUND_TITLE = "Page not found | MonthMemo";

// Served by the Worker with status 404 for any unknown public path (prerendered as 404.html).
export const NotFoundPage = () => {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-slate-600">This page doesn't exist or has moved.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className={BUTTON_PRIMARY}>
            Go to the home page
          </Link>
          <Link to="/pricing" className="px-3 py-2 text-sm font-medium text-brand-ink">
            See pricing
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
};
