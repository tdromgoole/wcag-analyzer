# Access Lens Regression Laboratory

A local synthetic fixture site. It is separate from the extension build and never requires the secured application, application source, database, credentials or live user data. The laboratory is not published or deployed.

## Open the laboratory

1. Run `npm run lab` from the repository.
2. Open **http://127.0.0.1:4178/laboratory/**.
3. Filter by expected outcome and open a scenario's isolated page.
4. To inspect it with the installed extension, use the normal extension toolbar action. Follow the fixture's manifest instructions and environment assumptions.

Stop the server with Ctrl+C. Port 4178 is shared with the existing Playwright test server; reuse the existing instance rather than starting another on the same port. Only loopback is bound. The default synthetic page at `/` remains unchanged for existing tests.

## Run expected-versus-actual checks

Run `npm run test:lab`. Playwright validates the manifest and coverage index, opens each fixture, applies declared interactions, and runs the real scanner/export pipeline. The initial profile uses headless Chrome at 1280 × 800 without extension screenshot capture permission or screen-reader automation.

The reporter writes `test-results/laboratory-run.json`. Load it with **Load recorded run** on the dashboard. The file includes scanner/engine versions, manifest/fixture versions, run and scan IDs, viewport, timestamps, per-case comparisons and outstanding manual evaluation. It contains synthetic run metadata rather than production page reports. Generated results and screenshots are ignored by Git.

The dashboard labels unrun scenarios as expectations, recomputes comparisons against current expected counts, flags version mismatches, and treats all loaded runs as historical evidence whose freshness must be established by rerunning. It does not authenticate uploaded files or certify conformance.

## Current scope

- 48 isolated scenarios, including image buttons, graphical controls, keyboard focus, timing, a two-page process and local multimedia; fixture version 10.
- 26 automated expectation comparisons, including review candidates and rule-level non-applicability; twenty-two dedicated human evaluations remain outstanding. Eight additional automated review-candidate cases also have blank human review entries; matching their scanner expectations does not complete that review.
- All 55 criteria have explicit dispositions. Twenty-one currently have partial/manual fixture links; 34 still need dedicated cases. Existing scanner regression tests provide additional behavior coverage but are not silently counted as complete laboratory coverage.
- Passing a rule's element check does not pass a complete WCAG criterion. Inapplicable rule output does not establish page-wide non-applicability.
- The gradient scenario deliberately uses the no-capture profile and expects an incomplete measurement; screenshot-enabled contrast remains covered by the existing separate contrast tests.
- The unannounced dynamic status fixture is a known failing example. The automated test confirms the criterion stays incomplete; it never claims that a screen-reader review ran.

## Maintain cases

Keep expectations in `manifest.json` separate from actual results. Each case has a stable ID, category, criterion references, isolated fixture route, known condition, expected scanner method/outcome, scoped rule/target counts, interaction steps and human instructions. `coverage.json` accounts for the complete criterion catalog, with partial, manual-only or not-yet-covered dispositions.

Run `node laboratory/validate-manifest.js` after edits. Bump `fixtureVersion` when changing fixture behavior or expected outcomes, and update reciprocal coverage links. Reuse existing proven scanner fixtures where possible. Add passing and failing pairs and meaningful manual/non-applicability cases without inventing whole-criterion coverage. Avoid putting intentional failures in the dashboard.

Run `node scripts/sync-laboratory-coverage.js` to regenerate the criterion-to-case index after manifest changes. It labels linked coverage partial/manual-only and never declares a criterion complete. Table header-association cases scope the result to the table element because axe reports `td-headers-attr` at table level, not once per cell.

### Responsive test conditions

Cases may override the manifest's default viewport. Reflow examples explicitly run at 320 × 800 CSS pixels; their observed viewport is saved in each result, and the dashboard refuses a matched comparison when the recorded viewport differs. Geometry assertions verify deliberate overflow versus wrapping, but do not establish complete zoom/reflow conformance or preserved functionality in every state. See [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Pointer examples use 10 × 10 pixel controls separated by 2 pixels as a negative condition, and 44 × 44 pixel controls as a generous positive condition. The AA minimum is 24 × 24 CSS pixels or a qualifying exception; 44 is not the AA minimum. The small-target case deliberately avoids relying on the spacing/inline exceptions. See [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### Form validation and text spacing

Validation fixtures reveal an error after activating Validate code. Independent browser assertions check visible feedback, invalid state, correction text, and whether the field's description reference resolves to the error element. Actual identification, guidance and announcement assessments remain outstanding.

Text-spacing fixtures run the existing `accessLensChecks.textSpacing()` API. Counts are scoped to the target paragraph: one new clipping candidate for the constrained case and zero for the flexible case. Tests verify exact inline-style restoration and prevent either measurement from becoming a whole-criterion Pass. The manifest's `spacing` method represents measured review candidates, not a new automated WCAG verdict.

