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

export function getKnownPolicyForHost(hostname = "") {
  const host = normalizeHost(hostname);
  if (!host) return null;

  const entry = KNOWN_POLICY_SOURCES.find((source) =>
    source.hosts.some((pattern) => hostMatchesPattern(host, pattern))
  );

  if (!entry) return null;

  return {
    id: entry.id,
    url: entry.url,
    label: entry.label,
    source: "known-domain",
  };
}

export function hasKnownPolicyForHost(hostname = "") {
  return !!getKnownPolicyForHost(hostname);
}

export { KNOWN_POLICY_SOURCES };
