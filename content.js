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
  const bodyText = (document.body?.innerText || "").toLowerCase().slice(0, 160000);

  // --- signals ---
  const URL_REGEX_STRONG = [
    /\/privacy([-_]?policy)?(\/|$)/i,
    /\/privacy[-_]?notice(\/|$)/i,
    /\/privacy[-_]?statement(\/|$)/i,
    /privacy[-_]?policy/i
  ];

  const TITLE_STRONG = ["privacy policy", "privacy notice", "privacy statement"];
  const H1_STRONG = ["privacy policy", "privacy notice", "privacy statement"];

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

  const LINK_POSITIVE_TEXT = ["privacy policy", "privacy notice", "privacy statement"];
  const LINK_AMBIGUOUS_TEXT = [
    "privacy center",
    "privacy settings",
    "privacy choices",
    "your privacy choices",
    "privacy preferences",
    "privacy dashboard"
  ];
  const LINK_NEGATIVE_TEXT = ["login", "signin", "sign in", "account", "careers", "jobs"];

  // --- NEW: Data categories detector ---
  function detectDataCategories(text) {
    // Categories you can show in UI
    const CATS = {
      identifiers: [
        "name", "full name", "username", "user name", "email", "e-mail", "phone", "telephone",
        "address", "mailing address", "ip address", "ip", "account id", "identifier", "unique identifier"
      ],
      device_network: [
        "device", "device id", "advertising id", "idfa", "gaid", "imei", "mac address",
        "browser", "user agent", "log data", "logs", "diagnostic", "crash", "network", "ip address"
      ],
      location: [
        "location", "precise location", "geolocation", "gps", "latitude", "longitude",
        "approximate location", "city", "region"
      ],
      cookies_tracking: [
        "cookie", "cookies", "pixel", "beacon", "tracking", "tracking technologies",
        "analytics", "google analytics", "advertising", "ads", "remarketing", "interest-based"
      ],
      payment_financial: [
        "payment", "credit card", "debit card", "card number", "billing", "transaction",
        "purchase", "bank", "financial", "invoice"
      ],
      contacts_content: [
        "contacts", "address book", "phonebook", "messages", "communications",
        "content", "uploads", "files", "photos", "videos", "audio", "documents"
      ],
      biometric: [
        "biometric", "face scan", "facial recognition", "fingerprint", "voiceprint", "iris"
      ],
      sensitive: [
        "social security", "ssn", "government id", "driver's license", "passport",
        "health", "medical", "diagnosis", "prescription", "insurance", "race", "ethnicity",
        "religion", "political", "union"
      ],
      children: [
        "children", "child", "under 13", "under the age of 13", "coppa", "minor", "minors"
      ],
      sharing_third_parties: [
        "share", "sharing", "third party", "third-party", "service provider",
        "partners", "affiliates", "vendors", "advertisers", "sell", "sale"
      ],
      retention_rights: [
        "retain", "retention", "storage", "delete", "deletion", "erasure",
        "access", "opt out", "opt-out", "data subject", "request", "rights"
      ]
    };

    // Track matches (light evidence; don’t extract user-specific values)
    const found = {};
    const evidence = {};
    for (const k of Object.keys(CATS)) {
      found[k] = false;
      evidence[k] = [];
      for (const phrase of CATS[k]) {
        if (text.includes(phrase)) {
          found[k] = true;
          // keep evidence short + unique
          if (evidence[k].length < 3 && !evidence[k].includes(phrase)) evidence[k].push(phrase);
        }
      }
    }

    // Make a nice label list for popup
    const labels = {
      identifiers: "Identifiers (name/email/phone/IP)",
      device_network: "Device & network (device ID/logs)",
      location: "Location data",
      cookies_tracking: "Cookies & tracking/ads",
      payment_financial: "Payments & financial",
      contacts_content: "Contacts & user content",
      biometric: "Biometric data",
      sensitive: "Sensitive data (health/ID/etc.)",
      children: "Children/minors info",
      sharing_third_parties: "Sharing/third parties",
      retention_rights: "Retention & user rights"
    };

    const summary = Object.keys(found)
      .filter(k => found[k])
      .map(k => labels[k]);

    return { found, evidence, summary };
  }

  // --- scoring (0–10) + reasons ---
  let score = 0;
  const reasons = [];

  const urlLooksPolicy = URL_REGEX_STRONG.some(rx => rx.test(url));
  if (urlLooksPolicy) { score += 3; reasons.push("URL matches a privacy policy pattern"); }

  const titleLooksPolicy = includesAny(title, TITLE_STRONG);
  if (titleLooksPolicy) { score += 2; reasons.push("Title looks like a privacy policy"); }

  const h1LooksPolicy = includesAny(h1, H1_STRONG);
  if (h1LooksPolicy) { score += 2; reasons.push("Main heading looks like a privacy policy"); }

  const looksNotPrivacy = includesAny(title, NOT_PRIVACY_PRIMARY) || includesAny(h1, NOT_PRIVACY_PRIMARY);
  if (looksNotPrivacy) {
    score = Math.max(0, score - 2);
    reasons.push("Looks more like cookies/terms than a privacy policy");
  }

  const sectionHits = countHits(bodyText, LEGAL_SECTION_PHRASES);
  if (sectionHits >= 2) { score += 1; reasons.push("Contains common privacy-policy sections"); }
  if (sectionHits >= 5) { score += 1; reasons.push("Contains many privacy-policy sections"); }

  const lawHits = countHits(bodyText, LAW_MARKERS);
  if (lawHits >= 1) { score += 1; reasons.push("Mentions privacy rights/laws (GDPR/CCPA/etc.)"); }
  if (lawHits >= 3) { score += 1; reasons.push("Multiple privacy-rights/law references"); }

  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(a => {
      const text = (a.innerText || a.getAttribute("aria-label") || "").trim().toLowerCase();
      const hrefAbs = safeUrl(a.getAttribute("href") || "");
      const inFooter = !!a.closest("footer");
      const inNav = !!a.closest("nav");
      return { text, href: hrefAbs, inFooter, inNav };
    })
    .filter(l => l.href && /^https?:\/\//i.test(l.href) && !l.href.endsWith("#"));

  const linkCandidates = links
    .map(l => {
      const hay = `${l.text} ${l.href}`.toLowerCase();
      if (!includesAny(hay, ["privacy", "policy", "legal"])) return null;

      let ls = 0;
      if (LINK_POSITIVE_TEXT.some(t => l.text.includes(t))) ls += 7;
      else if (l.text.includes("privacy")) ls += 4;

      const urlStrong = URL_REGEX_STRONG.some(rx => rx.test(l.href));
      if (urlStrong) ls += 4;
      if (/privacy|privacy[-_]?policy|privacy[-_]?notice|privacy[-_]?statement/i.test(l.href)) ls += 2;

      if (l.inFooter) ls += 2;
      if (l.inNav) ls += 1;

      if (LINK_AMBIGUOUS_TEXT.some(t => l.text.includes(t)) && !urlStrong) ls -= 4;
      if (LINK_NEGATIVE_TEXT.some(t => hay.includes(t))) ls -= 4;
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

  score = Math.min(score, 10);
  const confidence = score >= 8 ? "High" : score >= 5 ? "Medium" : "Low";

  const pageSignals = (urlLooksPolicy ? 1 : 0) + (titleLooksPolicy ? 1 : 0) + (h1LooksPolicy ? 1 : 0);
  const isLikelyPolicyPage =
    !looksNotPrivacy && (pageSignals >= 2 || (pageSignals >= 1 && sectionHits >= 6) || (sectionHits >= 9 && lawHits >= 1));

  // --- NEW: only compute data details when page likely has policy text ---
  const data = isLikelyPolicyPage ? detectDataCategories(bodyText) : { found: {}, evidence: {}, summary: [] };

  if (isLikelyPolicyPage) {
    if (data.summary.length) reasons.push("Extracted data categories from policy text");
    else reasons.push("Policy page detected, but data categories were unclear");
  } else {
    reasons.push("Open the policy page to extract data categories");
  }

  return {
    score,
    confidence,
    isLikelyPolicyPage,
    bestPolicyLink,
    reasons,
    dataCollected: data.found,      // category -> boolean
    dataEvidence: data.evidence,    // category -> matched phrases (safe)
    dataSummary: data.summary,      // human-friendly list
    pageUrl: location.href,
    pageTitle: document.title || ""
  };
}

// send once per load
const heuristic = detectPrivacyHeuristic();

// --- map heuristic -> toolbar state ---
function computeRiskFromHeuristic(h) {
  // If we are *on* a policy page, risk is about tracking/sharing/sensitive terms.
  // If we are *not* on a policy page, show neutral (blue) and encourage click/open.
  if (!h.isLikelyPolicyPage) {
    return { level: "blue", riskScore: 10, issuesCount: 0 };
  }

  // Count “suspicious” categories (you can tune these)
  const suspiciousCats = [
    "cookies_tracking",
    "sharing_third_parties",
    "sensitive",
    "biometric",
    "children"
  ];

  const found = h.dataCollected || {};
  const issuesCount = suspiciousCats.reduce((n, k) => n + (found[k] ? 1 : 0), 0);

  // Risk score 0–100 (simple, tune as you like)
  // Base on issues + policy confidence
  let riskScore = issuesCount * 22; // 0..110-ish
  if (h.confidence === "High") riskScore += 10;
  if (h.confidence === "Low") riskScore -= 10;
  riskScore = Math.max(0, Math.min(100, riskScore));

  const level = riskScore >= 70 ? "red" : riskScore >= 35 ? "yellow" : "blue";
  return { level, riskScore, issuesCount };
}

const { level, riskScore, issuesCount } = computeRiskFromHeuristic(heuristic);

chrome.runtime.sendMessage({
  type: "heuristicResult",
  result: heuristic,
  // extra fields for the toolbar icon logic
  level,        // "blue" | "yellow" | "red"
  riskScore,    // 0..100
  issuesCount   // small integer for badge
});