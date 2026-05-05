import { getRegistrableDomain, sameRegistrableDomain } from "../lib/domainUtils.js";
import { scorePolicyPage, classifyPageConfidence, getPageType } from "../lib/policyDetector.js";
import { getKnownPolicyForHost } from "../lib/policyRegistry.js";
import { rankPolicyLinkCandidates } from "../lib/policyLinkFinder.js";
import { validatePolicyCandidate } from "../lib/policyCandidateValidator.js";

const DEFAULT_SITES = [
  { label: "AO3 work page", url: "https://archiveofourown.org/works/1", kind: "community/archive" },
  { label: "itch.io game page", url: "https://itch.io/games", kind: "indie marketplace" },
  { label: "Craigslist city page", url: "https://chicago.craigslist.org/", kind: "classifieds" },
  { label: "Fandom article", url: "https://www.fandom.com/articles", kind: "wiki/media" },
  { label: "Patreon creator page", url: "https://www.patreon.com/", kind: "creator platform" },
  { label: "9GAG feed", url: "https://9gag.com/", kind: "social/media" },
  { label: "Quora question", url: "https://www.quora.com/", kind: "q-and-a" },
  { label: "Steam store", url: "https://store.steampowered.com/", kind: "game store" },
  { label: "Twitch directory", url: "https://www.twitch.tv/directory", kind: "streaming app" },
  { label: "Crunchyroll", url: "https://www.crunchyroll.com/", kind: "streaming app" },
  { label: "NVIDIA", url: "https://www.nvidia.com/en-us/", kind: "dynamic corporate" },
  { label: "HP", url: "https://www.hp.com/us-en/home.html", kind: "dynamic corporate" },
  { label: "arXiv", url: "https://arxiv.org/", kind: "academic repository" },
  { label: "Project Gutenberg", url: "https://www.gutenberg.org/", kind: "public-domain archive" },
  { label: "OpenStreetMap", url: "https://www.openstreetmap.org/", kind: "map/community" },
  { label: "Lichess", url: "https://lichess.org/", kind: "web app/game" },
  { label: "Khan Academy", url: "https://www.khanacademy.org/", kind: "education" },
  { label: "Bandcamp", url: "https://bandcamp.com/", kind: "music marketplace" },
  { label: "Stack Overflow", url: "https://stackoverflow.com/questions", kind: "developer q-and-a" },
  { label: "NASA", url: "https://www.nasa.gov/", kind: "government/content" },
  { label: "GitHub repo page", url: "https://github.com/explore", kind: "developer platform" },
  { label: "GitLab", url: "https://gitlab.com/explore", kind: "developer platform" },
  { label: "SourceForge", url: "https://sourceforge.net/directory/", kind: "software directory" },
  { label: "Internet Archive", url: "https://archive.org/", kind: "digital library" },
  { label: "Letterboxd", url: "https://letterboxd.com/films/", kind: "film community" },
  { label: "DeviantArt", url: "https://www.deviantart.com/", kind: "art community" },
  { label: "SoundCloud", url: "https://soundcloud.com/discover", kind: "music/social" },
  { label: "Tumblr", url: "https://www.tumblr.com/explore/trending", kind: "social/blogging" },
  { label: "Bluesky", url: "https://bsky.app/", kind: "social app" },
  { label: "Mastodon", url: "https://mastodon.social/explore", kind: "federated social" },
  { label: "Roblox", url: "https://www.roblox.com/discover", kind: "game platform" },
  { label: "Duolingo", url: "https://www.duolingo.com/", kind: "education app" },
  { label: "Coursera", url: "https://www.coursera.org/", kind: "education marketplace" },
  { label: "Eventbrite", url: "https://www.eventbrite.com/d/online/all-events/", kind: "event marketplace" },
  { label: "Meetup", url: "https://www.meetup.com/find/", kind: "event community" },
  { label: "Yelp", url: "https://www.yelp.com/", kind: "local reviews" },
  { label: "Tripadvisor", url: "https://www.tripadvisor.com/", kind: "travel reviews" },
  { label: "Etsy", url: "https://www.etsy.com/c/home-and-living", kind: "marketplace" },
  { label: "Dropbox", url: "https://www.dropbox.com/", kind: "cloud storage" },
  { label: "Notion", url: "https://www.notion.com/", kind: "productivity app" },
  { label: "Mozilla", url: "https://www.mozilla.org/en-US/firefox/new/", kind: "browser nonprofit" },
  { label: "Pinterest", url: "https://www.pinterest.com/", kind: "social discovery" },
  { label: "Spotify", url: "https://open.spotify.com/", kind: "music streaming" },
  { label: "Medium", url: "https://medium.com/", kind: "publishing platform" },
  { label: "Substack", url: "https://substack.com/home", kind: "newsletter platform" },
  { label: "LinkedIn", url: "https://www.linkedin.com/", kind: "professional network" },
  { label: "Indeed", url: "https://www.indeed.com/", kind: "job marketplace" },
  { label: "Glassdoor", url: "https://www.glassdoor.com/", kind: "job reviews" },
  { label: "PayPal", url: "https://www.paypal.com/us/home", kind: "payments" },
  { label: "Shopify", url: "https://www.shopify.com/", kind: "commerce platform" },
  { label: "Uber", url: "https://www.uber.com/us/en/", kind: "rides and delivery" },
  { label: "DoorDash", url: "https://www.doordash.com/", kind: "delivery marketplace" },
  { label: "Instacart", url: "https://www.instacart.com/", kind: "grocery delivery" },
  { label: "Airbnb", url: "https://www.airbnb.com/", kind: "lodging marketplace" },
  { label: "Booking.com", url: "https://www.booking.com/", kind: "travel booking" },
  { label: "Expedia", url: "https://www.expedia.com/", kind: "travel booking" },
  { label: "Nike", url: "https://www.nike.com/", kind: "retail brand" },
  { label: "Sephora", url: "https://www.sephora.com/", kind: "retail beauty" },
  { label: "Wayfair", url: "https://www.wayfair.com/", kind: "retail home" },
  { label: "SHEIN", url: "https://us.shein.com/", kind: "fast fashion marketplace" },
  { label: "Temu", url: "https://www.temu.com/", kind: "marketplace" },
  { label: "Weather.com", url: "https://weather.com/", kind: "weather/media" },
  { label: "CNN", url: "https://www.cnn.com/", kind: "news media" },
  { label: "New York Times", url: "https://www.nytimes.com/", kind: "news media" },
  { label: "Fox News", url: "https://www.foxnews.com/", kind: "news media" },
  { label: "Facebook", url: "https://www.facebook.com/", kind: "social network" },
  { label: "Instagram", url: "https://www.instagram.com/", kind: "social app" },
  { label: "X", url: "https://x.com/explore", kind: "social app" },
  { label: "Snapchat", url: "https://www.snapchat.com/", kind: "social app" },
  { label: "Zoom", url: "https://www.zoom.com/", kind: "video conferencing" },
  { label: "Slack", url: "https://slack.com/", kind: "work chat" },
  { label: "Adobe", url: "https://www.adobe.com/", kind: "creative software" },
  { label: "Canva", url: "https://www.canva.com/", kind: "design app" },
  { label: "Salesforce", url: "https://www.salesforce.com/", kind: "enterprise software" },
  { label: "Atlassian", url: "https://www.atlassian.com/", kind: "work software" },
  { label: "Asana", url: "https://asana.com/", kind: "work software" },
  { label: "Verizon", url: "https://www.verizon.com/", kind: "telecom" },
  { label: "AT&T", url: "https://www.att.com/", kind: "telecom" },
  { label: "T-Mobile", url: "https://www.t-mobile.com/", kind: "telecom" },
  { label: "Bank of America", url: "https://www.bankofamerica.com/", kind: "banking" },
  { label: "Chase", url: "https://www.chase.com/", kind: "banking" },
  { label: "Wells Fargo", url: "https://www.wellsfargo.com/", kind: "banking" },
  { label: "Capital One", url: "https://www.capitalone.com/", kind: "banking" },
  { label: "CVS", url: "https://www.cvs.com/", kind: "pharmacy retail" },
  { label: "Walgreens", url: "https://www.walgreens.com/", kind: "pharmacy retail" },
  { label: "Home Depot", url: "https://www.homedepot.com/", kind: "retail home improvement" },
  { label: "Lowe's", url: "https://www.lowes.com/", kind: "retail home improvement" },
  { label: "Costco", url: "https://www.costco.com/", kind: "warehouse retail" },
  { label: "eBay", url: "https://www.ebay.com/", kind: "marketplace" },
  { label: "AliExpress", url: "https://www.aliexpress.us/", kind: "marketplace" },
  { label: "USPS", url: "https://www.usps.com/", kind: "shipping" },
  { label: "UPS", url: "https://www.ups.com/us/en/Home.page", kind: "shipping" },
  { label: "FedEx", url: "https://www.fedex.com/en-us/home.html", kind: "shipping" },
  { label: "Delta", url: "https://www.delta.com/", kind: "airline" },
  { label: "United Airlines", url: "https://www.united.com/en/us", kind: "airline" },
  { label: "Southwest", url: "https://www.southwest.com/", kind: "airline" },
  { label: "American Airlines", url: "https://www.aa.com/homePage.do", kind: "airline" },
  { label: "Marriott", url: "https://www.marriott.com/", kind: "hotel" },
  { label: "Hilton", url: "https://www.hilton.com/en/", kind: "hotel" },
  { label: "Disney+", url: "https://www.disneyplus.com/", kind: "streaming app" },
  { label: "Hulu", url: "https://www.hulu.com/", kind: "streaming app" },
  { label: "Max", url: "https://www.max.com/", kind: "streaming app" },
  { label: "Peacock", url: "https://www.peacocktv.com/", kind: "streaming app" },
  { label: "Paramount+", url: "https://www.paramountplus.com/", kind: "streaming app" },
  { label: "Roku", url: "https://www.roku.com/", kind: "streaming platform" },
  { label: "IMDb", url: "https://www.imdb.com/", kind: "media database" },
  { label: "Epic Games", url: "https://store.epicgames.com/en-US/", kind: "game store" },
  { label: "PlayStation", url: "https://www.playstation.com/en-us/", kind: "gaming platform" },
  { label: "Xbox", url: "https://www.xbox.com/en-US/", kind: "gaming platform" },
  { label: "Nintendo", url: "https://www.nintendo.com/us/", kind: "gaming platform" },
  { label: "McDonald's", url: "https://www.mcdonalds.com/us/en-us.html", kind: "restaurant" },
  { label: "Starbucks", url: "https://www.starbucks.com/", kind: "restaurant" },
  { label: "Chipotle", url: "https://www.chipotle.com/", kind: "restaurant" },
  { label: "Domino's", url: "https://www.dominos.com/", kind: "restaurant" },
  { label: "Kroger", url: "https://www.kroger.com/", kind: "grocery retail" },
  { label: "Macy's", url: "https://www.macys.com/", kind: "retail department store" },
  { label: "Kohl's", url: "https://www.kohls.com/", kind: "retail department store" },
  { label: "Nordstrom", url: "https://www.nordstrom.com/", kind: "retail department store" },
  { label: "IKEA", url: "https://www.ikea.com/us/en/", kind: "retail furniture" },
  { label: "H&M", url: "https://www2.hm.com/en_us/index.html", kind: "fashion retail" },
  { label: "Zara", url: "https://www.zara.com/us/", kind: "fashion retail" },
  { label: "UnitedHealthcare", url: "https://www.uhc.com/", kind: "health insurance" },
  { label: "Aetna", url: "https://www.aetna.com/", kind: "health insurance" },
  { label: "GoodRx", url: "https://www.goodrx.com/", kind: "health app" },
  { label: "WebMD", url: "https://www.webmd.com/", kind: "health content" },
  { label: "Venmo", url: "https://venmo.com/", kind: "payments" },
  { label: "Cash App", url: "https://cash.app/", kind: "payments" },
  { label: "Stripe", url: "https://stripe.com/", kind: "payments platform" },
  { label: "Robinhood", url: "https://robinhood.com/us/en/", kind: "finance app" },
  { label: "Fidelity", url: "https://www.fidelity.com/", kind: "investment" },
  { label: "Vanguard", url: "https://investor.vanguard.com/", kind: "investment" },
  { label: "Udemy", url: "https://www.udemy.com/", kind: "education marketplace" },
  { label: "edX", url: "https://www.edx.org/", kind: "education marketplace" },
  { label: "AWS", url: "https://aws.amazon.com/", kind: "cloud platform" },
  { label: "Cloudflare", url: "https://www.cloudflare.com/", kind: "cloud security" },
  { label: "DigitalOcean", url: "https://www.digitalocean.com/", kind: "cloud platform" },
  { label: "Figma", url: "https://www.figma.com/", kind: "design app" },
];

