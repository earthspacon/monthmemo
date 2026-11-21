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
  type Billing,
  type Plan,
} from "./helpers";

const PLAN_NAMES: Record<Plan, string> = {
  starter: "Starter",
  growth: "Growth",
};
const APP_PAGES = ["/app/connect", "/app/clients", "/app/reports", "/app/brand", "/app/billing"];

afterEach(closePages);
afterAll(closeBrowser);

function findPlan({ billing, plan }: { billing: Billing; plan: Plan }) {
  const found = billing.plans.find((entry) => {
    return entry.plan === plan;
  });
  if (!found) {
    throw new Error(`billing has no ${plan} plan`);
  }
  return found;
}

it("MM-R40.a a trialing agency sees the days left and both plan cards", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const billing = await readBilling({ context });
  await page.goto("/app/billing");

  await page.getByText(`${daysLeft(billing.trialEndsAt ?? "")} days left in your free month`).waitFor();
  for (const plan of billing.plans) {
    await page.getByRole("heading", { name: PLAN_NAMES[plan.plan] }).waitFor();
    await page.getByText(formatPrice(plan.priceCents)).first().waitFor();
    await page.getByText(`${plan.clientLimit} clients`).first().waitFor();
  }
});

it("MM-R40.b choosing a plan opens Paddle checkout with that plan's price id", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const billing = await readBilling({ context });
  const paddle = await stubPaddle({ page });
  await page.goto("/app/billing");

  await page.getByRole("button", { name: "Choose Growth" }).click();

  await expect.poll(() => paddle.openedPriceIds).toEqual([findPlan({ billing, plan: "growth" }).paddlePriceId]);
});

it("MM-R40.c an active agency sees its plan and Manage billing", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context, plan: "growth", status: "active" });
  await page.goto("/app/billing");

  await page
    .getByText(/Growth plan/)
    .first()
    .waitFor();
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

it("MM-R40.e an expired trial shows the banner on every app page and plan cards on billing", async () => {
  const { context, page } = await openPage();
  const { email } = await seedConnectedAgency({ context });
  await seedSession({ context, email, status: "expired" });

  for (const path of APP_PAGES) {
    await page.goto(path);
    await page.getByText("Your free month ended").first().waitFor();
  }
  await page.getByRole("heading", { name: PLAN_NAMES.starter }).waitFor();
  await page.getByRole("heading", { name: PLAN_NAMES.growth }).waitFor();
});

it("MM-R40.f a failed billing request shows the error and Retry", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/billing" });
  await page.goto("/app/billing");

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("heading", { name: PLAN_NAMES.growth }).waitFor();
});

it("MM-R40.g plan cards stack on a 390 px phone", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  await page.goto("/app/billing");

  const starter = await page.getByRole("heading", { name: PLAN_NAMES.starter }).boundingBox();
  const growth = await page.getByRole("heading", { name: PLAN_NAMES.growth }).boundingBox();
  expect(starter).not.toBeNull();
  expect(growth).not.toBeNull();
  expect(growth?.y ?? 0).toBeGreaterThan(starter?.y ?? 0);
  await expectNoHorizontalScroll(page);
});
