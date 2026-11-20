globalThis.accessLensWorkflow = {
  async sitemap(address = location.href, discover = true) {
    const current = new URL(address);
    const addresses = new Map([[current.href, current]]);
    for (const link of discover ? document.querySelectorAll('a[href]') : []) {
      if (addresses.size >= 200) break;
      try {
        const url = new URL(link.href);
        if (url.origin === current.origin && ['http:', 'https:'].includes(url.protocol)) addresses.set(url.href, url);
      } catch { /* Ignore malformed and non-page links. */ }
    }
    const labels = new Map(), nodes = new Map();
    async function id(url, configuration) { return (await accessLensFilename(url, '', configuration)).slice(12, -5); }
    for (const url of addresses.values()) {
      const paths = ['/'];
      const parts = url.pathname.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) paths.push('/' + parts.slice(0, i).join('/'));
      if (url.pathname !== '/') paths.push(url.pathname);
      let parent = null;
      for (const path of [...new Set(paths)]) {
        const href = url.origin + path;
        const key = await id(href, {});
        labels.set(key, { path, href });
        const previous = nodes.get(key);
        nodes.set(key, { id: key, parent, path, linked: previous?.linked || path === url.pathname });
        parent = key;
      }
      const routeKey = await id(url.href);
      if (routeKey !== parent) {
        const previous = nodes.get(routeKey);
        nodes.set(routeKey, { id: routeKey, parent, path: url.pathname, linked: true });
        labels.set(routeKey, { path: `${url.pathname} [route ${routeKey.slice(0, 8)}]`, href: url.href });
        // The base path is a group when only a configured route was linked.
        const base = nodes.get(parent);
        if (base && !previous) base.linked = addresses.has(url.origin + url.pathname);
      }
    }
    return { site: await id(current.origin + '/', {}), current: await id(current.href), nodes: [...nodes.values()], labels };
  },
  checklist: [
    ['keyboard', 'Keyboard navigation', 'Use Tab, Shift+Tab, Enter, Space, and arrow keys. Confirm every control works and there are no keyboard traps.'],
    ['focus', 'Visible focus', 'Follow focus through every control. Confirm the indicator remains visible and is not obscured.'],
    ['dialogs', 'Dialogs and menus', 'Open each dialog/menu. Check initial focus, Escape, appropriate focus containment, and focus returning to the trigger.'],
    ['zoom', 'Zoom and reflow', 'Check 200% text resizing and 400% browser zoom. Confirm content and controls remain usable without loss or unnecessary horizontal scrolling.'],
    ['reader', 'Screen reader', 'Check reading order, names, roles, states, landmarks, form errors, and live updates with a screen reader.'],
    ['content', 'Content review', 'Review image descriptions, heading meaning, link purpose, instructions, and error messages in context.']
  ],
  guidance(id) {
    const entries = {
      'image-alt': ['Give informative images a description of their purpose; use empty alt for decorative images.', '<img src="…" alt="Describe the purpose here">', 'Review the image in context, then confirm its accessible name with a screen reader. Human judgment required.'],
      'button-name': ['Give the button a name describing its action.', '<button type="button">Save changes</button>', 'Focus the button with a screen reader and confirm its name describes the action.'],
      'link-in-text-block': ['Check whether this link is distinguishable from surrounding prose without relying on color alone. An isolated metadata link is different from a link embedded in a sentence.', 'a { text-decoration: underline; }', 'For color-only prose links, compare link color with surrounding text (3:1), and verify additional hover/focus cues. Text/background contrast is a separate check.'],
      'link-name': ['Provide meaningful link text or an accessible name.', '<a href="/help">Account help</a>', 'Read the link out of context and confirm its destination is clear.'],
      'label': ['Associate a visible label with each form control.', '<label for="email">Email</label><input id="email" type="email">', 'Click the label and confirm focus moves to the field; check the screen reader name.'],
      'color-contrast': ['Adjust foreground/background colors to meet the applicable contrast threshold.', '/* Example for normal text */\ncolor: #222; background-color: #fff;', 'Rescan and check hover, focus, disabled, and image/gradient backgrounds manually.'],
      'landmark-one-main': ['Wrap primary page content in one main landmark.', '<main>…</main>', 'Check landmark navigation and confirm the main landmark contains the primary content.'],
      'page-has-heading-one': ['Add a first-level heading describing the page purpose.', '<h1>Page purpose</h1>', 'Review the heading outline and confirm the heading is meaningful.'],
      'region': ['Place content within appropriate semantic landmarks.', '<main><section aria-labelledby="section-heading">…</section></main>', 'Check the complete landmark structure; avoid adding unnecessary named regions.'],
      'landmark-unique': ['Give repeated landmarks distinct names where needed.', '<nav aria-label="Primary">…</nav>\n<nav aria-label="Footer">…</nav>', 'Check landmark navigation and confirm each landmark is distinguishable.'],
      'html-has-lang': ['Declare the document language.', '<html lang="en">', 'Confirm the language matches the actual content and mark language changes.'],
      'heading-order': ['Use heading levels to reflect the content hierarchy.', '<h1>Page</h1>\n<h2>Section</h2>\n<h3>Subsection</h3>', 'Review the outline with a screen reader; choose levels by meaning, not appearance.']
    };
    const [fix, example, verify] = entries[id] || ['Review the rule reference and correct the underlying semantic, labeling, or interaction issue.', null, 'Rescan, inspect the accessibility tree, and test the affected interaction with keyboard and screen reader. Human review is required; a generic code change may not apply.'];
    return { fix, example, verify };
  },
  baseline(report) {
    return { scannedAt: report.scannedAt, issues: report.results.violations.flatMap(rule => rule.nodes.map((node, index) => ({
      rule: rule.id, target: node.target, impact: node.impact,
      key: JSON.stringify([rule.id, node.target.length ? node.target : ['unresolved', index]])
    }))) };
  },
  compare(previous, current) {
    if (!previous) return null;
    const before = new Map(previous.issues.map(issue => [issue.key, issue]));
    const after = new Map(current.issues.map(issue => [issue.key, issue]));
    return { previousScan: previous.scannedAt, new: [...after.values()].filter(issue => !before.has(issue.key)),
      remaining: [...after.values()].filter(issue => before.has(issue.key)),
      noLongerDetected: [...before.values()].filter(issue => !after.has(issue.key)) };
  },
  async state(slot = '0') {
    const states = [];
    function path(el) {
      const parts = [];
      while (el?.nodeType === 1) {
        parts.unshift([...el.parentNode.children].indexOf(el) + 1);
        if (el.parentElement) el = el.parentElement;
        else if (el.getRootNode().host) { parts.unshift('shadow'); el = el.getRootNode().host; }
        else break;
      }
      return parts;
    }
    function walk(scope) {
      for (const el of scope.querySelectorAll('*')) {
        if (el.id === 'access-lens-extension') continue;
        if (el.shadowRoot) walk(el.shadowRoot);
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const role = el.getAttribute('role');
        if ((el.localName === 'dialog' && el.open) || role === 'dialog' || role === 'alertdialog') states.push(['dialog', path(el)]);
        if (role === 'tab' && el.getAttribute('aria-selected') === 'true') states.push(['tab', path(el)]);
        if (el.getAttribute('aria-expanded') === 'true' || (el.localName === 'details' && el.open)) states.push(['expanded', path(el)]);
      }
    }
    walk(document);
    const source = JSON.stringify([slot, states]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { key, slot: Number(slot), dialogs: states.filter(s => s[0] === 'dialog').length, selectedTabs: states.filter(s => s[0] === 'tab').length, expandedControls: states.filter(s => s[0] === 'expanded').length };
  }
};

