# Phase 0 — Initial Architecture Assessment

**Date:** November 19, 2026  
**Scope:** Source inspection, supplied scan-file measurements, and existing focused regression tests. This is an initial assessment, not a completed privacy audit or performance baseline.

## Verified baseline

- The repository currently uses JavaScript, not TypeScript. `package.json` and `manifest.json` identify extension version 1.12.0. TypeScript in the plan is a target, not verified current architecture.
- `export.js` declares JSON schema version 2.0. There is no separate schema definition established by this assessment.
- SHA-256 page/state filenames already exist. Query and fragment values are excluded from exported page paths; optional route values affect hashed identity. DOM ancestry uses allowlisted tags and positional structural paths, including shadow-root boundaries.
- `save-settings.js` already uses IndexedDB for preferences, folder handles, compact comparison data, and sitemap data. The plan's instruction to avoid introducing IndexedDB should not be read as a reason to remove this existing implementation.
- The supplied page report is 4,466,891 bytes; `scans/sitemap.json` is 387,146 bytes. One page report is insufficient to establish typical sizes or justify a storage migration.
- The saved page report records a scan duration of 16,438 ms. This is historical evidence from one scan, not a controlled measurement. The plan's approximate 2–10 second baseline needs validation across representative pages.

## Evidence history gap

`save-settings.js:save()` writes to the stable page/state filename using `createWritable()`. It merges current manual decisions before replacement, but does not append an immutable scan event or preserve the previous full scan.

`save-settings.js:history()` replaces a single optional compact baseline/checklist per filename. `workflow.js:baseline()` supports comparisons, not a complete audit ledger. Sitemap states and attempts also hold current summaries rather than a chronological event history. Browser-numbered downloads may retain incidental copies, but do not guarantee history retention.

**Outcome:** Original failures and superseded review decisions are not guaranteed to remain recoverable after folder rescans. The preservation implementation remains open.

**Implementation update:** Folder saves now preserve the incoming snapshot, validated prior disk report, and final merged review result before replacing the current report. Failure to preserve required evidence prevents replacement and leaves the attempted recoverable save queued. Regression cases cover legacy disk failures, newer disk reviews, and injected prior/merged-preservation failures. This closes the tested folder-replacement gap; complete event-ledger, browser-download-only history, and independent-writer guarantees remain open.

## Manual decisions and sitemap

Existing tests verify restoration of saved decisions without browser history, immediate saving of explicit edits with auto-save disabled, dated decision validation, and sitemap updates after saves. Before replacement, saved reviews are reread; newer saved scans and identity conflicts block replacement. These protections do not establish safety across independent developers writing concurrently.

Sitemap tests verify that unresolved states and incomplete WCAG review cannot become clean. Coverage tests verify that automated evidence alone cannot pass a criterion, failures override manual passes, and completion requires all 55 catalogued criteria plus scope reviews. Rescans invalidate older manual reviews. Current summaries are not substitutes for historical evidence.

The folder site report recomputes coverage from saved records, but rebuilding the complete sitemap, including discovered unscanned pages, still needs investigation.

## Privacy conflict

**Implementation update:** New scans now use schema 2.1 and omit alternative text. Legacy 2.0 files remain readable and are not automatically rewritten. All 99 regression tests passed after this change. The findings below describe the initial baseline; path redaction and comprehensive privacy validation remain open. See [the evidence contract](EVIDENCE-CONTRACT.md).

`export.js:element()` exports raw image `alt` values as `alternativeText`. The report declares `privacy.mode = alternative-text-included`; the supplied scan uses that mode. `tests/report-saving.spec.js` explicitly requires alternative text to survive export, queueing, and saving.

**Outcome:** The current implementation conflicts with the new plan's prohibition on exporting page content. Existing passing tests confirm current behavior, not compliance with the proposed privacy boundary. Reconcile the contract and update export behavior and its tests together; preserve approved structural and technical evidence.

Exported `pagePath` retains the hostname and pathname, which may themselves contain sensitive identifiers. Hashing the filename does not sanitize those values. The approved path policy remains unresolved. Auditor names will require the explicitly disclosed exception already described in the main plan.

A first-party source search found fetch calls for image/data processing and no obvious telemetry endpoint. This does not establish the absence of all external transmission: vendor behavior, browser screenshot handling, runtime paths, temporary storage, and logs still require review. DOM analysis necessarily reads some content in memory; distinguish transient analysis from persistence and export when documenting the boundary.

## AI compatibility and workflow discovery

Current evidence includes structural targets, rule IDs, guidance, numerical measurements, page/state identity, timestamps, coverage, and comparison data. There is no verified downstream AI field-consumer inventory yet. The plan's requirement to preserve file paths must be reconciled with its prohibition on source metadata before adding fields.

No root GitLab configuration or root `AGENTS.md` was found during this inspection. The user clarified that GitLab/AI remediation belongs to the work application, not this extension. Its field-consumer inventory is a future integration dependency and does not block extension-local tests or fixtures.

## Validation

Command: `npx playwright test tests/workflow.spec.js tests/saved-decisions.spec.js tests/save-settings.spec.js tests/sitemap.spec.js tests/report-saving.spec.js tests/wcag-coverage.spec.js`

**Result:** 21 tests passed using the configured headless Chrome channel. These tests establish a focused baseline; production browser workflows, concurrency, comprehensive privacy, and scan-performance coverage remain unverified.

## Next implementation sequence

1. Document the shared versioned contract: event and entity IDs, timestamps, status semantics, approved export fields, legacy compatibility, and import deduplication. Resolve alternative text, path privacy, and source-metadata boundaries explicitly.
2. Define history events separately from large technical payloads. Specify failure recovery and migration before replacing the current save workflow.
3. Implement the approved content-free export boundary with focused regression checks and explicit legacy handling.
4. Add durable history and auditor attribution without losing existing manual-review restore/merge protections.
5. Extend re-verification after the event contract is stable. Preserve uncertainty and historical evidence.
6. Complete representative performance measurements and the remaining Phase 0 security/workflow checks. Do not implement automatic deletion before an approved retention policy.

## Follow-up verification

The approved URL policy retains full paths and excludes query strings, fragments, and credentials. `tests/path-privacy.spec.js` now verifies this through export, a failed folder save, persisted queue inspection, retry, folder output, site-report JSON and HTML. Together with existing sitemap/query stripping and identity tests, the focused follow-up run passed 23 tests. This covers the tested normal export path, not arbitrary untrusted JSON ingestion or every legacy payload.

The user has not yet identified the applicable retention schedule. Retention classification remains open; no automatic cleanup was added.

## Historical-results preservation completion

The installed extension now preserves completed scan and review submissions even in browser-download-only mode and when disk auto-save is disabled. Portable history includes stable scan/snapshot/event identifiers, scan outcome summaries and original manual/keyboard review timestamps. Review restoration reads preserved decisions after reload independently of optional comparison history. Capacity/preservation errors block save/download authorization visibly rather than dropping older evidence. All 115 regression tests passed.

The Phase 0 overwrite-preservation item is complete for current scan/review workflows. Later-phase auditor attribution and source-change/remediation events remain planned. No guarantee is made for older overwritten history, deliberate browser data clearing, uninstalling, independent filesystem writers, or browser download completion.
