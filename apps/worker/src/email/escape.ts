export const TEXT_LIMIT = 80;
const ELLIPSIS = "…";

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    return ENTITIES[char] ?? char;
  });
}

// Search queries and page paths are user-controlled and unbounded, so a table cell never carries more than the limit.
export function clip(text: string, limit = TEXT_LIMIT) {
  const chars = Array.from(text);

  if (chars.length <= limit) {
    return text;
  }
  return `${chars.slice(0, limit - 1).join("")}${ELLIPSIS}`;
}

export function safeText(text: string) {
  return escapeHtml(clip(text));
}
