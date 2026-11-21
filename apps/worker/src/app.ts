import { devRoutes } from "./api/dev";
import type { ApiContext, PublicContext } from "./api/context";
import { meRoutes } from "./api/me";
import { createAuth } from "./auth";
import type { Deps } from "./deps";
import { isDev } from "./env";
import { HttpError, errorResponse, matchRoute, type Route } from "./http";
import { getAgencyByUserId } from "./repo/agencies";
import { guardAuthRequest } from "./shield/auth-guard";

export const API_ROUTES: Route<ApiContext>[] = [...meRoutes];

// Every route with an `:id` segment; the tenancy test walks it.
export const ID_ROUTES: { method: string; path: string }[] = API_ROUTES.filter((candidate) => {
  return candidate.pattern.pathname.includes(":id");
}).map((candidate) => {
  return { method: candidate.method, path: candidate.pattern.pathname };
});

const READ_METHODS = new Set(["GET", "HEAD"]);
const AUTH_PREFIX = "/api/auth/";
// SPA routes get the app's index.html; every other unknown path is a 404.
const APP_SHELL_PATH = /^\/(app|app\/.*|sign-in)$/;
const APP_SHELL_ASSET = "/";

export async function handleRequest({ deps, request }: { deps: Deps; request: Request }) {
  try {
    return await routeRequest({ deps, request });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error);
    }
    console.error("Unhandled request error", error instanceof Error ? error.name : "unknown");
    return errorResponse(new HttpError(500, "internal", "Something went wrong"));
  }
}

async function routeRequest({ deps, request }: { deps: Deps; request: Request }) {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith(AUTH_PREFIX)) {
    await guardAuthRequest({ deps, request });
    return createAuth(deps.env).handler(request);
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
