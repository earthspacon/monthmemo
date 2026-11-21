import { escapeHtml } from "../email/escape";
import { route, type Route } from "../http";
import { findRecipientByToken, markUnsubscribed } from "../repo/recipients";
import { consumeRateLimit } from "../repo/shield";
import { readClientIp, sha256Hex } from "../shield/client";
import type { PublicContext } from "./context";

// Mail clients may one-click many links at once, but one address never needs this many a minute.
const POSTS_PER_MINUTE = 30;
const WINDOW_MS = 60_000;
const UNKNOWN_IP = "unknown";

function page({ title, body, status = 200 }: { title: string; body: string; status?: number }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#0f172a}button{font:inherit;padding:10px 16px;border:0;border-radius:6px;background:#0f172a;color:#fff;cursor:pointer}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function invalidLink() {
  return page({ title: "This link is no longer valid", body: "<p>Nothing was changed.</p>", status: 404 });
}

export const unsubscribeRoutes: Route<PublicContext>[] = [
  route("GET", "/u/:token", async ({ deps, params }) => {
    const recipient = await findRecipientByToken({ db: deps.db, token: params.token });

    if (!recipient) {
      return invalidLink();
    }
    return page({
      title: "Unsubscribe from monthly reports",
      body: `<p>Confirm that you want to stop receiving these reports.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`,
    });
  }),
  route("POST", "/u/:token", async ({ deps, request, params }) => {
    const ip = readClientIp(request) ?? UNKNOWN_IP;
    const allowed = await consumeRateLimit({
      db: deps.db,
      key: `unsubscribe:${await sha256Hex(ip)}`,
      limit: POSTS_PER_MINUTE,
      windowMs: WINDOW_MS,
      now: deps.now(),
    });

    if (!allowed) {
      return page({ title: "Too many requests", body: "<p>Try again in a minute.</p>", status: 429 });
    }
    const recipient = await findRecipientByToken({ db: deps.db, token: params.token });

    if (!recipient) {
      return invalidLink();
    }
    await markUnsubscribed({ db: deps.db, id: recipient.id, now: deps.now() });
    return page({ title: "You won't get these reports anymore", body: "<p>You are unsubscribed.</p>" });
  }),
];