const FETCH_TIMEOUT_MS = 12000;
const FETCH_RETRY_DELAYS_MS = [500, 1500];
const MAX_CANDIDATES_TO_FETCH = 5;
const MIN_SUCCESS_SCORE = 13;

function compactText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value = "") {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "));
}

function stripHtmlToText(html = "") {
  return compactText(
    decodeEntities(
      String(html || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<(?:h[1-6]|p|li|tr|br|section|article|main|div)\b/gi, "\n<")
        .replace(/<[^>]*>/g, " ")
    )
  );
}

function attrValue(attrs = "", name = "") {
  const re = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const match = String(attrs || "").match(re);
  return decodeEntities((match?.[1] || "").replace(/^["']|["']$/g, ""));
}

function hostnameFromUrl(rawUrl = "") {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function isInsideFooterOrNav(html = "", index = 0) {
  const before = html.slice(0, index).toLowerCase();
  const footerStart = Math.max(before.lastIndexOf("<footer"), before.lastIndexOf("<nav"));
  const footerEnd = Math.max(before.lastIndexOf("</footer"), before.lastIndexOf("</nav"));
  return footerStart > footerEnd;
}

function extractTitle(html = "") {
  return compactText(stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
}

function extractH1(html = "") {
  return compactText(stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""));
}

function extractHeadings(html = "") {
  return Array.from(html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => compactText(stripTags(match[1] || "")))
    .filter(Boolean)
    .join(" ");
}

function extractLinks(html = "", baseUrl = "") {
  const links = [];

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] || "";
    const href = attrValue(attrs, "href");
    if (!href) continue;

    links.push({
      href,
      text: compactText(stripTags(match[2] || "")),
      ariaLabel: attrValue(attrs, "aria-label"),
      rel: attrValue(attrs, "rel"),
      title: attrValue(attrs, "title"),
      inFooterOrNav: isInsideFooterOrNav(html, match.index || 0),
      source: "page",
    });
  }

  for (const match of html.matchAll(/<(?:link|meta)\b([^>]*)>/gi)) {
    const attrs = match[1] || "";
    const rel = attrValue(attrs, "rel");
    const property = attrValue(attrs, "property");
    const name = attrValue(attrs, "name");
    const href = attrValue(attrs, "href") || attrValue(attrs, "content");
    const hay = `${rel} ${property} ${name} ${href}`;
    if (!/privacy|privacy-policy|privacy_notice|privacyNotice/i.test(hay)) continue;

    links.push({
      href,
      text: rel || property || name || "Privacy policy",
      title: "metadata",
      source: "meta",
      inFooterOrNav: false,
    });
  }

  const scriptLike = html.slice(0, 350000);
  const urlMatches = scriptLike.match(/https?:\\?\/\\?\/[^"'<>\\\s]+/gi) || [];
  for (const raw of urlMatches) {
    const href = raw
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/[)\]}.,;]+$/g, "");
    if (!/privacy|privacy-policy|privacy-notice|privacy-statement/i.test(href)) continue;

    links.push({
      href,
      text: "Privacy policy",
      title: "script data",
      source: "script",
      inFooterOrNav: false,
    });
  }

  return links.filter((link) => {
    try {
      new URL(link.href, baseUrl);
      return true;
    } catch {
      return false;
    }
  });
}

