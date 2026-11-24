import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { sitePageOpened } from "../session/model";
import { ThemeToggle } from "../shared/ThemeToggle";
import { FOOTER_LINKS, PRODUCT_NAME, SELLER_BRAND, STUDIO_URL, SUPPORT_EMAIL } from "./config";
import { findSeoPage } from "./seo";
import { HeaderEntry } from "./SessionLinks";

export const SiteLogo = ({ to }: { to: string }) => {
  return (
    <Link to={to} className="flex min-h-11 shrink-0 items-center gap-2">
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

  useEffect(() => {
    sitePageOpened();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:py-3">
          <SiteLogo to="/" />
          <nav className="flex items-center gap-2 text-sm sm:gap-4">
            <Link to="/pricing" className="text-slate-600 hover:text-slate-900 max-sm:hidden">
              Pricing
            </Link>
            <span className="max-sm:hidden">
              <ThemeToggle />
            </span>
            <HeaderEntry />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <footer className="border-t border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <span>
            ©{" "}
            <a href={STUDIO_URL} className="underline underline-offset-2 hover:text-slate-900">
              {SELLER_BRAND}
            </a>{" "}
            · {SUPPORT_EMAIL}
          </span>
          <nav className="flex flex-wrap items-center gap-x-4 sm:gap-y-4">
            {FOOTER_LINKS.map((link) => {
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-11 items-center hover:text-slate-900 sm:min-h-0"
                >
                  {link.label}
                </Link>
              );
            })}
            <span className="sm:hidden">
              <ThemeToggle />
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
};
