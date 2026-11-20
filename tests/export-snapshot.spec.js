const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('successive exports refresh geometry, relationships, siblings and shadow locators', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = '<h1>Export snapshot fixture</h1><label id="caption" for="control">Trail note</label><input id="control" aria-labelledby="caption" style="width:180px;font-size:16px"><div id="host"></div>';
    document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML = '<button id="shadow-control">Choose trail</button>';
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'inspection.js', 'export.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const observed = await page.evaluate(async () => {
    const results = await accessLensFeatures.runAxe(document);
    const source = { results, inventory: accessLensInventory(), scannedAt: results.timestamp };
    const resolve = target => { let scope = document, element; for (const part of target) { element = scope.querySelector(part); if (!element) return null; scope = element.shadowRoot || element; } return element; };
    const input = document.querySelector('#control'), shadow = document.querySelector('#host').shadowRoot.querySelector('button');
    const find = (report, element) => Object.values(report.results).flatMap(rules => rules.flatMap(rule => rule.nodes)).find(node => resolve(node.target) === element);
    const first = accessLensExport(source), original = find(first, input), originalShadow = find(first, shadow);
    const retained = JSON.stringify(first);
    input.style.width = '260px'; input.style.fontSize = '22px'; input.disabled = true;
    document.querySelector('#caption').remove();
    document.querySelector('main').prepend(document.createElement('aside'));
    shadow.parentNode.prepend(document.createElement('span'));
    source.inventory = accessLensInventory();
    const second = accessLensExport(source), updated = find(second, input), updatedShadow = find(second, shadow);
    return { original, updated, originalShadow: originalShadow.target, updatedShadow: updatedShadow.target,
      historicalUnchanged: JSON.stringify(first) === retained, updatedInputResolves: resolve(updated.target) === input,
      updatedShadowResolves: resolve(updatedShadow.target) === shadow };
  });
  expect(observed.original.measurements.fontSize).toBe(16);
  expect(observed.updated.measurements.fontSize).toBe(22);
  expect(observed.updated.measurements.width).toBeGreaterThan(observed.original.measurements.width);
  expect(observed.original.relationships.labelledBy.valid).toBe(true);
  expect(observed.updated.relationships.labelledBy.valid).toBe(false);
  expect(observed.original.disabled).toBe(false);
  expect(observed.updated.disabled).toBe(true);
  expect(observed.updatedShadow).not.toEqual(observed.originalShadow);
  expect(observed.historicalUnchanged).toBe(true);
  expect(observed.updatedInputResolves).toBe(true);
  expect(observed.updatedShadowResolves).toBe(true);
});
