const COMMON_MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "co.jp",
  "co.kr",
  "com.sg",
  "com.tr",
  "co.in",
  "com.cn",
  "com.hk",
  "com.ar",
  "co.za",
]);

export function normalizeHostname(hostname = "") {
  return String(hostname || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./i, "")
    .toLowerCase();
}

export function getRegistrableDomain(hostname = "") {
  const host = normalizeHostname(hostname);
  const parts = host.split(".").filter(Boolean);

  if (parts.length <= 2) return host;

  const suffix2 = parts.slice(-2).join(".");
  if (COMMON_MULTI_PART_SUFFIXES.has(suffix2) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

export function sameRegistrableDomain(a = "", b = "") {
  const left = getRegistrableDomain(a);
  const right = getRegistrableDomain(b);
  return !!left && !!right && left === right;
}

export function getDomainBrandToken(hostname = "") {
  const domain = getRegistrableDomain(hostname);
  const first = domain.split(".")[0] || "";
  return first.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}
