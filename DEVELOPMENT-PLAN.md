# Accessibility Scanner — Development Plan

**Target:** WCAG 2.2 Level AA (55 applicable success criteria to account for)  
**Scope:** Browser extension, AI remediation integration, audit evidence, and future compliance reporting  
**Approach:** Preserve existing functionality, improve automation, and architect for long-term reporting.

## Progress Tracking

**Recorded:** November 19, 2026  
**Status:** In progress; checked items have supporting implementation or verification evidence in the progress log.

This file is the primary progress tracker for Phases 0–5, including Phase 0A, the regression test laboratory immediately after Phase 0. Check an item only after implementation and relevant validation are complete. Record evidence, decisions, and blockers in the progress log.

The [Phase 0 architecture and compliance evidence supplement](PHASE-0-PLAN.md) retains the additional shared-contract, privacy, retention, and reporting requirements. Its implementation sections map to the phases here; they do not require all later-phase work to be completed during initial discovery. Establish the shared data contract before evidence-format changes, and stabilize it before building the database importer and PHP reporting module.

**Foundational requirement:** Evaluate every extension change for compatibility with immediate accessibility scanning and future historical compliance reporting.

**Workplace dependencies:** Track records-policy questions and work-application integration decisions in [WORK-FOLLOW-UPS.md](WORK-FOLLOW-UPS.md). Resolve those at work and record approved outcomes here when they affect implementation.

## Core Architectural Requirements

1. The extension remains a standalone TypeScript-based scanner with no embedded AI.
2. No user content, application data, or sensitive information may be collected or exported.
3. JSON exports contain only approved technical accessibility findings, element identifiers, structural paths, and diagnostic evidence.
4. AI may inspect authorized application source code and sanitized JSON, but cannot log into the application, access its database, or execute database scripts.
5. Developers must review and approve AI-generated changes before execution.
6. Existing JSON exports remain compatible with AI remediation.
7. The extension and future database-backed reporting system must be architected together, even though they will be implemented separately.
8. Every applicable WCAG criterion must have an explicit evaluation outcome. An absence of detected violations does not establish compliance.

---

## Phase 0 — Existing Functionality and Architecture Verification

**Goal:** Understand and verify the current implementation before changing it.

### 0.1 JSON Storage and History

- [x] Inspect existing JSON exports and measure actual file sizes.
- [x] Determine whether scan history is already preserved.
- [x] Verify original failures remain available after rescanning. **Folder-save workflow verified:** the previous disk snapshot is retained before replacement, including legacy 2.0 reports. Failed preservation blocks replacement. Browser-download-only history and independent-writer guarantees remain outside this verification.
- [x] Verify saved manual-review decisions are restored correctly.
- [ ] Preserve historical results if the existing implementation overwrites them.
  **Implemented:** folder-save snapshots and merged reviews are preserved locally with explicit verified folder archival. **Still open:** complete event-ledger and browser-download-only coverage.
- [x] Identify duplicated or unnecessary diagnostic information. **Measured:** formatting and repeated targets; no evidence removed. See [storage assessment](EVIDENCE-STORAGE-DESIGN.md).
- [x] Distinguish AI remediation data, diagnostic data, and compliance evidence. See the storage assessment's evidence responsibilities.
- [x] Evaluate whether separate detailed JSON and lightweight per-page history files would improve storage efficiency. **Direction:** immutable technical payloads plus compact events; current snapshot retained for compatibility.
- [x] Keep JSON unless measurements justify another storage approach. **Decision:** retain JSON; current measurements do not justify migration.

### 0.2 Sitemap Integrity

- [x] Verify the sitemap updates automatically after scans and manual reviews.
- [x] Confirm pages cannot receive Pass while applicable failures or outstanding evaluations remain.
- [ ] Verify rescans correctly update the current page status.
- [ ] Confirm historical evidence remains available after status changes.
- [ ] Verify sitemap data can be reconstructed from underlying scan records where practical.
- [ ] Preserve existing status names and behavior unless defects are identified.

### 0.3 Security and Privacy

