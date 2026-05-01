import { benchmarkCases } from "../benchmarks/privacy-benchmark.mjs";
import { analyzePolicy } from "../lib/policyAnalyzer.js";
import { splitIntoSentences } from "../lib/policyGrabber.js";
import { scorePolicyPage, classifyPageConfidence } from "../lib/policyDetector.js";
import { computeFromHeuristic, scoreToLevel } from "../lib/finalScore.js";
import { classifyTrackerUrl } from "../lib/trackerRegistry.js";
import { rankPolicyLinkCandidates } from "../lib/policyLinkFinder.js";
import { getKnownPolicyForHost } from "../lib/policyRegistry.js";

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function buildTrackerSignals(networkUrls = [], pageHostname = "") {
  const hits = uniqueBy(
    networkUrls
      .map((url) =>
        classifyTrackerUrl({
          url,
          pageHostname,
          sourceType: "network",
          requestType: "script",
        })
      )
      .filter(Boolean),
    (hit) => `${hit.id}|${hit.hostname}`
  );

  const high = hits.filter((hit) => hit.severity === "high").length;
  const medium = hits.filter((hit) => hit.severity === "medium").length;
  const riskScore = Math.min(100, high * 28 + medium * 10);
  const riskLevel =
    riskScore >= 55 ? "high" : riskScore >= 24 ? "medium" : "low";
  const vendors = uniqueBy(hits, (hit) => hit.vendor).map((hit) => ({
    vendor: hit.vendor,
    severity: hit.severity,
    impactReasons: [
      hit.category === "sharing" ? "cross_site_ads" : "analytics_measurement",
    ],
  }));

  return {
    trackerHits: hits,
    groups: {
      knownTrackers: hits,
      storage: [],
      forms: [],
      fingerprinting: [],
      thirdParty: [],
      vendors,
    },
    summary: {
      confidence: riskLevel,
      riskScore,
      riskLevel,
      topVendors: vendors.map((item) => item.vendor),
      counts: {
        knownTrackers: hits.length,
        vendors: vendors.length,
        highImpact: high,
      },
    },
    riskScore,
    riskLevel,
  };
}

function analyzeCase(item) {
  if (item.linkCandidates) {
    const ranked = rankPolicyLinkCandidates(
      item.linkCandidates,
      item.pageUrl || `https://${item.host}/`,
      item.host
    );

    return {
      kind: "link",
      bestPolicyLink: ranked[0]?.url || "",
      rankedCount: ranked.length,
    };
  }

  if (item.expected?.registryUrl) {
    return {
      kind: "registry",
      registryUrl: getKnownPolicyForHost(item.host)?.url || "",
    };
  }

  const policyText = item.policyText || "";
  const sentences = splitIntoSentences(policyText);
  const analysis = policyText
    ? analyzePolicy(sentences)
    : { findings: [], dataCollected: {}, dataEvidence: {} };
  const pageScore = policyText
    ? scorePolicyPage(policyText, item.policyUrl || "", item.policyUrl || "")
    : 0;
  const trackerSignals = buildTrackerSignals(item.networkUrls || [], item.host);
  const isLikelyPolicyPage =
    typeof item.isLikelyPolicyPage === "boolean"
      ? item.isLikelyPolicyPage
      : policyText.length > 0;
  const heuristic = {
    ...analysis,
    isLikelyPolicyPage,
    pageScore,
    policyPageScore: pageScore,
    pageConfidence: classifyPageConfidence(pageScore),
    pageType: isLikelyPolicyPage ? "normal" : "page",
    analyzedPolicyUrl: item.policyUrl || "",
    policySourceType: isLikelyPolicyPage ? "linked-policy" : "page-fallback",
    trackerSignals,
  };
  const toolbar = computeFromHeuristic(heuristic);
  const counted = analysis.findings.filter((finding) => finding.countAsRisk);

  return {
    kind: "analysis",
    level: scoreToLevel(toolbar.score),
    score: toolbar.score,
    summary: toolbar.summary,
    countedRiskCount: counted.length,
    countedCategories: counted.map((finding) => finding.category),
    countedTitles: counted.map((finding) => finding.title),
    trackerLevel: trackerSignals.riskLevel,
    trackerCount: trackerSignals.trackerHits.length,
  };
}

function evaluateExpectation(item, actual) {
  const expected = item.expected || {};
  const failures = [];

  if (expected.level && actual.level !== expected.level) {
    failures.push(`level expected ${expected.level}, got ${actual.level}`);
  }

  if (
    expected.maxCountedRisks != null &&
    actual.countedRiskCount > expected.maxCountedRisks
  ) {
    failures.push(
      `counted risks expected <= ${expected.maxCountedRisks}, got ${actual.countedRiskCount}`
    );
  }

  for (const category of expected.includeCategories || []) {
    if (!actual.countedCategories?.includes(category)) {
      failures.push(`missing counted category ${category}`);
    }
  }

  for (const category of expected.excludeCategories || []) {
    if (actual.countedCategories?.includes(category)) {
      failures.push(`unexpected counted category ${category}`);
    }
  }

  for (const titlePart of expected.includeTitleParts || []) {
    const found = (actual.countedTitles || []).some((title) =>
      title.toLowerCase().includes(titlePart.toLowerCase())
    );
    if (!found) failures.push(`missing title containing "${titlePart}"`);
  }

  if (expected.trackerLevel && actual.trackerLevel !== expected.trackerLevel) {
    failures.push(
      `tracker level expected ${expected.trackerLevel}, got ${actual.trackerLevel}`
    );
  }

  if (
    expected.minTrackerCount != null &&
    actual.trackerCount < expected.minTrackerCount
  ) {
    failures.push(
      `tracker count expected >= ${expected.minTrackerCount}, got ${actual.trackerCount}`
    );
  }

  if (
    expected.bestPolicyLink != null &&
    actual.bestPolicyLink !== expected.bestPolicyLink
  ) {
    failures.push(
      `best policy link expected "${expected.bestPolicyLink}", got "${actual.bestPolicyLink}"`
    );
  }

  if (expected.registryUrl && actual.registryUrl !== expected.registryUrl) {
    failures.push(
      `registry URL expected "${expected.registryUrl}", got "${actual.registryUrl}"`
    );
  }

  return failures;
}

const rows = [];
let failures = 0;

for (const item of benchmarkCases) {
  const actual = analyzeCase(item);
  const caseFailures = evaluateExpectation(item, actual);
  failures += caseFailures.length ? 1 : 0;
  rows.push({ item, actual, failures: caseFailures });
}

for (const row of rows) {
  const status = row.failures.length ? "FAIL" : "PASS";
  const parts = [`${status} ${row.item.name}`];

  if (row.actual.kind === "analysis") {
    parts.push(
      `eye=${row.actual.level}`,
      `score=${row.actual.score}`,
      `risks=${row.actual.countedRiskCount}`,
      `trackers=${row.actual.trackerLevel}/${row.actual.trackerCount}`
    );
  } else if (row.actual.kind === "link") {
    parts.push(`bestPolicyLink=${row.actual.bestPolicyLink || "(none)"}`);
  } else if (row.actual.kind === "registry") {
    parts.push(`registryUrl=${row.actual.registryUrl || "(none)"}`);
  }

  console.log(parts.join(" | "));

  for (const failure of row.failures) {
    console.log(`  - ${failure}`);
  }
}

console.log("");
console.log(
  `${benchmarkCases.length} benchmark case${benchmarkCases.length === 1 ? "" : "s"} run, ` +
    `${failures} failed.`
);

if (failures > 0) {
  process.exitCode = 1;
}
