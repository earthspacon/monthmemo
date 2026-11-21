import type { MetricChange } from "@monthmemo/contract";

import type { NarrativeRequest, NarrativeWriter } from "./prompt";

function describeChange({ label, metric }: { label: string; metric: MetricChange }) {
  if (metric.changePercent === null) {
    return `${label} went from 0 to ${metric.current}.`;
  }
  const direction = metric.changePercent >= 0 ? "up" : "down";
  return `${label} is ${direction} ${Math.abs(metric.changePercent).toFixed(1)}% (${metric.current} this month, ${metric.previous} last month).`;
}

// Dev and local runs write this text instead of paying for a model call; tests use the Groq fake.
export function createTemplateWriter(): NarrativeWriter {
  return {
    write: async ({ metrics, clientName, period }: NarrativeRequest) => {
      const lines = [`${clientName} — ${period}.`];

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
      return { text: lines.join(" "), costUsd: 0 };
    },
  };
}
