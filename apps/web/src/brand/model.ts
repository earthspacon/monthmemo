import type { BrandDto } from "@monthmemo/contract";
import { combine, createEffect, createEvent, createStore, sample } from "effector";

import { apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";

const EMPTY_BRAND: BrandDto = { displayName: "", accentColor: "", logoUrl: null, replyTo: "" };
const NAME_MAX = 60;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BrandField = "displayName" | "accentColor" | "logoUrl" | "replyTo";
export type BrandForm = Record<BrandField, string>;
export type BrandErrors = Partial<Record<BrandField, string>>;

export const brandRequested = createEvent();
export const brandFieldChanged = createEvent<{ field: BrandField; value: string }>();
export const brandSaved = createEvent();

const brand = createRemote({
  handler: () => {
    return apiRequest<BrandDto>({ path: "/api/brand" });
  },
  initial: EMPTY_BRAND,
});

export const $brandStatus = brand.$status;
export const $brandError = brand.$error;

export const $form = createStore<BrandForm>({ displayName: "", accentColor: "", logoUrl: "", replyTo: "" });

const saveFx = createEffect((form: BrandForm) => {
  return apiRequest<BrandDto>({ path: "/api/brand", method: "PUT", body: toDto(form) });
});

export const $saving = saveFx.pending;

function toDto(form: BrandForm): BrandDto {
  const logoUrl = form.logoUrl.trim();
  return {
    displayName: form.displayName.trim(),
    accentColor: form.accentColor,
    logoUrl: logoUrl === "" ? null : logoUrl,
    replyTo: form.replyTo.trim(),
  };
}

function toForm(dto: BrandDto): BrandForm {
  return { ...dto, logoUrl: dto.logoUrl ?? "" };
}

export function validateBrand(form: BrandForm) {
  const errors: BrandErrors = {};
  const name = form.displayName.trim();

  if (name.length < 1 || name.length > NAME_MAX) {
    errors.displayName = `Display name must be 1-${NAME_MAX} characters`;
  }
  if (!COLOUR.test(form.accentColor)) {
    errors.accentColor = "Enter a colour as #rrggbb";
  }
  if (form.logoUrl.trim() !== "" && !isHttps(form.logoUrl.trim())) {
    errors.logoUrl = "Logo URL must start with https://";
  }
  if (!EMAIL.test(form.replyTo.trim())) {
    errors.replyTo = "Enter a valid reply-to email";
  }
  return errors;
}

function isHttps(value: string) {
  return URL.canParse(value) && new URL(value).protocol === "https:";
}

export const $errors = $form.map(validateBrand);
export const $canSave = combine($errors, $saving, (errors, saving) => {
  return Object.keys(errors).length === 0 && !saving;
});

$form.on(brandFieldChanged, (form, { field, value }) => {
  return { ...form, [field]: value };
});

sample({
  clock: brand.fx.doneData,
  fn: toForm,
  target: $form,
});

sample({
  clock: brandRequested,
  filter: brand.fx.pending.map((pending) => !pending),
  target: brand.fx,
});

sample({
  clock: brandSaved,
  source: $form,
  filter: $canSave,
  target: saveFx,
});

sample({
  clock: saveFx.done,
  fn: () => {
    return { text: "Brand saved", tone: "success" as const };
  },
  target: toastShown,
});

sample({
  clock: saveFx.failData,
  fn: (error) => {
    return { text: error.message, tone: "error" as const };
  },
  target: toastShown,
});
