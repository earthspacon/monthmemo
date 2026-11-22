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

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const NAME_AND_ADDRESS = /^(.*)<([^>]+)>\s*$/;
const URL_IN_TEXT = /https?:\/\/[^\s<]+/g;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function createMailer(env: Env): Mailer {
  if (env.BREVO_API_KEY) {
    return createBrevoMailer({
      apiKey: env.BREVO_API_KEY,
      from: env.MAIL_FROM,
    });
  }
  if (isDev(env)) {
    return createLogMailer({ db: env.DB });
  }
  throw new Error("BREVO_API_KEY is not set");
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

export function createBrevoMailer({ apiKey, from }: { apiKey: string; from: string }): Mailer {
  return {
    send: async ({ to, subject, text, html, fromName, replyTo, headers }) => {
      const response = await fetch(BREVO_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: buildSender({ from, fromName }),
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html ?? buildHtmlFromText(text),
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
          ...(headers ? { headers } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Brevo returned ${response.status}`);
      }
    },
  };
}

// The agency's name replaces the product's, the sending address stays ours.
function buildSender({ from, fromName }: { from: string; fromName?: string }) {
  const match = NAME_AND_ADDRESS.exec(from);
  const email = (match ? match[2] : from).trim();
  const name = fromName ? fromName.replace(/["<>\r\n]/g, "") : match?.[1].trim();

  if (!name) {
    return { email };
  }
  return { name, email };
}

// Brevo needs an HTML body, so plain-text mails get an escaped copy with clickable links.
function buildHtmlFromText(text: string) {
  const escaped = text.replace(/[&<>"]/g, (character) => {
    return HTML_ESCAPES[character];
  });
  const linked = escaped.replace(URL_IN_TEXT, (url) => {
    return `<a href="${url}">${url}</a>`;
  });
  return `<p>${linked.replaceAll("\n", "<br>")}</p>`;
}
