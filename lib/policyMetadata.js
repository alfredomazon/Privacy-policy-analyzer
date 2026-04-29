import { norm } from "./utils.js";

const DATE_PATTERNS = [
  /\b(?:last\s+updated|updated|effective\s+date|effective|last\s+modified)\s*:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b/i,
  /\b(?:last\s+updated|updated|effective\s+date|effective|last\s+modified)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\b/i,
  /\b(?:last\s+updated|updated|effective\s+date|effective|last\s+modified)\s*:?\s*(\d{4})\b/i,
];

function parseYear(value = "") {
  const match = String(value || "").match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function extractPolicyFreshness(text = "", now = new Date()) {
  const clean = norm(text || "").slice(0, 5000);

  for (const pattern of DATE_PATTERNS) {
    const match = clean.match(pattern);
    if (!match) continue;

    const dateText = norm(match[1] || "");
    const year = parseYear(dateText);
    const currentYear = now.getFullYear();
    let status = "unknown";

    if (year) {
      const age = currentYear - year;
      if (age <= 1) status = "fresh";
      else if (age <= 3) status = "dated";
      else status = "stale";
    }

    return {
      found: true,
      dateText,
      year,
      status,
    };
  }

  return {
    found: false,
    dateText: "",
    year: null,
    status: "unknown",
  };
}
