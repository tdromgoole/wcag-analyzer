const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

test('concurrent menu refreshes serialize creation and consume callback errors', async () => {
  const items = new Set(); let duplicates = 0, callbackErrorsRead = 0, lastError;
  const runtime = { onMessage: { addListener() {} } };
  Object.defineProperty(runtime, 'lastError', { get() { if (lastError) callbackErrorsRead++; return lastError; } });
  const context = vm.createContext({
    importScripts() {},
    accessLensSettings: { read: async () => ({ paused: true }) },
    chrome: { runtime, action: { onClicked: { addListener() {} } }, contextMenus: {
      onClicked: { addListener() {} },
      removeAll: async () => { await new Promise(resolve => setTimeout(resolve, 1)); items.clear(); },
      create: (item, callback) => setTimeout(() => {
        if (items.has(item.id)) { duplicates++; lastError = { message: 'Duplicate id' }; }
        items.add(item.id); callback(); lastError = undefined;
      }, 1)
    } }
  });
  vm.runInContext(fs.readFileSync(path.resolve('background.js'), 'utf8'), context);
  await Promise.all([context.refreshMenu(), context.refreshMenu(), context.refreshMenu()]);
  expect(duplicates).toBe(0); expect([...items]).toEqual(['access-lens-pause']);
  context.chrome.contextMenus.create = (item, callback) => { lastError = { message: 'Menu failed' }; callback(); lastError = undefined; };
  let failure;
  try { await context.refreshMenu(); } catch (error) { failure = error.message; }
  expect(failure).toBe('Menu failed');
  expect(callbackErrorsRead).toBe(1);
});

test('asset warnings become limited-scope diagnostics while other warnings and checks remain', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const file of ['features.js', 'export.js']) await page.addScriptTag({ path: path.resolve(file) });
  const result = await page.evaluate(async () => {
    const original = console.warn, forwarded = [];
    console.warn = (...args) => forwarded.push(args[0]); const expected = console.warn;
    window.axe = { getRules: () => [], run: async (context, options) => {
      console.warn("Couldn't load preload assets: ", { url: 'PRIVATE_ASSET', event: 'PRIVATE_EVENT' });
      console.warn('Other warning');
      return { violations: [], incomplete: [], passes: [], inapplicable: [], options };
    } };
    const results = await accessLensFeatures.runAxe({}, { preload: true });
    const report = accessLensExport({ results, inventory: {}, scannedAt: new Date().toISOString() });
    const restoredAfterSuccess = console.warn === expected;
    axe.run = async () => { console.warn('axe.utils.preloadMedia did not load metadata'); throw new Error('Scan failed'); };
    try { await accessLensFeatures.runAxe({}, {}); } catch { /* Expected. */ }
    const restoredAfterError = console.warn === expected;
    console.warn = original;
    return { report, forwarded, restoredAfterSuccess, restoredAfterError, options: results.options };
  });
  expect(result.report.completeness).toMatchObject({ status: 'limited', assetPreloadStatus: 'failed' });
  expect(JSON.stringify(result.report)).not.toContain('PRIVATE_');
  expect(result.forwarded).toEqual(['Other warning']);
  expect(result.options.preload).toBe(true);
  expect(result.restoredAfterSuccess && result.restoredAfterError).toBe(true);
});

test('automatic scanner stops cleanly when extension messaging throws synchronously after reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    window.chrome = { runtime: {
      sendMessage() { throw new Error('Extension context invalidated.'); },
      onMessage: { addListener() {}, removeListener() { throw new Error('Extension context invalidated.'); } }
    } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'auto-scan.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  await expect.poll(() => page.evaluate(() => Boolean(window.__accessLensAutoScan))).toBe(false);
  expect(errors).toEqual([]);
});

test('an old inspector asks for a page refresh instead of scanning or downloading after reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => message.type === 'access-lens-save' ? { skipped: true } : {} } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  await page.evaluate(() => { chrome.runtime.sendMessage = () => { throw new Error('Extension context invalidated.'); }; });
  await ui.locator('#scan').click();
  await expect(ui.locator('.results')).toContainText('Refresh this webpage');
  await expect(ui.locator('#export')).toBeDisabled();
  await page.evaluate(() => { chrome.runtime.id = undefined; });
  await ui.locator('#scan').click();
  await expect(ui.locator('.results')).toContainText('Refresh this webpage');
  expect(errors).toEqual([]);
});
