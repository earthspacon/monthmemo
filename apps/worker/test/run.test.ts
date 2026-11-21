import { PLANS } from "@monthmemo/contract";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { fake, mailsTo, previousPeriodOf, type ResendMail } from "./fakes";
import {
  clearRunState,
  createConnectedAgency,
  db,
  expireAccessToken,
  GA4_PROPERTY_ID,
  MONTHLY_RUN_CRON,
  readReport,
  runCron,
  runJobs,
  SECOND_GA4_PROPERTY_ID,
  seedAgency,
  seedClient,
  seedReport,
} from "./helpers";

const MINUTE_MS = 60_000;
const JOB_TICKS = 3;

async function reportsOf(clientIds: string[]) {
  const placeholders = clientIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT client_id, period, status FROM reports WHERE client_id IN (${placeholders})`)
    .bind(...clientIds)
    .all<{ client_id: string; period: string; status: string }>();
  return results;
}

function mailText(mail: ResendMail) {
  return `${mail.subject}\n${mail.text ?? ""}\n${mail.html ?? ""}`;
}

describe("Monthly run", () => {
  beforeEach(async () => {
    await clearRunState();
  });

  it("MM-R13 the monthly cron creates one pending report per active client and none on a second run", async () => {
    const trialing = await seedAgency({ status: "trialing" });
    const active = await seedAgency({ status: "active", plan: "growth" });
    const clientIds = [
      (await seedClient({ agencyId: trialing.agencyId, name: "Example Bakery" })).clientId,
      (await seedClient({ agencyId: trialing.agencyId, name: "Northside Dental" })).clientId,
      (await seedClient({ agencyId: active.agencyId, name: "Harbor Yoga" })).clientId,
    ];
    const scheduledTime = Date.now();

    await runCron({ cron: MONTHLY_RUN_CRON, scheduledTime });
    const first = await reportsOf(clientIds);

    expect(first).toHaveLength(clientIds.length);
    expect(new Set(first.map((row) => row.client_id))).toEqual(new Set(clientIds));
    for (const row of first) {
      expect(row).toMatchObject({ status: "pending", period: previousPeriodOf(new Date(scheduledTime)) });
    }

    await runCron({ cron: MONTHLY_RUN_CRON, scheduledTime: scheduledTime + MINUTE_MS });
    expect(await reportsOf(clientIds)).toHaveLength(clientIds.length);
  });

  it("MM-R14 the run skips inactive agencies and clients past the plan limit by creation order", async () => {
    const inactiveClients: string[] = [];
    for (const status of ["expired", "canceled", "past_due"] as const) {
      const agency = await seedAgency({ status });
      inactiveClients.push((await seedClient({ agencyId: agency.agencyId })).clientId);
    }
    const downgraded = await seedAgency({ status: "active", plan: "starter" });
    const overLimit: string[] = [];
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (let index = 0; index < PLANS.starter.clientLimit + 2; index += 1) {
      const { clientId } = await seedClient({
        agencyId: downgraded.agencyId,
        name: `Client ${index + 1}`,
        createdAt: new Date(start + index * MINUTE_MS).toISOString(),
      });
      overLimit.push(clientId);
    }

    await runCron({ cron: MONTHLY_RUN_CRON });

    expect(await reportsOf(inactiveClients)).toEqual([]);
    const built = await reportsOf(overLimit);
    expect(new Set(built.map((row) => row.client_id))).toEqual(new Set(overLimit.slice(0, PLANS.starter.clientLimit)));
  });

  it("MM-R17 a revoked token fails that agency's reports, other agencies continue, one email per agency", async () => {
    const revoked = await createConnectedAgency();
    const healthy = await createConnectedAgency();
    const period = fake.currentPeriod;

    const revokedReports = [
      await seedReport({
        agencyId: revoked.agencyId,
        clientId: (await seedClient({ agencyId: revoked.agencyId, name: "Example Bakery" })).clientId,
        period,
        status: "pending",
      }),
      await seedReport({
        agencyId: revoked.agencyId,
        clientId: (await seedClient({ agencyId: revoked.agencyId, name: "Northside Dental" })).clientId,
        period,
        status: "pending",
      }),
    ];
    const lostClient = await seedClient({
      agencyId: healthy.agencyId,
      name: "Lost Property Cafe",
      ga4PropertyId: SECOND_GA4_PROPERTY_ID,
      gscSiteUrl: null,
    });
    const lostReport = await seedReport({
      agencyId: healthy.agencyId,
      clientId: lostClient.clientId,
      period,
      status: "pending",
    });
    const goodClient = await seedClient({ agencyId: healthy.agencyId, name: "Harbor Yoga" });
    const goodReport = await seedReport({
      agencyId: healthy.agencyId,
      clientId: goodClient.clientId,
      period,
      status: "pending",
    });

    fake.revokedRefreshTokens.add(revoked.refreshToken ?? "");
    await expireAccessToken(revoked.profile.email);
    fake.missingGa4Properties.add(SECOND_GA4_PROPERTY_ID);

    await runJobs(JOB_TICKS);

    for (const id of revokedReports) {
      expect(await readReport(id)).toMatchObject({ status: "failed", failure_reason: "google_reconnect_needed" });
    }
    expect(await readReport(lostReport)).toMatchObject({ status: "failed", failure_reason: "source_not_found" });
    expect(await readReport(goodReport)).toMatchObject({ status: "draft" });
    const flag = await db
      .prepare("SELECT google_needs_reconnect FROM agencies WHERE id = ?")
      .bind(revoked.agencyId)
      .first<{ google_needs_reconnect: number }>();
    expect(flag?.google_needs_reconnect).toBe(1);

    await runJobs(JOB_TICKS);
    const revokedFailureMails = mailsTo(revoked.profile.email).filter((mail) => {
      return mailText(mail).includes("Example Bakery");
    });
    expect(revokedFailureMails).toHaveLength(1);
    expect(mailText(revokedFailureMails[0])).toContain("Northside Dental");
    const healthyFailureMails = mailsTo(healthy.profile.email).filter((mail) => {
      return mailText(mail).includes("Lost Property Cafe");
    });
    expect(healthyFailureMails).toHaveLength(1);
  });

  it("MM-R17 a repeating Google 500 fails the report with google_error after 3 ticks", async () => {
    const agency = await createConnectedAgency();
    const { clientId } = await seedClient({ agencyId: agency.agencyId, name: "Example Bakery" });
    const reportId = await seedReport({
      agencyId: agency.agencyId,
      clientId,
      period: fake.currentPeriod,
      status: "pending",
    });
    fake.brokenGa4Properties.add(GA4_PROPERTY_ID);

    await runJobs(1);
    expect((await readReport(reportId)).status).toBe("pending");
    await runJobs(2);

    expect(await readReport(reportId)).toMatchObject({ status: "failed", failure_reason: "google_error" });
    expect(
      mailsTo(agency.profile.email).filter((mail) => {
        return mailText(mail).includes("Example Bakery");
      }),
    ).toHaveLength(1);
  });

  it("MM-R13 a report stuck in building for 15 min is rebuilt", async () => {
    const agency = await createConnectedAgency();
    const { clientId } = await seedClient({ agencyId: agency.agencyId, name: "Example Bakery" });
    const stuck = await seedReport({ agencyId: agency.agencyId, clientId, period: fake.currentPeriod, status: "pending" });
    const fresh = await seedReport({
      agencyId: agency.agencyId,
      clientId: (await seedClient({ agencyId: agency.agencyId, name: "Harbor Yoga" })).clientId,
      period: fake.currentPeriod,
      status: "pending",
    });
    const longAgo = new Date(Date.now() - 16 * MINUTE_MS).toISOString();
    const justNow = new Date().toISOString();
    await db.prepare("UPDATE reports SET status = 'building', updated_at = ? WHERE id = ?").bind(longAgo, stuck).run();
    await db.prepare("UPDATE reports SET status = 'building', updated_at = ? WHERE id = ?").bind(justNow, fresh).run();

    await runJobs(1);

    expect((await readReport(stuck)).status).toBe("draft");
    expect((await readReport(fresh)).status).toBe("building");
  });

  it("MM-R18 the agency gets exactly one ready-to-review email when its last pending report resolves", async () => {
    const agency = await createConnectedAgency();
    const period = fake.currentPeriod;
    const first = await seedClient({ agencyId: agency.agencyId, name: "Example Bakery" });
    const second = await seedClient({ agencyId: agency.agencyId, name: "Harbor Yoga" });
    const reports = [
      await seedReport({ agencyId: agency.agencyId, clientId: first.clientId, period, status: "pending" }),
      await seedReport({ agencyId: agency.agencyId, clientId: second.clientId, period, status: "pending" }),
    ];

    await runJobs(JOB_TICKS);
    for (const id of reports) {
      expect((await readReport(id)).status).toBe("draft");
    }
    await runJobs(JOB_TICKS);

    const ready = mailsTo(agency.profile.email).filter((mail) => {
      return mail.subject.includes("ready to review");
    });
    expect(ready).toHaveLength(1);
    expect(ready[0].subject).toContain("2 client reports are ready to review");
    expect(mailText(ready[0])).toContain(`${env.APP_URL}/app/reports`);
  });
});
