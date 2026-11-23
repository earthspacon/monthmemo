import { PLAN } from "@monthmemo/contract";
import { describe, expect, it } from "vitest";

import { BASIC_SCOPE, GA4_SCOPE } from "./fakes";
import {
  api,
  clearRunState,
  countRows,
  createConnectedAgency,
  GA4_PROPERTY_ID,
  GSC_SITE_URL,
  seedClient,
  seedReport,
  setAgency,
  uniqueEmail,
} from "./helpers";

const NAME_MAX = 80;
const RUN_DATE_PATTERN = /^\d{4}-\d{2}-04$/;

function clientBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Example Bakery",
    recipients: [uniqueEmail("owner"), uniqueEmail("manager")],
    ga4PropertyId: GA4_PROPERTY_ID,
    gscSiteUrl: GSC_SITE_URL,
    ...overrides,
  };
}

type ClientListItem = { id: string; name: string };

async function listClients(cookie: string) {
  const response = await api({ path: "/api/clients", cookie });
  expect(response.status).toBe(200);
  return response.json<ClientListItem[]>();
}

async function seedClients({ agencyId, count }: { agencyId: string; count: number }) {
  for (let index = 0; index < count; index += 1) {
    await seedClient({ agencyId, name: `Seeded client ${index + 1}` });
  }
}

describe("Clients", () => {
  it("MM-R6 a client is created, listed, updated and deleted together with its reports", async () => {
    await clearRunState();
    const { cookie, agencyId } = await createConnectedAgency();
    const body = clientBody();

    const created = await api({ path: "/api/clients", method: "POST", cookie, body });
    expect([200, 201]).toContain(created.status);
    const { id } = await created.json<{ id: string }>();

    const listed = await listClients(cookie);
    expect(listed).toEqual([
      {
        id,
        name: "Example Bakery",
        ga4PropertyId: GA4_PROPERTY_ID,
        ga4PropertyName: "Example Bakery - GA4",
        gscSiteUrl: GSC_SITE_URL,
        recipients: body.recipients.map((email) => {
          return { email, unsubscribed: false };
        }),
        nextReportOn: expect.stringMatching(RUN_DATE_PATTERN),
      },
    ]);

    const updated = await api({
      path: `/api/clients/${id}`,
      method: "PUT",
      cookie,
      body: clientBody({ name: "Example Bakery Downtown", recipients: [body.recipients[0]], gscSiteUrl: null }),
    });
    expect(updated.status).toBe(200);
    expect(await listClients(cookie)).toMatchObject([
      { id, name: "Example Bakery Downtown", gscSiteUrl: null, recipients: [{ email: body.recipients[0] }] },
    ]);

    await seedReport({ agencyId, clientId: id, period: "2026-10", status: "draft" });
    const deleted = await api({ path: `/api/clients/${id}`, method: "DELETE", cookie });
    expect([200, 204]).toContain(deleted.status);
    expect(await listClients(cookie)).toEqual([]);
    expect(await countRows({ sql: "SELECT COUNT(*) AS count FROM reports WHERE client_id = ?", params: [id] })).toBe(0);
  });

  it("MM-R6 every invalid field answers 400 naming it", async () => {
    const { cookie } = await createConnectedAgency();
    const cases: Array<{ body: Record<string, unknown>; fields: string[] }> = [
      { body: clientBody({ name: "" }), fields: ["name"] },
      { body: clientBody({ name: "x".repeat(NAME_MAX + 1) }), fields: ["name"] },
      { body: clientBody({ recipients: [] }), fields: ["recipients"] },
      {
        body: clientBody({ recipients: [uniqueEmail("a"), uniqueEmail("b"), uniqueEmail("c"), uniqueEmail("d")] }),
        fields: ["recipients"],
      },
      { body: clientBody({ recipients: ["not-an-email"] }), fields: ["recipients"] },
      { body: clientBody({ ga4PropertyId: null, gscSiteUrl: null }), fields: ["ga4PropertyId", "gscSiteUrl"] },
      { body: clientBody({ ga4PropertyId: "999999999" }), fields: ["ga4PropertyId"] },
      { body: clientBody({ gscSiteUrl: "https://old-landing.example/" }), fields: ["gscSiteUrl"] },
    ];

    for (const { body, fields } of cases) {
      const response = await api({ path: "/api/clients", method: "POST", cookie, body });
      const error = await response.json<{ field?: string }>();

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(fields, JSON.stringify(body)).toContain(error.field);
    }
    expect(await listClients(cookie)).toEqual([]);
  });

  it("MM-R6 a source whose scope was not granted answers 400 naming it", async () => {
    const { cookie } = await createConnectedAgency({ scope: `${BASIC_SCOPE} ${GA4_SCOPE}` });
    const response = await api({ path: "/api/clients", method: "POST", cookie, body: clientBody() });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "gscSiteUrl" });
  });

  it("MM-R7 creating a client past the plan limit answers 402 plan_limit", async () => {
    const { cookie, agencyId } = await createConnectedAgency();
    await seedClients({ agencyId, count: PLAN.clientLimit - 1 });

    const last = await api({ path: "/api/clients", method: "POST", cookie, body: clientBody() });
    expect([200, 201]).toContain(last.status);

    const overLimit = await api({ path: "/api/clients", method: "POST", cookie, body: clientBody() });
    expect(overLimit.status).toBe(402);
    expect(await overLimit.json()).toMatchObject({ error: "plan_limit" });

    await setAgency({ agencyId, status: "active" });
    const paidOverLimit = await api({ path: "/api/clients", method: "POST", cookie, body: clientBody() });
    expect(paidOverLimit.status).toBe(402);
  });
});
