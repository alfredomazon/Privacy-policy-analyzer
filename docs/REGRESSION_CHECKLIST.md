# Evil Eye Regression Checklist

Use this checklist before packaging or publishing the extension. The goal is to catch core behavior that has broken before, especially toolbar eye state, tracker protection, and page refresh behavior.

## Setup

- [ ] Load the unpacked extension from the project folder in `chrome://extensions`.
- [ ] Open the extension service worker console and confirm there are no startup errors.
- [ ] Run `npm test` and confirm all tests pass.
- [ ] Run `npm run protection:live` when network access is available.

## Toolbar Eye State

- [ ] Open a low-risk page and confirm the toolbar eye stays blue.
- [ ] Open a page with meaningful tracker activity and confirm the toolbar eye turns yellow.
- [ ] Open a high-risk policy or fixture and confirm the toolbar eye can turn red.
- [ ] Confirm the popup theme matches the toolbar eye color.
- [ ] Confirm the eye explanation says what is driving the current color.

## Tracker And Protection Cycle

- [ ] On a tracker-heavy page, confirm Page Activity shows tracker evidence.
- [ ] Turn on stronger protection for the site, including known tracker blocking.
- [ ] Save protection settings and confirm blocked activity appears in Page Activity.
- [ ] Confirm the toolbar eye returns to blue when protection blocks the tracker behavior and no other major issue remains.
- [ ] Turn the stronger tracker protections back off and save.
- [ ] Click the Protection `Refresh` button and confirm the extension state updates.
- [ ] Confirm the toolbar eye returns to yellow without requiring a full browser-tab reload when tracker risk is still the cached page baseline.
- [ ] Click `Reload page` and confirm the actual active tab reloads cleanly.
- [ ] After reload, confirm tracker evidence and eye color match the current saved protection settings.

## Protection Page

- [ ] Confirm the Protection page header spacing matches Summary and Page Activity.
- [ ] Confirm `Refresh` refreshes extension state without reloading the tab.
- [ ] Confirm `Reload page` reloads the active tab.
- [ ] Confirm `Activate all protections` checks every protection option.
- [ ] Confirm clearing `Activate all protections` clears every protection option.
- [ ] Confirm `Save for this site` persists the selected settings.
- [ ] Confirm `Reset` restores safety defaults.
- [ ] Confirm the protection status text and active chip update after save, reset, refresh, and reload.

## Page Activity

- [ ] Confirm Page Activity refresh updates tracker/protection status.
- [ ] Confirm blocked item counts are visible when protection has acted.
- [ ] Confirm known tracker services are summarized by service/vendor.
- [ ] Confirm ordinary third-party infrastructure does not dominate the risk state.
- [ ] Confirm Page Activity does not show stale blocked items after the matching protection rule is disabled.

## Policy Summary

- [ ] Confirm Summary refresh updates the policy and tracker result.
- [ ] Confirm a current-page privacy policy is detected when present.
- [ ] Confirm a footer privacy policy link is discovered from a normal homepage.
- [ ] Confirm policy evidence links open the analyzed source when available.
- [ ] Confirm non-policy pages do not produce policy-risk scores from unrelated text.

## Compatibility Checks

- [ ] Confirm YouTube playback and navigation still work with safety defaults.
- [ ] Confirm webmail or email-style pages are not over-blocked.
- [ ] Confirm Google Search does not get leave-site or notification guard false positives.
- [ ] Confirm normal shopping pages can still navigate, sign in, and use checkout-like links.
- [ ] Confirm safety defaults do not create heavy blocking on normal low-risk sites.

## Scam Popup Guard

- [ ] Confirm fake virus/support alert fixtures are blocked.
- [ ] Confirm fake notification `Allow` prompt traps are blocked.
- [ ] Confirm unwanted install or fake update lures are blocked.
- [ ] Confirm ordinary newsletter, checkout sign-in, and user-initiated notification prompts are allowed.

## Packaging

- [ ] Run `npm run package`.
- [ ] Inspect the generated ZIP and confirm `manifest.json` is at the archive root.
- [ ] Confirm the ZIP excludes tests, docs, scripts, benchmarks, and `node_modules`.
- [ ] Load the packaged build in a fresh browser profile if possible.
- [ ] Repeat the Toolbar Eye State and Tracker And Protection Cycle sections on the packaged build.
