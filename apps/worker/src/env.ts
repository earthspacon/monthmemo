export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  AUTH_LIMITER: RateLimit;
  APP_URL: string;
  MAIL_FROM: string;
  DEV_ROUTES: string;
  GOOGLE_FAKE: string;
  PADDLE_ENV: string;
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_PRICE?: string;
  LLM_MODEL?: string;
  LLM_DAILY_USD_CAP?: string;
  LLM_AGENCY_DAILY_USD_CAP?: string;
  OWNER_ALERT_EMAIL?: string;
  TURNSTILE_SITE_KEY?: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GROQ_API_KEY?: string;
  BREVO_API_KEY?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export function isDev(env: Env) {
  return env.DEV_ROUTES === "1";
}

export function isGoogleFake(env: Env) {
  return env.GOOGLE_FAKE === "1";
}
