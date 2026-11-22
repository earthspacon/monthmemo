import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        main: "./src/index.ts",
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Test-only values: every outbound call to Google, Groq, Brevo, Paddle and Turnstile is faked in test/fakes.ts.
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEV_ROUTES: "1",
            GOOGLE_FAKE: "0",
            BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-chars",
            GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
            GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            GROQ_API_KEY: "test-groq-key",
            BREVO_API_KEY: "xkeysib-test-key",
            PADDLE_API_KEY: "test-paddle-key",
            PADDLE_CLIENT_TOKEN: "test_paddle_client_token",
            PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
    },
  };
});
