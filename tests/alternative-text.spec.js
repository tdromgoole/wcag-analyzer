const { test, expect } = require('@playwright/test');
const path = require('node:path');
test('alternative text inventory flags review alerts without treating descriptions as failures', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = '<img alt=""><img alt="photo"><img alt="Example"><span>Example</span>';
  });
  await page.addScriptTag({ path: path.resolve('inspection.js') });
  const inventory = await page.evaluate(() => accessLensInventory());
  expect(inventory.alerts.map(group => group.id).sort()).toEqual(['alt-empty', 'alt-redundant', 'alt-suspicious']);
  expect(inventory.features.find(group => group.id === 'image-alt').nodes).toHaveLength(2);
});

test('long alternative text has no arbitrary length alert and reviews map to 1.1.1', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => { document.querySelector('main').innerHTML = '<img alt="' + 'A detailed description. '.repeat(20) + '"><img alt="">'; });
  await page.addScriptTag({ path: path.resolve('inspection.js') });
  const inventory = await page.evaluate(() => accessLensInventory());
  expect(inventory.alerts.map(group => group.id)).toEqual(['alt-empty']);
  expect(inventory.alerts[0].tags).toContain('wcag111');
});
