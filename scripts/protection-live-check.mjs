import {
  classifyProtectionRequest,
  sanitizeTrackingUrl,
} from "../lib/protectionRules.js";
import {
  classifyScamPopupSignal,
  textLooksLikeScamPopup,
  urlLooksLikePopupScam,
} from "../lib/scamPopupPatterns.js";

const DEFAULT_SITES = [
  { label: "Google Search", url: "https://www.google.com/search?q=how+to+make+a+taco", group: "normal" },
  { label: "Apple", url: "https://www.apple.com/", group: "normal" },
  { label: "Wikipedia", url: "https://www.wikipedia.org/", group: "normal" },
  { label: "AARP", url: "https://www.aarp.org/", group: "normal/older-adults" },
  { label: "MedlinePlus", url: "https://medlineplus.gov/", group: "normal/health" },
  { label: "Best Buy", url: "https://www.bestbuy.com/", group: "normal" },
  { label: "Walmart", url: "https://www.walmart.com/", group: "normal" },
  { label: "YouTube", url: "https://www.youtube.com/", group: "normal" },
  { label: "Weather.com", url: "https://weather.com/", group: "ad-heavy" },
  { label: "Daily Mail", url: "https://www.dailymail.co.uk/home/index.html", group: "ad-heavy" },
  { label: "Softonic", url: "https://www.softonic.com/", group: "download/ad-heavy" },
  { label: "FileHorse", url: "https://www.filehorse.com/", group: "download/ad-heavy" },
];

const NETWORK_RULES = {
  blockTrackers: true,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: true,
  disableTrackingLinks: true,
  blockScamPopups: false,
};

const SAFETY_DEFAULT_RULES = {
  blockTrackers: false,
  blockThirdPartyScripts: false,
  blockIframes: false,
  removeAds: true,
  disableTrackingLinks: false,
  blockScamPopups: true,
};

const ALL_RULES = {
  blockTrackers: true,
  blockThirdPartyScripts: true,
  blockIframes: true,
  removeAds: true,
  disableTrackingLinks: true,
  blockScamPopups: true,
};

const FETCH_TIMEOUT_MS = 12000;
const MAX_URLS_PER_TYPE = 120;

const SCAM_POPUP_CASES = [
  {
    label: "Fake Windows virus alert",
    text: "Windows Defender security warning. Your computer is infected. Do not close this window. Call Microsoft support at 888-555-0199.",
    url: "https://example.test/security-warning",
    expected: true,
  },
  {
    label: "Browser locked support trap",
    text: "Critical alert: malware detected. Your browser is locked because unauthorized access was detected.",
    url: "https://example.test/browser-lock",
    expected: true,
  },
  {
    label: "Notification allow trap",
    text: "Click Allow to verify you are not a robot and continue.",
    url: "https://example.test/push/continue",
    expected: true,
  },
  {
    label: "Fake CAPTCHA Allow prompt",
    text: "Tap Allow to confirm you are not a robot.",
    url: "https://example.test/allow-notifications/verify",
    expected: true,
  },
  {
    label: "Unwanted browser installer",
    text: "Your browser is out of date. Install Wave Browser now to continue safely.",
    url: "https://example.test/download/wavebrowser-setup.exe",
    expected: true,
  },
  {
    label: "Fake Chrome update",
    text: "Chrome update required. Download the setup to keep browsing.",
    url: "https://example.test/browser-update/chrome-setup.exe",
    expected: true,
  },
  {
    label: "No-gesture notification prompt",
    text: "Enable alerts for order updates.",
    url: "https://example.test/orders",
    signal: {
      notificationRequest: true,
      recentUserGesture: false,
      notificationRequestCount: 1,
    },
    expected: true,
  },
  {
    label: "Normal stock alert after click",
    text: "Notify me when this item is back in stock.",
    url: "https://example.test/product",
    signal: {
      notificationRequest: true,
      recentUserGesture: true,
      notificationRequestCount: 1,
    },
    expected: false,
  },
  {
    label: "Normal Google search wording",
    text: "Search results for how to make a taco.",
    url: "https://www.google.com/search?q=how+to+make+a+taco",
    expected: false,
  },
  {
    label: "Newsletter modal",
    text: "Subscribe to our newsletter for updates and offers.",
    url: "https://example.test/newsletter",
    expected: false,
  },
  {
    label: "Checkout sign-in modal",
    text: "Sign in to continue checkout and review your cart.",
    url: "https://example.test/login",
    expected: false,
  },
];

