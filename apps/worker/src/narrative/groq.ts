import { buildNarrativePrompt, GROQ_CHAT_URL, type NarrativeRequest, type NarrativeWriter } from "./prompt";

const HTTP_TOO_MANY_REQUESTS = 429;

// openai/gpt-oss-120b list prices on Groq in USD per token (https://groq.com/pricing).
const USD_PER_TOKEN = {
  input: 0.15 / 1_000_000,
  output: 0.6 / 1_000_000,
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

export class GroqRateLimited extends Error {
  constructor() {
    super("Groq API returned 429");
    this.name = "GroqRateLimited";
  }
}

export function calculateCostUsd(usage: Usage) {
  return (usage.prompt_tokens ?? 0) * USD_PER_TOKEN.input + (usage.completion_tokens ?? 0) * USD_PER_TOKEN.output;
}

export function createGroqWriter({ apiKey, model }: { apiKey: string; model?: string }): NarrativeWriter {
  return {
    write: async (request: NarrativeRequest) => {
      const response = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildNarrativePrompt({ request, model })),
      });

      if (response.status === HTTP_TOO_MANY_REQUESTS) {
        throw new GroqRateLimited();
      }
      if (!response.ok) {
        throw new Error(`Groq API returned ${response.status}`);
      }

      const body: { choices?: Array<{ message?: { content?: string | null } }>; usage?: Usage } = await response.json();
      const text = body.choices?.[0]?.message?.content ?? "";
      return { text, costUsd: calculateCostUsd(body.usage ?? {}) };
    },
  };
}
