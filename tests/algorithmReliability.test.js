import test from "node:test";
import assert from "node:assert/strict";

import {
  getRegistrableDomain,
  sameRegistrableDomain,
} from "../lib/domainUtils.js";
import { extractPolicyFreshness } from "../lib/policyMetadata.js";
import { validatePolicyCandidate } from "../lib/policyCandidateValidator.js";

test("registrable-domain helper handles common multi-part suffixes", () => {
  assert.equal(getRegistrableDomain("shop.example.co.uk"), "example.co.uk");
  assert.equal(sameRegistrableDomain("a.example.co.uk", "b.example.co.uk"), true);
  assert.equal(sameRegistrableDomain("example.co.uk", "example.com"), false);
});

test("policy freshness extracts effective or last-updated dates", () => {
  const freshness = extractPolicyFreshness(
    "Privacy Policy. Last updated: January 3, 2025.",
    new Date("2026-04-28T00:00:00Z")
  );

  assert.equal(freshness.found, true);
  assert.equal(freshness.year, 2025);
  assert.equal(freshness.status, "fresh");
});

test("candidate validator accepts substantial branded main policies", () => {
  const validation = validatePolicyCandidate({
    sourceHost: "www.example.com",
    candidateHost: "privacy.example.com",
    url: "https://privacy.example.com/privacy-policy",
    titleText: "Example Privacy Policy",
    h1Text: "Privacy Policy",
    candidateType: "privacy_policy",
    pageType: "normal",
    text: `
      Example Privacy Policy. Last updated: January 3, 2025.
      Information we collect includes account information and identifiers.
      We explain how we use your information to provide the service.
      We explain how we share information with service providers.
      We use cookies and analytics.
      Your rights include access and deletion.
      Contact us with privacy questions.
    `,
  });

  assert.equal(validation.isMainPolicy, true);
  assert.equal(validation.brandMatched, true);
  assert.ok(validation.topicCoverage >= 4);
});

test("candidate validator rejects narrow privacy control pages", () => {
  const validation = validatePolicyCandidate({
    sourceHost: "www.example.com",
    candidateHost: "www.example.com",
    url: "https://www.example.com/privacy-center",
    titleText: "Your Privacy Choices",
    h1Text: "Manage Privacy Choices",
    candidateType: "privacy_controls",
    pageType: "normal",
    text: "Your Privacy Choices. Manage cookies and targeted advertising opt out preferences.",
  });

  assert.equal(validation.isMainPolicy, false);
  assert.ok(validation.rejections.includes("privacy-controls"));
});
