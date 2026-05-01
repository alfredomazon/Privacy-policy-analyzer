import test from "node:test";
import assert from "node:assert/strict";

import { analyzePolicy, extractPolicyQuality } from "../lib/policyAnalyzer.js";

function titles(result) {
  return result.findings.map((finding) => finding.title);
}

test("does not flag negated sale language as a finding", () => {
  const result = analyzePolicy(["We do not sell your personal information."]);

  assert.deepEqual(result.findings, []);
});

test("does not explode unrelated categories from a targeted advertising negation", () => {
  const result = analyzePolicy([
    "We do not use your information for targeted advertising.",
  ]);

  const findingTitles = titles(result);

  assert.equal(findingTitles.includes("Uses tracking technologies"), false);
  assert.equal(findingTitles.includes("Collects biometric information"), false);
  assert.equal(findingTitles.includes("Collects payment or financial data"), false);
  assert.equal(findingTitles.includes("Collects location data"), false);
  assert.equal(findingTitles.includes("References children or minors"), false);
});

test("does not flag denied sensitive ad targeting as a policy risk", () => {
  const result = analyzePolicy([
    "We don’t show you personalized ads based on sensitive categories, such as race, religion, sexual orientation, or health.",
  ]);

  const counted = result.findings.filter((finding) => finding.countAsRisk);
  const sensitive = result.findings.find(
    (finding) => finding.category === "sensitive"
  );
  const tracking = result.findings.find(
    (finding) => finding.category === "tracking"
  );

  assert.equal(sensitive, undefined);
  assert.equal(tracking, undefined);
  assert.equal(counted.length, 0);
});

test("does not count denial or student privacy sale language as active sale", () => {
  const result = analyzePolicy([
    "Google does not sell your personal information.",
    "We will not sell or rent student personal data, and we will not use or share student personal data for advertising or similar commercial purposes.",
  ]);

  const sale = result.findings.find((finding) => finding.category === "sale");
  const counted = result.findings.filter((finding) => finding.countAsRisk);

  assert.equal(sale?.countAsRisk || false, false);
  assert.equal(counted.length, 0);
});

test("does not treat legal disclosure tables as active sale", () => {
  const result = analyzePolicy([
    "The categories of third parties to whom we disclose, sell, or share personal information are described below.",
    "The categories of personal information sold or shared include identifiers and internet activity.",
  ]);

  const sale = result.findings.find((finding) => finding.category === "sale");
  const counted = result.findings.filter((finding) => finding.countAsRisk);

  assert.equal(sale?.countAsRisk || false, false);
  assert.equal(counted.length, 0);
});

test("does not count denied data-broker language as outside-source risk", () => {
  const result = analyzePolicy([
    "We collect the least amount of data possible while maintaining safety measures and the effective operation of the platform.",
    "Reddit never sells private data, and we never work with data brokers.",
  ]);

  const external = result.findings.find(
    (finding) => finding.category === "external_data"
  );
  const counted = result.findings.filter((finding) => finding.countAsRisk);

  assert.equal(external?.countAsRisk || false, false);
  assert.equal(counted.length, 0);
});

test("does not treat cookie text files as uploaded user files", () => {
  const result = analyzePolicy([
    "We use cookies, which are text files placed on your computer, and similar technologies to analyze how users use our services.",
  ]);

  const content = result.findings.find(
    (finding) => finding.category === "contacts_content"
  );

  assert.equal(content, undefined);
});

test("does not count emergency or privacy-rights verification as sensitive collection", () => {
  const result = analyzePolicy([
    "We may collect or share personal data if we think someone's life is in danger, for example to help resolve an urgent medical situation.",
    "We will need to confirm your identity before processing your request by asking you for additional information, such as a government issued ID.",
  ]);

  const counted = result.findings.filter((finding) => finding.countAsRisk);

  assert.equal(counted.length, 0);
});

test("does not count no-access cookie language as tracking", () => {
  const result = analyzePolicy([
    "AO3 has no access to cookies set by other sites.",
  ]);

  const tracking = result.findings.find(
    (finding) => finding.category === "tracking"
  );

  assert.equal(tracking, undefined);
});

