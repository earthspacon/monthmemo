export type MonthKey = "thisMonth" | "lastMonth";
export type CountField = "sessions" | "searchClicks" | "keyEvents";
export type MonthField = CountField | "topPage";

export type MonthInput = Record<MonthField, string>;

export type SummaryForm = {
  clientName: string;
  thisMonth: MonthInput;
  lastMonth: MonthInput;
};

export type MonthNumbers = Record<CountField, number> & { topPage: string };

export type SummaryRequestBody = {
  clientName: string;
  thisMonth: MonthNumbers;
  lastMonth: MonthNumbers;
};

export type SummaryResult = {
  narrative: string;
  period: string;
  clientName: string;
  stats: SummaryStat[];
};

export type SummaryStat = {
  label: string;
  value: string;
  change: string;
};

export const MONTH_LABELS: Record<MonthKey, string> = {
  thisMonth: "This month",
  lastMonth: "Last month",
};

export const FIELD_LABELS: Record<MonthField, string> = {
  sessions: "Sessions",
  searchClicks: "Search clicks",
  keyEvents: "Key events",
  topPage: "Top page",
};

export const COUNT_FIELDS: CountField[] = ["sessions", "searchClicks", "keyEvents"];
export const MONTH_FIELDS: MonthField[] = [...COUNT_FIELDS, "topPage"];

// The homepage example (Example Bakery, October), so a visitor can press the button before typing anything.
export const EXAMPLE_FORM: SummaryForm = {
  clientName: "Example Bakery",
  thisMonth: {
    sessions: "4,210",
    searchClicks: "1,030",
    keyEvents: "96",
    topPage: "/sourdough-class",
  },
  lastMonth: {
    sessions: "3,640",
    searchClicks: "880",
    keyEvents: "101",
    topPage: "/",
  },
};

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const SEPARATORS = /[\s,]/g;
const WHOLE_NUMBER = /^\d+$/;

export function parseCount(text: string) {
  const digits = text.replace(SEPARATORS, "");

  if (!WHOLE_NUMBER.test(digits)) {
    return null;
  }
  return Number(digits);
}

export function buildSummaryRequest(form: SummaryForm): { body: SummaryRequestBody } | { error: string } {
  const thisMonth = readMonth({ form, month: "thisMonth" });
  if ("error" in thisMonth) {
    return thisMonth;
  }
  const lastMonth = readMonth({ form, month: "lastMonth" });
  if ("error" in lastMonth) {
    return lastMonth;
  }
  return {
    body: {
      clientName: form.clientName.trim(),
      thisMonth: thisMonth.numbers,
      lastMonth: lastMonth.numbers,
    },
  };
}

export function buildStats(body: SummaryRequestBody): SummaryStat[] {
  return COUNT_FIELDS.map((field) => {
    return {
      label: FIELD_LABELS[field],
      value: NUMBER_FORMAT.format(body.thisMonth[field]),
      change: formatChange({ current: body.thisMonth[field], previous: body.lastMonth[field] }),
    };
  });
}

export function formatChange({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return "new";
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

function readMonth({
  form,
  month,
}: {
  form: SummaryForm;
  month: MonthKey;
}): { numbers: MonthNumbers } | { error: string } {
  const input = form[month];
  const numbers: MonthNumbers = {
    sessions: 0,
    searchClicks: 0,
    keyEvents: 0,
    topPage: input.topPage.trim(),
  };

  for (const field of COUNT_FIELDS) {
    const value = parseCount(input[field]);

    if (value === null) {
      return { error: `${MONTH_LABELS[month]}: ${FIELD_LABELS[field].toLowerCase()} must be a whole number` };
    }
    numbers[field] = value;
  }
  return { numbers };
}
