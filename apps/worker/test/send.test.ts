import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { callsTo, fake, mailsTo, RESEND_URL } from "./fakes";
import {
  agencyIdOf,
  api,
  clearRunState,
  readReport,
  runJobs,
  seedClient,
  seedReport,
  setAgency,
  signInWithGoogle,
  uniqueEmail,
} from "./helpers";

const SEND_TRIES = 3;
const MAIL_FROM_ADDRESS = "reports@monthmemo.example";

async function agencyWithDraft({ recipients = [uniqueEmail("client")] }: { recipients?: string[] } = {}) {
  const { cookie, profile } = await signInWithGoogle();
  const agencyId = await agencyIdOf(profile.email);
  const client = await seedClient({ agencyId, name: "Example Bakery", recipients });
  const reportId = await seedReport({
    agencyId,
    clientId: client.clientId,
    period: fake.currentPeriod,
    status: "draft",
  });
  return { cookie, profile, agencyId, reportId, recipients: client.recipients };
}

function act({ cookie, reportId, action }: { cookie: string; reportId: string; action: "approve" | "skip" }) {
  return api({ path: `/api/reports/${reportId}/${action}`, method: "POST", cookie });
}

function resendCallsTo(address: string) {
  return callsTo(RESEND_URL).filter((call) => {
    return call.body.includes(address);
  });
}

describe("Review and send", () => {
  beforeEach(async () => {
    await clearRunState();
  });

  it("MM-R19 an approved draft is sent once per recipient with the agency brand and unsubscribe headers", async () => {
    const { cookie, profile, reportId, recipients } = await agencyWithDraft({
      recipients: [uniqueEmail("owner"), uniqueEmail("marketing")],
    });

    const approved = await act({ cookie, reportId, action: "approve" });
    expect(approved.status).toBe(200);
    expect((await readReport(reportId)).status).toBe("sending");

    await runJobs();

    const report = await readReport(reportId);
    expect(report.status).toBe("sent");
    expect(report.sent_at).not.toBeNull();
    for (const recipient of recipients) {
      const mails = mailsTo(recipient.email);
      expect(mails).toHaveLength(1);
      const [mail] = mails;
      expect(mail.from).toContain(`${profile.name} via MonthMemo`);
      expect(mail.from).toContain(`<${MAIL_FROM_ADDRESS}>`);
      expect([mail.reply_to].flat()).toEqual([profile.email]);
      expect(mail.html).toContain("Example Bakery");
      expect(mail.text).toBeTruthy();
      expect(mail.headers?.["List-Unsubscribe"]).toContain(`${env.APP_URL}/u/${recipient.token}`);
      expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  it("MM-R19 a draft that was never approved is never sent", async () => {
    const { reportId, recipients } = await agencyWithDraft();

    await runJobs(SEND_TRIES);

    expect((await readReport(reportId)).status).toBe("draft");
    expect(mailsTo(recipients[0].email)).toHaveLength(0);
  });

  it("MM-R20 skip turns a draft into skipped and approve or skip on any other status answers 409", async () => {
    const { cookie, agencyId, reportId } = await agencyWithDraft();

    const skipped = await act({ cookie, reportId, action: "skip" });
    expect(skipped.status).toBe(200);
    expect((await readReport(reportId)).status).toBe("skipped");

    const again = await act({ cookie, reportId, action: "approve" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "report_not_draft" });

    const { clientId } = await seedClient({ agencyId, name: "Harbor Yoga" });
    const sentId = await seedReport({ agencyId, clientId, period: fake.currentPeriod, status: "sent" });
    for (const action of ["approve", "skip"] as const) {
      const response = await act({ cookie, reportId: sentId, action });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "report_not_draft" });
    }
    expect((await readReport(sentId)).status).toBe("sent");
  });

  it("MM-R21 a recipient already sent is not sent again when the job retries", async () => {
    const { cookie, profile, reportId, recipients } = await agencyWithDraft({
      recipients: [uniqueEmail("owner"), uniqueEmail("bouncing"), uniqueEmail("marketing")],
    });
    const failing = recipients[1].email;
    fake.failingRecipients.add(failing);

    expect((await act({ cookie, reportId, action: "approve" })).status).toBe(200);

    await runJobs();
    expect((await readReport(reportId)).status).toBe("sending");
    await runJobs();
    expect((await readReport(reportId)).status).toBe("sending");
    await runJobs();
    expect((await readReport(reportId)).status).toBe("send_failed");
    await runJobs(SEND_TRIES);

    expect(resendCallsTo(failing)).toHaveLength(SEND_TRIES);
    for (const recipient of [recipients[0], recipients[2]]) {
      expect(mailsTo(recipient.email)).toHaveLength(1);
    }
    const failureMails = mailsTo(profile.email).filter((mail) => {
      return `${mail.subject}\n${mail.text ?? ""}\n${mail.html ?? ""}`.includes("Example Bakery");
    });
    expect(failureMails).toHaveLength(1);
  });

  it("MM-R21 two reports failing in one period send two notices", async () => {
    const { cookie, profile, agencyId, reportId, recipients } = await agencyWithDraft();
    const second = await seedClient({ agencyId, name: "Harbor Yoga", recipients: [uniqueEmail("client")] });
    const secondId = await seedReport({
      agencyId,
      clientId: second.clientId,
      period: fake.currentPeriod,
      status: "draft",
    });
    fake.failingRecipients.add(recipients[0].email);
    fake.failingRecipients.add(second.recipients[0].email);

    expect((await act({ cookie, reportId, action: "approve" })).status).toBe(200);
    expect((await act({ cookie, reportId: secondId, action: "approve" })).status).toBe(200);
    await runJobs(SEND_TRIES);

    for (const name of ["Example Bakery", "Harbor Yoga"]) {
      const notices = mailsTo(profile.email).filter((mail) => {
        return mail.subject.includes(name);
      });
      expect(notices).toHaveLength(1);
    }
  });

  it("MM-R25 a past_due agency's sending report is not sent", async () => {
    const { cookie, agencyId, reportId, recipients } = await agencyWithDraft();
    expect((await act({ cookie, reportId, action: "approve" })).status).toBe(200);
    await setAgency({ agencyId, status: "past_due" });

    await runJobs(SEND_TRIES);

    expect((await readReport(reportId)).status).toBe("sending");
    expect(mailsTo(recipients[0].email)).toHaveLength(0);
  });
});
