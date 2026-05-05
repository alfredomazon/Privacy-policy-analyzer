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
      "www.youtube.com",
      "https://policies.google.com/privacy?hl=en-US",
    ],
    [
      "music.youtube.com",
      "https://policies.google.com/privacy?hl=en-US",
    ],
    [
      "www.twitch.tv",
      "https://legal.twitch.com/en/legal/privacy-notice/",
    ],
    [
      "www.crunchyroll.com",
      "https://www.sonypictures.com/corp/privacy.html",
    ],
    [
      "www.nvidia.com",
      "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
    ],
    [
      "www.hp.com",
      "https://www.hp.com/us-en/privacy/ww-privacy.html",
    ],
    [
      "www.target.com",
      "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
    ],
    ["www.reddit.com", "https://redditinc.com/privacy"],
    ["discord.com", "https://discord.com/privacy"],
    [
      "store.steampowered.com",
      "https://store.steampowered.com/privacy_agreement/",
    ],
    ["itch.io", "https://itch.io/docs/legal/privacy-policy"],
    ["archiveofourown.org", "https://archiveofourown.org/privacy"],
    [
      "www.fandom.com",
      "https://www.fandom.com/privacy-policy-2025-10-13",
    ],
    ["www.patreon.com", "https://privacy.patreon.com/policies/en/"],
    [
      "chicago.craigslist.org",
      "https://www.craigslist.org/about/privacy.policy",
    ],
    ["www.coinbase.com", "https://www.coinbase.com/legal/privacy"],
    ["9gag.com", "https://about.9gag.com/privacy"],
    ["www.quora.com", "https://www.quora.com/about/privacy"],
    [
      "www.khanacademy.org",
      "https://www.khanacademy.org/about/privacy-policy",
    ],
    [
      "www.openstreetmap.org",
      "https://osmfoundation.org/wiki/Privacy_Policy",
    ],
    [
      "www.gutenberg.org",
      "https://www.gutenberg.org/policy/privacy_policy.html",
    ],
    [
      "github.com",
      "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    ],
    ["gitlab.com", "https://about.gitlab.com/privacy/"],
    ["sourceforge.net", "https://slashdotmedia.com/privacy-statement/"],
    ["archive.org", "https://archive.org/about/terms"],
    ["letterboxd.com", "https://letterboxd.com/legal/privacy-notice/"],
    [
      "www.deviantart.com",
      "https://www.deviantart.com/about/policy/privacy",
    ],
    ["soundcloud.com", "https://pages.soundcloud.com/pages/privacy"],
    ["www.tumblr.com", "https://www.tumblr.com/privacy"],
    [
      "bsky.app",
      "https://bsky.social/about/support/privacy-policy",
    ],
    ["mastodon.social", "https://mastodon.social/privacy-policy"],
    [
      "www.roblox.com",
      "https://en.help.roblox.com/hc/en-us/articles/115004630823-Roblox-Privacy-and-Cookie-Policy",
    ],
    ["www.duolingo.com", "https://www.duolingo.com/privacy"],
    ["www.coursera.org", "https://www.coursera.org/about/privacy"],
    [
      "www.eventbrite.com",
      "https://www.eventbrite.com/help/en-us/articles/460838/eventbrite-privacy-policy/",
    ],
    ["www.meetup.com", "https://www.meetup.com/privacy/"],
    [
      "www.yelp.com",
      "https://terms.yelp.com/privacy/en_us/20220831_en_us/",
    ],
    [
      "www.tripadvisor.com",
      "https://tripadvisor.mediaroom.com/us-privacy-policy",
    ],
    ["www.etsy.com", "https://www.etsy.com/legal/privacy/"],
    ["www.dropbox.com", "https://www.dropbox.com/privacy"],
    [
      "www.notion.com",
      "https://www.notion.com/trust/privacy-policy",
    ],
    [
      "www.pinterest.com",
      "https://policy.pinterest.com/en/privacy-policy",
    ],
    [
      "open.spotify.com",
      "https://www.spotify.com/us/legal/privacy-policy/",
    ],
    ["substack.com", "https://substack.com/privacy"],
    [
      "medium.com",
      "https://help.medium.com/hc/en-us/articles/213481328-Medium-Privacy-Policy",
    ],
    [
      "www.linkedin.com",
      "https://www.linkedin.com/legal/privacy-policy",
    ],
    ["www.indeed.com", "https://hrtechprivacy.com/brands/indeed"],
    [
      "www.glassdoor.com",
      "https://hrtechprivacy.com/brands/glassdoor",
    ],
    ["www.airbnb.com", "https://www.airbnb.com/help/article/3175"],
    [
      "www.sephora.com",
      "https://www.sephora.com/beauty/privacy-policy",
    ],
    [
      "us.shein.com",
      "https://us.shein.com/Consumer-Privacy-Notice-s-101.html",
    ],
    [
      "www.temu.com",
      "https://www.temu.com/privacy-and-cookie-policy.html",
    ],
    [
      "www.wayfair.com",
      "https://www.wayfair.com/customerservice/general_info.php",
    ],
    ["www.cnn.com", "https://www.cnn.com/privacy"],
    [
      "www.doordash.com",
      "https://help.doordash.com/legal/document?type=cx-privacy-policy&region=US&locale=en-US",
    ],
    ["www.expedia.com", "https://www.expedia.com/legal/privacy"],
    [
      "www.booking.com",
      "https://www.booking.com/content/privacy.html",
    ],
    [
      "www.instagram.com",
      "https://www.facebook.com/privacy/policy/",
    ],
    ["x.com", "https://x.com/en/privacy"],
    [
      "www.snapchat.com",
      "https://help.snapchat.com/hc/en-us/articles/18514005918612-Privacy-Policy",
    ],
    ["www.adobe.com", "https://www.adobe.com/privacy/policy.html"],
    [
      "www.canva.com",
      "https://www.canva.com/policies/privacy-policy/",
    ],
    [
      "www.att.com",
      "https://about.att.com/privacy/full_privacy_policy.html",
    ],
    [
      "www.bankofamerica.com",
      "https://www.bankofamerica.com/security-center/online-privacy-notice/",
    ],
    [
      "www.wellsfargo.com",
      "https://www.wellsfargo.com/privacy-security/online/",
    ],
    [
      "www.lowes.com",
      "https://www.lowes.com/l/about/privacy-and-security-statement",
    ],
    ["www.costco.com", "https://www.costco.com/privacy-policy.html"],
    [
      "www.aliexpress.us",
      "https://terms.alicdn.com/legal-agreement/terms/suit_bu1_aliexpress/suit_bu1_aliexpress201909171350_82407_9_6_24275.html",
    ],
    [
      "www.ups.com",
      "https://www.ups.com/us/en/help-center/legal-terms-conditions/privacy-notice.page",
    ],
    [
      "www.united.com",
      "https://www.united.com/en/us/fly/privacy-policy.html",
    ],
    [
      "www.aa.com",
      "https://www.aa.com/pubcontent/en_US/customer-service/support/privacy-policy.html",
    ],
    [
      "www.hilton.com",
      "https://www.hilton.com/en/p/global-privacy-statement",
    ],
    [
      "www.disneyplus.com",
      "https://privacy.thewaltdisneycompany.com/en/current-privacy-policy/",
    ],
    [
      "www.hulu.com",
      "https://privacy.thewaltdisneycompany.com/en/current-privacy-policy/",
    ],
    ["www.max.com", "https://www.hbomax.com/privacy"],
    [
      "www.peacocktv.com",
      "https://www.nbcuniversalprivacy.com/privacy?brandA=Peacock&intake=Peacock",
    ],
    [
      "www.xbox.com",
      "https://www.microsoft.com/en-us/privacy/privacystatement",
    ],
    [
      "www.nordstrom.com",
      "https://www.nordstrom.com/browse/customer-service/policy/privacy?cid=00000",
    ],
    [
      "www.zara.com",
      "https://www.zara.com/static/pdfs/US/privacy-policy/privacy-policy_en_US-20241209.html",
    ],
    [
      "www.uhc.com",
      "https://www.unitedhealthgroup.com/privacy.html",
    ],
    [
      "investor.vanguard.com",
      "https://investor.vanguard.com/privacy-center/personal-investor-privacy-notice",
    ],
    [
      "www.fidelity.com",
      "https://www.fidelity.com/privacy/overview",
    ],
    ["www.kroger.com", "https://www.kroger.com/i/privacy-policy/"],
    [
      "www.kohls.com",
      "https://www.kohls.com/feature/privacy-policy.jsp",
    ],
    [
      "www2.hm.com",
      "https://www2.hm.com/en_us/customer-service/legal-and-privacy/privacy-link.html",
    ],
    [
      "www.goodrx.com",
      "https://www.goodrx.com/about/privacy-policy",
    ],
    ["www.udemy.com", "https://www.udemy.com/terms/privacy/"],
    ["aws.amazon.com", "https://aws.amazon.com/privacy/"],
    [
      "www.paramountplus.com",
      "https://privacy.paramount.com/en/policy?r=www.viacomprivacy.com",
    ],
    [
      "www.roku.com",
      "https://docs.roku.com/api/v1/published/userprivacypolicy/en/us",
    ],
    ["www.imdb.com", "https://www.imdb.com/privacy/"],
    [
      "store.epicgames.com",
      "https://legal.epicgames.com/epicgames/privacy-policy",
    ],
    ["www.cloudflare.com", "https://www.cloudflare.com/privacypolicy/"],
    [
      "www.digitalocean.com",
      "https://www.digitalocean.com/legal/privacy-policy",
    ],
    ["www.figma.com", "https://www.figma.com/legal/privacy/"],
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

test("ranks privacy links exposed through dynamic page data", () => {
  const ranked = rankPolicyLinkCandidates(
    [
      {
        href: "/privacy-policy",
        text: "",
        title: "script data",
        source: "script",
      },
    ],
    "https://dynamic.example.com/app",
    "dynamic.example.com"
  );

  assert.equal(ranked[0]?.url, "https://dynamic.example.com/privacy-policy");
  assert.equal(ranked[0]?.source, "script");
});

test("ignores unrelated privacy links exposed through dynamic page data", () => {
  const ranked = rankPolicyLinkCandidates(
    [
      {
        href: "https://miro.com/legal/privacy-policy/",
        text: "Privacy policy",
        title: "script data",
        source: "script",
      },
    ],
    "https://www.meetup.com/find/",
    "www.meetup.com"
  );

  assert.equal(ranked.length, 0);
});

test("ignores infrastructure privacy links from security challenge pages", () => {
  const ranked = rankPolicyLinkCandidates(
    [
      {
        href: "https://www.cloudflare.com/privacypolicy/",
        text: "Privacy",
        title: "Performance and Security by Cloudflare",
        inFooterOrNav: true,
      },
    ],
    "https://www.fandom.com/",
    "www.fandom.com"
  );

  assert.equal(ranked.length, 0);
});
