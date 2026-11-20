# Phase 0 — Remediation Evidence Compatibility

**Date:** November 19, 2026  
**Status:** Extension-local evidence verified; work-application field consumers remain an external integration dependency.

## Preserved technical evidence

Current exports and normalized historical copies preserve rule/check identifiers, structural element ancestry, numerical measurements, review decisions and timestamps, page/state identity, scan timestamps and scope/completeness limits. History storage retains full supported technical snapshots rather than dropping passing or incomplete node evidence. JSON analysis and benchmarks do not delete or compact evidence automatically.

The intentional schema 2.1 privacy change removes verbatim alternative text. Supported legacy history copies similarly remove that content and URL secrets; original filesystem artifacts remain unchanged. Unknown/raw formats fail visibly instead of being silently reduced into apparently complete evidence. Downstream consumers must use authorized source inspection for contextual content review, not rely on exported page content.

## Structural locator defect and fix

A new regression found that axe-core 4.14.0 reports open-shadow-root targets as nested arrays, for example `[["main > div", "button"]]`. The exporter previously expected a flat array of strings, leaving those nodes with `locatorAvailable: false`.

Export, inspector selection, link analysis and contrast target traversal now flatten supported nested target paths before walking each open shadow boundary. Exports still regenerate positional locators from actual DOM elements; raw selectors are not copied into evidence. Frame content remains excluded; this change does not add iframe access or closed-shadow-root coverage.

The fixture uses nested elements without IDs/classes and an open shadow root. Tests verify that exported ancestry resolves to the intended element, that the inspector highlights the shadow finding, and that a later DOM insertion changes the current locator while the previous locator remains in preserved history. Historical structural locators are observations, not permanent element identity.

## Version and workflow boundaries

- Scan schema 2.1 is versioned; readers support both 2.0 and 2.1 with the documented legacy normalization boundary.
- New scans have stable scan IDs; snapshot/event identifiers support retry deduplication without implying permanent element identity.
- The separate work-application AI field inventory is tracked in [WORK-FOLLOW-UPS.md](WORK-FOLLOW-UPS.md). No access to that application or its database is required for these extension-local checks.
- The plan's phrase “file paths” still needs clarification between approved page paths and application source filenames. No application source filenames have been added.
- User confirmed that JavaScript remains the implementation language for the current plan. A TypeScript migration is separate future engineering work.

## Validation

The locator regression passed after the fix. All 16 affected locator, contrast, link, inspector and workflow tests passed; the additional inspector selection assertion also passed. Full regression validation is recorded in the development progress log when complete.
