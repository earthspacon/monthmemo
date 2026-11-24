import { type AgencyStatus, PLAN } from "@monthmemo/contract";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import activated from "../fixtures/paddle/subscription.activated.json";
import { fake, mailsTo } from "./fakes";
import {
  agencyIdOf,
  api,
  BASE,
  clearRunState,
  createConnectedAgency,
  db,
  GA4_PROPERTY_ID,
  GSC_SITE_URL,
  nextHourOf,
  postPaddleEvent,
  readReport,
  runTick,
  seedAgency,
  seedClient,
  seedReport,
  setAgency,
  signInWithGoogle,
  uniqueEmail,
} from "./helpers";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const PRICE_ID = "pri_monthly_example";
const YEARLY_PRICE_ID = "pri_yearly_example";
const UNKNOWN_PRICE_ID = "pri_unknown_example";

type SubscriptionEventType =
  | "subscription.created"
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.past_due"
  | "subscription.canceled";

// The activated fixture turned into another event for one agency and one price.
function subscriptionEvent({
  type,
  status,
  priceId,
  agencyId,
  subscriptionId,
}: {
  type: SubscriptionEventType;
  status: string;
  priceId: string;
  agencyId: string;
  subscriptionId?: string;
}) {
  const event = structuredClone(activated);
  event.event_id = `evt_${crypto.randomUUID().replaceAll("-", "")}`;
  event.data.id = subscriptionId ?? event.data.id;
  event.event_type = type;
  event.data.status = status;
  event.data.custom_data.agency_id = agencyId;
  event.data.items[0].price.id = priceId;
  return JSON.stringify(event);
}

async function agencyState(agencyId: string) {
  return db.prepare("SELECT status FROM agencies WHERE id = ?").bind(agencyId).first<{ status: AgencyStatus }>();
}