// WCAG 2.2 A/AA catalog. 4.1.1 is obsolete and is deliberately excluded.
// Source: https://www.w3.org/TR/WCAG22/ (W3C Recommendation).
(() => {
  const rows = [
    ['1.1.1','A','Non-text Content','non-text-content','Review every image, icon, chart, CAPTCHA, and other non-text item in context. Verify equivalent alternatives and decorative exclusions.'],
    ['1.2.1','A','Audio-only and Video-only (Prerecorded)','audio-only-and-video-only-prerecorded','Review prerecorded audio-only and video-only content for equivalent text or audio alternatives, including essential information.'],
    ['1.2.2','A','Captions (Prerecorded)','captions-prerecorded','Watch every prerecorded synchronized media item. Verify accurate synchronized captions include speakers and meaningful sounds.'],
    ['1.2.3','A','Audio Description or Media Alternative (Prerecorded)','audio-description-or-media-alternative-prerecorded','Verify essential visual information in prerecorded synchronized media has audio description or an equivalent full media alternative. Check the normative exceptions.'],
    ['1.2.4','AA','Captions (Live)','captions-live','Review live synchronized media for accurate, timely captions, including meaningful sounds and speaker identification.'],
    ['1.2.5','AA','Audio Description (Prerecorded)','audio-description-prerecorded','Listen without watching prerecorded video. Verify essential visual information is supplied through audio description.'],
    ['1.3.1','A','Info and Relationships','info-and-relationships','Inspect headings, lists, tables, groups, instructions, and forms with assistive technology. Verify visually conveyed relationships are programmatically available or explained in text.'],
    ['1.3.2','A','Meaningful Sequence','meaningful-sequence','Read the page with a screen reader and inspect DOM order. Verify meaningful sequence survives styling changes and responsive layouts.'],
    ['1.3.3','A','Sensory Characteristics','sensory-characteristics','Review instructions for dependence only on shape, size, position, orientation, or sound. Verify additional identifying information.'],
    ['1.3.4','AA','Orientation','orientation','Use portrait and landscape orientations. Verify content and operation are available in both unless a specific orientation is essential.'],
    ['1.3.5','AA','Identify Input Purpose','identify-input-purpose','Review fields collecting user information against the WCAG input-purpose taxonomy. Verify supported programmatic purpose, such as appropriate autocomplete tokens.'],
    ['1.4.1','A','Use of Color','use-of-color','Inspect errors, links, charts, selections, and statuses without color. Verify color is not the only means of conveying information or action.'],
    ['1.4.2','A','Audio Control','audio-control','Check audio that starts automatically for more than three seconds. Verify pause/stop or independent volume control.'],
    ['1.4.3','AA','Contrast (Minimum)','contrast-minimum','Measure text in every state and over images, gradients, and overlays. Verify 4.5:1 for normal text and 3:1 for qualifying large text; review exceptions.'],
    ['1.4.4','AA','Resize Text','resize-text','Resize text to 200% without assistive technology. Verify no loss of content or function, including controls and error messages.'],
    ['1.4.5','AA','Images of Text','images-of-text','Find text rendered as images. Verify real text is used where the presentation is achievable, except customizable or essential presentations.'],
    ['1.4.10','AA','Reflow','reflow','Test at 320 CSS pixels wide and 256 CSS pixels high as applicable, including 400% zoom. Verify content and functionality without two-dimensional scrolling except permitted content.'],
    ['1.4.11','AA','Non-text Contrast','non-text-contrast','Measure essential control boundaries, states, focus indicators, and graphical information against adjacent colors. Verify 3:1 where required and review exceptions.'],
    ['1.4.12','AA','Text Spacing','text-spacing','Apply line height 1.5, paragraph spacing 2, letter spacing .12, and word spacing .16 times font size without changing other styles. Verify no content or function is lost.'],
    ['1.4.13','AA','Content on Hover or Focus','content-on-hover-or-focus','Trigger all hover/focus popups. Verify dismissibility, pointer hoverability, and persistence as required, including keyboard operation and exceptions.'],
    ['2.1.1','A','Keyboard','keyboard','Complete all tasks using keyboard only. Test custom widgets, menus, dialogs, media, and each interactive state; review the path-dependent input exception.'],
    ['2.1.2','A','No Keyboard Trap','no-keyboard-trap','Enter and leave every component using the keyboard. Verify focus can escape and any nonstandard exit method is explained.'],
    ['2.1.4','A','Character Key Shortcuts','character-key-shortcuts','Test single-character shortcuts, including with speech input. Verify they can be disabled/remapped or operate only when the relevant component has focus.'],
    ['2.2.1','A','Timing Adjustable','timing-adjustable','Exercise sessions and timed tasks. Verify users can turn off, adjust, or extend time limits unless a normative exception applies.'],
    ['2.2.2','A','Pause, Stop, Hide','pause-stop-hide','Review moving, blinking, scrolling, and auto-updating information. Verify required pause, stop, hide, or update-frequency controls and exceptions.'],
    ['2.3.1','A','Three Flashes or Below Threshold','three-flashes-or-below-threshold','Review all animations and videos using suitable flash-analysis methods. Verify flash rate/area stays within the normative thresholds; do not rely on visual guessing.'],
    ['2.4.1','A','Bypass Blocks','bypass-blocks','Test skip links, headings, landmarks, or other mechanisms with keyboard and assistive technology to bypass repeated blocks.'],
    ['2.4.2','A','Page Titled','page-titled','Verify the page title describes its topic or purpose, including application routes and changed contexts.'],
    ['2.4.3','A','Focus Order','focus-order','Follow sequential focus through complete tasks, dialogs, and dynamic changes. Verify order preserves meaning and operability.'],
    ['2.4.4','A','Link Purpose (In Context)','link-purpose-in-context','Review every link with its programmatically determined context. Verify purpose can be understood, subject to the normative exception.'],
    ['2.4.5','AA','Multiple Ways','multiple-ways','Review the set of pages for at least two ways to locate pages, except process steps/results. Test search, navigation, indexes, or sitemap as applicable.'],
    ['2.4.6','AA','Headings and Labels','headings-and-labels','Review headings and labels in context. Verify they describe the topic or purpose accurately.'],
    ['2.4.7','AA','Focus Visible','focus-visible','Use keyboard navigation through every state. Verify each keyboard-operable interface has a visible focus indicator.'],
    ['2.4.11','AA','Focus Not Obscured (Minimum)','focus-not-obscured-minimum','Tab through all controls at responsive sizes and zoom, including sticky headers and overlays. Verify author-created content never entirely hides the focused component.'],
    ['2.5.1','A','Pointer Gestures','pointer-gestures','Test multipoint and path-based gestures. Verify a single-pointer alternative without a path-based gesture, unless the gesture is essential.'],
    ['2.5.2','A','Pointer Cancellation','pointer-cancellation','Test pointer actions for accidental activation. Verify appropriate up-event activation, abort/undo, or another permitted cancellation behavior; review essential exceptions.'],
    ['2.5.3','A','Label in Name','label-in-name','Compare each visible text label with its accessible name. Verify the name contains the visible text and test speech activation.'],
    ['2.5.4','A','Motion Actuation','motion-actuation','Test device/user motion actions. Verify conventional interface alternatives and the ability to disable motion response, except permitted cases.'],
    ['2.5.7','AA','Dragging Movements','dragging-movements','Exercise each drag operation with a single pointer without dragging. Verify an equivalent alternative unless dragging is essential or an unmodified user-agent feature.'],
    ['2.5.8','AA','Target Size (Minimum)','target-size-minimum','Measure pointer targets and spacing in every state. Verify 24 by 24 CSS pixels or a qualifying spacing/other exception using the normative definition.'],
    ['3.1.1','A','Language of Page','language-of-page','Verify the programmatic primary language matches the page and is announced correctly by assistive technology.'],
    ['3.1.2','AA','Language of Parts','language-of-parts','Review passages in other languages. Verify programmatic language identification where required; review names, technical terms, and other exceptions.'],
    ['3.2.1','A','On Focus','on-focus','Focus every component. Verify focus alone does not trigger a change of context.'],
    ['3.2.2','A','On Input','on-input','Change each input and selection. Verify changes do not unexpectedly change context unless users were advised beforehand.'],
    ['3.2.3','AA','Consistent Navigation','consistent-navigation','Compare repeated navigation across the page set. Verify its relative order stays consistent unless the user initiates a change.'],
    ['3.2.4','AA','Consistent Identification','consistent-identification','Compare components with the same functionality across pages. Verify consistent identification.'],
    ['3.2.6','A','Consistent Help','consistent-help','Compare repeated help mechanisms across the page set. Verify they appear in consistent relative order unless a user initiates the change.'],
    ['3.3.1','A','Error Identification','error-identification','Submit invalid/missing data through each form. Verify automatically detected errors identify the affected item and describe the error in text.'],
    ['3.3.2','A','Labels or Instructions','labels-or-instructions','Review every input for needed labels and instructions, including formats, required fields, and constraints before entry.'],
    ['3.3.3','AA','Error Suggestion','error-suggestion','Trigger correctable input errors. Verify helpful correction suggestions when known, except where security or purpose would be compromised.'],
    ['3.3.4','AA','Error Prevention (Legal, Financial, Data)','error-prevention-legal-financial-data','Exercise legal/financial submissions, stored user-data modification/deletion, and test responses. Verify reversibility, checking with correction, or review/confirmation as required.'],
    ['3.3.7','A','Redundant Entry','redundant-entry','Complete multistep processes. Verify previously entered information is auto-populated or selectable unless an essential, security, or validity exception applies.'],
    ['3.3.8','AA','Accessible Authentication (Minimum)','accessible-authentication-minimum','Complete login, MFA, and recovery. Verify cognitive tests have a permitted alternative/assistance or exception. Test password-manager support and paste, including verification codes.'],
    ['4.1.2','A','Name, Role, Value','name-role-value','Inspect every standard and custom control with assistive technology. Verify names, roles, settable states/values, and notifications of changes.'],
    ['4.1.3','AA','Status Messages','status-messages','Trigger success, errors, progress, and dynamic results. Verify required status messages are programmatically available without moving focus.']
  ];
  accessLensWorkflow.criteria = rows.map(([id,level,title,anchor,instruction]) => ({ id, level, title, instruction, url: 'https://www.w3.org/TR/WCAG22/#' + anchor }));
  accessLensWorkflow.checklist = [...rows.map(([id,level,title,,instruction]) => [id, id + ' ' + title + ' (' + level + ')', instruction]), ...accessLensWorkflow.checklist];
  accessLensWorkflow.scopeChecks = [
    ['scope-pages', 'Full pages and states', 'Evaluate the entire page, embedded/third-party content, hidden states, responsive layouts, and all interactive states. Record separate scans where needed.'],
    ['scope-processes', 'Complete processes', 'Review every step and branch of complete tasks such as registration, checkout, authentication, and recovery across all participating pages.'],
    ['scope-support', 'Accessibility-supported technology', 'Verify relied-upon technologies work with the supported browsers and assistive technologies; test equivalent alternatives where needed.'],
    ['scope-interference', 'Non-interference', 'Check all content, including content not relied upon, for keyboard traps, uncontrolled audio, flashing, and moving/updating information that interferes with access.'],
    ['scope-set', 'Page-set review', 'Review cross-page consistency, navigation, help, and ways to locate pages across the complete evaluation scope.']
  ];
  accessLensWorkflow.checklist.push(...accessLensWorkflow.scopeChecks);
  accessLensWorkflow.coverage = function(report, days = 7) {
    const criteria = this.criteria.map(criterion => {
      const tag = 'wcag' + criterion.id.replaceAll('.', '');
      const rules = {};
      const ruleNodes = {}, ruleElementChecks = {};
      let unavailableNodeLists = 0;
      for (const bucket of ['violations','incomplete','passes','inapplicable']) {
        const matched = (report.results?.[bucket] || []).filter(rule => rule.tags?.includes(tag));
        rules[bucket] = matched.map(rule => rule.id);
        unavailableNodeLists += matched.filter(rule => !Array.isArray(rule.nodes)).length;
        ruleNodes[bucket] = matched.flatMap(rule => rule.nodes || []);
        ruleElementChecks[bucket] = ruleNodes[bucket].length;
      }
      const manual = report.manualChecks?.[criterion.id] || { status: 'not-tested' };
      const supplemental = (report.supplementalChecks?.checks || []).filter(check => check.criteria.includes(criterion.id)).map(check => ({ check: check.id, candidates: check.observations.length, recordedAt: report.supplementalChecks.recordedAt }));
      if (report.textSpacingTest?.criteria.includes(criterion.id)) supplemental.push({ check: 'text-spacing', candidates: report.textSpacingTest.observations.length, recordedAt: report.textSpacingTest.finishedAt });
      const checked = Date.parse(manual.checkedAt), scanned = Date.parse(report.scannedAt);
      const evidenceAt = Math.max(scanned, ...supplemental.map(check => Date.parse(check.recordedAt)).filter(Number.isFinite));
      const stale = manual.status !== 'not-tested' && (!Number.isFinite(checked) || checked < evidenceAt || Date.now() - checked > days * 86400000);
      const pageReview = report.manualChecks?.['scope-pages'];
      const pageChecked = Date.parse(pageReview?.checkedAt);
      const pageReviewed = pageReview?.status === 'pass' && Number.isFinite(pageChecked) && pageChecked >= scanned && Date.now() - pageChecked <= days * 86400000;
      const limited = report.completeness?.status !== 'completed-for-scope' && !pageReviewed;
      const status = rules.violations.length || manual.status === 'fail' ? 'fail'
        : stale ? 'needs-revalidation'
        : !['pass','not-applicable'].includes(manual.status) ? (rules.incomplete.length || supplemental.some(check => check.candidates) ? 'needs-review' : 'not-tested')
        : limited ? 'scope-limited' : manual.status;
      const nodes = Object.values(ruleNodes).flat();
      const located = node => node.locatorAvailable !== false && Array.isArray(node.target) && node.target.length > 0;
      const elementCoverage = {
        ruleElementChecks,
        uniqueLocatedTargets: new Set(nodes.filter(located).map(node => JSON.stringify(node.target))).size,
        unlocatedRuleElementChecks: nodes.filter(node => !located(node)).length,
        unavailableNodeLists,
        additionalCandidateChecks: supplemental.reduce((total, check) => total + check.candidates, 0),
        candidateEnumerationLimited: Boolean(report.supplementalChecks?.truncated || (report.supplementalChecks?.checks || []).some(check => check.criteria.includes(criterion.id) && check.truncated)),
        relevantElementEnumeration: 'not-established', completeAutomatedCoverage: false
      };
      return { id: criterion.id, level: criterion.level, name: criterion.title, instruction: criterion.instruction, reference: criterion.url, method: Object.values(rules).some(list => list.length) || supplemental.length ? 'automated-and-manual' : 'manual', rules, supplemental, elementCoverage, manual, status };
    });
    const counts = {};
    for (const criterion of criteria) counts[criterion.status] = (counts[criterion.status] || 0) + 1;
    const scopeChecks = this.scopeChecks.map(([id,title,instruction]) => {
      const manual = report.manualChecks?.[id] || { status: 'not-tested' };
      const checked = Date.parse(manual.checkedAt);
      const status = manual.status === 'pass' && (!Number.isFinite(checked) || checked < Date.parse(report.scannedAt) || Date.now() - checked > days * 86400000) ? 'needs-revalidation' : manual.status;
      return { id, name: title, instruction, ...manual, status };
    });
    const keyboard = report.keyboardTest;
    const assessment = keyboard?.assessment || { status: 'not-reviewed' };
    const keyboardChecked = Date.parse(assessment.checkedAt);
    const keyboardReviewStatus = assessment.status === 'pass' &&
      (keyboard.scannedAt !== report.scannedAt || !Number.isFinite(keyboardChecked) || keyboardChecked < Date.parse(keyboard.finishedAt) || Date.now() - keyboardChecked > days * 86400000)
      ? 'needs-revalidation' : assessment.status;
    return { standard: 'WCAG 2.2', level: 'AA', total: criteria.length, counts,
      reviewComplete: criteria.every(c => ['pass','not-applicable'].includes(c.status)) && scopeChecks.every(c => c.status === 'pass') && (!keyboard || keyboardReviewStatus === 'pass'), scopeChecks,
      conformanceEstablished: false,
      keyboardEvidence: report.keyboardTest ? { runId: report.keyboardTest.id, status: report.keyboardTest.status,
        recordedSteps: Math.max(0, (report.keyboardTest.entries?.length || 0) - 1), reviewRequired: true,
        assessment, reviewStatus: keyboardReviewStatus,
        relatedCriteria: ['2.1.1','2.1.2','2.4.3','2.4.7','2.4.11'] } : null,
      scope: 'This page state only. Review full pages, all states, complete processes, and the page set. Excluded content needs separate evaluation.',
      criteria };
  };
})();
