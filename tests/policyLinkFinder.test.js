import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  findBestPolicyLink,
  rankPolicyLinkCandidates,
  scoreLinkSignal,
} from "../lib/policyLinkFinder.js";
import { getKnownPolicyForHost } from "../lib/policyRegistry.js";

const SITE_FIXTURES = [
  {
    name: "Apple",
    fixture: "apple-footer.html",
    pageUrl: "https://www.apple.com/iphone/",
    host: "www.apple.com",
    expected: "https://www.apple.com/legal/privacy/",
  },
  {
    name: "Amazon",
    fixture: "amazon-footer.html",
    pageUrl: "https://www.amazon.com/dp/B000000000",
    host: "www.amazon.com",
    expected: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
  },
  {
    name: "Target",
    fixture: "target-footer.html",
    pageUrl: "https://www.target.com/c/deals/-/N-4xw74",
    host: "www.target.com",
    expected: "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
  },
  {
    name: "Netflix",
    fixture: "netflix-footer.html",
    pageUrl: "https://www.netflix.com/browse",
    host: "www.netflix.com",
    expected: "https://help.netflix.com/legal/privacy",
  },
  {
    name: "TikTok",
    fixture: "tiktok-footer.html",
    pageUrl: "https://www.tiktok.com/@example",
    host: "www.tiktok.com",
    expected: "https://www.tiktok.com/legal/page/us/privacy-policy/en",
  },
  {
    name: "Walmart",
    fixture: "walmart-footer.html",
    pageUrl: "https://www.walmart.com/ip/example-product/123",
    host: "www.walmart.com",
    expected: "https://corporate.walmart.com/privacy-security/walmart-privacy-notice",
  },
];

function withHostAdjustment(score, host, pageHost = "www.walmart.com") {
  const sameHost = host === pageHost;
  const root = (value) => value.split(".").slice(-2).join(".");
  const sameRootDomain = root(host) === root(pageHost);

  if (sameHost) return score + 5;
  if (sameRootDomain) return score + 2;
  return score - 6;
}

function loadFixtureLinks(name) {
  const html = readFileSync(join("tests", "fixtures", name), "utf8");
  const footerStart = html.indexOf("<footer");

  return Array.from(html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gis)).map((match) => {
    const before = match.index ?? 0;
    const attrs = match[1] || "";
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);

    return {
      href: hrefMatch?.[1] || "",
      text,
      inFooterOrNav: footerStart >= 0 && before > footerStart,
    };
  });
}

test("prefers a footer privacy policy link over state privacy rights", () => {
  const privacyScore = scoreLinkSignal(
    "Privacy",
    "https://www.bestbuy.com/site/help-topics/privacy-policy/pcmcat204400050062.c?id=pcmcat204400050062",
    true
  );

  const rightsScore = scoreLinkSignal(
    "State Privacy Rights",
    "https://www.bestbuy.com/site/help-topics/state-privacy-rights/pcmcat000000000000.c?id=pcmcat000000000000",
    true
  );

  assert.ok(privacyScore > rightsScore);
});

test("penalizes narrow privacy control pages against the main privacy page", () => {
  const privacyScore = scoreLinkSignal(
    "Privacy",
    "https://www.bestbuy.com/site/help-topics/privacy-policy/pcmcat204400050062.c?id=pcmcat204400050062",
    true
  );

  const healthPrivacyScore = scoreLinkSignal(
    "Health Data Privacy",
    "https://www.bestbuy.com/site/help-topics/health-data-privacy/pcmcat000000000000.c?id=pcmcat000000000000",
    true
  );

  const optOutScore = scoreLinkSignal(
    "Targeted Advertising Opt Out",
    "https://www.bestbuy.com/site/help-topics/targeted-advertising-opt-out/pcmcat000000000000.c?id=pcmcat000000000000",
    true
  );

  assert.ok(privacyScore > healthPrivacyScore);
  assert.ok(privacyScore > optOutScore);
});

