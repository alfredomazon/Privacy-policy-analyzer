import test from "node:test";
import assert from "node:assert/strict";

import { classifyTrackerUrl } from "../lib/trackerRegistry.js";

test("classifies third-party Meta pixel endpoints with high confidence", () => {
  const hit = classifyTrackerUrl({
    url: "https://connect.facebook.net/en_US/fbevents.js",
    pageHostname: "shop.example.com",
    sourceType: "script",
    requestType: "script",
  });

  assert.equal(hit.vendor, "Meta/Facebook");
  assert.equal(hit.category, "sharing");
  assert.equal(hit.severity, "high");
  assert.equal(hit.confidence, "high");
  assert.equal(hit.firstParty, false);
});

test("lowers first-party tracker confidence when the endpoint shares a root domain", () => {
  const hit = classifyTrackerUrl({
    url: "https://analytics.google.com/g/collect?v=2",
    pageHostname: "www.google.com",
    sourceType: "network",
    requestType: "xmlhttprequest",
  });

  assert.equal(hit.vendor, "Google Analytics");
  assert.equal(hit.firstParty, true);
  assert.equal(hit.confidence, "medium");
});

test("ignores benign third-party resources that do not match tracker rules", () => {
  const hit = classifyTrackerUrl({
    url: "https://cdn.example-cdn.com/library.js",
    pageHostname: "shop.example.com",
    sourceType: "script",
    requestType: "script",
  });

  assert.equal(hit, null);
});