function candidateTypeFor(text = "", titleText = "", urlText = "") {
  const combined = `${text} ${titleText} ${urlText}`;
  const pageType = getPageType(text, titleText, urlText);

  if (pageType === "search") return "search";
  if (pageType === "policy-mention-only") return "policy_mention_only";
  if (/\bcookie preferences\b|\bcookie settings\b|\bmanage cookies\b|\bconsent preferences\b/i.test(combined)) {
    return "cookie_settings";
  }
  if (/\bprivacy choices\b|\bdo not sell\b|\btargeted advertising opt out\b|\blimit use of my sensitive personal information\b/i.test(combined)) {
    return "privacy_controls";
  }
  if (/\bhelp center\b|\bsupport\b|\blegal center\b/i.test(combined) || /\/support\b|\/help\b/i.test(urlText)) {
    return "support_or_legal_hub";
  }
  if (/\bprivacy policy\b|\bprivacy notice\b|\bprivacy statement\b/i.test(combined)) {
    return "privacy_policy";
  }
  if (/\bprivacy center\b|\bprivacy & security\b|\bprivacy and security\b|\bdata privacy\b|\btrust center\b|\bprivacy\b/i.test(combined)) {
    return "privacy_related";
  }
  return "unknown";
}

async function fetchHtml(url) {
  let lastError = null;

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
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
          "accept-language": "en-US,en;q=0.9",
          "upgrade-insecure-requests": "1",
        },
      });
      const html = await res.text();
      const result = {
        ok: res.ok,
        status: res.status,
        url: res.url || url,
        html,
        contentType: res.headers.get("content-type") || "",
      };

      if (![403, 408, 429, 500, 502, 503, 504].includes(result.status) || attempt === FETCH_RETRY_DELAYS_MS.length) {
        return result;
      }
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRY_DELAYS_MS.length) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt]));
  }

  throw lastError || new Error(`Unable to fetch ${url}`);
}

