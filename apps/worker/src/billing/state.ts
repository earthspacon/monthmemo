import type { AgencyStatus } from "@monthmemo/contract";

export type PaddleStatus = "active" | "canceled" | "past_due" | "paused" | "trialing";

export const PADDLE_STATUSES: Record<PaddleStatus, true> = {
  active: true,
  canceled: true,
  past_due: true,
  paused: true,
  trialing: true,
};

// A paused subscription is not paid for, so reports stop like they do for a failed payment.
const AGENCY_STATUS_BY_PADDLE: Record<PaddleStatus, AgencyStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  paused: "past_due",
  canceled: "canceled",
};

export function agencyStatusOf(status: PaddleStatus): AgencyStatus {
  return AGENCY_STATUS_BY_PADDLE[status];
}

const ACTIVE_STATUSES = new Set<AgencyStatus>(["trialing", "active"]);

// Client create and approve are allowed on a running trial or a paid plan only.
export function isPlanActive({
  status,
  trialEndsAt,
  now,
}: {
  status: AgencyStatus;
  trialEndsAt: string | null;
  now: Date;
}) {
  if (!ACTIVE_STATUSES.has(status)) {
    return false;
  }
  return status !== "trialing" || trialEndsAt === null || trialEndsAt > now.toISOString();
}
