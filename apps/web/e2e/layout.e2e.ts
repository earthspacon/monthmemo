import { afterAll, afterEach, expect, it } from "vitest";
import type { Locator } from "playwright";

import {
  closeBrowser,
  closePages,
  DESKTOP,
  MOBILE,
  openPage,
  seedConnectedAgency,
} from "./helpers";

const APP_HEADER_MAX_HEIGHT = 56;
const SAME_ROW_TOLERANCE = 4;
const APP_NAV = ["Reports", "Clients", "Brand", "Billing", "Google"];
const APP_PAGES = ["/app/reports", "/app/clients"];

afterEach(closePages);
afterAll(closeBrowser);

it("the app header at 390 is one row with the logo, and every nav item stays reachable", async () => {
  const { context, page } = await openPage({ viewport: MOBILE });
  await seedConnectedAgency({ context });

  for (const path of APP_PAGES) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    const header = page.locator("header").first();

    expect(await heightOf(header), path).toBeLessThanOrEqual(
      APP_HEADER_MAX_HEIGHT,
    );
    expect(await controlRows(header), path).toHaveLength(1);
    expect(
      await header.getByRole("link", { name: "MonthMemo" }).isVisible(),
      path,
    ).toBe(true);
    for (const label of APP_NAV) {
      expect(
        await page.getByRole("link", { name: label, exact: true }).isVisible(),
        `${path} ${label}`,
      ).toBe(true);
    }
  }
});

it("the app header at 1440 shows the whole nav in one row", async () => {
  const { context, page } = await openPage({ viewport: DESKTOP });
  await seedConnectedAgency({ context });
  await page.goto("/app/reports");
  await page.getByRole("heading", { level: 1 }).waitFor();
  const header = page.locator("header").first();

  expect(await controlRows(header)).toHaveLength(1);
  for (const label of APP_NAV) {
    expect(
      await header.getByRole("link", { name: label, exact: true }).isVisible(),
      label,
    ).toBe(true);
  }
});

async function heightOf(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("element is not visible");
  }
  return box.height;
}

// Distinct rows (by vertical centre) of the visible links and buttons; one entry means one row.

async function controlRows(container: Locator) {
  const centres = await container.evaluate((element) => {
    return Array.from(element.querySelectorAll("a, button"))
      .map((child) => {
        return child.getBoundingClientRect();
      })
      .filter((rect) => {
        return rect.width > 0 && rect.height > 0;
      })
      .map((rect) => {
        return rect.top + rect.height / 2;
      });
  });
  return centres.reduce<number[]>((rows, centre) => {
    const sameRow = rows.some((row) => {
      return Math.abs(row - centre) <= SAME_ROW_TOLERANCE;
    });
    return sameRow ? rows : [...rows, centre];
  }, []);
}
