const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('two-pixel edge band is visible in diagnostics without silently ignoring it', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<style>p{position:relative;isolation:isolate;display:inline-block;color:white;font:16px Arial;margin:0}p::before{content:"";position:absolute;inset:0;background:black;z-index:-2;pointer-events:none}p::after{content:"";position:absolute;inset:0 auto 0 0;width:2px;background:white;z-index:-1;pointer-events:none}</style><p id="edge">A readable headline</p>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js','export.js'].map(file=>path.resolve(file))]) await page.addScriptTag({ path:file });
  await page.exposeFunction('debugScreenshot', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  const result = await page.evaluate(async () => {
    window.chrome = { runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>debugScreenshot()} };
    const raw = await accessLensFeatures.runAxe(document);
    return accessLensExport({ results:raw, inventory:{}, scannedAt:raw.timestamp });
  });
  const check = result.results.incomplete.find(rule=>rule.id==='color-contrast').nodes[0].any.find(check=>check.contrastDebug);
  expect(check.contrastDebug.belowThresholdPixels).toBeGreaterThan(0);
  expect(check.contrastDebug.interiorBelowThresholdPixels).toBe(0);
  expect(check.contrastDebug.edgeBandBelowThresholdPixels).toBe(check.contrastDebug.belowThresholdPixels);
  expect(check.contrastDebug.minimumInteriorRatio).toBe(21);
  expect(check.contrastDebug.worstSamples[0]).toMatchObject({ color:'#ffffff', ratio:1, nearRegionEdge:true });
  expect(JSON.stringify(result)).not.toContain('data:image');
});

test('one rare interior pixel is retained in contrast diagnostics among repeated dark background colors', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<p id="rare" style="display:inline-block;width:160px;font:16px/20px Arial;color:white;margin:0">A readable headline</p>');
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 20;
    const context = canvas.getContext('2d'); context.fillStyle = '#000000'; context.fillRect(0, 0, 160, 20);
    context.fillStyle = '#ffffff'; context.fillRect(37, 9, 1, 1);
    document.querySelector('#rare').style.backgroundImage = `url("${canvas.toDataURL()}")`;
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'contrast.js', 'contrast-background.js', 'export.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  await page.exposeFunction('rareScreenshot', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  const result = await page.evaluate(async () => {
    window.chrome = { runtime: { id: 'test', sendMessage: async message => ({ image: await accessLensContrastCapture(message,
      { id: 'test', frameId: 0, tab: { id: 1, windowId: 2 }, url: location.href }) }) },
      tabs: { query: async () => [{ id: 1 }], get: async () => ({ url: location.href }), captureVisibleTab: () => rareScreenshot() } };
    const results = await accessLensFeatures.runAxe(document);
    const report = accessLensExport({ results, inventory: {}, scannedAt: results.timestamp });
    return ['violations', 'incomplete', 'passes'].flatMap(bucket => report.results[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => ({ bucket,
      debug: [...node.any, ...node.all, ...node.none].find(check => check.contrastDebug)?.contrastDebug }))));
  });
  const sample = result.find(item => item.debug);
  expect(sample).toBeDefined(); expect(sample.bucket).not.toBe('passes');
  expect(sample.debug.belowThresholdPixels).toBe(1);
  expect(sample.debug.interiorBelowThresholdPixels).toBe(1);
  expect(sample.debug.edgeBandBelowThresholdPixels).toBe(0);
  expect(sample.debug.histogram.find(item => item.color === '#ffffff')).toMatchObject({ count: 1, ratio: 1 });
  expect(sample.debug.histogram.find(item => item.color === '#000000').ratio).toBe(21);
  expect(sample.debug.sampledPixels).toBeGreaterThan(1000);
});

test('debug panel explains available evidence and rejects arbitrary diagnostic content', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => { const el=document.createElement('p');el.style.cssText='color:white;background:linear-gradient(black,white)';el.textContent='Contrast debug example';document.body.append(el); });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','workflow.js','features.js','export.js','contrast.js','content.js'].map(file=>path.resolve(file))]) await page.addScriptTag({ path:file });
  const ui=page.locator('#access-lens-extension');await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Contrast');
  await ui.locator('.contrast-debug > summary').first().click();
  await expect(ui.locator('.contrast-debug').first()).toContainText('No Access Lens background pixels were measured');
  const sanitized=await page.evaluate(()=>accessLensFeatures.contrastDebug({data:{contrastDebug:{schemaVersion:1,method:'css-text-against-hidden-text-background-regions',fgColor:'PRIVATE',sampledPixels:NaN,worstSamples:[{color:'#ffffff',ratio:1,x:3,y:4,private:'PRIVATE',nearRegionEdge:true}],rawImage:'PRIVATE'}}}));
  expect(JSON.stringify(sanitized)).not.toContain('PRIVATE');
  expect(sanitized.sampledPixels).toBeUndefined();
  expect(sanitized.worstSamples[0]).toEqual({color:'#ffffff',ratio:1,x:3,y:4,nearRegionEdge:true});
});