- [ ] Verify that DOM scanning never captures page text, form values, or user-generated content.
- [ ] Inspect identifiers, classes, attributes, DOM paths, and logs for potential sensitive-data exposure.
- [ ] Confirm exported JSON contains only approved technical information.
- [ ] Verify that no scan data is transmitted to external services.
- [ ] Confirm temporary storage and debugging mechanisms follow the same privacy requirements.
- [ ] Preserve the extension's no-AI architecture.
- [ ] Preserve the developer-controlled AI remediation workflow.

### 0.4 AI Remediation Compatibility

- [ ] Identify every JSON field used by the existing AI remediation process.
- [ ] Preserve file paths, selectors, element ancestry, rule identifiers, and actionable findings.
- [ ] Verify nested elements without IDs or classes can be reliably located.
- [ ] Confirm that historical selectors are treated as snapshots rather than permanent identifiers.
- [ ] Version the JSON schema before introducing breaking changes.
- [ ] Ensure storage optimization does not remove information required for AI remediation.

### 0.5 Performance Baseline

- [ ] Measure scan duration across small, medium, and large pages.
- [ ] Identify bottlenecks in the contrast engine and other scanners.
- [ ] Measure JSON serialization and file-writing overhead.
- [ ] Establish a baseline before optimizing.
- [ ] Avoid introducing IndexedDB or SQLite without demonstrated benefit.

---

## Phase 0A — WCAG 2.2 AA Regression Test Laboratory

**Goal:** Build a standalone, controlled test site with known expected outcomes before expanding scanner automation. Keep it independent of the secured application and its data. Phase 0A follows Phase 0; existing phase numbers remain stable.

### 0A.1 Structure and Existing Test Inventory

- [ ] Inventory existing Playwright tests and synthetic fixtures; reuse proven scenarios rather than duplicating them.
- [x] Measure the current automated rule/check coverage; do not assume the quoted estimate of roughly nine rules describes the implementation. **Baseline:** 70 selected axe rules, 55 catalogued criteria; see [laboratory inventory](LABORATORY-INVENTORY.md). Complete per-scenario coverage remains open.
- [ ] Create a local index page linking to isolated test pages by category.
- [ ] Organize scenarios around all 55 catalogued WCAG 2.2 A/AA criteria, documenting unsupported and manual-only coverage explicitly.
- [ ] Keep individual scenarios isolated so intentional failures do not contaminate unrelated expectations.
- [ ] Add an optional combined stress-test page separately from deterministic regression fixtures.
- [ ] Use synthetic content and local assets only; require no secured-application login, database, application source, or sensitive data.

### 0A.2 Scenario Categories

| Category | Deliberate failures and review scenarios |
|---|---|
| Contrast | Low-contrast text, gradients, image buttons, antialiased text, and white text over a charcoal image overlay |
| Images | Missing alternatives and incorrect decorative-image handling; contextual alternative quality requires human judgment |
| Forms | Missing labels, incorrect error associations, and missing instructions |
| ARIA | Invalid roles, missing names, and incorrect relationships |
| Keyboard | Inaccessible controls, keyboard traps, and incorrect tab order |
| Focus | Hidden indicators, obscured focus, and focus-order problems |
| Navigation | Missing or inappropriate headings, broken landmarks, and ambiguous links |
| Tables | Missing headers and incorrect header associations |
| Modals | Inaccessible dialogs and missing entry/return focus management |
| Dynamic content | Status updates without appropriate announcements |
| Multimedia | Missing captions, transcripts, and audio descriptions where required |
| Responsive | Text clipping, reflow failures, and insufficient pointer target sizes |

### 0A.3 Expected Outcomes and Machine-Readable Manifest

- [ ] Provide Fail, Pass, and Not Applicable scenarios wherever each is meaningful; include Needs Manual Review cases for human judgment and unsupported measurements.
- [ ] Separate the scenario's known accessibility condition from the expected scanner response. A known failure may require manual review when automation cannot establish it.
- [ ] Define a versioned manifest with stable test ID, category, criterion IDs, fixture URL/state, expected condition, expected scanner outcome, relevant rule/check IDs, expected finding counts, and evaluation method.
- [ ] Scope counts to the intended rule and target; account explicitly for unrelated baseline findings rather than assuming one total violation per scenario.
- [ ] Include interaction steps, viewport, timing conditions, applicable exceptions, and manual instructions where needed.
- [ ] Record reasons for Not Applicable expectations. Absence of findings must not be interpreted as non-applicability or a whole-criterion pass.
- [ ] Identify unsupported scenarios and coverage gaps explicitly; prevent silent skips from appearing as passes.
- [ ] Review fixture correctness independently of scanner output; do not change expectations merely to match current behavior.

