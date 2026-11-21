import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  buildNarrativePrompt,
  type NarrativeRequest,
  type NarrativeWriter,
} from "./prompt";

// Haiku 5.5 list prices in USD per token. Cache writes bill at 1.25x the input price.
const USD_PER_TOKEN = {
  input: 0.1 / 1_000_000,
  cacheWrite: 0.125 / 1_000_000,
  cacheRead: 0.01 / 1_000_000,
  output: 0.5 / 1_000_000,
};

type Usage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

export function calculateCostUsd(usage: Usage) {
  return (
    (usage.input_tokens ?? 0) * USD_PER_TOKEN.input +
    (usage.cache_creation_input_tokens ?? 0) * USD_PER_TOKEN.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * USD_PER_TOKEN.cacheRead +
    (usage.output_tokens ?? 0) * USD_PER_TOKEN.output
  );
}

export function createAnthropicWriter({ apiKey }: { apiKey: string }): NarrativeWriter {
  return {
    write: async (request: NarrativeRequest) => {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(buildNarrativePrompt(request)),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API returned ${response.status}`);
      }

      const body: { content?: Array<{ type: string; text?: string }>; usage?: Usage } = await response.json();
      const text = body.content?.find((block) => block.type === "text")?.text ?? "";
      return { text, costUsd: calculateCostUsd(body.usage ?? {}) };
    },
  };
}
