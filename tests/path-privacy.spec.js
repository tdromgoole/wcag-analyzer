const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('approved paths survive export, recovery, folder saving and site reporting without URL secrets', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'save-settings.js', 'recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const result = await page.evaluate(async () => {
    const address = 'https://SECRET_USER:SECRET_PASSWORD@example.test:8443/cases/123/edit?token=SECRET_QUERY#SECRET_FRAGMENT';
    const results = await axe.run();
    const report = accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp }, address);
    report.pageState = { key: '0'.repeat(64) };
    const filename = await accessLensFilename(address);
    let written;
    const read = accessLensSettings.read.bind(accessLensSettings);
    let available = false;
    const directory = {
      queryPermission: async () => available ? 'granted' : 'prompt',
      getFileHandle: async (name, options) => {
        if (!written && !options?.create) throw new DOMException('Missing', 'NotFoundError');
        return { getFile: async () => new File(written ? [JSON.stringify(written)] : [], name), createWritable: async () => ({ write: async data => { written = JSON.parse(data); }, close: async () => {}, abort: async () => {} }) };
      }
    };
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory });
    const queued = await accessLensSettings.saveRecoverable(report, false, filename);
    const pending = await accessLensSettings.pending();
    available = true;
    const retry = await accessLensSettings.flushQueue(true);
    const evidence = accessLensFeatures.reportEvidence(written, filename);
    const site = accessLensFeatures.savedSiteReport([evidence], 'https://example.test:8443');
    const html = accessLensFeatures.siteReportHTML(site);
    return { report, queued, pending, retry, written, site, html };
  });
  const approved = 'https://example.test:8443/cases/123/edit';
  expect(result.report.pagePath).toBe(approved);
  expect(result.queued.queued).toBe(true);
  expect(Object.values(result.pending)[0].report.pagePath).toBe(approved);
  expect(result.retry).toEqual({ saved: 1, remaining: 0 });
  expect(result.written.pagePath).toBe(approved);
  expect(result.site.pages[0].pagePath).toBe(approved);
  expect(result.html).toContain(approved);
  expect(JSON.stringify(result)).not.toContain('SECRET_');
});