test("still counts direct targeted advertising sharing as sale or sharing", () => {
  const result = analyzePolicy([
    "We may share your personal information with advertising partners for targeted advertising and cross-context behavioral advertising.",
  ]);

  const sale = result.findings.find((finding) => finding.category === "sale");

  assert.ok(sale);
  assert.equal(sale.countAsRisk, true);
  assert.equal(sale.severity, "high");
  assert.equal(sale.priorityReason, "sale-or-sharing");
});

test("downgrades operational service-provider sharing", () => {
  const result = analyzePolicy([
    "We may share information with service providers that help operate the service.",
  ]);

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].title, "Shares data with third parties");
  assert.equal(result.findings[0].countAsRisk, false);
});

test("extracts plausible findings from a policy-like sample", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "Information we collect includes your name, email address, and IP address.",
    "Cookies",
    "We use analytics and cookies to understand usage and improve the service.",
    "How We Share",
    "We may share personal information with service providers and advertising partners.",
    "You may request deletion or access to your personal information.",
  ]);

  const findingTitles = titles(result);

  assert.ok(findingTitles.includes("Uses tracking technologies"));
  assert.ok(findingTitles.includes("Collects identifying information"));
  assert.ok(findingTitles.includes("Shares data with third parties"));
  assert.equal(findingTitles.includes("Collects biometric information"), false);

  const tracking = result.findings.find((finding) => finding.category === "tracking");
  assert.ok(tracking.ruleId.startsWith("tracking."));
  assert.ok(tracking.sections.includes("tracking"));
});

test("extracts structured policy practices", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "We collect your name, email address, IP address, payment information, and device information.",
    "How We Use Information",
    "We use your information to provide the service, process your orders, improve the service, prevent fraud, and send you marketing messages.",
    "How We Share Information",
    "We may disclose your personal information to service providers, affiliates, analytics providers, and advertising partners.",
    "Your Rights",
    "You may access, correct, or delete your information and opt out of targeted advertising.",
    "Data Retention",
    "We retain your information for as long as necessary to provide the service and comply with legal obligations.",
  ]);

  const practiceKeys = (items) => items.map((item) => item.key);

  assert.ok(practiceKeys(result.practices.dataTypes).includes("identifiers"));
  assert.ok(practiceKeys(result.practices.dataTypes).includes("payment_financial"));
  assert.ok(practiceKeys(result.practices.purposes).includes("provide_service"));
  assert.ok(practiceKeys(result.practices.purposes).includes("advertising"));
  assert.ok(practiceKeys(result.practices.recipients).includes("service_providers"));
  assert.ok(practiceKeys(result.practices.recipients).includes("advertising_partners"));
  assert.ok(practiceKeys(result.practices.controls).includes("delete"));
  assert.equal(result.practices.retention.present, true);
  assert.equal(result.practices.retention.vague, true);
  assert.equal(result.practices.retention.quality, "vague");
});

test("keeps evidence focused on the matched sensitive term", () => {
  const result = analyzePolicy([
    "Categories of Information Collected: The following categories of information may be collected when you use the service, create an account, contact support, or interact with certain features, including account details, device data, and biometric information such as face geometry.",
  ]);

  const biometric = result.findings.find((finding) => finding.category === "biometric");

  assert.ok(biometric);
  assert.match(biometric.evidence[0], /biometric/i);
  assert.doesNotMatch(biometric.evidence[0], /^Categories of Information Collected/i);
});

test("keeps finding evidence as readable complete sentences", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "We may share your personal information with advertising partners for targeted advertising and cross-context behavioral advertising.",
  ]);

  const tracking = result.findings.find((finding) => finding.category === "tracking");

  assert.ok(tracking);
  assert.equal(tracking.evidence[0].includes("..."), false);
  assert.equal(tracking.evidence[0].includes("…"), false);
  assert.match(tracking.evidence[0], /\.$/);
  assert.match(tracking.evidence[0], /^We may share your personal information/i);
});

test("detects mixed sale and targeted-ad disclosures", () => {
  const quality = extractPolicyQuality([
    "We do not sell your personal information.",
    "We may share personal information with advertising partners for targeted advertising.",
  ]);

  assert.ok(
    quality.mixedDisclosures.some((item) => item.type === "sale_ad_sharing")
  );
  assert.match(quality.mixedDisclosures[0].evidence.join(" "), /targeted advertising/i);
});

