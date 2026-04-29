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
