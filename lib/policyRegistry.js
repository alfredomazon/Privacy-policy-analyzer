import { normalizeHostname } from "./domainUtils.js";

const KNOWN_POLICY_SOURCES = [
  {
    id: "walmart",
    hosts: ["walmart.com", "*.walmart.com"],
    url: "https://corporate.walmart.com/privacy-security/walmart-privacy-notice",
    label: "Walmart Privacy Notice",
  },
  {
    id: "bestbuy",
    hosts: ["bestbuy.com", "*.bestbuy.com"],
    url: "https://www.bestbuy.com/site/help-topics/privacy-policy/pcmcat204400050062.c?id=pcmcat204400050062",
    label: "Best Buy Privacy Policy",
  },
  {
    id: "apple",
    hosts: ["apple.com", "*.apple.com"],
    url: "https://www.apple.com/legal/privacy/",
    label: "Apple Privacy Policy",
  },
  {
    id: "amazon",
    hosts: ["amazon.com", "*.amazon.com"],
    url: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
    label: "Amazon Privacy Notice",
  },
  {
    id: "target",
    hosts: ["target.com", "*.target.com"],
    url: "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
    label: "Target Privacy Policy",
  },
  {
    id: "netflix",
    hosts: ["netflix.com", "*.netflix.com"],
    url: "https://help.netflix.com/legal/privacy",
    label: "Netflix Privacy Statement",
  },
  {
    id: "tiktok",
    hosts: ["tiktok.com", "*.tiktok.com"],
    url: "https://www.tiktok.com/legal/page/us/privacy-policy/en",
    label: "TikTok Privacy Policy",
  },
  {
    id: "google",
    hosts: ["google.com", "*.google.com"],
    url: "https://policies.google.com/privacy",
    label: "Google Privacy Policy",
  },
  {
    id: "youtube",
    hosts: ["youtube.com", "*.youtube.com", "youtu.be", "*.youtu.be"],
    url: "https://policies.google.com/privacy?hl=en-US",
    label: "Google Privacy Policy for YouTube",
  },
  {
    id: "twitch",
    hosts: ["twitch.tv", "*.twitch.tv"],
    url: "https://legal.twitch.com/en/legal/privacy-notice/",
    label: "Twitch Privacy Notice",
  },
  {
    id: "crunchyroll",
    hosts: ["crunchyroll.com", "*.crunchyroll.com"],
    url: "https://www.sonypictures.com/corp/privacy.html",
    label: "Crunchyroll / Sony Pictures Privacy Policy",
  },
  {
    id: "nvidia",
    hosts: ["nvidia.com", "*.nvidia.com", "geforce.com", "*.geforce.com"],
    url: "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
    label: "NVIDIA Privacy Policy",
  },
  {
    id: "hp",
    hosts: ["hp.com", "*.hp.com"],
    url: "https://www.hp.com/us-en/privacy/ww-privacy.html",
    label: "HP Privacy Statement",
  },
  {
    id: "microsoft",
    hosts: ["microsoft.com", "*.microsoft.com", "live.com", "*.live.com"],
    url: "https://privacy.microsoft.com/en-us/privacystatement",
    label: "Microsoft Privacy Statement",
  },
  {
    id: "openai",
    hosts: ["chatgpt.com", "*.openai.com"],
    url: "https://openai.com/policies/privacy-policy/",
    label: "OpenAI Privacy Policy",
  },
  {
    id: "reddit",
    hosts: ["reddit.com", "*.reddit.com"],
    url: "https://redditinc.com/privacy",
    label: "Reddit Privacy Policy",
  },
  {
    id: "discord",
    hosts: ["discord.com", "*.discord.com"],
    url: "https://discord.com/privacy",
    label: "Discord Privacy Policy",
  },
  {
    id: "steam",
    hosts: [
      "steampowered.com",
      "*.steampowered.com",
      "steamcommunity.com",
      "*.steamcommunity.com",
    ],
    url: "https://store.steampowered.com/privacy_agreement/",
    label: "Steam Privacy Policy Agreement",
  },
  {
    id: "itch",
    hosts: ["itch.io", "*.itch.io"],
    url: "https://itch.io/docs/legal/privacy-policy",
    label: "itch.io Privacy Policy",
  },
  {
    id: "ao3",
    hosts: ["archiveofourown.org", "*.archiveofourown.org"],
    url: "https://archiveofourown.org/privacy",
    label: "Archive of Our Own Privacy Policy",
  },
  {
    id: "fandom",
    hosts: ["fandom.com", "*.fandom.com", "wikia.org", "*.wikia.org"],
    url: "https://www.fandom.com/privacy-policy-2025-10-13",
    label: "Fandom Privacy Policy",
  },
  {
    id: "patreon",
    hosts: ["patreon.com", "*.patreon.com"],
    url: "https://privacy.patreon.com/policies/en/",
    label: "Patreon Privacy Policy",
  },
  {
    id: "craigslist",
    hosts: ["craigslist.org", "*.craigslist.org"],
    url: "https://www.craigslist.org/about/privacy.policy",
    label: "Craigslist Privacy Policy",
  },
  {
    id: "coinbase",
    hosts: ["coinbase.com", "*.coinbase.com"],
    url: "https://www.coinbase.com/legal/privacy",
    label: "Coinbase Global Privacy Policy",
  },
  {
    id: "9gag",
    hosts: ["9gag.com", "*.9gag.com"],
    url: "https://about.9gag.com/privacy",
    label: "9GAG Privacy Policy",
  },
  {
    id: "quora",
    hosts: ["quora.com", "*.quora.com"],
    url: "https://www.quora.com/about/privacy",
    label: "Quora Privacy Policy",
  },
  {
    id: "khanacademy",
    hosts: ["khanacademy.org", "*.khanacademy.org"],
    url: "https://www.khanacademy.org/about/privacy-policy",
    label: "Khan Academy Privacy Policy",
  },
  {
    id: "openstreetmap",
    hosts: [
      "openstreetmap.org",
      "*.openstreetmap.org",
      "osmfoundation.org",
      "*.osmfoundation.org",
    ],
    url: "https://osmfoundation.org/wiki/Privacy_Policy",
    label: "OpenStreetMap Foundation Privacy Policy",
  },
  {
    id: "gutenberg",
    hosts: ["gutenberg.org", "*.gutenberg.org"],
    url: "https://www.gutenberg.org/policy/privacy_policy.html",
    label: "Project Gutenberg Privacy Policy",
  },
  {
    id: "github",
    hosts: ["github.com", "*.github.com"],
    url: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    label: "GitHub General Privacy Statement",
  },
  {
    id: "gitlab",
    hosts: ["gitlab.com", "*.gitlab.com"],
    url: "https://about.gitlab.com/privacy/",
    label: "GitLab Privacy Statement",
  },
  {
    id: "sourceforge",
    hosts: ["sourceforge.net", "*.sourceforge.net"],
    url: "https://slashdotmedia.com/privacy-statement/",
    label: "SourceForge / Slashdot Media Privacy Statement",
  },
  {
    id: "internet_archive",
    hosts: ["archive.org", "*.archive.org"],
    url: "https://archive.org/about/terms",
    label: "Internet Archive Terms of Use and Privacy Policy",
  },
  {
    id: "letterboxd",
    hosts: ["letterboxd.com", "*.letterboxd.com"],
    url: "https://letterboxd.com/legal/privacy-notice/",
    label: "Letterboxd Privacy Notice",
  },
  {
    id: "deviantart",
    hosts: ["deviantart.com", "*.deviantart.com", "sta.sh", "*.sta.sh"],
    url: "https://www.deviantart.com/about/policy/privacy",
    label: "DeviantArt Privacy Policy",
  },
  {
    id: "soundcloud",
    hosts: ["soundcloud.com", "*.soundcloud.com"],
    url: "https://pages.soundcloud.com/pages/privacy",
    label: "SoundCloud Privacy Policy",
  },
  {
    id: "tumblr",
    hosts: ["tumblr.com", "*.tumblr.com"],
    url: "https://www.tumblr.com/privacy",
    label: "Tumblr Privacy Policy",
  },
  {
    id: "bluesky",
    hosts: ["bsky.app", "*.bsky.app", "bsky.social", "*.bsky.social"],
    url: "https://bsky.social/about/support/privacy-policy",
    label: "Bluesky Privacy Policy",
  },
  {
    id: "mastodon",
    hosts: ["mastodon.social", "*.mastodon.social"],
    url: "https://mastodon.social/privacy-policy",
    label: "Mastodon Privacy Policy",
  },
  {
    id: "roblox",
    hosts: ["roblox.com", "*.roblox.com"],
    url: "https://en.help.roblox.com/hc/en-us/articles/115004630823-Roblox-Privacy-and-Cookie-Policy",
    label: "Roblox Privacy and Cookie Policy",
  },
  {
    id: "duolingo",
    hosts: ["duolingo.com", "*.duolingo.com"],
    url: "https://www.duolingo.com/privacy",
    label: "Duolingo Privacy Policy",
  },
  {
    id: "coursera",
    hosts: ["coursera.org", "*.coursera.org"],
    url: "https://www.coursera.org/about/privacy",
    label: "Coursera Privacy Notice",
  },
  {
    id: "eventbrite",
    hosts: ["eventbrite.com", "*.eventbrite.com"],
    url: "https://www.eventbrite.com/help/en-us/articles/460838/eventbrite-privacy-policy/",
    label: "Eventbrite Privacy Policy",
  },
  {
    id: "meetup",
    hosts: ["meetup.com", "*.meetup.com"],
    url: "https://www.meetup.com/privacy/",
    label: "Meetup Privacy Policy",
  },
  {
    id: "yelp",
    hosts: ["yelp.com", "*.yelp.com"],
    url: "https://terms.yelp.com/privacy/en_us/20220831_en_us/",
    label: "Yelp Privacy Policy",
  },
  {
    id: "tripadvisor",
    hosts: ["tripadvisor.com", "*.tripadvisor.com"],
    url: "https://tripadvisor.mediaroom.com/us-privacy-policy",
    label: "Tripadvisor Privacy and Cookies Statement",
  },
  {
    id: "etsy",
    hosts: ["etsy.com", "*.etsy.com"],
    url: "https://www.etsy.com/legal/privacy/",
    label: "Etsy Privacy Policy",
  },
  {
    id: "dropbox",
    hosts: ["dropbox.com", "*.dropbox.com"],
    url: "https://www.dropbox.com/privacy",
    label: "Dropbox Privacy Policy",
  },
  {
    id: "notion",
    hosts: ["notion.com", "*.notion.com", "notion.so", "*.notion.so"],
    url: "https://www.notion.com/trust/privacy-policy",
    label: "Notion Privacy Policy",
  },
  {
    id: "pinterest",
    hosts: ["pinterest.com", "*.pinterest.com"],
    url: "https://policy.pinterest.com/en/privacy-policy",
    label: "Pinterest Privacy Policy",
  },
  {
    id: "spotify",
    hosts: ["spotify.com", "*.spotify.com"],
    url: "https://www.spotify.com/us/legal/privacy-policy/",
    label: "Spotify Privacy Policy",
  },
  {
    id: "substack",
    hosts: ["substack.com", "*.substack.com"],
    url: "https://substack.com/privacy",
    label: "Substack Privacy Policy",
  },
  {
    id: "medium",
    hosts: ["medium.com", "*.medium.com"],
    url: "https://help.medium.com/hc/en-us/articles/213481328-Medium-Privacy-Policy",
    label: "Medium Privacy Policy",
  },
  {
    id: "linkedin",
    hosts: ["linkedin.com", "*.linkedin.com"],
    url: "https://www.linkedin.com/legal/privacy-policy",
    label: "LinkedIn Privacy Policy",
  },
  {
    id: "indeed",
    hosts: ["indeed.com", "*.indeed.com"],
    url: "https://hrtechprivacy.com/brands/indeed",
    label: "Indeed Privacy Notice",
  },
  {
    id: "glassdoor",
    hosts: ["glassdoor.com", "*.glassdoor.com"],
    url: "https://hrtechprivacy.com/brands/glassdoor",
    label: "Glassdoor Privacy Notice",
  },
  {
    id: "airbnb",
    hosts: ["airbnb.com", "*.airbnb.com"],
    url: "https://www.airbnb.com/help/article/3175",
    label: "Airbnb Privacy Policy",
  },
  {
    id: "sephora",
    hosts: ["sephora.com", "*.sephora.com"],
    url: "https://www.sephora.com/beauty/privacy-policy",
    label: "Sephora Privacy Policy",
  },
  {
    id: "shein",
    hosts: ["shein.com", "*.shein.com"],
    url: "https://us.shein.com/Consumer-Privacy-Notice-s-101.html",
    label: "SHEIN Consumer Privacy Notice",
  },
  {
    id: "temu",
    hosts: ["temu.com", "*.temu.com"],
    url: "https://www.temu.com/privacy-and-cookie-policy.html",
    label: "Temu Privacy Policy",
  },
  {
    id: "wayfair",
    hosts: [
      "wayfair.com",
      "*.wayfair.com",
      "allmodern.com",
      "*.allmodern.com",
      "birchlane.com",
      "*.birchlane.com",
      "jossandmain.com",
      "*.jossandmain.com",
      "perigold.com",
      "*.perigold.com",
    ],
    url: "https://www.wayfair.com/customerservice/general_info.php",
    label: "Wayfair Privacy Policy",
  },
  {
    id: "cnn",
    hosts: ["cnn.com", "*.cnn.com"],
    url: "https://www.cnn.com/privacy",
    label: "CNN Privacy Policy",
  },
  {
    id: "doordash",
    hosts: ["doordash.com", "*.doordash.com", "caviar.com", "*.caviar.com"],
    url: "https://help.doordash.com/legal/document?type=cx-privacy-policy&region=US&locale=en-US",
    label: "DoorDash Consumer Privacy Policy",
  },
  {
    id: "expedia",
    hosts: ["expedia.com", "*.expedia.com"],
    url: "https://www.expedia.com/legal/privacy",
    label: "Expedia Privacy Statement",
  },
  {
    id: "booking",
    hosts: ["booking.com", "*.booking.com"],
    url: "https://www.booking.com/content/privacy.html",
    label: "Booking.com Privacy Notice",
  },
  {
    id: "meta",
    hosts: [
      "facebook.com",
      "*.facebook.com",
      "instagram.com",
      "*.instagram.com",
      "threads.net",
      "*.threads.net",
    ],
    url: "https://www.facebook.com/privacy/policy/",
    label: "Meta Privacy Policy",
  },
  {
    id: "x",
    hosts: ["x.com", "*.x.com", "twitter.com", "*.twitter.com"],
    url: "https://x.com/en/privacy",
    label: "X Privacy Policy",
  },
  {
    id: "snapchat",
    hosts: ["snapchat.com", "*.snapchat.com", "snap.com", "*.snap.com"],
    url: "https://help.snapchat.com/hc/en-us/articles/18514005918612-Privacy-Policy",
    label: "Snap Privacy Policy",
  },
  {
    id: "adobe",
    hosts: ["adobe.com", "*.adobe.com"],
    url: "https://www.adobe.com/privacy/policy.html",
    label: "Adobe Privacy Policy",
  },
  {
    id: "canva",
    hosts: ["canva.com", "*.canva.com"],
    url: "https://www.canva.com/policies/privacy-policy/",
    label: "Canva Privacy Policy",
  },
  {
    id: "att",
    hosts: ["att.com", "*.att.com"],
    url: "https://about.att.com/privacy/full_privacy_policy.html",
    label: "AT&T Privacy Notice",
  },
  {
    id: "bankofamerica",
    hosts: [
      "bankofamerica.com",
      "*.bankofamerica.com",
      "bofa.com",
      "*.bofa.com",
    ],
    url: "https://www.bankofamerica.com/security-center/online-privacy-notice/",
    label: "Bank of America Online Privacy Notice",
  },
  {
    id: "wellsfargo",
    hosts: ["wellsfargo.com", "*.wellsfargo.com"],
    url: "https://www.wellsfargo.com/privacy-security/online/",
    label: "Wells Fargo Digital Privacy and Cookies Policy",
  },
  {
    id: "lowes",
    hosts: ["lowes.com", "*.lowes.com"],
    url: "https://www.lowes.com/l/about/privacy-and-security-statement",
    label: "Lowe's U.S. Privacy Statement",
  },
  {
    id: "costco",
    hosts: ["costco.com", "*.costco.com"],
    url: "https://www.costco.com/privacy-policy.html",
    label: "Costco Privacy Notice",
  },
  {
    id: "aliexpress",
    hosts: [
      "aliexpress.com",
      "*.aliexpress.com",
      "aliexpress.us",
      "*.aliexpress.us",
    ],
    url: "https://terms.alicdn.com/legal-agreement/terms/suit_bu1_aliexpress/suit_bu1_aliexpress201909171350_82407_9_6_24275.html",
    label: "AliExpress Privacy Policy",
  },
  {
    id: "ups",
    hosts: ["ups.com", "*.ups.com"],
    url: "https://www.ups.com/us/en/help-center/legal-terms-conditions/privacy-notice.page",
    label: "UPS Privacy Notice",
  },
  {
    id: "united",
    hosts: ["united.com", "*.united.com"],
    url: "https://www.united.com/en/us/fly/privacy-policy.html",
    label: "United Airlines Privacy Policy",
  },
  {
    id: "american_airlines",
    hosts: ["aa.com", "*.aa.com"],
    url: "https://www.aa.com/pubcontent/en_US/customer-service/support/privacy-policy.html",
    label: "American Airlines Privacy Policy",
  },
  {
    id: "hilton",
    hosts: ["hilton.com", "*.hilton.com"],
    url: "https://www.hilton.com/en/p/global-privacy-statement",
    label: "Hilton Global Privacy Statement",
  },
  {
    id: "disney",
    hosts: [
      "disneyplus.com",
      "*.disneyplus.com",
      "hulu.com",
      "*.hulu.com",
      "disney.com",
      "*.disney.com",
    ],
    url: "https://privacy.thewaltdisneycompany.com/en/current-privacy-policy/",
    label: "The Walt Disney Company Privacy Policy",
  },
  {
    id: "max",
    hosts: ["max.com", "*.max.com", "hbomax.com", "*.hbomax.com"],
    url: "https://www.hbomax.com/privacy",
    label: "HBO Max Privacy Policy",
  },
  {
    id: "peacock",
    hosts: ["peacocktv.com", "*.peacocktv.com"],
    url: "https://www.nbcuniversalprivacy.com/privacy?brandA=Peacock&intake=Peacock",
    label: "NBCUniversal Privacy Policy for Peacock",
  },
  {
    id: "xbox",
    hosts: ["xbox.com", "*.xbox.com"],
    url: "https://www.microsoft.com/en-us/privacy/privacystatement",
    label: "Microsoft Privacy Statement for Xbox",
  },
  {
    id: "nordstrom",
    hosts: [
      "nordstrom.com",
      "*.nordstrom.com",
      "nordstromrack.com",
      "*.nordstromrack.com",
    ],
    url: "https://www.nordstrom.com/browse/customer-service/policy/privacy?cid=00000",
    label: "Nordstrom Privacy Policy",
  },
  {
    id: "zara",
    hosts: ["zara.com", "*.zara.com"],
    url: "https://www.zara.com/static/pdfs/US/privacy-policy/privacy-policy_en_US-20241209.html",
    label: "Zara Privacy Policy",
  },
  {
    id: "unitedhealthcare",
    hosts: [
      "uhc.com",
      "*.uhc.com",
      "unitedhealthcare.com",
      "*.unitedhealthcare.com",
    ],
    url: "https://www.unitedhealthgroup.com/privacy.html",
    label: "UnitedHealth Group Online Services Privacy Policy",
  },
  {
    id: "vanguard",
    hosts: ["vanguard.com", "*.vanguard.com"],
    url: "https://investor.vanguard.com/privacy-center/personal-investor-privacy-notice",
    label: "Vanguard Personal Investor Privacy Notice",
  },
  {
    id: "fidelity",
    hosts: ["fidelity.com", "*.fidelity.com"],
    url: "https://www.fidelity.com/privacy/overview",
    label: "Fidelity Privacy Overview",
  },
  {
    id: "kroger",
    hosts: ["kroger.com", "*.kroger.com"],
    url: "https://www.kroger.com/i/privacy-policy/",
    label: "Kroger Privacy Notice",
  },
  {
    id: "kohls",
    hosts: ["kohls.com", "*.kohls.com"],
    url: "https://www.kohls.com/feature/privacy-policy.jsp",
    label: "Kohl's Privacy Policy",
  },
  {
    id: "hm",
    hosts: ["hm.com", "*.hm.com"],
    url: "https://www2.hm.com/en_us/customer-service/legal-and-privacy/privacy-link.html",
    label: "H&M Privacy Notice",
  },
  {
    id: "goodrx",
    hosts: ["goodrx.com", "*.goodrx.com"],
    url: "https://www.goodrx.com/about/privacy-policy",
    label: "GoodRx Privacy Policy",
  },
  {
    id: "udemy",
    hosts: ["udemy.com", "*.udemy.com"],
    url: "https://www.udemy.com/terms/privacy/",
    label: "Udemy Privacy Policy",
  },
  {
    id: "aws",
    hosts: ["aws.amazon.com", "*.aws.amazon.com"],
    url: "https://aws.amazon.com/privacy/",
    label: "AWS Privacy Notice",
  },
  {
    id: "paramount",
    hosts: ["paramountplus.com", "*.paramountplus.com", "paramount.com", "*.paramount.com"],
    url: "https://privacy.paramount.com/en/policy?r=www.viacomprivacy.com",
    label: "Paramount Privacy Policy",
  },
  {
    id: "roku",
    hosts: ["roku.com", "*.roku.com"],
    url: "https://docs.roku.com/api/v1/published/userprivacypolicy/en/us",
    label: "Roku Privacy Policy",
  },
  {
    id: "imdb",
    hosts: ["imdb.com", "*.imdb.com"],
    url: "https://www.imdb.com/privacy/",
    label: "IMDb Privacy Notice",
  },
  {
    id: "epicgames",
    hosts: ["epicgames.com", "*.epicgames.com"],
    url: "https://legal.epicgames.com/epicgames/privacy-policy",
    label: "Epic Games Privacy Policy",
  },
  {
    id: "cloudflare",
    hosts: ["cloudflare.com", "*.cloudflare.com"],
    url: "https://www.cloudflare.com/privacypolicy/",
    label: "Cloudflare Privacy Policy",
  },
  {
    id: "digitalocean",
    hosts: ["digitalocean.com", "*.digitalocean.com"],
    url: "https://www.digitalocean.com/legal/privacy-policy",
    label: "DigitalOcean Privacy Policy",
  },
  {
    id: "figma",
    hosts: ["figma.com", "*.figma.com"],
    url: "https://www.figma.com/legal/privacy/",
    label: "Figma Privacy Policy",
  },
  {
    id: "instructure",
    hosts: ["*.instructure.com", "*.canvaslms.com"],
    url: "https://www.instructure.com/policies/privacy",
    label: "Instructure Privacy Policy",
  },
];

