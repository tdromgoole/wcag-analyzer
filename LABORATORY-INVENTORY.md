# Regression Laboratory — Existing Coverage Inventory

**Date:** November 19, 2026  
**State:** Source inventory retained; laboratory implementation and coverage now tracked alongside it.

**Implementation update:** The [local laboratory](laboratory/README.md) now includes 48 isolated scenarios, expected-results manifest version 10 fixtures, all-55-criterion disposition index, dashboard and Playwright run reporter. Its 26 automated comparisons matched expectations; 22 dedicated manual evaluations remain outstanding, plus eight matched review candidates requiring human interpretation. Thirty-four criteria still need dedicated fixtures. The [criterion automation assessment](AUTOMATION-ASSESSMENT.md) maps selected rules and supplementary evidence without claiming whole-criterion automation.

## Measured scanner scope

Loading `workflow.js` and `features.js` with installed axe-core 4.14.0 and calling `accessLensFeatures.scanOptions()` selects **70 automated axe rules** against the **55-criterion** catalog. These counts describe configured rules and catalog entries, not full automation of 55 criteria or proof that every rule executes on every page. The earlier estimate of roughly nine rules does not describe the current configuration.

The extension also has seven supplementary review-candidate checks, an on-demand text-spacing stress test, contrast fallback/continuation measurements, and recorded keyboard traversal. Keep these methods distinct from axe rules and human decisions in the laboratory manifest.

## Reusable test assets

| Area | Existing tests | Reusable evidence and remaining laboratory work |
|---|---|---|
| Baseline images and controls | `tests/server.js`, `extension.spec.js`, `alternative-text.spec.js` | Synthetic missing-alt image and unnamed button; alternative review alerts. Extract isolated pass/fail cases; contextual alternative quality remains manual. |
| Contrast | `contrast.spec.js`, `contrast-fallback.spec.js`, `contrast-automatic.spec.js`, `contrast-bounds.spec.js`, `contrast-nested.spec.js`, `contrast-overlap.spec.js`, `contrast-review-codes.spec.js`, `contrast-sweep.spec.js` | Solid colors, large text, gradients, transparent foregrounds, image backgrounds/overlays, clipping bounds, nested text and overlap. Preserve existing expectations and classify measurement gaps separately from failures. |
| Supplementary and responsive | `checks.spec.js` | Overflow/clipping, text-spacing restoration, captions candidates, contextual/limited evidence. Separate viewport overflow from normative reflow evaluation. |
| Keyboard and focus | `keyboard.spec.js` | Real Tab/Shift+Tab traversal, repeated focus, iframe boundaries and interrupted runs. Add isolated inaccessible-control and dialog entry/return scenarios with recovery controls. |
| ARIA and structure | `workflow.spec.js`, `features.spec.js`, `scan-scope.spec.js` | Structural relationship diagnostics, scope and selected rule assertions. Add explicit invalid/valid role and relationship fixture pairs. |
| Dynamic states and modals | `auto-scan.spec.js`, `workflow.spec.js` | Dialog/tab/expanded state detection and SPA transitions. State detection does not prove correct focus management or live-region announcements. |
| Links | `link-distinction.spec.js` | Isolated links, prose links and unsupported hover/focus cues. Add contextual purpose scenarios requiring human judgment. |
| Coverage and outcomes | `wcag-coverage.spec.js`, `sitemap.spec.js` | 55-criterion catalog, manual/scope gates, stale evidence, failure precedence. These are status tests, not 55 independent accessible/inaccessible fixtures. |
| Export and persistence privacy | `path-privacy.spec.js`, `report-saving.spec.js`, `saved-decisions.spec.js`, `save-settings.spec.js`, `site-report.spec.js` | Structural evidence, content exclusion, approved full paths without query/fragment/credentials, recovery and review merging. Keep these regression boundaries while moving fixtures. |

Initial form-error, table-header, announcement, multimedia, timing and multi-page examples are implemented. Complete contextual/manual coverage and broader cases remain open. This inventory does not assert that missing laboratory examples are absent from the scanner.

## Current fixture infrastructure

`tests/server.js` serves explicit local files under `/laboratory/` on loopback port 4178. Other routes retain the original synthetic response used by existing injection tests. No secured application or external service is required.

Use local assets, including synthetic media/image examples. Keep illustrative dashboard examples separate from recorded actual results. Tests currently use one headless Chrome worker, and native folder permissions are mocked; production extension permission prompts still require manual verification.

## Manifest requirements for the first implementation

Use a versioned JSON object with `cases` and a 55-criterion coverage-disposition index. Each case needs a stable ID, category, criterion references, fixture route and state, known condition, expected scanner response, rule/check identifiers, target-scoped count expectations, method, steps, and environment assumptions. Record reasons for unsupported/manual-only scenarios.

First migrate well-established image-alt and contrast examples, then ARIA/form/interaction cases. Do not invent whole-criterion Pass or Not Applicable outcomes from rule-level results. For unsupported automation, retain the known accessibility condition and require a review response rather than changing the fixture to satisfy the current scanner.

Before showing actual results in the dashboard, capture run ID, evaluated state, scanner version, timestamp, expected/actual comparison, and explicit skipped/unsupported dispositions. A fixture ID is laboratory metadata, not application source metadata for exported production scans.
