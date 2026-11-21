import { mkdirSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { closeBrowser, closePages, DESKTOP, MOBILE, openPage } from "./helpers";

const SHOTS_DIR = path.resolve(import.meta.dirname, "../../../.agents/reports/shots");
const SETTLE_MS = 1500;
const PAGES = [
  { name: "landing", route: "/" },
  { name: "pricing", route: "/pricing" },
  { name: "agencyanalytics-alternative", route: "/agencyanalytics-alternative" },
  { name: "automate-ga4-search-console-reports", route: "/automate-ga4-search-console-reports" },
  { name: "sign-in", route: "/sign-in" },
];
const VIEWPORTS = [
  { width: 1440, size: DESKTOP },
  { width: 390, size: MOBILE },
];

describe("public page screenshots", () => {
  afterAll(async () => {
    await closePages();
    await closeBrowser();
  });

  it.each(VIEWPORTS)("saves every public page at $width px without console errors", async ({ width, size }) => {
    mkdirSync(SHOTS_DIR, { recursive: true });
    const errors: string[] = [];
    for (const { name, route } of PAGES) {
      const { page } = await openPage({ viewport: size });
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`${route}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`${route}: ${error.message}`);
      });
      await page.goto(route, { waitUntil: "load" });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
});
