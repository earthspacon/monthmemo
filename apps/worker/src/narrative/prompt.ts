import type { ReportMetrics } from "@monthmemo/contract";

export const NARRATIVE_MODEL = "claude-haiku-5-5";
export const NARRATIVE_MAX_TOKENS = 400;
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export const NARRATIVE_SYSTEM_PROMPT = `You write the short monthly performance note an agency sends to its client.
Write plain text only, in English, for a business owner who does not read analytics dashboards.
Say what changed and why it matters, in about 150 words (never more than 180).
Use only numbers that appear in the metrics JSON. Never invent, estimate or round to a new number.
If a section has no data, say there is not enough data yet instead of guessing.
Do not greet, sign off, or mention the tool that produced the report.`;

export type NarrativeRequest = {
  metrics: ReportMetrics;
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

export type NarrativeMessageRequest = {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
};

export function buildNarrativePrompt({ metrics, clientName, period }: NarrativeRequest): NarrativeMessageRequest {
  return {
    model: NARRATIVE_MODEL,
    max_tokens: NARRATIVE_MAX_TOKENS,
    temperature: 0,
    system: NARRATIVE_SYSTEM_PROMPT,
    messages: [
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
