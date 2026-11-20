const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function inspector(page, address) {
  await page.goto(address);
  await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.innerHTML = '<a href="/nested/problem?SECRET_TOKEN#private">SECRET_LINK_TEXT</a><a href="https://outside.example/">External</a><a href="/">Home</a>';
    document.querySelector('main').append(nav);
  });
  await page.addScriptTag({ path: path.resolve('save-settings.js') });
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => {
      if (message.type === 'access-lens-sitemap') return accessLensSettings.sitemap(message.site, message.update, message.clear);
      if (message.type === 'access-lens-history') return { enabled: false };
      return message.automatic ? { skipped: true } : { download: true };
    } } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Sitemap');
  await expect(ui.locator('.sitemap')).toBeVisible();
  return ui;
}

test('sitemap requires WCAG review before green, persists across pages, and clears', async ({ page }) => {
  let ui = await inspector(page, 'http://127.0.0.1:4178');
  await expect(ui.locator('.sitemap > li[data-status=issues]')).toHaveCount(1);
  await expect(ui.locator('.sitemap a[href$="/nested/problem"]')).toBeVisible();
  await expect(ui.locator('.sitemap li[data-status=unknown]')).toHaveCount(2);
  await expect(ui.locator('.sitemap')).not.toContainText('SECRET');
  await expect(ui.locator('.sitemap a[href*="outside.example"]')).toHaveCount(0);
  await page.locator('img').evaluate(el => { el.alt = 'Example'; });
  await page.locator('main > button').evaluate(el => { el.textContent = 'Save'; });
  await ui.locator('#scan').click(); await expect(ui.locator('#scan')).toBeEnabled();
  await expect(ui.locator('.sitemap > li[data-status=review]')).toHaveCount(1);
  await expect(ui.locator('.sitemap')).toContainText('WCAG review incomplete');
  // Simulate a fully reviewed state to exercise persistence and historical dates.
  await page.evaluate(async () => {
    const context = await accessLensWorkflow.sitemap();
    const map = await accessLensSettings.sitemap(context.site);
    const [state, data] = Object.entries(map.nodes[context.current].states)[0];
    await accessLensSettings.sitemap(context.site, { nodes: context.nodes, page: context.current, state, ...data, wcagPending: 0 });
  });
  await ui.getByText('Refresh sitemap', { exact: true }).click();
  await expect(ui.locator('.sitemap > li[data-status=clean]')).toHaveCount(1);
  await expect(ui.locator('.sitemap-status.clean')).toHaveText('✓');
  const mapDownload = page.waitForEvent('download');
  await ui.getByText('Export sitemap JSON', { exact: true }).click();
  let mapText = ''; for await (const chunk of await (await mapDownload).createReadStream()) mapText += chunk;
  const map = JSON.parse(mapText);
  expect(map.nodes.some(node => node.path === '/nested/problem')).toBe(true);
  expect(map.nodes.every(node => Number.isFinite(Date.parse(node.dateAdded)))).toBe(true);
  expect(mapText).not.toContain('SECRET');
  const cleanPage = map.nodes.find(node => node.complianceAt);
  expect(Number.isFinite(Date.parse(cleanPage.complianceAt))).toBe(true);
  await page.locator('img').evaluate(el => el.removeAttribute('alt'));
  await ui.locator('#scan').click(); await expect(ui.locator('#scan')).toBeEnabled();
  const saved = await page.evaluate(async () => accessLensSettings.sitemap((await accessLensWorkflow.sitemap()).site));
  expect(saved.nodes[cleanPage.id].complianceAt).toBe(cleanPage.complianceAt);
  expect(saved.nodes[cleanPage.id].dateAdded).toBe(cleanPage.dateAdded);
  ui = await inspector(page, 'http://127.0.0.1:4178/nested/problem');
  await expect(ui.locator('.sitemap > li[data-status=issues]')).toHaveCount(1);
  await expect(ui.locator('.sitemap li[data-status=issues]')).toHaveCount(2);
  await expect(ui.locator('#coverageSummary')).toContainText('scanned');
  await ui.locator('#viewSelect').selectOption('Site report');
  await expect(ui.locator('.results')).toContainText('button-name');
  const pending = page.waitForEvent('download');
  await ui.getByText('Export site report JSON', { exact: true }).click();
  const download = await pending;
  let exported = ''; for await (const chunk of await download.createReadStream()) exported += chunk;
  expect(JSON.parse(exported).coverage.scanned).toBe(2);
  expect(exported).not.toContain('SECRET');
  await ui.locator('#viewSelect').selectOption('Sitemap');
  const stored = await page.evaluate(async () => {
    const context = await accessLensWorkflow.sitemap();
    return JSON.stringify(await accessLensSettings.sitemap(context.site));
  });
  expect(stored).not.toMatch(/SECRET|127\.0\.0\.1|External/);
  expect(Object.values(JSON.parse(stored).nodes).some(node => node.path === '/nested/problem')).toBe(true);
  await ui.getByText('Clear sitemap', { exact: true }).click();
  await expect(ui.locator('.sitemap li[data-status=issues],.sitemap li[data-status=clean]')).toHaveCount(0);
});

