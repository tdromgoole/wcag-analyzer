const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function openInspector(page) {
  await page.goto('http://127.0.0.1:4178');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(name => path.resolve(name))]) {
    await page.addScriptTag({ path: file });
  }
  await expect(page.locator('#access-lens-extension').locator('#scan')).toBeEnabled();
}
async function downloadReport(page, ui) {
  const pending = page.waitForEvent('download');
  await ui.locator('#export').click();
  const download = await pending;
  let data = ''; for await (const chunk of await download.createReadStream()) data += chunk;
  return { report: JSON.parse(data), filename: download.suggestedFilename() };
}

test('compares rescans, exports manual checks, separates page states, and supplies guidance', async ({ page }) => {
  await openInspector(page);
  const ui = page.locator('#access-lens-extension');
  const initial = await downloadReport(page, ui);
  expect(initial.report.comparison).toBeNull();
  expect(initial.report.results.violations.find(rule => rule.id === 'image-alt').guidance.example).toContain('<img');
  await ui.locator('#viewSelect').selectOption('Manual');
  await ui.locator('[data-check=keyboard]').selectOption('pass');
  const checked = await downloadReport(page, ui);
  expect(checked.report.manualChecks.keyboard.status).toBe('pass');
  await page.locator('img').evaluate(el => { el.alt = 'Example purpose'; });
  await ui.locator('#scan').click();
  await expect(ui.locator('#scan')).toBeEnabled();
  const rescanned = await downloadReport(page, ui);
  expect(rescanned.filename).toBe(initial.filename);
  expect(rescanned.report.comparison.noLongerDetected.some(issue => issue.rule === 'image-alt')).toBe(true);
  expect(rescanned.report.manualChecks.keyboard.status).toBe('pass');
  await ui.locator('#viewSelect').selectOption('Changes');
  await expect(ui.locator('.results')).toContainText('No longer detected (verify fix)');
  await ui.locator('#scanDetails > summary').click();
  await ui.locator('#stateSlot').selectOption('1');
  await expect(ui.locator('#scan')).toBeEnabled();
  const differentState = await downloadReport(page, ui);
  expect(differentState.filename).not.toBe(initial.filename);
  expect(differentState.report.comparison).toBeNull();
  expect(differentState.report.manualChecks).toEqual({});
  await ui.locator('#stateSlot').selectOption('0');
  await expect(ui.locator('#scan')).toBeEnabled();
  expect((await downloadReport(page, ui)).report.manualChecks.keyboard.status).toBe('pass');
});

test('automatic state detection covers dialogs, tabs, expanded controls, and shadow roots without text', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('workflow.js') });
  const result = await page.evaluate(async () => {
    const initial = await accessLensWorkflow.state();
    const host = document.createElement('div'); document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<div role="dialog">SECRET_DIALOG</div><button role="tab" aria-selected="true">SECRET_TAB</button><button aria-expanded="true">SECRET_CONTROL</button>';
    const changed = await accessLensWorkflow.state();
    host.shadowRoot.querySelector('[role=dialog]').textContent = 'DIFFERENT_SECRET';
    const same = await accessLensWorkflow.state();
    return { initial, changed, same };
  });
  expect(result.initial.key).not.toBe(result.changed.key);
  expect(result.changed).toEqual(result.same);
  expect(result.changed).toMatchObject({ dialogs: 1, selectedTabs: 1, expandedControls: 1 });
  expect(JSON.stringify(result)).not.toContain('SECRET');
});

test('safe diagnostics keep reference validity and measurements without identifiers or content', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').insertAdjacentHTML('beforeend', '<label id="SECRET_LABEL_ID" for="SECRET_INPUT">SECRET_LABEL</label><input id="SECRET_INPUT" aria-labelledby="SECRET_LABEL_ID MISSING_SECRET" aria-controls="SECRET_LABEL_ID" role="textbox" value="SECRET_VALUE">');
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension'); await expect(ui.locator('#scan')).toBeEnabled();
  const { report } = await downloadReport(page, ui);
  expect(JSON.stringify(report)).not.toContain('SECRET');
  const node = report.inventory.order.flatMap(group => group.nodes).find(node => node.role === 'textbox');
  expect(node.relationships.labelledBy).toMatchObject({ present: true, count: 2, valid: false });
  expect(node.relationships.controls.valid).toBe(true);
  expect(node.relationships.labels.length).toBe(1);
  expect(node.measurements.width).toBeGreaterThan(0);
});

test('comparison storage is opt-in, persists across reloads, and can be cleared', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('save-settings.js') });
  const filename = 'access-lens-' + 'b'.repeat(64) + '.json';
  const snapshot = { baseline: { scannedAt: '2026-11-15T12:00:00Z', issues: [] }, checklist: { keyboard: { status: 'pass' } } };
  expect(await page.evaluate(([key, next]) => accessLensSettings.history(key, next), [filename, snapshot])).toEqual({ enabled: false });
  await page.evaluate(async ([key, next]) => { await accessLensSettings.write({ rememberHistory: true }); await accessLensSettings.history(key, next); }, [filename, snapshot]);
  await page.reload(); await page.addScriptTag({ path: path.resolve('save-settings.js') });
  expect(await page.evaluate(key => accessLensSettings.history(key), filename)).toMatchObject({ enabled: true, ...snapshot });
  await page.evaluate(() => accessLensSettings.clearHistory());
  const cleared = await page.evaluate(key => accessLensSettings.history(key), filename);
  expect(cleared.baseline).toBeUndefined();
  expect(cleared.checklist).toBeUndefined();
});

