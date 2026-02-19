function detectPrivacyHeuristic() {
  const url = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const h1 = (document.querySelector("h1")?.innerText || "").trim().toLowerCase();

  // --- helpers ---
  const includesAny = (s, arr) => arr.some(k => s.includes(k));
  const countHits = (s, arr) => arr.reduce((n, k) => n + (s.includes(k) ? 1 : 0), 0);

  const safeUrl = (href) => {
    try { return new URL(href, location.href).toString(); } catch { return ""; }
  };

  // Normalize body text (cap for speed)
  const bodyText = (document.body?.innerText || "").toLowerCase().slice(0, 120000);

  // --- signals ---
  // Strong-ish URL patterns (avoid matching random "/privacy" in querystrings)
  const URL_REGEX_STRONG = [
    /\/privacy([-_]?policy)?(\/|$)/i,
    /\/privacy[-_]?notice(\/|$)/i,
    /\/privacy[-_]?statement(\/|$)/i,
    /privacy[-_]?policy/i
  ];

  const TITLE_STRONG = ["privacy policy", "privacy notice", "privacy statement"];
  const H1_STRONG = ["privacy policy", "privacy notice", "privacy statement"];

  // Terms/cookie pages (related but not the same)
  const NOT_PRIVACY_PRIMARY = [
    "cookie policy",
    "cookies policy",
    "terms of service",
    "terms and conditions",
    "acceptable use",
    "eula"
  ];

  const LEGAL_SECTION_PHRASES = [
    "information we collect",
    "personal information we collect",
    "how we use",
    "how we share",
    "sharing your information",
    "your rights",
    "your choices",
    "data controller",
    "legal basis",
    "retention",
    "data retention",
    "contact us",
    "security",
    "cookies",
    "tracking technologies",
    "do not sell",
    "opt out",
    "delete your data",
    "access your data"
  ];

  const LAW_MARKERS = [
    "gdpr",
    "ccpa",
    "cpra",
    "california consumer privacy act",
    "data protection officer",
    "right to access",
    "right to delete",
    "right to opt out"
  ];

  // Link scoring keywords
  const LINK_POSITIVE_TEXT = [
    "privacy policy",
    "privacy notice",
    "privacy statement"
  ];

  // These often are not the actual policy doc, so we lightly penalize them
  const LINK_AMBIGUOUS_TEXT = [
    "privacy center",
    "privacy settings",
    "privacy choices",
    "your privacy choices",
    "privacy preferences",
    "privacy dashboard"
  ];

  const LINK_NEGATIVE_TEXT = [
    "login",
    "signin",
    "sign in",
    "account",
    "careers",
    "jobs"
  ];

  // --- scoring (0–10) + reasons ---
  let score = 0;
  const reasons = [];

  // 1) Page looks like a privacy policy (strong)
  const urlLooksPolicy = URL_REGEX_STRONG.some(rx => rx.test(url));
  if (urlLooksPolicy) { score += 3; reasons.push("URL matches a privacy policy pattern"); }

  const titleLooksPolicy = includesAny(title, TITLE_STRONG);
  if (titleLooksPolicy) { score += 2; reasons.push("Title looks like a privacy policy"); }

  const h1LooksPolicy = includesAny(h1, H1_STRONG);
  if (h1LooksPolicy) { score += 2; reasons.push("Main heading looks like a privacy policy"); }

  // If title/H1 suggests this is primarily cookie/terms page, dampen a bit
  const looksNotPrivacy = includesAny(title, NOT_PRIVACY_PRIMARY) || includesAny(h1, NOT_PRIVACY_PRIMARY);
  if (looksNotPrivacy) {
    score = Math.max(0, score - 2);
    reasons.push("Looks more like cookies/terms than a privacy policy");
  }

  // 2) Body contains policy structure (medium)
  const sectionHits = countHits(bodyText, LEGAL_SECTION_PHRASES);
  if (sectionHits >= 2) { score += 1; reasons.push("Contains common privacy-policy sections"); }
  if (sectionHits >= 5) { score += 1; reasons.push("Contains many privacy-policy sections"); }

  // 3) Mentions privacy laws/rights (medium)
  const lawHits = countHits(bodyText, LAW_MARKERS);
  if (lawHits >= 1) { score += 1; reasons.push("Mentions privacy rights/laws (GDPR/CCPA/etc.)"); }
  if (lawHits >= 3) { score += 1; reasons.push("Multiple privacy-rights/law references"); }

  // 4) Find best privacy-policy link on the site
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(a => {
      const text = (a.innerText || a.getAttribute("aria-label") || "").trim().toLowerCase();
      const hrefAbs = safeUrl(a.getAttribute("href") || "");
      const inFooter = !!a.closest("footer");
      const inNav = !!a.closest("nav");
      return { text, href: hrefAbs, inFooter, inNav };
    })
    .filter(l => l.href && /^https?:\/\//i.test(l.href));

  const linkCandidates = links
    .map(l => {
      const hay = `${l.text} ${l.href}`.toLowerCase();

      // must be privacy/legal-ish
      if (!includesAny(hay, ["privacy", "policy", "legal"])) return null;

      let ls = 0;

      // Strong anchor text matches
      if (LINK_POSITIVE_TEXT.some(t => l.text.includes(t))) ls += 7;
      else if (l.text.includes("privacy")) ls += 4;

      // URL pattern matches
      if (URL_REGEX_STRONG.some(rx => rx.test(l.href))) ls += 4;
      if (/privacy|privacy[-_]?policy|privacy[-_]?notice|privacy[-_]?statement/i.test(l.href)) ls += 2;

      // Location hints
      if (l.inFooter) ls += 2;
      if (l.inNav) ls += 1;

      // Penalize common non-policy privacy pages
      if (LINK_AMBIGUOUS_TEXT.some(t => l.text.includes(t))) ls -= 2;

      // Penalize clearly irrelevant
      if (LINK_NEGATIVE_TEXT.some(t => hay.includes(t))) ls -= 4;

      // Slight penalty if link is obviously cookie policy (still might be useful, but not the privacy doc)
      if (hay.includes("cookie")) ls -= 2;

      return { ...l, linkScore: ls };
    })
    .filter(Boolean)
    .sort((a, b) => b.linkScore - a.linkScore);

  const bestPolicyLink = linkCandidates[0]?.href || null;
  const bestLinkScore = linkCandidates[0]?.linkScore || 0;

  if (bestPolicyLink && bestLinkScore >= 9) {
    score += 2;
    reasons.push("Found a strong privacy policy link on this site");
  } else if (bestPolicyLink && bestLinkScore >= 5) {
    score += 1;
    reasons.push("Found a likely privacy-related link");
  }

  // Cap score to 10
  score = Math.min(score, 10);

  // Interpret
  const confidence = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

  // Likely policy page if page-level signals are strong, or if body strongly looks like policy
  const pageSignals = (urlLooksPolicy ? 1 : 0) + (titleLooksPolicy ? 1 : 0) + (h1LooksPolicy ? 1 : 0);
  const isLikelyPolicyPage =
    !looksNotPrivacy && (pageSignals >= 2 || (pageSignals >= 1 && sectionHits >= 6) || (sectionHits >= 9 && lawHits >= 1));

  return {
    score,
    confidence,
    isLikelyPolicyPage,
    bestPolicyLink,
    reasons,
    pageUrl: location.href,
    pageTitle: document.title || ""
  };
}

chrome.runtime.sendMessage({ type: "heuristicResult", result: detectPrivacyHeuristic() });
