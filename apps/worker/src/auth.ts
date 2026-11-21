import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { refreshAccessToken } from "better-auth/oauth2";

import type { Env } from "./env";
import { createAgency } from "./repo/agencies";
import { isDisposableEmail } from "./shield/disposable";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const INVALID_GRANT = "invalid_grant";
const TIMESTAMPS = {
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export type AuthHooks = {
  // Google refused the stored refresh token (revoked or expired): only a new consent brings access back.
  onRefreshRejected?: () => void;
};

function isInvalidGrant(error: unknown) {
  return typeof error === "object" && error !== null && "error" in error && error.error === INVALID_GRANT;
}

function buildSocialProviders({ env, hooks }: { env: Env; hooks: AuthHooks }) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {};
  }
  return {
    // Default scopes only (openid email profile): reading Google Analytics is a separate connect step.
    google: {
      clientId,
      clientSecret,
      prompt: "select_account" as const,
      // Better Auth's own refresh, except that a rejected refresh token is reported before the error is swallowed.
      refreshAccessToken: async (refreshToken: string) => {
        try {
          return await refreshAccessToken({
            refreshToken,
            options: { clientId, clientSecret },
            tokenEndpoint: GOOGLE_TOKEN_URL,
          });
        } catch (error) {
          if (isInvalidGrant(error)) {
            hooks.onRefreshRejected?.();
          }
          throw error;
        }
      },
    },
  };
}

export function createAuth(env: Env, hooks: AuthHooks = {}) {
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
    socialProviders: buildSocialProviders({ env, hooks }),
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