test('sitemap keeps unresolved states red and separates review from clean status', async ({ page }) => {
  const ui = await inspector(page, 'http://127.0.0.1:4178');
  await page.evaluate(async () => {
    const context = await accessLensWorkflow.sitemap();
    const base = { nodes: context.nodes, page: context.current, violations: 0, review: 0, manualFailures: 0 };
    await accessLensSettings.sitemap(context.site, { ...base, state: 'a'.repeat(64) });
  });
  await ui.getByText('Refresh sitemap', { exact: true }).click();
  await expect(ui.locator('.sitemap > li[data-status=issues]')).toHaveCount(1);
  await page.evaluate(async () => {
    const context = await accessLensWorkflow.sitemap();
    await accessLensSettings.sitemap(context.site, undefined, true);
    await accessLensSettings.sitemap(context.site, { nodes: context.nodes, page: context.current, state: 'b'.repeat(64), violations: 0, review: 1, manualFailures: 0 });
  });
  await ui.getByText('Refresh sitemap', { exact: true }).click();
  await expect(ui.locator('.sitemap > li[data-status=review]')).toHaveCount(1);
  await expect(ui.locator('.sitemap-status.review')).toHaveText('!');
});

test('older completions and failed attempts cannot erase newer sitemap evidence or historical dates', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const file of ['save-settings.js', 'features.js']) await page.addScriptTag({ path: path.resolve(file) });
  const result = await page.evaluate(async () => {
    const site = 'a'.repeat(64), page = 'b'.repeat(64), state = 'c'.repeat(64);
    const nodes = [{ id: page, parent: null, path: '/review', linked: true }];
    const cleanAt = new Date(Date.now() - 60000).toISOString();
    const latestAt = new Date(Date.now() - 1000).toISOString();
    const base = { nodes, page, state, violations: 0, review: 0, manualFailures: 0, manualStale: 0, wcagPending: 0, limited: false, status: 'saved' };
    const clean = await accessLensSettings.sitemap(site, { ...base, scannedAt: cleanAt });
    const broken = await accessLensSettings.sitemap(site, { ...base, scannedAt: latestAt, violations: 1 });
    const old = await accessLensSettings.sitemap(site, { ...base, scannedAt: cleanAt });
    const failed = await accessLensSettings.sitemap(site, { nodes, page, state, status: 'failed' });
    const exported = accessLensFeatures.sitemapExport(failed);
    return { clean: clean.nodes[page], broken: broken.nodes[page], old: old.nodes[page], failed: failed.nodes[page], exported, state, cleanAt, latestAt };
  });
  expect(result.clean.complianceAt).toBe(result.cleanAt);
  for (const record of [result.broken, result.old, result.failed]) {
    expect(record.states[result.state].violations).toBe(1);
    expect(record.states[result.state].scannedAt).toBe(result.latestAt);
    expect(record.complianceAt).toBe(result.cleanAt);
    expect(record.dateAdded).toBe(result.clean.dateAdded);
  }
  expect(result.failed.attempts[result.state].status).toBe('failed');
  expect(result.exported.coverage.failed).toBe(1);
});

