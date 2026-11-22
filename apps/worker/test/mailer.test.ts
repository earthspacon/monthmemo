import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createBrevoMailer, createMailer } from "../src/mailer";
import { BREVO_URL, callsTo, fake } from "./fakes";

const API_KEY = "xkeysib-test-key";

function lastBrevoCall() {
  const calls = callsTo(BREVO_URL);
  const call = calls[calls.length - 1];
  return {
    apiKey: call.headers.get("api-key"),
    body: JSON.parse(call.body),
  };
}

describe("Mailer", () => {
  it("sends through Brevo with the sender split out of MAIL_FROM and an HTML copy of plain text", async () => {
    const mailer = createBrevoMailer({ apiKey: API_KEY, from: "MonthMemo <reports@monthmemo.example>" });

    await mailer.send({
      to: "owner@example.com",
      subject: "Your MonthMemo sign-in link",
      text: "Sign in to <MonthMemo>:\nhttps://monthmemo.example/verify?token=a&b=1",
    });

    const { apiKey, body } = lastBrevoCall();
    expect(apiKey).toBe(API_KEY);
    expect(body.sender).toEqual({ name: "MonthMemo", email: "reports@monthmemo.example" });
    expect(body.to).toEqual([{ email: "owner@example.com" }]);
    expect(body.subject).toBe("Your MonthMemo sign-in link");
    expect(body.textContent).toBe("Sign in to <MonthMemo>:\nhttps://monthmemo.example/verify?token=a&b=1");
    expect(body.htmlContent).toContain("Sign in to &lt;MonthMemo&gt;:<br>");
    expect(body.htmlContent).toContain(
      '<a href="https://monthmemo.example/verify?token=a&amp;b=1">https://monthmemo.example/verify?token=a&amp;b=1</a>',
    );
    expect(body.replyTo).toBeUndefined();
  });

  it("puts the agency name on the product's address and keeps the report's HTML, reply-to and headers", async () => {
    const mailer = createBrevoMailer({ apiKey: API_KEY, from: "MonthMemo <reports@monthmemo.example>" });

    await mailer.send({
      to: "client@example.com",
      subject: "October report",
      text: "Report",
      html: "<h1>Report</h1>",
      fromName: 'Acme "Agency" <x> via MonthMemo',
      replyTo: "owner@acme.example",
      headers: { "List-Unsubscribe": "<https://monthmemo.example/u/token>" },
    });

    const { body } = lastBrevoCall();
    expect(body.sender).toEqual({ name: "Acme Agency x via MonthMemo", email: "reports@monthmemo.example" });
    expect(body.htmlContent).toBe("<h1>Report</h1>");
    expect(body.replyTo).toEqual({ email: "owner@acme.example" });
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://monthmemo.example/u/token>" });
  });

  it("fails the send when Brevo rejects the mail", async () => {
    fake.failingRecipients.add("bounce@example.com");
    const mailer = createBrevoMailer({ apiKey: API_KEY, from: "MonthMemo <reports@monthmemo.example>" });

    await expect(
      mailer.send({
        to: "bounce@example.com",
        subject: "October report",
        text: "Report",
      }),
    ).rejects.toThrow("Brevo returned 500");
  });

  it("refuses to run in production without a Brevo key", () => {
    expect(() => {
      return createMailer({ ...env, DEV_ROUTES: "0", BREVO_API_KEY: undefined });
    }).toThrow("BREVO_API_KEY is not set");
  });
});
