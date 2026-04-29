import test from "node:test";
import assert from "node:assert/strict";

import { detectTrackerSignals } from "../lib/trackerDetector.js";

function makeStorage(keys = []) {
  return {
    length: keys.length,
    key(index) {
      return keys[index] || null;
    },
  };
}

function installFakePage({
  scripts = [],
  iframes = [],
  fields = [],
  inlineScripts = [],
  html = "",
  localStorageKeys = [],
  sessionStorageKeys = [],
} = {}) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  globalThis.window = {
    location: {
      hostname: "shop.example.com",
      href: "https://shop.example.com/product",
    },
    localStorage: makeStorage(localStorageKeys),
    sessionStorage: makeStorage(sessionStorageKeys),
  };

  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === "script[src]") return scripts.map((src) => ({ src }));
      if (selector === "iframe[src]") return iframes.map((src) => ({ src }));
      if (selector === "input, textarea, select") return fields;
      return [];
    },
    scripts: inlineScripts.map((textContent) => ({ src: "", textContent })),
    documentElement: {
      outerHTML: html,
    },
  };

  return () => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  };
}

test("groups DOM, network, storage, form, and fingerprinting tracker evidence", () => {
  const cleanup = installFakePage({
    scripts: ["https://www.googletagmanager.com/gtag/js?id=G-123"],
    iframes: ["https://static.hotjar.com/frame.html"],
    fields: [
      {
        name: "email",
        id: "checkout-email",
        type: "email",
        placeholder: "Email",
        autocomplete: "email",
        getAttribute() {
          return "";
        },
      },
    ],
    inlineScripts: [
      "const canvas = document.createElement('canvas'); canvas.toDataURL(); navigator.hardwareConcurrency;",
    ],
    localStorageKeys: ["_fbp", "_ga_TEST"],
  });

  try {
    const result = detectTrackerSignals({
      networkSignals: [
        {
          url: "https://connect.facebook.net/en_US/fbevents.js",
          sourceType: "network",
          requestType: "script",
        },
      ],
    });

    assert.equal(result.tracking, true);
    assert.equal(result.sharing, true);
    assert.equal(result.identifiers, true);
    assert.equal(result.confidence, "high");
    assert.ok(result.groups.knownTrackers.some((hit) => hit.vendor === "Meta/Facebook"));
    assert.ok(result.groups.knownTrackers.some((hit) => hit.vendor === "Google Tag Manager"));
    assert.ok(result.groups.knownTrackers.some((hit) => hit.vendor === "Hotjar"));
    assert.ok(result.groups.storage.some((hit) => hit.label === "Facebook tracking key"));
    assert.ok(result.groups.forms.some((hit) => hit.label === "Email field"));
    assert.ok(result.groups.fingerprinting.some((hit) => hit.id === "canvas_readback"));
    assert.ok(result.groups.knownTrackers.every((hit) => hit.impactReason));
    assert.ok(result.groups.storage.every((hit) => hit.impactReason));
    assert.ok(result.groups.forms.every((hit) => hit.impactReason));
    assert.ok(result.groups.fingerprinting.every((hit) => hit.impactReason));
    assert.ok(result.summary.impactReasons.includes("fingerprinting"));
    assert.ok(result.summary.counts.vendors >= 3);
  } finally {
    cleanup();
  }
});

test("does not flag one weak browser-property reference as fingerprinting", () => {
  const cleanup = installFakePage({
    inlineScripts: ["console.log(navigator.languages);"],
  });

  try {
    const result = detectTrackerSignals();

    assert.equal(result.groups.fingerprinting.length, 0);
    assert.equal(result.confidence, "low");
  } finally {
    cleanup();
  }
});

test("does not treat benign third-party infrastructure as tracker sharing", () => {
  const cleanup = installFakePage({
    scripts: [
      "https://cdnjs.cloudflare.com/ajax/libs/library/1.0.0/library.min.js",
      "https://cdn.jsdelivr.net/npm/package/index.js",
      "https://unpkg.com/package/index.js",
      "https://static.cloudflare.com/widget.js",
      "https://cdn.bootstrapcdn.com/bootstrap.min.js",
      "https://assets.cloudfront.net/app.js",
    ],
  });

  try {
    const result = detectTrackerSignals();

    assert.equal(result.trackerHits.length, 0);
    assert.equal(result.sharing, false);
    assert.equal(result.confidence, "low");
    assert.equal(result.summary.counts.meaningfulThirdParty, 0);
    assert.ok(
      result.groups.thirdParty.every((resource) => resource.likelyBenign === true)
    );
  } finally {
    cleanup();
  }
});

test("summarizes duplicate tracker requests by vendor", () => {
  const cleanup = installFakePage({
    scripts: [
      "https://www.googletagmanager.com/gtag/js?id=G-1",
      "https://www.googletagmanager.com/gtm.js?id=GTM-1",
    ],
  });

  try {
    const result = detectTrackerSignals({
      networkSignals: [
        {
          url: "https://www.google-analytics.com/g/collect?v=2",
          sourceType: "network",
          requestType: "xmlhttprequest",
        },
        {
          url: "https://www.google-analytics.com/j/collect?v=1",
          sourceType: "network",
          requestType: "image",
        },
      ],
    });

    const googleAnalytics = result.summary.vendors.find(
      (vendor) => vendor.vendor === "Google Analytics"
    );

    assert.ok(googleAnalytics);
    assert.equal(googleAnalytics.count, 2);
    assert.equal(result.summary.counts.vendors, 2);
    assert.equal(result.summary.counts.knownTrackers, 4);
  } finally {
    cleanup();
  }
});

test("treats routine merchant tracker signals as low impact", () => {
  const cleanup = installFakePage({
    scripts: ["https://stats.g.doubleclick.net/dc.js"],
    fields: [
      {
        name: "email",
        id: "checkout-email",
        type: "email",
        placeholder: "Email",
        autocomplete: "email",
        getAttribute() {
          return "";
        },
      },
      {
        name: "shippingAddress",
        id: "shipping-address",
        type: "text",
        placeholder: "Address",
        autocomplete: "shipping street-address",
        getAttribute() {
          return "";
        },
      },
    ],
    localStorageKeys: ["_gcl_aw", "sessionid"],
  });

  try {
    const result = detectTrackerSignals({
      networkSignals: [
        {
          url: "https://adservice.google.com/pagead/conversion/123",
          sourceType: "network",
          requestType: "image",
        },
      ],
    });

    const doubleClick = result.groups.knownTrackers.find(
      (hit) => hit.vendor === "DoubleClick"
    );

    assert.ok(doubleClick);
    assert.equal(doubleClick.routineCommerce, true);
    assert.equal(doubleClick.impactReason, "routine_commerce");
    assert.equal(doubleClick.severity, "medium");
    assert.equal(result.riskLevel, "low");
    assert.equal(result.summary.routineOnly, true);
    assert.ok(result.summary.impactReasons.includes("routine_commerce"));
    assert.ok(result.riskScore < 24);
    assert.ok(
      result.groups.forms.every((signal) => signal.severity === "low")
    );
    assert.ok(
      result.groups.forms.every((signal) => signal.impactReason === "routine_form")
    );
    assert.equal(result.confidence, "medium");
  } finally {
    cleanup();
  }
});

test("does not flag fingerprint wording in page text without script behavior", () => {
  const cleanup = installFakePage({
    html: "<main>Our article explains browser fingerprinting and privacy.</main>",
  });

  try {
    const result = detectTrackerSignals();

    assert.equal(result.groups.fingerprinting.length, 0);
    assert.equal(result.confidence, "low");
  } finally {
    cleanup();
  }
});
