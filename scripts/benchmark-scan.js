// Local synthetic benchmark. Never navigates to an application or reads scans/.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { performance } = require('node:perf_hooks');

(async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html lang="en"><head><title>Synthetic benchmark</title></head><body><main></main></body></html>');
  });
  let browser, scratch;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','inspection.js','checks.js','export.js','contrast.js','save-settings.js','recovery.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
    await fs.mkdir(path.resolve('test-results'), { recursive: true });
    scratch = await fs.mkdtemp(path.resolve('test-results/scan-benchmark-'));
    const samples = [];
    for (const [size, groups] of [['small', 20], ['medium', 150], ['large', 600]]) {
      for (let repetition = 1; repetition <= 2; repetition++) {
        const measured = await page.evaluate(async ({ groups }) => {
          document.querySelector('main').innerHTML = '<h1>Synthetic benchmark</h1>' + Array.from({ length: groups }, (_, index) => `<section><h2>Section ${index + 1}</h2><p style="color:${index % 5 ? '#222' : '#aaa'};background:white">Synthetic test paragraph</p><button type="button">Action</button></section>`).join('');
          const started = performance.now();
          const results = await accessLensFeatures.runAxe(document);
          const engineMs = performance.now() - started;
          const inventoryStart = performance.now();
          const inventory = accessLensInventory();
          const inventoryMs = performance.now() - inventoryStart;
          const exportStart = performance.now();
          const report = accessLensExport({ results, inventory, scannedAt: results.timestamp });
          const exportMs = performance.now() - exportStart;
          const serializeStart = performance.now();
          const text = JSON.stringify(report, null, 2);
          const serializeMs = performance.now() - serializeStart;
          const filename = await accessLensFilename(location.href);
          const preserveStart = performance.now();
          const preserved = await accessLensSettings.saveRecoverable(report, true, filename);
          if (preserved.error) throw new Error('Synthetic preservation failed.');
          const preserveMs = performance.now() - preserveStart;
          return { elements: document.querySelectorAll('*').length, selectedRules: accessLensFeatures.scanOptions().runOnly.values.length,
            engineMs, inventoryMs, exportMs, serializeMs, preserveMs, totalMs: performance.now() - started,
            engine: axe.version, text };
        }, { groups });
        const target = path.join(scratch, `${size}-${repetition}.json`);
        const writeStart = performance.now();
        await fs.writeFile(target, measured.text, 'utf8');
        const diskWriteMs = performance.now() - writeStart;
        const bytes = Buffer.byteLength(measured.text, 'utf8');
        await fs.unlink(target);
        const { text, ...timings } = measured;
        samples.push({ size, groups, repetition, ...timings, bytes, diskWriteMs });
      }
    }
    console.log(JSON.stringify({ benchmark: 'synthetic-scan-v1', browser: await browser.version(), viewport: { width: 1280, height: 800 }, samples,
      limitations: ['Two samples per size, not a production percentile or browser-extension permission benchmark.', 'Engine stage includes configured axe rules and available second-pass processing. No screenshot/background image capture or active keyboard traversal is exercised.', 'Disk write is Node filesystem write latency, not a File System Access API durability measurement.', 'Supplementary snapshot generation is included in export time. Local preservation includes normalization, hashing, and IndexedDB.', 'No optimization or evidence deletion is performed.'] }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    // Only this newly created empty scratch directory is removed.
    if (scratch) await fs.rmdir(scratch).catch(() => {});
  }
})().catch(() => { console.error('Synthetic benchmark failed. No application data was read.'); process.exitCode = 1; });
