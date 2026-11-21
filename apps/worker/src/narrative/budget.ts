import type { Env } from "../env";
import type { Mailer } from "../mailer";

const DEFAULT_DAILY_CAP_USD = 5;
const DEFAULT_AGENCY_DAILY_CAP_USD = 0.1;

export type LlmBudget = {
  dailyCapUsd: number;
  agencyDailyCapUsd: number;
  alertOwner: (mail: { subject: string; text: string }) => Promise<void>;
};

// Without GROQ_API_KEY and with DEV_ROUTES=1 a template writer is used, so the caps only matter for real calls.
export function readLlmBudget({ env, mailer }: { env: Env; mailer: Mailer }): LlmBudget {
  return {
    dailyCapUsd: readUsd({ value: env.LLM_DAILY_USD_CAP, fallback: DEFAULT_DAILY_CAP_USD }),
    agencyDailyCapUsd: readUsd({ value: env.LLM_AGENCY_DAILY_USD_CAP, fallback: DEFAULT_AGENCY_DAILY_CAP_USD }),
    alertOwner: async ({ subject, text }) => {
      if (!env.OWNER_ALERT_EMAIL) {
        console.error("LLM cap reached and OWNER_ALERT_EMAIL is not set");
        return;
      }
      await mailer.send({ to: env.OWNER_ALERT_EMAIL, subject, text });
    },
  };
}

function readUsd({ value, fallback }: { value: string | undefined; fallback: number }) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
