import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { ThemeToggle } from "../shared/ThemeToggle";
import { BUTTON_PRIMARY } from "../shared/ui";
import { FOOTER_LINKS, PRODUCT_NAME, SELLER_BRAND, START_CTA, SUPPORT_EMAIL } from "./config";
import { findSeoPage } from "./seo";

export const SiteLogo = () => {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        M
      </span>
      <span className="text-sm font-semibold">{PRODUCT_NAME}</span>
    </Link>
  );
};

export const SiteLayout = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  // The prerendered HTML has the right <title>; this keeps it right after in-app navigation.
  useEffect(() => {
    const page = findSeoPage(pathname);
    if (page) {
      document.title = page.title;
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <SiteLogo />
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/pricing" className="text-slate-600 hover:text-slate-900">
              Pricing
            </Link>
            <Link to="/sign-in" className="text-slate-600 hover:text-slate-900 max-sm:hidden">
              Sign in
            </Link>
            <ThemeToggle />
            <Link to="/sign-in" className={BUTTON_PRIMARY}>
              {START_CTA}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <span>
            © {SELLER_BRAND} · {SUPPORT_EMAIL}
          </span>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((link) => {
              return (
                <Link key={link.to} to={link.to} className="hover:text-slate-900">
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </footer>
    </div>
  );
};
