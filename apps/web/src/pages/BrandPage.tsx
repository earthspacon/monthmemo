import { useUnit } from "effector-react";
import { useEffect } from "react";

import {
  $brandError,
  $brandStatus,
  $canSave,
  $errors,
  $form,
  $saving,
  brandFieldChanged,
  brandRequested,
  brandSaved,
  type BrandField,
} from "../brand/model";
import { BUTTON_PRIMARY, Card, ErrorState, INPUT, PageHeader, SkeletonRows } from "../shared/ui";

const PREVIEW_LABEL = "Email header preview";
const FIELDS: Array<{ field: BrandField; label: string; type: string }> = [
  { field: "displayName", label: "Display name", type: "text" },
  { field: "accentColor", label: "Accent colour", type: "text" },
  { field: "logoUrl", label: "Logo URL", type: "url" },
  { field: "replyTo", label: "Reply-to email", type: "email" },
];
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_ACCENT = "#2563eb";

const HeaderPreview = () => {
  const form = useUnit($form);
  const logoShown = form.logoUrl.startsWith("https://");
  const accent = COLOUR.test(form.accentColor) ? form.accentColor : FALLBACK_ACCENT;

  return (
    <section
      aria-label={PREVIEW_LABEL}
      className="force-light min-w-0 rounded-xl border border-slate-200 bg-surface p-4"
    >
      {logoShown && <img src={form.logoUrl} alt="" className="mb-2 max-h-10" />}
      <p className="truncate text-xl font-bold" style={{ color: accent }}>
        {form.displayName}
      </p>
      <p className="mt-1 text-sm text-slate-600">Example Client — monthly report</p>
    </section>
  );
};

const BrandForm = () => {
  const { form, errors, saving, canSave, change, save } = useUnit({
    form: $form,
    errors: $errors,
    saving: $saving,
    canSave: $canSave,
    change: brandFieldChanged,
    save: brandSaved,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {FIELDS.map(({ field, label, type }) => {
        return (
          <div key={field}>
            <label className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type={type}
                className={INPUT}
                value={form[field]}
                onChange={(event) => change({ field, value: event.target.value })}
              />
            </label>
            {errors[field] && <p className="mt-1 text-sm text-rose-800">{errors[field]}</p>}
          </div>
        );
      })}
      <button type="submit" className={BUTTON_PRIMARY} disabled={!canSave}>
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
};

export const BrandPage = () => {
  const { status, error, load } = useUnit({ status: $brandStatus, error: $brandError, load: brandRequested });

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title="Brand" subtitle="How your reports look in your clients' inboxes." />
      {status === "loading" && <SkeletonRows rows={3} />}
      {status === "error" && <ErrorState message={error} onRetry={() => load()} />}
      {status === "ready" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <BrandForm />
          </Card>
          <HeaderPreview />
        </div>
      )}
    </div>
  );
};
