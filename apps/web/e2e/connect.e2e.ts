import { afterAll, afterEach, expect, it } from "vitest";

import {
  closeBrowser,
  closePages,
  delayApi,
  expectNoHorizontalScroll,
  GENERIC_ERROR,
  MOBILE,
  openPage,
  seedConnectedAgency,
  seedGoogle,
  seedSession,
} from "./helpers";

const CONNECT_BUTTON = "Connect Google Analytics and Search Console";
const RECONNECT_BANNER_BUTTON = "Reconnect Google";
const APP_PAGES = ["/app/connect", "/app/clients", "/app/reports", "/app/brand", "/app/billing"];

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R36.a an agency without Google sees the explainer and the connect button", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  await page.goto("/app/connect");

  await page.getByRole("button", { name: CONNECT_BUTTON }).waitFor();
  await page
    .getByText(/read-only/i)
    .first()
    .waitFor();
});

it("MM-R36.b the Google status shows a skeleton while loading and an error with Retry when it fails", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  const status = await delayApi({ page, path: "/api/google/status" });
  await page.goto("/app/connect");

  await page.getByRole("status", { name: "Loading" }).waitFor();
  status.fail();
  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("button", { name: CONNECT_BUTTON }).waitFor();
});

it("MM-R36.c both scopes granted show two ticks and the first-client link", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/connect");

  await page.getByText("Google Analytics connected").waitFor();
  await page.getByText("Search Console connected").waitFor();
  const link = page.getByRole("link", { name: "Add your first client" });
  expect(await link.getAttribute("href")).toBe("/app/clients");
});

it("MM-R36.d a missing scope is named with a Reconnect button", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  await seedGoogle({ context, ga4: true, gsc: false });
  await page.goto("/app/connect");

  await page.getByText("Google Analytics connected").waitFor();
  await page.getByText("Search Console access was not granted").waitFor();
  await page.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
});

it("MM-R36.e a denied Google consent shows the error and a way to try again", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  await page.goto("/app/connect?error=access_denied");

  await page.getByText("Google access was not granted").waitFor();
  await page.getByRole("button", { name: "Try again" }).waitFor();
});

it("MM-R36.f a revoked Google token shows the reconnect banner on every app page", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  await seedGoogle({ context, needsReconnect: true });

  for (const path of APP_PAGES) {
    await page.goto(path);
    await page.getByRole("button", { name: RECONNECT_BANNER_BUTTON }).waitFor();
  }
});

it("MM-R36.g the connect page fits a 390 px phone", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  await page.goto("/app/connect");

  await page.getByRole("link", { name: "Add your first client" }).waitFor();
  await expectNoHorizontalScroll(page);
});
