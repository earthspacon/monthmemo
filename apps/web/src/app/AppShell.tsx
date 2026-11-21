import { useUnit } from "effector-react";
import { LogOut } from "lucide-react";
import { useEffect } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { $sessionError, $sessionStatus, appStarted, signOutClicked } from "../session/model";
import { BUTTON_SECONDARY, ErrorState, LoadingState } from "../shared/ui";

const NAV = [
  { to: "/app/reports", label: "Reports" },
  { to: "/app/clients", label: "Clients" },
  { to: "/app/brand", label: "Brand" },
  { to: "/app/billing", label: "Billing" },
];

// Sends a visitor without a session to the sign-in page and brings them back afterwards.
export const RequireSession = () => {
  const { status, error } = useUnit({ status: $sessionStatus, error: $sessionError });
  const location = useLocation();

  useEffect(() => {
    appStarted();
  }, []);

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "signed_out") {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (status === "error") {
    return <ErrorState message={error} onRetry={() => appStarted()} />;
  }
  return <Outlet />;
};

export const AppShell = () => {
  const { signOut } = useUnit({ signOut: signOutClicked });

  return (
    <div className="mx-auto min-h-dvh max-w-5xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-4 text-sm font-medium">
          {NAV.map((item) => {
            return (
              <NavLink key={item.to} to={item.to} className="text-slate-600 hover:text-slate-900">
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <button type="button" className={BUTTON_SECONDARY} onClick={() => signOut()}>
          <LogOut className="size-4" />
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  );
};
