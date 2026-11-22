import { allSettled, fork } from "effector";
import { describe, expect, it, vi } from "vitest";

import type { SummaryResult } from "./lib";
import {
  $formError,
  $result,
  $turnstileRound,
  $turnstileToken,
  monthFieldChanged,
  summarizeClicked,
  summarizeFx,
  turnstileSolved,
} from "./model";

const RESULT: SummaryResult = {
  narrative: "Example Bakery had a good October.",
  period: "October 2026",
  clientName: "Example Bakery",
  stats: [],
};

function createScope({ handler }: { handler: (params: unknown) => SummaryResult | Promise<SummaryResult> }) {
  return fork({ handlers: [[summarizeFx, handler]] });
}

describe("Free summary model", () => {
  it("waits for the bot check before sending", async () => {
    const handler = vi.fn(() => RESULT);
    const scope = createScope({ handler });

    await allSettled(summarizeClicked, { scope });

    expect(handler).not.toHaveBeenCalled();
  });

  it("sends the example numbers with the token and shows the summary", async () => {
    const handler = vi.fn(() => RESULT);
    const scope = createScope({ handler });

    await allSettled(turnstileSolved, { scope, params: "token-1" });
    await allSettled(summarizeClicked, { scope });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "token-1",
        body: expect.objectContaining({ clientName: "Example Bakery" }),
      }),
    );
    expect(scope.getState($result)).toEqual(RESULT);
    expect(scope.getState($turnstileToken)).toBe("");
    expect(scope.getState($turnstileRound)).toBe(1);
  });

  it("explains a bad number without calling the server", async () => {
    const handler = vi.fn(() => RESULT);
    const scope = createScope({ handler });

    await allSettled(turnstileSolved, { scope, params: "token-1" });
    await allSettled(monthFieldChanged, { scope, params: { month: "thisMonth", field: "sessions", value: "-4" } });
    await allSettled(summarizeClicked, { scope });

    expect(handler).not.toHaveBeenCalled();
    expect(scope.getState($formError)).toBe("This month: sessions must be a whole number");
  });

  it("shows the server's message and asks for a fresh bot check", async () => {
    const scope = createScope({
      handler: () => {
        throw new Error("You've used today's 10 free summaries. Try again tomorrow.");
      },
    });

    await allSettled(turnstileSolved, { scope, params: "token-1" });
    await allSettled(summarizeClicked, { scope });

    expect(scope.getState($formError)).toBe("You've used today's 10 free summaries. Try again tomorrow.");
    expect(scope.getState($turnstileToken)).toBe("");
    expect(scope.getState($turnstileRound)).toBe(1);
  });
});
