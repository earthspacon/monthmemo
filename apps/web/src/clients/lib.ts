import { CLIENT_RECIPIENTS_MAX, type ClientInput } from "@monthmemo/contract";

const NAME_MAX = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const RECIPIENT_SEPARATOR = /[\s,;]+/;

const RUN_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export type ClientDraft = {
  name: string;
  recipients: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
};

export type ClientFormErrors = {
  name?: string;
  recipients?: string;
  source?: string;
};

export const EMPTY_DRAFT: ClientDraft = { name: "", recipients: "", ga4PropertyId: "", gscSiteUrl: "" };

export function parseRecipients(text: string) {
  return text.split(RECIPIENT_SEPARATOR).filter((entry) => {
    return entry.length > 0;
  });
}

export function formatRunDate(iso: string) {
  return RUN_DAY_FORMAT.format(new Date(iso));
}

function validateRecipients(emails: string[]) {
  if (emails.length === 0) {
    return "Add at least one recipient";
  }
  const bad = emails.find((email) => {
    return !EMAIL_PATTERN.test(email);
  });

  if (bad !== undefined) {
    return `${bad} is not a valid email`;
  }
  if (emails.length > CLIENT_RECIPIENTS_MAX) {
    return `Use at most ${CLIENT_RECIPIENTS_MAX} recipients`;
  }
  return undefined;
}

export function validateDraft(draft: ClientDraft): { errors: ClientFormErrors; input: ClientInput | null } {
  const errors: ClientFormErrors = {};
  const name = draft.name.trim();
  const emails = parseRecipients(draft.recipients);

  if (name.length === 0 || name.length > NAME_MAX) {
    errors.name = `Enter a name of 1-${NAME_MAX} characters`;
  }
  const recipientsError = validateRecipients(emails);

  if (recipientsError) {
    errors.recipients = recipientsError;
  }
  if (!draft.ga4PropertyId && !draft.gscSiteUrl) {
    errors.source = "Pick a Google Analytics property or a Search Console site";
  }
  if (Object.keys(errors).length > 0) {
    return { errors, input: null };
  }
  return {
    errors,
    input: {
      name,
      recipients: emails,
      ga4PropertyId: draft.ga4PropertyId || null,
      gscSiteUrl: draft.gscSiteUrl || null,
    },
  };
}
