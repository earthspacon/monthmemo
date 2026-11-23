import { useUnit } from "effector-react";
import { CreditCard, FileText, LogOut, type LucideIcon, Palette, Plug, Users } from "lucide-react";
import { useEffect } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { googleStatusRequested } from "../connect/model";
import { $sessionError, $sessionStatus, appStarted, signOutClicked } from "../session/model";
import { ThemeToggle } from "../shared/ThemeToggle";
import { BUTTON_SECONDARY, ErrorState, LoadingState } from "../shared/ui";
import { SiteLogo } from "../site/SiteLayout";
import { PlanBanner } from "./PlanBanner";
import { ReconnectBanner } from "./ReconnectBanner";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/clients", label: "Clients", icon: Users },
  { to: "/app/brand", label: "Brand", icon: Palette },
  { to: "/app/billing", label: "Billing", icon: CreditCard },
  { to: "/app/connect", label: "Google", icon: Plug },
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
  const loadGoogleStatus = useUnit(googleStatusRequested);

  useEffect(() => {
    loadGoogleStatus();
  }, [loadGoogleStatus]);

  return (
    <div className="min-h-dvh">
      <TopBar />
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-24 lg:pb-12">
        <PlanBanner />
        <ReconnectBanner />
        <main>
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
};

const TopBar = () => {
  const signOut = useUnit(signOutClicked);

  return (
    <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-4 px-4">
        <SiteLogo to="/app/reports" />
        <nav className="hidden flex-1 gap-1 text-sm font-medium lg:flex">
          {NAV.map((item) => {
            return (
              <NavLink key={item.to} to={item.to} className={topNavClassName}>
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" className={BUTTON_SECONDARY} onClick={() => signOut()}>
            <LogOut className="size-4" />
            <span className="max-sm:sr-only">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
};

const BottomNav = () => {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-surface lg:hidden">
      {NAV.map(({ to, label, icon: Icon }) => {
        return (
          <NavLink key={to} to={to} className={bottomNavClassName}>
            <Icon className="size-5" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
};

function topNavClassName({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3 py-2 ${isActive ? "text-brand-ink" : "text-slate-600 hover:text-slate-900"}`;
}

function bottomNavClassName({ isActive }: { isActive: boolean }) {
  return `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${isActive ? "text-brand-ink" : "text-slate-500"}`;
}
