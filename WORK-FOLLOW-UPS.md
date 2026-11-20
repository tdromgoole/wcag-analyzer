# Work Follow-ups — Accessibility Scanner

**Updated:** November 19, 2026  
**Purpose:** Track information and decisions to resolve at work. Extension implementation progress stays in [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md).

## 1. Records Retention and Archival Policy

**Status:** Unresolved — applicable policy is not yet known.

- [ ] Ask the organization's records management authority which Texas agency records schedule/classification applies to accessibility audit evidence.
- [ ] Confirm whether scan evidence, compliance reports, technical diagnostics, and working files have different requirements.
- [ ] Confirm any preservation holds or other restrictions that affect archival and deletion.
- [ ] Identify who approves the retention, archival, and deletion policy.
- [ ] Obtain the approved policy or a reference to its authoritative location.
- [ ] Record the decision below and bring the relevant requirements back to the extension plan.

**Current development decision:** Do not add automatic evidence cleanup while policy approval is outstanding. No fixed retention period or number of retained scans is assumed. Existing user-operated deletion controls are not an approved compliance retention policy.

**Decision / policy reference:** Pending.

**Contact / owner:** To identify at work.

## 2. Work-Application GitLab and AI Remediation Integration

**Status:** Future integration dependency — this workflow belongs to the work application, not the extension repository.

- [ ] Locate the work application's GitLab/AI remediation instructions and identify their owner.
- [ ] Identify which exported JSON fields the existing remediation workflow consumes.
- [ ] Confirm compatibility with schema 2.1, which omits verbatim image alternative text while retaining structural technical evidence.
- [ ] Confirm developer review and approval requirements for AI-proposed source and audit-record changes.
- [ ] Identify where the work-app workflow should record accessibility impact assessments and proposed **Needs Review** updates.
- [ ] Confirm that AI has no application-login or database-execution access.
- [ ] Share an approved workflow summary or sanitized field requirements for the extension's future integration work.

**Current development decision:** Continue extension-local assessment, fixtures, and tests independently. Do not invent work-app integration requirements or add application source metadata to browser exports.

**Workflow location / field dependencies:** Pending.

**Contact / owner:** To identify at work.

## 3. Future Secured Reporting Module

**Status:** Later-phase coordination — begin implementation after the evidence contract stabilizes.

- [ ] Identify the application owner responsible for authorizing the PHP reporting module.
- [ ] Confirm which existing authorization controls should protect imports, reports, and PDF exports.
- [ ] Confirm the approved application-side import process and who may execute database scripts.
- [ ] Confirm how audit records will remain logically separated from operational application data.
- [ ] Confirm requirements for date-specific reports, scan-run reports, historical evidence, and auditor attribution.

**Current development decision:** Keep database integration optional and outside the standalone extension. AI may propose database scripts but must not execute work-application database operations.

**Decisions / references:** Pending.

## Confirmed Decisions — No Follow-up Needed

- Full URL paths are allowed in evidence; query strings, fragments, and embedded credentials are excluded.
- The regression laboratory uses synthetic content and remains independent of the secured application.
- Auditor names are self-declared attribution, not authenticated identity; future authenticated-user mapping belongs to later integration work.
- Missing auditor names do not block scans. Unknown scan/review attribution remains unknown after a later profile is entered. Names are an explicitly disclosed personal-information exception in evidence.
- Auditors use separate browser profiles or computers. One local auditor profile is sufficient; no shared-auditor picker is planned. IDs identify local profiles, not authenticated people across computers.
- Auditor IDs remain installation-specific when moving computers/profiles. Any later mapping of those IDs to the same person belongs to the secured work application; no profile export/import is required.

## Representative Application Performance — When Available

- [ ] Compare small, medium and large application pages with the [synthetic performance baseline](PERFORMANCE-BASELINE.md).
- [ ] Include an image/gradient contrast case, a modal/tab state and an actual selected-folder save.
- [ ] Record only sizes, timings, scope and sanitized diagnostic outcomes; do not copy application content or credentials into this repository.

**Current development decision:** Synthetic performance measurement does not require access to the secured application. Application-specific timings remain a workplace validation task.

## NVDA Manual Laboratory Verification — At Work

**Status:** Not performed. User selected NVDA with Chrome or Edge and will perform the human checks at work.

