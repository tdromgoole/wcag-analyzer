const { test, expect } = require('@playwright/test');
const path = require('node:path');
for (const groups of [10, 100]) {
  test(`optional combined stress profile: ${groups} groups`, async ({ page }, testInfo) => {
    await page.goto('http://127.0.0.1:4178/laboratory/stress.html');
    await expect(page.locator('#samples section')).toHaveCount(0);
    await page.locator('#size').selectOption(String(groups));
    await page.locator('#generate').click();
    await expect(page.locator('#samples section')).toHaveCount(groups);
    for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'checks.js', 'inspection.js', 'export.js', 'save-settings.js', 'recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
    const observed = await page.evaluate(async () => {
      const started = performance.now(), results = await accessLensFeatures.runAxe(document);
      const report = accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp });
      accessLensSettings.normalizeEvidence(report);
      const counts = {};
      for (const ruleId of ['image-alt', 'button-name', 'label']) {
        counts[ruleId] = {};
        for (const bucket of ['violations', 'passes']) counts[ruleId][bucket] = (report.results[bucket].find(rule => rule.id === ruleId)?.nodes || []).filter(node => document.querySelector(node.target[0])?.closest('#samples')).length;
      }
      return { counts, durationMs: Math.round(performance.now() - started), elements: document.querySelectorAll('*').length,
        contentFree: report.privacy.mode === 'content-free' && !JSON.stringify(report).includes('"alternativeText":'), scanId: report.scanId };
    });
    expect(observed.contentFree).toBe(true);
    for (const rule of Object.values(observed.counts)) expect(rule).toEqual({ violations: groups, passes: groups });
    await testInfo.attach('stress-observation', { body: Buffer.from(JSON.stringify({ groups, ...observed })), contentType: 'application/json' });
    await page.locator('#clear').click();
    await expect(page.locator('#samples section')).toHaveCount(0);
  });
}
