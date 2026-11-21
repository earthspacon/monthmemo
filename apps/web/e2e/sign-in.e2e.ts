import { afterAll, afterEach, expect, it } from "vitest";

import {
  closeBrowser,
  closePages,
  delayApi,
  expectNoHorizontalScroll,
  MOBILE,
  openPage,
  seedSession,
  stubTurnstile,
} from "./helpers";

const GOOGLE_BUTTON = "Continue with Google";
const VERIFY_BUTTON = "Verify you are human";

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R35.a the Google button waits for the Turnstile token", async () => {
  const { page } = await openPage();
  await stubTurnstile({ page });
  await page.goto("/sign-in");

  await page.getByRole("button", { name: GOOGLE_BUTTON, disabled: true }).waitFor();
  await page.getByRole("button", { name: VERIFY_BUTTON }).click();
  await page.getByRole("button", { name: GOOGLE_BUTTON, disabled: false }).waitFor();
});

it("MM-R35.b clicking Continue with Google disables the button and shows Redirecting…", async () => {
  const { page } = await openPage();
  await stubTurnstile({ page });
  await delayApi({ page, path: "/api/auth/sign-in/social", method: "POST" });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: VERIFY_BUTTON }).click();

  await page.getByRole("button", { name: GOOGLE_BUTTON }).click();

  await page.getByRole("button", { name: "Redirecting…", disabled: true }).waitFor();
});

it("MM-R35.c a cancelled Google sign-in shows the cancel message", async () => {
  const { page } = await openPage();
  await stubTurnstile({ page });
  await page.goto("/sign-in?error=access_denied");

  await page.getByText("Google sign-in was cancelled. Try again.").waitFor();
  await page.getByRole("button", { name: GOOGLE_BUTTON }).waitFor();
});

it("MM-R35.d a signed-in visitor is sent from sign-in to the reports", async () => {
  const { context, page } = await openPage();
  await seedSession({ context });
  await page.goto("/sign-in");

  await page.waitForURL((url) => {
    return url.pathname === "/app/reports";
  });
});

it("MM-R35.e an app page without a session redirects to sign-in with next", async () => {
  const { page } = await openPage();
  await stubTurnstile({ page });
  await page.goto("/app/clients");

  await page.waitForURL((url) => {
    return url.pathname === "/sign-in" && url.searchParams.get("next") === "/app/clients";
  });
  await page.getByRole("button", { name: GOOGLE_BUTTON }).waitFor();
});

it("MM-R35.f sign-in fits a 390 px phone with the button in view", async () => {
  const { page } = await openPage({ viewport: MOBILE });
  await stubTurnstile({ page });
  await page.goto("/sign-in");

  const button = page.getByRole("button", { name: GOOGLE_BUTTON });
  await button.waitFor();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(MOBILE.width);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(MOBILE.height);
  await expectNoHorizontalScroll(page);
});