### 0A.4 Interactive Dashboard

- [ ] Display cases with filters for All, Fail, Pass, Needs Manual Review, and Not Applicable.
- [ ] Show each case's description, criteria, expected outcome, and expected findings.
- [ ] Display actual results only after a recorded test run; label illustrative or unrun cases clearly.
- [ ] Compare expected and actual results, highlighting missed failures, false positives, and unexpected review outcomes.
- [ ] Associate actual results with run time, scanner version, and evaluated state so stale results are visible.
- [ ] Make the dashboard itself keyboard accessible and keep deliberate failures on their fixture pages.

### 0A.5 Interaction and Manual Scenarios

- [ ] Add JavaScript-driven states for dialogs, dynamic updates, form errors, and focus management.
- [ ] Add timing, multimedia, responsive, and multi-page/process scenarios where static HTML is insufficient.
- [ ] Provide human evaluation instructions and expected evidence for screen-reader, contextual, and other manual checks.
- [ ] Make deliberate keyboard traps and disruptive scenarios opt-in, isolated, and resettable, with a clear recovery path.
- [ ] Preserve unsupported gradients as manual review unless the scanner can reliably evaluate the specific scenario.

### 0A.6 Playwright Regression Integration

- [ ] Validate manifest structure, unique IDs, criterion references, and fixture availability.
- [ ] Connect the manifest to the existing Playwright suite and run the real scanner/export pipeline against controlled fixtures.
- [ ] Assert expected failures, passing element checks, manual-review outcomes, and reliable non-applicability separately.
- [ ] Verify fixture exports comply with the shared evidence/privacy contract.
- [ ] Produce machine-readable run results for dashboard comparison and future GitLab integration.
- [ ] Establish a repeatable laboratory baseline before expanding automation in Phase 2.
- [ ] Require representative laboratory regression checks for scanner accuracy or performance changes.

**Acceptance criteria:** Isolated fixtures and a validated manifest provide reproducible expected-versus-actual checks. Existing tests continue to pass. Every criterion has a documented coverage disposition, including manual-only or unsupported cases; the laboratory does not claim exhaustive WCAG coverage or certify conformance.

---

## Phase 1 — User Interface and Scan Performance

**Goal:** Make the extension faster and show developers only what requires attention.

### 1.1 Results Filtering

- [ ] Add a **Needs Attention / Show All** toggle.
- [ ] Default to Needs Attention.
- [ ] Hide informational findings that require no action.
- [ ] Apply consistent filtering across all tabs, including ARIA.
- [ ] Keep all findings available through Show All.
- [ ] Ensure filtering never deletes or changes underlying evidence.

### 1.2 Performance Improvements

- [ ] Optimize repeated DOM traversal.
- [ ] Investigate caching reusable scan calculations.
- [ ] Reduce unnecessary pixel analysis where safe.
- [ ] Avoid redundant checks of the same elements.
- [ ] Improve responsiveness during long-running scans.
- [ ] Preserve scan accuracy when optimizing.

**Current baseline:** Approximately 2–10 seconds per scan, depending on page size.

---

## Phase 2 — WCAG Automation and Applicability

**Goal:** Reduce unnecessary manual checks while maintaining defensible results.

### 2.1 Automatic Applicability Detection

- [ ] Evaluate which of the 55 WCAG 2.2 AA criteria apply to the current page.
- [ ] Automatically mark criteria Not Applicable only when non-applicability can be established reliably.
- [ ] Record the reason for every automatic Not Applicable determination.
- [ ] Hide non-applicable criteria from the default results view.
- [ ] Preserve their results in the exported JSON.
- [ ] Reevaluate applicability whenever a new scan occurs.
- [ ] Never confuse Not Applicable with Not Tested or Needs Manual Review.

For example, video-related criteria may be marked Not Applicable when the page and evaluated state contain no relevant video content, provided the scanner can reliably establish that condition.

### 2.2 Expand Automated Testing

