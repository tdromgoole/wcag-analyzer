# Phase 0 — Privacy and Security Assessment

**Date:** November 19, 2026  
**Status:** Newly generated evidence and local measurement paths assessed. Legacy-input normalization remains open.

**Implementation update:** Supported legacy exports now normalize before new staging, pending-queue use, portable export and archival. Verbatim image alternatives are removed from copies, URL secrets are stripped, technical failures/reviews/timestamps remain, and transformed staged IDs retain prior-ID linkage. Original files and archives are unchanged. Unsupported raw fields or roots stop processing without replacing the original staging record. General adversarial JSON schema validation remains separate from this bounded compatibility fix.

Follow-up validation passed all 122 regression tests. A read-only normalization run against the actual saved schema 2.0 report retained its violation-rule count and removed alternativeText fields. The extension build succeeded. No original scan file was rewritten by this verification.

## Data boundaries

| Boundary | Verified behavior | Remaining limit |
|---|---|---|
| DOM scanning | Reads text, attributes and form semantics transiently for analysis and inspector display | The literal requirement to never capture/read content is incompatible with existing analysis; persistence/export is the enforceable boundary |
| New scan JSON | Allowlisted structural targets, measurements, rule/check metadata and approved full page paths; schema 2.1 omits alternative text | Does not sanitize arbitrary third-party JSON merely because its privacy label says content-free |
| Local snapshots and portable events | New reports omit seeded page content, form values, alternative text, IDs/classes, custom element names, query/fragment values and injected application build metadata | Preserving preexisting legacy disk reports can retain their original content-bearing fields |
| Recovery and file saves | Use generated reports; local staging is explicit and bounded; confirmed history copies precede staging release | Legacy report intake still accepts older privacy modes |
| Contrast screenshots | Visible-tab capture and crop remain transient local pixel processing; bitmap is closed; exported evidence contains numerical diagnostics rather than screenshots | Browser APIs necessarily capture visible content transiently; this is not a promise that pixels are never read |
| Keyboard recovery | Stores structural traversal, timing and constrained review/status fields | Human assessment remains required; recording focus traversal is not authenticated identity |
| Extension diagnostics | Worker launch/restoration errors now log fixed messages without raw exceptions; known axe preload warnings become constrained flags | The extension does not suppress unrelated page/engine console output generally |
| Network | First-party source inspection found no telemetry/upload endpoint; fetch calls process screenshot data URLs locally. Controlled generated-evidence test observed zero HTTP requests during scanning/storage | This is a bounded test, not certification of every host page's network behavior or every vendor/browser code path |
| AI boundary | Package/source paths use local axe and extension code; no embedded AI service or application source/database remediation execution found | Work-application AI development workflow belongs to the separate integration dependency |

Full URL paths are approved by the user. Query strings, fragments and embedded credentials remain excluded from new evidence. Scanner/engine versions describe the evaluation tool; application build metadata from the DOM is excluded.

## Changes and validation

Removed raw exception objects from worker launch and browsing-restoration warnings. These are real extension-owned diagnostic paths; errors may contain page URLs or local details. The tests inject private sentinel errors and assert that only fixed diagnostic strings are logged.

Added `tests/privacy-boundaries.spec.js` to inspect the new scan, all stored IndexedDB values, portable history and event summaries after a controlled page containing private sentinels is scanned. All sentinels remain absent; approved pathname is retained. The test watches HTTP requests during the measurement/preservation window and observes none. Existing pixel-capture tests verify active-tab/document/bounds rejection, failure cleanup and local diagnostic behavior; keyboard tests verify constrained traversal and recovery.

Command: `npx playwright test tests/privacy-boundaries.spec.js tests/path-privacy.spec.js tests/extension-errors.spec.js tests/contrast-fallback.spec.js tests/contrast-automatic.spec.js tests/keyboard.spec.js`

**Result:** 25 tests passed.

## Open extension work

- Define normalization or rejection for content-bearing legacy/imported reports before copying them into new history/export artifacts. Keep meaningful historical failures and review evidence; do not silently discard evidence or relabel raw legacy content as sanitized.
- Verify the same boundary through legacy snapshot staging, portable export and immutable archive retry paths.
- Keep the general export/storage privacy completion items open until this is resolved.

Retention classification and work-application workflow coordination remain in [WORK-FOLLOW-UPS.md](WORK-FOLLOW-UPS.md). They do not require embedding AI or granting the extension source/database access.
