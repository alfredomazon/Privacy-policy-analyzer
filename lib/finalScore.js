export function scoreToLevel(score) {
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
  const ambiguity = finding?.ambiguity === true;
  const evidenceCount = Array.isArray(finding?.evidence) ? finding.evidence.length : 0;

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies =
    confidence === "likely" || confidence === "explicit";

  const excludedCategories = new Set(["retention", "children"]);

  if (!severityQualifies || !confidenceQualifies) return false;
  if (excludedCategories.has(category)) return false;
  if (ambiguity && confidence !== "explicit") return false;
  if (["sale", "biometric", "sensitive"].includes(category) && evidenceCount === 0) {
    return false;
  }

  return true;
}

function normalizeSingleFinding(finding) {
  if (!finding) return null;

  return {
    ...finding,
    countAsRisk:
      typeof finding.countAsRisk === "boolean"
        ? finding.countAsRisk
        : shouldCountAsRisk(finding),
    evidence: Array.isArray(finding.evidence) ? finding.evidence.slice(0, 3) : [],
  };
}

function normalizeLegacyFindings(result) {
  return Object.entries(result?.dataCollected || {})
    .filter(([, present]) => !!present)
    .map(([key]) => {
      const evidence = result?.dataEvidence || {};

      const normalized = {
        category: categoryFromLegacyKey(key),
        title: titleFromLegacyKey(key),
        summary: summaryFromLegacyKey(key),
        confidence: confidenceFromLegacyKey(key),
        severity: severityFromLegacyKey(key),
        score: numericScoreFromLegacyKey(key),
        evidence: Array.isArray(evidence[key]) ? evidence[key].slice(0, 3) : [],
        sourceKey: key,
      };

      return {
        ...normalized,
        countAsRisk: shouldCountAsRisk(normalized),
      };
    });
}

export function normalizeHeuristicResult(result) {
  if (!result) return null;

  const findings =
    Array.isArray(result.findings) && result.findings.length
      ? result.findings.map(normalizeSingleFinding).filter(Boolean)
      : normalizeLegacyFindings(result);

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
  const familyTotals = new Map();

  function familyForCategory(category) {
    switch (String(category || "").toLowerCase()) {
      case "sale":
      case "sharing":
      case "tracking":
        return "adtech";
      case "identifiers":
      case "device_network":
        return "identity";
      case "sensitive":
      case "biometric":
      case "location":
      case "financial":
        return "sensitive";
      default:
        return String(category || "general").toLowerCase();
    }
  }

  for (const finding of findings) {
    if (!finding?.countAsRisk) continue;

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

    if (finding?.ambiguity === true) {
      itemScore *= 0.45;
    }

    const family = familyForCategory(finding.category);
    const familyTotal = familyTotals.get(family) || 0;
    const familyCap = family === "adtech" ? 34 : family === "sensitive" ? 38 : 24;
    const remaining = Math.max(0, familyCap - familyTotal);
    const appliedScore = Math.min(itemScore, remaining);

    if (appliedScore <= 0) {
      continue;
    }

    familyTotals.set(family, familyTotal + appliedScore);
    rawScore += appliedScore;
  }

  return rawScore;
}

function dedupeStrongestFindings(findings = []) {
  const bestByCategory = new Map();

  for (const finding of findings) {
    const category = String(finding?.category || "").toLowerCase();
    const previous = bestByCategory.get(category);

    if (!previous || (finding?.score || 0) > (previous?.score || 0)) {
      bestByCategory.set(category, finding);
    }
  }

  return Array.from(bestByCategory.values());
}

function behaviorSeverityScore(trackerSignals = {}) {
  const trackerCount = Array.isArray(trackerSignals?.trackerHits)
    ? trackerSignals.trackerHits.length
    : 0;

  const hasFingerprinting =
    Array.isArray(trackerSignals?.fingerprintingHints) &&
    trackerSignals.fingerprintingHints.length > 0;

  const hasSharingTrackers = Array.isArray(trackerSignals?.trackerHits)
    ? trackerSignals.trackerHits.some(
        (hit) => String(hit?.category || "").toLowerCase() === "sharing"
      )
    : false;

  let score = 0;

  if (trackerCount >= 1 && trackerCount <= 2) score += 3;
  else if (trackerCount >= 3 && trackerCount <= 4) score += 6;
  else if (trackerCount >= 5 && trackerCount <= 8) score += 10;
  else if (trackerCount > 8) score += 14;

  if (hasSharingTrackers) score += 4;
  if (hasFingerprinting) score += trackerCount > 0 ? 8 : 5;

  return {
    score: Math.min(score, 18),
    trackerCount,
    hasFingerprinting,
  };
}

function summarizeHeuristic({
  isLikelyPolicyPage,
  score,
  policyIssuesCount,
  behaviorScore,
  mismatchScore,
  trackerCount,
  hasFingerprinting,
}) {
  if (score <= 0) {
    return isLikelyPolicyPage ? "Privacy policy detected" : "No policy detected";
  }

  if (isLikelyPolicyPage) {
    if (score >= 70) return "High privacy concern";
    if (score >= 40) return "Potential privacy concerns";
    if (policyIssuesCount > 0) return "Low-impact findings only";
    if (mismatchScore > 0) return "Policy-behavior mismatch detected";
    return "Privacy policy detected";
  }

  if (behaviorScore > 0) {
    if (hasFingerprinting && trackerCount > 0) {
      return "Potential tracking behavior detected";
    }
    if (trackerCount > 0) {
      return "Tracking signals detected";
    }
  }

  return "No policy detected";
}