- [ ] Review the existing manual-check list.
- [ ] Identify criteria that can be fully or partially automated.
- [ ] Build additional scanners where technically feasible.
- [ ] Retain manual evaluation where automation cannot establish compliance.
- [ ] Identify relevant elements even when the automated engine cannot evaluate them.
- [ ] Validate new scanners against known passing and failing examples.

### 2.3 Contrast Engine Improvements

- [ ] Preserve the existing image-based contrast scanner.
- [ ] Verify handling of antialiasing and partially blended edge pixels.
- [ ] Preserve successful testing of white text over a charcoal overlay on an image.
- [ ] Add regression tests for image buttons and other graphical controls.
- [ ] Investigate gradient-aware contrast analysis.
- [ ] Keep unsupported gradients marked for manual review until reliable automation exists.
- [ ] Verify contrast calculations against applicable WCAG requirements.

### 2.4 Criterion and Element Coverage

**Mandatory requirement:** Every applicable criterion must distinguish between criterion-level evaluation and element-level coverage.

- [ ] Identify all relevant elements within the evaluated page state.
- [ ] Record which elements were automatically evaluated.
- [ ] Record which elements require manual evaluation.
- [ ] Record which elements could not be evaluated and why.
- [ ] Prevent a criterion from passing when relevant elements remain untested.
- [ ] Preserve coverage evidence in JSON and reporting data.

---

## Phase 3 — Auditor Identity and Historical Evidence

**Goal:** Establish a reliable audit trail that supports multiple developers and future reporting.

### 3.1 Auditor Information

- [ ] Add first-name and last-name fields to extension settings.
- [ ] Save the auditor's entered information locally for convenience.
- [ ] Include auditor attribution with scan and manual-review events.
- [ ] Consider a stable locally generated auditor identifier.
- [ ] Clearly distinguish self-declared identity from authenticated identity.
- [ ] Do not retrieve identity from the secured application's login session.
- [ ] Design for future mapping to authenticated application users.

Auditor names are personal information and must be handled as an explicitly disclosed exception to the extension's otherwise content-free technical exports.

### 3.2 Historical Scan Records

- [ ] Preserve the original scan date and result.
- [ ] Preserve subsequent rescans and status transitions.
- [ ] Record when failures become verified passes.
- [ ] Track changes to manual-review decisions.
- [ ] Preserve the auditor associated with each review event.
- [ ] Retain historical findings even when their original DOM paths become obsolete.
- [ ] Avoid duplicating large diagnostic payloads unnecessarily.

### 3.3 Multi-Developer Integrity

- [ ] Preserve the existing repository-based JSON workflow.
- [ ] Verify scan histories are not lost during Git merges.
- [ ] Keep the sitemap synchronized with the underlying evidence.
- [ ] Continue coordinating module ownership between developers.
- [ ] Investigate collision-resistant scan identifiers.
- [ ] Ensure simultaneous scans cannot silently overwrite one another.

### 3.4 Retention

- [ ] Confirm the applicable records-retention requirements with the organization's records management authority.
- [ ] Determine whether scan evidence, compliance reports, and working files have different retention classifications.
- [ ] Establish an approved retention and archival policy.
- [ ] Avoid storing full diagnostic payloads indefinitely without a demonstrated need.
- [ ] Ensure historical evidence required for compliance remains recoverable.

No fixed retention period will be assumed until the applicable policy is confirmed.

---

## Phase 4 — AI-Assisted Change Detection and Re-verification

**Goal:** Identify pages requiring another accessibility review without rescanning all 800+ views after every source change.

### 4.1 Source-Change Review

- [ ] Define a rule for the authorized AI development workflow to evaluate accessibility impact when source files change.
- [ ] Allow AI to propose updates to scan-folder JSON records.
- [ ] Require developer approval before applying those updates.
- [ ] Mark potentially affected pages as **Needs Review**.
- [ ] Keep Needs Review separate from WCAG Pass and Fail.
- [ ] Preserve previous scan evidence.
- [ ] Create the next review record when the extension performs a new scan.

### 4.2 Impact-Based Re-verification

- [ ] For isolated page changes, flag the affected page.
- [ ] For shared components, identify known consuming pages.
- [ ] For CSS changes, analyze selectors, classes, and relevant existing scan metadata.
- [ ] Determine which WCAG checks may be affected by the change.
- [ ] Investigate representative regression testing for shared functionality.
- [ ] Avoid unnecessarily flagging every page for minor CSS changes when impact can be bounded.
- [ ] Record uncertainty when the full impact cannot be established.

