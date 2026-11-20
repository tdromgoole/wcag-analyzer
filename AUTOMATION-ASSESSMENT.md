# Criterion Automation and Applicability Assessment

**Date:** November 19, 2026

Measured from the installed axe-core 4.14.0, the actual scanOptions() rule selection and the extension's 55-criterion catalog. The current configuration selects 70 rules, mapped to 23 criteria. Supplementary candidates/stress measurements extend evidence to 25 criteria. None of these counts establishes complete criterion automation or page-wide applicability.

## Interpretation

- Rule results describe the tested condition and element. An inapplicable rule is not a criterion-wide Not Applicable decision.
- Candidate checks identify elements for review, including unsupported measurements. Zero candidates does not establish absence of all relevant content.
- Remaining instruction text below is the existing human checklist; naming a rule does not replace that instruction. Keyboard transcripts and screenshot-based contrast add bounded evidence, rather than new blanket criterion passes.
- Full-page, page-set, process and accessibility-support checks remain separate. Embedded frames, closed shadow roots, hidden states, later content, canvas/custom media and cross-page behavior prevent simple absence tests from certifying whole-page non-applicability.

## Current criterion map

| Criterion | Selected axe rules (partial evidence) | Supplementary candidates / measurements | Existing human evaluation |
|---|---|---|---|
| 1.1.1 Non-text Content | aria-meter-name, aria-progressbar-name, image-alt, input-image-alt, object-alt, role-img-alt, svg-img-alt | None mapped | Review every image, icon, chart, CAPTCHA, and other non-text item in context. Verify equivalent alternatives and decorative exclusions. |
| 1.2.1 Audio-only and Video-only (Prerecorded) | audio-caption | None mapped | Review prerecorded audio-only and video-only content for equivalent text or audio alternatives, including essential information. |
| 1.2.2 Captions (Prerecorded) | video-caption | video-captions | Watch every prerecorded synchronized media item. Verify accurate synchronized captions include speakers and meaningful sounds. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | None selected | None mapped | Verify essential visual information in prerecorded synchronized media has audio description or an equivalent full media alternative. Check the normative exceptions. |
| 1.2.4 Captions (Live) | None selected | None mapped | Review live synchronized media for accurate, timely captions, including meaningful sounds and speaker identification. |
| 1.2.5 Audio Description (Prerecorded) | None selected | None mapped | Listen without watching prerecorded video. Verify essential visual information is supplied through audio description. |
| 1.3.1 Info and Relationships | aria-hidden-body, aria-required-children, aria-required-parent, definition-list, dlitem, list, listitem, p-as-heading, table-fake-caption, td-has-header, td-headers-attr, th-has-data-cells | None mapped | Inspect headings, lists, tables, groups, instructions, and forms with assistive technology. Verify visually conveyed relationships are programmatically available or explained in text. |
| 1.3.2 Meaningful Sequence | None selected | None mapped | Read the page with a screen reader and inspect DOM order. Verify meaningful sequence survives styling changes and responsive layouts. |
| 1.3.3 Sensory Characteristics | None selected | None mapped | Review instructions for dependence only on shape, size, position, orientation, or sound. Verify additional identifying information. |
| 1.3.4 Orientation | css-orientation-lock | None mapped | Use portrait and landscape orientations. Verify content and operation are available in both unless a specific orientation is essential. |
| 1.3.5 Identify Input Purpose | autocomplete-valid | input-purpose | Review fields collecting user information against the WCAG input-purpose taxonomy. Verify supported programmatic purpose, such as appropriate autocomplete tokens. |
| 1.4.1 Use of Color | link-in-text-block | None mapped | Inspect errors, links, charts, selections, and statuses without color. Verify color is not the only means of conveying information or action. |
| 1.4.2 Audio Control | no-autoplay-audio | autoplay-media | Check audio that starts automatically for more than three seconds. Verify pause/stop or independent volume control. |
| 1.4.3 Contrast (Minimum) | color-contrast | None mapped | Measure text in every state and over images, gradients, and overlays. Verify 4.5:1 for normal text and 3:1 for qualifying large text; review exceptions. |
| 1.4.4 Resize Text | meta-viewport | text-clipping | Resize text to 200% without assistive technology. Verify no loss of content or function, including controls and error messages. |
| 1.4.5 Images of Text | None selected | None mapped | Find text rendered as images. Verify real text is used where the presentation is achievable, except customizable or essential presentations. |
| 1.4.10 Reflow | None selected | horizontal-overflow, text-clipping | Test at 320 CSS pixels wide and 256 CSS pixels high as applicable, including 400% zoom. Verify content and functionality without two-dimensional scrolling except permitted content. |
| 1.4.11 Non-text Contrast | None selected | None mapped | Measure essential control boundaries, states, focus indicators, and graphical information against adjacent colors. Verify 3:1 where required and review exceptions. |
| 1.4.12 Text Spacing | avoid-inline-spacing | text-spacing (on demand) | Apply line height 1.5, paragraph spacing 2, letter spacing .12, and word spacing .16 times font size without changing other styles. Verify no content or function is lost. |
| 1.4.13 Content on Hover or Focus | None selected | None mapped | Trigger all hover/focus popups. Verify dismissibility, pointer hoverability, and persistence as required, including keyboard operation and exceptions. |
| 2.1.1 Keyboard | frame-focusable-content, scrollable-region-focusable, server-side-image-map | None mapped | Complete all tasks using keyboard only. Test custom widgets, menus, dialogs, media, and each interactive state; review the path-dependent input exception. |
| 2.1.2 No Keyboard Trap | None selected | None mapped | Enter and leave every component using the keyboard. Verify focus can escape and any nonstandard exit method is explained. |
| 2.1.4 Character Key Shortcuts | None selected | None mapped | Test single-character shortcuts, including with speech input. Verify they can be disabled/remapped or operate only when the relevant component has focus. |
| 2.2.1 Timing Adjustable | meta-refresh | None mapped | Exercise sessions and timed tasks. Verify users can turn off, adjust, or extend time limits unless a normative exception applies. |
| 2.2.2 Pause, Stop, Hide | blink, marquee | autoplay-media, long-animation | Review moving, blinking, scrolling, and auto-updating information. Verify required pause, stop, hide, or update-frequency controls and exceptions. |
| 2.3.1 Three Flashes or Below Threshold | None selected | None mapped | Review all animations and videos using suitable flash-analysis methods. Verify flash rate/area stays within the normative thresholds; do not rely on visual guessing. |
| 2.4.1 Bypass Blocks | bypass | None mapped | Test skip links, headings, landmarks, or other mechanisms with keyboard and assistive technology to bypass repeated blocks. |
| 2.4.2 Page Titled | document-title | None mapped | Verify the page title describes its topic or purpose, including application routes and changed contexts. |
| 2.4.3 Focus Order | None selected | positive-tabindex | Follow sequential focus through complete tasks, dialogs, and dynamic changes. Verify order preserves meaning and operability. |
| 2.4.4 Link Purpose (In Context) | area-alt, link-name | None mapped | Review every link with its programmatically determined context. Verify purpose can be understood, subject to the normative exception. |
| 2.4.5 Multiple Ways | None selected | None mapped | Review the set of pages for at least two ways to locate pages, except process steps/results. Test search, navigation, indexes, or sitemap as applicable. |
| 2.4.6 Headings and Labels | None selected | None mapped | Review headings and labels in context. Verify they describe the topic or purpose accurately. |
| 2.4.7 Focus Visible | None selected | None mapped | Use keyboard navigation through every state. Verify each keyboard-operable interface has a visible focus indicator. |
| 2.4.11 Focus Not Obscured (Minimum) | None selected | None mapped | Tab through all controls at responsive sizes and zoom, including sticky headers and overlays. Verify author-created content never entirely hides the focused component. |
| 2.5.1 Pointer Gestures | None selected | None mapped | Test multipoint and path-based gestures. Verify a single-pointer alternative without a path-based gesture, unless the gesture is essential. |
| 2.5.2 Pointer Cancellation | None selected | None mapped | Test pointer actions for accidental activation. Verify appropriate up-event activation, abort/undo, or another permitted cancellation behavior; review essential exceptions. |
| 2.5.3 Label in Name | label-content-name-mismatch | None mapped | Compare each visible text label with its accessible name. Verify the name contains the visible text and test speech activation. |
| 2.5.4 Motion Actuation | None selected | None mapped | Test device/user motion actions. Verify conventional interface alternatives and the ability to disable motion response, except permitted cases. |
| 2.5.7 Dragging Movements | None selected | None mapped | Exercise each drag operation with a single pointer without dragging. Verify an equivalent alternative unless dragging is essential or an unmodified user-agent feature. |
| 2.5.8 Target Size (Minimum) | target-size | None mapped | Measure pointer targets and spacing in every state. Verify 24 by 24 CSS pixels or a qualifying spacing/other exception using the normative definition. |
| 3.1.1 Language of Page | html-has-lang, html-lang-valid, html-xml-lang-mismatch | None mapped | Verify the programmatic primary language matches the page and is announced correctly by assistive technology. |
| 3.1.2 Language of Parts | valid-lang | None mapped | Review passages in other languages. Verify programmatic language identification where required; review names, technical terms, and other exceptions. |
| 3.2.1 On Focus | None selected | None mapped | Focus every component. Verify focus alone does not trigger a change of context. |
| 3.2.2 On Input | None selected | None mapped | Change each input and selection. Verify changes do not unexpectedly change context unless users were advised beforehand. |
| 3.2.3 Consistent Navigation | None selected | None mapped | Compare repeated navigation across the page set. Verify its relative order stays consistent unless the user initiates a change. |
| 3.2.4 Consistent Identification | None selected | None mapped | Compare components with the same functionality across pages. Verify consistent identification. |
| 3.2.6 Consistent Help | None selected | None mapped | Compare repeated help mechanisms across the page set. Verify they appear in consistent relative order unless a user initiates the change. |
| 3.3.1 Error Identification | None selected | None mapped | Submit invalid/missing data through each form. Verify automatically detected errors identify the affected item and describe the error in text. |
| 3.3.2 Labels or Instructions | form-field-multiple-labels | None mapped | Review every input for needed labels and instructions, including formats, required fields, and constraints before entry. |
| 3.3.3 Error Suggestion | None selected | None mapped | Trigger correctable input errors. Verify helpful correction suggestions when known, except where security or purpose would be compromised. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | None selected | None mapped | Exercise legal/financial submissions, stored user-data modification/deletion, and test responses. Verify reversibility, checking with correction, or review/confirmation as required. |
| 3.3.7 Redundant Entry | None selected | None mapped | Complete multistep processes. Verify previously entered information is auto-populated or selectable unless an essential, security, or validity exception applies. |
| 3.3.8 Accessible Authentication (Minimum) | None selected | None mapped | Complete login, MFA, and recovery. Verify cognitive tests have a permitted alternative/assistance or exception. Test password-manager support and paste, including verification codes. |
| 4.1.2 Name, Role, Value | area-alt, aria-allowed-attr, aria-braille-equivalent, aria-command-name, aria-conditional-attr, aria-deprecated-role, aria-hidden-body, aria-hidden-focus, aria-input-field-name, aria-prohibited-attr, aria-required-attr, aria-roledescription, aria-roles, aria-tab-name, aria-toggle-field-name, aria-tooltip-name, aria-valid-attr-value, aria-valid-attr, button-name, duplicate-id-aria, frame-title-unique, frame-title, input-button-name, input-image-alt, label, link-name, nested-interactive, select-name, summary-name | None mapped | Inspect every standard and custom control with assistive technology. Verify names, roles, settable states/values, and notifications of changes. |
| 4.1.3 Status Messages | None selected | None mapped | Trigger success, errors, progress, and dynamic results. Verify required status messages are programmatically available without moving focus. |

## Next implementation boundaries

Do not add automatic criterion-wide Not Applicable from missing native video/form elements alone. First inventory relevant content and unresolved scope, preserve structured reasons and reevaluate each scan. Cases requiring context or complete processes retain human decisions. A future applicability implementation must distinguish observed absence in the evaluated state from complete criterion non-applicability, and must not silently clear existing failures or stale reviews.

The new image-button and graphical-control laboratory pairs demonstrate why accessible names and text-contrast results cannot substitute for visual non-text contrast review. The laboratory's missing criterion fixtures remain explicit in coverage.json.
