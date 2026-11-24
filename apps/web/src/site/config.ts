import { type BillingPeriod, PLAN, TRIAL_DAYS } from "@monthmemo/contract";

// Every public page reads the seller name and contact from this file only.
export const SELLER_LEGAL_NAME = "Spaceson Labs";
export const CONTACT_EMAIL = "monthmemo@spacesonlabs.com";

export const SELLER_BRAND = SELLER_LEGAL_NAME;
export const SUPPORT_EMAIL = CONTACT_EMAIL;

export const PRODUCT_NAME = "MonthMemo";
export const LEGAL_UPDATED = "November 21, 2026";
export const REFUND_DAYS = 14;
export const START_CTA = "Start free month";
export const DASHBOARD_CTA = "Open dashboard";

const CENTS_PER_DOLLAR = 100;

export function formatDollars(cents: number) {
  return `$${cents / CENTS_PER_DOLLAR}`;
}

export const PLAN_PRICE = formatDollars(PLAN.priceCents);
export const PLAN_YEARLY_PRICE = formatDollars(PLAN.yearlyPriceCents);
export const BILLING_PERIODS: BillingPeriod[] = ["monthly", "yearly"];
export const PERIOD_LABELS: Record<BillingPeriod, string> = { monthly: "Monthly", yearly: "Yearly" };
export const PLAN_PRICES: Record<BillingPeriod, { price: string; line: string }> = {
  monthly: { price: PLAN_PRICE, line: "/ month · cancel anytime" },
  yearly: { price: PLAN_YEARLY_PRICE, line: "/ year · 2 months free" },
};
export const PLAN_FEATURES = [
  `Up to ${PLAN.clientLimit} clients`,
  "A drafted report for every client on the 4th",
  "Your logo and colours on every email",
  "Nothing is sent until you approve it",
];

// Price per client with the plan full, rounded up to a whole cent.
export const PER_CLIENT_PRICE = `$${(Math.ceil(PLAN.priceCents / PLAN.clientLimit) / CENTS_PER_DOLLAR).toFixed(2)}`;

// A07: AgencyAnalytics lists $20 per client billed yearly and $25 billed monthly.
export const COMPETITOR_PER_CLIENT_RANGE = "$20-25";
export const COMPETITOR_SOURCES = [
  { label: "Coupler.io: AgencyAnalytics pricing", url: "https://blog.coupler.io/agencyanalytics-pricing/amp" },
  { label: "Zutrix: AgencyAnalytics pricing guide", url: "https://zutrix.com/guides/agencyanalytics-pricing" },
];
export const COMPETITOR_CHECKED = "2026-11-21";

export const FOOTER_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refunds", label: "Refunds" },
  { to: "/dpa", label: "DPA" },
  { to: "/agencyanalytics-alternative", label: "AgencyAnalytics alternative" },
  { to: "/automate-ga4-search-console-reports", label: "Automate GA4 reports" },
  { to: "/tools/ga4-report-summary", label: "Free GA4 report summary" },
];

export const SUB_PROCESSORS = [
  { name: "Cloudflare, Inc.", purpose: "Hosting, database and scheduled jobs" },
  { name: "Google LLC", purpose: "Sign-in and read-only access to Google Analytics and Search Console" },
  {
    name: "Groq, Inc.",
    purpose: "Writes the narrative from aggregate metrics (no training; inputs not retained by default)",
  },
  { name: "Brevo", purpose: "Sends sign-in, approval and client report emails" },
  { name: "Paddle.com", purpose: "Merchant of record: checkout, invoices, tax and refunds" },
];

export const HERO = {
  title: "Monthly client reports that write themselves — for small marketing agencies",
  subtitle: "Connect GA4 and Search Console once, approve, send.",
  detail:
    "Every month each of your clients gets a branded email that explains what changed and why. You only read it and press approve.",
};

export const HOW_IT_WORKS = [
  {
    title: "Connect Google once",
    text: "Sign in with Google and grant read-only access to Google Analytics 4 and Search Console. Add each client with its property and site.",
  },
  {
    title: "Get a draft on the 4th",
    text: "Every month MonthMemo pulls last month's numbers and writes a short narrative: what moved, and the likely reason.",
  },
  {
    title: "Approve and send",
    text: "Read the draft, approve it, and the email goes to your client under your agency's name and reply-to address.",
  },
];

export const BEFORE_ROWS = [
  { metric: "Sessions", thisMonth: "4,210", lastMonth: "3,640", note: "" },
  { metric: "Clicks (GSC)", thisMonth: "1,030", lastMonth: "880", note: "?" },
  { metric: "Key events", thisMonth: "96", lastMonth: "101", note: "" },
  { metric: "Top page", thisMonth: "/sourdough-class", lastMonth: "/", note: "write summary…" },
];

export const EXAMPLE_REPORT = {
  client: "Example Bakery",
  period: "October 2026",
  subject: "Example Bakery: your October website report",
  narrative:
    "Visits to your site grew 16% in October, to 4,210 sessions. Most of the growth came from Google search: clicks rose 17%, and the new sourdough class page was the top landing page. Key events dipped slightly, from 101 to 96, which is within normal month-to-month movement. Next month, keep the class page linked from the home page.",
  stats: [
    { label: "Sessions", value: "4,210", change: "+16%" },
    { label: "Search clicks", value: "1,030", change: "+17%" },
    { label: "Key events", value: "96", change: "-5%" },
  ],
};

export const FAQ = [
  {
    question: "Is there a free trial?",
    answer: `Yes. Your first ${TRIAL_DAYS} days are free with up to ${PLAN.clientLimit} clients, and no card is needed. If you don't subscribe, sending stops when the trial ends; nothing is deleted.`,
  },
  {
    question: "What access do you get to our clients' data?",
    answer:
      "Read-only access to Google Analytics 4 and Search Console, only for the properties and sites you pick. MonthMemo stores aggregate metrics and the narrative, never raw visitor data, and keeps the Google tokens encrypted.",
  },
  {
    question: "Does anything go to my clients without my approval?",
    answer:
      "No. Every report is a draft first. Nothing is sent until you approve it, and you can skip a client for a month.",
  },
  {
    question: "How does pricing work?",
    answer: `One plan: ${PLAN_PRICE} a month, or ${PLAN_YEARLY_PRICE} a year with 2 months free, for up to ${PLAN.clientLimit} clients. Billing runs through Paddle and you can cancel any time.`,
  },
];

export const PROBLEM_POINTS = [
  "Copying numbers from GA4 and Search Console into a slide or a sheet takes 30 to 60 minutes per client.",
  "The numbers alone don't answer the client's real question: what changed, and why.",
  "A tool that charges per client makes every small account cost more than it earns.",
];

export const COMPARE_ROWS = [
  {
    label: "Price per client",
    us: `${PER_CLIENT_PRICE} with ${PLAN.clientLimit} clients`,
    them: COMPETITOR_PER_CLIENT_RANGE,
  },
  { label: "Delivery", us: "Branded email with a written narrative", them: "Dashboards and PDF exports" },
  { label: "Sources", us: "GA4 and Search Console", them: "Dozens of integrations" },
  { label: "Approval", us: "You approve every send", them: "Scheduled reports" },
];
