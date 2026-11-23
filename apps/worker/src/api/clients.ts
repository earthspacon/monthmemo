import {
  CLIENT_RECIPIENTS_MAX,
  PLAN,
  type ClientDto,
  type ClientInput,
  type GoogleSourcesDto,
} from "@monthmemo/contract";

import { HttpError, json, readJson, route, type Route } from "../http";
import { countClients, nextRunAfter } from "../repo/agencies";
import {
  createClientRecord,
  deleteClientRecord,
  findClient,
  listClients,
  updateClientRecord,
  type ClientSources,
} from "../repo/clients";
import { requireActivePlan, type ApiContext } from "./context";
import { loadGoogleSources } from "./google";

const NAME_MAX = 80;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ISO_DAY_LENGTH = 10;

function invalid(field: string, message: string) {
  return new HttpError(400, "invalid_field", message, field);
}

function readOptionalText({ data, key }: { data: Record<string, unknown>; key: string }) {
  const value = data[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw invalid(key, `"${key}" must be a string or null`);
  }
  return value;
}

function readRecipients(data: Record<string, unknown>) {
  const value = data.recipients;

  if (!Array.isArray(value) || value.length === 0) {
    throw invalid("recipients", "Add at least one recipient");
  }
  const emails = value.map((entry) => {
    return typeof entry === "string" ? entry.trim().toLowerCase() : "";
  });
  const bad = emails.find((email) => {
    return email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email);
  });

  if (bad !== undefined) {
    throw invalid("recipients", `${bad || "An entry"} is not a valid email`);
  }
  const unique = [...new Set(emails)];

  if (unique.length > CLIENT_RECIPIENTS_MAX) {
    throw invalid("recipients", `A client can have at most ${CLIENT_RECIPIENTS_MAX} recipients`);
  }
  return unique;
}

function readClientInput(data: Record<string, unknown>): ClientInput {
  const name = typeof data.name === "string" ? data.name.trim() : "";

  if (name.length === 0 || name.length > NAME_MAX) {
    throw invalid("name", `Name must be 1-${NAME_MAX} characters`);
  }
  const recipients = readRecipients(data);
  const ga4PropertyId = readOptionalText({ data, key: "ga4PropertyId" });
  const gscSiteUrl = readOptionalText({ data, key: "gscSiteUrl" });

  if (ga4PropertyId === null && gscSiteUrl === null) {
    throw invalid("ga4PropertyId", "Pick a Google Analytics property or a Search Console site");
  }
  return { name, recipients, ga4PropertyId, gscSiteUrl };
}

// A source counts only when it is in what the agency's Google user can read now, which also carries the scope check.
function checkSources({ input, sources }: { input: ClientInput; sources: GoogleSourcesDto }): ClientSources {
  const property = sources.ga4.find((candidate) => {
    return candidate.propertyId === input.ga4PropertyId;
  });

  if (input.ga4PropertyId !== null && !property) {
    throw invalid("ga4PropertyId", "That Google Analytics property isn't available on your Google account");
  }
  const site = sources.gsc.find((candidate) => {
    return candidate.siteUrl === input.gscSiteUrl;
  });

  if (input.gscSiteUrl !== null && !site) {
    throw invalid("gscSiteUrl", "That Search Console site isn't available on your Google account");
  }
  return { ga4PropertyName: property?.name ?? null };
}

function notFound() {
  return new HttpError(404, "not_found", "Client not found");
}

export const clientRoutes: Route<ApiContext>[] = [
  route("GET", "/api/clients", async ({ deps, agency }) => {
    const nextReportOn = nextRunAfter(deps.now()).toISOString().slice(0, ISO_DAY_LENGTH);
    const clients = await listClients({ db: deps.db, agencyId: agency.id });
    const body: ClientDto[] = clients.map((client) => {
      return { ...client, nextReportOn };
    });
    return json(body);
  }),

  route("POST", "/api/clients", async (context) => {
    const { deps, agency, request } = context;
    requireActivePlan({ deps, agency });
    const input = readClientInput(await readJson(request));

    if ((await countClients({ db: deps.db, agencyId: agency.id })) >= PLAN.clientLimit) {
      throw new HttpError(
        402,
        "plan_limit",
        `MonthMemo covers up to ${PLAN.clientLimit} clients. Remove a client to add another.`,
      );
    }
    const sources = checkSources({ input, sources: await loadGoogleSources(context) });
    const id = await createClientRecord({ db: deps.db, agencyId: agency.id, input, sources, now: deps.now() });
    return json({ id }, 201);
  }),

  route("PUT", "/api/clients/:id", async (context) => {
    const { deps, agency, request, params } = context;
    const id = params.id ?? "";

    if (!(await findClient({ db: deps.db, agencyId: agency.id, id }))) {
      throw notFound();
    }
    const input = readClientInput(await readJson(request));
    const sources = checkSources({ input, sources: await loadGoogleSources(context) });
    await updateClientRecord({ db: deps.db, agencyId: agency.id, id, input, sources });
    return json({ id });
  }),

  route("DELETE", "/api/clients/:id", async ({ deps, agency, params }) => {
    const id = params.id ?? "";

    if (!(await findClient({ db: deps.db, agencyId: agency.id, id }))) {
      throw notFound();
    }
    await deleteClientRecord({ db: deps.db, agencyId: agency.id, id });
    return json({ id });
  }),
];