Representative testing must not be treated as proof that every untested page remains compliant.

### 4.3 Security Requirements

- [ ] Do not expose application build numbers, commit hashes, or version metadata to browser users.
- [ ] Do not introduce application comments or hidden metadata that violate existing security requirements.
- [ ] Do not grant the extension source-code or database access.
- [ ] Do not grant AI application-login or database access.
- [ ] Keep source-change analysis inside the authorized development workflow.

---

## Phase 5 — Database-Backed Compliance Reporting

**Goal:** Allow authorized client users to generate historical accessibility compliance reports directly from the secured PHP application.

### 5.1 Reporting Data Architecture

- [ ] Design the extension's JSON schema for future database imports.
- [ ] Establish stable identifiers for pages, scans, criteria, findings, and review events.
- [ ] Separate current evaluation status from historical records.
- [ ] Preserve reviewer attribution and verification timestamps.
- [ ] Support importing sanitized JSON through an approved application-side process.
- [ ] Store compliance records in dedicated, access-controlled tables.
- [ ] Preserve original evidence or approved archival copies.
- [ ] Ensure AI generates proposed database scripts but never executes them.

### 5.2 PHP Reporting Module

- [ ] Build reporting into the existing secured application.
- [ ] Use the application's existing authentication and authorization controls.
- [ ] Allow authorized users to view current compliance status.
- [ ] Provide historical reports as of a selected date.
- [ ] Show initial findings, subsequent reviews, and verified passing results.
- [ ] Include auditor attribution and outstanding manual reviews.
- [ ] Show evaluation coverage and unresolved findings.
- [ ] Provide PDF export for compliance requests.
- [ ] Distinguish automated findings from manually verified results.

### 5.3 Report Accuracy

- [ ] Account for all 55 WCAG 2.2 AA criteria.
- [ ] Clearly distinguish Pass, Fail, Not Applicable, and incomplete evaluations.
- [ ] Preserve reasons for non-applicability.
- [ ] Report coverage gaps and outstanding reviews.
- [ ] Distinguish historical passing evidence from current verification status.
- [ ] Avoid claiming complete compliance based solely on automated testing.
- [ ] Keep exception handling outside the initial architecture unless a real requirement arises.

### 5.4 Long-Term Public Release

- [ ] Preserve a standalone extension that can be used without the secured application.
- [ ] Keep database integration optional and external to the extension.
- [ ] Document exactly what information the extension collects and exports.
- [ ] Ensure no hidden telemetry, AI integration, or external data transmission.
- [ ] Maintain a portable, documented JSON format.
- [ ] Prepare documentation and packaging for a future browser extension store release.

---

## Implementation Order

**First:** Verify existing JSON, sitemap, security, and scan behavior.

**Immediately after Phase 0:** Build the Phase 0A test laboratory and establish expected results before expanding automation. Reuse the existing Playwright suite and keep application data out of the laboratory.

**Next:** Improve the interface, applicability detection, and automated testing.

**Then:** Strengthen audit history, auditor attribution, and change-based re-verification.

**Finally:** Build the secured application's database-backed reporting module using the evidence format established throughout development.

## Definition of Done

The project is complete when:

- All 55 WCAG 2.2 AA criteria are accounted for.
- Applicable criteria are evaluated automatically or through documented manual review.
- Untested elements cannot silently produce passing results.
- Developers can use sanitized JSON for AI-assisted remediation.
- Every scan and review preserves defensible historical evidence.
- Source changes can trigger appropriately scoped re-verification.
- Multiple developers can safely contribute audit records.
- Authorized client users can generate historical compliance reports.
- The extension continues operating without access to sensitive application data.
- Existing working functionality has been preserved wherever possible.
- The independent test laboratory provides repeatable expected-versus-actual regression evidence and explicitly documents manual-only and unsupported coverage.

**Guiding principle:** Verify what exists, improve what is necessary, and preserve the evidence required to demonstrate accessibility compliance without compromising application security.
## Progress Log

