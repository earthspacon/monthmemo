import { PLANS } from "@monthmemo/contract";

import { FAQ, formatDollars, GROWTH_PRICE, PRODUCT_NAME, STARTER_PRICE } from "./config";

export const SITE_URL = "https://monthmemo.spacesonlabs.com";
export const OG_IMAGE_PATH = "/og.png";

export type SeoPage = {
  path: string;
  title: string;
  description: string;
};

// Every public page that is prerendered to static HTML at build time. The app (/app, /sign-in) stays client-side.
export const SEO_PAGES: SeoPage[] = [
  {
    path: "/",
    title: "MonthMemo: monthly client reports that write themselves",
    description:
      "For small marketing agencies: connect GA4 and Search Console once, and every client gets a branded monthly email that explains what changed and why. You approve, then send.",
  },
  {
    path: "/pricing",
    title: `Pricing: Starter ${STARTER_PRICE}/mo, Growth ${GROWTH_PRICE}/mo | MonthMemo`,
    description: `Starter ${STARTER_PRICE} a month for ${PLANS.starter.clientLimit} clients, Growth ${GROWTH_PRICE} a month for ${PLANS.growth.clientLimit} clients. The first month is free, no card.`,
  },
  {
    path: "/agencyanalytics-alternative",
    title: "AgencyAnalytics alternative for small agencies | MonthMemo",
    description:
      "Per-client cost compared: MonthMemo against AgencyAnalytics, with sources and the date the prices were checked.",
  },
  {
    path: "/automate-ga4-search-console-reports",
    title: "Automate GA4 and Search Console client reports | MonthMemo",
    description:
      "Stop copying numbers into slides. How to turn GA4 and Search Console data into a monthly client report in three steps.",
  },
  {
    path: "/tools/ga4-report-summary",
    title: "Free GA4 report summary for clients | MonthMemo",
    description:
      "Type last month's sessions, search clicks, key events and top page. Get a short, plain paragraph for your client email. Free, no sign-up.",
  },
  {
    path: "/terms",
    title: "Terms of service | MonthMemo",
    description: "The terms for using MonthMemo, monthly client reports for small agencies.",
  },
  {
    path: "/privacy",
    title: "Privacy policy | MonthMemo",
    description: "What MonthMemo stores, why, and which sub-processors see it, including Google Limited Use.",
  },
  {
    path: "/refunds",
    title: "Refund policy | MonthMemo",
    description: "Full refund within 14 days of a payment, processed by Paddle, our merchant of record.",
  },
  {
    path: "/dpa",
    title: "Data processing agreement (DPA) | MonthMemo",
    description: "MonthMemo's data processing agreement and sub-processor list.",
  },
];

export function findSeoPage(path: string) {
  return SEO_PAGES.find((page) => page.path === path);
}

function buildOffer({ name, cents }: { name: string; cents: number }) {
  return {
    "@type": "Offer",
    name,
    price: String(cents / 100),
    priceCurrency: "USD",
    url: `${SITE_URL}/pricing`,
  };
}

// JSON-LD for a prerendered page: the product with both offers from PLANS everywhere, the FAQ on the landing page.
export function buildJsonLd(page: SeoPage) {
  const graph: object[] = [
    {
      "@type": "SoftwareApplication",
      name: PRODUCT_NAME,
      url: SITE_URL,
      description: SEO_PAGES[0].description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: [
        buildOffer({ name: PLANS.starter.label, cents: PLANS.starter.priceCents }),
        buildOffer({ name: PLANS.growth.label, cents: PLANS.growth.priceCents }),
      ],
    },
  ];

  if (page.path === "/") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        };
      }),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function buildLlmsTxt() {
  const lines = [
    `# ${PRODUCT_NAME}`,
    "",
    "> MonthMemo sends each client of a small marketing agency a branded monthly email that explains what changed in Google Analytics 4 and Search Console, and why. The agency approves every report before it is sent.",
    "",
    "## Pricing (USD per month, tax added by Paddle where due)",
    ...Object.values(PLANS).map((plan) => {
      return `- ${plan.label}: ${formatDollars(plan.priceCents)}/month, up to ${plan.clientLimit} clients.`;
    }),
    "- The first month is free, no card.",
    "",
    "## Pages",
    `- ${SITE_URL}/pricing`,
    `- ${SITE_URL}/agencyanalytics-alternative`,
    `- ${SITE_URL}/automate-ga4-search-console-reports`,
    `- ${SITE_URL}/tools/ga4-report-summary`,
    `- ${SITE_URL}/privacy`,
    "",
  ];
  return lines.join("\n");
}