function getCandidateOrigins(pageUrl = "") {
  const origins = new Set();
  try {
    const url = new URL(pageUrl);
    const root = getRegistrableDomain(url.hostname);
    origins.add(`${url.origin}/`);
    if (root) {
      origins.add(`https://${root}/`);
      origins.add(`https://www.${root}/`);
    }
  } catch {}
  return Array.from(origins);
}

async function rootScanCandidates(pageUrl = "") {
  const out = [];

  for (const origin of getCandidateOrigins(pageUrl).slice(0, 3)) {
    try {
      const fetched = await fetchHtml(origin);
      if (!fetched.ok || !/html/i.test(fetched.contentType + fetched.html.slice(0, 1000))) {
        continue;
      }
      const host = hostnameFromUrl(pageUrl);
      const links = extractLinks(fetched.html, fetched.url).map((link) => ({
        ...link,
        source: "root-scan",
      }));
      out.push(...rankPolicyLinkCandidates(links, fetched.url, host));
    } catch {}
  }

  return out;
}

function commonPrivacyUrls(pageUrl = "") {
  const paths = [
    "/privacy",
    "/privacy/",
    "/privacy-policy",
    "/privacy-policy/",
    "/privacy-notice",
    "/privacy-notice/",
    "/privacy-statement",
    "/privacy-statement/",
    "/legal/privacy",
    "/legal/privacy/",
    "/policies/privacy",
    "/policy/privacy",
    "/about/privacy",
  ];
  const urls = new Set();

  for (const origin of getCandidateOrigins(pageUrl)) {
    for (const path of paths) {
      try {
        urls.add(new URL(path, origin).toString());
      } catch {}
    }
  }

  return Array.from(urls);
}