test("grades retention as specific, vague, or missing", () => {
  const specific = analyzePolicy([
    "Data Retention",
    "We retain account logs for up to 30 days after your account is closed.",
  ]);
  const vague = analyzePolicy([
    "Data Retention",
    "We retain information for as long as necessary for business purposes.",
  ]);
  const missing = analyzePolicy([
    "Privacy Policy",
    "We collect your name and email address to provide the service.",
  ]);

  assert.equal(specific.quality.retention.quality, "specific");
  assert.equal(specific.quality.retention.specific, true);
  assert.equal(vague.quality.retention.quality, "vague");
  assert.equal(missing.quality.retention.quality, "missing");
});

test("extracts privacy rights and jurisdiction coverage", () => {
  const result = analyzePolicy([
    "Your Privacy Rights",
    "California residents may access, delete, correct, and opt out of sale or sharing.",
    "Residents of the EEA and United Kingdom may exercise GDPR rights and request data portability.",
    "Colorado residents may appeal a denied request.",
  ]);

  const jurisdictionKeys = result.quality.rights.jurisdictions.map((item) => item.key);
  const rightKeys = result.quality.rights.rights.map((item) => item.key);

  assert.ok(jurisdictionKeys.includes("california"));
  assert.ok(jurisdictionKeys.includes("eea_uk"));
  assert.ok(jurisdictionKeys.includes("colorado"));
  assert.ok(rightKeys.includes("delete"));
  assert.ok(rightKeys.includes("portability"));
  assert.ok(rightKeys.includes("appeal"));
});

test("tracks user-action dependent data collection", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "We collect payment information when you make a purchase.",
    "You may upload photos or files if you choose to provide them.",
  ]);

  const financial = result.findings.find((finding) => finding.category === "financial");
  const dependencyKeys = result.quality.actionDependencies.map((item) => item.key);

  assert.ok(financial);
  assert.equal(financial.actionDependent, true);
  assert.equal(financial.severity, "medium");
  assert.ok(dependencyKeys.includes("purchase"));
  assert.ok(dependencyKeys.includes("upload"));
});

test("keeps expected payment collection medium but elevates secondary payment use", () => {
  const expected = analyzePolicy([
    "Information We Collect",
    "We collect payment information when you make a purchase to process your order.",
  ]);
  const secondary = analyzePolicy([
    "Information We Collect",
    "We collect payment information and transaction history for advertising, profiling, and commercial purposes.",
  ]);

  const expectedFinancial = expected.findings.find(
    (finding) => finding.category === "financial"
  );
  const secondaryFinancial = secondary.findings.find(
    (finding) => finding.category === "financial"
  );

  assert.ok(expectedFinancial);
  assert.equal(expectedFinancial.severity, "medium");
  assert.equal(expectedFinancial.priorityReason, "expected-operational");
  assert.equal(expectedFinancial.normalOperationalUse, true);
  assert.equal(expectedFinancial.countAsRisk, false);
  assert.ok(secondaryFinancial);
  assert.equal(secondaryFinancial.severity, "high");
  assert.equal(secondaryFinancial.priorityReason, "secondary-use");
  assert.equal(secondaryFinancial.countAsRisk, true);
});

test("keeps ordinary payment evidence concise even when policy text is stitched", () => {
  const result = analyzePolicy([
    "We also collect details of communications that we send you (such as via email, push notifications, text message, or within the Netflix service), and information about your interaction with these communications.Where We Collect Personal Information FromWe collect your personal information from the following sources: Directly from you: When you register with the Netflix service, update your Netflix account or profile, purchase products or services from us, correspond with us, or respond to our surveys, you may provide (and we will collect) the following categories of personal information: personal details, payment details, purchase information, Netflix account/profile information, and communications.Automatically when you use our service: We automatically collect the following categories of personal information in connection with your use of the Netflix service: Netflix account/profile information, purchase information, usage information, advertising information, device and network information, and communications.From Partners whose products and services you use: We may collect the following categories of personal information about you from third parties whose services you use to access, pay for, or interact with the Netflix service: personal details, payment details, usage information, and device and network information.",
  ]);

  const financial = result.findings.find(
    (finding) => finding.category === "financial"
  );

  assert.ok(financial);
  assert.equal(financial.severity, "medium");
  assert.equal(financial.priorityReason, "expected-operational");
  assert.equal(financial.normalOperationalUse, true);
  assert.equal(financial.countAsRisk, false);
  assert.ok(financial.evidence[0].length < 360);
  assert.doesNotMatch(financial.evidence[0], /Automatically when/i);
  assert.match(financial.evidence[0], /payment details/i);
});

