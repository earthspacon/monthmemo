import type { BrandDto, GscMetrics, Ga4Metrics, MetricChange, ReportMetrics, TopRow } from "@monthmemo/contract";

import { clip, escapeHtml, safeText } from "./escape";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MAX_WIDTH = 600;
const TOP_ROWS = 5;
const NO_VALUE = "—";
const PERCENT = 100;
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const FONT = "font-family:Arial,Helvetica,sans-serif";

type KpiRow = { label: string; change: MetricChange; format: (value: number) => string };

type RenderInput = {
  brand: BrandDto;
  client: { name: string };
  period: string;
  metrics: ReportMetrics;
  narrative: string;
  unsubscribeUrl: string;
};

export function monthLabel(period: string) {
  const [year, month] = period.split("-");
  const name = MONTHS[Number(month) - 1];

  if (!name) {
    return period;
  }
  return `${name} ${year}`;
}

const formatInt = (value: number) => Math.round(value).toLocaleString("en-US");
const formatPercent = (value: number) => `${(value * PERCENT).toFixed(1)}%`;
const formatDecimal = (value: number) => value.toFixed(1);

function formatChange(change: MetricChange) {
  if (change.changePercent === null || !Number.isFinite(change.changePercent)) {
    return NO_VALUE;
  }
  const sign = change.changePercent > 0 ? "+" : "";
  return `${sign}${change.changePercent.toFixed(1)}%`;
}

function ga4Rows(ga4: Ga4Metrics): KpiRow[] {
  return [
    { label: "Sessions", change: ga4.sessions, format: formatInt },
    { label: "Users", change: ga4.users, format: formatInt },
    { label: "Key events", change: ga4.keyEvents, format: formatInt },
  ];
}

function gscRows(gsc: GscMetrics): KpiRow[] {
  return [
    { label: "Search clicks", change: gsc.clicks, format: formatInt },
    { label: "Impressions", change: gsc.impressions, format: formatInt },
    { label: "Click-through rate", change: gsc.ctr, format: formatPercent },
    { label: "Average position", change: gsc.position, format: formatDecimal },
  ];
}

type Section = { title: string; kpis: KpiRow[]; tables: Array<{ title: string; rows: TopRow[] }> };

function sectionsOf(metrics: ReportMetrics): Section[] {
  const sections: Section[] = [];

  if (metrics.ga4) {
    sections.push({
      title: "Website traffic",
      kpis: ga4Rows(metrics.ga4),
      tables: [
        { title: "Top channels", rows: metrics.ga4.topChannels },
        { title: "Top landing pages", rows: metrics.ga4.topLandingPages },
      ],
    });
  }
  if (metrics.gsc) {
    sections.push({
      title: "Search Console",
      kpis: gscRows(metrics.gsc),
      tables: [
        { title: "Top search queries", rows: metrics.gsc.topQueries },
        { title: "Top pages in search", rows: metrics.gsc.topPages },
      ],
    });
  }
  return sections;
}

function cell({ content, align = "left", weight = "normal" }: { content: string; align?: string; weight?: string }) {
  return `<td align="${align}" style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};font-weight:${weight};${FONT}">${content}</td>`;
}

function kpiTable({ title, kpis }: { title: string; kpis: KpiRow[] }) {
  const head = ["", "This month", "Last month", "Change"]
    .map((label, index) => {
      const align = index === 0 ? "left" : "right";
      return `<th align="${align}" style="padding:6px 0;font-size:12px;color:${MUTED};font-weight:normal;${FONT}">${label}</th>`;
    })
    .join("");
  const body = kpis
    .map((kpi) => {
      return `<tr>${cell({ content: escapeHtml(kpi.label) })}${cell({ content: kpi.format(kpi.change.current), align: "right", weight: "bold" })}${cell({ content: kpi.format(kpi.change.previous), align: "right" })}${cell({ content: formatChange(kpi.change), align: "right" })}</tr>`;
    })
    .join("");
  return `<h2 style="margin:24px 0 4px;font-size:16px;color:${INK};${FONT}">${escapeHtml(title)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${head}</tr>${body}</table>`;
}

function topTable({ title, rows }: { title: string; rows: TopRow[] }) {
  if (rows.length === 0) {
    return "";
  }
  const body = rows
    .slice(0, TOP_ROWS)
    .map((row) => {
      return `<tr>${cell({ content: safeText(row.label) })}${cell({ content: formatInt(row.value), align: "right" })}</tr>`;
    })
    .join("");
  return `<h3 style="margin:16px 0 4px;font-size:14px;color:${INK};${FONT}">${escapeHtml(title)}</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${body}</table>`;
}

function narrativeHtml(narrative: string) {
  return narrative
    .split(/\n\s*\n/)
    .map((paragraph) => {
      return paragraph.trim();
    })
    .filter((paragraph) => {
      return paragraph !== "";
    })
    .map((paragraph) => {
      return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${INK};${FONT}">${escapeHtml(paragraph)}</p>`;
    })
    .join("");
}

function headerHtml({ brand }: { brand: BrandDto }) {
  const logo = brand.logoUrl?.startsWith("https://")
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" height="40" style="display:block;border:0;max-height:40px;margin-bottom:8px">`
    : "";
  return `${logo}<div style="font-size:20px;font-weight:bold;color:${escapeHtml(brand.accentColor)};${FONT}">${safeText(brand.displayName)}</div>`;
}

export function renderReportEmail({ brand, client, period, metrics, narrative, unsubscribeUrl }: RenderInput) {
  const label = monthLabel(period);
  const subject = `${clip(client.name)} — ${label} report`;
  const sections = sectionsOf(metrics);
  const sectionsHtml = sections
    .map((section) => {
      return `${kpiTable(section)}${section.tables.map(topTable).join("")}`;
    })
    .join("");
  const link = `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${escapeHtml(brand.accentColor)}">Unsubscribe</a>`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${MAX_WIDTH}px;background:#ffffff;border:1px solid ${LINE}">
<tr><td style="padding:24px">${headerHtml({ brand })}
<h1 style="margin:16px 0 16px;font-size:18px;color:${INK};${FONT}">${safeText(client.name)} — ${escapeHtml(label)}</h1>
${narrativeHtml(narrative)}${sectionsHtml}
<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:${MUTED};${FONT}">Questions? Just reply to this email.<br>${link} from these reports.</p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
  const text = textOf({ brand, client, label, sections, narrative, unsubscribeUrl });

  return { subject, html, text };
}

function textOf({
  brand,
  client,
  label,
  sections,
  narrative,
  unsubscribeUrl,
}: {
  brand: BrandDto;
  client: { name: string };
  label: string;
  sections: Section[];
  narrative: string;
  unsubscribeUrl: string;
}) {
  const lines = [`${clip(brand.displayName)}`, `${clip(client.name)} — ${label}`, "", narrative.trim()];

  for (const section of sections) {
    lines.push("", section.title);
    for (const kpi of section.kpis) {
      const { change } = kpi;
      lines.push(
        `${kpi.label}: ${kpi.format(change.current)} (last month ${kpi.format(change.previous)}, ${formatChange(change)})`,
      );
    }
    for (const table of section.tables) {
      lines.push("", `${table.title}:`);
      for (const row of table.rows.slice(0, TOP_ROWS)) {
        lines.push(`- ${clip(row.label)}: ${formatInt(row.value)}`);
      }
    }
  }
  lines.push("", "Questions? Just reply to this email.", `Unsubscribe: ${unsubscribeUrl}`);
  return lines.join("\n");
}
