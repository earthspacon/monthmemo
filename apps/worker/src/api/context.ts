import { isPlanActive } from "../billing/state";
import type { Deps } from "../deps";
import { HttpError } from "../http";
import type { AgencyRow } from "../repo/agencies";

export type PublicContext = { deps: Deps };

export type ApiContext = PublicContext & {
  user: { id: string; email: string };
  agency: AgencyRow;
};

// The one guard for actions that need a running trial or a paid plan (create a client, approve a report).
export function requireActivePlan({ deps, agency }: Pick<ApiContext, "deps" | "agency">) {
  if (!isPlanActive({ status: agency.status, trialEndsAt: agency.trialEndsAt, now: deps.now() })) {
    throw new HttpError(402, "plan_inactive", "Your plan is not active. Subscribe on the billing page.");
  }
}