test("prioritizes outside data sources as high impact", () => {
  const result = analyzePolicy([
    "Information From Other Sources",
    "We obtain information about you from data brokers, advertisers, partners, public sources, and offline sources and combine it with information we collect.",
  ]);

  const external = result.findings.find(
    (finding) => finding.category === "external_data"
  );

  assert.ok(external);
  assert.equal(external.severity, "high");
  assert.equal(external.countAsRisk, true);
  assert.equal(external.priorityReason, "outside-data");
});

test("elevates precise location and device identifiers when tied to advertising", () => {
  const result = analyzePolicy([
    "We collect precise geolocation, device identifiers, advertising ID, and device information for targeted advertising.",
  ]);

  const location = result.findings.find((finding) => finding.category === "location");
  const device = result.findings.find(
    (finding) => finding.category === "device_network"
  );

  assert.ok(location);
  assert.equal(location.severity, "high");
  assert.equal(location.priorityReason, "secondary-use");
  assert.ok(device);
  assert.equal(device.severity, "high");
  assert.equal(device.priorityReason, "secondary-use");
});

test("suppresses generic identifier duplicates when device identifiers already explain the risk", () => {
  const result = analyzePolicy([
    "Advertisers that run advertisements may provide us with or allow us to collect unique identifiers, such as cookies or resettable device identifiers. And cookie data, resettable device identifiers, advertising identifiers and other unique identifiers are used for advertising.",
  ]);

  const device = result.findings.find(
    (finding) => finding.category === "device_network"
  );
  const identifiers = result.findings.find(
    (finding) => finding.category === "identifiers"
  );
  const countedCategories = result.findings
    .filter((finding) => finding.countAsRisk)
    .map((finding) => finding.category);

  assert.ok(device);
  assert.equal(device.countAsRisk, true);
  assert.ok(identifiers);
  assert.equal(identifiers.countAsRisk, false);
  assert.equal(identifiers.duplicateOf, "device_network");
  assert.equal(countedCategories.includes("identifiers"), false);
});

test("keeps generic advertising identifiers below high impact", () => {
  const result = analyzePolicy([
    "Advertisers that run advertisements may provide us with or allow us to collect unique identifiers, such as cookies or resettable device identifiers.",
  ]);

  const countedHigh = result.findings.filter(
    (finding) => finding.countAsRisk && finding.severity === "high"
  );
  const device = result.findings.find(
    (finding) => finding.category === "device_network"
  );

  assert.equal(countedHigh.length, 0);
  assert.ok(device);
  assert.equal(device.severity, "medium");
});

test("treats partner data used to access or pay for a service as operational", () => {
  const result = analyzePolicy([
    "From Partners whose products and services you use: We may collect personal details, payment details, usage information, and device and network information from third parties whose services you use to access, pay for, or interact with the service.",
  ]);

  const counted = result.findings.filter((finding) => finding.countAsRisk);
  const external = result.findings.find(
    (finding) => finding.category === "external_data"
  );

  assert.equal(counted.length, 0);
  assert.ok(external);
  assert.equal(external.severity, "low");
  assert.equal(external.priorityReason, "partner-supplied-data");
  assert.equal(external.normalOperationalUse, true);
});

test("labels dangerous outside-source vocabulary clearly", () => {
  const result = analyzePolicy([
    "We collect information from publicly available sources such as public posts on social media platforms and other information available through public databases.",
  ]);

  const external = result.findings.find(
    (finding) => finding.category === "external_data"
  );

  assert.ok(external);
  assert.equal(external.severity, "high");
  assert.equal(external.priorityReason, "outside-data");
  assert.equal(external.riskLabel, "Public sources");
  assert.ok(external.evidenceLabels.includes("Public sources"));
});

test("does not treat nested policy links as sensitive-data evidence", () => {
  const result = analyzePolicy([
    "For individuals in the United States, please read the State Data Privacy Notice and the Consumer Health Data Privacy Policy for additional information about the processing of your personal data and your rights under applicable U.S. state data privacy laws.",
  ]);

  const sensitive = result.findings.find(
    (finding) => finding.category === "sensitive"
  );

  assert.equal(sensitive, undefined);
});

