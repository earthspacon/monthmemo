import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { BillingPage } from "../pages/BillingPage";
import { BrandPage } from "../pages/BrandPage";
import { ClientsPage } from "../pages/ClientsPage";
import { ConnectPage } from "../pages/ConnectPage";
import { ReportPage } from "../pages/ReportPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SignInPage } from "../pages/SignInPage";
import { Card } from "../shared/ui";
import { AgencyAnalyticsAlternativePage } from "../site/AgencyAnalyticsAlternativePage";
import { AutomateReportsPage } from "../site/AutomateReportsPage";
import { LandingPage } from "../site/LandingPage";
import { LegalPage } from "../site/LegalPage";
import { NotFoundPage } from "../site/NotFoundPage";
import { PricingPage } from "../site/PricingPage";
import { ReportSummaryToolPage } from "../tools/ReportSummaryToolPage";
import { AppShell, RequireSession } from "./AppShell";
import { ToastView } from "./ToastView";

const NotBuiltYet = () => {
  return <Card className="p-8 text-center text-sm text-slate-600">Not built yet</Card>;
};

export const App = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

// Shared by the browser and by the build-time prerender (StaticRouter), so hydration sees the same tree.
export const AppRoutes = () => {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/agencyanalytics-alternative" element={<AgencyAnalyticsAlternativePage />} />
        <Route path="/automate-ga4-search-console-reports" element={<AutomateReportsPage />} />
        <Route path="/tools/ga4-report-summary" element={<ReportSummaryToolPage />} />
        <Route path="/terms" element={<LegalPage slug="terms" />} />
        <Route path="/privacy" element={<LegalPage slug="privacy" />} />
        <Route path="/refunds" element={<LegalPage slug="refunds" />} />
        <Route path="/dpa" element={<LegalPage slug="dpa" />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/app" element={<RequireSession />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/app/reports" replace />} />
            <Route path="connect" element={<ConnectPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="brand" element={<BrandPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:id" element={<ReportPage />} />
            <Route path="*" element={<NotBuiltYet />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastView />
    </>
  );
};
