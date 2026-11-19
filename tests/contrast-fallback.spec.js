const { test, expect } = require('@playwright/test');
const path = require('node:path');

async function scripts(page, files) { for (const file of files) await page.addScriptTag({ path: path.resolve(file) }); }

test('WCAG calculation uses linear sRGB, large text thresholds, and rejects ambiguous CSS', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await scripts(page, ['contrast.js']);
  const result = await page.evaluate(() => {
    const el = document.createElement('button'); document.body.append(el);
    el.style.cssText = 'color:rgb(255,255,255);font:700 14px Arial';
    const normal = accessLensContrast.foreground(el);
    const below = accessLensContrast.sample(normal, '#777777');
    el.style.fontSize = '24px'; const large = accessLensContrast.foreground(el);
    el.style.font = '700 18.6667px Arial'; const bold = accessLensContrast.foreground(el);
    el.style.fontSize = '18.5px'; const belowBold = accessLensContrast.foreground(el);
    const errors = [];
    for (const css of ['opacity:.5', 'filter:blur(1px)', 'transform:scale(2)', 'color:rgba(255,255,255,.5)', 'text-shadow:1px 1px black']) {
      el.style.cssText = 'color:white;font:14px Arial;' + css;
      try { accessLensContrast.foreground(el); } catch { errors.push(css); }
    }
    const input = document.createElement('input'); input.placeholder = 'Placeholder'; document.body.append(input);
    try { accessLensContrast.foreground(input); } catch { errors.push('empty input'); }
    return { blackWhite: accessLensContrast.ratio('#000000','#ffffff'), normal, large, bold, belowBold, below, errors };
  });
  expect(result.blackWhite).toBe(21);
  expect(result.normal.expectedContrastRatio).toBe(4.5);
  expect(result.large.expectedContrastRatio).toBe(3);
  expect(result.bold.expectedContrastRatio).toBe(3);
  expect(result.belowBold.expectedContrastRatio).toBe(4.5);
  expect(result.below.contrastRatio).toBeLessThan(4.5);
  expect(result.below.reviewRequired).toBe(true);
  expect(result.errors).toHaveLength(6);
});

test('login fallback crops real rendered pixels at high DPI, records evidence, and leaves axe review intact', async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4178');
    await page.setContent('<main style="margin-left:420px;transform:translateZ(0)"><h1>Login</h1><input id="login" type="submit" value="Login" aria-label="Login" style="color:white;background-color:#568827;background-image:url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22%3E%3C/svg%3E);width:110px;height:35px;font:700 14px Arial"></main>');
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    await scripts(page, ['inspection.js','workflow.js','features.js','export.js','contrast.js','contrast-background.js','content.js']);
    const ui = page.locator('#access-lens-extension');
    await expect(ui.locator('#export')).toBeEnabled();
    await expect(ui.locator('#buildVersion')).toHaveText('v1.12.0');
    let captures = 0;
    await page.exposeFunction('takeScreenshot', async () => {
      captures++;
      expect(await ui.evaluate(el => getComputedStyle(el).display)).toBe('none');
      return 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
    });
    await page.evaluate(() => {
      window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => message.type === 'access-lens-contrast-capture'
        ? { image: await accessLensContrastCapture(message, { id: 'test-extension', frameId: 0, tab: { id: 1, windowId: 3 }, url: location.href }) }
        : { skipped: true } }, tabs: {
          query: async () => [{ id: 1 }], get: async () => ({ url: location.href }), captureVisibleTab: () => takeScreenshot()
        } };
    });
    await ui.locator('#viewSelect').selectOption('Contrast');
    await ui.locator('.sample-contrast').click();
    const canvas = ui.locator('.contrast-sample-image');
    await expect(canvas).toBeVisible();
    expect(await canvas.getAttribute('width')).toBe('220');
    expect(Number(await canvas.getAttribute('height'))).toBeGreaterThanOrEqual(70);
    expect(Number(await canvas.getAttribute('height'))).toBeLessThanOrEqual(71);
    expect(captures).toBe(1);
    // Select a solid background pixel away from the centered login label.
    await canvas.click({ position: { x: 12, y: 12 } });
    await expect(ui.locator('[aria-label="Sampled background color"]')).toHaveValue('#568827');
    await expect(ui.locator('.contrast-sampler [role="status"]')).toContainText('Manual review still required.');
    await expect(ui.locator('#contrastSummary')).toContainText('0 text contrast failure(s); 1 need manual review');
    await page.evaluate(() => { delete window.chrome; });
    const pending = page.waitForEvent('download'); await ui.locator('#export').click();
    let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
    const report = JSON.parse(data);
    const sample = report.results.incomplete.find(rule => rule.id === 'color-contrast').nodes[0].any.find(check => check.id === 'color-contrast').renderedSample;
    expect(sample).toMatchObject({ fgColor: '#ffffff', bgColor: '#568827', expectedContrastRatio: 4.5, reviewRequired: true, method: 'css-foreground-and-user-selected-screenshot-pixel' });
    expect(sample.contrastRatio).toBeGreaterThan(3);
    expect(data).not.toContain('data:image');
    expect(data).not.toContain('base64');
    expect(report.wcagCoverage.criteria.find(criterion => criterion.id === '1.4.3').status).toBe('needs-review');
    await ui.getByRole('button', { name: 'Clear sample', exact: true }).click();
    await expect(ui.locator('.contrast-sample-image')).toHaveCount(0);
  } finally { await context.close(); }
});

