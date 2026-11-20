// Local synthetic rendered-pixel benchmark. Optional first argument is a prior contrast.js copy.
const { chromium } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html lang="en"><head><title>Contrast benchmark</title></head><body><main><h1>Rendered pixel benchmark</h1><p id="sample" style="display:inline-block;width:1100px;font:64px/1.25 Arial;color:white;margin:0">Synthetic trail information across several large text lines for pixel measurement.</p></main></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 400;
      const context = canvas.getContext('2d');
      context.fillStyle = '#172b46'; context.fillRect(0, 0, 1100, 400);
      // Many repeated colors, with a pale strip retained as a genuine low-contrast region.
      context.fillStyle = '#eeeeee'; context.fillRect(400, 0, 20, 400);
      document.querySelector('#sample').style.backgroundImage = `url("${canvas.toDataURL()}")`;
    });
    for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js', 'features.js', 'contrast-background.js', 'export.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
    await page.exposeFunction('syntheticContrastScreenshot', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
    await page.evaluate(() => {
      window.chrome = { runtime: { id: 'synthetic-benchmark', sendMessage: async message => ({ image: await accessLensContrastCapture(message,
        { id: 'synthetic-benchmark', frameId: 0, tab: { id: 1, windowId: 2 }, url: location.href }) }) },
      tabs: { query: async () => [{ id: 1 }], get: async () => ({ url: location.href }), captureVisibleTab: () => syntheticContrastScreenshot() } };
    });
    const profiles = process.argv[2] ? [['baseline', path.resolve(process.argv[2])], ['current', path.resolve('contrast.js')]] : [['current', path.resolve('contrast.js')]];
    const observations = [];
    for (const [profile, file] of profiles) {
      if (!fs.existsSync(file)) throw new Error('Contrast implementation was not found.');
      await page.addScriptTag({ path: file });
      for (let repetition = 1; repetition <= 2; repetition++) {
        const observed = await page.evaluate(async () => {
          const started = performance.now(), results = await accessLensFeatures.runAxe(document);
          const durationMs = performance.now() - started;
          const report = accessLensExport({ results, inventory: {}, scannedAt: results.timestamp });
          const evidence = ['violations', 'passes', 'incomplete'].flatMap(bucket => (report.results[bucket] || []).filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => ({ bucket,
            checks: [...node.any, ...node.all, ...node.none].filter(check => check.contrastDebug).map(check => check.contrastDebug) }))));
          return { durationMs, evidence };
        });
        if (!observed.evidence.some(item => item.checks.some(check => check.sampledPixels > 0))) throw new Error('No rendered pixels were measured.');
        observations.push({ profile, repetition, ...observed });
      }
    }
    const equivalent = observations.every(item => JSON.stringify(item.evidence) === JSON.stringify(observations[0].evidence));
    if (!equivalent) throw new Error('Pixel measurement evidence differs between runs.');
    console.log(JSON.stringify({ benchmark: 'synthetic-rendered-contrast-v1', browser: await browser.version(), equivalentEvidence: equivalent, observations,
      limitations: ['Two observations per implementation, not a production percentile or hard timing threshold.', 'Real headless screenshots pass through the production crop/measurement code with mocked extension tab messaging.', 'No native extension permission prompt, secured application or NVDA is exercised. Timings include engine, capture and pixel processing.'] }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
