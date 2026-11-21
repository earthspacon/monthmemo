import type { Plan } from "./plans";

export * from "./plans";

export const CLIENT_RECIPIENTS_MAX = 3;
export const NARRATIVE_WORDS_TARGET = 150;
export const NARRATIVE_WORDS_MAX = 180;

export type AgencyStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export type ReportStatus = "pending" | "building" | "draft" | "failed" | "sending" | "sent" | "send_failed" | "skipped";

export type FailureReason = "narrative_failed" | "google_reconnect_needed" | "source_not_found" | "google_error";

// One number of a report: this month, the month before, and the change in percent (null when the month before is 0).
export type MetricChange = {
  current: number;
  previous: number;
  changePercent: number | null;
};

export type TopRow = {
  label: string;
  value: number;
};

export type Ga4Metrics = {
  sessions: MetricChange;
  users: MetricChange;
  keyEvents: MetricChange;
  topChannels: TopRow[];
  topLandingPages: TopRow[];
};

export type GscMetrics = {
  clicks: MetricChange;
  impressions: MetricChange;
  ctr: MetricChange;
  position: MetricChange;
  topQueries: TopRow[];
  topPages: TopRow[];
};

export type ReportMetrics = {
  period: string;
  previousPeriod: string;
  ga4: Ga4Metrics | null;
  gsc: GscMetrics | null;
};

export type ApiError = {
  error: string;
  message: string;
  field?: string;
};

export type AgencySummaryDto = {
  id: string;
  plan: Plan;
  status: AgencyStatus;
  trialEndsAt: string | null;
  clientLimit: number;
  clientCount: number;
};

export type MeDto = {
  email: string;
  agency: AgencySummaryDto;
};

export type GoogleStatusDto = {
  connected: boolean;
  ga4: boolean;
  gsc: boolean;
  needsReconnect: boolean;
};

export type Ga4PropertyDto = {
  propertyId: string;
  name: string;
  account: string;
};

export type GscSiteDto = {
  siteUrl: string;
};

export type GoogleSourcesDto = {
  ga4: Ga4PropertyDto[];
  gsc: GscSiteDto[];
};

export type RecipientDto = {
  email: string;
  unsubscribed: boolean;
};

export type ClientDto = {
  id: string;
  name: string;
  ga4PropertyId: string | null;
  ga4PropertyName: string | null;
  gscSiteUrl: string | null;
  recipients: RecipientDto[];
  nextReportOn: string;
};

export type ClientInput = {
  name: string;
  recipients: string[];
  ga4PropertyId: string | null;
  gscSiteUrl: string | null;
};

export type BrandDto = {
  displayName: string;
  accentColor: string;
  logoUrl: string | null;
  replyTo: string;
};

export type ReportListItemDto = {
  id: string;
  clientId: string;
  clientName: string;
  period: string;
  status: ReportStatus;
  failureReason: FailureReason | null;
  sentAt: string | null;
  recipientCount: number;
};

export type ReportsPageDto = {
  periods: string[];
  nextRunOn: string;
  reports: ReportListItemDto[];
};

export type ReportDetailDto = ReportListItemDto & {
  metrics: ReportMetrics | null;
  narrative: string | null;
};

export type BillingPlanDto = {
  plan: Plan;
  priceCents: number;
  clientLimit: number;
  paddlePriceId: string;
};

export type BillingDto = {
  plan: Plan;
  status: AgencyStatus;
  trialEndsAt: string | null;
  clientLimit: number;
  plans: BillingPlanDto[];
  paddleClientToken: string;
  paddleEnv: string;
};
