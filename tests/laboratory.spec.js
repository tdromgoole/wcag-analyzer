const { test, expect } = require('@playwright/test');
const path = require('node:path');
const manifest = require('../laboratory/manifest.json');
const coverage = require('../laboratory/coverage.json');
const { validateManifest } = require('../laboratory/validate-manifest');

test('laboratory manifest validates IDs, fixtures and all 55 honest criterion dispositions', () => {
  expect(validateManifest()).toEqual({ cases: manifest.cases.length, criteria: 55 });
  const duplicate = structuredClone(manifest); duplicate.cases.push(duplicate.cases[0]);
  expect(() => validateManifest(duplicate, coverage)).toThrow(/duplicate/);
  const invalidKey = structuredClone(manifest);
  invalidKey.cases[0].steps = [{ action: 'press', target: '#case-target', key: 'UnboundedKey' }];
  expect(() => validateManifest(invalidKey, coverage)).toThrow(/interaction steps/);
  const falseCoverage = structuredClone(coverage); falseCoverage.criteria[0].disposition = 'complete';
  expect(() => validateManifest(manifest, falseCoverage)).toThrow(/inaccurate coverage/);
  const wrongState = structuredClone(manifest);
  wrongState.cases[0].evaluatedFixture = '../private.html';
  expect(() => validateManifest(wrongState, coverage)).toThrow(/evaluated fixture/);
});

for (const item of manifest.cases) {
  test(`laboratory: ${item.id}`, async ({ page }, testInfo) => {
    let record = { caseId: item.id, criterionIds: item.criterionIds, fixture: item.fixture, expectedOutcome: item.expected.outcome,
      actualCount: null, comparison: 'error', method: item.expected.method, expectedRuleId: item.expected.ruleId,
      expectedBucket: item.expected.bucket, expectedCount: item.expected.count, startedAt: new Date().toISOString() };
    try {
      await page.setViewportSize(item.viewport || manifest.viewport);
      const response = await page.goto(`http://127.0.0.1:4178/laboratory/${item.fixture}`);
      expect(response.status()).toBe(200);
      for (const step of item.steps) {
        if (step.action === 'press') await page.locator(step.target).press(step.key);
        else await page.locator(step.target).click();
      }
      await expect(page).toHaveURL(`http://127.0.0.1:4178/laboratory/${item.evaluatedFixture || item.fixture}`);
      record.evaluatedFixture = item.evaluatedFixture || item.fixture;
      for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','checks.js','inspection.js','export.js','save-settings.js','recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
      const observed = await page.evaluate(async item => {
        const results = await accessLensFeatures.runAxe(document);
        const report = accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp });
        const beforeStyles = [...document.querySelectorAll('*')].map(element => element.getAttribute('style'));
        if (item.expected.method === 'spacing') report.textSpacingTest = await accessLensChecks.textSpacing();
        accessLensSettings.normalizeEvidence(report);
        const resolve = target => { let scope = document, element; for (const part of target) { element = scope.querySelector(part); if (!element) return null; scope = element.shadowRoot || element; } return element; };
        const expected = item.expected;
        const groups = expected.method === 'inventory' ? report.inventory[expected.bucket] : report.results[expected.bucket];
        const rule = expected.method === 'spacing' ? { nodes: report.textSpacingTest.observations }
          : expected.method === 'supplemental' ? { nodes: report.supplementalChecks.checks.find(check => check.id === expected.ruleId).observations }
          : groups?.find(rule => rule.id === expected.ruleId);
        const target = expected.target ? document.querySelector(expected.target) : null;
        return { actualCount: expected.method === 'manual' ? null : (rule?.nodes || []).filter(node => !target || resolve(node.target) === target).length,
          hasRule: Boolean(rule), hasTarget: expected.target === null || Boolean(target), contentFree: report.privacy.mode === 'content-free' && !JSON.stringify(report).includes('"alternativeText":'),
          criterionStatuses: accessLensWorkflow.coverage(report).criteria.filter(criterion => item.criterionIds.includes(criterion.id)).map(criterion => ({ id: criterion.id, status: criterion.status })),
          viewport: { width: innerWidth, height: innerHeight }, scanId: report.scanId,
          spacingStatus: report.textSpacingTest?.status,
          stylesRestored: JSON.stringify(beforeStyles) === JSON.stringify([...document.querySelectorAll('*')].map(element => element.getAttribute('style'))) };
      }, item);
      expect(observed.contentFree).toBe(true);
      expect(observed.hasTarget).toBe(true);
      expect(observed.viewport).toEqual(item.viewport || manifest.viewport);
      if (item.expected.method === 'spacing') {
        expect(observed.spacingStatus).toBe('completed-for-scope');
        expect(observed.stylesRestored).toBe(true);
        expect(observed.criterionStatuses.every(criterion => !['pass','not-applicable'].includes(criterion.status))).toBe(true);
      }
      if (item.expected.method === 'supplemental') expect(observed.criterionStatuses.every(criterion => !['pass','not-applicable'].includes(criterion.status))).toBe(true);
      record = { ...record, ...observed, finishedAt: new Date().toISOString(), interactionStepsApplied: item.steps.length };
      if (item.expected.method === 'manual') {
        expect(observed.criterionStatuses.every(criterion => ['not-tested','needs-review'].includes(criterion.status))).toBe(true);
        record.comparison = 'manual-outstanding';
      } else {
        record.comparison = observed.hasRule && observed.actualCount === item.expected.count ? 'matched' : 'mismatch';
        expect(observed.hasRule).toBe(true);
        expect(observed.actualCount).toBe(item.expected.count);
      }
    } finally {
      await testInfo.attach('laboratory-result', { body: Buffer.from(JSON.stringify(record)), contentType: 'application/json' });
    }
  });
}