### Image buttons and graphical controls

Image-input pairs test `input-image-alt` with missing versus functional alternatives. Graphical-arrow pairs both pass accessible naming, while their solid fills fall on opposite sides of the 3:1 contrast threshold. Independent tests check those fixture colors, native keyboard activation and expanded state. Criterion 1.4.11 remains manual-outstanding: naming, text contrast and a solid-fill calculation do not establish all relevant graphical/control states or exceptions. See [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

### Multimedia review candidates

Four scenarios use checked-in synthetic WebM clips: missing captions, a captions track, a subtitles track requiring interpretation, and silent video. Independent browser tests decode the clips, verify audio-track presence/absence and load the caption cue. Playback in those tests is muted.

The supplemental check measures caption-track presence only. It cannot establish caption accuracy, synchronization, meaningful sound coverage, or whether audio exists. Even the silent example remains a review candidate until its criterion-specific non-applicability is established. See [asset provenance](assets/README.md) and the blank manual review records.

### Keyboard focus conditions

Four focus cases use a manifest `press` step to Tab from the start button to the target. Browser tests verify retained keyboard focus, focus-visible state, the intended outline difference, opaque-cover geometry and stacking, and forward/reverse recovery. Screenshots support visual fixture inspection. These observations do not complete the manual evaluation.

The hidden-indicator example suppresses focus styling without removing keyboard focus. The obstruction pair concerns whether the focused component itself is entirely hidden by author-created content; partial obstruction is a separate condition. See W3C guidance for [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) and [Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Use the per-case instructions for visual review; NVDA speech is not a substitute for observing these visual conditions.

### Timing and multi-page processes

Timers start only on request and expire after 30 seconds. The extension example warns immediately and allows ten keyboard-operable extensions, each restarting the 30-second window. The fixed-limit negative example offers no way to preserve the active attempt beyond expiry. Reset abandons the attempt and stops its timer. Independent tests advance Playwright's browser clock; they do not verify actual warning perception or speech. See [W3C timing guidance](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html).

The two-page process carries only the fixed synthetic value Cedar Loop in tab-local session storage. The negative confirmation page requires re-entry; the positive page auto-populates it. Direct entry without the first step redirects to the start. Completion/reset clears the temporary value. Tests assert both actual navigation and the evaluated page; dashboard imports from the wrong evaluated state cannot appear matched. See [W3C redundant-entry guidance](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html).

### Opt-in keyboard cycle

The deliberate trap is inactive until Start is chosen. It cycles Tab/Shift+Tab between two controls. Read its warning first: recover with browser Reload (Ctrl+R), or click Reset with a pointer. Browser shortcuts are not intercepted. The paired positive example allows normal forward/reverse exit. Tests use bounded navigation and verify reset/reload recovery; they do not complete human evaluation.

### Optional stress profile

Open [the combined stress page](stress.html) and generate 10, 40 or 100 groups of image, button and form pairs. It starts empty and can be cleared. It is separate from the isolated manifest and contributes no new criterion coverage.

Run `npm run test:lab:stress` for the separate 10/100-group profile. It checks scoped positive/negative rule counts through the real scanner/export pipeline and attaches measured timings as observations. It has no timing pass threshold and does not run NVDA. The default browser suite does not include this optional lane.

For scanner accuracy/performance changes, run the relevant existing regressions and `npm run test:lab`. Broader criterion coverage remains planned; existing examples do not exhaust each criterion.

## NVDA verification at work

The selected manual environment is NVDA with Chrome or Edge. Follow [the manual protocol](manual-nvda.html), which references the official NV Access guide for keyboard modes. Copy [the blank evidence template](manual-record-template.json) and record the installed versions and actual observations. Test each browser separately if both are in scope. The user will perform these checks at work; [the workplace checklist](../WORK-FOLLOW-UPS.md) tracks them.

Playwright checks the status-region DOM and retained trigger focus, managed dialog entry/close/return focus, deliberate missing-focus condition, and native/pointer-only action behavior. It does not listen to NVDA, verify announcements, or change human evaluation results to Pass. All template entries begin not-tested; the automated run continues to report manual-outstanding.

### Planned real-NVDA automation

[Guidepup](https://www.guidepup.dev/docs/screen-reader-testing/testing-nvda) can control real NVDA and inspect speech output through its Playwright integration. A separate opt-in Windows/headed-browser lane is drafted. The browser-only limitations above describe the current verified implementation, not a limitation of Playwright combined with Guidepup. Selected checks may move from outstanding to automated NVDA evidence after successful real runs; human judgment and untested environments remain explicit.

**Current setup:** Dependencies and portable NVDA are installed locally; opt-in lane source is drafted. Initial smoke attempts failed to verify the intended heading, and further testing is deferred. [NVDA setup notes](../NVDA-SETUP.md) record the exact state. Browser-only commands do not run that lane.