test("does not treat storage location headings as geolocation collection", () => {
  const result = analyzePolicy([
    "Data Retention and Storage Location",
    "We store personal data in secure server locations for as long as necessary.",
  ]);

  const location = result.findings.find(
    (finding) => finding.category === "location"
  );

  assert.equal(location, undefined);
  assert.equal(result.dataCollected.location, false);
});

test("still detects actual approximate or precise location collection", () => {
  const result = analyzePolicy([
    "We collect your approximate location based on your IP address and may collect precise geolocation if you enable location services.",
  ]);

  const location = result.findings.find(
    (finding) => finding.category === "location"
  );

  assert.ok(location);
  assert.equal(location.countAsRisk, false);
  assert.equal(location.permissionLimited, true);
  assert.equal(result.dataCollected.location, true);
});

test("keeps operational device diagnostics out of high impact", () => {
  const result = analyzePolicy([
    "We collect diagnostic data and crash data to debug and provide the service.",
  ]);

  const device = result.findings.find(
    (finding) => finding.category === "device_network"
  );

  assert.ok(device);
  assert.equal(device.severity, "medium");
  assert.equal(device.priorityReason, "expected-operational");
  assert.equal(device.normalOperationalUse, true);
  assert.equal(device.countAsRisk, false);
});

test("does not let nearby dangerous vocabulary upgrade normal merchant payment collection", () => {
  const result = analyzePolicy([
    "We collect payment details when you purchase products or services from us.",
    "We may collect information from data brokers and publicly available sources and combine it with information we collect.",
  ]);

  const financial = result.findings.find(
    (finding) => finding.category === "financial"
  );
  const external = result.findings.find(
    (finding) => finding.category === "external_data"
  );

  assert.ok(financial);
  assert.equal(financial.severity, "medium");
  assert.equal(financial.priorityReason, "expected-operational");
  assert.equal(financial.normalOperationalUse, true);
  assert.equal(financial.countAsRisk, false);
  assert.ok(external);
  assert.equal(external.severity, "high");
  assert.equal(external.priorityReason, "outside-data");
});

test("does not count privacy choice language as active sale or tracking behavior", () => {
  const result = analyzePolicy([
    "If you are a Nevada resident, you have the right to request that Best Buy not sell your personal information to third parties.",
    "You can opt out of interest-based advertising from third-party providers who follow the Digital Advertising Alliance Self-Regulatory Principles for Online Behavioral Advertising at www.aboutads.info/choices.",
    "Sell on Best Buy Marketplace.",
  ]);

  const sale = result.findings.find((finding) => finding.category === "sale");
  const tracking = result.findings.find(
    (finding) => finding.category === "tracking"
  );
  const counted = result.findings.filter((finding) => finding.countAsRisk);

  assert.equal(sale?.countAsRisk || false, false);
  assert.equal(tracking?.countAsRisk || false, false);
  assert.equal(counted.length, 0);
});

test("does not treat marketing-message wording as user content collection", () => {
  const result = analyzePolicy([
    "We or other advertisers may use those predictions to choose marketing messages to send you on our or others' digital properties and monitor the response to that message.",
  ]);

  const content = result.findings.find(
    (finding) => finding.category === "contacts_content"
  );

  assert.equal(content, undefined);
});

test("filters normal account, delivery, and service operation data from counted risks", () => {
  const result = analyzePolicy([
    "Information We Collect",
    "We collect your name, email address, and shipping address to create your account, process your order, deliver products, and provide customer service.",
    "We use session cookies to remember your shopping cart and preferences.",
  ]);

  const counted = result.findings.filter((finding) => finding.countAsRisk);
  const normal = result.findings.filter((finding) => finding.normalOperationalUse);

  assert.equal(counted.length, 0);
  assert.ok(normal.some((finding) => finding.category === "identifiers"));
  assert.ok(normal.some((finding) => finding.category === "tracking"));
});

test("scores policy specificity from concrete and vague wording", () => {
  const concrete = extractPolicyQuality([
    "Information We Collect",
    "We collect name, email address, IP address, and payment information.",
    "We use your information to process your orders and to prevent fraud.",
    "We share information with service providers and analytics providers.",
    "We retain account logs for up to 30 days.",
  ]);
  const vague = extractPolicyQuality([
    "We may collect other information from time to time.",
    "We may share information with affiliates and partners for business purposes.",
    "We retain information for as long as necessary.",
  ]);

  assert.equal(concrete.specificity.level, "specific");
  assert.equal(vague.specificity.level, "vague");
});
