const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('checks.js') });
});

test('supplementary evidence finds review candidates without exposing content or asserting failures', async ({ page }) => {
  await page.setContent(`<style>@keyframes PRIVATE_ANIMATION { from { opacity: .5 } to { opacity: 1 } }</style>
    <main><p style="width:40px;height:10px;overflow:hidden;white-space:nowrap">PRIVATE_TEXT long text</p>
    <p style="position:absolute;left:2000px">Overflow</p><button id="PRIVATE_ID" tabindex="3">Button</button>
    <video width="100" height="50"></video><audio autoplay></audio><input type="email" name="PRIVATE_NAME" value="PRIVATE_VALUE">
    <div style="animation:PRIVATE_ANIMATION 10s infinite">Animated</div><custom-private-name></custom-private-name></main>`);
  await page.evaluate(() => {
    document.querySelector('custom-private-name').attachShadow({ mode: 'open' }).innerHTML = '<button tabindex="2">Shadow</button>';
    const host = document.createElement('div'); host.id = 'access-lens-extension';
    host.attachShadow({ mode: 'open' }).innerHTML = '<button tabindex="99">Inspector excluded</button>'; document.body.append(host);
  });
  const evidence = await page.evaluate(() => accessLensChecks.snapshot());
  expect(evidence.checks).toHaveLength(7);
  for (const check of evidence.checks) {
    expect(check.status).toBe('needs-review');
    expect(check.observations.length).toBeGreaterThan(0);
    expect(check.reviewRequired).toBe(true);
  }
  const tabOrder = evidence.checks.find(check => check.id === 'positive-tabindex');
  expect(tabOrder.observations.map(node => node.measurements.tabIndex)).toEqual([3,2]);
  expect(JSON.stringify(evidence)).not.toMatch(/PRIVATE_|custom-private-name|Inspector excluded/);
});

test('spacing stress detects new clipping and restores exact original inline styles', async ({ page }) => {
  await page.setContent('<main><p style="font:16px/16px monospace;width:65px;height:20px;overflow:hidden;white-space:nowrap;margin:0">WWWWWW</p><button>Control</button></main>');
  const result = await page.evaluate(async () => {
    const p = document.querySelector('p'), before = [...document.querySelectorAll('*')].map(el => el.getAttribute('style'));
    const run = await accessLensChecks.textSpacing();
    return { run, before, after: [...document.querySelectorAll('*')].map(el => el.getAttribute('style')), lineHeight: getComputedStyle(p).lineHeight };
  });
  expect(result.run.observations.length).toBeGreaterThan(0);
  expect(result.run.status).toBe('completed-for-scope');
  expect(result.run.reviewRequired).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.lineHeight).toBe('16px');
});

test('spacing cleanup preserves live page updates and also runs when measurement is interrupted', async ({ page }) => {
  await page.setContent('<p style="line-height:18px;color:blue">Text</p>');
  const result = await page.evaluate(async () => {
    const p = document.querySelector('p');
    const changed = await accessLensChecks.textSpacing({ settle: async () => { p.style.backgroundColor = 'red'; } });
    const afterChange = { background: p.style.backgroundColor, lineHeight: p.style.lineHeight, color: p.style.color };
    const beforeInterrupted = p.getAttribute('style');
    const interrupted = await accessLensChecks.textSpacing({ settle: async () => { throw new Error(); } });
    return { changed, afterChange, interrupted, beforeInterrupted, afterInterrupted: p.getAttribute('style') };
  });
  expect(result.afterChange).toEqual({ background: 'red', lineHeight: '18px', color: 'blue' });
  expect(result.interrupted.status).toBe('interrupted');
  expect(result.afterInterrupted).toBe(result.beforeInterrupted);
});

test('clean and bounded measurements remain evidence rather than passes', async ({ page }) => {
  await page.setContent('<main><p>Plain text</p></main>');
  const result = await page.evaluate(() => {
    const clean = accessLensChecks.snapshot();
    const original = accessLensChecks.elements.bind(accessLensChecks);
    accessLensChecks.elements = () => original(2);
    return { clean, capped: accessLensChecks.snapshot() };
  });
  expect(result.clean.checks.every(check => check.status === 'no-indicators-detected' && check.reviewRequired)).toBe(true);
  expect(result.capped.status).toBe('limited');
  expect(result.capped.truncated).toBe(true);
});

test('inspector exports supplemental evidence and revalidates human reviews after a spacing test', async ({ page }) => {
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','export.js','workflow.js','features.js','content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Manual');
  await ui.locator('[data-check="1.4.12"]').selectOption('pass');
  await expect(ui.locator('.criterion-evidence[data-criterion="1.4.12"]')).toContainText('pass');
  await ui.locator('#viewSelect').selectOption('Additional checks');
  await expect(ui.locator('#additionalSummary')).toContainText('7 evidence checks');
  await ui.locator('#runTextSpacing').click();
  await expect(ui.locator('.supplemental[data-check="text-spacing"]')).toHaveCount(1);
  await expect(ui.locator('#export')).toBeEnabled();
  await page.screenshot({ path: 'test-results/additional-checks.png' });
  await ui.locator('#viewSelect').selectOption('Manual');
  await expect(ui.locator('.criterion-evidence[data-criterion="1.4.12"]')).toContainText('needs-revalidation');
  const pending = page.waitForEvent('download'); await ui.locator('#export').click();
  let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
  const report = JSON.parse(data);
  expect(report.supplementalChecks.checks).toHaveLength(7);
  expect(report.textSpacingTest.reviewRequired).toBe(true);
  expect(report.wcagCoverage.criteria.find(c => c.id === '1.4.12').status).toBe('needs-revalidation');
  expect(report.wcagCoverage.reviewComplete).toBe(false);
});
