import { NARRATIVE_WORDS_MAX } from "@monthmemo/contract";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { ANTHROPIC_URL, callsTo, fake, mailsTo, narrativeOfWords } from "./fakes";
import {
  clearRunState,
  createConnectedAgency,
  db,
  readReport,
  runJobs,
  seedClient,
  seedReport,
  todayUtc,
} from "./helpers";

const JOB_TICKS = 3;
const NARRATIVE_MODEL = "claude-haiku-5-5";
const NARRATIVE_MAX_TOKENS = 400;
const TOO_LONG_WORDS = 400;
const GOOD_WORDS = 120;
const GLOBAL_CAP_USD = 5;
const AGENCY_CAP_USD = 0.1;

type MessagesRequest = {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string | Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>;
};

function anthropicRequests() {
  return callsTo(ANTHROPIC_URL).map((call) => {
    const request: MessagesRequest = JSON.parse(call.body);
    return request;
  });
}

function promptOf(request: MessagesRequest) {
  return JSON.stringify({ system: request.system, messages: request.messages });
}

async function pendingReport() {
  const agency = await createConnectedAgency();
  const { clientId } = await seedClient({ agencyId: agency.agencyId, name: "Example Bakery" });
  const reportId = await seedReport({
    agencyId: agency.agencyId,
    clientId,
    period: fake.currentPeriod,
    status: "pending",
  });
  return { ...agency, clientId, reportId };
}

async function recordUsage({ agencyId, costUsd }: { agencyId: string; costUsd: number }) {
  await db
    .prepare("INSERT INTO llm_usage (day, agency_id, cost_usd) VALUES (?, ?, ?)")
    .bind(todayUtc(), agencyId, costUsd)
    .run();
}

function ownerAlerts() {
  return mailsTo(env.OWNER_ALERT_EMAIL);
}

describe("Report narrative", () => {
  beforeEach(async () => {
    await clearRunState();
  });

  it("MM-R15 a good reply makes the report a draft with that narrative from one model call", async () => {
    const { reportId } = await pendingReport();
    const narrative = narrativeOfWords(GOOD_WORDS);
    fake.anthropicReplies = [{ text: narrative }];

    await runJobs(JOB_TICKS);

    const report = await readReport(reportId);
    expect(report.status).toBe("draft");
    expect(report.narrative).toBe(narrative);
    const requests = anthropicRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: NARRATIVE_MODEL, max_tokens: NARRATIVE_MAX_TOKENS, temperature: 0 });
    const prompt = promptOf(requests[0]);
    expect(prompt).toContain("150 words");
    expect(prompt).toContain("4820");
  });

  it("MM-R15 an empty reply gets one retry and the second good reply makes a draft", async () => {
    const { reportId } = await pendingReport();
    fake.anthropicReplies = [{ text: "" }, { text: narrativeOfWords(GOOD_WORDS) }];

    await runJobs(JOB_TICKS);

    expect((await readReport(reportId)).status).toBe("draft");
    expect(anthropicRequests()).toHaveLength(2);
  });

  it("MM-R15 a 400-word reply gets one retry and then fails the report with narrative_failed", async () => {
    const { reportId } = await pendingReport();
    expect(TOO_LONG_WORDS).toBeGreaterThan(NARRATIVE_WORDS_MAX);
    fake.anthropicReplies = [{ text: narrativeOfWords(TOO_LONG_WORDS) }, { text: narrativeOfWords(TOO_LONG_WORDS) }];

    await runJobs(JOB_TICKS);

    expect(await readReport(reportId)).toMatchObject({ status: "failed", failure_reason: "narrative_failed" });
    expect(anthropicRequests()).toHaveLength(2);
  });

  it("MM-R16 over the global daily cap the report stays pending, the owner gets one alert, and it resumes after reset", async () => {
    const { reportId } = await pendingReport();
    const other = await createConnectedAgency();
    await recordUsage({ agencyId: other.agencyId, costUsd: GLOBAL_CAP_USD });

    await runJobs(JOB_TICKS);
    expect((await readReport(reportId)).status).toBe("pending");
    expect(anthropicRequests()).toHaveLength(0);

    await runJobs(JOB_TICKS);
    expect(ownerAlerts()).toHaveLength(1);

    await db.prepare("DELETE FROM llm_usage").run();
    await runJobs(JOB_TICKS);
    expect((await readReport(reportId)).status).toBe("draft");
    expect(ownerAlerts()).toHaveLength(1);
  });

  it("MM-R16 over its own daily cap one agency waits while another agency gets its draft", async () => {
    const capped = await pendingReport();
    const free = await pendingReport();
    await recordUsage({ agencyId: capped.agencyId, costUsd: AGENCY_CAP_USD });

    await runJobs(JOB_TICKS);

    expect((await readReport(capped.reportId)).status).toBe("pending");
    expect((await readReport(free.reportId)).status).toBe("draft");
    expect(anthropicRequests()).toHaveLength(1);
  });
});
