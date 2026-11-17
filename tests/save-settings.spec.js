const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

test('page filenames stay stable across rescans and distinguish sites and paths', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('export.js') });
  const names = await page.evaluate(async () => Promise.all([
    'https://example.com/customers/profile?token=SECRET#details',
    'https://example.com/customers/profile?token=CHANGED#other',
    'https://example.com/customers/settings',
    'https://other.example.com/customers/profile',
    'https://example.com:8443/customers/profile',
    'http://example.com/customers/profile'
  ].map(address => accessLensFilename(address))));
  expect(names[0]).toBe(names[1]);
  expect(new Set([names[0], ...names.slice(2)]).size).toBe(5);
  for (const name of names) {
    expect(name).toMatch(/^access-lens-[a-f0-9]{64}\.json$/);
    expect(name).not.toMatch(/SECRET|example|customers|profile/);
  }
});

test('preferences persist without reports; saves honor opt-in and folder permissions', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('save-settings.js') });
  const result = await page.evaluate(async () => {
    await accessLensSettings.write({ autoSave: true });
    const stored = await accessLensSettings.read();
    const reportFilename = 'access-lens-' + 'a'.repeat(64) + '.json';
    let settings = { autoSave: false };
    accessLensSettings.read = async () => settings;
    const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, scannedAt: '2026-11-15T12:00:00.000Z', results: {} };
    const skipped = await accessLensSettings.save(report, true, reportFilename);
    const fallback = await accessLensSettings.save(report, false, reportFilename);
    let written, filename, closed = false, writes = 0;
    settings = { autoSave: true, directory: {
      queryPermission: async () => 'granted',
      getFileHandle: async name => {
        filename = name; writes++;
        return { createWritable: async () => ({ write: async data => { written = data; }, close: async () => { closed = true; } }) };
      }
    } };
    const saved = await accessLensSettings.save(report, true, reportFilename);
    const firstFilename = filename;
    await accessLensSettings.save(report, false, reportFilename);
    const stable = filename === firstFilename;
    settings.directory.queryPermission = async () => 'prompt';
    let denied = false;
    try { await accessLensSettings.save(report, true, reportFilename); } catch { denied = true; }
    settings.directory.queryPermission = async () => 'granted';
    settings.directory.getFileHandle = async () => { throw new Error('disk full'); };
    let failed = false;
    try { await accessLensSettings.save(report, false, reportFilename); } catch { failed = true; }
    return { stored, skipped, fallback, saved, written, closed, writes, denied, failed, stable, filename };
  });
  expect(result.stored).toEqual({ autoSave: true });
  expect(result.skipped).toEqual({ skipped: true });
  expect(result.fallback).toEqual({ download: true });
  expect(result.saved).toEqual({ saved: true });
  expect(JSON.parse(result.written).privacy.mode).toBe('content-free');
  expect(result).toMatchObject({ closed: true, writes: 2, denied: true, failed: true, stable: true });
  expect(result.filename).toMatch(/^access-lens-[a-f0-9]{64}\.json$/);
});

test('settings UI chooses a folder, persists auto save, and resets', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(fs.readFileSync(path.resolve('options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
  await page.evaluate(() => {
    window.preferences = { autoSave: false };
    window.accessLensSettings = { read: async () => preferences, write: async value => { preferences = value; } };
    window.showDirectoryPicker = async () => ({ name: 'My reports', queryPermission: async () => 'prompt', requestPermission: async () => { window.restored = true; return 'granted'; } });
  });
  await page.addScriptTag({ path: path.resolve('options.js') });
  await expect(page.locator('#autoSave')).toBeDisabled();
  await page.locator('#choose').click();
  await expect(page.locator('#folder')).toContainText('My reports');
  await expect(page.locator('#permission')).toContainText('needs to be restored');
  await page.locator('#restore').click();
  await expect(page.locator('#status')).toContainText('Folder access restored');
  expect(await page.evaluate(() => window.restored)).toBe(true);
  await page.locator('#autoSave').check();
  expect(await page.evaluate(() => preferences.autoSave)).toBe(true);
  await page.locator('#reset').click();
  await expect(page.locator('#autoSave')).not.toBeChecked();
  await expect(page.locator('#autoSave')).toBeDisabled();
  expect(await page.evaluate(() => preferences)).toEqual({ autoSave: false });
});

test('save errors identify recovery without exposing native paths', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('save-settings.js') });
  const errors = await page.evaluate(() => [
    { code: 'FOLDER_PERMISSION', message: 'PRIVATE_PATH' },
    { name: 'NotFoundError', message: 'PRIVATE_PATH' },
    { name: 'NoModificationAllowedError', message: 'PRIVATE_PATH' },
    { name: 'QuotaExceededError', message: 'PRIVATE_PATH' },
    { name: 'TypeError', message: 'PRIVATE_PATH' }
  ].map(error => accessLensSettings.saveError(error)));
  expect(errors[0].error).toContain('Restore folder access');
  expect(errors[1].error).toContain('no longer available');
  expect(errors[2].error).toContain('locked or read-only');
  expect(errors[3].error).toContain('not enough storage');
  expect(errors[4].code).toBe('SAVE_FAILED');
  expect(JSON.stringify(errors)).not.toContain('PRIVATE_PATH');
});

test('inspector sends content-free reports for auto and manual saves and reports failures', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    window.saveMessages = [];
    window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => {
      saveMessages.push(message);
      if (message.type !== 'access-lens-save') return {};
      return message.automatic ? { saved: true } : { error: 'Folder access expired' };
    } } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), path.resolve('inspection.js'), path.resolve('export.js'), path.resolve('workflow.js'), path.resolve('features.js'), path.resolve('content.js')]) {
    await page.addScriptTag({ path: file });
  }
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#saveStatus')).toContainText('auto saved');
  await ui.locator('#export').click();
  await expect(ui.locator('#saveStatus')).toContainText('Could not save JSON');
  const messages = await page.evaluate(() => saveMessages.filter(message => message.type === 'access-lens-save'));
  expect(messages.map(message => message.automatic)).toEqual([true, false]);
  for (const message of messages) {
    expect(message.report.privacy.mode).toBe('alternative-text-included');
    expect(JSON.stringify(message.report)).not.toContain('Test page');
    expect(message.report.page).toBeUndefined();
  }
});



