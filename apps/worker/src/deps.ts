import type { Env } from "./env";
import { isDev } from "./env";
import { createMailer, type Mailer } from "./mailer";
import { createGroqWriter } from "./narrative/groq";
import { readLlmBudget, type LlmBudget } from "./narrative/budget";
import type { NarrativeWriter } from "./narrative/prompt";
import { createTemplateWriter } from "./narrative/template";

export type Deps = {
  env: Env;
  db: D1Database;
  mailer: Mailer;
  narrative: NarrativeWriter;
  budget: LlmBudget;
  now: () => Date;
  schedule: (task: Promise<unknown>) => void;
};

function createNarrativeWriter(env: Env): NarrativeWriter {
  if (env.GROQ_API_KEY) {
    return createGroqWriter({ apiKey: env.GROQ_API_KEY, model: env.LLM_MODEL });
  }
  if (isDev(env)) {
    return createTemplateWriter();
  }
  return {
    write: async () => {
      throw new Error("GROQ_API_KEY is not set");
    },
  };
}

export function createDeps({ env, ctx }: { env: Env; ctx: ExecutionContext }): Deps {
  const mailer = createMailer(env);

  return {
    env,
    db: env.DB,
    mailer,
    narrative: createNarrativeWriter(env),
    budget: readLlmBudget({ env, mailer }),
    now: () => new Date(),
    schedule: (task) => {
      ctx.waitUntil(task);
    },
  };
}
