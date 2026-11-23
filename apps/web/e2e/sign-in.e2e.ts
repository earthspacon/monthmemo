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

it("MM-R35.e the Google sign-in carries ?next= as the callback", async () => {
  const { page } = await openPage();
  await stubTurnstile({ page });
  const bodies: unknown[] = [];
  await page.route("**/api/auth/sign-in/social", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.abort();
  });
  await page.goto("/sign-in?next=/app/clients");
  await page.getByRole("button", { name: VERIFY_BUTTON }).click();

  await page.getByRole("button", { name: GOOGLE_BUTTON }).click();

  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ provider: "google", callbackURL: "/app/clients" });
});

it("MM-R35.g a visitor sees a quiet Sign in link left of the primary CTA in the 390 px header", async () => {
  const { page } = await openPage({ viewport: MOBILE });
  await page.goto("/");

  const header = page.locator("header");
  const signIn = header.getByRole("link", { name: "Sign in", exact: true });
  const start = header.getByRole("link", { name: "Start free month" });
  await signIn.waitFor();
  const signInBox = await signIn.boundingBox();
  const startBox = await start.boundingBox();
  expect(signInBox).not.toBeNull();
  expect((signInBox?.x ?? 0) + (signInBox?.width ?? 0)).toBeLessThanOrEqual(startBox?.x ?? 0);
  expect(signInBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page);

  await signIn.click();
  await page.waitForURL("**/sign-in");
});

it("MM-R35.h a signed-in visitor gets Open dashboard in the header and the hero, with no layout shift", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  const header = page.locator("header");
  await page.goto("/");
  await header.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  const signedOutHeader = await header.boundingBox();
  const signedOutHero = await page.getByRole("heading", { level: 1 }).boundingBox();

  // The app marks this browser as signed in; the site checks the session only then.
  await seedSession({ context });
  await page.goto("/app/reports");
  await page.getByRole("heading", { name: "Reports" }).waitFor();
  await page.goto("/");
  await header.getByRole("link", { name: "Open dashboard" }).waitFor();
  expect(await header.getByRole("link", { name: "Sign in", exact: true }).count()).toBe(0);
  expect(await header.getByRole("link", { name: "Start free month" }).count()).toBe(0);
  expect(await header.boundingBox()).toEqual(signedOutHeader);
  expect(await page.getByRole("heading", { level: 1 }).boundingBox()).toEqual(signedOutHero);

  const heroLink = page.locator("main").getByRole("link", { name: "Open dashboard" });
  await heroLink.click();
  await page.waitForURL((url) => {
    return url.pathname === "/app/reports";
  });
});

it("MM-R35.j a first-time visitor's public pages make no session request", async () => {
  const { page } = await openPage({ viewport: MOBILE });
  const sessionCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/get-session")) {
      sessionCalls.push(request.url());
    }
  });
  await page.goto("/");
  await page.locator("header").getByRole("link", { name: "Sign in", exact: true }).waitFor();
  await page.waitForTimeout(500);

  expect(sessionCalls).toEqual([]);
});

it("MM-R35.i sign-in is one screen: Google first and a note that the same button creates the account", async () => {
  const { page } = await openPage({ viewport: MOBILE });
  await stubTurnstile({ page });
  await page.goto("/sign-in");

  await page.getByText("New here? Same button creates your account.").waitFor();
  await page.getByRole("link", { name: "MonthMemo" }).waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(MOBILE.height);
});