function normalizeHost(hostname = "") {
  return normalizeHostname(hostname);
}

function hostMatchesPattern(host, pattern) {
  const safePattern = normalizeHost(pattern);

  if (safePattern.startsWith("*.")) {
    const base = safePattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }

  return host === safePattern;
}

function getPatternSpecificity(host, pattern) {
  const safePattern = normalizeHost(pattern);
  if (!hostMatchesPattern(host, pattern)) return -1;

  if (safePattern.startsWith("*.")) {
    return safePattern.slice(2).length + 100;
  }

  return safePattern.length + 1000;
}

export function getKnownPolicyForHost(hostname = "") {
  const host = normalizeHost(hostname);
  if (!host) return null;

  let best = null;

  for (const source of KNOWN_POLICY_SOURCES) {
    for (const pattern of source.hosts) {
      const specificity = getPatternSpecificity(host, pattern);
      if (specificity < 0) continue;
      if (!best || specificity > best.specificity) {
        best = { source, specificity };
      }
    }
  }

  if (!best) return null;

  return {
    id: best.source.id,
    url: best.source.url,
    label: best.source.label,
    source: "known-domain",
  };
}

export function hasKnownPolicyForHost(hostname = "") {
  return !!getKnownPolicyForHost(hostname);
}

export { KNOWN_POLICY_SOURCES };