| Date | Phase / item | Update and supporting evidence | Blockers / next action |
|---|---|---|---|
| November 19, 2026 | Planning | Full supplied development plan saved as the primary tracker; earlier architecture supplement linked. No implementation items marked complete. | Begin Phase 0 verification against the repository. |
| November 19, 2026 | Phase 0 initial verification | [Assessment and evidence](PHASE-0-FINDINGS.md): measured saved JSON, inspected history and exports, and passed 21 focused regression tests. Verified discovery items checked above. | Define the shared data contract; resolve alternative-text export conflict and durable-history gap. Remaining privacy and performance checks stay open. |
| November 19, 2026 | Evidence contract and privacy | [Contract](EVIDENCE-CONTRACT.md) documents scan schema 2.1, legacy compatibility, and planned history identities/import guarantees. New scans omit alternative text; readers accept 2.0 and 2.1. All 99 existing regression tests passed. | User selected sensitive-path redaction with approved route structure. Await route templates or confirmation to configure later in Settings. History design is not yet implemented. |
| November 19, 2026 | Laboratory planning | Added Phase 0A immediately after Phase 0: isolated synthetic fixtures, expected-outcome manifest, interactive dashboard, manual/interactive scenarios, and integration with existing Playwright tests. Existing phase numbers and progress preserved. | Inventory existing fixtures and establish the manifest before expanding automation. Laboratory implementation items remain open. |
| November 19, 2026 | Path policy clarified | User approved full URL paths without query strings, superseding the earlier sensitive-segment redaction direction. Fragments and credentials remain excluded. Updated the evidence contract. | No route templates are required; verify the approved boundary across exports and persistence. |
| November 19, 2026 | Path verification and laboratory inventory | Added a passing cross-boundary privacy regression covering export, queued recovery, retry, folder save, and JSON/HTML reporting. Existing sitemap regression verifies query/fragment exclusion. [Inventory](LABORATORY-INVENTORY.md) maps reusable tests and measures 70 configured axe rules. | Verify the external GitLab/AI workflow and field dependencies; complete criterion-level fixture dispositions before laboratory expansion. |
| November 19, 2026 | Dependencies clarified and checks complete | User clarified GitLab/AI workflow belongs to the work application, so it does not block extension-local development. Applicable retention policy is unknown; no automatic cleanup added. All 23 focused privacy/persistence/reporting tests passed. | Continue extension-local Phase 0 assessment and laboratory preparation. Keep retention approval and future work-app integration dependencies open. |
| November 19, 2026 | Storage assessment | Added a read-only size/count analyzer and [history storage design](EVIDENCE-STORAGE-DESIGN.md). Measured formatting, passing-check volume and repeated targets. Retained JSON and all existing evidence. | Implement schema/identity helpers and durable event queue before claiming historical preservation. Performance baseline remains open. |
| November 19, 2026 | Local preservation foundation | Added a separate durable snapshot store before recovery-queue coalescing, canonical retry deduplication, and visible capacity failures without eviction. Focused tests passed for intermediate scans/reviews, reload, pending deletion and full-store failure. No historical-preservation completion boxes checked. | Complete folder archival, portable export, legacy/disk-merged review capture, and event identities before releasing history preservation. |
| November 19, 2026 | Preservation validation and export | Full suite passed 102 tests after snapshot retention. Added Settings portable evidence export without deletion; all 14 affected history/Settings/recovery tests then passed, including the new download regression. | Complete folder archival and capacity recovery, then capture legacy and disk-merged reviews. Full historical preservation remains open. |
| November 19, 2026 | Verified folder archival | Added explicit Settings archival into a dedicated history directory with content-addressed snapshots, read-back verification, retry reuse, conflict protection and release of verified local staging copies. All 32 affected tests passed, including full-capacity recovery; extension build succeeded. No archive files are automatically deleted. | Preexisting disk evidence and disk-merged reviews still need preservation before the original-failures gap can close. Native folder permissions require a manual browser check. |
| November 19, 2026 | Original disk failures and merged reviews | Folder saves now retain incoming, validated previous disk, and final merged snapshots before replacement. Preservation failures leave the old report intact and attempted recoverable save queued. All 112 regression tests passed. Marked original-failure verification complete for the tested folder-save workflow. | Complete browser-download-only history and event-ledger coverage; independent-writer/native-permission checks remain outside automated guarantees. |
