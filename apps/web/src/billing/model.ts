import type { BillingDto } from "@monthmemo/contract";
import { attach, createEffect, createEvent, createStore, sample } from "effector";
import { createGate } from "effector-react";

import { $period } from "../pricing/model";
import { $me, meFx } from "../session/model";
import { apiRequest } from "../shared/api";
import { createRemote } from "../shared/remote";
import { toastShown } from "../shared/toast-model";
import { loadPaddle, openPaddleCheckout } from "./paddle";

const CHECKOUT_COMPLETED = "checkout.completed";

export const BillingGate = createGate();
export const subscribeClicked = createEvent();
export const manageBillingClicked = createEvent();
export const billingRequested = createEvent();
const paddleEventReceived = createEvent<string>();

export const billing = createRemote<void, BillingDto | null>({
  handler: () => {
    return apiRequest<BillingDto>({ path: "/api/billing" });
  },
  initial: null,
});

export const $checkoutError = createStore("");

const openCheckoutFx = attach({
  source: { data: billing.$data, me: $me, period: $period },
  effect: async ({ data, me, period }) => {
    const priceId = period === "yearly" ? data?.paddleYearlyPriceId : data?.paddlePriceId;
    if (!data || !me || !priceId) {
      throw new Error("Subscriptions aren't open yet. Your free month keeps running in the meantime.");
    }
    const paddle = await loadPaddle({ billing: data, onEvent: (name) => paddleEventReceived(name) });
    openPaddleCheckout({ paddle, priceId, email: me.email, agencyId: me.agency.id });
  },
});

const openPortalFx = createEffect(async () => {
  const { url } = await apiRequest<{ url: string }>({ path: "/api/billing/portal", method: "POST", body: {} });
  window.location.assign(url);
});

export const $isCheckoutBusy = openCheckoutFx.pending;
export const $isPortalBusy = openPortalFx.pending;

sample({
  clock: [BillingGate.open, billingRequested],
  target: billing.fx,
});

sample({
  clock: subscribeClicked,
  target: openCheckoutFx,
});

sample({
  clock: manageBillingClicked,
  filter: openPortalFx.pending.map((pending) => !pending),
  target: openPortalFx,
});

sample({
  clock: openCheckoutFx.failData,
  fn: (error) => error.message,
  target: $checkoutError,
});

sample({
  clock: subscribeClicked,
  target: $checkoutError.reinit,
});

sample({
  clock: openPortalFx.failData,
  fn: (error) => {
    return { text: error.message, tone: "error" as const };
  },
  target: toastShown,
});

// The webhook flips the plan a moment after checkout; reload both views once Paddle reports the payment.
sample({
  clock: paddleEventReceived,
  filter: (name) => name === CHECKOUT_COMPLETED,
  target: [billing.fx, meFx],
});
