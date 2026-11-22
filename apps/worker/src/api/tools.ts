import { NARRATIVE_WORDS_MAX, type MetricChange } from "@monthmemo/contract";

import { HttpError, isRecord, json, readJson, readString, route, type Route } from "../http";
import { GroqRateLimited } from "../narrative/groq";
import { countWords, type TypedMetrics } from "../narrative/prompt";
import { periodOf } from "../reports/run";
import { consumeRateLimit } from "../repo/shield";
import { readDailyUsage, recordUsage } from "../repo/usage";
import { readClientIp, sha256Hex } from "../shield/client";
import { TURNSTILE_HEADER, verifyTurnstile } from "../shield/turnstile";
import type { PublicContext } from "./context";

export const FREE_TOOL_PATH = "/api/tools/ga4-report-summary";
// Spend of the free tool sits in llm_usage under this id, so it counts toward the global daily cap.
export const FREE_TOOL_USAGE_ID = "free-tool";
export const FREE_TOOL_RUNS_PER_DAY = 10;

const DAY_MS = 24 * 60 * 60_000;
const UNKNOWN_IP = "unknown";
const DEFAULT_CLIENT_NAME = "Your client";
const CLIENT_NAME_MAX = 80;
const TOP_PAGE_MAX = 200;
const METRIC_MAX = 1_000_000_000;
const PERCENT_DECIMALS = 10;
// Typed text goes into the prompt, so it stays one plain line.
const ONE_LINE = /^[^\p{Cc}]*$/u;

type MonthNumbers = {
  sessions: number;
  searchClicks: number;
  keyEvents: number;
  topPage: string;
};

export const toolRoutes: Route<PublicContext>[] = [
  route("POST", FREE_TOOL_PATH, async ({ deps, request }) => {
    const data = await readJson(request);
    const clientName = readOneLine({ data, key: "clientName", maxLength: CLIENT_NAME_MAX }) || DEFAULT_CLIENT_NAME;
    const thisMonth = readMonth({ data, key: "thisMonth" });
    const lastMonth = readMonth({ data, key: "lastMonth" });

    const ip = readClientIp(request);
    const isHuman = await verifyTurnstile({
      secret: deps.env.TURNSTILE_SECRET_KEY,
      token: request.headers.get(TURNSTILE_HEADER),
      ip,
    });
    if (!isHuman) {
      throw new HttpError(403, "captcha_failed", "We couldn't confirm you're human. Reload the page and try again");
    }

    const now = deps.now();
    const day = now.toISOString().slice(0, 10);
    const usage = await readDailyUsage({ db: deps.db, day, agencyId: FREE_TOOL_USAGE_ID });
    if (usage.globalUsd >= deps.budget.dailyCapUsd) {
      throw new HttpError(503, "daily_budget_reached", "The free tool is paused for today. Try again tomorrow");
    }

    const isAllowed = await consumeRateLimit({
      db: deps.db,
      key: `free-tool:${await sha256Hex(ip ?? UNKNOWN_IP)}`,
      limit: FREE_TOOL_RUNS_PER_DAY,
      windowMs: DAY_MS,
      now,
    });
    if (!isAllowed) {
      throw new HttpError(
        429,
        "rate_limited",
        `You've used today's ${FREE_TOOL_RUNS_PER_DAY} free summaries. Try again tomorrow`,
      );
    }

    const period = periodOf({ date: now });
    const metrics: TypedMetrics = {
      period,
      previousPeriod: periodOf({ date: new Date(`${period}-01T00:00:00Z`) }),
      sessions: buildChange({ current: thisMonth.sessions, previous: lastMonth.sessions }),
      searchClicks: buildChange({ current: thisMonth.searchClicks, previous: lastMonth.searchClicks }),
      keyEvents: buildChange({ current: thisMonth.keyEvents, previous: lastMonth.keyEvents }),
      topPage: { current: thisMonth.topPage, previous: lastMonth.topPage },
    };
    const narrative = await writeOnce({ deps, metrics, clientName, period, day });
    return json({ narrative, period });
  }),
];

async function writeOnce({
  deps,
  metrics,
  clientName,
  period,
  day,
}: {
  deps: PublicContext["deps"];
  metrics: TypedMetrics;
  clientName: string;
  period: string;
  day: string;
}) {
  const written = await deps.narrative.write({ metrics, clientName, period }).catch((error: unknown) => {
    if (error instanceof GroqRateLimited) {
      throw new HttpError(503, "busy", "Too many people are trying this right now. Try again in a minute");
    }
    throw error;
  });
  await recordUsage({ db: deps.db, day, agencyId: FREE_TOOL_USAGE_ID, costUsd: written.costUsd });
  const words = countWords(written.text);

  if (words === 0 || words > NARRATIVE_WORDS_MAX) {
    throw new HttpError(502, "narrative_failed", "The summary didn't come out right. Try again");
  }
  return written.text.trim();
}

function readMonth({ data, key }: { data: Record<string, unknown>; key: string }): MonthNumbers {
  const month = data[key];

  if (!isRecord(month)) {
    throw new HttpError(400, "invalid_field", `"${key}" must hold this month's numbers`, key);
  }
  return {
    sessions: readCount({ data: month, key: "sessions" }),
    searchClicks: readCount({ data: month, key: "searchClicks" }),
    keyEvents: readCount({ data: month, key: "keyEvents" }),
    topPage: readOneLine({ data: month, key: "topPage", maxLength: TOP_PAGE_MAX }),
  };
}

function readCount({ data, key }: { data: Record<string, unknown>; key: string }) {
  const value = data[key];

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > METRIC_MAX) {
    throw new HttpError(400, "invalid_field", `"${key}" must be a whole number of 0 or more`, key);
  }
  return value;
}

function readOneLine({ data, key, maxLength }: { data: Record<string, unknown>; key: string; maxLength: number }) {
  if (data[key] === undefined) {
    return "";
  }
  const value = readString({ data, key, maxLength }).trim();

  if (!ONE_LINE.test(value)) {
    throw new HttpError(400, "invalid_field", `"${key}" must be one line`, key);
  }
  return value;
}

// Rounded so the model only sees numbers it can quote as they are.
function buildChange({ current, previous }: { current: number; previous: number }): MetricChange {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: null,
    };
  }
  const percent = ((current - previous) / previous) * 100;
  return {
    current,
    previous,
    changePercent: Math.round(percent * PERCENT_DECIMALS) / PERCENT_DECIMALS,
  };
}
