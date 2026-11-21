import { afterAll, afterEach, expect, it } from "vitest";

import {
  closeBrowser,
  closePages,
  countVisibleTables,
  createClient,
  delayApi,
  expectNoHorizontalScroll,
  failApi,
  GENERIC_ERROR,
  MOBILE,
  nextRunLabel,
  openPage,
  periodLabel,
  previousPeriod,
  readBrand,
  readReport,
  seedConnectedAgency,
  seedReport,
  seedSession,
  sendReport,
  sentDayLabel,
  shiftPeriod,
} from "./helpers";

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R39.a the reports list shows skeleton rows while loading", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await delayApi({ page, path: "/api/reports" });
  await page.goto("/app/reports");

  await page.getByRole("status", { name: "Loading" }).waitFor();
});

it("MM-R39.b without reports the page names the date of the first drafts", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/reports");

  await page.getByText(`Your first drafts arrive on ${nextRunLabel()}`).waitFor();
});

it("MM-R39.c a failed reports request shows the error and Retry", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/reports" });
  await page.goto("/app/reports");

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText(`Your first drafts arrive on ${nextRunLabel()}`).waitFor();
});

it("MM-R39.d drafts are listed per client with a status badge, newest period first", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const bakery = await createClient({ context, name: "Example Bakery" });
  const florist = await createClient({ context, name: "Example Florist" });
  const latest = previousPeriod();
  const earlier = shiftPeriod({ months: -2 });
  await seedReport({ context, clientId: bakery.id, period: earlier, status: "skipped" });
  await seedReport({ context, clientId: bakery.id, period: latest, status: "draft" });
  await seedReport({ context, clientId: florist.id, period: latest, status: "draft" });
  await page.goto("/app/reports");

  await page.getByText("Example Florist").waitFor();
  await page.getByText("Example Bakery").first().waitFor();
  expect(await page.getByText("Draft", { exact: true }).count()).toBe(2);
  const text = await page.locator("main").innerText();
  const latestAt = text.indexOf(periodLabel(latest));
  const earlierAt = text.indexOf(periodLabel(earlier));
  expect(latestAt).toBeGreaterThanOrEqual(0);
  expect(earlierAt === -1 || latestAt < earlierAt).toBe(true);
});

it("MM-R39.e a draft opens as the rendered email in a sandboxed frame with Approve and Skip", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context, name: "Example Bakery" });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  const brand = await readBrand({ context });
  await page.goto("/app/reports");

  await page.getByRole("link", { name: /Example Bakery/ }).click();
  await page.waitForURL((url) => {
    return url.pathname === `/app/reports/${report.id}`;
  });
  const frame = page.locator("iframe");
  expect(await frame.getAttribute("sandbox")).not.toBeNull();
  expect(await frame.getAttribute("src")).toBe(`/api/reports/${report.id}/preview`);
  await page.frameLocator("iframe").getByText(brand.displayName).first().waitFor();
  await page.getByRole("button", { name: "Approve" }).waitFor();
  await page.getByRole("button", { name: "Skip" }).waitFor();
});

it("MM-R39.e2 opening a second draft does not show the first client while it loads", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const first = await createClient({ context, name: "First Bakery" });
  const second = await createClient({ context, name: "Second Florist" });
  const firstReport = await seedReport({ context, clientId: first.id, status: "draft" });
  const secondReport = await seedReport({ context, clientId: second.id, status: "draft" });
  await page.goto(`/app/reports/${firstReport.id}`);
  await page.getByRole("button", { name: "Approve" }).waitFor();

  await page.getByRole("link", { name: "Reports" }).first().click();
  const delayed = await delayApi({ page, path: `/api/reports/${secondReport.id}` });
  await page.getByRole("link", { name: /Second Florist/ }).click();

  await page.getByText("First Bakery").waitFor({ state: "detached" });
  expect(await page.getByRole("button", { name: "Approve", disabled: false }).count()).toBe(0);
  delayed.release();
  await page.getByRole("button", { name: "Approve", disabled: false }).waitFor();
});

it("MM-R39.f a pending report shows Writing the summary… and no actions", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context });
  const report = await seedReport({ context, clientId: client.id, status: "pending" });
  await page.goto(`/app/reports/${report.id}`);

  await page.getByText("Writing the summary…").waitFor();
  expect(await page.getByRole("button", { name: "Approve" }).count()).toBe(0);
  expect(await page.getByRole("button", { name: "Skip" }).count()).toBe(0);
});

it("MM-R39.g Approve disables both buttons and shows Sending…", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await delayApi({ page, path: `/api/reports/${report.id}/approve`, method: "POST" });
  await page.goto(`/app/reports/${report.id}`);

  await page.getByRole("button", { name: "Approve" }).click();

  await page.getByText("Sending…").first().waitFor();
  await page.getByRole("button", { name: "Skip", disabled: true }).waitFor();
  expect(await page.getByRole("button", { name: /Approve|Sending…/, disabled: false }).count()).toBe(0);
});

it("MM-R39.h a sent report shows Sent with the date and the recipient count", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context, name: "Example Bakery" });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await sendReport({ context, id: report.id });
  const sent = await readReport({ context, id: report.id });
  await page.goto("/app/reports");

  await page.getByText("Sent", { exact: true }).waitFor();
  await page.getByText(sentDayLabel(sent.sentAt ?? "")).waitFor();
  await page.getByText("1 recipient", { exact: true }).waitFor();
});

it("MM-R39.i Skip marks the report Skipped", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await page.goto(`/app/reports/${report.id}`);

  await page.getByRole("button", { name: "Skip" }).click();

  await page.getByText("Skipped", { exact: true }).waitFor();
  expect((await readReport({ context, id: report.id })).status).toBe("skipped");
});

it("MM-R39.j a report that failed on Google shows the reason and a Reconnect link", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context });
  await seedReport({ context, clientId: client.id, status: "failed", failureReason: "google_reconnect_needed" });
  await page.goto("/app/reports");

  await page.getByText("Google access needs to be reconnected").waitFor();
  const link = page.getByRole("link", { name: "Reconnect", exact: true });
  expect(await link.getAttribute("href")).toBe("/app/connect");
});

it("MM-R39.k a report whose email failed says Email could not be sent with the reason", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const client = await createClient({ context });
  const report = await seedReport({ context, clientId: client.id, status: "send_failed" });
  await page.goto(`/app/reports/${report.id}`);

  await page.getByText("Email could not be sent").waitFor();
  await page.getByText(/after 3 tries/i).waitFor();
});

it("MM-R39.l on an inactive plan Approve is disabled with a link to billing", async () => {
  const { context, page } = await openPage();
  const { email } = await seedConnectedAgency({ context });
  const client = await createClient({ context });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await seedSession({ context, email, status: "expired" });
  await page.goto(`/app/reports/${report.id}`);

  await page.getByRole("button", { name: "Approve", disabled: true }).waitFor();
  const billing = page.getByRole("main").getByRole("link", { name: /billing|plan/i }).first();
  expect(await billing.getAttribute("href")).toBe("/app/billing");
});

it("MM-R39.m reports are stacked cards on a 390 px phone and the preview fits the width", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  const client = await createClient({ context, name: "Example Bakery" });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await page.goto("/app/reports");

  await page.getByText("Example Bakery").waitFor();
  expect(await countVisibleTables(page)).toBe(0);
  await expectNoHorizontalScroll(page);

  await page.goto(`/app/reports/${report.id}`);
  const box = await page.locator("iframe").boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width);
  await expectNoHorizontalScroll(page);
});
