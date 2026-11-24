import { PLAN, TRIAL_DAYS } from "@monthmemo/contract";

import { REFUND_DAYS, SELLER_LEGAL_NAME, SUB_PROCESSORS, SUPPORT_EMAIL } from "./config";

export type LegalSlug = "terms" | "privacy" | "refunds" | "dpa";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalDoc = {
  title: string;
  sections: LegalSection[];
};

const SUB_PROCESSOR_LINES = SUB_PROCESSORS.map((item) => `${item.name}: ${item.purpose}.`);

const OPERATOR_SECTION: LegalSection = {
  heading: "Who we are",
  paragraphs: [`MonthMemo is operated by ${SELLER_LEGAL_NAME}. Contact: ${SUPPORT_EMAIL}.`],
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: "Terms of service",
    sections: [
      OPERATOR_SECTION,
      {
        heading: "The service",
        paragraphs: [
          "MonthMemo reads your clients' Google Analytics 4 and Search Console data with your permission, writes a short monthly report and, after you approve it, emails it to the recipients you set for each client.",
          "You are responsible for having your clients' permission to report on their data and to email them.",
        ],
      },
      {
        heading: "Trial and plan",
        paragraphs: [
          `Your first ${TRIAL_DAYS} days are free with up to ${PLAN.clientLimit} clients and no card. After that, the paid plan is needed to keep sending reports. It renews every month or every year, as you chose at checkout, until you cancel.`,
          "Prices, client limits and taxes are shown on the pricing page and at checkout. Paddle is the merchant of record.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not use MonthMemo to send spam, to access data you are not entitled to, or to interfere with the service. We may suspend an account that does.",
        ],
      },
      {
        heading: "AI-written text",
        paragraphs: [
          "The narrative is written by an AI model from aggregate numbers and can be wrong. Read every report before you approve it; you are responsible for what you send to your clients.",
        ],
      },
      {
        heading: "Cancellation and liability",
        paragraphs: [
          "You can cancel at any time and keep access until the end of the paid period. The service is provided as is, and our liability is limited to the amount you paid in the three months before the claim, as far as the law allows.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      OPERATOR_SECTION,
      {
        heading: "What we store",
        paragraphs: [
          "Your account: name, email and the agency brand you set (display name, reply-to address, accent color, logo link).",
          "Your clients: name, report recipients, and the Google Analytics property and Search Console site you chose.",
          "Aggregate metrics: monthly totals and top rows such as sessions, clicks and top pages. We do not store raw visitor-level data.",
          "The narrative: the text written for each report and the status of each send.",
          "Google sign-in tokens, encrypted before they are stored.",
          "We count page views on this site with Cloudflare Web Analytics, which sets no cookies and collects no personal data.",
        ],
      },
      {
        heading: "Google user data and Limited Use",
        paragraphs: [
          "MonthMemo's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
          "We request read-only access to Google Analytics and Search Console. We use it only to build the reports you asked for. We do not sell it, use it for advertising, or let humans read it except where you ask for support, it is needed for security, or the law requires it.",
        ],
      },
      {
        heading: "Sub-processors",
        paragraphs: SUB_PROCESSOR_LINES,
      },
      {
        heading: "Retention and deletion",
        paragraphs: [
          `To delete your account and all stored data, or to disconnect Google, email ${SUPPORT_EMAIL}. You can also revoke access any time in your Google account security settings. We delete the data within 30 days of your request.`,
        ],
      },
    ],
  },
  refunds: {
    title: "Refund policy",
    sections: [
      OPERATOR_SECTION,
      {
        heading: `${REFUND_DAYS}-day refund`,
        paragraphs: [
          `If you are not happy, ask for a full refund within ${REFUND_DAYS} days of a payment and you get it. Paddle, our merchant of record, processes the refund to your original payment method.`,
          `Email ${SUPPORT_EMAIL} with the account email, or use the link in your Paddle receipt.`,
        ],
      },
      {
        heading: "Cancelling",
        paragraphs: ["Cancelling stops the next renewal. You keep access until the end of the period you paid for."],
      },
    ],
  },
  dpa: {
    title: "Data processing agreement",
    sections: [
      OPERATOR_SECTION,
      {
        heading: "Roles",
        paragraphs: [
          "You are the controller of your clients' analytics data and MonthMemo is the processor. This page is the data processing agreement that applies to your use of the service.",
        ],
      },
      {
        heading: "What we process",
        paragraphs: [
          "Aggregate metrics from Google Analytics 4 and Search Console, the generated narratives, and the email addresses of the report recipients you enter, only to build and send your reports.",
        ],
      },
      {
        heading: "Our commitments",
        paragraphs: [
          "We process the data only on your instructions, keep Google tokens encrypted, limit access to what is needed, tell you without undue delay about a data breach, and delete the data when you ask.",
        ],
      },
      {
        heading: "Sub-processors",
        paragraphs: SUB_PROCESSOR_LINES,
      },
      {
        heading: "Contact",
        paragraphs: [`Questions and deletion requests: ${SUPPORT_EMAIL}.`],
      },
    ],
  },
};
