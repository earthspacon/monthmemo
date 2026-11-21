import type { BillingDto } from "@monthmemo/contract";

type PaddleEvent = { name?: string };

type PaddleJs = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer: { email: string };
      customData: { agency_id: string };
      settings: { displayMode: "overlay"; theme: "light"; locale: "en" };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

// Paddle.js v2 for Paddle Billing (not Paddle Classic).
const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

export async function loadPaddle({
  billing,
  onEvent,
}: {
  billing: Pick<BillingDto, "paddleClientToken" | "paddleEnv">;
  onEvent: (name: string) => void;
}) {
  if (!billing.paddleClientToken) {
    throw new Error("Checkout isn't configured on this server yet");
  }
  if (!window.Paddle) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PADDLE_JS_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load Paddle checkout"));
      document.head.append(script);
    });
  }
  const paddle = window.Paddle;
  if (!paddle) {
    throw new Error("Couldn't load Paddle checkout");
  }
  if (billing.paddleEnv === "sandbox") {
    paddle.Environment.set("sandbox");
  }
  paddle.Initialize({
    token: billing.paddleClientToken,
    eventCallback: (event) => {
      onEvent(event.name ?? "");
    },
  });
  return paddle;
}

export function openPaddleCheckout({
  paddle,
  priceId,
  email,
  agencyId,
}: {
  paddle: PaddleJs;
  priceId: string;
  email: string;
  agencyId: string;
}) {
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email },
    customData: { agency_id: agencyId },
    settings: {
      displayMode: "overlay",
      theme: "light",
      locale: "en",
    },
  });
}