test('laboratory dashboard filters expectations, handles recorded runs, and stays accessible', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178/laboratory/');
  await expect(page.locator('.case')).toHaveCount(manifest.cases.length);
  await expect(page.locator('#runStatus')).toContainText('No recorded run');
  await page.getByRole('radio', { name: 'Needs Manual Review', exact: true }).check();
  await expect(page.locator('.case')).toHaveCount(manifest.cases.filter(item => item.expected.outcome === 'manual').length);
  await page.getByRole('radio', { name: 'Not Applicable', exact: true }).check();
  await expect(page.locator('.case')).toHaveCount(1);
  const run = { schemaVersion: '1.0', reportType: 'laboratory-run', manifestVersion: 'older', fixtureVersion: '1', scannerVersion: '1.12.0', finishedAt: new Date().toISOString(), results: [{ caseId: 'images-absent', method: 'axe', hasRule: true, actualCount: 0, comparison: 'matched', viewport: manifest.viewport }] };
  await page.locator('#runFile').setInputFiles({ name: 'recorded-run.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(run)) });
  await expect(page.locator('#runStatus')).toContainText('results are stale');
  await expect(page.locator('.case .actual')).toContainText('Recorded comparison: matched');
  run.results[0].actualCount = 5;
  await page.locator('#runFile').setInputFiles({ name: 'incorrect-claim.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(run)) });
  await expect(page.locator('.case .actual')).toContainText('Recorded comparison: mismatch');
  run.results[0].actualCount = 0;
  run.results[0].viewport = { width: 320, height: 800 };
  await page.locator('#runFile').setInputFiles({ name: 'wrong-viewport.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(run)) });
  await expect(page.locator('.case .actual')).toContainText('recorded viewport differs');
  await page.getByRole('radio', { name: 'All', exact: true }).check();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] } })).violations.map(rule => rule.id));
  expect(violations).toEqual([]);
  await page.screenshot({ path: path.resolve('test-results/laboratory-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.resolve('test-results/laboratory-mobile.png'), fullPage: true });
});

test('laboratory server serves local assets without exposing files outside its directory', async ({ request }) => {
  const manifestResponse = await request.get('http://127.0.0.1:4178/laboratory/manifest.json');
  expect(manifestResponse.headers()['content-type']).toContain('application/json');
  expect((await manifestResponse.json()).cases).toHaveLength(manifest.cases.length);
  expect((await request.get('http://127.0.0.1:4178/laboratory/fixtures/images/missing.html')).status()).toBe(404);
  expect((await request.get('http://127.0.0.1:4178/laboratory/%2e%2e%5cpackage.json')).status()).toBe(404);
  const head = await request.head('http://127.0.0.1:4178/laboratory/manifest.json');
  expect(head.status()).toBe(200);
  expect(await head.text()).toBe('');
});

test('interaction fixtures preserve known focus/action conditions while NVDA evaluation remains manual', async ({ page }) => {
  const open = route => page.goto(`http://127.0.0.1:4178/laboratory/fixtures/${route}`);
  await open('dynamic/pass.html');
  await page.locator('#trigger').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#case-target')).toHaveText('Task completed.');
  await expect(page.locator('#case-target')).toHaveAttribute('role', 'status');
  await expect(page.locator('#trigger')).toBeFocused();

  await open('modals/pass.html');
  await page.locator('#trigger').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#first-field')).toBeFocused();
  await expect(page.locator('#case-target')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#first-field')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#case-target')).not.toBeVisible();
  await expect(page.locator('#trigger')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.locator('#close').click();
  await expect(page.locator('#trigger')).toBeFocused();

  await open('modals/fail.html');
  await page.locator('#trigger').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#case-target')).toBeVisible();
  await expect(page.locator('#trigger')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#case-target')).not.toBeVisible();

  await open('keyboard/pass.html');
  await page.locator('#case-target').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#outcome')).toHaveText('Trail selected.');
  await open('keyboard/pass.html');
  await page.locator('#case-target').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#outcome')).toHaveText('Trail selected.');
  await open('keyboard/fail.html');
  expect(await page.locator('#case-target').evaluate(element => element.tabIndex)).toBe(-1);
  await expect(page.locator('#outcome')).toHaveText('No trail selected.');
  await page.locator('#case-target').click();
  await expect(page.locator('#outcome')).toHaveText('Trail selected.');
});

test('NVDA protocol is accessible and manual template contains only unperformed reviews', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:4178/laboratory/manual-nvda.html');
  await expect(page.getByRole('heading', { name: 'Manual protocol: NVDA with Chrome or Edge' })).toBeVisible();
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  expect(await page.evaluate(async () => (await axe.run()).violations.map(rule => rule.id))).toEqual([]);
  const response = await request.get('http://127.0.0.1:4178/laboratory/manual-record-template.json');
  const template = await response.json();
  expect(template.reviews).toHaveLength(manifest.cases.filter(item => item.expected.outcome === 'manual').length);
  expect(template.reviews.every(review => review.status === 'not-tested' && review.checkedAt === null && review.observations.length === 0)).toBe(true);
  expect(template.reviewer.authenticated).toBe(false);
  expect(template.fixtureVersion).toBe(manifest.fixtureVersion);
});

test('responsive fixtures independently establish dimensions and overflow without claiming whole-criterion review', async ({ page }) => {
  const open = route => page.goto(`http://127.0.0.1:4178/laboratory/fixtures/responsive/${route}`);
  await open('targets-fail.html');
  const small = await page.locator('#case-target').boundingBox();
  expect(small.width).toBe(10); expect(small.height).toBe(10);
  const gap = await page.locator('main button').evaluateAll(buttons => buttons[1].getBoundingClientRect().left - buttons[0].getBoundingClientRect().right);
  expect(gap).toBe(2);
  await open('targets-pass.html');
  const large = await page.locator('#case-target').boundingBox();
  expect(large.width).toBe(44); expect(large.height).toBe(44);
  await page.setViewportSize({ width: 320, height: 800 });
  await open('reflow-fail.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(true);
  await open('reflow-pass.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('form validation fixtures expose the intended valid and broken error relationships', async ({ page }) => {
  for (const [fixture, validReference] of [['errors-fail.html', false], ['errors-pass.html', true]]) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/forms/${fixture}`);
    await expect(page.locator('#case-error')).not.toBeVisible();
    await page.locator('#trigger').click();
    await expect(page.locator('#case-error')).toBeVisible();
    await expect(page.locator('#case-target')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#case-error')).toContainText('TR-123');
    const linked = await page.locator('#case-target').evaluate(element => element.getAttribute('aria-describedby').split(/\s+/).every(id => Boolean(document.getElementById(id))));
    expect(linked).toBe(validReference);
    if (validReference) await expect(page.locator('#case-error')).toHaveAttribute('role', 'alert');
  }
});

test('synthetic media decodes locally with the declared audio and caption-track conditions', async ({ page, request }) => {
  for (const [fixture, audioTracks] of [['captions.html', 1], ['silent.html', 0]]) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/media/${fixture}`);
    const media = await page.locator('#case-target').evaluate(async video => {
      video.muted = true; // Verify decoding without playing sound on the desktop.
      await video.play();
      const stream = video.captureStream();
      const result = { width: video.videoWidth, height: video.videoHeight, controls: video.controls,
        autoplay: video.autoplay, audioTracks: stream.getAudioTracks().length };
      video.pause(); for (const track of stream.getTracks()) track.stop();
      return result;
    });
    expect(media).toEqual({ width: 320, height: 180, controls: true, autoplay: false, audioTracks });
    if (fixture === 'captions.html') {
      await expect.poll(() => page.locator('#case-target').evaluate(video => video.textTracks[0]?.cues?.length || 0)).toBe(1);
      expect(await page.locator('#case-target').evaluate(video => video.textTracks[0].kind)).toBe('captions');
    }
  }
  const clip = await request.get('http://127.0.0.1:4178/laboratory/assets/trail-warning.webm');
  expect(clip.headers()['content-type']).toContain('video/webm');
  const captions = await request.get('http://127.0.0.1:4178/laboratory/assets/captions.vtt');
  expect(captions.headers()['content-type']).toContain('text/vtt');
});

test('focus fixtures retain keyboard focus, expose their intended visual conditions and allow recovery', async ({ page }, testInfo) => {
  for (const fixture of ['indicator-fail', 'indicator-pass', 'obscured-fail', 'obscured-pass']) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/focus/${fixture}.html`);
    const target = page.locator('#case-target');
    const appearance = () => target.evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow,
        background: style.backgroundColor, border: style.border, color: style.color };
    });
    const before = await appearance();
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
    expect(await target.evaluate(element => element.matches(':focus-visible'))).toBe(true);
    if (fixture === 'indicator-fail') {
      expect(await appearance()).toEqual(before);
      expect(before.outline).toBe('none');
      expect(before.shadow).toBe('none');
    } else if (fixture === 'indicator-pass') {
      expect(await appearance()).toMatchObject({ outline: 'solid', width: '3px' });
      expect(before.outline).not.toBe('solid');
    } else {
      const covered = await target.evaluate(element => {
        const target = element.getBoundingClientRect(), cover = document.querySelector('#cover');
        const rect = cover.getBoundingClientRect(), style = getComputedStyle(cover);
        return { fullyCovered: rect.left <= target.left && rect.right >= target.right && rect.top <= target.top && rect.bottom >= target.bottom,
          disjoint: rect.bottom <= target.top || rect.top >= target.bottom || rect.right <= target.left || rect.left >= target.right,
          opaque: style.opacity === '1' && style.backgroundColor === 'rgb(51, 65, 85)',
          aboveTarget: Number(style.zIndex) > Number(getComputedStyle(element).zIndex),
          viewport: target.left >= 0 && target.top >= 0 && target.right <= innerWidth && target.bottom <= innerHeight,
          hit: document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2)?.id };
      });
      expect(covered).toMatchObject({ opaque: true, aboveTarget: true, viewport: true,
        fullyCovered: fixture === 'obscured-fail', disjoint: fixture === 'obscured-pass',
        hit: fixture === 'obscured-fail' ? 'cover' : 'case-target' });
    }
    await page.screenshot({ path: testInfo.outputPath(`${fixture}.png`) });
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(target).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#before')).toBeFocused();
  }
});

test('timing scenarios start on request, allow ten extensions when provided and reset cleanly', async ({ page }) => {
  await page.clock.install();
  for (const mode of ['fixed', 'extend']) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/timing/${mode}.html`);
    const input = page.locator('#case-target');
    await page.clock.fastForward(60000);
    await expect(input).toBeDisabled();
    await expect(page.locator('#notice')).toHaveText('Timer not started.');
    await page.locator('#trigger').click();
    await expect(input).toBeEnabled();
    if (mode === 'extend') {
      await expect(page.locator('#notice')).toContainText('30 seconds remain');
      for (let extension = 1; extension <= 10; extension++) {
        await page.clock.fastForward(25000);
        await expect(input).toBeEnabled();
        await page.locator('#extend').focus();
        await page.keyboard.press('Space');
        await expect(page.locator('#notice')).toContainText(`Extensions used: ${extension} of 10`);
        await expect(input).toHaveValue('Inspect trail sign');
      }
      await expect(page.locator('#extend')).toBeDisabled();
    } else await expect(page.locator('#extend')).toHaveCount(0);
    await page.clock.fastForward(30001);
    await expect(input).toBeDisabled();
    await expect(page.locator('#notice')).toContainText('Time expired');
    await page.locator('#reset').click();
    await page.clock.fastForward(60000);
    await expect(page.locator('#notice')).toHaveText('Timer not started.');
    await expect(page.locator('#trigger')).toBeEnabled();
  }
});

test('two-page process carries only the synthetic selection and exposes the intended repeated-entry difference', async ({ page }) => {
  for (const mode of ['fail', 'pass']) {
    const start = `http://127.0.0.1:4178/laboratory/fixtures/process/start-${mode}.html`;
    await page.goto(start);
    await page.locator('#sample').click();
    await page.locator('#trigger').click();
    await expect(page).toHaveURL(start.replace('start-', 'repeat-'));
    await expect(page.locator('#case-target')).toHaveValue(mode === 'pass' ? 'Cedar Loop' : '');
    expect(await page.evaluate(() => sessionStorage.getItem('access-lens-laboratory-trail'))).toBe('Cedar Loop');
    if (mode === 'fail') {
      await expect(page.locator('main')).not.toContainText('Cedar Loop');
      await page.locator('#case-target').fill('Cedar Loop');
    }
    await page.locator('#finish').click();
    await expect(page.locator('#outcome')).toHaveText('Synthetic request completed.');
    expect(await page.evaluate(() => sessionStorage.getItem('access-lens-laboratory-trail'))).toBeNull();
    await page.locator('#reset').click();
    await expect(page).toHaveURL(start);
    await expect(page.locator('#trail')).toHaveValue('');
    await page.goto(start.replace('start-', 'repeat-'));
    await expect(page).toHaveURL(start);
  }
});

test('keyboard cycle is opt-in, bounded by the test and recoverable through reset or reload', async ({ page }) => {
  for (const mode of ['trap', 'exit']) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/keyboard/${mode}.html`);
    await expect(page.locator('#state')).toHaveText('Inactive.');
    await page.locator('#last').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    await page.locator('#trigger').click();
    await expect(page.locator('#first')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#last')).toBeFocused();
    if (mode === 'trap') {
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.keyboard.press('Tab');
        await expect(page.locator(attempt % 2 ? '#last' : '#first')).toBeFocused();
      }
      await page.locator('#first').focus();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#last')).toBeFocused();
    } else {
      await page.keyboard.press('Tab');
      await expect(page.locator('#after')).toBeFocused();
      await page.locator('#first').focus();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#reset')).toBeFocused();
    }
    await page.locator('#reset').click();
    await expect(page.locator('#state')).toHaveText('Inactive.');
    await page.locator('#trigger').click();
    await page.reload();
    await expect(page.locator('#state')).toHaveText('Inactive.');
    await page.locator('#last').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
  }
});

test('graphical control pairs preserve accessible naming while exposing opposite solid-fill contrast conditions', async ({ page }, testInfo) => {
  for (const mode of ['fail', 'pass']) {
    await page.goto(`http://127.0.0.1:4178/laboratory/fixtures/controls/graphic-${mode}.html`);
    await expect(page.getByRole('button', { name: 'Expand trail details', exact: true })).toBeVisible();
    for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'contrast.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
    const observed = await page.evaluate(async () => {
      const button = document.querySelector('#case-target'), arrow = document.querySelector('#arrow');
      const foreground = getComputedStyle(arrow).fill, background = getComputedStyle(button).backgroundColor;
      const hex = color => '#' + color.match(/\d+/g).slice(0, 3).map(value => Number(value).toString(16).padStart(2, '0')).join('');
      const results = await accessLensFeatures.runAxe(document);
      return { ratio: accessLensContrast.ratio(hex(foreground), hex(background)), foreground, background,
        named: results.passes.find(rule => rule.id === 'button-name')?.nodes.some(node => document.querySelector(node.target[0]) === button),
        opacity: getComputedStyle(arrow).opacity, hasText: Boolean(button.textContent.trim()) };
    });
    expect(observed.named).toBe(true); expect(observed.hasText).toBe(false);
    expect(observed.background).toBe('rgb(255, 255, 255)'); expect(observed.opacity).toBe('1');
    if (mode === 'fail') expect(observed.ratio).toBeLessThan(3); else expect(observed.ratio).toBeGreaterThan(3);
    await page.screenshot({ path: testInfo.outputPath(`graphic-${mode}.png`) });
    await page.locator('#case-target').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#details')).toBeVisible();
    await expect(page.locator('#case-target')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space'); await expect(page.locator('#details')).toBeHidden();
  }
});
