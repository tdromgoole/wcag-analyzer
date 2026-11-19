const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('automatic fallback classifies solid image-backed text and leaves mixed backgrounds for review', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(`<style>main::before{content:" ";display:table} main::after{content:"icon";position:absolute;left:500px;top:20px} p{font:16px Arial;width:220px}input{font:700 14px Arial;transition:all .3s;width:120px;height:35px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E");color:white} .image{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E")}</style><main><input id="pass" type="submit" value="Login" style="background-color:#234e12"><input id="fail" type="submit" value="Login" style="background-color:#cccccc"><p id="mixed" style="color:white;background:linear-gradient(90deg,black,white)">Mixed background text</p><p id="text" class="image" style="background-color:#234e12;color:white">Readable text</p></main>`);
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  for (const file of ['workflow.js','features.js','contrast.js','contrast-background.js','export.js']) await page.addScriptTag({ path: path.resolve(file) });
  let captures = 0;
  await page.exposeFunction('automaticScreenshot', async () => {
    captures++;
    expect(await page.locator('#pass').evaluate(el => getComputedStyle(el).webkitTextFillColor)).toBe('rgba(0, 0, 0, 0)');
    return 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
  });
  const result = await page.evaluate(async () => {
    window.chrome = { runtime: { id: 'test', sendMessage: async message => ({ image: await accessLensContrastCapture(message, { id: 'test', frameId: 0, tab: { id: 1, windowId: 2 }, url: location.href }) }) }, tabs: {
      query: async () => [{ id: 1 }], get: async () => ({ url: location.href }), captureVisibleTab: () => automaticScreenshot()
    } };
    const before = [...document.querySelectorAll('input,p')].map(el => el.getAttribute('style'));
    const raw = await accessLensFeatures.runAxe(document);
    const report = accessLensExport({ results: raw, inventory: {}, scannedAt: raw.timestamp });
    return { before, after: [...document.querySelectorAll('input,p')].map(el => el.getAttribute('style')), targets: Object.fromEntries(['violations','incomplete','passes'].map(bucket => [bucket, raw[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => node.target[0]))])), report };
  });
  expect(captures).toBe(1);
  expect(result.after).toEqual(result.before);
  expect(result.targets.passes).toEqual(expect.arrayContaining(['#pass','#text']));
  expect(result.targets.violations).toContain('#fail');
  expect(result.targets.incomplete).toContain('#mixed');
  const evidence = result.report.results.passes.find(rule => rule.id === 'color-contrast').nodes[0].any.find(check => check.id === 'color-contrast');
  expect(evidence.automaticBackground.method).toBe('rendered-background-with-text-temporarily-hidden');
  expect(evidence.measurements.expectedContrastRatio).toBe(4.5);
  expect(evidence.contrastDebug.foregroundSource).toBe('computed-css');
  expect(evidence.contrastDebug.belowThresholdPixels).toBe(0);
  const bad = result.report.results.violations.find(rule => rule.id === 'color-contrast').nodes.find(node => node.any.some(check => check.contrastDebug)).any.find(check => check.contrastDebug).contrastDebug;
  expect(bad.belowThresholdPixels).toBe(bad.sampledPixels);
  expect(bad.edgeBandBelowThresholdPixels + bad.interiorBelowThresholdPixels).toBe(bad.belowThresholdPixels);
  const mixed = result.report.results.incomplete.find(rule => rule.id === 'color-contrast').nodes.flatMap(node => node.any).find(check => check.contrastDebug)?.contrastDebug;
  expect(mixed).toBeTruthy(); expect(mixed.belowThresholdPixels).toBeGreaterThan(0); expect(mixed.belowThresholdPixels).toBeLessThan(mixed.sampledPixels);
  expect(mixed.worstSamples.length).toBeLessThanOrEqual(8);
  expect(JSON.stringify(result.report)).not.toContain('base64');
});

test('capture denial preserves original review and restores page styles', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<p id="test" style="color:white;background:linear-gradient(black,black)">Review text</p>');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  for (const file of ['workflow.js','features.js','contrast.js']) await page.addScriptTag({ path: path.resolve(file) });
  const result = await page.evaluate(async () => {
    const el = document.querySelector('p'), before = el.getAttribute('style');
    window.chrome = { runtime: { id: 'test', sendMessage: async () => { el.style.marginLeft = '3px'; throw new Error('Denied'); } } };
    const raw = await accessLensFeatures.runAxe(document);
    return { before, fill: el.style.webkitTextFillColor, margin: el.style.marginLeft, review: raw.incomplete.some(rule => rule.id === 'color-contrast') };
  });
  expect(result.fill).toBe(''); expect(result.margin).toBe('3px'); expect(result.review).toBe(true);
});

