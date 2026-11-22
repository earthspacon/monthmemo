import type { MetricChange, ReportMetrics } from "@monthmemo/contract";

export const NARRATIVE_MODEL = "openai/gpt-oss-120b";
export const NARRATIVE_MAX_TOKENS = 400;
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export const NARRATIVE_SYSTEM_PROMPT = `You write the short monthly performance note an agency sends to its client.
Write plain text only, in English, for a business owner who does not read analytics dashboards.
Say what changed and why it matters, in about 150 words (never more than 180).
Use only numbers that appear in the metrics JSON. Never invent, estimate or round to a new number.
If a section has no data, say there is not enough data yet instead of guessing.
Call a change of 5% or less normal month-to-month movement, not a win or a problem.
Do not greet, sign off, or mention the tool that produced the report.`;

// Numbers a visitor types on the free tool page: no Google connection, so only these four.
export type TypedMetrics = {
  period: string;
  previousPeriod: string;
  sessions: MetricChange;
  searchClicks: MetricChange;
  keyEvents: MetricChange;
  topPage: { current: string; previous: string };
};

export type NarrativeRequest = {
  metrics: ReportMetrics | TypedMetrics;
  clientName: string;
  period: string;
};

export type Narrative = {
  text: string;
  costUsd: number;
};

export type NarrativeWriter = {
  write: (request: NarrativeRequest) => Promise<Narrative>;
};

export type NarrativeChatRequest = {
  model: string;
  max_completion_tokens: number;
  reasoning_effort: "low";
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export function buildNarrativePrompt({
  request: { metrics, clientName, period },
  model = NARRATIVE_MODEL,
}: {
  request: NarrativeRequest;
  model?: string;
}): NarrativeChatRequest {
  return {
    model,
    max_completion_tokens: NARRATIVE_MAX_TOKENS,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Client: ${clientName}\nMonth: ${period}\n\nMetrics (JSON):\n${JSON.stringify(metrics, null, 2)}\n\nWrite the report narrative.`,
      },
    ],
  };
}

export function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function isTypedMetrics(metrics: ReportMetrics | TypedMetrics): metrics is TypedMetrics {
  return "topPage" in metrics;
}
