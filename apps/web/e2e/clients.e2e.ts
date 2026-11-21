import { PLANS } from "@monthmemo/contract";
import { afterAll, afterEach, expect, it } from "vitest";

import {
  answerApi,
  closeBrowser,
  closePages,
  countVisibleTables,
  createClient,
  delayApi,
  expectNoHorizontalScroll,
  failApi,
  GENERIC_ERROR,
  listClients,
  MOBILE,
  nextRunLabel,
  openPage,
  readSources,
  seedConnectedAgency,
  seedReport,
  sendReport,
  uniqueEmail,
  unsubscribe,
} from "./helpers";

const STARTER_CLIENT_LIMIT = PLANS.starter.clientLimit;
const ADD_CLIENT = "Add client";
const GA4_PICKER = "Google Analytics property";
const GSC_PICKER = "Search Console site";

afterEach(closePages);
afterAll(closeBrowser);

it("MM-R37.a the clients list shows skeleton rows while loading", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await delayApi({ page, path: "/api/clients" });
  await page.goto("/app/clients");

  await page.getByRole("status", { name: "Loading" }).waitFor();
});

it("MM-R37.b an agency without clients sees No clients yet and Add client", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/clients");

  await page.getByText("No clients yet").waitFor();
  await page.getByRole("button", { name: ADD_CLIENT }).waitFor();
});

it("MM-R37.c a failed clients request shows the error and Retry loads it again", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/clients" });
  await page.goto("/app/clients");

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText("No clients yet").waitFor();
});

it("MM-R37.d each client shows its name, sources, recipients and next report date", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const recipient = uniqueEmail("marketing");
  const client = await createClient({ context, name: "Example Bakery", recipients: [recipient] });
  await page.goto("/app/clients");

  await page.getByText("Example Bakery").waitFor();
  await page
    .getByText(client.ga4PropertyName ?? "")
    .first()
    .waitFor();
  await page
    .getByText(client.gscSiteUrl ?? "")
    .first()
    .waitFor();
  await page.getByText(recipient).waitFor();
  await page.getByText(nextRunLabel()).first().waitFor();
});

it("MM-R37.e the source pickers are disabled with a spinner while sources load", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await delayApi({ page, path: "/api/google/sources" });
  await page.goto("/app/clients");
  await page.getByRole("button", { name: ADD_CLIENT }).click();

  expect(await page.getByLabel(GA4_PICKER).isDisabled()).toBe(true);
  expect(await page.getByLabel(GSC_PICKER).isDisabled()).toBe(true);
  await page.getByRole("status", { name: "Loading" }).waitFor();
});

it("MM-R37.f a failed sources request shows a picker error and Retry", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await failApi({ page, path: "/api/google/sources" });
  await page.goto("/app/clients");
  await page.getByRole("button", { name: ADD_CLIENT }).click();

  await page.getByText(GENERIC_ERROR).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByLabel(GA4_PICKER, { exact: true }).and(page.locator(":enabled")).waitFor();
});

it("MM-R37.g a Google account with no properties or sites says so", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await answerApi({ page, path: "/api/google/sources", body: { ga4: [], gsc: [] } });
  await page.goto("/app/clients");
  await page.getByRole("button", { name: ADD_CLIENT }).click();

  await page.getByText("No GA4 properties or Search Console sites on this Google account").waitFor();
});

it("MM-R37.h saving without recipient, with a bad email or without a source shows field errors and saves nothing", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await page.goto("/app/clients");
  await page.getByRole("button", { name: ADD_CLIENT }).click();
  await page.getByLabel("Client name").fill("Example Bakery");

  await page.getByRole("button", { name: "Save client" }).click();
  await page.getByText("Add at least one recipient").waitFor();
  await page.getByText("Pick a Google Analytics property or a Search Console site").waitFor();

  await page.getByLabel("Recipients").fill("not-an-email");
  await page.getByRole("button", { name: "Save client" }).click();
  await page.getByText("not-an-email is not a valid email").waitFor();

  expect(await listClients({ context })).toEqual([]);
});

it("MM-R37.i saving a valid client adds the row and shows Client added", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const sources = await readSources({ context });
  await page.goto("/app/clients");
  await page.getByRole("button", { name: ADD_CLIENT }).click();

  await page.getByLabel("Client name").fill("Example Bakery");
  await page.getByLabel("Recipients").fill(uniqueEmail("owner"));
  await page.getByLabel(GA4_PICKER).selectOption(sources.ga4[0]?.propertyId ?? "");
  await page.getByLabel(GSC_PICKER).selectOption(sources.gsc[0]?.siteUrl ?? "");
  await page.getByRole("button", { name: "Save client" }).click();

  await page.getByText("Client added").waitFor();
  await page.getByText("Example Bakery").waitFor();
  expect(await listClients({ context })).toHaveLength(1);
});

it("MM-R37.j at the plan limit Add client is disabled with an upgrade link", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  for (let index = 0; index < STARTER_CLIENT_LIMIT; index += 1) {
    await createClient({ context });
  }
  await page.goto("/app/clients");

  await page.getByRole("button", { name: ADD_CLIENT, disabled: true }).waitFor();
  const upgrade = page.getByRole("link", { name: "Upgrade to Growth for 15 clients" });
  expect(await upgrade.getAttribute("href")).toBe("/app/billing");
});

it("MM-R37.k deleting a client asks first; cancel keeps it, confirm removes it", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  await createClient({ context, name: "Example Bakery" });
  await page.goto("/app/clients");
  await page.getByText("Example Bakery").waitFor();

  await page.getByRole("button", { name: "Delete Example Bakery" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  expect(await listClients({ context })).toHaveLength(1);

  await page.getByRole("button", { name: "Delete Example Bakery" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete client" }).click();
  await page.getByText("Example Bakery").waitFor({ state: "detached" });
  expect(await listClients({ context })).toEqual([]);
});

it("MM-R37.l an unsubscribed recipient is shown greyed as unsubscribed", async () => {
  const { context, page } = await openPage();
  await seedConnectedAgency({ context });
  const leaving = uniqueEmail("leaving");
  const staying = uniqueEmail("staying");
  const client = await createClient({ context, recipients: [leaving, staying] });
  const report = await seedReport({ context, clientId: client.id, status: "draft" });
  await sendReport({ context, id: report.id });
  await unsubscribe(leaving);
  await page.goto("/app/clients");

  await page.getByText(leaving).waitFor();
  await page.getByText("unsubscribed", { exact: true }).waitFor();
  expect(await page.getByText("unsubscribed", { exact: true }).count()).toBe(1);
});

it("MM-R37.m clients are stacked cards on a 390 px phone", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });
  await createClient({ context, name: "Example Bakery" });
  await page.goto("/app/clients");

  await page.getByText("Example Bakery").waitFor();
  expect(await countVisibleTables(page)).toBe(0);
  await expectNoHorizontalScroll(page);
});