test('wrapped headlines over pseudo-element overlays are measured automatically across every line', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(`<style>
    .card{position:relative;width:240px;padding:20px;background:linear-gradient(90deg,#f00,#fff);margin:12px}
    h4{position:relative;isolation:isolate;margin:0;color:white;font:700 18px/1.4 Arial}
    h4::before{content:"";position:absolute;inset:-2px;background:rgba(0,0,0,.96);z-index:-1;pointer-events:none}
    #readable{text-shadow:1px 1px black}
    #poor::before,#shadow::before{background:white}
    #shadow{text-shadow:1px 1px 2px black}
    </style><section class="card"><h4 id="readable">A long news headline wrapping across several lines of text</h4></section><section class="card"><h4 id="poor">Another long headline wrapping across several lines of text</h4></section><section class="card"><h4 id="shadow">Shadow-supported headline that must not be falsely failed</h4></section>`);
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  for (const file of ['workflow.js','features.js','contrast.js','contrast-background.js','export.js']) await page.addScriptTag({ path: path.resolve(file) });
  await page.exposeFunction('headlineScreenshot', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  const result = await page.evaluate(async () => {
    const baseline = await axe.run(document, { runOnly: ['color-contrast'] });
    const before = [...document.querySelectorAll('h4')].map(el => el.getAttribute('style'));
    window.chrome = { runtime: { id: 'test', sendMessage: async message => ({ image: await accessLensContrastCapture(message, { id: 'test', frameId: 0, tab: { id: 1, windowId: 2 }, url: location.href }) }) }, tabs: { query: async () => [{ id: 1 }], get: async () => ({ url: location.href }), captureVisibleTab: () => headlineScreenshot() } };
    const raw = await accessLensFeatures.runAxe(document);
    return { baseline: baseline.incomplete.flatMap(rule => rule.nodes.flatMap(node => node.any.map(check => ({ target: node.target[0], reason: check.data?.messageKey })))),
      before, after: [...document.querySelectorAll('h4')].map(el => el.getAttribute('style')),
      targets: Object.fromEntries(['violations','incomplete','passes'].map(bucket => [bucket, raw[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => node.target[0]))])),
      measured: raw.passes.find(rule => rule.id === 'color-contrast')?.nodes.find(node => node.target[0] === '#readable')?.any[0].data.automaticBackground };
  });
  expect(result.baseline).toContainEqual({ target: '#readable', reason: 'pseudoContent' });
  expect(result.targets.passes).toContain('#readable');
  expect(result.targets.violations).toContain('#poor');
  expect(result.targets.incomplete).toContain('#shadow');
  expect(result.measured.textRegions).toBeGreaterThan(1);
  expect(result.measured.minimumContrastRatio).toBeGreaterThan(4.5);
  expect(result.after).toEqual(result.before);
});

for (const moving of ['once','always']) test('automatic contrast retries a page that moves ' + moving, async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<section><p id="moving" style="color:white;background:linear-gradient(black,black);font:16px Arial">Stable high contrast text</p></section>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path:file });
  let captures = 0;
  await page.exposeFunction('movingScreenshot', async () => {
    captures++;
    if (moving === 'always' || captures === 1) await page.evaluate(count => { document.querySelector('section').style.paddingTop = count * 10 + 'px'; }, captures);
    return 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
  });
  const result = await page.evaluate(async () => {
    window.chrome = { runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>movingScreenshot()} };
    const raw = await accessLensFeatures.runAxe(document);
    return { passed:raw.passes.some(rule=>rule.id==='color-contrast' && rule.nodes.some(node=>node.target[0]==='#moving')),
      reason:raw.incomplete.find(rule=>rule.id==='color-contrast')?.nodes[0].secondPass.reason,
      fill:document.querySelector('p').style.webkitTextFillColor, analysis:raw.accessLensContrastAnalysis };
  });
  expect(captures).toBe(2);
  expect(result.passed).toBe(moving === 'once');
  if (moving === 'always') expect(result.reason).toBe('text-layout-changed');
  expect(result.fill).toBe('');
  expect(result.analysis.retried).toBe(true);
});