function getNumericPageScore(result) {
  const candidates = [
    result?.pageScore,
    result?.policyPageScore,
    result?.score,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function getBestLinkScore(result) {
  const value = result?.bestLinkScore;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getPageConfidence(result) {
  return String(result?.pageConfidence || result?.confidence || "")
    .trim()
    .toLowerCase();
}

function getPageType(result) {
  return String(result?.pageType || result?.policySourceType || "")
    .trim()
    .toLowerCase();
}

function isFilteredNonPolicyPage(result) {
  const pageScore = getNumericPageScore(result);
  const bestLinkScore = getBestLinkScore(result);
  const hasPolicyLink = !!result?.bestPolicyLink;
  const pageType = getPageType(result);

  if (
    pageType === "search" ||
    pageType === "mention" ||
    pageType === "policy-mention-only" ||
    pageType === "informational-article"
  ) {
    return true;
  }

  if (result?.isLikelyPolicyPage === false && pageScore <= 0 && (!hasPolicyLink || bestLinkScore < 8)) {
    return true;
  }

  return false;
}

function hasStrongPolicyLink(result) {
  const bestLinkScore = getBestLinkScore(result);
  return !!result?.bestPolicyLink && bestLinkScore >= 14;
}

function getNonPolicySummary(result) {
  const pageType = getPageType(result);

  if (pageType === "search") {
    return "Search page detected";
  }

  if (pageType === "mention" || pageType === "policy-mention-only") {
    return "This page mentions a privacy policy";
  }

  if (pageType === "informational-article") {
    return "Informational article detected";
  }

  if (hasStrongPolicyLink(result)) {
    return "Policy page available";
  }

  return "No policy detected";
}

export function computeFromHeuristic(result) {
  if (!result) {
    return {
      score: 0,
      issuesCount: 0,
      levelHint: "none",
      summary: "No analysis yet",
    };
  }

  const normalized = normalizeHeuristicResult(result);
  const pageScore = getNumericPageScore(normalized);
  const pageConfidence = getPageConfidence(normalized);
  const trackerSignals = normalized?.trackerSignals || {};

  if (isFilteredNonPolicyPage(normalized)) {
    return {
      score: 0,
      issuesCount: 0,
      levelHint: "none",
      summary: getNonPolicySummary(normalized),
    };
  }

  if (!normalized.isLikelyPolicyPage) {
    const behavior = behaviorSeverityScore(trackerSignals);
    const behaviorScore = Math.min(8, Math.round(behavior.score * 0.6));

    if (behaviorScore > 0) {
      return {
        score: behaviorScore,
        issuesCount: 1,
        levelHint: "behavior-risk",
        summary: summarizeHeuristic({
          isLikelyPolicyPage: false,
          score: behaviorScore,
          policyIssuesCount: 0,
          behaviorScore,
          mismatchScore: 0,
          trackerCount: behavior.trackerCount,
          hasFingerprinting: behavior.hasFingerprinting,
        }),
      };
    }

    const strongLink = hasStrongPolicyLink(normalized);

    return {
      score: 0,
      issuesCount: 0,
      levelHint: strongLink ? "policy-link" : "none",
      summary: getNonPolicySummary(normalized),
    };
  }

  const findings = Array.isArray(normalized.findings) ? normalized.findings : [];
  const trustedFindings = normalized.isLikelyPolicyPage
    ? findings.filter((f) => f?.countAsRisk === true)
    : [];
  const uniqueFindings = dedupeStrongestFindings(trustedFindings);
  const riskStats = computeRiskStats(uniqueFindings);

  let rawScore = computeMeaningfulRiskScore(uniqueFindings);

  if (riskStats.total > 0) {
    if (pageConfidence === "high") rawScore += 4;
    if (pageConfidence === "low") rawScore -= 4;
  }

  if (pageScore > 0 && pageScore < 14 && riskStats.total > 0) {
    rawScore -= 6;
  }

  if (pageScore >= 24 && riskStats.total > 0) {
    rawScore += 3;
  }

  const policyScore = Math.max(0, Math.min(60, Math.round(rawScore)));
  const behavior = behaviorSeverityScore(trackerSignals);
  const behaviorScore = normalized.isLikelyPolicyPage
    ? behavior.score
    : Math.min(8, Math.round(behavior.score * 0.6));
  const mismatchScore =
    normalized.isLikelyPolicyPage && typeof normalized?.mismatch?.score === "number"
      ? Math.min(12, Math.round(normalized.mismatch.score * 0.35))
      : 0;

  const score = Math.max(
    0,
    Math.min(100, Math.round(policyScore + behaviorScore + mismatchScore))
  );

  const issuesCount = normalized.isLikelyPolicyPage
    ? riskStats.total
    : behaviorScore > 0
    ? 1
    : 0;

  const summary = summarizeHeuristic({
    isLikelyPolicyPage: normalized.isLikelyPolicyPage,
    score,
    policyIssuesCount: riskStats.total,
    behaviorScore,
    mismatchScore,
    trackerCount: behavior.trackerCount,
    hasFingerprinting: behavior.hasFingerprinting,
  });

  return {
    score,
    issuesCount,
    levelHint:
      !normalized.isLikelyPolicyPage && behaviorScore > 0
        ? "behavior-risk"
        : riskStats.high > 0
        ? "high-risk"
        : riskStats.medium > 0
        ? "policy-risk"
        : normalized.isLikelyPolicyPage
        ? "policy"
        : "none",
    summary,
  };
}
