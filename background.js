// background.js (service worker)

const TOGGLE_KEY = "gpt5Enabled";
const SERVER_URL = "https://privacy-policy-analyzer-1.onrender.com";
const TOKEN_KEY = "gpt5ExtensionToken";

// --- Heuristic cache (per tab) ---
const HEURISTIC_BY_TAB = {};

// --- Toolbar icons (use PNG for best reliability) ---
const ICONS = {
  blue: {
    16: "icons/EvilEye16.png",
    32: "icons/EvilEye32.png",
    48: "icons/EvilEye48.png",
    128: "icons/EvilEye128.png",
  },
  yellow: {
    16: "icons/EvilEyeYellow16.png",
    32: "icons/EvilEyeYellow32.png",
    48: "icons/EvilEyeYellow48.png",
    128: "icons/EvilEyeYellow128.png",
  },
  red: {
    16: "icons/EvilEyeRed16.png",
    32: "icons/EvilEyeRed32.png",
    48: "icons/EvilEyeRed48.png",
    128: "icons/EvilEyeRed128.png",
  },
};

function scoreToLevel(score) {
  if (score >= 70) return "red";
  if (score >= 35) return "yellow";
  return "blue";
}

function normalizeConfidence(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "explicit") return 1.25;
  if (v === "high") return 1.15;
  if (v === "likely") return 1.0;
  if (v === "medium") return 0.9;
  if (v === "possible") return 0.7;
  if (v === "low") return 0.55;

  return 0.75;
}

function normalizeSeverity(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "high") return 1.3;
  if (v === "medium") return 1.0;
  if (v === "low") return 0.7;

  return 1.0;
}

function categoryBaseWeight(category) {
  switch (String(category || "").toLowerCase()) {
    case "tracking":
      return 22;
    case "sharing":
      return 20;
    case "sale":
      return 28;
    case "sensitive":
      return 26;
    case "biometric":
      return 30;
    case "location":
      return 18;
    case "financial":
      return 18;
    case "children":
      return 10;
    case "retention":
      return 8;
    case "rights":
      return 6;
    case "identifiers":
      return 8;
    case "device_network":
      return 8;
    default:
      return 10;
  }
}

function titleFromLegacyKey(key) {
  const map = {
    identifiers: "This site may collect identifying information",
    device_network: "This site may collect device or network information",
    location: "Location data may be collected",
    cookies_tracking: "This site may track your activity",
    payment_financial: "Payment or financial data may be collected",
    contacts_content: "Contacts or user-provided content may be collected",
    biometric: "Biometric data may be collected",
    sensitive: "Sensitive information may be collected",
    children: "The policy mentions children or minors",
    sharing_third_parties: "Your data may be shared with third parties",
    retention_rights: "The policy mentions retention or privacy rights",
  };

  return map[key] || "Possible privacy concern detected";
}

function summaryFromLegacyKey(key) {
  const map = {
    identifiers:
      "The policy suggests the site may collect identifying information such as your name, email, phone number, or IP address.",
    device_network:
      "The policy suggests the site may collect device or network information such as device identifiers, logs, or browser details.",
    location:
      "The policy suggests the site may collect your location information.",
    cookies_tracking:
      "The policy suggests cookies or similar tools may be used to monitor usage, analytics, or advertising.",
    payment_financial:
      "The policy suggests the site may collect payment or financial information.",
    contacts_content:
      "The policy suggests the site may collect contacts, messages, uploads, or other content you provide.",
    biometric:
      "The policy suggests biometric information may be collected or processed.",
    sensitive:
      "The policy suggests the site may collect sensitive personal information.",
    children:
      "The policy includes language about children or minors and how their data is handled.",
    sharing_third_parties:
      "The policy suggests information may be shared with vendors, service providers, or partners.",
    retention_rights:
      "The policy refers to data retention, deletion, access, or related privacy rights.",
  };

  return map[key] || "The policy may involve this type of data use.";
}

function categoryFromLegacyKey(key) {
  const map = {
    identifiers: "identifiers",
    device_network: "device_network",
    location: "location",
    cookies_tracking: "tracking",
    payment_financial: "financial",
    contacts_content: "content",
    biometric: "biometric",
    sensitive: "sensitive",
    children: "children",
    sharing_third_parties: "sharing",
    retention_rights: "retention",
  };

  return map[key] || "general";
}

function confidenceFromLegacyKey(key) {
  const map = {
    identifiers: "possible",
    device_network: "possible",
    location: "possible",
    cookies_tracking: "likely",
    payment_financial: "possible",
    contacts_content: "possible",
    biometric: "explicit",
    sensitive: "likely",
    children: "possible",
    sharing_third_parties: "likely",
    retention_rights: "possible",
  };

  return map[key] || "possible";
}

