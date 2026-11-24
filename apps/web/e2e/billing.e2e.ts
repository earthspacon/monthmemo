import { PLAN } from "@monthmemo/contract";
import { afterAll, afterEach, expect, it } from "vitest";

import {
  closeBrowser,
  closePages,
  daysLeft,
  expectNoHorizontalScroll,
  failApi,
  formatPrice,
  GENERIC_ERROR,
  MOBILE,
  openPage,
  readBilling,
  seedConnectedAgency,
  seedSession,
  stubPaddle,
} from "./helpers";

const PRICE_LINE = "/ month · cancel anytime";
const APP_PAGES = ["/app/connect", "/app/clients", "/app/reports", "/app/brand", "/app/billing"];

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R40.a a trialing agency sees the days left and the one $4 plan card", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const billing = await readBilling({ context });
  await page.goto("/app/billing");

  await page.getByText(`${daysLeft(billing.trialEndsAt ?? "")} days left in your free month`).waitFor();
  expect(billing.priceCents).toBe(PLAN.priceCents);
  await page.getByText(formatPrice(PLAN.priceCents), { exact: true }).waitFor();
  await page.getByText(PRICE_LINE).waitFor();
  await page.getByText(`Up to ${PLAN.clientLimit} clients`).waitFor();
  expect(await page.getByRole("button", { name: "Subscribe" }).count()).toBe(1);
});

it("MM-R40.b Subscribe opens Paddle checkout with the plan's price id", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const billing = await readBilling({ context });
  const paddle = await stubPaddle({ page });
  await page.goto("/app/billing");

  await page.getByRole("button", { name: "Subscribe" }).click();

  await expect.poll(() => paddle.openedPriceIds).toEqual([billing.paddlePriceId]);
});

it("MM-R40.b the Yearly switch shows $40 a year and opens Paddle checkout with the yearly price id", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const billing = await readBilling({ context });
  const paddle = await stubPaddle({ page });
  await page.goto("/app/billing");

  await page.getByRole("button", { name: "Yearly" }).click();
  await page.getByText(formatPrice(PLAN.yearlyPriceCents), { exact: true }).waitFor();
  await page.getByText("/ year · 2 months free").waitFor();
  expect(await page.getByText(PRICE_LINE).isVisible()).toBe(false);
  await page.getByRole("button", { name: "Subscribe" }).click();

  expect(billing.paddleYearlyPriceId).toBeTruthy();
  await expect.poll(() => paddle.openedPriceIds).toEqual([billing.paddleYearlyPriceId]);
});

it("MM-R40.c an active agency sees its client limit and Manage billing", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context, status: "active" });
  await page.goto("/app/billing");

  await page.getByText(`Subscribed · up to ${PLAN.clientLimit} clients`).first().waitFor();
  await page
    .getByRole("link", { name: "Manage billing" })
    .or(page.getByRole("button", { name: "Manage billing" }))
    .waitFor();
});

it("MM-R40.d a past-due agency is told payment failed and reports are paused", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context, status: "past_due" });
  await page.goto("/app/billing");

  await page.getByText("Payment failed — reports are paused").first().waitFor();
});

it("MM-R40.e an expired trial shows the banner on every app page and the plan card on billing", async () => {
  const { context, page } = await openPage();
  const { email } = await seedConnectedAgency({ context });
  await seedSession({ context, email, status: "expired" });

  for (const path of APP_PAGES) {
    await page.goto(path);
    await page.getByText("Your free month ended").first().waitFor();
  }
  await page.getByRole("button", { name: "Subscribe" }).waitFor();
});

it("MM-R40.f a failed billing request shows the error and Retry", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/billing" });
  await page.goto("/app/billing");

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("button", { name: "Subscribe" }).waitFor();
});

it("MM-R40.g the plan card fits a 390 px phone with a full-width Subscribe button", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  await page.goto("/app/billing");

  const button = await page.getByRole("button", { name: "Subscribe" }).boundingBox();
  expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page);
});
