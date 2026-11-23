import type { BillingDto } from "@monthmemo/contract";
import { useGate, useUnit } from "effector-react";

import {
  $checkoutError,
  $isCheckoutBusy,
  $isPortalBusy,
  BillingGate,
  billing,
  billingRequested,
  manageBillingClicked,
  subscribeClicked,
} from "../billing/model";
import { PlanCard } from "../pricing/PlanCard";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Banner, ErrorState, PageHeader, SkeletonRows } from "../shared/ui";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

function isPaying(status: BillingDto["status"]) {
  return status === "active" || status === "past_due";
}

function statusLine(data: BillingDto) {
  if (data.status === "trialing" && data.trialEndsAt) {
    return `${daysLeft(data.trialEndsAt)} days left in your free month`;
  }
  if (isPaying(data.status)) {
    return `Subscribed · up to ${data.clientLimit} clients`;
  }
  return "Subscribe to keep sending reports.";
}

export const BillingPage = () => {
  useGate(BillingGate);
  const { data, status, error, checkoutError, checkoutBusy, portalBusy, subscribe, manage, retry } = useUnit({
    data: billing.$data,
    status: billing.$status,
    error: billing.$error,
    checkoutError: $checkoutError,
    checkoutBusy: $isCheckoutBusy,
    portalBusy: $isPortalBusy,
    subscribe: subscribeClicked,
    manage: manageBillingClicked,
    retry: billingRequested,
  });

  if (status === "error") {
    return <ErrorState message={error} onRetry={() => retry()} />;
  }
  if (!data) {
    return <SkeletonRows />;
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" subtitle={statusLine(data)} />
      {data.status === "past_due" ? (
        <Banner tone="danger">Payment failed — reports are paused. Update your payment method to resume them.</Banner>
      ) : null}
      {data.status === "canceled" ? (
        <Banner tone="warning">Your subscription was canceled, so reports are paused. Subscribe to resume.</Banner>
      ) : null}
      {checkoutError ? <Banner tone="danger">{checkoutError}</Banner> : null}
      {isPaying(data.status) ? (
        <button type="button" className={BUTTON_SECONDARY} disabled={portalBusy} onClick={() => manage()}>
          Manage billing
        </button>
      ) : (
        <PlanCard
          action={
            <button
              type="button"
              className={`${BUTTON_PRIMARY} w-full`}
              disabled={checkoutBusy}
              onClick={() => subscribe()}
            >
              Subscribe
            </button>
          }
        />
      )}
    </div>
  );
};
