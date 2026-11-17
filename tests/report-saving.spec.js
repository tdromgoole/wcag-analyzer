const { test, expect } = require('@playwright/test');
const path = require('node:path');
test('current exported reports pass queue and folder validation with alternative text', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const name of [require.resolve('axe-core/axe.min.js'), ...['save-settings.js', 'features.js', 'recovery.js', 'inspection.js', 'export.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: name });
  const result = await page.evaluate(async () => {
    document.querySelector('img').alt = 'Example description';
    const results = await axe.run();
    const report = accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp });
    const filename = await accessLensFilename(location.href);
    let written;
    const read = accessLensSettings.read.bind(accessLensSettings);
    const directory = {
      queryPermission: async () => 'granted',
      getFileHandle: async () => ({ createWritable: async () => ({ write: async data => { written = JSON.parse(data); }, close: async () => {} }) })
    };
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory, autoSave: true });
    const saved = await accessLensSettings.saveRecoverable(report, true, filename);
    let rejected = false;
    try { await accessLensSettings.enqueue({ ...report, privacy: { mode: 'raw' } }, filename); } catch { rejected = true; }
    let filenameError;
    try { await accessLensSettings.enqueue(report, 'outdated.json'); } catch (error) { filenameError = accessLensSettings.saveError(error).code; }
    return { saved, written, pending: await accessLensSettings.pending(), rejected, filenameError };
  });
  expect(result.saved).toEqual({ saved: true });
  expect(result.written.privacy.mode).toBe('alternative-text-included');
  expect(result.written.inventory.features.flatMap(group => group.nodes).some(node => node.alternativeText === 'Example description')).toBe(true);
  expect(result.pending).toEqual({});
  expect(result.rejected).toBe(true);
  expect(result.filenameError).toBe('INVALID_FILENAME');
});

test('sitemap saves to the selected folder as sitemap.json and reports permission failures', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const name of ['save-settings.js', 'features.js']) await page.addScriptTag({ path: path.resolve(name) });
  const result = await page.evaluate(async () => {
    let settings = {}, allowed = true, written;
    const names = [];
    accessLensSettings.read = async () => settings;
    accessLensSettings.sitemap = async () => ({ nodes: {} });
    const fallback = await accessLensSettings.saveSitemap('site');
    settings.directory = {
      queryPermission: async () => allowed ? 'granted' : 'prompt',
      getFileHandle: async name => {
        names.push(name);
        return { createWritable: async () => ({ write: async data => { written = JSON.parse(data); }, close: async () => {} }) };
      }
    };
    const saved = await accessLensSettings.saveSitemap('site');
    await accessLensSettings.saveSitemap('site');
    allowed = false;
    let denied;
    try { await accessLensSettings.saveSitemap('site'); } catch (error) { denied = accessLensSettings.saveError(error); }
    return { fallback, saved, names, written, denied };
  });
  expect(result.fallback).toEqual({ download: true });
  expect(result.saved).toEqual({ saved: true });
  expect(result.names).toEqual(['sitemap.json', 'sitemap.json']);
  expect(result.written.nodes).toEqual([]);
  expect(result.denied.code).toBe('FOLDER_PERMISSION');
});

test('autosave refreshes the sitemap and retries both files when sitemap writing fails', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const name of ['save-settings.js', 'features.js', 'recovery.js']) await page.addScriptTag({ path: path.resolve(name) });
  const result = await page.evaluate(async () => {
    const site = 'a'.repeat(64), id = 'b'.repeat(64), state = 'c'.repeat(64);
    const filename = `access-lens-${id}.json`;
    const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, pagePath: location.origin, scannedAt: '2026-11-16T12:00:00.000Z' };
    const metadata = { site, page: id, state, nodes: [{ id, parent: null, path: '/guides/page-name.html?PRIVATE#SECRET', linked: true }], scannedAt: report.scannedAt, violations: 1, review: 0 };
    const files = {}, names = [];
    let failSitemap = false;
    const read = accessLensSettings.read.bind(accessLensSettings);
    const directory = {
      queryPermission: async () => 'granted',
      getFileHandle: async name => {
        names.push(name);
        if (name === 'sitemap.json' && failSitemap) throw Object.assign(new Error(), { name: 'NoModificationAllowedError' });
        return { createWritable: async () => ({ write: async data => { files[name] = JSON.parse(data); }, close: async () => {} }) };
      }
    };
    let autoSave = false;
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory, autoSave });
    const skipped = await accessLensSettings.saveRecoverable(report, true, filename, metadata);
    const skippedWrites = names.length;
    autoSave = true;
    const first = await accessLensSettings.saveRecoverable(report, true, filename, metadata);
    const firstMap = files['sitemap.json'];
    report.scannedAt = metadata.scannedAt = '2026-11-16T13:00:00.000Z';
    metadata.violations = 0;
    failSitemap = true;
    const failed = await accessLensSettings.saveRecoverable(report, true, filename, metadata);
    const queued = Object.keys(await accessLensSettings.pending()).length;
    failSitemap = false;
    const retry = await accessLensSettings.flushQueue(true);
    return { skipped, skippedWrites, first, firstMap, failed, queued, retry, latest: files['sitemap.json'], names };
  });
  expect(result.skipped).toEqual({ skipped: true });
  expect(result.skippedWrites).toBe(0);
  expect(result.first).toEqual({ saved: true });
  expect(result.firstMap.coverage.scanned).toBe(1);
  expect(result.firstMap.nodes[0].path).toBe('/guides/page-name.html');
  expect(Number.isFinite(Date.parse(result.firstMap.nodes[0].dateAdded))).toBe(true);
  expect(result.latest.nodes[0].dateAdded).toBe(result.firstMap.nodes[0].dateAdded);
  expect(JSON.stringify(result.latest)).not.toMatch(/PRIVATE|SECRET/);
  expect(result.firstMap.nodes[0].states['c'.repeat(64)].violations).toBe(1);
  expect(result.failed).toMatchObject({ queued: true, code: 'NoModificationAllowedError' });
  expect(result.queued).toBe(1);
  expect(result.retry).toEqual({ saved: 1, remaining: 0 });
  expect(result.latest.nodes[0].states['c'.repeat(64)].violations).toBe(0);
  expect(result.latest.nodes[0].complianceAt).toBeNull();
  expect(result.latest.nodes[0].states['c'.repeat(64)].wcagPending).toBe(60);
  expect(result.names.filter(name => name === 'sitemap.json')).toHaveLength(3);
});
