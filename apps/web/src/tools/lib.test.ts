import { describe, expect, it } from "vitest";

import { buildSummaryRequest, EXAMPLE_FORM, formatChange, parseCount } from "./lib";

describe("Free summary form", () => {
  it("reads numbers typed with thousands separators", () => {
    expect(parseCount("4,210")).toBe(4210);
    expect(parseCount(" 1 030 ")).toBe(1030);
  });

  it("refuses decimals, negatives and empty fields", () => {
    expect(parseCount("12.5")).toBeNull();
    expect(parseCount("-3")).toBeNull();
    expect(parseCount("")).toBeNull();
  });

  it("names the first field that is not a whole number", () => {
    const form = {
      ...EXAMPLE_FORM,
      lastMonth: { ...EXAMPLE_FORM.lastMonth, searchClicks: "lots" },
    };

    expect(buildSummaryRequest(form)).toEqual({ error: "Last month: search clicks must be a whole number" });
  });

  it("sends the typed numbers as numbers", () => {
    const request = buildSummaryRequest(EXAMPLE_FORM);

    expect(request).toEqual({
      body: {
        clientName: "Example Bakery",
        thisMonth: { sessions: 4210, searchClicks: 1030, keyEvents: 96, topPage: "/sourdough-class" },
        lastMonth: { sessions: 3640, searchClicks: 880, keyEvents: 101, topPage: "/" },
      },
    });
  });

  it("shows the change like the homepage example", () => {
    expect(formatChange({ current: 4210, previous: 3640 })).toBe("+16%");
    expect(formatChange({ current: 96, previous: 101 })).toBe("-5%");
    expect(formatChange({ current: 12, previous: 0 })).toBe("new");
  });
});