function mergeCandidates(candidates = []) {
  const byUrl = new Map();

  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.url);
    if (!previous || candidate.initialScore > previous.initialScore) {
      byUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(byUrl.values()).sort((a, b) => b.initialScore - a.initialScore);
}

function scoreFetchedCandidate(candidate, fetched, sourceHost = "") {
  const title = extractTitle(fetched.html);
  const h1 = extractH1(fetched.html);
  const headings = extractHeadings(fetched.html);
  const text = stripHtmlToText(fetched.html);
  const pageScore = scorePolicyPage(text, `${title} ${h1}`, fetched.url);
  const candidateType = candidateTypeFor(text, `${title} ${h1}`, fetched.url);
  const candidateHost = hostnameFromUrl(fetched.url);
  const validation = validatePolicyCandidate({
    text,
    titleText: title,
    h1Text: h1,
    url: fetched.url,
    pageType: getPageType(text, `${title} ${h1}`, fetched.url),
    candidateType,
    sourceHost,
    candidateHost,
  });
  const headingBoost = /information we collect|how we use|how we share|cookies|your rights|data retention/i.test(headings)
    ? 4
    : 0;
  const domainBoost =
    candidateHost === sourceHost
      ? 5
      : sameRegistrableDomain(candidateHost, sourceHost)
        ? 2
        : -6;
  const typeBoost =
    candidateType === "privacy_policy"
      ? 6
      : candidateType === "privacy_related"
        ? 1
        : ["privacy_controls", "support_or_legal_hub", "cookie_settings", "search", "policy_mention_only"].includes(candidateType)
          ? -12
          : 0;
  const finalScore = Math.round(
    candidate.initialScore + pageScore * 1.2 + domainBoost + typeBoost + headingBoost + validation.scoreAdjustment
  );

  return {
    ...candidate,
    fetched: true,
    fetchedUrl: fetched.url,
    finalScore,
    pageScore,
    candidateType,
    title,
    validation,
    textLength: text.length,
  };
}