function severityFromLegacyKey(key) {
  const map = {
    identifiers: "low",
    device_network: "low",
    location: "medium",
    cookies_tracking: "high",
    payment_financial: "medium",
    contacts_content: "medium",
    biometric: "high",
    sensitive: "high",
    children: "low",
    sharing_third_parties: "medium",
    retention_rights: "low",
  };

  return map[key] || "medium";
}

function numericScoreFromLegacyKey(key) {
  const map = {
    identifiers: 8,
    device_network: 8,
    location: 16,
    cookies_tracking: 24,
    payment_financial: 16,
    contacts_content: 14,
    biometric: 30,
    sensitive: 26,
    children: 10,
    sharing_third_parties: 22,
    retention_rights: 8,
  };

  return map[key] || 10;
}

function shouldCountAsRisk(finding) {
  const severity = String(finding?.severity || "").toLowerCase();
  const confidence = String(finding?.confidence || "").toLowerCase();
  const category = String(finding?.category || "").toLowerCase();

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies =
    confidence === "likely" || confidence === "explicit";

  const excludedCategories = new Set(["retention", "children"]);

  if (!severityQualifies || !confidenceQualifies) return false;
  if (excludedCategories.has(category)) return false;

  return true;
}

function deriveFindingsFromLegacyResult(result) {
  const found = result?.dataCollected || {};
  const evidence = result?.dataEvidence || {};
  const findings = [];

  for (const [key, present] of Object.entries(found)) {
    if (!present) continue;

    const finding = {
      category: categoryFromLegacyKey(key),
      title: titleFromLegacyKey(key),
      summary: summaryFromLegacyKey(key),
      confidence: confidenceFromLegacyKey(key),
      severity: severityFromLegacyKey(key),
      score: numericScoreFromLegacyKey(key),
      evidence: Array.isArray(evidence[key]) ? evidence[key].slice(0, 3) : [],
      sourceKey: key,
    };

    finding.countAsRisk = shouldCountAsRisk(finding);
    findings.push(finding);
  }

  return findings;
}

function normalizeHeuristicResult(result) {
  if (!result) return null;

  const findings =
    Array.isArray(result.findings) && result.findings.length
      ? result.findings.map((f) => ({
          ...f,
          countAsRisk:
            typeof f.countAsRisk === "boolean"
              ? f.countAsRisk
              : shouldCountAsRisk(f),
        }))
      : deriveFindingsFromLegacyResult(result);

  const countedRiskCount =
    typeof result.countedRiskCount === "number"
      ? result.countedRiskCount
      : findings.filter((f) => f.countAsRisk).length;

  return {
    ...result,
    findings,
    countedRiskCount,
  };
}

function computeRiskStats(findings = []) {
  const countedRisks = findings.filter((f) => f.countAsRisk);
  const highRisks = countedRisks.filter(
    (f) => String(f.severity || "").toLowerCase() === "high"
  );
  const mediumRisks = countedRisks.filter(
    (f) => String(f.severity || "").toLowerCase() === "medium"
  );

  return {
    total: countedRisks.length,
    high: highRisks.length,
    medium: mediumRisks.length,
  };
}

function computeMeaningfulRiskScore(findings = []) {
  let rawScore = 0;

  for (const finding of findings) {
    if (!finding.countAsRisk) continue;

    const base =
      typeof finding.score === "number"
        ? finding.score
        : categoryBaseWeight(finding.category);

    const conf = normalizeConfidence(finding.confidence);
    const sev = normalizeSeverity(finding.severity);

    let itemScore = base * conf * sev;

    if (Array.isArray(finding.evidence) && finding.evidence.length) {
      itemScore += 2;
    }

    rawScore += itemScore;
  }

  return rawScore;
}

function computeFromHeuristic(result) {
  if (!result) {
    return {
      score: 0,
      issuesCount: 0,
      levelHint: "none",
      summary: "No analysis yet",
    };
  }

  if (!result.isLikelyPolicyPage) {
    const bestLinkScore = result.bestLinkScore || 0;
    const hasStrongLink = !!result.bestPolicyLink && bestLinkScore >= 10;

    return {
      score: 0,
      issuesCount: 0,
      levelHint: hasStrongLink ? "policy-link" : "none",
      summary: hasStrongLink
        ? "Likely policy link found"
        : "No policy detected",
    };
  }

  const findings = Array.isArray(result.findings) ? result.findings : [];
  const riskStats = computeRiskStats(findings);

  let rawScore = computeMeaningfulRiskScore(findings);

  const pageConfidence = String(
    result.pageConfidence || result.confidence || ""
  ).toLowerCase();

  if (riskStats.total > 0) {
    if (pageConfidence === "high") rawScore += 4;
    if (pageConfidence === "low") rawScore -= 4;
  }

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let summary = "Privacy policy detected";
  if (riskStats.high > 0) summary = "High privacy concern";
  else if (riskStats.medium > 0) summary = "Potential privacy concerns";
  else if (findings.length > 0) summary = "Low-impact findings only";

  return {
    score,
    issuesCount: riskStats.total,
    levelHint:
      riskStats.high > 0
        ? "high-risk"
        : riskStats.medium > 0
        ? "policy-risk"
        : "policy",
    summary,
  };
}

