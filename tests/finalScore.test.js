import test from "node:test";
import assert from "node:assert/strict";

import {
  computeFromHeuristic,
  normalizeHeuristicResult,
  scoreToLevel,
} from "../lib/finalScore.js";

test("non-policy pages do not produce a risk score even if findings exist", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 3,
    score: 3,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [
      {
        category: "tracking",
        title: "Uses tracking technologies",
        confidence: "explicit",
        severity: "medium",
        evidence: ["We do not use your information for targeted advertising."],
      },
    ],
  });

  const result = computeFromHeuristic(heuristic);

  assert.equal(result.score, 0);
  assert.equal(result.issuesCount, 0);
  assert.equal(result.summary, "No policy detected");
});

test("behavior-heavy non-policy pages show behavior risk without pretending to be policy risk", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 0,
    score: 0,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "https://example.com/privacy",
    bestLinkScore: 18,
    findings: [],
    trackerSignals: {
      trackerHits: [
        { category: "tracking" },
        { category: "sharing" },
        { category: "tracking" },
        { category: "sharing" },
      ],
      fingerprintingHints: ["fingerprint"],
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score > 0);
  assert.equal(result.levelHint, "behavior-risk");
  assert.equal(result.summary, "Potential tracking behavior detected");
  assert.equal(result.issuesCount, 1);
});

test("routine tracker detector scores do not dominate page risk", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 0,
    score: 0,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "https://example.com/privacy",
    bestLinkScore: 18,
    findings: [],
    trackerSignals: {
      riskScore: 8,
      riskLevel: "low",
      confidence: "medium",
      trackerHits: Array.from({ length: 8 }, () => ({
        category: "sharing",
        routineCommerce: true,
        severity: "medium",
      })),
      storageSignals: [
        { label: "Google Ads click identifier", routineCommerce: true },
      ],
      summary: {
        riskScore: 8,
        riskLevel: "low",
        routineOnly: true,
      },
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score <= 5);
  assert.equal(result.levelHint, "behavior-risk");
});

test("medium tracker detector risk can surface even when no policy link is found", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 0,
    score: 0,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [],
    trackerSignals: {
      riskScore: 36,
      riskLevel: "medium",
      confidence: "high",
      trackerHits: [
        {
          category: "sharing",
          severity: "high",
          confidence: "high",
          routineCommerce: false,
        },
      ],
      summary: {
        riskScore: 36,
        riskLevel: "medium",
        routineOnly: false,
      },
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.equal(result.score, 35);
  assert.equal(scoreToLevel(result.score), "yellow");
  assert.equal(result.levelHint, "behavior-risk");
  assert.equal(result.summary, "Tracking signals detected");
});

test("protection activity can lower behavior-only tracker score", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 0,
    score: 0,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [],
    trackerSignals: {
      riskScore: 60,
      riskLevel: "high",
      confidence: "high",
      trackerHits: [
        {
          id: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          category: "sharing",
          severity: "high",
          confidence: "high",
        },
      ],
      summary: {
        riskScore: 60,
        riskLevel: "high",
        routineOnly: false,
      },
    },
  });

  const unprotected = computeFromHeuristic(heuristic);
  const protectedResult = computeFromHeuristic({
    ...heuristic,
    protectionActivity: {
      active: true,
      items: [
        {
          kind: "known-tracker",
          trackerId: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          count: 1,
        },
      ],
    },
  });

  assert.equal(scoreToLevel(unprotected.score), "yellow");
  assert.equal(scoreToLevel(protectedResult.score), "blue");
  assert.ok(protectedResult.score < unprotected.score);
});

test("inactive protection activity does not lower tracker score", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: false,
    pageScore: 0,
    score: 0,
    pageConfidence: "Low",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [],
    trackerSignals: {
      riskScore: 60,
      riskLevel: "high",
      confidence: "high",
      trackerHits: [
        {
          id: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          category: "sharing",
          severity: "high",
          confidence: "high",
        },
      ],
      summary: {
        riskScore: 60,
        riskLevel: "high",
        routineOnly: false,
      },
    },
  });

  const unprotected = computeFromHeuristic(heuristic);
  const inactiveProtection = computeFromHeuristic({
    ...heuristic,
    protectionActivity: {
      active: false,
      items: [
        {
          kind: "known-tracker",
          trackerId: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          count: 1,
        },
      ],
    },
  });

  assert.equal(inactiveProtection.score, unprotected.score);
});

