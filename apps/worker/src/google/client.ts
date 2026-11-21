export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const ACCOUNT_SUMMARIES_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const GA4_PROPERTIES_URL = "https://analyticsdata.googleapis.com/v1beta/properties";
const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const ACCOUNT_SUMMARIES_PAGE_SIZE = 200;
// A runaway nextPageToken must not keep a request alive; 10 pages = 2000 accounts.
const ACCOUNT_SUMMARIES_MAX_PAGES = 10;

export type PropertySummary = {
  property: string;
  displayName: string;
};

export type AccountSummary = {
  account: string;
  displayName: string;
  propertySummaries?: PropertySummary[];
};

export type SiteEntry = {
  siteUrl: string;
  permissionLevel: string;
};

export type Ga4ReportRequest = {
  dateRanges: Array<{ startDate: string; endDate: string; name?: string }>;
  metrics: Array<{ name: string }>;
  dimensions?: Array<{ name: string }>;
  orderBys?: unknown[];
  limit?: number;
};

export type Ga4ReportRow = {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
};

export type Ga4Report = {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type?: string }>;
  rows?: Ga4ReportRow[];
};

export type GscQueryRequest = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  dataState?: "final" | "all";
};

export type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryResult = {
  rows?: GscRow[];
};

export type GoogleClient = {
  listAccountSummaries: () => Promise<AccountSummary[]>;
  listSites: () => Promise<SiteEntry[]>;
  runReport: (input: { propertyId: string; request: Ga4ReportRequest }) => Promise<Ga4Report>;
  querySearchAnalytics: (input: { siteUrl: string; request: GscQueryRequest }) => Promise<GscQueryResult>;
};

// Any non-2xx answer of a Google API; 403/404 on a property or site means the source is gone for this user.
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function callGoogle<T>({
  accessToken,
  url,
  body,
}: {
  accessToken: string;
  url: string;
  body?: unknown;
}): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}`, accept: "application/json" };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new GoogleApiError(response.status, `Google answered ${response.status} for ${new URL(url).pathname}`);
  }
  return response.json();
}

async function listAccountSummaries({ accessToken }: { accessToken: string }) {
  const summaries: AccountSummary[] = [];
  let pageToken = "";

  for (let page = 0; page < ACCOUNT_SUMMARIES_MAX_PAGES; page += 1) {
    const url = new URL(ACCOUNT_SUMMARIES_URL);
    url.searchParams.set("pageSize", String(ACCOUNT_SUMMARIES_PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const answer = await callGoogle<{ accountSummaries?: AccountSummary[]; nextPageToken?: string }>({
      accessToken,
      url: url.toString(),
    });
    summaries.push(...(answer.accountSummaries ?? []));
    pageToken = answer.nextPageToken ?? "";

    if (!pageToken) {
      break;
    }
  }
  return summaries;
}

export function createGoogleClient({ accessToken }: { accessToken: string }): GoogleClient {
  return {
    listAccountSummaries: () => {
      return listAccountSummaries({ accessToken });
    },
    listSites: async () => {
      const answer = await callGoogle<{ siteEntry?: SiteEntry[] }>({ accessToken, url: GSC_SITES_URL });
      return answer.siteEntry ?? [];
    },
    runReport: ({ propertyId, request }) => {
      return callGoogle<Ga4Report>({
        accessToken,
        url: `${GA4_PROPERTIES_URL}/${encodeURIComponent(propertyId)}:runReport`,
        body: request,
      });
    },
    querySearchAnalytics: ({ siteUrl, request }) => {
      return callGoogle<GscQueryResult>({
        accessToken,
        url: `${GSC_SITES_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        body: request,
      });
    },
  };
}
