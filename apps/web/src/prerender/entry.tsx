import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import { AppRoutes } from "../app/App";
import { NOT_FOUND_TITLE } from "../site/NotFoundPage";
import { buildJsonLd, buildLlmsTxt, OG_IMAGE_PATH, SEO_PAGES, SITE_URL, type SeoPage } from "../site/seo";

const ROOT_TAG = '<div id="root"></div>';

export type PrerenderedFile = {
  file: string;
  content: string;
};

// Cloudflare Web Analytics: a cookieless page-view counter. Only a production build passes the site token (public, like
// the Turnstile site key); dev, e2e and sandbox builds pass none and load nothing.
export type PrerenderOptions = { beaconToken?: string };

const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

export function addBeacon({ html, token }: { html: string; token: string }) {
  const beacon = `<script defer src="${BEACON_SRC}" data-cf-beacon='{"token":"${token}","spa":true}'></script>`;
  return html.replace("</head>", `  ${beacon}\n  </head>`);
}

export function buildPrerenderedFiles(template: string, { beaconToken }: PrerenderOptions = {}): PrerenderedFile[] {
  const files = buildFiles(template);
  if (!beaconToken) {
    return files;
  }
  return files.map((entry) => {
    return entry.file.endsWith(".html") ? { ...entry, content: addBeacon({ html: entry.content, token: beaconToken }) } : entry;
  });
}

// Build-time only (scripts/prerender.mjs writes these into dist/): every public page as static HTML,
// the empty app shell for /app and /sign-in, robots.txt, sitemap.xml and llms.txt.
function buildFiles(template: string): PrerenderedFile[] {
  if (!template.includes(ROOT_TAG)) {
    throw new Error("index.html has no empty root; run `vite build` first");
  }
  return [
    ...SEO_PAGES.map((page) => {
      return {
        file: page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`,
        content: buildPageHtml({ template, page }),
      };
    }),
    {
      file: "app-shell.html",
      content: replaceHead({
        html: template,
        head: '<title>MonthMemo</title>\n    <meta name="robots" content="noindex" />',
      }),
    },
    {
      file: "404.html",
      content: buildNotFoundHtml(template),
    },
    {
      file: "robots.txt",
      content: buildRobots(),
    },
    {
      file: "sitemap.xml",
      content: buildSitemap(),
    },
    {
      file: "llms.txt",
      content: buildLlmsTxt(),
    },
  ];
}

export function buildPageHtml({ template, page }: { template: string; page: SeoPage }) {
  const url = buildPageUrl(page.path);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = `${SITE_URL}${OG_IMAGE_PATH}`;
  const jsonLd = JSON.stringify(buildJsonLd(page)).replaceAll("<", "\\u003c");
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="MonthMemo" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
  const body = renderToString(
    <StrictMode>
      <StaticRouter location={page.path}>
        <AppRoutes />
      </StaticRouter>
    </StrictMode>,
  );

  return replaceHead({ html: template, head }).replace(
    ROOT_TAG,
    `<div id="root" data-prerendered="${page.path}">${body}</div>`,
  );
}

// The Worker returns this with status 404. No canonical, noindex; the client renders the same page for any URL.
function buildNotFoundHtml(template: string) {
  const body = renderToString(
    <StrictMode>
      <StaticRouter location="/404">
        <AppRoutes />
      </StaticRouter>
    </StrictMode>,
  );
  return replaceHead({
    html: template,
    head: `<title>${escapeHtml(NOT_FOUND_TITLE)}</title>\n    <meta name="robots" content="noindex" />`,
  }).replace(ROOT_TAG, `<div id="root" data-prerendered="/404">${body}</div>`);
}

function replaceHead({ html, head }: { html: string; head: string }) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace("</head>", `  ${head}\n  </head>`);
}

function buildPageUrl(path: string) {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

function buildRobots() {
  return ["User-agent: *", "Disallow: /app/", "Disallow: /api/", "", `Sitemap: ${SITE_URL}/sitemap.xml`, ""].join("\n");
}

function buildSitemap() {
  const urls = SEO_PAGES.map((page) => {
    return `  <url><loc>${buildPageUrl(page.path)}</loc></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

function escapeHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
