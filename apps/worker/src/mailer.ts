import { isDev, type Env } from "./env";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type Mailer = {
  send: (mail: OutboundMail) => Promise<void>;
};

const RESEND_URL = "https://api.resend.com/emails";
const ADDRESS_IN_ANGLE_BRACKETS = /<([^>]+)>/;

export function createMailer(env: Env): Mailer {
  if (env.RESEND_API_KEY) {
    return createResendMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.MAIL_FROM,
    });
  }
  if (isDev(env)) {
    return createLogMailer({ db: env.DB });
  }
  throw new Error("RESEND_API_KEY is not set");
}

export function createLogMailer({ db }: { db: D1Database }): Mailer {
  return {
    send: async ({ to, subject, text, html }) => {
      await db
        .prepare("INSERT INTO dev_outbox (to_address, subject, body, html, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(to.toLowerCase(), subject, text, html ?? null, new Date().toISOString())
        .run();
    },
  };
}

// "Display Name <address>" with the agency's name in place of the product's, same sending address.
function buildFrom({ from, fromName }: { from: string; fromName?: string }) {
  if (!fromName) {
    return from;
  }
  const address = ADDRESS_IN_ANGLE_BRACKETS.exec(from)?.[1] ?? from;
  const safeName = fromName.replace(/["<>\r\n]/g, "");
  return `${safeName} <${address}>`;
}

export function createResendMailer({ apiKey, from }: { apiKey: string; from: string }): Mailer {
  return {
    send: async ({ to, subject, text, html, fromName, replyTo, headers }) => {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: buildFrom({ from, fromName }),
          to: [to],
          subject,
          text,
          ...(html ? { html } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(headers ? { headers } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend returned ${response.status}`);
      }
    },
  };
}
