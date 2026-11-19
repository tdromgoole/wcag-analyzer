const { test, expect } = require('@playwright/test');
const path = require('node:path');

for (const browsing of [false,true]) test('off-screen contrast is ' + (browsing ? 'not allowed to scroll background browsing' : 'measured during an explicit full-page scan'), async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<style>.row{position:absolute;left:20px;width:300px;font:16px Arial;background:linear-gradient(white,white)} a{color:#932400}.over{position:absolute;inset:0;pointer-events:none}</style><main style="height:3200px"><section class="row" style="top:1400px"><a id="readable">Security</a><div class="over"></div></section><section class="row" style="top:2400px"><a id="poor" style="color:#ccc">Low contrast</a><div class="over"></div></section></main>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path:file });
  let captures = 0;
  await page.exposeFunction('captureSweep', async () => { captures++; return 'data:image/png;base64,' + (await page.screenshot()).toString('base64'); });
  const result = await page.evaluate(async browsing => {
    if (browsing) window.__accessLensAutoScan = {};
    window.chrome = { runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureSweep()} };
    const before = scrollY, raw = await accessLensFeatures.runAxe(document);
    return { before, after:scrollY, analysis:raw.accessLensContrastAnalysis, targets:Object.fromEntries(['passes','violations','incomplete'].map(bucket=>[bucket,raw[bucket].filter(rule=>rule.id==='color-contrast').flatMap(rule=>rule.nodes.map(node=>node.target[0]))])) };
  }, browsing);
  expect(result.after).toBe(result.before);
  if (browsing) { expect(captures).toBe(0); expect(result.targets.incomplete).toContain('#readable'); expect(result.analysis.pageSweep).toBe('not-run-in-browsing-mode'); }
  else { expect(captures).toBe(2); expect(result.targets.passes).toContain('#readable'); expect(result.targets.violations).toContain('#poor'); expect(result.analysis.viewports).toBe(3); expect(result.analysis.resolved).toBe(2); }
});
