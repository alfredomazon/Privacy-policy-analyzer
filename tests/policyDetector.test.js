import test from "node:test";
import assert from "node:assert/strict";

import {
  detectPolicyPageQuick,
  scorePolicyPage,
  scorePolicyPageWithReasons,
} from "../lib/policyDetector.js";

test("detects a strong privacy policy page", () => {
  const text =
    "Privacy Policy. Information we collect includes your name, email address, IP address, and cookies. We explain how we use data, how we share data, and your privacy rights.";

  const quick = detectPolicyPageQuick({
    text,
    titleText: "Privacy Policy",
    urlText: "https://example.com/privacy-policy",
  });

  assert.equal(quick.isPolicy, true);
  assert.equal(quick.confidence, "High");
  assert.ok(quick.score >= 14);
});

test("filters search results pages", () => {
  const score = scorePolicyPage(
    "Search results for privacy policy example.com",
    "Google Search results for privacy policy",
    "https://www.google.com/search?q=privacy+policy"
  );

  assert.equal(score, 0);
});

test("treats policy mentions on marketing pages as non-policy", () => {
  const quick = detectPolicyPageQuick({
    text: "Read our privacy policy to learn more about how we handle data.",
    titleText: "Acme Cloud Platform",
    urlText: "https://acme.example.com/",
  });

  assert.equal(quick.isPolicy, false);
  assert.equal(quick.pageType, "policy-mention-only");
});

test("treats Wikipedia privacy articles as informational, not policy pages", () => {
  const quick = detectPolicyPageQuick({
    text:
      "From Wikipedia, the free encyclopedia. Privacy is the ability of an individual or group to seclude themselves or information about themselves. Privacy policy and data protection are related topics.",
    titleText: "Privacy - Wikipedia",
    urlText: "https://en.wikipedia.org/wiki/Privacy",
  });

  assert.equal(quick.isPolicy, false);
  assert.equal(quick.pageType, "informational-article");
  assert.equal(quick.score, 0);
});

test("treats Wikipedia article about privacy policy as informational", () => {
  const quick = detectPolicyPageQuick({
    text:
      "From Wikipedia, the free encyclopedia. A privacy policy is a statement or legal document that discloses ways a party gathers, uses, discloses, and manages customer data.",
    titleText: "Privacy policy - Wikipedia",
    urlText: "https://en.wikipedia.org/wiki/Privacy_policy",
  });

  assert.equal(quick.isPolicy, false);
  assert.equal(quick.pageType, "informational-article");
  assert.equal(quick.score, 0);
});

test("returns auditable policy score factors", () => {
  const details = scorePolicyPageWithReasons(
    "Privacy Policy. Information we collect includes cookies. We explain how we use data and your rights.",
    "Privacy Policy",
    "https://example.com/privacy-policy"
  );

  assert.equal(details.score, scorePolicyPage(
    "Privacy Policy. Information we collect includes cookies. We explain how we use data and your rights.",
    "Privacy Policy",
    "https://example.com/privacy-policy"
  ));
  assert.ok(Array.isArray(details.contributions));
  assert.ok(details.contributions.some((item) => item.label === "URL quality"));
  assert.ok(details.topicCoverage > 0);
});
