import type { GoogleStatusDto } from "@monthmemo/contract";

import { createAuth } from "../auth";
import type { Deps } from "../deps";
import { isDev, isGoogleFake } from "../env";
import { HttpError } from "../http";
import { setGoogleNeedsReconnect } from "../repo/agencies";
import { createGoogleClient, GA4_SCOPE, GSC_SCOPE, type GoogleClient } from "./client";
import { createFakeGoogleClient } from "./fake";

// Better Auth joins merged scopes with commas, Google answers them space-separated; both may be stored.
const SCOPE_SEPARATOR = /[\s,]+/;

export type GoogleIdentity = {
  id: string;
  scope: string | null;
  hasRefreshToken: boolean;
};

export class GoogleReconnectNeeded extends HttpError {
  constructor() {
    super(409, "google_reconnect_needed", "Google access has expired. Reconnect Google to keep your reports running.");
  }
}

export class GoogleNotConnected extends HttpError {
  constructor() {
    super(409, "google_not_connected", "Connect Google Analytics and Search Console first.");
  }
}

export function grantedSources(scope: string | null) {
  const scopes = new Set((scope ?? "").split(SCOPE_SEPARATOR));
  return { ga4: scopes.has(GA4_SCOPE), gsc: scopes.has(GSC_SCOPE) };
}

export async function findGoogleIdentity({ db, userId }: { db: D1Database; userId: string }) {
  const row = await db
    .prepare(
      `SELECT id, scope, refresh_token IS NOT NULL AS hasRefreshToken
       FROM auth_identities WHERE user_id = ? AND provider_id = 'google'
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string; scope: string | null; hasRefreshToken: number }>();

  if (!row) {
    return null;
  }
  return { id: row.id, scope: row.scope, hasRefreshToken: row.hasRefreshToken === 1 };
}

export async function readGoogleStatus({
  db,
  userId,
  needsReconnect,
}: {
  db: D1Database;
  userId: string;
  needsReconnect: boolean;
}): Promise<GoogleStatusDto> {
  const identity = await findGoogleIdentity({ db, userId });
  const { ga4, gsc } = grantedSources(identity?.scope ?? null);
  const connected = ga4 || gsc;
  // Without a refresh token the access dies within the hour, so a connect that got none must be repeated.
  const missingRefreshToken = connected && !identity?.hasRefreshToken;

  return { connected, ga4, gsc, needsReconnect: needsReconnect || missingRefreshToken };
}

// A valid access token through Better Auth (decrypt, refresh when expired, store). A refresh token Google rejects
// flags the agency for reconnect, so the banner shows and the monthly run skips Google until the user reconnects.
async function getGoogleAccessToken({ deps, userId }: { deps: Deps; userId: string }) {
  const identity = await findGoogleIdentity({ db: deps.db, userId });

  if (!identity) {
    throw new GoogleNotConnected();
  }
  let refreshRejected = false;
  const auth = createAuth(deps.env, {
    onRefreshRejected: () => {
      refreshRejected = true;
    },
  });

  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: identity.id, userId } });
    return accessToken;
  } catch (error) {
    if (!refreshRejected) {
      throw error;
    }
    await setGoogleNeedsReconnect({ db: deps.db, userId, needsReconnect: true, now: deps.now() });
    throw new GoogleReconnectNeeded();
  }
}

export async function createGoogleClientFor({ deps, userId }: { deps: Deps; userId: string }): Promise<GoogleClient> {
  if (isDev(deps.env) && isGoogleFake(deps.env)) {
    return createFakeGoogleClient({ now: deps.now() });
  }
  return createGoogleClient({ accessToken: await getGoogleAccessToken({ deps, userId }) });
}

// A Google API can reject a still-unexpired access token (revoked early or clock skew); one forced refresh recovers,
// and a refresh token Google refuses maps to the reconnect path instead.
export async function refreshGoogleAccessTokenFor({ deps, userId }: { deps: Deps; userId: string }) {
  const identity = await findGoogleIdentity({ db: deps.db, userId });

  if (!identity) {
    throw new GoogleNotConnected();
  }
  let refreshRejected = false;
  const auth = createAuth(deps.env, {
    onRefreshRejected: () => {
      refreshRejected = true;
    },
  });

  try {
    await auth.api.refreshToken({ body: { accountId: identity.id, userId } });
  } catch (error) {
    if (!refreshRejected) {
      throw error;
    }
    await setGoogleNeedsReconnect({ db: deps.db, userId, needsReconnect: true, now: deps.now() });
    throw new GoogleReconnectNeeded();
  }
}
