import type { MetricChange, ReportMetrics } from "@monthmemo/contract";

import { isTypedMetrics, type NarrativeRequest, type NarrativeWriter, type TypedMetrics } from "./prompt";

// Same threshold as the model prompt: the homepage example calls 101 to 96 key events normal movement.
const NORMAL_MOVEMENT_PERCENT = 5;

// Dev and local runs write this text instead of paying for a model call; tests use the Groq fake.
export function createTemplateWriter(): NarrativeWriter {
  return {
    write: async ({ metrics, clientName, period }: NarrativeRequest) => {
      const lines = isTypedMetrics(metrics) ? describeTypedMetrics(metrics) : describeReportMetrics(metrics);
      return { text: [`${clientName}, ${period}.`, ...lines].join(" "), costUsd: 0 };
    },
  };
}

function describeTypedMetrics(metrics: TypedMetrics) {
  return [
    describeChange({ label: "Sessions", metric: metrics.sessions }),
    describeChange({ label: "Search clicks", metric: metrics.searchClicks }),
    describeChange({ label: "Key events", metric: metrics.keyEvents }),
    `The top page was ${metrics.topPage.current}.`,
  ];
}

function describeReportMetrics(metrics: ReportMetrics) {
  const lines: string[] = [];

  if (metrics.ga4) {
    lines.push(describeChange({ label: "Sessions", metric: metrics.ga4.sessions }));
    lines.push(describeChange({ label: "Users", metric: metrics.ga4.users }));
    lines.push(describeChange({ label: "Key events", metric: metrics.ga4.keyEvents }));
    const topChannel = metrics.ga4.topChannels[0];
    if (topChannel) {
      lines.push(`The largest channel was ${topChannel.label} with ${topChannel.value} sessions.`);
    }
  } else {
    lines.push("No Analytics data is connected yet.");
  }

  if (metrics.gsc) {
    lines.push(describeChange({ label: "Search clicks", metric: metrics.gsc.clicks }));
    lines.push(describeChange({ label: "Search impressions", metric: metrics.gsc.impressions }));
    const topQuery = metrics.gsc.topQueries[0];
    if (topQuery) {
      lines.push(`The top query was "${topQuery.label}" with ${topQuery.value} clicks.`);
    }
  } else {
    lines.push("No Search Console data is connected yet.");
  }
  return lines;
}

function describeChange({ label, metric }: { label: string; metric: MetricChange }) {
  if (metric.changePercent === null) {
    return `${label} went from 0 to ${metric.current}.`;
  }
  const direction = metric.changePercent >= 0 ? "up" : "down";
  const sentence = `${label} is ${direction} ${Math.abs(metric.changePercent).toFixed(1)}% (${metric.current} this month, ${metric.previous} last month)`;

  if (Math.abs(metric.changePercent) <= NORMAL_MOVEMENT_PERCENT) {
    return `${sentence}, which is normal month-to-month movement.`;
  }
  return `${sentence}.`;
}
