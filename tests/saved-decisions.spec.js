const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

test('inspector restores decisions and immediately requests saving edits', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    window.savedChoices = [];
    window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => {
      if (message.type === 'access-lens-history') return { checklist: { keyboard: { status: 'fail', checkedAt: '2026-11-16T12:00:00Z' } } };
      if (message.type === 'access-lens-save') { savedChoices.push(message); return message.decisionsChanged ? { saved: true } : { skipped: true }; }
      return {};
    } } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','export.js','workflow.js','features.js','content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Manual');
  await expect(ui.locator('[data-check=keyboard]')).toHaveValue('fail');
  await ui.locator('[data-check=keyboard]').selectOption('pass');
  await expect.poll(() => page.evaluate(() => savedChoices.filter(message => message.decisionsChanged).length)).toBe(1);
  const saved = await page.evaluate(() => savedChoices.find(message => message.decisionsChanged));
  expect(saved.report.manualChecks.keyboard.status).toBe('pass');
  expect(Date.parse(saved.report.manualChecks.keyboard.checkedAt)).toBeGreaterThan(Date.parse('2026-11-16T12:00:00Z'));
});

test('worker saves explicit decision edits with auto-save off without triggering downloads', async () => {
  let listener, folder = true;
  const calls = [];
  const context = vm.createContext({ URL, importScripts() {},
    accessLensAutoMode: { restore: async () => {} },
    accessLensFeatures: { policy: () => ({}) },
    accessLensSettings: { read: async () => ({ autoSave: false, directory: folder }),
      saveRecoverable: async (...args) => { calls.push(args); return { saved: true }; }, sitemap: async () => {} },
    chrome: { runtime: { id: 'test', onMessage: { addListener(fn) { listener = fn; } } }, action: { onClicked: { addListener() {} } } }
  });
  vm.runInContext(fs.readFileSync(path.resolve('background.js'), 'utf8'), context);
  const message = { type: 'access-lens-save', automatic: true, decisionsChanged: true, filename: 'test', report: { pagePath: 'https://example.com/' } };
  const send = () => new Promise(resolve => listener(message, { id: 'test' }, resolve));
  expect(await send()).toEqual({ saved: true });
  expect(calls[0][1]).toBe(false);
  folder = false;
  expect(await send()).toEqual({ skipped: true });
  expect(calls).toHaveLength(1);
});

test('restores disk decisions without browser history and validates imported choices', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const name of ['workflow.js', 'save-settings.js']) await page.addScriptTag({ path: path.resolve(name) });
  const result = await page.evaluate(async () => {
    const filename = 'access-lens-' + 'a'.repeat(64) + '.json';
    const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, manualChecks: {
      keyboard: { status: 'fail', checkedAt: '2026-11-16T12:00:00.000Z', secret: 'do not import' },
      contrast: { status: 'unknown', checkedAt: '2026-11-16T12:00:00Z' },
      'scope-pages': { status: 'not-applicable', checkedAt: '2026-11-16T12:00:00Z' },
      unknown: { status: 'pass', checkedAt: '2026-11-16T12:00:00Z' }
    }, keyboardTest: { id: 'run-1', status: 'completed', startedAt: '2026-11-16T11:00:00Z',
      entries: [], assessment: { status: 'fail', runId: 'run-1', checkedAt: '2026-11-16T12:00:00Z' } } };
    let name, create;
    const settings = { rememberHistory: false, directory: {
      queryPermission: async () => 'granted',
      getFileHandle: async (value, options) => { name = value; create = options?.create; return { getFile: async () => new File([JSON.stringify(report)], value) }; }
    } };
    accessLensSettings.read = async () => settings;
    const restored = await accessLensSettings.history(filename);
    settings.directory.getFileHandle = async () => { throw new DOMException('missing', 'NotFoundError'); };
    const missing = await accessLensSettings.history(filename);
    settings.directory.queryPermission = async () => 'denied';
    let denied; try { await accessLensSettings.history(filename); } catch (e) { denied = e.code; }
    settings.directory.queryPermission = async () => 'granted';
    settings.directory.getFileHandle = async () => ({ getFile: async () => new File(['broken JSON'], filename) });
    let malformed = false; try { await accessLensSettings.history(filename); } catch { malformed = true; }
    return { restored, name, create, missing, denied, malformed };
  });
  expect(result.restored.checklist).toEqual({ keyboard: { status: 'fail', checkedAt: '2026-11-16T12:00:00.000Z' } });
  expect(result.restored.keyboardTest.assessment.status).toBe('fail');
  expect(result.restored.keyboardTest.limitations.length).toBeGreaterThan(0);
  expect(result.name).toMatch(/^access-lens-a{64}\.json$/);
  expect(result.create).toBeUndefined();
  expect(result.missing.checklist).toBeUndefined();
  expect(result.denied).toBe('FOLDER_PERMISSION');
  expect(result.malformed).toBe(true);
});