- [ ] Review the four multimedia cases introduced in fixture version 6: listen to the synthetic audio, assess caption accuracy and timing, interpret the subtitles example, and confirm the silent clip's criterion-specific non-applicability. Caption-track presence alone does not complete these reviews.
- [ ] Review the four keyboard-focus cases introduced in fixture version 7: Tab from the start button, visually compare suppressed/visible indicators and covered/uncovered controls, then verify forward/reverse navigation to recovery controls. Record actual visual observations; NVDA speech alone cannot establish them.
- [ ] Review timing examples: start explicitly, assess the immediate warning and ten available extensions, observe expiry, and reset. Fake-clock tests do not establish human warning perception.
- [ ] Complete both two-page synthetic processes and assess repeated entry versus auto-population. No essential, security or invalid-data exception is claimed in these examples.
- [ ] Read the opt-in keyboard-trap warning before activating it. Use only a few navigation steps, then recover through browser Reload (Ctrl+R) or pointer Reset. Compare with the normally escapable group. The version 9 blank template contains 28 unperformed review entries across all categories.

- [ ] Start the local laboratory with `npm run lab`; open http://127.0.0.1:4178/laboratory/.
- [ ] Read the [NVDA manual protocol](laboratory/manual-nvda.html) and copy [the blank review template](laboratory/manual-record-template.json) into a new results file.
- [ ] Record actual Windows, NVDA, browser and scanner versions, keyboard layout, relevant NVDA settings, fixture version, review time and reviewer attribution. Record Chrome and Edge trials separately when testing both.
- [ ] Test unannounced and announced status updates. Record actual speech and whether focus stays on the trigger; do not infer spoken output from the DOM alone.
- [ ] Test the managed dialog: initial field focus, announced name/role, forward and reverse navigation, Escape/Close, and return focus.
- [ ] Test the missing-focus dialog and record the observed failure. Close or reload to reset; do not create a keyboard trap.
- [ ] Test the native button with Enter and Space, and the pointer-only negative example with sequential keyboard navigation.
- [ ] Fill only observations from performed checks; leave other statuses not-tested. Record unexpected behavior and uncertainty rather than changing expected outcomes to match.
- [ ] Bring back the sanitized manual results. Do not mark an automated laboratory run as a completed NVDA review.

**Current development decision:** Browser-only tests verify fixture DOM, focus, actions and measured candidates. Human evaluations remain unperformed. The dashboard does not yet import or certify manual-review records; retain the completed copy separately.

**Current fixture version:** Version 5 has ten dedicated human-evaluation cases and four additional automated review-candidate cases in the blank review template. Use the latest template, recording the actual fixture version; do not relabel a previously performed review as a new-version review.

- [ ] Review the fixed-width and wrapping reflow examples at their declared 320 CSS-pixel width. Record any lost text/functionality and two-dimensional scrolling, not just an overflow count.
- [ ] Keep actual browser zoom/page-state testing and applicable layout exceptions explicit. A 320-pixel geometry assertion is not a blanket reflow certification.
- [ ] Review both form-validation examples: error identification, correction guidance, field/error association and actual NVDA announcement behavior when testing resumes.
- [ ] Review text-spacing, generic image-description and gradient candidates visually/contextually. A matched scanner candidate count does not complete human evaluation.
- [ ] Review the version 10 graphical-control contrast pair and image buttons. Check functional alternatives, meaningful visual cues and relevant control states separately. The two named graphical buttons deliberately differ in visual contrast; passing a name rule does not complete that review. The blank template now contains 30 unperformed records.

### Real NVDA Automation Pilot

- [ ] Identify the Windows workstation or runner where Guidepup/NVDA automation may run with a visible interactive browser.
- [ ] Confirm the actual NVDA and Chrome/Edge versions to exercise; keep each environment's evidence separate.
- [ ] Follow the [official Guidepup machine setup](https://www.guidepup.dev/docs/guides/machine-setup) for machine configuration and compatible screen-reader assets after project dependencies are installed.
- [ ] Run the future opt-in NVDA pilot and retain actual speech-output evidence and setup/runtime failures.
- [ ] Reclassify individual outstanding checks only after the real screen-reader assertions succeed. Keep contextual human assessments separate.

**Status:** Planned. Guidepup can automate real NVDA; the current browser-only test results do not include it. No workplace setup or package installation was performed in this planning update.

**Local-computer update:** Portable NVDA and pinned Guidepup packages are now installed on the development computer. Its real-NVDA smoke checks did not pass, and further verification is explicitly deferred. See [NVDA-SETUP.md](NVDA-SETUP.md). This does not complete the workplace setup or human review checklist.

## Resolution Log

When an item is resolved, record the date, decision, approved reference, and affected plan section. Avoid copying credentials, sensitive application data, or confidential source material into this file.

| Date | Item | Decision / approved reference | Plan update needed |
|---|---|---|---|
| November 19, 2026 | Initial handoff | Work-app workflow is external; retention policy is unknown. | Keep these dependencies open; continue independent extension work. |
