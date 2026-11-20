const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function downloadReport(page, ui) {
  const event = page.waitForEvent('download'); await ui.locator('#export').click();
  let text = ''; for await (const chunk of await (await event).createReadStream()) text += chunk;
  return JSON.parse(text);
}

test('attention filtering applies across findings, ARIA and inventory views without changing evidence', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<!doctype html><html lang="en"><head><title>Attention filter fixture</title></head><body><main><h1>Trail options</h1><div role="not-a-role">Invalid role</div><div role="note" aria-label="Trail guidance">Valid note</div><img src="/laboratory/assets/mountain.svg" alt="image" width="120" height="70"><img src="/laboratory/assets/mountain.svg" alt="Mountain at the end of the trail" width="120" height="70"><label for="note">Trail note</label><input id="note"><button>Choose trail</button><button></button></main></body></html>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await expect(ui.locator('#findingFilter')).toHaveValue('attention');
  const before = await downloadReport(page, ui);
  const totals = await ui.locator('.stats').textContent();
  await expect(ui.locator('.results')).toContainText('ARIA roles');
  for (const category of ['features', 'structure', 'aria', 'passes']) {
    await ui.locator(`[data-kind="${category}"]`).click();
    const attentionCount = await ui.locator('.results .icon, .results details.rule').count();
    await ui.locator('#findingFilter').selectOption('all');
    const allCount = await ui.locator('.results .icon, .results details.rule').count();
    expect(allCount).toBeGreaterThan(attentionCount);
    await ui.locator('#findingFilter').selectOption('attention');
    expect(await ui.locator('.results .icon, .results details.rule').count()).toBe(attentionCount);
    if (category === 'aria') {
      await expect(ui.locator('.icon')).toHaveCount(1);
      await expect(ui.locator('.icon')).toHaveAttribute('aria-label', /Invalid role/);
    }
  }
  await ui.locator('[data-kind="alerts"]').click();
  await expect(ui.locator('.icon')).toHaveCount(1);
  await ui.locator('#viewSelect').selectOption('Reference');
  await expect(ui.locator('.results')).toContainText('Suspicious alternative text');
  await ui.locator('#viewSelect').selectOption('Structure');
  await expect(ui.locator('.icon')).toHaveCount(0);
  await ui.locator('#findingFilter').selectOption('all');
  await expect(ui.locator('.icon')).toHaveCount(2);
  await ui.locator('#viewSelect').selectOption('Order');
  const completeOrder = await ui.locator('.icon').allTextContents();
  await ui.locator('#findingFilter').selectOption('attention');
  const filteredOrder = await ui.locator('.icon').allTextContents();
  expect(filteredOrder.length).toBeLessThan(completeOrder.length);
  for (const number of filteredOrder) expect(completeOrder).toContain(number);
  await ui.locator('#viewSelect').selectOption('Manual');
  await expect(ui.locator('.manual-item')).toHaveCount(66);
  await expect(ui.locator('[data-criterion]')).toHaveCount(55);
  expect(await ui.locator('.stats').textContent()).toBe(totals);
  expect(await downloadReport(page, ui)).toEqual(before);
  await ui.locator('#viewSelect').selectOption('Details');
  await page.screenshot({ path: testInfo.outputPath('attention-filter.png') });
});
