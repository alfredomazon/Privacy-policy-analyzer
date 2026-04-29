import test from "node:test";
import assert from "node:assert/strict";

import {
  computeFromHeuristic,
  normalizeHeuristicResult,
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
