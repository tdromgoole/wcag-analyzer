const { test, expect } = require('@playwright/test');
const path = require('node:path');
test('scanner includes active A/AA rules and excludes best practices, AAA and parsing', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const file of [require.resolve('axe-core/axe.min.js'), path.resolve('workflow.js'), path.resolve('features.js')]) await page.addScriptTag({ path: file });
  const result = await page.evaluate(async () => {
    const options = accessLensFeatures.scanOptions();
    const rules = axe.getRules().filter(rule => options.runOnly.values.includes(rule.ruleId));
    const report = await accessLensFeatures.runAxe(document, { runOnly: { type: 'tag', values: ['best-practice'] }, iframes: true });
    return { options, rules, results: Object.fromEntries(['violations','incomplete','passes','inapplicable'].map(bucket => [bucket, report[bucket].map(rule => rule.id)])) };
  });
  const selected = result.options.runOnly.values;
  expect(result.options.iframes).toBe(false);
  for (const id of ['image-alt', 'button-name', 'color-contrast', 'target-size']) expect(selected).toContain(id);
  for (const id of ['region', 'heading-order', 'landmark-one-main', 'color-contrast-enhanced', 'duplicate-id']) expect(selected).not.toContain(id);
  for (const rule of result.rules) {
    expect(rule.tags.some(tag => /^wcag(?:2|21|22)aa?$/.test(tag))).toBe(true);
    expect(rule.tags.some(tag => /^wcag[0-9]{3,}$/.test(tag) && tag !== 'wcag411')).toBe(true);
  }
  for (const ids of Object.values(result.results)) for (const id of ids) expect(selected).toContain(id);
  expect(result.results.violations).toContain('image-alt');
});