test("protection lowers only the tracker portion of a policy score", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 28,
    score: 28,
    pageConfidence: "High",
    pageType: "privacy_policy",
    bestPolicyLink: "https://example.com/privacy",
    bestLinkScore: 22,
    findings: [
      {
        category: "sale",
        title: "May sell personal information",
        confidence: "explicit",
        severity: "high",
        score: 28,
        evidence: ["We may sell your personal information."],
      },
      {
        category: "sensitive",
        title: "Collects sensitive personal data",
        confidence: "explicit",
        severity: "high",
        score: 26,
        evidence: ["We may collect sensitive personal information."],
      },
    ],
    trackerSignals: {
      riskScore: 60,
      riskLevel: "high",
      confidence: "high",
      trackerHits: [
        {
          id: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          category: "sharing",
          severity: "high",
          confidence: "high",
        },
      ],
      summary: {
        riskScore: 60,
        riskLevel: "high",
        routineOnly: false,
      },
    },
  });

  const unprotected = computeFromHeuristic(heuristic);
  const protectedResult = computeFromHeuristic({
    ...heuristic,
    protectionActivity: {
      active: true,
      items: [
        {
          kind: "known-tracker",
          trackerId: "doubleclick",
          vendor: "DoubleClick",
          hostname: "doubleclick.net",
          count: 1,
        },
      ],
    },
  });

  assert.equal(scoreToLevel(unprotected.score), "red");
  assert.equal(scoreToLevel(protectedResult.score), "yellow");
  assert.equal(protectedResult.issuesCount, unprotected.issuesCount);
});

test("policy-like pages with plausible risks produce a non-zero score", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 29,
    score: 29,
    pageConfidence: "High",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [
      {
        category: "tracking",
        title: "Uses tracking technologies",
        confidence: "explicit",
        severity: "medium",
        evidence: ["We use analytics and cookies to understand usage."],
      },
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "likely",
        severity: "medium",
        evidence: ["We may share personal information with service providers."],
      },
      {
        category: "identifiers",
        title: "Collects identifying information",
        confidence: "explicit",
        severity: "medium",
        evidence: ["Information we collect includes your name and email address."],
      },
    ],
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score > 0);
  assert.equal(result.levelHint, "policy-risk");
});

test("ambiguous findings do not stack without strong support", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 24,
    score: 24,
    pageConfidence: "High",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "likely",
        severity: "medium",
        evidence: ["Some sharing language appears limited."],
        ambiguity: true,
      },
      {
        category: "sale",
        title: "May sell personal information",
        confidence: "likely",
        severity: "high",
        evidence: [],
        ambiguity: true,
      },
    ],
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score < 35);
});

test("mismatch acts as a capped modifier instead of dominating the score", () => {
  const lowMismatch = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 24,
    score: 24,
    pageConfidence: "High",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "likely",
        severity: "medium",
        evidence: ["We may share personal information with service providers."],
      },
    ],
    mismatch: { score: 10 },
  });

  const highMismatch = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 24,
    score: 24,
    pageConfidence: "High",
    pageType: "normal",
    bestPolicyLink: "",
    bestLinkScore: 0,
    findings: [
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "likely",
        severity: "medium",
        evidence: ["We may share personal information with service providers."],
      },
    ],
    mismatch: { score: 90 },
  });

  const lowResult = computeFromHeuristic(lowMismatch);
  const highResult = computeFromHeuristic(highMismatch);

  assert.ok(highResult.score > lowResult.score);
  assert.ok(highResult.score - lowResult.score <= 12);
});

test("policy quality signals act as a capped score modifier", () => {
  const base = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 24,
    score: 24,
    pageConfidence: "High",
    pageType: "normal",
    findings: [
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "likely",
        severity: "medium",
        evidence: ["We may share personal information with advertising partners."],
      },
    ],
  });
  const withQuality = normalizeHeuristicResult({
    ...base,
    policyFreshness: { status: "stale" },
    policyQuality: {
      mixedDisclosures: [{ type: "sale_ad_sharing" }],
      specificity: { level: "vague" },
      retention: { quality: "missing" },
    },
  });

  const baseResult = computeFromHeuristic(base);
  const qualityResult = computeFromHeuristic(withQuality);

  assert.ok(qualityResult.score > baseResult.score);
  assert.ok(qualityResult.score - baseResult.score <= 10);
});

