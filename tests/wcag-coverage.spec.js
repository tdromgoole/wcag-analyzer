const { test, expect } = require('@playwright/test');
const path = require('node:path');

const expected = `1.1.1 1.2.1 1.2.2 1.2.3 1.2.4 1.2.5 1.3.1 1.3.2 1.3.3 1.3.4 1.3.5 1.4.1 1.4.2 1.4.3 1.4.4 1.4.5 1.4.10 1.4.11 1.4.12 1.4.13 2.1.1 2.1.2 2.1.4 2.2.1 2.2.2 2.3.1 2.4.1 2.4.2 2.4.3 2.4.4 2.4.5 2.4.6 2.4.7 2.4.11 2.5.1 2.5.2 2.5.3 2.5.4 2.5.7 2.5.8 3.1.1 3.1.2 3.2.1 3.2.2 3.2.3 3.2.4 3.2.6 3.3.1 3.3.2 3.3.3 3.3.4 3.3.7 3.3.8 4.1.2 4.1.3`.split(' ');
test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('workflow.js') });
});

test('catalog covers all 55 active WCAG 2.2 A/AA criteria with instructions and references', async ({ page }) => {
  const catalog = await page.evaluate(() => accessLensWorkflow.criteria);
  expect(catalog.map(c => c.id)).toEqual(expected);
  expect(catalog.filter(c => c.level === 'A')).toHaveLength(31);
  expect(catalog.filter(c => c.level === 'AA')).toHaveLength(24);
  for (const criterion of catalog) {
    expect(criterion.instruction.length).toBeGreaterThan(60);
    expect(criterion.url).toMatch(/^https:\/\/www.w3.org\/TR\/WCAG22\/#/);
  }
});

test('automated evidence never passes a criterion alone and cannot be overridden by a manual pass', async ({ page }) => {
  const result = await page.evaluate(() => {
    const report = { scannedAt: new Date().toISOString(), completeness: { status: 'completed-for-scope' }, results: {
      violations: [{ id: 'image-alt', tags: ['wcag111'] }],
      passes: [{ id: 'document-title', tags: ['wcag242'] }],
      incomplete: [{ id: 'color-contrast', tags: ['wcag143'] }]
    }};
    const initial = accessLensWorkflow.coverage(report);
    report.manualChecks = Object.fromEntries(accessLensWorkflow.checklist.map(([id]) => [id, { status: 'pass', checkedAt: new Date().toISOString() }]));
    const reviewed = accessLensWorkflow.coverage(report);
    return { initial, reviewed };
  });
  const get = (coverage, id) => coverage.criteria.find(c => c.id === id);
  expect(get(result.initial, '1.1.1').status).toBe('fail');
  expect(get(result.initial, '2.4.2').status).toBe('not-tested');
  expect(get(result.initial, '1.4.3').status).toBe('needs-review');
  expect(get(result.initial, '3.3.8').method).toBe('manual');
  expect(get(result.reviewed, '1.1.1').status).toBe('fail');
  expect(get(result.reviewed, '1.4.3').status).toBe('pass');
  expect(result.reviewed.reviewComplete).toBe(false);
  expect(result.reviewed.conformanceEstablished).toBe(false);
});

test('completion requires every criterion and scope review; rescans invalidate earlier reviews', async ({ page }) => {
  const result = await page.evaluate(() => {
    const report = { scannedAt: new Date(Date.now() - 1000).toISOString(), completeness: { status: 'limited' }, results: {}, manualChecks: {} };
    for (const c of accessLensWorkflow.criteria) report.manualChecks[c.id] = { status: 'pass', checkedAt: new Date().toISOString() };
    const limited = accessLensWorkflow.coverage(report);
    for (const [id] of accessLensWorkflow.scopeChecks) report.manualChecks[id] = { status: 'pass', checkedAt: new Date().toISOString() };
    const complete = accessLensWorkflow.coverage(report);
    report.scannedAt = new Date(Date.now() + 1000).toISOString();
    const rescanned = accessLensWorkflow.coverage(report);
    return { limited, complete, rescanned };
  });
  expect(result.limited.counts['scope-limited']).toBe(55);
  expect(result.limited.reviewComplete).toBe(false);
  expect(result.complete.reviewComplete).toBe(true);
  expect(result.complete.conformanceEstablished).toBe(false);
  expect(result.rescanned.counts['needs-revalidation']).toBe(55);
  expect(result.rescanned.reviewComplete).toBe(false);
});

test('coverage view records individual criteria and exports their mapped evidence and status', async ({ page }) => {
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','export.js','features.js','content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Manual');
  await expect(ui.locator('#wcagCoverageSummary')).toContainText('55 criteria');
  await expect(ui.locator('.criterion-evidence')).toHaveCount(55);
  await expect(ui.locator('.criterion-evidence[data-criterion="1.1.1"]')).toContainText('image-alt');
  await ui.locator('[data-check="3.3.8"]').selectOption('pass');
  await expect(ui.locator('.criterion-evidence[data-criterion="3.3.8"]')).toContainText('pass');
  await expect(ui.locator('#wcagCoverageSummary')).toContainText('Review incomplete');
  const pending = page.waitForEvent('download'); await ui.locator('#export').click();
  let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
  const report = JSON.parse(data);
  expect(report.wcagCoverage.criteria).toHaveLength(55);
  expect(report.wcagCoverage.criteria.find(c => c.id === '3.3.8').manual.status).toBe('pass');
  expect(report.wcagCoverage.reviewComplete).toBe(false);
});