test("prefers Walmart privacy notice over customer privacy center and notice at collection", () => {
  const privacyNotice = withHostAdjustment(
    scoreLinkSignal(
      "Privacy Notice",
      "https://corporate.walmart.com/privacy-security/walmart-privacy-notice",
      true
    ),
    "corporate.walmart.com"
  );

  const privacyCenter = withHostAdjustment(
    scoreLinkSignal(
      "Customer Privacy Center",
      "https://www.walmart.com/privacy-center",
      true
    ),
    "www.walmart.com"
  );

  const noticeAtCollection = withHostAdjustment(
    scoreLinkSignal(
      "Notice at Collection",
      "https://corporate.walmart.com/privacy-security/notice-at-collection",
      true
    ),
    "corporate.walmart.com"
  );

  assert.ok(privacyNotice > privacyCenter);
  assert.ok(privacyNotice > noticeAtCollection);
});

test("uses known-domain fallback for Walmart", async () => {
  const originalWindow = globalThis.window;

  globalThis.window = {
    location: {
      hostname: "www.walmart.com",
    },
  };

  try {
    const result = await findBestPolicyLink();
    assert.equal(
      result.bestPolicyLink,
      "https://corporate.walmart.com/privacy-security/walmart-privacy-notice"
    );
    assert.equal(result.source, "known-domain");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("does not use known-domain fallback on Google search results", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  globalThis.window = {
    location: {
      hostname: "www.google.com",
      href: "https://www.google.com/search?q=apple+privacy+policy",
    },
  };
  globalThis.document = {
    title: "apple privacy policy - Google Search",
  };

  try {
    const result = await findBestPolicyLink();
    assert.equal(result.bestPolicyLink, "");
    assert.equal(result.source, "search-page");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("does not pivot from Wikipedia privacy articles to Wikimedia policy", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  globalThis.window = {
    location: {
      hostname: "en.wikipedia.org",
      href: "https://en.wikipedia.org/wiki/Privacy",
    },
  };
  globalThis.document = {
    title: "Privacy - Wikipedia",
    body: {
      innerText:
        "From Wikipedia, the free encyclopedia. Privacy is an article about privacy, data protection, and privacy policy concepts.",
    },
  };

  try {
    const result = await findBestPolicyLink();
    assert.equal(result.bestPolicyLink, "");
    assert.equal(result.source, "non-policy-page");
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("known policy registry matches Walmart subdomains and deep pages by host", () => {
  const walmart = getKnownPolicyForHost("www.walmart.com");
  const corporate = getKnownPolicyForHost("corporate.walmart.com");

  assert.equal(
    walmart.url,
    "https://corporate.walmart.com/privacy-security/walmart-privacy-notice"
  );
  assert.equal(corporate.url, walmart.url);
  assert.equal(walmart.source, "known-domain");
});

for (const site of SITE_FIXTURES) {
  test(`real-site fixture ranks ${site.name} main privacy policy`, () => {
    const links = loadFixtureLinks(site.fixture);
    const ranked = rankPolicyLinkCandidates(links, site.pageUrl, site.host);

    assert.equal(ranked[0]?.url, site.expected);
  });
}

test("known policy registry covers common high-traffic platforms", () => {
  const expected = new Map([
    ["www.apple.com", "https://www.apple.com/legal/privacy/"],
    [
      "smile.amazon.com",
      "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
    ],
    [
      "help.netflix.com",
      "https://help.netflix.com/legal/privacy",
    ],
    [
      "www.tiktok.com",
      "https://www.tiktok.com/legal/page/us/privacy-policy/en",
    ],
    [
      "www.target.com",
      "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
    ],
  ]);

  for (const [host, url] of expected) {
    assert.equal(getKnownPolicyForHost(host)?.url, url);
  }
});

test("real-site fixture filters search-result policy mentions", () => {
  const links = loadFixtureLinks("search-results.html");
  const ranked = rankPolicyLinkCandidates(
    links,
    "https://www.google.com/search?q=privacy+policy",
    "www.google.com"
  );

  assert.equal(ranked.length, 0);
});
