# Sitemap Integrity and Evidence Reconstruction

**Date:** November 19, 2026  
**Status:** Phase 0 assessment verified against source and focused regression tests. No new rebuild command is implemented.

## Verified behavior

- Rescans update current results for the matching page/state. Detected issues keep the page in the existing `issues` state; resolving automated failures still requires outstanding WCAG/manual evaluation before `clean` is possible.
- Older scan completions cannot overwrite a newer state summary. Failed attempts retain the last completed scan and record the failure separately.
- The sitemap retains `dateAdded` and historical `complianceAt` when later scans find issues. `complianceAt` is a historical recorded result, not proof of current conformance.
- Original scan/review evidence is preserved separately from mutable sitemap summaries. Clearing the sitemap does not invoke snapshot deletion, and pending-save deletion is separately tested not to delete preserved evidence.
- Existing `issues`, `review`, `clean`, and `unknown` display states and scan-attempt status names are preserved.

## Reconstruction boundary

| Data | Evidence source | Limitation |
|---|---|---|
| Current automated outcomes | Latest applicable scan report's rule buckets and nodes | Must choose the latest scan per page/state; a missing failure is only no longer detected |
| Manual decisions and review freshness | Dated `manualChecks`, keyboard assessments, scan times | Recalculate from evidence; never trust cached coverage claims |
| Page/state grouping | Explicit hashed page identity, state key, stable report filename | Legacy reports may lack configured-route identity; do not silently merge distinct states |
| Page pathname | Approved `pagePath` without query, fragment or credentials | Does not reveal route values used only in hashing |
| Scope limitations and stale status | Completeness evidence, timestamps, configured stale threshold | A partial scan cannot establish whole-page coverage |
| Historical results | Preserved snapshots and their event summaries | Cannot reconstruct scans overwritten before preservation existed |
| Historical recorded clean date | Prior complete evidence for all relevant states | A single latest report cannot recover earlier dates or prove the original discovery scope |
| Discovered but unscanned links | Existing sitemap/discovery records | Scan reports do not preserve the full discovered link inventory |
| Original discovery date and failed attempts | Existing sitemap or separately recorded discovery/attempt evidence | Do not substitute a rebuild timestamp or earliest available scan as a known original discovery time |

`features.js:reportEvidence()` and `savedSiteReport()` already reduce saved reports and recompute current coverage without trusting their precomputed `wcagCoverage`. Existing folder aggregation tests verify latest-scan selection, dated review merging, state separation, stale/limited outcomes and visible partial reads. This demonstrates that scan-derived reporting can be reconstructed independently of cached sitemap status.

A future sitemap rebuild can reuse those evidence reducers, but must label unavailable discovery/attempt history and preserve known unscanned nodes where available. It must not imply a complete site crawl, invent discovery dates, or claim that a partial read recovered the entire sitemap. No rebuild should overwrite historical evidence.

## Validation

`npx playwright test tests/sitemap.spec.js tests/evidence-history.spec.js tests/wcag-coverage.spec.js tests/site-report.spec.js`

**Result:** 30 tests passed. The new ordering/failure regression explicitly verifies older completion rejection, retained failure evidence, historical dates, and failed-attempt reporting. Existing tests cover UI status changes and preserved snapshot/review history. Native permission prompts and independent filesystem writers remain outside these automated checks.
