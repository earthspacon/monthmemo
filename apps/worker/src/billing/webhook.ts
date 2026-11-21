import type { Deps } from "../deps";
import { isRecord, json } from "../http";
import { findBillingRowBySubscription, getBillingRow, saveSubscription, type BillingRow } from "../repo/agencies";
import { claimOwnerAlert } from "../repo/usage";
import { findPlanByPrice } from "./prices";
import { verifyPaddleSignature } from "./signature";
import { agencyStatusOf, PADDLE_STATUSES, type PaddleStatus } from "./state";

type SubscriptionData = {
  id: string;
  status: PaddleStatus;
  customerId: string | null;
  priceId: string | null;
  agencyId: string | null;
};

const SUBSCRIPTION_EVENT_PREFIX = "subscription.";
const BAD_SIGNATURE_ALERT_KIND = "paddle_bad_signature";

export async function handlePaddleWebhook({ deps, request }: { deps: Deps; request: Request }) {
  const rawBody = await request.text();
  const secret = deps.env.PADDLE_WEBHOOK_SECRET;
  const isValid = secret
    ? await verifyPaddleSignature({
        header: request.headers.get("paddle-signature"),
        rawBody,
        secret,
        now: deps.now(),
      })
    : false;

  if (!isValid) {
    console.warn("paddle webhook rejected: invalid signature");
    await alertBadSignature(deps);
    return json({ error: "unauthorized", message: "Invalid signature" }, 401);
  }

  const body = parseBody(rawBody);
  if (!body) {
    return json({ error: "invalid_json", message: "Not a Paddle event" }, 400);
  }
  const outcome = await applyEvent({ deps, eventType: body.eventType, data: body.data });
  console.log("paddle webhook", body.eventType, outcome);
  return json({ received: true, outcome });
}

async function alertBadSignature(deps: Deps) {
  const day = deps.now().toISOString().slice(0, "YYYY-MM-DD".length);

  if (!(await claimOwnerAlert({ db: deps.db, kind: BAD_SIGNATURE_ALERT_KIND, day }))) {
    return;
  }
  await deps.budget.alertOwner({
    subject: "MonthMemo rejected a Paddle webhook",
    text: "A request to the Paddle webhook had a missing or invalid signature. Check PADDLE_WEBHOOK_SECRET if real events are failing.",
  });
}

async function applyEvent({ deps, eventType, data }: { deps: Deps; eventType: string; data: Record<string, unknown> }) {
  if (!eventType.startsWith(SUBSCRIPTION_EVENT_PREFIX)) {
    return "ignored";
  }
  const subscription = parseSubscription(data);
  if (!subscription) {
    return "invalid_subscription";
  }
  const row = await findAgency({ deps, subscription });
  if (!row) {
    return "unknown_agency";
  }
  const plan = findPlanByPrice({ env: deps.env, priceId: subscription.priceId });
  if (!plan) {
    return "unknown_price";
  }
  await saveSubscription({
    db: deps.db,
    agencyId: row.id,
    plan,
    status: agencyStatusOf(subscription.status),
    customerId: subscription.customerId,
    subscriptionId: subscription.id,
    now: deps.now(),
  });
  return "applied";
}

async function findAgency({ deps, subscription }: { deps: Deps; subscription: SubscriptionData }) {
  const bySubscription = await findBillingRowBySubscription({ db: deps.db, subscriptionId: subscription.id });
  if (bySubscription) {
    return bySubscription;
  }
  const byCustomData: BillingRow | null = subscription.agencyId
    ? await getBillingRow({ db: deps.db, agencyId: subscription.agencyId })
    : null;
  return byCustomData;
}

function parseBody(rawBody: string) {
  const body: unknown = safeParse(rawBody);

  if (!isRecord(body) || !isRecord(body.data) || typeof body.event_type !== "string") {
    return null;
  }
  return { eventType: body.event_type, data: body.data };
}

function isPaddleStatus(value: unknown): value is PaddleStatus {
  return typeof value === "string" && value in PADDLE_STATUSES;
}

function parseSubscription(data: Record<string, unknown>): SubscriptionData | null {
  const { id, status } = data;

  if (typeof id !== "string" || !isPaddleStatus(status)) {
    return null;
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const price = isRecord(items[0]) && isRecord(items[0].price) ? items[0].price : null;
  const custom = isRecord(data.custom_data) ? data.custom_data : null;

  return {
    id,
    status,
    customerId: readOptionalString(data.customer_id),
    priceId: readOptionalString(price?.id),
    agencyId: readOptionalString(custom?.agency_id),
  };
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
