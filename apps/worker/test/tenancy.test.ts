import { describe, expect, it } from "vitest";

import {
  api,
  createConnectedAgency,
  GA4_PROPERTY_ID,
  GSC_SITE_URL,
  seedClient,
  seedReport,
  uniqueEmail,
} from "./helpers";

type IdRoute = { method: string; path: string };

// The routes every agency must be fenced off on; the table itself comes from the app so a new id route is covered.
const KNOWN_ID_ROUTES: IdRoute[] = [
  { method: "PUT", path: "/api/clients/:id" },
  { method: "DELETE", path: "/api/clients/:id" },
  { method: "GET", path: "/api/reports/:id" },
  { method: "GET", path: "/api/reports/:id/preview" },
  { method: "POST", path: "/api/reports/:id/approve" },
  { method: "POST", path: "/api/reports/:id/skip" },
];

describe("Tenant isolation", () => {
  it("MM-R8 every id route answers 404 for another agency's id", async () => {
    const { ID_ROUTES } = await import("../src/app");
    const owner = await createConnectedAgency();
    const stranger = await createConnectedAgency();
    const { clientId } = await seedClient({ agencyId: owner.agencyId });
    const reportId = await seedReport({ agencyId: owner.agencyId, clientId, period: "2026-10", status: "draft" });
    const routes: IdRoute[] = ID_ROUTES;

    expect(routes).toEqual(expect.arrayContaining(KNOWN_ID_ROUTES));

    for (const route of routes) {
      const id = route.path.startsWith("/api/clients") ? clientId : reportId;
      const response = await api({
        path: route.path.replace(":id", id),
        method: route.method,
        cookie: stranger.cookie,
        body:
          route.method === "PUT"
            ? {
                name: "Taken over",
                recipients: [uniqueEmail("x")],
                ga4PropertyId: GA4_PROPERTY_ID,
                gscSiteUrl: GSC_SITE_URL,
              }
            : undefined,
      });
      expect(response.status, `${route.method} ${route.path}`).toBe(404);
    }

    const ownView = await api({ path: `/api/reports/${reportId}`, cookie: owner.cookie });
    expect(ownView.status).toBe(200);
  });
});
