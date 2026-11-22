import { CLIENT_RECIPIENTS_MAX } from "@monthmemo/contract";
import { useUnit } from "effector-react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, Card, INPUT } from "../shared/ui";
import {
  $draft,
  $formErrors,
  $saving,
  $sources,
  $sourcesEmpty,
  $sourcesError,
  $sourcesStatus,
  draftChanged,
  formClosed,
  saveSubmitted,
  sourcesRetried,
} from "./model";

const NO_SOURCES_TEXT = "No GA4 properties or Search Console sites on this Google account";

const Field = ({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) => {
  return (
    <div className="text-sm">
      <label htmlFor={id} className="block font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-800">{error}</p>}
    </div>
  );
};

const SourcePickers = () => {
  const { draft, errors, sources, status, error, empty, change, retry } = useUnit({
    draft: $draft,
    errors: $formErrors,
    sources: $sources,
    status: $sourcesStatus,
    error: $sourcesError,
    empty: $sourcesEmpty,
    change: draftChanged,
    retry: sourcesRetried,
  });
  const disabled = status !== "ready";

  return (
    <div className="space-y-3">
      {status === "loading" && (
        <p role="status" aria-label="Loading" className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your Google sources
        </p>
      )}
      {status === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" className={BUTTON_SECONDARY} onClick={() => retry()}>
            Retry
          </button>
        </div>
      )}
      {empty && <p className="text-sm text-amber-800">{NO_SOURCES_TEXT}</p>}
      <Field id="client-ga4" label="Google Analytics property">
        <select
          id="client-ga4"
          className={INPUT}
          disabled={disabled}
          value={draft.ga4PropertyId}
          onChange={(event) => change({ ga4PropertyId: event.target.value })}
        >
          <option value="">None</option>
          {sources.ga4.map((property) => {
            return (
              <option key={property.propertyId} value={property.propertyId}>
                {property.name} ({property.account})
              </option>
            );
          })}
        </select>
      </Field>
      <Field id="client-gsc" label="Search Console site">
        <select
          id="client-gsc"
          className={INPUT}
          disabled={disabled}
          value={draft.gscSiteUrl}
          onChange={(event) => change({ gscSiteUrl: event.target.value })}
        >
          <option value="">None</option>
          {sources.gsc.map((site) => {
            return (
              <option key={site.siteUrl} value={site.siteUrl}>
                {site.siteUrl}
              </option>
            );
          })}
        </select>
      </Field>
      {errors.source && <p className="text-xs text-rose-800">{errors.source}</p>}
    </div>
  );
};

export const ClientForm = ({ title }: { title: string }) => {
  const { draft, errors, saving, change, submit, close } = useUnit({
    draft: $draft,
    errors: $formErrors,
    saving: $saving,
    change: draftChanged,
    submit: saveSubmitted,
    close: formClosed,
  });

  return (
    <Card className="p-4">
      <form
        aria-label={title}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <Field id="client-name" label="Client name" error={errors.name}>
          <input
            id="client-name"
            className={INPUT}
            value={draft.name}
            onChange={(event) => change({ name: event.target.value })}
          />
        </Field>
        <Field
          id="client-recipients"
          label="Recipients"
          error={errors.recipients}
          hint={`Up to ${CLIENT_RECIPIENTS_MAX} emails, one per line`}
        >
          <textarea
            id="client-recipients"
            rows={3}
            className={INPUT}
            value={draft.recipients}
            onChange={(event) => change({ recipients: event.target.value })}
          />
        </Field>
        <SourcePickers />
        <div className="flex gap-2">
          <button type="submit" className={BUTTON_PRIMARY} disabled={saving}>
            Save client
          </button>
          <button type="button" className={BUTTON_SECONDARY} onClick={() => close()}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
};
