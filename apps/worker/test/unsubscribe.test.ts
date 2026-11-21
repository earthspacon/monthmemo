import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { fake, mailsTo } from "./fakes";
import {
  agencyIdOf,
  api,
  BASE,
  clearRunState,
  createConnectedAgency,
  db,
  GA4_PROPERTY_ID,
  GSC_SITE_URL,
  randomToken,
  readReport,
  runJobs,
  seedClient,
  seedReport,
  signInWithGoogle,
  uniqueEmail,
  uniqueIp,
} from "./helpers";

const DONE_TEXT = /You won(?:'|&#39;|&#x27;|’)t get these reports anymore/;
const INVALID_TEXT = "This link is no longer valid";
const ONE_CLICK_BODY = "List-Unsubscribe=One-Click";
// 128 bits as base64url without padding is 22 characters (32 as hex).
const TOKEN_MIN_LENGTH = 22;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function openLink(token: string) {
  return SELF.fetch(`${BASE}/u/${token}`, { headers: { "cf-connecting-ip": uniqueIp() } });
}

function postLink({ token, body = "" }: { token: string; body?: string }) {
  return SELF.fetch(`${BASE}/u/${token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": uniqueIp() },
    body,
  });
}

async function unsubscribedAt(recipientId: string) {
  const row = await db
    .prepare("SELECT unsubscribed_at FROM recipients WHERE id = ?")
    .bind(recipientId)
    .first<{ unsubscribed_at: string | null }>();
  return row?.unsubscribed_at ?? null;
}

async function clientWithRecipients(count: number) {
  const { cookie, profile } = await signInWithGoogle();
  const agencyId = await agencyIdOf(profile.email);
  const recipients = Array.from({ length: count }, () => {
    return uniqueEmail("client");
  });
  const client = await seedClient({ agencyId, recipients });
  return { cookie, agencyId, clientId: client.clientId, recipients: client.recipients };
}

describe("Unsubscribe link", () => {
  beforeEach(async () => {
    await clearRunState();
  });

  it("MM-R22.a opening the link shows a confirm page with an unsubscribe button and changes nothing", async () => {
    const { recipients } = await clientWithRecipients(1);

    const response = await openLink(recipients[0].token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toMatch(/<form[^>]*method="post"/i);
    expect(html).toMatch(/<button/i);
    expect(await unsubscribedAt(recipients[0].id)).toBeNull();
  });

  it("MM-R22.a a client created through the API gets an unguessable link token per recipient", async () => {
    const { cookie } = await createConnectedAgency();
    const recipients = [uniqueEmail("owner"), uniqueEmail("manager")];
    const created = await api({
      path: "/api/clients",
      method: "POST",
      cookie,
      body: { name: "Example Bakery", recipients, ga4PropertyId: GA4_PROPERTY_ID, gscSiteUrl: GSC_SITE_URL },
    });
    expect([200, 201]).toContain(created.status);
    const { id } = await created.json<{ id: string }>();

    const { results } = await db
      .prepare("SELECT unsubscribe_token FROM recipients WHERE client_id = ?")
      .bind(id)
      .all<{ unsubscribe_token: string }>();
    expect(results).toHaveLength(recipients.length);
    for (const { unsubscribe_token: token } of results) {
      expect(token.length).toBeGreaterThanOrEqual(TOKEN_MIN_LENGTH);
      expect(token).toMatch(TOKEN_PATTERN);
    }
    expect(new Set(results.map((row) => row.unsubscribe_token)).size).toBe(recipients.length);
  });

  it("MM-R22.b the form post and the one-click post unsubscribe and the next send skips the address", async () => {
    const { cookie, agencyId, clientId, recipients } = await clientWithRecipients(3);
    const [byForm, byOneClick, staying] = recipients;

    const formPost = await postLink({ token: byForm.token });
    expect(formPost.status).toBe(200);
    expect(await formPost.text()).toMatch(DONE_TEXT);
    const oneClick = await postLink({ token: byOneClick.token, body: ONE_CLICK_BODY });
    expect(oneClick.status).toBe(200);
    expect(await unsubscribedAt(byForm.id)).not.toBeNull();
    expect(await unsubscribedAt(byOneClick.id)).not.toBeNull();

    const reportId = await seedReport({ agencyId, clientId, period: fake.currentPeriod, status: "draft" });
    expect((await api({ path: `/api/reports/${reportId}/approve`, method: "POST", cookie })).status).toBe(200);
    await runJobs();

    expect((await readReport(reportId)).status).toBe("sent");
    expect(mailsTo(staying.email)).toHaveLength(1);
    expect(mailsTo(byForm.email)).toHaveLength(0);
    expect(mailsTo(byOneClick.email)).toHaveLength(0);
  });

  it("MM-R22.c an unknown token shows a 404 page saying the link is no longer valid", async () => {
    const token = randomToken();

    for (const response of [await openLink(token), await postLink({ token, body: ONE_CLICK_BODY })]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain(INVALID_TEXT);
    }
  });
});
