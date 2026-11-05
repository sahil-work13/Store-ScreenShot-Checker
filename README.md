# Store Screenshot Checker

Checks App Store and Google Play screenshots against the official technical rules, in your browser. A daily GitHub Action watches the official spec pages and shows a banner when one changes, so the rules never go stale silently.

**Live:** https://sahil-work13.github.io/Store-ScreenShot-Checker/

## Use it
Open the live link and drop a ZIP, a folder or images. Each image gets PASS / WARN / FAIL with the reason, plus a count check per slot (Apple 1–10, Play phone 2–8, Play tablet 4–8). Folder names such as `google-play-phone`, `google-play-tablet`, `ipad`, `iphone-6.9` or `feature` help pick the slot; you can change any slot from the dropdown.

Only technical rules are checked (size, shape, format, transparency, count). Content is decided by human review.

## How the live check works
1. `.github/workflows/watch-specs.yml` runs daily (and on demand from the Actions tab).
2. `scripts/watch.mjs` fetches both official pages, hashes their main text and writes `status.json`. If the hash differs from the last run, it sets `changedOn` and opens a GitHub issue (you get an email).
3. The page reads `status.json`. If a page changed after the rules' `verifiedOn` date, a yellow banner says the rules may be outdated.

The first run only records a baseline; alerts start from the second run.

## When the banner appears
1. Open the official page (link in the banner or `rules.json`).
2. Update the numbers in `rules.json` and set that store's `verifiedOn` to today.
3. Run `node tests/check.test.mjs`, commit, and close the issue. The banner disappears.

Neither official page states a max file size, so none is checked.

## Sources
- Apple: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- Google Play: https://support.google.com/googleplay/android-developer/answer/9866151

## One-time setup
1. Settings → Pages → Source: Deploy from a branch → `main`, `/ (root)` → Save.
2. Settings → Actions → General → Workflow permissions → Read and write permissions → Save.
3. Actions → Watch store specs → Run workflow.

## Run locally
`python -m http.server` in this folder, then open http://localhost:8000 (the page can't load its JSON files over `file://`). Tests: `node tests/check.test.mjs`.
