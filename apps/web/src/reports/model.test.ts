import { allSettled, fork } from "effector";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Report page model", () => {
  it("has no report id before the page opens and logs no error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { $reportId } = await import("./model");
    const scope = fork();

    expect(scope.getState($reportId)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("takes the report id from the opened page", async () => {
    const { $reportId, ReportGate } = await import("./model");
    const scope = fork();

    await allSettled(ReportGate.open, {
      scope,
      params: { id: "report-1" },
    });

    expect(scope.getState($reportId)).toBe("report-1");
  });
});
