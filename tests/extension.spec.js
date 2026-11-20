const {test, expect} = require('@playwright/test');
const path = require('node:path');
test('scan, locate findings, export JSON, rescan and close', async ({page}) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.title = 'PRIVATE_TITLE';
    history.replaceState(null, '', '/?token=PRIVATE_URL');
    const p = document.querySelector('p');
    p.id = 'PRIVATE_ID'; p.className = 'PRIVATE_CLASS';
    p.textContent = 'PRIVATE_TEXT';
    p.setAttribute('aria-label', 'PRIVATE_LABEL');
    p.setAttribute('aria-description', 'PRIVATE_DESCRIPTION');
    p.setAttribute('aria-hidden', 'false');
    p.setAttribute('data-secret', 'PRIVATE_ATTRIBUTE');
    const input = document.createElement('input');
    input.setAttribute('value', 'PRIVATE_VALUE');
    p.append(input);
  });
  await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
  await page.addScriptTag({path: path.resolve('inspection.js')});
  await page.addScriptTag({path: path.resolve('export.js')});
  await page.addScriptTag({path: path.resolve('workflow.js')});
  await page.addScriptTag({path: path.resolve('features.js')});
  await page.addScriptTag({path: path.resolve('content.js')});
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled({timeout:30000});
  await expect(ui.locator('.stats')).toContainText('Issues');
  await expect(ui.locator('.results')).toContainText('alternative text');
  const marker = ui.locator('.marker').first();
  const markerNumber = await marker.textContent();
  await marker.click();
  await expect(ui.locator('.node.selected')).toBeVisible();
  await expect(ui.locator('.node.selected .issue-number')).toHaveText(`#${markerNumber}`);
  await expect(ui.locator('.node.selected')).toBeFocused();
  await expect(ui.locator('.highlight')).toHaveCount(1);
  await ui.locator('summary').filter({hasText:'alternative text'}).evaluate(el => el.parentElement.open = true);
  await ui.locator('.node').filter({hasText:'<img'}).first().click();
  await expect(ui.locator('.highlight')).toHaveCount(1);
  const downloadEvent = page.waitForEvent('download');
  await ui.locator('#export').click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let data=''; for await (const chunk of stream) data+=chunk;
  const report=JSON.parse(data);
  expect(report.results.violations.some(r=>r.id==='image-alt')).toBe(true);
  expect(report.schemaVersion).toBe('2.1');
  expect(data).not.toContain('PRIVATE_');
  expect(report.pagePath).toBe('http://127.0.0.1:4178/');
  expect(Object.keys(report).slice(0, 2)).toEqual(['schemaVersion', 'pagePath']);
  expect(download.suggestedFilename()).not.toContain('127.0.0.1');
  expect(report.page).toBeUndefined();
  expect(report.privacy.mode).toBe('content-free');
  function verifyFields(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      expect(['html', 'text', 'attributes', 'failureSummary', 'message', 'relatedNodes', 'url', 'title', 'value']).not.toContain(key);
      verifyFields(child);
    }
  }
  verifyFields(report);
  const ariaNodes = report.inventory.aria.flatMap(group => group.nodes);
  expect(ariaNodes.some(node => node.states?.['aria-hidden'] === 'false')).toBe(true);
  expect(report.results.violations.flatMap(rule => rule.nodes).some(node => node.target.length)).toBe(true);
  expect(report.inventory.structure.some(r=>r.id==='h1')).toBe(true);
  await ui.locator('[data-kind=structure]').click();
  await ui.locator('#findingFilter').selectOption('all');
  await expect(ui.locator('.icon')).toHaveCount(2);
  await ui.locator('.icon').first().click();
  await expect(ui.locator('.element-detail')).toContainText('Test page');
  await ui.locator('#viewSelect').selectOption('Order');
  await expect(ui.locator('.inspection-note')).toContainText('keyboard order');
  await ui.locator('[data-kind=violations]').click();
  expect(report.scope.limitations.length).toBeGreaterThan(0);
  await page.locator('img').evaluate(el=>el.alt='Descriptive test image');
  await ui.locator('#scan').click();
  await expect(ui.locator('#export')).toBeEnabled({timeout:30000});
  await expect(ui.locator('.results')).not.toContainText('alternative text');
  const altDownload = page.waitForEvent('download'); await ui.locator('#export').click();
  let altJson = ''; for await (const chunk of await (await altDownload).createReadStream()) altJson += chunk;
  expect(JSON.parse(altJson).inventory.features.flatMap(group => group.nodes).some(node => node.alternativeText === 'Descriptive test image')).toBe(false);

  await ui.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(ui.locator('aside')).toBeHidden();
  await ui.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(ui.locator('aside')).toBeVisible();
  await ui.getByRole('button', { name: 'Close analyzer', exact: true }).click();
  await expect(ui).toHaveCount(0);
  await page.addScriptTag({path:path.resolve('content.js')});
  await expect(ui.locator('#export')).toBeEnabled({timeout:30000});
  await page.addScriptTag({path:path.resolve('content.js')});
  await expect(ui).toHaveCount(0);
});

test('compact panel reserves most height for findings and keeps details accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 786 });
  await page.goto('http://127.0.0.1:4178');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'export.js', 'workflow.js', 'features.js', 'content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  await page.evaluate(() => {
    const root = document.querySelector('#access-lens-extension').shadowRoot;
    root.querySelector('#saveStatus').textContent = 'JSON auto saved to your selected folder.';
    const detail = document.createElement('p'); detail.textContent = 'Last successful save: access-lens-' + 'a'.repeat(64) + '.json';
    root.querySelector('#scanDetails').append(detail);
  });
  await expect(ui.locator('#scanDetails > summary')).toContainText('Saved');
  expect(await ui.locator('#scanDetails').evaluate(el => el.open)).toBe(false);
  expect((await ui.locator('.results').boundingBox()).height).toBeGreaterThan(786 * 0.6);
  await ui.locator('#viewSelect').selectOption('Site report');
  await expect(ui.getByText('Export site report JSON', { exact: true })).toBeVisible();
  await ui.locator('#scanDetails > summary').click();
  await expect(ui.locator('#stateSlot')).toBeVisible();
  await expect(ui.locator('#pauseBrowsing')).toBeVisible();
  expect((await ui.locator('.results').boundingBox()).height).toBeGreaterThan(200);
  await ui.locator('#scanDetails > summary').click();
  await page.setViewportSize({ width: 1280, height: 600 });
  expect((await ui.locator('.results').boundingBox()).height).toBeGreaterThan(250);
});