test("ordinary retail-style disclosures do not force the toolbar red", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 32,
    pageConfidence: "High",
    findings: [
      {
        category: "sale",
        title: "May sell personal information",
        confidence: "explicit",
        severity: "high",
        score: 34,
        countAsRisk: true,
        evidence: [
          "We may share information with advertising partners for targeted advertising.",
        ],
        primaryUseContext: {
          secondaryUse: true,
          highRiskSecondaryUse: true,
          targetedAdvertising: true,
        },
      },
      {
        category: "tracking",
        title: "Uses tracking technologies",
        confidence: "explicit",
        severity: "high",
        score: 34,
        countAsRisk: true,
        evidence: [
          "We may use cookies and similar technologies for personalized ads.",
        ],
        primaryUseContext: {
          secondaryUse: true,
          highRiskSecondaryUse: true,
          targetedAdvertising: true,
        },
      },
      {
        category: "sharing",
        title: "Shares data with third parties",
        confidence: "explicit",
        severity: "high",
        score: 34,
        countAsRisk: true,
        evidence: [
          "We may share personal information with advertising partners.",
        ],
        primaryUseContext: {
          secondaryUse: true,
          highRiskSecondaryUse: true,
          targetedAdvertising: true,
        },
      },
      {
        category: "device_network",
        title: "Collects device or network information",
        confidence: "explicit",
        severity: "high",
        score: 34,
        countAsRisk: true,
        evidence: ["We collect device identifiers for advertising."],
        primaryUseContext: {
          secondaryUse: true,
          highRiskSecondaryUse: true,
          advertisingIdentifier: true,
        },
      },
    ],
    trackerSignals: {
      trackerHits: Array.from({ length: 12 }, () => ({ category: "tracking" })),
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score < 70);
  assert.equal(scoreToLevel(result.score), "yellow");
  assert.equal(result.levelHint, "policy-risk");
});

test("retail security-camera biometrics plus data brokers stay yellow under tracker load", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 63,
    pageConfidence: "High",
    findings: [
      {
        category: "biometric",
        title: "Collects biometric information",
        confidence: "explicit",
        severity: "high",
        score: 28,
        countAsRisk: true,
        evidence: [
          "Certain stores may also collect biometric information such as facial recognition data, for example, we may use images from security cameras to protect the health and safety of our customers and associates, or to prevent, investigate, and prosecute shoplifting, fraud, and other criminal activities.",
        ],
        primaryUseContext: {},
      },
      {
        category: "external_data",
        title: "Combines data from outside sources",
        confidence: "explicit",
        severity: "high",
        score: 40,
        countAsRisk: true,
        evidence: [
          "We may also receive information related to you from data brokers or other third parties.",
        ],
        primaryUseContext: {
          outsideSources: true,
          highRiskOutsideSources: true,
          dataBrokerSources: true,
        },
      },
      {
        category: "tracking",
        title: "Uses tracking technologies",
        confidence: "explicit",
        severity: "high",
        score: 29,
        countAsRisk: true,
        evidence: ["Best Buy and our partners use cookies, pixels, tags, or similar technologies on our digital properties."],
        primaryUseContext: {
          secondaryUse: true,
          highRiskSecondaryUse: true,
          targetedAdvertising: true,
        },
      },
    ],
    trackerSignals: {
      riskScore: 55,
      riskLevel: "high",
      trackerHits: Array.from({ length: 24 }, () => ({
        category: "sharing",
        severity: "high",
        confidence: "high",
      })),
      summary: {
        riskScore: 55,
        riskLevel: "high",
      },
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score < 70);
  assert.equal(scoreToLevel(result.score), "yellow");
  assert.equal(result.levelHint, "policy-risk");
});

test("multiple critical high findings can still produce a red toolbar", () => {
  const heuristic = normalizeHeuristicResult({
    isLikelyPolicyPage: true,
    pageScore: 32,
    pageConfidence: "High",
    findings: [
      {
        category: "biometric",
        title: "Collects biometric information",
        confidence: "explicit",
        severity: "high",
        score: 38,
        countAsRisk: true,
        evidence: ["We collect biometric identifiers such as face geometry."],
        primaryUseContext: {},
      },
      {
        category: "external_data",
        title: "Combines data from outside sources",
        confidence: "explicit",
        severity: "high",
        score: 38,
        countAsRisk: true,
        evidence: [
          "We collect information from data brokers and combine it with information we collect.",
        ],
        primaryUseContext: {
          outsideSources: true,
          highRiskOutsideSources: true,
          dataBrokerSources: true,
          profileEnrichment: true,
        },
      },
    ],
    trackerSignals: {
      trackerHits: Array.from({ length: 10 }, () => ({ category: "tracking" })),
    },
  });

  const result = computeFromHeuristic(heuristic);

  assert.ok(result.score >= 70);
  assert.equal(scoreToLevel(result.score), "red");
  assert.equal(result.levelHint, "high-risk");
});
