const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

test('scan snapshots and portable event history omit page content, values and source metadata without network uploads', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    history.replaceState(null, '', '/cases/123?token=PRIVATE_QUERY#PRIVATE_FRAGMENT');
    document.title = 'PRIVATE_TITLE';
    document.querySelector('main').insertAdjacentHTML('beforeend', '<p id="PRIVATE_ID" class="PRIVATE_CLASS" data-build="PRIVATE_BUILD">PRIVATE_TEXT</p><label for="field">PRIVATE_LABEL</label><input id="field" value="PRIVATE_VALUE" aria-description="PRIVATE_DESCRIPTION"><img alt="PRIVATE_ALT"><private-component-name>PRIVATE_CUSTOM</private-component-name>');
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'inspection.js', 'export.js', 'save-settings.js', 'recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push({ method: request.method(), url: request.url(), data: request.postData() }); });
  const result = await page.evaluate(async () => {
    const results = await accessLensFeatures.runAxe(document);
    const report = accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp });
    const filename = await accessLensFilename(location.href);
    const response = await accessLensSettings.saveRecoverable(report, false, filename);
    const stored = await new Promise(async (resolve, reject) => {
      const db = await accessLensSettings.database();
      const tx = db.transaction('preferences');
      const request = tx.objectStore('preferences').getAll();
      request.onsuccess = () => { resolve(request.result); db.close(); };
      request.onerror = () => { reject(request.error); db.close(); };
    });
    return { response, report, stored, bundle: await accessLensSettings.preservedEvidence() };
  });
  expect(result.response).toEqual({ download: true });
  expect(result.report.pagePath).toBe('http://127.0.0.1:4178/cases/123');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|private-component-name|data:image|data-build/);
  expect(result.bundle.events.length).toBeGreaterThan(0);
  expect(requests).toEqual([]);
});

test('worker diagnostics never log raw launch or restoration errors', async () => {
  const warnings = [];
  let clicked;
  const context = vm.createContext({ URL, importScripts() {}, console: { warn: (...args) => warnings.push(args) },
    accessLensAutoMode: { restore: async () => { throw new Error('PRIVATE_RESTORE_URL'); } },
    chrome: { runtime: { id: 'test', onMessage: { addListener() {} } },
      scripting: { executeScript: async () => { throw new Error('PRIVATE_LAUNCH_URL'); } },
      action: { onClicked: { addListener(fn) { clicked = fn; } }, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} } }
  });
  vm.runInContext(fs.readFileSync(path.resolve('background.js'), 'utf8'), context);
  await clicked({ id: 1 });
  await new Promise(resolve => setImmediate(resolve));
  expect(warnings.length).toBeGreaterThan(0);
  expect(JSON.stringify(warnings)).not.toContain('PRIVATE_');
  expect(warnings.every(args => args.length === 1 && typeof args[0] === 'string')).toBe(true);
});
