import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { Card } from "./shared/ui";

const NotBuiltYet = () => {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card className="p-8 text-center text-sm text-slate-600">Not built yet</Card>
    </main>
  );
};

const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <NotBuiltYet />,
  },
  {
    path: "/app/*",
    element: <NotBuiltYet />,
  },
]);

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
