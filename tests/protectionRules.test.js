import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDynamicProtectionRulesForHost,
  classifyProtectionRequest,
  sanitizeTrackingUrl,
} from "../lib/protectionRules.js";

test("classifies known tracker requests with resource context", () => {
  const match = classifyProtectionRequest({
    url: "https://ad.doubleclick.net/activity;src=123",
    pageHostname: "example.com",
    requestType: "script",
    rules: { blockTrackers: true },
  });

  assert.equal(match.id, "doubleclick");
  assert.equal(match.category, "sharing");
  assert.equal(match.severity, "high");
});

test("does not classify YouTube core playback resources", () => {
  const match = classifyProtectionRequest({
    url: "https://rr1---sn-a5mekn6k.googlevideo.com/videoplayback",
    pageHostname: "www.youtube.com",
    requestType: "media",
    rules: {
      blockTrackers: true,
      blockThirdPartyScripts: true,
      blockIframes: true,
      removeAds: true,
    },
  });

  assert.equal(match, null);
});

test("does not broad-block branded first-party asset domains", () => {
  const match = classifyProtectionRequest({
    url: "https://i5.walmartimages.com/dfw/63fd9f59/main.js",
    pageHostname: "www.walmart.com",
    requestType: "script",
    rules: { blockThirdPartyScripts: true },
  });

  assert.equal(match, null);
});

test("still broad-blocks unrelated third-party scripts when enabled", () => {
  const match = classifyProtectionRequest({
    url: "https://cdn.unrelated.example/widget.js",
    pageHostname: "shop.example.com",
    requestType: "script",
    rules: { blockThirdPartyScripts: true },
  });

  assert.equal(match.id, "third_party_script");
  assert.equal(match.severity, "medium");
});

test("builds scoped dynamic blocking rules for enabled protection toggles", () => {
  const rules = buildDynamicProtectionRulesForHost({
    hostname: "shop.example.com",
    rules: { blockTrackers: true, removeAds: true },
    startId: 12000,
  });

  assert.ok(rules.length > 0);
  assert.equal(rules[0].id, 12000);
  assert.ok(
    rules.every((rule) =>
      rule.condition.initiatorDomains.includes("shop.example.com") ||
      rule.condition.initiatorDomains.includes("example.com")
    )
  );
  assert.ok(rules.some((rule) => rule.condition.requestDomains.includes("doubleclick.net")));
});

test("strips tracking parameters without disabling the link", () => {
  const cleaned = sanitizeTrackingUrl(
    "https://example.com/deal?utm_source=newsletter&fbclid=abc&id=42"
  );

  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.url, "https://example.com/deal?id=42");
  assert.deepEqual(cleaned.removedParams.sort(), ["fbclid", "utm_source"]);
});

test("unwraps simple outbound redirect links", () => {
  const cleaned = sanitizeTrackingUrl(
    "https://example.com/out?url=https%3A%2F%2Ftarget.example%2Fpage%3Fid%3D1&utm_campaign=test"
  );

  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.unwrapped, true);
  assert.equal(cleaned.url, "https://target.example/page?id=1");
});
