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
