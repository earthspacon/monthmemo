import { billingRoutes } from "./api/billing";
import { brandRoutes } from "./api/brand";
import { clientRoutes } from "./api/clients";
import { devRoutes } from "./api/dev";
import type { ApiContext, PublicContext } from "./api/context";
import { CONNECT_PAGE_PATH, googleRoutes } from "./api/google";
import { meRoutes } from "./api/me";
import { reportRoutes } from "./api/reports";
import { toolRoutes } from "./api/tools";
import { unsubscribeRoutes } from "./api/unsubscribe";
import { createAuth } from "./auth";
import { handlePaddleWebhook } from "./billing/webhook";
import type { Deps } from "./deps";
import { isDev } from "./env";
import { HttpError, errorResponse, matchRoute, type Route } from "./http";
import { getAgencyByUserId, setGoogleNeedsReconnect } from "./repo/agencies";
import { guardAuthRequest } from "./shield/auth-guard";

export const API_ROUTES: Route<ApiContext>[] = [
  ...meRoutes,
  ...googleRoutes,
  ...billingRoutes,
  ...brandRoutes,
  ...clientRoutes,
  ...reportRoutes,
];

// Every route with an `:id` segment; the tenancy test walks it.
export const ID_ROUTES: { method: string; path: string }[] = API_ROUTES.filter((candidate) => {
  return candidate.pattern.pathname.includes(":id");
}).map((candidate) => {
  return { method: candidate.method, path: candidate.pattern.pathname };
});

const READ_METHODS = new Set(["GET", "HEAD"]);
const UNSUBSCRIBE_PREFIX = "/u/";
const PADDLE_WEBHOOK_PATH = "/paddle/webhook";
const AUTH_PREFIX = "/api/auth/";
// Free tools work without a session; they carry their own bot check and per-IP limit.
const TOOLS_PREFIX = "/api/tools/";
const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
// SPA routes get the app's index.html; every other unknown path is a 404.
const APP_SHELL_PATH = /^\/(app|app\/.*|sign-in)$/;
const APP_SHELL_ASSET = "/";

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://*.paddle.com",
  "frame-src 'self' https://challenges.cloudflare.com https://*.paddle.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const HSTS = "max-age=63072000; includeSubDomains; preload";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

// Responses from assets or proxies can be immutable, so the headers go onto a copy.
function withSecurityHeaders(response: Response) {
  const secured = new Response(response.body, response);

  if (!secured.headers.has("content-security-policy")) {
    secured.headers.set("content-security-policy", APP_CSP);
  }
  secured.headers.set("strict-transport-security", HSTS);
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("referrer-policy", REFERRER_POLICY);
  return secured;
}

export async function handleRequest({ deps, request }: { deps: Deps; request: Request }) {
  try {
    return withSecurityHeaders(await routeRequest({ deps, request }));
  } catch (error) {
    if (error instanceof HttpError) {
      return withSecurityHeaders(errorResponse(error));
    }
    console.error("Unhandled request error", error instanceof Error ? error.name : "unknown");
    return withSecurityHeaders(errorResponse(new HttpError(500, "internal", "Something went wrong")));
  }
}

async function routeRequest({ deps, request }: { deps: Deps; request: Request }) {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith(AUTH_PREFIX)) {
    await guardAuthRequest({ deps, request });
    const response = await createAuth(deps.env).handler(request);

    if (pathname === GOOGLE_CALLBACK_PATH) {
      await clearReconnectAfterConnect({ deps, request, response });
    }
    return response;
  }
  if (pathname.startsWith(UNSUBSCRIBE_PREFIX)) {
    return routePublicRequest({ deps, request, routes: unsubscribeRoutes });
  }
  if (pathname.startsWith(TOOLS_PREFIX)) {
    return routePublicRequest({ deps, request, routes: toolRoutes });
  }
  if (pathname === PADDLE_WEBHOOK_PATH && request.method === "POST") {
    return handlePaddleWebhook({ deps, request });
  }
  if (pathname.startsWith("/dev/")) {
    return routeDevRequest({ deps, request });
  }
  if (pathname.startsWith("/api/")) {
    return routeApiRequest({ deps, request });
  }
  if (APP_SHELL_PATH.test(pathname) && READ_METHODS.has(request.method) && deps.env.ASSETS) {
    return deps.env.ASSETS.fetch(new URL(APP_SHELL_ASSET, request.url));
  }
  if (READ_METHODS.has(request.method) && deps.env.ASSETS) {
    return deps.env.ASSETS.fetch(request);
  }
  throw new HttpError(404, "not_found", "Not found");
}

// A connect that came back to the connect page without an error stored fresh tokens, so the old flag is stale.
async function clearReconnectAfterConnect({
  deps,
  request,
  response,
}: {
  deps: Deps;
  request: Request;
  response: Response;
}) {
  const location = response.headers.get("location");

  if (!location) {
    return;
  }
  const target = new URL(location, deps.env.APP_URL);

  if (target.pathname !== CONNECT_PAGE_PATH || target.searchParams.has("error")) {
    return;
  }
  const session = await createAuth(deps.env).api.getSession({ headers: request.headers });

  if (session) {
    await setGoogleNeedsReconnect({ db: deps.db, userId: session.user.id, needsReconnect: false, now: deps.now() });
  }
}

async function routePublicRequest({
  deps,
  request,
  routes,
}: {
  deps: Deps;
  request: Request;
  routes: Route<PublicContext>[];
}) {
  const match = matchRoute<PublicContext>({ routes, request });

  if (!match) {
    throw new HttpError(404, "not_found", "Not found");
  }
  return match.route.handler({ deps, request, params: match.params });
}

async function routeDevRequest({ deps, request }: { deps: Deps; request: Request }) {
  const match = isDev(deps.env) ? matchRoute<PublicContext>({ routes: devRoutes, request }) : null;

  if (!match) {
    throw new HttpError(404, "not_found", "Not found");
  }
  return match.route.handler({ deps, request, params: match.params });
}

async function routeApiRequest({ deps, request }: { deps: Deps; request: Request }) {
  const match = matchRoute<ApiContext>({ routes: API_ROUTES, request });

  if (!match) {
    throw new HttpError(404, "not_found", "Not found");
  }

  const session = await createAuth(deps.env).api.getSession({ headers: request.headers });
  if (!session) {
    throw new HttpError(401, "unauthorized", "Sign in first");
  }

  const agency = await getAgencyByUserId({ db: deps.db, userId: session.user.id });
  if (!agency) {
    throw new HttpError(403, "no_agency", "This user has no agency");
  }
  return match.route.handler({
    deps,
    user: { id: session.user.id, email: session.user.email },
    agency,
    request,
    params: match.params,
  });
}