async function setToolbar(tabId, { score, issuesCount = 0, summary = "", levelHint = "none" }) {
  const level = scoreToLevel(score);

  await chrome.action.setIcon({ tabId, path: ICONS[level] });

  await chrome.action.setBadgeText({
    tabId,
    text: issuesCount ? String(Math.min(issuesCount, 99)) : "",
  });

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color:
      level === "red"
        ? "#D93025"
        : level === "yellow"
        ? "#F9AB00"
        : "#1A73E8",
  });

  let title = "No policy detected yet";

  if (levelHint === "policy-link") {
    title = "Likely privacy policy link found — click to review";
  } else if (levelHint === "policy") {
    title =
      issuesCount > 0
        ? `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged`
        : "Privacy policy detected — no major risks flagged";
  } else if (levelHint === "policy-risk") {
    title = `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged — click to review`;
  } else if (levelHint === "high-risk") {
    title = `${summary}: ${issuesCount} risk${issuesCount === 1 ? "" : "s"} flagged — click to review`;
  }

  await chrome.action.setTitle({ tabId, title });
}

// Show “Scanning…” while page is loading/navigating
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "Scanning..." });

    // Prevent stale popup data while new page loads.
    if (info.url) delete HEURISTIC_BY_TAB[tabId];
  }
});

// Cleanup cache when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete HEURISTIC_BY_TAB[tabId];
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([TOGGLE_KEY], (res) => {
    if (res[TOGGLE_KEY] === undefined) {
      chrome.storage.local.set({ [TOGGLE_KEY]: false });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // ==============================
  // 0) Content script sends heuristic result
  // ==============================
  if (msg.type === "heuristicResult") {
    const tabId = sender.tab?.id;

    if (tabId != null) {
      const normalized = normalizeHeuristicResult(msg.result);

      HEURISTIC_BY_TAB[tabId] = normalized;

      const computed = computeFromHeuristic(normalized);
      setToolbar(tabId, computed).catch((err) => {
        console.error("Failed to update toolbar:", err);
      });
    }

    return;
  }

  // ==============================
  // 0.5) Popup asks for heuristic result
  // ==============================
  if (msg.type === "getHeuristic") {
    const tabId = msg.tabId;
    sendResponse({ ok: true, result: HEURISTIC_BY_TAB[tabId] || null });
    return true;
  }

  // ==============================
  // 1) Popup asks: what's toggle state?
  // ==============================
  if (msg.type === "getStatus") {
    chrome.storage.local.get([TOGGLE_KEY], (res) => {
      sendResponse({ enabled: !!res[TOGGLE_KEY] });
    });
    return true;
  }

  // ==============================
  // 2) Popup says: set toggle state
  // ==============================
  if (msg.type === "setStatus") {
    chrome.storage.local.set({ [TOGGLE_KEY]: !!msg.enabled }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ==============================
  // 3) Popup says: analyze this text (GPT mode)
  // ==============================
  if (msg.type === "analyzePolicy") {
    (async () => {
      try {
        const toggleRes = await chrome.storage.local.get([TOGGLE_KEY]);
        if (!toggleRes[TOGGLE_KEY]) {
          sendResponse({
            ok: false,
            error: "Analyzer is disabled. Turn it on first.",
          });
          return;
        }

        const stored = await chrome.storage.local.get([TOKEN_KEY]);
        const token = stored[TOKEN_KEY];

        if (!token) {
          sendResponse({
            ok: false,
            error: "Missing Extension Token. Paste it in the popup settings.",
          });
          return;
        }

        const r = await fetch(`${SERVER_URL}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Extension-Token": token,
          },
          body: JSON.stringify({ text: msg.text }),
        });

        const data = await r.json().catch(() => null);

        if (!r.ok) {
          sendResponse({
            ok: false,
            error: data?.error || `HTTP ${r.status}`,
            details: data,
          });
          return;
        }

        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();

    return true;
  }
});