test('capture rejects other tabs, frames, navigation and invalid bounds before returning pixels', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await scripts(page, ['contrast-background.js']);
  const result = await page.evaluate(async () => {
    let captures = 0;
    const sender = { id: 'extension', frameId: 0, tab: { id: 1, windowId: 2 }, url: location.href };
    const message = { rect: { x: 0, y: 0, width: 100, height: 30 }, viewport: { width: 1280, height: 720 } };
    window.chrome = { runtime: { id: 'extension' }, tabs: { query: async () => [{ id: 9 }], get: async () => ({ url: location.href }), captureVisibleTab: async () => { captures++; } } };
    const errors = [];
    for (const args of [[message,sender], [message,{...sender,frameId:1}], [{...message,rect:{...message.rect,width:Infinity}},sender]]) {
      try { await accessLensContrastCapture(...args); } catch (error) { errors.push(error.message); }
    }
    chrome.tabs.query = async () => [{ id: 1 }]; chrome.tabs.get = async () => ({ url: 'https://other.example/' });
    try { await accessLensContrastCapture(message, sender); } catch (error) { errors.push(error.message); }
    chrome.tabs.get = (() => { let reads = 0; return async () => ({ url: ++reads === 1 ? location.href : 'https://changed.example/' }); })();
    try { await accessLensContrastCapture(message, sender); } catch (error) { errors.push(error.message); }
    return { captures, errors };
  });
  expect(result.captures).toBe(1);
  expect(result.errors).toHaveLength(5);
});

test('capture failures restore the inspector and controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<main style="margin-left:420px"><p style="color:#aaa;background:linear-gradient(white,#eee)">Review contrast</p></main>');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  await scripts(page, ['inspection.js','workflow.js','features.js','export.js','contrast.js','content.js']);
  const ui = page.locator('#access-lens-extension'); await expect(ui.locator('#export')).toBeEnabled();
  await page.evaluate(() => { window.chrome = { runtime: { id: 'extension', sendMessage: async () => { throw new Error('Capture denied'); } } }; });
  await ui.locator('#viewSelect').selectOption('Contrast');
  await ui.locator('.sample-contrast').click();
  await expect(ui.locator('.contrast-sampler')).toContainText('Capture denied');
  await expect(ui.locator('#scan')).toBeEnabled(); await expect(ui.locator('#export')).toBeEnabled();
  expect(await ui.evaluate(el => getComputedStyle(el).display)).not.toBe('none');
  await page.evaluate(() => { chrome.runtime.sendMessage = async () => { document.querySelector('main p').style.marginTop = '100px'; return { image: {} }; }; });
  await ui.locator('.sample-contrast').click();
  await expect(ui.locator('.contrast-sampler')).toContainText('The page moved or changed during capture');
  await expect(ui.locator('#scan')).toBeEnabled();
  expect(await ui.evaluate(el => getComputedStyle(el).display)).not.toBe('none');
});

test('position-only transforms are allowed while real color and geometry blockers are identified', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await scripts(page, ['contrast.js']);
  const result = await page.evaluate(() => {
    const parent = document.createElement('div'), button = document.createElement('button');
    parent.append(button); document.body.append(parent); button.style.cssText = 'color:white;font:700 14px Arial';
    const allowed = [];
    for (const transform of ['translate(10px, 20px)', 'translateZ(0)', 'translate3d(10px, 20px, 0)']) {
      parent.style.transform = transform; allowed.push(accessLensContrast.foreground(button).expectedContrastRatio);
    }
    const errors = [];
    for (const css of ['opacity:.8', 'filter:brightness(.8)', 'transform:scale(1.2)', 'rotate:20deg']) {
      parent.style.cssText = css;
      try { accessLensContrast.foreground(button); } catch (error) { errors.push(error.message); }
    }
    return { allowed, errors };
  });
  expect(result.allowed).toEqual([4.5,4.5,4.5]);
  expect(result.errors[0]).toContain('opacity 0.8 on an ancestor (div)');
  expect(result.errors[1]).toContain('CSS filter on an ancestor (div)');
  expect(result.errors[2]).toContain('scaling, rotation, or perspective');
  expect(result.errors[3]).toContain('CSS scale, rotate, or perspective');
});
