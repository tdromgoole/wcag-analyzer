const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
async function scripts(page, names) { for (const name of names) await page.addScriptTag({ path: path.resolve(name) }); }
async function exported(page, ui) {
  const event = page.waitForEvent('download'); await ui.locator('#export').click();
  let text = ''; const download = await event; for await (const chunk of await download.createReadStream()) text += chunk;
  return { report: JSON.parse(text), filename: download.suggestedFilename() };
}

test('optional auditor profile survives reopening, keeps corrections stable and rotates on switching', async ({ page }, testInfo) => {
  const open = async () => {
    await page.goto('http://127.0.0.1:4178');
    await page.setContent(fs.readFileSync(path.resolve('options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
    await scripts(page, ['export.js', 'save-settings.js', 'features.js', 'recovery.js', 'auto-mode.js', 'options.js']);
  };
  await open();
  await expect(page.locator('#auditorStatus')).toContainText('unknown attribution');
  await page.locator('#auditorFirstName').fill('Ada');
  await page.locator('#saveAuditor').click();
  await expect(page.locator('#auditorStatus')).toContainText('Enter both names');
  expect(await page.evaluate(() => accessLensSettings.auditor())).toBeNull();
  await page.locator('#auditorLastName').fill('Example');
  await page.locator('#saveAuditor').click();
  await expect(page.locator('#auditorStatus')).toContainText('Not authenticated');
  const first = await page.evaluate(() => accessLensSettings.auditor());
  await page.screenshot({ path: testInfo.outputPath('auditor-settings.png') });
  await open();
  await expect(page.locator('#auditorFirstName')).toHaveValue('Ada');
  await page.locator('#auditorLastName').fill('Corrected');
  await page.locator('#saveAuditor').click();
  await expect.poll(() => page.evaluate(async () => (await accessLensSettings.auditor()).lastName)).toBe('Corrected');
  expect((await page.evaluate(() => accessLensSettings.auditor())).auditorId).toBe(first.auditorId);
  await page.locator('#clearAuditor').click();
  await expect(page.locator('#auditorStatus')).toContainText('unknown attribution');
  await page.locator('#auditorFirstName').fill('Bea'); await page.locator('#auditorLastName').fill('Example');
  await page.locator('#saveAuditor').click();
  await expect.poll(() => page.evaluate(async () => (await accessLensSettings.auditor())?.firstName)).toBe('Bea');
  expect((await page.evaluate(() => accessLensSettings.auditor())).auditorId).not.toBe(first.auditorId);
});

test('unnamed scans stay unknown and later scan/review actors survive preservation and restore independently', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  await scripts(page, ['export.js', 'save-settings.js', 'workflow.js', 'features.js', 'recovery.js', 'inspection.js', 'content.js']);
  const ui = page.locator('#access-lens-extension'); await expect(ui.locator('#export')).toBeEnabled();
  const unknown = await exported(page, ui); expect(unknown.report.attribution).toBeNull();
  const scanActor = await page.evaluate(() => accessLensSettings.saveAuditor('Ada', 'Example'));
  expect((await exported(page, ui)).report.attribution).toBeNull();
  await ui.locator('#scan').click(); await expect(ui.locator('#export')).toBeEnabled();
  expect((await exported(page, ui)).report.attribution).toEqual(scanActor);
  const reviewer = await page.evaluate(async () => { await accessLensSettings.saveAuditor('', ''); return accessLensSettings.saveAuditor('Bea', 'Example'); });
  await ui.locator('#viewSelect').selectOption('Manual');
  await ui.locator('[data-check="keyboard"]').selectOption('pass');
  await expect(ui.locator('#saveStatus')).toContainText('Review preserved');
  const reviewed = await exported(page, ui);
  expect(reviewed.report.attribution).toEqual(scanActor);
  expect(reviewed.report.manualChecks.keyboard.attribution).toEqual(reviewer);
  const observed = await page.evaluate(async ({ unknown, reviewed }) => {
    await accessLensSettings.enqueue(unknown.report, unknown.filename);
    reviewed.report.manualChecks.focus = { status: 'fail', checkedAt: '2026-11-19T10:00:00Z' };
    await accessLensSettings.enqueue(reviewed.report, reviewed.filename);
    await accessLensSettings.saveAuditor('', '');
    const bundle = await accessLensSettings.preservedEvidence();
    return { bundle, restored: accessLensSettings.reviewChoices(reviewed.report), profile: await accessLensSettings.auditor() };
  }, { unknown, reviewed });
  expect(observed.profile).toBeNull();
  expect(observed.restored.checklist.keyboard.attribution).toEqual(reviewer);
  expect(observed.bundle.events.find(event => event.eventType === 'manual-review-evidence-preserved' && event.checkId === 'keyboard').attribution).toEqual(reviewer);
  expect(observed.bundle.events.find(event => event.eventType === 'manual-review-evidence-preserved' && event.checkId === 'focus').attribution).toBeNull();
  expect(observed.bundle.events.filter(event => event.eventType === 'scan-evidence-preserved').map(event => event.attribution)).toEqual(expect.arrayContaining([null, scanActor]));
});

test('attribution accepts only the disclosed self-declared fields and restores keyboard review attribution', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await scripts(page, ['export.js', 'save-settings.js', 'workflow.js', 'recovery.js']);
  const result = await page.evaluate(async () => {
    const attribution = await accessLensSettings.saveAuditor('Ada', 'Example');
    const report = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, attribution, keyboardTest: {
      id: 'synthetic-run', status: 'completed', startedAt: '2026-11-19T10:00:00Z', entries: [],
      assessment: { status: 'pass', checkedAt: '2026-11-19T10:01:00Z', runId: 'synthetic-run', attribution }
    } };
    const rejected = [{ ...attribution, authenticated: true }, { ...attribution, sourceMetadata: 'PRIVATE' }, { ...attribution, firstName: 'A'.repeat(101) }].map(invalid => {
      try { accessLensSettings.normalizeEvidence({ ...report, attribution: invalid }); return false; } catch { return true; }
    });
    return { rejected, attribution, restored: accessLensSettings.reviewChoices(report).keyboardTest.assessment,
      valid: accessLensSettings.normalizeEvidence(report).attribution };
  });
  expect(result.rejected).toEqual([true, true, true]);
  expect(result.valid).toEqual(result.attribution); expect(result.restored.attribution).toEqual(result.attribution);
});

test('keyboard worker records the reviewer at assessment time without relabelling the original run', async () => {
  const attribution = { auditorId: '12345678-1234-4567-8123-123456789abc', firstName: 'Ada', lastName: 'Example', identityType: 'self-declared', authenticated: false };
  const filename = 'access-lens-' + 'a'.repeat(64) + '.json';
  let stored = { filename, run: { id: 'test-run', status: 'completed' } };
  const context = vm.createContext({ accessLensSettings: {
    read: async () => structuredClone(stored), write: async value => { stored = structuredClone(value); }, auditor: async () => attribution
  }, chrome: { debugger: { onDetach: { addListener() {} }, onEvent: { addListener() {} } } } });
  vm.runInContext(fs.readFileSync(path.resolve('keyboard-background.js'), 'utf8'), context);
  const result = await context.accessLensKeyboardDriver.handle({ filename, action: 'assessment', runId: 'test-run', status: 'pass' }, { tab: { id: 1 }, frameId: 0 });
  expect(result.assessment.attribution).toEqual(attribution);
  expect(stored.run.assessment.attribution).toEqual(attribution);
  expect(stored.run.attribution).toBeUndefined();
});
