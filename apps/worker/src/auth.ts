import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";

import type { Env } from "./env";
import { createAgency } from "./repo/agencies";
import { isDisposableEmail } from "./shield/disposable";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const TIMESTAMPS = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

function buildSocialProviders(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return {};
  }
  return {
    // Default scopes only (openid email profile): reading Google Analytics is a separate connect step.
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account" as const,
    },
  };
}

export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    telemetry: { enabled: false },
    advanced: {
      ipAddress: { disableIpTracking: true },
    },
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        ...TIMESTAMPS,
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: SESSION_TTL_SECONDS,
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        ...TIMESTAMPS,
      },
    },
    socialProviders: buildSocialProviders(env),
    account: {
      // Google verifies the email, so a Google sign-in with the same address joins the existing user.
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
      modelName: "auth_identities",
      encryptOAuthTokens: true,
      fields: {
        accountId: "provider_account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        ...TIMESTAMPS,
      },
    },
    verification: {
      modelName: "verifications",
      fields: {
        expiresAt: "expires_at",
        ...TIMESTAMPS,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (isDisposableEmail(user.email.toLowerCase())) {
              throw new APIError("BAD_REQUEST", { message: "Temporary email addresses can't be used" });
            }
          },
          after: async (user) => {
            await createAgency({ db: env.DB, userId: user.id, email: user.email, name: user.name, now: new Date() });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
