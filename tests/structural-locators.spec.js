const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('identifier-free nested and shadow elements resolve from sanitized ancestry snapshots', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = '<h1>Locator fixture</h1><section><h2>Controls</h2><div><button></button><img></div></section><div></div>';
    document.querySelector('main > div').attachShadow({ mode: 'open' }).innerHTML = '<section><button></button></section>';
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'inspection.js', 'export.js', 'save-settings.js', 'recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const result = await page.evaluate(async () => {
    const button = document.querySelector('main section button');
    const shadowButton = document.querySelector('main > div').shadowRoot.querySelector('button');
    const scan = async () => {
      const results = await accessLensFeatures.runAxe(document);
      return accessLensExport({ results, inventory: accessLensInventory(), scannedAt: results.timestamp });
    };
    const resolve = target => {
      let scope = document, element;
      for (const part of target) { element = scope.querySelector(part); if (!element) return null; scope = element.shadowRoot || element; }
      return element;
    };
    const first = await scan();
    const nodes = first.results.violations.find(rule => rule.id === 'button-name').nodes;
    const regular = nodes.find(node => resolve(node.target) === button);
    const shadow = nodes.find(node => resolve(node.target) === shadowButton);
    const filename = await accessLensFilename(location.href);
    await accessLensSettings.saveRecoverable(first, false, filename);
    const inserted = document.createElement('aside');
    document.querySelector('main').prepend(inserted);
    const second = await scan();
    const updated = second.results.violations.find(rule => rule.id === 'button-name').nodes.find(node => resolve(node.target) === button);
    await accessLensSettings.saveRecoverable(second, false, filename);
    const bundle = await accessLensSettings.preservedEvidence();
    return { regular, shadow, updated, originalStillResolvesSameElement: resolve(regular.target) === button,
      preservedOldTarget: bundle.snapshots.some(entry => entry.report.results.violations.some(rule => rule.id === 'button-name' && rule.nodes.some(node => JSON.stringify(node.target) === JSON.stringify(regular.target)))) };
  });
  expect(result.regular.locatorAvailable).toBe(true);
  expect(result.shadow.locatorAvailable).toBe(true);
  expect(result.shadow.target).toHaveLength(2);
  expect(result.updated.target).not.toEqual(result.regular.target);
  expect(result.originalStillResolvesSameElement).toBe(false);
  expect(result.preservedOldTarget).toBe(true);
  for (const node of [result.regular, result.shadow, result.updated]) expect(node.target.every(part => !/[#.]/.test(part))).toBe(true);
  await page.addScriptTag({ path: path.resolve('content.js') });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  const shadowRow = await ui.locator('.node').evaluateAll(rows => rows.findIndex(row => Array.isArray(row._node?.target?.[0])));
  expect(shadowRow).toBeGreaterThanOrEqual(0);
  await ui.locator('.node').nth(shadowRow).evaluate(row => { row.closest('details').open = true; });
  await ui.locator('.node').nth(shadowRow).click();
  await expect(ui.locator('.highlight')).toHaveCount(1);
});
