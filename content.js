function detectPrivacyHeuristic() {
  const url = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const h1 = (document.querySelector("h1")?.innerText || "").toLowerCase();

  let score = 0;

  // Strong signals
  if (/(privacy[-\s]?policy|privacy-notice)/.test(url)) score += 4;
  if (title.includes("privacy")) score += 2;
  if (h1.includes("privacy")) score += 2;

  // Link signals (footer/nav)
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => ({
      text: (a.innerText || "").trim().toLowerCase(),
      href: a.href
    }))
    .filter(
      (x) =>
        x.text.includes("privacy") ||
        /privacy|privacy-policy|privacy-notice/.test(x.href.toLowerCase())
    );

  const best =
    links.find((l) => l.text.includes("privacy policy")) ||
    links.find((l) => l.text.includes("privacy")) ||
    links[0] ||
    null;

  if (best) score += 3;

  // Medium signals: policy language
  const bodyText = (document.body?.innerText || "").toLowerCase();
  const phraseHits = [
    "personal information",
    "information we collect",
    "how we use",
    "data controller",
    "your rights",
    "gdpr",
    "ccpa",
    "cookies"
  ].filter((p) => bodyText.includes(p)).length;

  if (phraseHits >= 2) score += 2;
  if (phraseHits >= 4) score += 2;

  return {
    score,
    isLikelyPolicyPage: score >= 6,
    bestPolicyLink: best?.href || null,
    pageUrl: location.href,
    pageTitle: document.title || ""
  };
}

// Send result to background so popup can display it
chrome.runtime.sendMessage({ type: "heuristicResult", result: detectPrivacyHeuristic() });