async function evaluateSite(site) {
  const host = hostnameFromUrl(site.url);
  const registry = getKnownPolicyForHost(host);

  if (registry) {
    let fetchedRegistry = null;
    try {
      const fetched = await fetchHtml(registry.url);
      if (fetched.ok) {
        const text = stripHtmlToText(fetched.html);
        const title = extractTitle(fetched.html);
        fetchedRegistry = {
          ok: true,
          score: scorePolicyPage(text, title, fetched.url),
          title,
          finalUrl: fetched.url,
          length: text.length,
        };
      }
    } catch {}

    return {
      label: site.label,
      kind: site.kind,
      host,
      status:
        !fetchedRegistry || fetchedRegistry.score >= 13
          ? "PASS"
          : "FOUND_JS",
      source: "registry",
      policyUrl: registry.url,
      score: fetchedRegistry?.score ?? 40,
      confidence: fetchedRegistry ? classifyPageConfidence(fetchedRegistry.score) : "High",
      note: fetchedRegistry
        ? `registry candidate fetched: ${fetchedRegistry.title || "(no title)"}`
        : "registry candidate not fetched in live check",
    };
  }

  const page = await fetchHtml(site.url);
  if (!page.ok || !/html/i.test(page.contentType + page.html.slice(0, 1000))) {
    return {
      label: site.label,
      kind: site.kind,
      host,
      status: "BLOCKED",
      source: "fetch",
      policyUrl: "",
      score: 0,
      confidence: "Low",
      note: `page fetch status ${page.status}`,
    };
  }

  let ranked = rankPolicyLinkCandidates(extractLinks(page.html, page.url), page.url, host);

  if (ranked.length < 2) {
    ranked = mergeCandidates([...ranked, ...(await rootScanCandidates(page.url))]);
  }

  if (!ranked.length) {
    ranked = commonPrivacyUrls(page.url).map((url) => ({
      url,
      anchorText: "Common privacy URL",
      anchorTitle: "",
      initialScore: 0,
      source: "probed",
    }));
  }

  const fetchedCandidates = [];
  for (const candidate of ranked.slice(0, MAX_CANDIDATES_TO_FETCH)) {
    try {
      const fetched = await fetchHtml(candidate.url);
      if (!fetched.ok || !/html/i.test(fetched.contentType + fetched.html.slice(0, 1000))) {
        fetchedCandidates.push({
          ...candidate,
          fetched: false,
          finalScore: candidate.initialScore - 5,
          reason: `http_${fetched.status}`,
        });
        continue;
      }
      fetchedCandidates.push(scoreFetchedCandidate(candidate, fetched, host));
    } catch (error) {
      fetchedCandidates.push({
        ...candidate,
        fetched: false,
        finalScore: candidate.initialScore - 5,
        reason: `${error.name}: ${error.message}`,
      });
    }
  }

  fetchedCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const best = fetchedCandidates[0];
  const success = !!best && best.finalScore >= MIN_SUCCESS_SCORE;
  const weak = !!best && best.finalScore >= 8;

  return {
    label: site.label,
    kind: site.kind,
    host,
    status: success ? "PASS" : weak ? "CHECK" : "MISS",
    source: best?.source || "none",
    policyUrl: best?.fetchedUrl || best?.url || "",
    score: best?.finalScore || 0,
    confidence: best ? classifyPageConfidence(best.finalScore) : "Low",
    note: best
      ? `${best.anchorText || "(no text)"} | ${best.title || best.reason || ""}`.slice(0, 160)
      : "no candidate",
    candidates: fetchedCandidates.slice(0, 3).map((item) => ({
      url: item.fetchedUrl || item.url,
      score: item.finalScore,
      source: item.source,
      text: item.anchorText,
      type: item.candidateType || item.reason || "",
    })),
  };
}

