const { test, expect } = require('@playwright/test');
const path = require('node:path');

const fixture = '<main style="margin-left:420px;background:white;color:black"><h1>Contrast test</h1><p id="normal" style="color:#aaa;font:16px Arial">Normal low contrast</p><p id="large" style="color:#888;font:24px Arial">Large passing contrast</p><p id="small" style="color:#888;font:16px Arial">Small failing contrast</p><p id="equal" style="color:white;font:16px Arial">Identical colors</p><p id="gradient" style="color:#aaa;background:linear-gradient(white,#eee);font:16px Arial">Gradient text</p><input id="placeholder" placeholder="Example" style="color:#aaa;background:white"><p id="alpha" style="color:rgba(0,0,0,.3);font:16px Arial">Transparent foreground</p><p id="hidden" hidden style="color:#aaa">Hidden text</p></main>';

test('contrast distinguishes measured failures, large text passes, and unresolved backgrounds', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(fixture);
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','workflow.js','features.js','export.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const result = await page.evaluate(async () => {
    const raw = await accessLensFeatures.runAxe(document);
    const report = accessLensExport({ results: raw, inventory: {}, scannedAt: raw.timestamp });
    return { targets: Object.fromEntries(['violations','incomplete','passes'].map(bucket => [bucket, raw[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => node.target[0]))])), report };
  });
  expect(result.targets.violations).toEqual(expect.arrayContaining(['#normal','#small','#alpha']));
  expect(result.targets.passes).toContain('#large');
  expect(result.targets.incomplete).toEqual(expect.arrayContaining(['#equal','#gradient','#placeholder']));
  expect(Object.values(result.targets).flat()).not.toContain('#hidden');
  const checks = bucket => result.report.results[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.flatMap(node => node.any));
  expect(checks('violations').some(check => check.measurements.expectedContrastRatio === 4.5 && check.measurements.fgColor === '#aaaaaa' && check.measurements.bgColor === '#ffffff')).toBe(true);
  expect(checks('passes').some(check => check.measurements.expectedContrastRatio === 3)).toBe(true);
  const gradient = checks('incomplete').find(check => check.reviewReason?.includes('gradient'));
  expect(gradient).toBeTruthy();
  expect(gradient.measurements.contrastRatio).toBeUndefined();
});

test('contrast view labels manual reviews and exports measured thresholds', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(fixture);
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','workflow.js','features.js','export.js','content.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Contrast');
  await expect(ui.locator('#contrastSummary')).toContainText('need manual review');
  await expect(ui.locator('#overlay .marker.review')).toHaveCount(3);
  await expect(ui.locator('#overlay .marker.violations')).toHaveCount(3);
  await expect(ui.locator('.contrast-status')).toHaveText(['Detected failure','Measurement incomplete — no failure confirmed']);
  await expect(ui.locator('.contrast-measurement').filter({ hasText: 'Required 4.5:1' }).first()).toBeVisible();
  await expect(ui.locator('.contrast-measurement').filter({ hasText: 'gradient' })).toBeVisible();
  const download = page.waitForEvent('download'); await ui.locator('#export').click();
  let data = ''; for await (const chunk of await (await download).createReadStream()) data += chunk;
  const report = JSON.parse(data);
  expect(report.results.violations.find(rule => rule.id === 'color-contrast').nodes.some(node => node.any.some(check => check.measurements.expectedContrastRatio === 4.5))).toBe(true);
  expect(report.scope.standard).toBe('WCAG 2.2 Level A/AA');
});

test('contrast diagnostics reject arbitrary strings and invalid numeric values', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('features.js') });
  const evidence = await page.evaluate(() => accessLensFeatures.contrastEvidence({ data: { contrastRatio: NaN, expectedContrastRatio: '4.5:1 PRIVATE', fgColor: 'PRIVATE', bgColor: 'url(PRIVATE)', messageKey: 'PRIVATE' } }));
  expect(evidence).toEqual({ measurements: {}, reason: null });
});

 test('image-backed login button is an inconclusive review, never a confirmed failure', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<main style="margin-left:420px"><h1>Login</h1><input type="submit" value="Login" aria-label="Login" style="color:white;background-color:#568827;background-image:url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22%3E%3C/svg%3E);width:110px;height:35px;font:700 14px Arial"></main>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','workflow.js','features.js','export.js','content.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('.stat[data-kind="incomplete"]').click();
  const card = ui.locator('details.rule').filter({ hasText: 'Contrast measurement gaps' });
  await card.locator(':scope > summary').click();
  await expect(card).toContainText('Measurement incomplete — no failure confirmed');
  await expect(card).toContainText('A background image prevents a reliable automatic background measurement.');
  await expect(card).not.toContainText('Fix any of the following');
  await expect(card).not.toContainText('Suggested fix and verification');
  await ui.locator('#viewSelect').selectOption('Contrast');
  await expect(ui.locator('#contrastSummary')).toContainText('0 text contrast failure(s); 1 need manual review');
 });
