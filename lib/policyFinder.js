import { norm, countMatches } from "./utils.js";

const STRONG_PAGE_HINTS = [
  /\bprivacy policy\b/i,
  /\bprivacy notice\b/i,
  /\bconsumer privacy\b/i,
  /\byour privacy\b/i,
  /\bprivacy choices\b/i,
  /\bdo not sell\b/i,
  /\bdo not sell or share\b/i,
  /\bpersonal information\b/i,
  /\bpersonal data\b/i,
  /\bhow we collect\b/i,
  /\bhow we use\b/i,
  /\bcalifornia privacy\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
  /\bcpra\b/i,
];

const WEAK_PAGE_HINTS = [
  /\bcookie policy\b/i,
  /\bcookies\b/i,
  /\bdata policy\b/i,
  /\bterms of service\b/i,
  /\bterms and conditions\b/i,
  /\blegal\b/i,
];

const HIGH_SIGNAL_LINK_PATTERNS = [
  /privacy policy/i,
  /privacy notice/i,
  /consumer privacy/i,
  /your privacy/i,
  /privacy choices/i,
  /do not sell/i,
  /do not sell or share/i,
];

const MEDIUM_SIGNAL_LINK_PATTERNS = [
  /cookie policy/i,
  /cookies/i,
  /data policy/i,
  /ccpa/i,
  /gdpr/i,
  /cpra/i,
];

const LOW_SIGNAL_LINK_PATTERNS = [
  /terms of service/i,
  /terms and conditions/i,
  /\blegal\b/i,
  /\bpolicy\b/i,
];

export function scorePolicyPage(text, titleText, urlText) {
  let score = 0;
  const combinedTitle = `${titleText} ${urlText}`;

  score += countMatches(text, STRONG_PAGE_HINTS) * 2;
  score += countMatches(combinedTitle, STRONG_PAGE_HINTS) * 3;

  score += countMatches(text, WEAK_PAGE_HINTS);
  score += countMatches(combinedTitle, WEAK_PAGE_HINTS);

  if (/\/privacy-policy|\/privacy\/|\/privacy\b/i.test(urlText)) score += 6;
  else if (/\/privacy/i.test(urlText)) score += 5;
  else if (/\/cookies/i.test(urlText)) score += 2;
  else if (/\/terms|\/legal/i.test(urlText)) score += 1;

  if (/\bprivacy\b/i.test(titleText)) score += 5;
  else if (/\bcookies\b/i.test(titleText)) score += 2;
  else if (/\bterms\b/i.test(titleText)) score += 1;

  if (
    /personal information|personal data|how we collect|how we use|do not sell/i.test(
      text
    )
  ) {
    score += 4;
  }

  return score;
}

export function classifyPageConfidence(score) {
  if (score >= 14) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}

export function scoreLinkSignal(haystack, absUrl, inFooterOrNav) {
  let score = 0;

  for (const p of HIGH_SIGNAL_LINK_PATTERNS) {
    if (p.test(haystack)) score += 6;
  }

  for (const p of MEDIUM_SIGNAL_LINK_PATTERNS) {
    if (p.test(haystack)) score += 3;
  }

  for (const p of LOW_SIGNAL_LINK_PATTERNS) {
    if (p.test(haystack)) score += 1;
  }

  if (/\/privacy-policy|\/privacy\/|\/privacy\b/i.test(absUrl)) score += 6;
  else if (/\/privacy/i.test(absUrl)) score += 5;
  else if (/\/cookies/i.test(absUrl)) score += 2;
  else if (/\/terms|\/legal/i.test(absUrl)) score += 1;

  if (inFooterOrNav) score += 1;

  return score;
}

export function findBestPolicyLink() {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  let best = null;

  for (const a of anchors) {
    const hrefRaw = a.getAttribute("href") || "";
    const text = norm(a.innerText || a.getAttribute("aria-label") || "");
    const hay = `${text} ${hrefRaw}`.toLowerCase();

    try {
      const abs = new URL(hrefRaw, window.location.href).toString();

      if (
        abs.startsWith("javascript:") ||
        abs.startsWith("mailto:") ||
        abs.startsWith("tel:")
      ) {
        continue;
      }

      const score = scoreLinkSignal(
        hay,
        abs,
        !!a.closest("footer, .footer, nav")
      );

      if (score <= 0) continue;

      if (!best || score > best.score) {
        best = { url: abs, score, text };
      }
    } catch {}
  }

  return best
    ? { bestPolicyLink: best.url, bestLinkScore: best.score }
    : { bestPolicyLink: "", bestLinkScore: 0 };
}