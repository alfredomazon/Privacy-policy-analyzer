export function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function countMatches(text, rules) {
  let n = 0;
  for (const r of rules) {
    if (r.test(text)) n += 1;
  }
  return n;
}

export function hasAny(text, rules) {
  return rules.some((r) => r.test(text));
}

export function normalizeForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .trim();
}

export function dedupeEvidence(items, maxItems = 3) {
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const raw = item.text || item;
    const normalized = normalizeForCompare(raw);

    if (!normalized) continue;

    let tooSimilar = false;
    for (const prior of seen) {
      if (
        normalized === prior ||
        normalized.includes(prior) ||
        prior.includes(normalized)
      ) {
        tooSimilar = true;
        break;
      }
    }

    if (tooSimilar) continue;

    seen.add(normalized);
    out.push(raw);

    if (out.length >= maxItems) break;
  }

  return out;
}

export function shortenEvidence(text, maxLen = 220) {
  const clean = norm(text);
  if (clean.length <= maxLen) return clean;

  const slice = clean.slice(0, maxLen);
  const lastPunct = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(", ")
  );

  if (lastPunct > 80) {
    return slice.slice(0, lastPunct + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 80) {
    return slice.slice(0, lastSpace).trim() + "…";
  }

  return slice.trim() + "…";
}

export function debounce(fn, wait = 700) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}