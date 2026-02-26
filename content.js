function detectPrivacyHeuristic() {
  const url = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const h1 = (document.querySelector("h1")?.innerText || "").trim().toLowerCase();

  const includesAny = (s, arr) => arr.some(k => s.includes(k));
  const countHits = (s, arr) => arr.reduce((n, k) => n + (s.includes(k) ? 1 : 0), 0);

  const safeUrl = (href) => {
    try { return new URL(href, location.href).toString(); } catch { return ""; }
  };

  const bodyText = (document.body?.innerText || "").toLowerCase().slice(0, 160000);

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
    "terms of service",
    "terms and conditions",
    "acceptable use",
    "eula"
  ];

  const LEGAL_SECTION_PHRASES = [
    "information we collect",
    "personal information",
    "how we use",
    "how we share",
    "your rights",
    "data retention",
    "contact us",
    "cookies",
    "tracking technologies",
    "opt out",
    "delete your data"
  ];

  const LAW_MARKERS = [
    "gdpr",
    "ccpa",
    "data protection officer",
    "right to access",
    "right to delete"
  ];

  const links = Array.from(document.querySelectorAll("a[href]"))
    .map(a => {
      const text = (a.innerText || "").toLowerCase();
      const hrefAbs = safeUrl(a.getAttribute("href") || "");
      const inFooter = !!a.closest("footer");
      const inNav = !!a.closest("nav");
      return { text, href: hrefAbs, inFooter, inNav };
    })
    .filter(l => l.href && /^https?:\/\//i.test(l.href));

  const linkCandidates = links
    .map(l => {
      const hay = `${l.text} ${l.href}`;
      if (!hay.includes("privacy")) return null;

      let linkScore = 0;

      if (l.text.includes("privacy policy")) linkScore += 7;
      if (URL_REGEX_STRONG.some(rx => rx.test(l.href))) linkScore += 4;
      if (l.inFooter) linkScore += 2;
      if (l.inNav) linkScore += 1;

      return { ...l, linkScore };
    })
    .filter(Boolean)
    .sort((a, b) => b.linkScore - a.linkScore);

  const bestPolicyLink = linkCandidates[0]?.href || null;
  const bestLinkScore = linkCandidates[0]?.linkScore || 0;

  let score = 0;

  if (URL_REGEX_STRONG.some(rx => rx.test(url))) score += 3;
  if (includesAny(title, TITLE_STRONG)) score += 2;
  if (includesAny(h1, H1_STRONG)) score += 2;

  const sectionHits = countHits(bodyText, LEGAL_SECTION_PHRASES);
  if (sectionHits >= 2) score += 1;
  if (sectionHits >= 5) score += 1;

  const lawHits = countHits(bodyText, LAW_MARKERS);
  if (lawHits >= 1) score += 1;
  if (lawHits >= 3) score += 1;

  score = Math.min(score, 10);

  const confidence =
    score >= 8 ? "High" :
    score >= 5 ? "Medium" : "Low";

  const isLikelyPolicyPage =
    score >= 6 && !includesAny(title, NOT_PRIVACY_PRIMARY);

  return {
    score,
    confidence,
    isLikelyPolicyPage,
    bestPolicyLink,
    bestLinkScore,
    pageUrl: location.href
  };
}

function computeRiskFromHeuristic(h) {

  if (!h.isLikelyPolicyPage) {

    const strong = h.bestPolicyLink && h.bestLinkScore >= 9;

    return {
      level: strong ? "yellow" : "blue",
      riskScore: strong ? 40 : 0,
      issuesCount: 0
    };
  }

  const riskScore =
    h.confidence === "High" ? 70 :
    h.confidence === "Medium" ? 45 :
    20;

  return {
    level:
      riskScore >= 70 ? "red" :
      riskScore >= 35 ? "yellow" :
      "blue",
    riskScore,
    issuesCount: Math.floor(riskScore / 25)
  };
}


// AUTO-RUN SYSTEM

let lastKey = "";
let lastUrl = location.href;

function run() {

  const h = detectPrivacyHeuristic();

  const r = computeRiskFromHeuristic(h);

  const key = JSON.stringify({
    url: location.href,
    level: r.level,
    best: h.bestPolicyLink
  });

  if (key === lastKey) return;

  lastKey = key;

  chrome.runtime.sendMessage({
    type: "heuristicResult",
    result: h,
    level: r.level,
    riskScore: r.riskScore,
    issuesCount: r.issuesCount
  });
}


function debounce(fn, wait) {

  let t;

  return () => {

    clearTimeout(t);

    t = setTimeout(fn, wait);

  };

}

const debouncedRun = debounce(run, 700);

run();


new MutationObserver(debouncedRun)
.observe(document.documentElement, {

  childList: true,
  subtree: true

});


setInterval(() => {

  if (location.href !== lastUrl) {

    lastUrl = location.href;

    lastKey = "";

    run();

  }

}, 800);
