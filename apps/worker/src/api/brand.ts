import type { BrandDto } from "@monthmemo/contract";

import { HttpError, isRecord, json, readJson, route, type Route } from "../http";
import { getBrand, updateBrand } from "../repo/agencies";
import type { ApiContext } from "./context";

const NAME_MAX = 60;
const EMAIL_MAX = 254;
const URL_MAX = 2000;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(field: keyof BrandDto, message: string) {
  return new HttpError(400, "invalid_field", message, field);
}

function readLogoUrl(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.length > URL_MAX) {
    throw invalid("logoUrl", "Logo URL must be a https:// address");
  }
  const parsed = URL.canParse(value) ? new URL(value) : null;

  if (!parsed || parsed.protocol !== "https:") {
    throw invalid("logoUrl", "Logo URL must start with https://");
  }
  return value;
}

export function parseBrand(data: unknown): BrandDto {
  if (!isRecord(data)) {
    throw new HttpError(400, "invalid_json", "Request body must be a JSON object");
  }
  const displayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
  const accentColor = data.accentColor;
  const replyTo = typeof data.replyTo === "string" ? data.replyTo.trim() : "";

  if (displayName.length < 1 || displayName.length > NAME_MAX) {
    throw invalid("displayName", `Display name must be 1-${NAME_MAX} characters`);
  }
  if (typeof accentColor !== "string" || !COLOUR.test(accentColor)) {
    throw invalid("accentColor", "Enter a colour as #rrggbb");
  }
  const logoUrl = readLogoUrl(data.logoUrl);

  if (!EMAIL.test(replyTo) || replyTo.length > EMAIL_MAX) {
    throw invalid("replyTo", "Enter a valid reply-to email");
  }
  return { displayName, accentColor: accentColor.toLowerCase(), logoUrl, replyTo };
}

export const brandRoutes: Route<ApiContext>[] = [
  route("GET", "/api/brand", async ({ deps, agency }) => {
    const brand = await getBrand({ db: deps.db, agencyId: agency.id });

    if (!brand) {
      throw new HttpError(404, "not_found", "Not found");
    }
    return json(brand);
  }),
  route("PUT", "/api/brand", async ({ deps, agency, request }) => {
    const brand = parseBrand(await readJson(request));

    await updateBrand({ db: deps.db, agencyId: agency.id, brand, now: deps.now() });
    return json(brand);
  }),
];
