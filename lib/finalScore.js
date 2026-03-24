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

  const severityQualifies = severity === "high" || severity === "medium";
  const confidenceQualifies =
    confidence === "likely" || confidence === "explicit";

  const excludedCategories = new Set(["retention", "children"]);

  if (!severityQualifies || !confidenceQualifies) return false;
  if (excludedCategories.has(category)) return false;

  return true;
}

export function normalizeHeuristicResult(result) {
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
      : Object.entries(result?.dataCollected || {})
          .filter(([, present]) => !!present)
          .map(([key]) => {
            const evidence = result?.dataEvidence || {};

            return {
              category: categoryFromLegacyKey(key),
              title: titleFromLegacyKey(key),
              summary: summaryFromLegacyKey(key),
              confidence: confidenceFromLegacyKey(key),
              severity: severityFromLegacyKey(key),
              score: numericScoreFromLegacyKey(key),
              evidence: Array.isArray(evidence[key]) ? evidence[key].slice(0, 3) : [],
              sourceKey: key,
              countAsRisk: shouldCountAsRisk({
                category: categoryFromLegacyKey(key),
                confidence: confidenceFromLegacyKey(key),
                severity: severityFromLegacyKey(key),
              }),
            };
          });

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

export function computeFromHeuristic(result) {
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