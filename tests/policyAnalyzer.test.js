import test from "node:test";
import assert from "node:assert/strict";

import { analyzePolicy } from "../lib/policyAnalyzer.js";

function titles(result) {
  return result.findings.map((finding) => finding.title);
}

test("does not flag negated sale language as a finding", () => {
  const result = analyzePolicy(["We do not sell your personal information."]);

  assert.deepEqual(result.findings, []);
});

test("does not explode unrelated categories from a targeted advertising negation", () => {
  const result = analyzePolicy([
    "We do not use your information for targeted advertising.",
  ]);

  const findingTitles = titles(result);

  assert.equal(findingTitles.includes("Uses tracking technologies"), false);
  assert.equal(findingTitles.includes("Collects biometric information"), false);
  assert.equal(findingTitles.includes("Collects payment or financial data"), false);
  assert.equal(findingTitles.includes("Collects location data"), false);
  assert.equal(findingTitles.includes("References children or minors"), false);
});

test("downgrades operational service-provider sharing", () => {
  const result = analyzePolicy([
    "We may share information with service providers that help operate the service.",
  ]);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].title, "Shares data with third parties");
  assert.equal(result.findings[0].countAsRisk, false);
});

test("extracts plausible findings from a policy-like sample", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "Information we collect includes your name, email address, and IP address.",
    "Cookies",
    "We use analytics and cookies to understand usage and improve the service.",
    "How We Share",
    "We may share personal information with service providers and advertising partners.",
    "You may request deletion or access to your personal information.",
  ]);

  const findingTitles = titles(result);

  assert.ok(findingTitles.includes("Uses tracking technologies"));
  assert.ok(findingTitles.includes("Collects identifying information"));
  assert.ok(findingTitles.includes("Shares data with third parties"));
  assert.equal(findingTitles.includes("Collects biometric information"), false);

  const tracking = result.findings.find((finding) => finding.category === "tracking");
  assert.ok(tracking.ruleId.startsWith("tracking."));
  assert.ok(tracking.sections.includes("tracking"));
});

test("extracts structured policy practices", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "We collect your name, email address, IP address, payment information, and device information.",
    "How We Use Information",
    "We use your information to provide the service, process your orders, improve the service, prevent fraud, and send you marketing messages.",
    "How We Share Information",
    "We may disclose your personal information to service providers, affiliates, analytics providers, and advertising partners.",
    "Your Rights",
    "You may access, correct, or delete your information and opt out of targeted advertising.",
    "Data Retention",
    "We retain your information for as long as necessary to provide the service and comply with legal obligations.",
  ]);

  const practiceKeys = (items) => items.map((item) => item.key);

  assert.ok(practiceKeys(result.practices.dataTypes).includes("identifiers"));
  assert.ok(practiceKeys(result.practices.dataTypes).includes("payment_financial"));
  assert.ok(practiceKeys(result.practices.purposes).includes("provide_service"));
  assert.ok(practiceKeys(result.practices.purposes).includes("advertising"));
  assert.ok(practiceKeys(result.practices.recipients).includes("service_providers"));
  assert.ok(practiceKeys(result.practices.recipients).includes("advertising_partners"));
  assert.ok(practiceKeys(result.practices.controls).includes("delete"));
  assert.equal(result.practices.retention.present, true);
  assert.equal(result.practices.retention.vague, true);
});

test("centers evidence snippets on the matched sensitive term", () => {
  const result = analyzePolicy([
    "Categories of Information Collected: The following categories of information may be collected when you use the service, create an account, contact support, or interact with certain features, including account details, device data, and biometric information such as face geometry.",
  ]);

  const biometric = result.findings.find((finding) => finding.category === "biometric");

  assert.ok(biometric);
  assert.match(biometric.evidence[0], /biometric/i);
  assert.doesNotMatch(biometric.evidence[0], /^Categories of Information Collected/i);
});
