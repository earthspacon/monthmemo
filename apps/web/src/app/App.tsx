import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SignInPage } from "../pages/SignInPage";
import { Card } from "../shared/ui";
import { AppShell, RequireSession } from "./AppShell";
import { ToastView } from "./ToastView";

const NotBuiltYet = () => {
  return <Card className="p-8 text-center text-sm text-slate-600">Not built yet</Card>;
};

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/app" element={<RequireSession />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/app/reports" replace />} />
            <Route path="*" element={<NotBuiltYet />} />
          </Route>
        </Route>
      </Routes>
      <ToastView />
    </BrowserRouter>
  );
};
