const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('markers are physically absent throughout both passes and restored after success or failure', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<a id="security" style="color:#932400;background:white;font:16px Arial">Security</a>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const result = await page.evaluate(async () => {
    const results = raw => Object.fromEntries(['passes','violations','incomplete'].map(bucket => [bucket, raw[bucket].filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes.map(node => node.target))]));
    const baseline = results(await accessLensFeatures.runAxe(document));
    const host = document.createElement('div'); host.id = 'access-lens-extension'; host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important';
    const root = host.attachShadow({ mode:'open' }); root.innerHTML = '<div id="overlay"><button style="pointer-events:auto;position:fixed;top:0;left:0;width:150px;height:40px">Marker</button><div style="position:fixed;inset:0;border:3px solid blue">Highlight</div></div>'; document.body.append(host);
    const marker = root.querySelector('button'), highlight = marker.nextElementSibling;
    const realRun = axe.run.bind(axe); const observations = [];
    axe.run = async (...args) => { observations.push({ phase:'axe', marker:marker.isConnected, highlight:highlight.isConnected, measuring:__accessLensMeasuring }); return realRun(...args); };
    const originalSecond = accessLensFeatures.secondPass.bind(accessLensFeatures);
    accessLensFeatures.secondPass = async raw => { observations.push({ phase:'access-lens', marker:marker.isConnected, highlight:highlight.isConnected, measuring:__accessLensMeasuring }); return originalSecond(raw); };
    const marked = results(await accessLensFeatures.runAxe({ exclude: [host] }));
    const restoredAfterSuccess = marker.isConnected && highlight.isConnected;
    axe.run = async () => { throw new Error('Expected failure'); };
    try { await accessLensFeatures.runAxe({ exclude: [host] }); } catch {}
    return { baseline, marked, observations, restoredAfterSuccess, restoredAfterFailure: marker.isConnected && highlight.isConnected, measuring: Boolean(globalThis.__accessLensMeasuring) };
  });
  expect(result.marked).toEqual(result.baseline);
  expect(result.observations).toEqual([{ phase:'axe',marker:false,highlight:false,measuring:true }, { phase:'access-lens',marker:false,highlight:false,measuring:true }]);
  expect(result.restoredAfterSuccess && result.restoredAfterFailure).toBe(true);
  expect(result.measuring).toBe(false);
});

test('overlap reviews resolve readable text and real failures while covered text remains unresolved', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<style>.row{position:relative;height:55px}a{font:16px Arial;color:#932400;background:white}.over{position:absolute;inset:0;pointer-events:none}</style><div class="row"><a id="readable">Security</a><div class="over"></div></div><div class="row"><a id="poor" style="color:#ccc">Low contrast</a><div class="over"></div></div><div class="row"><a id="covered">Covered</a><div class="over" style="background:black;pointer-events:auto"></div></div>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  await page.exposeFunction('captureOverlap', async () => 'data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  const result = await page.evaluate(async () => {
    const baseline = await axe.run(document, { runOnly:['color-contrast'] });
    window.chrome = { runtime: { id:'test', sendMessage: async message => ({ image:await accessLensContrastCapture(message, { id:'test', frameId:0, tab:{id:1,windowId:2}, url:location.href }) }) }, tabs:{ query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureOverlap() } };
    const raw = await accessLensFeatures.runAxe(document);
    return { reasons:baseline.incomplete.flatMap(rule=>rule.nodes.flatMap(node=>node.any.map(check=>check.data?.messageKey))), targets:Object.fromEntries(['passes','violations','incomplete'].map(bucket=>[bucket,raw[bucket].filter(rule=>rule.id==='color-contrast').flatMap(rule=>rule.nodes.map(node=>node.target[0]))])), remaining:raw.incomplete.find(rule=>rule.id==='color-contrast')?.nodes[0].secondPass.reason };
  });
  expect(result.reasons).toEqual(['bgOverlap','bgOverlap','bgOverlap']);
  expect(result.targets.passes).toContain('#readable');
  expect(result.targets.violations).toContain('#poor');
  expect(result.targets.incomplete).toContain('#covered');
  expect(result.remaining).toBe('obscured');
});
