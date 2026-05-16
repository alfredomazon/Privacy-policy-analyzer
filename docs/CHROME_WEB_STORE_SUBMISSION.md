# Chrome Web Store Submission Prep

This file prepares the first five publishing items for Evil Eye Privacy Policy Analyzer: release packaging, privacy policy, permission justifications, single-purpose copy, and privacy disclosures.

Official references used:

- Chrome Web Store extension preparation: https://developer.chrome.com/docs/webstore/prepare/
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/
- Chrome Web Store Program Policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Manifest V3 additional requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Chrome Web Store listing guidance: https://developer.chrome.com/docs/webstore/best-listing

## 1. Release ZIP

Run:

```bash
npm run package
```

Upload the ZIP written to `dist/evil-eye-privacy-policy-analyzer-0.1.2.zip`.

The package script includes:

- `manifest.json`
- `background.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `content/`
- `icons/`
- `lib/`
- `resources/`

The package script excludes:

- `node_modules/`
- `tests/`
- `benchmarks/`
- `scripts/`
- `docs/`
- source-control files
- local screenshots and development artifacts

Before uploading, run:

```bash
npm test
npm run benchmark
npm run protection:live
```

## 2. Privacy Policy URL

Use `docs/PRIVACY_POLICY.md` as the privacy policy source. Host it at a public URL before submission, then paste that URL into the Chrome Web Store Developer Dashboard privacy policy field.

Recommended public URL after this branch is pushed:

```text
https://github.com/alfredomazon/Privacy-policy-analyzer/blob/ui-risk-theme/docs/PRIVACY_POLICY.md
```

If the listing is published from the default branch later, use the default-branch URL instead so the privacy policy stays stable after release.

## 3. Permission Justifications

Paste these into the Developer Dashboard permission fields.

### `storage`

Stores local scan cache, toolbar state, protection activity counts, and per-site protection choices in Chrome extension storage. This keeps the extension result stable across page navigation and lets users save protection settings for the current site, including disabling the default safety protections if desired.

### `tabs`

Reads the active tab URL and tab state so the extension can associate scan results with the right page, update the toolbar icon, and avoid showing stale results after navigation.

### `webRequest`

Observes request metadata for the current site so tracker evidence and protection activity can be classified and explained in the popup. The extension does not read response bodies.

### `declarativeNetRequest`

Applies local browser-supported blocking and safe empty-resource redirect rules for user-enabled protection features, such as known tracker requests, ad-like requests, third-party scripts, and third-party frames.

### `declarativeNetRequestWithHostAccess`

Allows host-scoped protection rules to run on the websites where the user enables protection. This is needed for per-site blocking to work through Chrome's Manifest V3 declarative network request system.

### Host permission: `<all_urls>`

Lets the extension provide its core scan, tracker detector, policy discovery, default ad and scam-notification safety protections, and optional stronger protection features on the websites the user visits. This broad host access is used only for the visible user-facing features described in the listing and popup.

## 4. Single Purpose and Listing Copy

### Single purpose

Evil Eye helps users understand website privacy policy risks and page tracker activity, with default ad and scam-notification safety protections plus optional per-site protection controls, directly in the browser.

### Store summary

Understand privacy policy risks and page tracker activity, with default ad and scam-notification safety protections.

### Detailed description

Evil Eye Privacy Policy Analyzer helps you quickly understand what a website's privacy policy says it may do with your data and what tracker activity is present on the current page.

Main features:

- Finds the most likely privacy policy for the current website.
- Highlights policy language about sensitive data, location, sale or sharing, advertising, outside data sources, retention, and user controls.
- Shows readable evidence quotes and policy links when available.
- Separates routine site behavior from more intrusive or unexpected policy language.
- Detects known tracker services, browser storage signals, third-party scripts, embedded frames, data-entry fields, and ad-like activity.
- Explains what changed the toolbar eye score without filling the popup with technical noise.
- Starts with obvious ad cleanup and scam-notification protection on by default.
- Provides optional per-site protection controls for blocking known trackers, third-party scripts, third-party frames, tracking links, and stronger site protections.

The analyzer runs locally in your browser. It does not use a hosted analysis server, remote artificial intelligence service, advertising endpoint, or developer-operated analytics endpoint.

## 5. Privacy Dashboard Disclosures

Use these disclosures to fill the Chrome Web Store privacy fields consistently with the extension behavior.

### Data use

The extension uses handled data only for extension functionality: privacy policy discovery, policy analysis, tracker detection, score display, toolbar icon updates, local caching, default safety protections, and optional per-site protection.

Do not select advertising, personalization, credit-worthiness, or unrelated analytics uses.

### Data sharing

The extension does not sell user data and does not share user data with third parties.

### Data categories to disclose

Disclose these categories because the extension handles them locally for user-facing features:

- Web browsing activity: current site URL, tab URL, request domains, and navigation-related scan state.
- Website content: visible page text, page links, policy page text, storage key names, form field labels, and tracker evidence needed for analysis.
- User activity in the extension: scan refresh actions, selected popup tab, saved per-site protection options, and protection activity counts.

### Data categories not collected as user data

The extension may identify policy statements about sensitive categories, payment data, health data, location, biometrics, or identifiers, but it does not collect the user's actual values for those categories. Do not mark those categories as collected unless future code starts collecting the user's actual personal data.

### Remote code and servers

The extension's analysis and protection logic is packaged with the extension. It does not load remote code. It may fetch privacy policy pages directly from the websites being analyzed, but it does not send policy text or tracker results to a developer-operated analysis service.

### Limited Use statement

Use this disclosure in the privacy policy and any required dashboard field:

```text
The extension's use of user data adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. User data is used only to provide and improve the extension's single purpose: helping users understand website privacy policy risks and page tracker activity, with default ad and scam-notification safety protections plus optional per-site protection.
```