describe("Billing", () => {
  beforeEach(async () => {
    await clearRunState();
  });

  it("MM-R23 the billing summary answers the trial and the one $4 plan from the shared plan", async () => {
    const { cookie, profile } = await signInWithGoogle();
    const agencyId = await agencyIdOf(profile.email);
    const row = await db
      .prepare("SELECT trial_ends_at FROM agencies WHERE id = ?")
      .bind(agencyId)
      .first<{ trial_ends_at: string }>();

    const response = await api({ path: "/api/billing", cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "trialing",
      trialEndsAt: row?.trial_ends_at,
      priceCents: PLAN.priceCents,
      yearlyPriceCents: PLAN.yearlyPriceCents,
      clientLimit: PLAN.clientLimit,
      paddlePriceId: PRICE_ID,
      paddleYearlyPriceId: YEARLY_PRICE_ID,
      paddleClientToken: env.PADDLE_CLIENT_TOKEN,
      paddleEnv: "sandbox",
    });
  });

  it("MM-R23 the billing summary needs a session", async () => {
    const response = await api({ path: "/api/billing" });
    expect(response.status).toBe(401);
  });

  it("MM-R24 a webhook with a bad signature answers 401 and alerts the owner", async () => {
    const { agencyId } = await seedAgency();
    const body = subscriptionEvent({
      type: "subscription.activated",
      status: "active",
      priceId: PRICE_ID,
      agencyId,
    });

    const forged = await postPaddleEvent({ body, secret: "pdl_ntfset_wrong_secret" });
    const unsigned = await SELF.fetch(`${BASE}/paddle/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(forged.status).toBe(401);
    expect(unsigned.status).toBe(401);
    expect(await agencyState(agencyId)).toEqual({ status: "trialing" });
    expect(mailsTo(env.OWNER_ALERT_EMAIL).length).toBeGreaterThanOrEqual(1);
  });

  it("MM-R24 signed subscription events with the plan price set the status", async () => {
    const { agencyId } = await seedAgency();
    const steps: Array<{
      type: SubscriptionEventType;
      status: string;
      priceId: string;
      expected: AgencyStatus;
    }> = [
      {
        type: "subscription.created",
        status: "active",
        priceId: PRICE_ID,
        expected: "active",
      },
      {
        type: "subscription.activated",
        status: "active",
        priceId: PRICE_ID,
        expected: "active",
      },
      { type: "subscription.updated", status: "active", priceId: PRICE_ID, expected: "active" },
      {
        type: "subscription.past_due",
        status: "past_due",
        priceId: PRICE_ID,
        expected: "past_due",
      },
      {
        type: "subscription.canceled",
        status: "canceled",
        priceId: PRICE_ID,
        expected: "canceled",
      },
    ];

    for (const step of steps) {
      const response = await postPaddleEvent({
        body: subscriptionEvent({ type: step.type, status: step.status, priceId: step.priceId, agencyId }),
      });
      expect(response.status).toBe(200);
      expect(await agencyState(agencyId)).toEqual({ status: step.expected });
    }
  });

  it("MM-R24 a yearly subscription.created and subscription.updated turn the plan on", async () => {
    const { agencyId } = await seedAgency();
    // A subscription id no earlier test has linked to another agency.
    const subscriptionId = `sub_${crypto.randomUUID().replaceAll("-", "")}`;

    for (const type of ["subscription.created", "subscription.updated"] as const) {
      const response = await postPaddleEvent({
        body: subscriptionEvent({ type, status: "active", priceId: YEARLY_PRICE_ID, agencyId, subscriptionId }),
      });
      expect(response.status).toBe(200);
      expect(await agencyState(agencyId)).toEqual({ status: "active" });
    }
  });

  it("MM-R24 a new subscription on an unknown price id leaves the trial as it is", async () => {
    const { agencyId } = await seedAgency();

    const response = await postPaddleEvent({
      body: subscriptionEvent({ type: "subscription.created", status: "active", priceId: UNKNOWN_PRICE_ID, agencyId }),
    });

    expect(response.status).toBe(200);
    expect(await agencyState(agencyId)).toEqual({ status: "trialing" });
  });

  it("MM-R24 a signed event with an unknown price id answers 200 and changes nothing", async () => {
    const { agencyId } = await seedAgency({ status: "active" });

    const response = await postPaddleEvent({
      body: subscriptionEvent({ type: "subscription.updated", status: "active", priceId: UNKNOWN_PRICE_ID, agencyId }),
    });

    expect(response.status).toBe(200);
    expect(await agencyState(agencyId)).toEqual({ status: "active" });
  });

  it("MM-R25 the maintenance cron expires a trial past its end and keeps a running one", async () => {
    const ended = await seedAgency({ status: "trialing" });
    const running = await seedAgency({ status: "trialing" });
    await setAgency({ agencyId: ended.agencyId, trialEndsAt: new Date(Date.now() - DAY_MS).toISOString() });

    await runTick({ at: nextHourOf(new Date()) });

    expect((await agencyState(ended.agencyId))?.status).toBe("expired");
    expect((await agencyState(running.agencyId))?.status).toBe("trialing");
  });

  it("MM-R25 the minute trigger runs maintenance only at the top of an hour", async () => {
    const ended = await seedAgency({ status: "trialing" });
    await setAgency({ agencyId: ended.agencyId, trialEndsAt: new Date(Date.now() - DAY_MS).toISOString() });
    const topOfHour = nextHourOf(new Date());

    await runTick({ at: new Date(topOfHour.getTime() + MINUTE_MS) });
    expect((await agencyState(ended.agencyId))?.status).toBe("trialing");

    await runTick({ at: topOfHour });
    expect((await agencyState(ended.agencyId))?.status).toBe("expired");
  });

  it("MM-R25 an inactive plan blocks client create and approve with 402 while reads and billing still work", async () => {
    const { cookie, agencyId } = await createConnectedAgency();
    const { clientId } = await seedClient({ agencyId });
    const reportId = await seedReport({ agencyId, clientId, period: fake.currentPeriod, status: "draft" });

    for (const status of ["expired", "canceled", "past_due"] as const) {
      await setAgency({ agencyId, status });

      const created = await api({
        path: "/api/clients",
        method: "POST",
        cookie,
        body: {
          name: "Harbor Yoga",
          recipients: [uniqueEmail("client")],
          ga4PropertyId: GA4_PROPERTY_ID,
          gscSiteUrl: GSC_SITE_URL,
        },
      });
      expect(created.status).toBe(402);
      expect(await created.json()).toMatchObject({ error: "plan_inactive" });

      const approved = await api({ path: `/api/reports/${reportId}/approve`, method: "POST", cookie });
      expect(approved.status).toBe(402);
      expect(await approved.json()).toMatchObject({ error: "plan_inactive" });
      expect((await readReport(reportId)).status).toBe("draft");

      for (const path of ["/api/me", "/api/clients", "/api/reports", `/api/reports/${reportId}`, "/api/billing"]) {
        expect((await api({ path, cookie })).status).toBe(200);
      }
    }
  });
});
