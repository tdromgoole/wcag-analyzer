const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('fractional sample bounds never include adjacent or partially covered pixels', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await page.addScriptTag({path:path.resolve('contrast.js')});
  const values = await page.evaluate(() => [1,1.25,2].map(scale => {
    const rect = {x:10.25,y:20.25,width:65.203125,height:17};
    const bounds = accessLensContrast.pixelBounds(rect,scale,scale);
    return {rect,bounds,scale};
  }));
  for (const {rect,bounds,scale} of values) {
    expect(bounds.x / scale).toBeGreaterThanOrEqual(rect.x);
    expect(bounds.y / scale).toBeGreaterThanOrEqual(rect.y);
    expect((bounds.x + bounds.width) / scale).toBeLessThanOrEqual(rect.x+rect.width);
    expect((bounds.y + bounds.height) / scale).toBeLessThanOrEqual(rect.y+rect.height);
  }
});

test('adjacent orange pixels outside fractional Security text no longer contaminate its measurement', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<style>p{display:inline-block;position:relative;isolation:isolate;color:#d93240;background:white;font:700 14px Arial;margin:0}p::before{content:"";position:absolute;inset:0;background:white;z-index:-2;pointer-events:none}p::after{content:"";position:absolute;left:100%;top:0;bottom:0;width:3px;background:#ffce92;z-index:-1;pointer-events:none}</style><p id="security">SECURITY</p>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js','export.js'].map(file=>path.resolve(file))]) await page.addScriptTag({path:file});
  await page.evaluate(() => { const el=document.querySelector('#security'),range=document.createRange();range.selectNodeContents(el);const right=range.getBoundingClientRect().right;el.style.transform='translateX('+(Math.ceil(right)-right+.0625)+'px)'; });
  await page.exposeFunction('captureFraction',async()=> 'data:image/png;base64,'+(await page.screenshot()).toString('base64'));
  const result=await page.evaluate(async()=>{
    window.chrome={runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureFraction()}};
    const correctBounds=accessLensContrast.pixelBounds;
    accessLensContrast.pixelBounds=(rect,sx,sy)=>({x:Math.floor(rect.x*sx),y:Math.floor(rect.y*sy),width:Math.ceil((rect.x+rect.width)*sx)-Math.floor(rect.x*sx),height:Math.ceil((rect.y+rect.height)*sy)-Math.floor(rect.y*sy)});
    const old=await accessLensFeatures.runAxe(document);
    const oldUnresolved=old.incomplete.some(rule=>rule.id==='color-contrast' && rule.nodes.some(node=>node.target[0]==='#security'));
    accessLensContrast.pixelBounds=correctBounds;
    const raw=await accessLensFeatures.runAxe(document);
    return {oldUnresolved,report:accessLensExport({results:raw,inventory:{},scannedAt:raw.timestamp})};
  });
  expect(result.oldUnresolved).toBe(true);
  const measured=result.report.results.passes.find(rule=>rule.id==='color-contrast').nodes[0].any.find(check=>check.contrastDebug);
  expect(measured.measurements.contrastRatio).toBeCloseTo(4.68685484,5);
  expect(measured.contrastDebug.belowThresholdPixels).toBe(0);
  expect(measured.contrastDebug.samplingBounds).toBe('fully-contained-device-pixels');
});

test('a measured mixed-background review stays attempted after later scroll passes', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<p id="mixed" style="width:220px;font:16px Arial;color:white;background:linear-gradient(90deg,black,white)">Mixed background text</p><p id="later" style="position:absolute;top:1800px;color:white;background:linear-gradient(black,black)">Later content</p>');
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['workflow.js','features.js','contrast.js','contrast-background.js'].map(file=>path.resolve(file))]) await page.addScriptTag({path:file});
  await page.exposeFunction('captureReasons',async()=> 'data:image/png;base64,'+(await page.screenshot()).toString('base64'));
  const result=await page.evaluate(async()=>{
    window.chrome={runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureReasons()}};
    const raw=await accessLensFeatures.runAxe(document);
    return raw.incomplete.find(rule=>rule.id==='color-contrast').nodes.find(node=>node.target[0]==='#mixed');
  });
  expect(result.secondPass).toMatchObject({attempted:true,reason:'mixed-background'});
  expect(result.any.some(check=>check.data.contrastDebug)).toBe(true);
});