async function run() {
  const sites = DEFAULT_SITES;
  const rows = [];

  for (const site of sites) {
    try {
      rows.push(await evaluateSite(site));
    } catch (error) {
      rows.push({
        label: site.label,
        kind: site.kind,
        host: hostnameFromUrl(site.url),
        status: "ERROR",
        source: "error",
        policyUrl: "",
        score: 0,
        confidence: "Low",
        note: compactText(`${error.name}: ${error.message}`),
      });
    }
  }

  console.table(
    rows.map(({ label, kind, host, status, source, score, confidence, policyUrl, note }) => ({
      site: label,
      kind,
      host,
      status,
      source,
      score,
      confidence,
      policyUrl,
      note,
    }))
  );

  const summary = rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    {}
  );

  console.log("\nSummary:", summary);

  const blockedRows = rows.filter((item) => ["BLOCKED", "ERROR"].includes(item.status));
  if (blockedRows.length) {
    console.log("\nBlocked/error details:");
    for (const row of blockedRows) {
      console.log(`- ${row.label}: ${row.status} ${row.policyUrl || "(none)"} | ${row.note}`);
    }
  }

  console.log("\nTop CHECK/MISS details:");
  for (const row of rows.filter((item) => !["PASS", "FOUND_JS", "BLOCKED"].includes(item.status))) {
    console.log(`- ${row.label}: ${row.status} ${row.policyUrl || "(none)"}`);
    for (const candidate of row.candidates || []) {
      console.log(
        `  candidate score=${candidate.score} source=${candidate.source} type=${candidate.type} text="${candidate.text || ""}" url=${candidate.url}`
      );
    }
  }
}

run();
