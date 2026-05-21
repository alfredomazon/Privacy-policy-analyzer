# Evil Eye Privacy Policy Analyzer

Evil Eye is a Chrome extension that helps people understand what a website says it may do with their data and what tracker signals are present on the current page.

The extension runs its analysis in the browser. It does not require a hosted analyzer, private API credentials, or a separate chat service.

## What It Does

- Finds the most likely privacy policy for the current website, including known policy sources for major domains and fallback link discovery for dynamic sites.
- Keeps trusted policy links available across subpages so a user can open the relevant policy from the extension.
- Analyzes policy text with local heuristics for data collection, sharing, sale, advertising, location, sensitive data, device identifiers, outside data sources, retention, and user-control language.
- Shows concise policy highlights with readable evidence quotes and links back to the analyzed policy passage when possible.
- Separates ordinary merchant behavior from more concerning policy language so routine checkout, account, payment, and service-delivery language does not overfire as high impact.
- Detects page-level tracker signals from known services, network requests, browser storage, data-entry fields, ads, third-party scripts, and embedded frames.
- Updates the toolbar eye and popup theme from the combined policy and tracker result.
- Starts with safety defaults for obvious ad cleanup, scam notification prompt blocking, and unwanted install-lure blocking.
- Includes manual protection controls for the current site, including tracker blocking, third-party script blocking, third-party iframe blocking, stronger ad removal, tracking-link disabling, scam notification prompt blocking, and unwanted install-lure blocking.
- Uses conservative empty-resource redirects for some blocked scripts, styles, and frames so safe ad/tracker requests can fail quietly without breaking more of the page than necessary.

## How It Works

The extension has three main parts:

- `content/content.js` loads the local scanner on pages and reports policy, tracker, and page signals.
- `background.js` caches scan results per tab, updates the toolbar icon, fetches linked policy documents when needed, and coordinates protection activity.
- `popup.html`, `popup.css`, and `popup.js` render the scan and protection views.

The analyzer uses local JavaScript modules in `lib/` instead of sending policy text to a remote analysis service. Policy pages may still be fetched directly by the extension when the current page links to them, but those requests go to the policy source itself rather than a separate analysis endpoint.

## Local Development

Run the test suite:

```bash
npm test
```

Before packaging or publishing, run through the manual regression checklist:

```text
docs/REGRESSION_CHECKLIST.md
```

Build a clean Chrome Web Store ZIP:

```bash
npm run package
```

The package script writes the uploadable ZIP to `dist/` with `manifest.json` at the archive root. It includes only runtime extension files and excludes tests, benchmarks, scripts, docs, `node_modules`, and other development-only files.

Load the extension locally:

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder, the one containing `manifest.json`.
5. Open a website and click the Evil Eye extension icon.

## Credits

This project was developed at Rockford University for `2026.SPRING.REG.CSCI 495.01 - Senior Seminar`.

- Supervisor: Dr. Ahmed El Ouadrhiri
- Main contributors: Alfonso Julyan Almazan and De'Angelo Strbac

## Notes

- This project is a heuristic analyzer, not legal advice.
- Scores are meant to help users notice policy and tracker patterns quickly.
- Manual protection settings are saved per site and can change the tracker portion of the score when blocked tracker activity is the reason the page looked riskier.
- Chrome Web Store submission copy, permission justifications, privacy disclosures, and the privacy policy draft are in `docs/`.