function normalizeHost(hostname = "") {
  return String(hostname || "").replace(/^www\./i, "").toLowerCase();
}

function hostnameFromUrl(rawUrl = "") {
  try {
    return normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return "";
  }
}

function resolveUrl(rawUrl = "", baseUrl = "") {
  const value = String(rawUrl || "").trim();
  if (
    !value ||
    value.startsWith("#") ||
    /^(javascript|mailto|tel|data|blob):/i.test(value)
  ) {
    return "";
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function compactText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractAttrUrls(html = "", baseUrl = "") {
  const requests = [];
  const patterns = [
    { type: "script", tag: "script", attr: "src" },
    { type: "sub_frame", tag: "iframe", attr: "src" },
    { type: "image", tag: "img", attr: "src" },
    { type: "image", tag: "source", attr: "srcset" },
    { type: "image", tag: "img", attr: "srcset" },
    { type: "other", tag: "link", attr: "href" },
    { type: "other", tag: "a", attr: "href", linkOnly: true },
  ];

  for (const pattern of patterns) {
    const tagRe = new RegExp(`<${pattern.tag}\\b[^>]*>`, "gi");
    const attrRe = new RegExp(
      `\\b${pattern.attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`,
      "i"
    );
    const matches = html.match(tagRe) || [];
    let count = 0;

    for (const tag of matches) {
      if (count >= MAX_URLS_PER_TYPE) break;

      const attrMatch = tag.match(attrRe);
      if (!attrMatch) continue;

      const rawValue = attrMatch[1].replace(/^["']|["']$/g, "");
      const candidates =
        pattern.attr === "srcset"
          ? rawValue.split(",").map((part) => part.trim().split(/\s+/)[0])
          : [rawValue];

      for (const candidate of candidates) {
        const url = resolveUrl(candidate, baseUrl);
        if (!url) continue;

        requests.push({
          url,
          type: pattern.type,
          linkOnly: !!pattern.linkOnly,
        });
        count += 1;
      }
    }
  }

  return uniqueBy(requests, (item) => `${item.type}|${item.url}`);
}

function classifyRequests(requests = [], pageHostname = "", rules = NETWORK_RULES) {
  return requests
    .filter((request) => !request.linkOnly)
    .map((request) =>
      classifyProtectionRequest({
        url: request.url,
        pageHostname,
        requestType: request.type,
        rules,
      })
    )
    .filter(Boolean);
}

function groupBy(items = [], keyFn = (item) => item) {
  const map = new Map();

  for (const item of items) {
    const key = keyFn(item) || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

function topLabels(blocks = [], limit = 4) {
  return groupBy(blocks, (item) => item.label || item.vendor || item.id)
    .slice(0, limit)
    .map((item) => `${item.key} x${item.count}`)
    .join(", ");
}

function summarizeSite(site, html, finalUrl) {
  const pageHostname = hostnameFromUrl(finalUrl || site.url);
  const requests = extractAttrUrls(html, finalUrl || site.url);
  const links = requests.filter((request) => request.linkOnly);
  const safetyDefaultBlocks = classifyRequests(
    requests,
    pageHostname,
    SAFETY_DEFAULT_RULES
  );
  const networkBlocks = classifyRequests(requests, pageHostname, NETWORK_RULES);
  const allBlocks = classifyRequests(requests, pageHostname, ALL_RULES);
  const broadScriptBlocks = allBlocks.filter(
    (item) => item.id === "third_party_script"
  );
  const broadFrameBlocks = allBlocks.filter(
    (item) => item.id === "third_party_iframe"
  );
  const cleanedLinks = links
    .map((request) => sanitizeTrackingUrl(request.url, finalUrl || site.url))
    .filter((result) => result.changed);
  const requestHosts = new Set(
    requests
      .filter((request) => !request.linkOnly)
      .map((request) => hostnameFromUrl(request.url))
      .filter(Boolean)
  );
  const networkHosts = new Set(networkBlocks.map((item) => item.hostname).filter(Boolean));
  const safetyDefaultHosts = new Set(
    safetyDefaultBlocks.map((item) => item.hostname).filter(Boolean)
  );
  const broadScriptHosts = groupBy(broadScriptBlocks, (item) => item.hostname)
    .slice(0, 3)
    .map((item) => `${item.key} x${item.count}`)
    .join(", ");
  const warning =
    site.group.startsWith("normal") && safetyDefaultBlocks.length >= 6
      ? "safety-default-heavy"
      : site.group.startsWith("normal") && broadScriptBlocks.length >= 3
      ? "broad-script-risk"
      : networkBlocks.length >= 8
        ? "heavy-network-blocking"
        : "";

  return {
    site: site.label,
    group: site.group,
    host: pageHostname,
    scannedRequests: requests.filter((request) => !request.linkOnly).length,
    requestHosts: requestHosts.size,
    safetyDefaultBlocks: safetyDefaultBlocks.length,
    safetyDefaultHosts: safetyDefaultHosts.size,
    networkBlocks: networkBlocks.length,
    networkHosts: networkHosts.size,
    allProtectBlocks: allBlocks.length,
    broadScripts: broadScriptBlocks.length,
    broadFrames: broadFrameBlocks.length,
    cleanedLinks: cleanedLinks.length,
    safetyDefaultTopBlocks: topLabels(safetyDefaultBlocks) || "-",
    topBlocks: topLabels(networkBlocks) || "-",
    broadScriptHosts: broadScriptHosts || "-",
    warning,
  };
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      html: text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const rows = [];

  for (const site of DEFAULT_SITES) {
    try {
      const fetched = await fetchHtml(site.url);

      if (!fetched.ok || !/html/i.test(fetched.html.slice(0, 3000))) {
        rows.push({
          site: site.label,
          group: site.group,
          host: hostnameFromUrl(fetched.url || site.url),
          scannedRequests: 0,
          requestHosts: 0,
          safetyDefaultBlocks: 0,
          safetyDefaultHosts: 0,
          networkBlocks: 0,
          networkHosts: 0,
          allProtectBlocks: 0,
          broadScripts: 0,
          broadFrames: 0,
          cleanedLinks: 0,
          safetyDefaultTopBlocks: "-",
          topBlocks: "-",
          broadScriptHosts: "-",
          warning: `fetch-status-${fetched.status}`,
        });
        continue;
      }

      rows.push(summarizeSite(site, fetched.html, fetched.url));
    } catch (error) {
      rows.push({
        site: site.label,
        group: site.group,
        host: hostnameFromUrl(site.url),
        scannedRequests: 0,
        requestHosts: 0,
        safetyDefaultBlocks: 0,
        safetyDefaultHosts: 0,
        networkBlocks: 0,
        networkHosts: 0,
        allProtectBlocks: 0,
        broadScripts: 0,
        broadFrames: 0,
        cleanedLinks: 0,
        safetyDefaultTopBlocks: "-",
        topBlocks: "-",
        broadScriptHosts: "-",
        warning: compactText(`${error.name}: ${error.message}`),
      });
    }
  }

  console.table(rows);

  const broadNormal = rows.filter(
    (row) => row.group.startsWith("normal") && row.warning === "broad-script-risk"
  );
  const heavySafetyDefaultNormal = rows.filter(
    (row) => row.group.startsWith("normal") && row.warning === "safety-default-heavy"
  );
  const blockedAdHeavy = rows.filter(
    (row) => !row.group.startsWith("normal") && row.networkBlocks > 0
  );

  console.log(
    `\nNormal sites with broad third-party script risk: ${broadNormal.length}`
  );
  console.log(
    `Normal sites with heavy safety-default blocking: ${heavySafetyDefaultNormal.length}`
  );
  console.log(
    `Ad-heavy/download sites with network blocks detected: ${blockedAdHeavy.length}`
  );

  const scamRows = SCAM_POPUP_CASES.map((item) => {
    const classification = classifyScamPopupSignal({
      text: item.text,
      url: item.url,
      ...(item.signal || {}),
    });
    const detected =
      classification.level !== "normal" ||
      textLooksLikeScamPopup(item.text) ||
      urlLooksLikePopupScam(item.url);
    return {
      case: item.label,
      confidence: classification.label,
      detected,
      expected: item.expected,
      status: detected === item.expected ? "PASS" : "FAIL",
    };
  });

  console.log("\nScam popup pattern checks:");
  console.table(scamRows);
}

run();
