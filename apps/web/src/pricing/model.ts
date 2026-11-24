import type { BillingPeriod } from "@monthmemo/contract";
import { createEvent, createStore, sample } from "effector";

export const periodSelected = createEvent<BillingPeriod>();

export const $period = createStore<BillingPeriod>("monthly");

sample({
  clock: periodSelected,
  target: $period,
});
