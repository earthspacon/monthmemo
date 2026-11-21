import { afterAll, afterEach, expect, it } from "vitest";

import {
  closeBrowser,
  closePages,
  delayApi,
  expectNoHorizontalScroll,
  failApi,
  GENERIC_ERROR,
  MOBILE,
  openPage,
  seedConnectedAgency,
} from "./helpers";

const DEFAULT_ACCENT = "#2563eb";
const PREVIEW = "Email header preview";

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R38.a the brand form opens with the defaults and a header preview", async () => {
  const { context, page } = await openPage();
  const { email } = await seedConnectedAgency({ context });
  await page.goto("/app/brand");

  const displayName = await page.getByLabel("Display name").inputValue();
  expect(displayName).not.toBe("");
  expect(await page.getByLabel("Accent colour").inputValue()).toBe(DEFAULT_ACCENT);
  expect(await page.getByLabel("Logo URL").inputValue()).toBe("");
  expect(await page.getByLabel("Reply-to email").inputValue()).toBe(email);
  await page.getByRole("region", { name: PREVIEW }).getByText(displayName).waitFor();
});

it("MM-R38.b a failed brand request shows the error and Retry", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/brand" });
  await page.goto("/app/brand");

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  expect(await page.getByLabel("Accent colour").inputValue()).toBe(DEFAULT_ACCENT);
});

it("MM-R38.c an invalid colour or an http logo shows an inline error and disables Save", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/brand");

  await page.getByLabel("Accent colour").fill("blue");
  await page.getByText("Enter a colour as #rrggbb").waitFor();
  await page.getByRole("button", { name: "Save", exact: true, disabled: true }).waitFor();

  await page.getByLabel("Accent colour").fill(DEFAULT_ACCENT);
  await page.getByLabel("Logo URL").fill("http://agency.example/logo.png");
  await page.getByText("Logo URL must start with https://").waitFor();
  await page.getByRole("button", { name: "Save", exact: true, disabled: true }).waitFor();
});

it("MM-R38.d Save disables the button and shows Saving… while pending", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await delayApi({ page, path: "/api/brand", method: "PUT" });
  await page.goto("/app/brand");

  await page.getByLabel("Display name").fill("Northwind Digital");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: "Saving…", disabled: true }).waitFor();
});

it("MM-R38.e a saved brand shows Brand saved, updates the preview and survives reload", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/brand");

  await page.getByLabel("Display name").fill("Northwind Digital");
  await page.getByLabel("Accent colour").fill("#16a34a");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByText("Brand saved").waitFor();
  await page.getByRole("region", { name: PREVIEW }).getByText("Northwind Digital").waitFor();
  await page.reload();
  expect(await page.getByLabel("Display name").inputValue()).toBe("Northwind Digital");
  expect(await page.getByLabel("Accent colour").inputValue()).toBe("#16a34a");
});

it("MM-R38.f the brand page fits a 390 px phone", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  await page.goto("/app/brand");

  await page.getByRole("button", { name: "Save", exact: true }).waitFor();
  await expectNoHorizontalScroll(page);
});
