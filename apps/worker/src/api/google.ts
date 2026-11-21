import type { GoogleSourcesDto } from "@monthmemo/contract";

import { createAuth } from "../auth";
import { GA4_SCOPE, GoogleApiError, GSC_SCOPE, type AccountSummary, type SiteEntry } from "../google/client";
import {
  createGoogleClientFor,
  findGoogleIdentity,
  GoogleNotConnected,
  GoogleReconnectNeeded,
  grantedSources,
  readGoogleStatus,
} from "../google/tokens";
import { HttpError, json, route, type Route } from "../http";
import type { ApiContext } from "./context";

export const CONNECT_PAGE_PATH = "/app/connect";
const PROPERTY_PREFIX = "properties/";
// Search Console lists sites the user asked for but never verified; their data can't be read.
const UNVERIFIED_PERMISSION = "siteUnverifiedUser";

function toGa4Properties(summaries: AccountSummary[]): GoogleSourcesDto["ga4"] {
  return summaries.flatMap((summary) => {
    return (summary.propertySummaries ?? []).map((property) => {
      return {
        propertyId: property.property.replace(PROPERTY_PREFIX, ""),
        name: property.displayName,
        account: summary.displayName,
      };
    });
  });
}

function toGscSites(entries: SiteEntry[]): GoogleSourcesDto["gsc"] {
  return entries
    .filter((entry) => {
      return entry.permissionLevel !== UNVERIFIED_PERMISSION;
    })
    .map((entry) => {
      return { siteUrl: entry.siteUrl };
    });
}

export const googleRoutes: Route<ApiContext>[] = [
  // Links the two read scopes to the signed-in Google user; Google is asked for a refresh token every time.
  route("POST", "/api/google/connect", async ({ deps, request }) => {
    const { headers, response } = await createAuth(deps.env).api.linkSocialAccount({
      body: {
        provider: "google",
        scopes: [GA4_SCOPE, GSC_SCOPE],
        callbackURL: CONNECT_PAGE_PATH,
        errorCallbackURL: CONNECT_PAGE_PATH,
        disableRedirect: true,
        additionalParams: { access_type: "offline", prompt: "consent" },
      },
      headers: request.headers,
      returnHeaders: true,
    });
    const answer = json({ url: response.url });

    // The OAuth state cookie must reach the browser, or the callback can't be matched to this request.
    for (const cookie of headers.getSetCookie()) {
      answer.headers.append("set-cookie", cookie);
    }
    return answer;
  }),

  route("GET", "/api/google/status", async ({ deps, user, agency }) => {
    return json(await readGoogleStatus({ db: deps.db, userId: user.id, needsReconnect: agency.googleNeedsReconnect }));
  }),

  route("GET", "/api/google/sources", async ({ deps, user, agency }) => {
    if (agency.googleNeedsReconnect) {
      throw new GoogleReconnectNeeded();
    }
    const identity = await findGoogleIdentity({ db: deps.db, userId: user.id });
    const granted = grantedSources(identity?.scope ?? null);

    if (!granted.ga4 && !granted.gsc) {
      throw new GoogleNotConnected();
    }
    const google = await createGoogleClientFor({ deps, userId: user.id });

    try {
      const [summaries, sites] = await Promise.all([
        granted.ga4 ? google.listAccountSummaries() : Promise.resolve([]),
        granted.gsc ? google.listSites() : Promise.resolve([]),
      ]);
      const sources: GoogleSourcesDto = { ga4: toGa4Properties(summaries), gsc: toGscSites(sites) };
      return json(sources);
    } catch (error) {
      if (error instanceof GoogleApiError) {
        throw new HttpError(502, "google_error", "Google didn't answer. Try again in a minute.");
      }
      throw error;
    }
  }),
];
