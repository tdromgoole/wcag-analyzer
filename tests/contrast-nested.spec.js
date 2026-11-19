const {test,expect}=require('@playwright/test');const path=require('node:path');
test('nested sponsor labels aggregate text runs without passing a failing child or losing direct text',async({page})=>{
 await page.goto('http://127.0.0.1:4178');
 await page.setContent('<style>li{font:16px Arial;color:#4b4b4b;background:white;list-style:none;margin:20px}a{color:#02599c}</style><ul><li id="good">By <a>Push Security</a><span> sponsorship</span> today</li><li id="bad"><a>Readable link</a><span style="color:#ccc"> failing child</span></li><li id="unknown"><a>Readable</a><span style="opacity:.5"> unsupported</span></li></ul>');
 for(const file of [require.resolve('axe-core/axe.min.js'),...['workflow.js','features.js','contrast.js','contrast-background.js','export.js'].map(f=>path.resolve(f))])await page.addScriptTag({path:file});
 await page.exposeFunction('nestedCapture',async()=> 'data:image/png;base64,'+(await page.screenshot()).toString('base64'));
 const result=await page.evaluate(async()=>{
  window.chrome={runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>nestedCapture()}};
  const nodes=['good','bad','unknown'].map(id=>({target:['#'+id],any:[{id:'color-contrast',data:{messageKey:'bgImage'}}],all:[],none:[]}));
  const results={violations:[],passes:[],inapplicable:[],incomplete:[{id:'color-contrast',nodes}]};
  const before=[...document.querySelectorAll('li,li *')].map(el=>el.getAttribute('style'));
  await accessLensFeatures.secondPass(results);
  return {results:accessLensExport({results,inventory:{},scannedAt:new Date().toISOString()}).results,summary:results.accessLensScanPasses, before,after:[...document.querySelectorAll('li,li *')].map(el=>el.getAttribute('style'))};
 });
 expect(result.results.passes[0].nodes).toHaveLength(1);
 const good=result.results.passes[0].nodes[0].any[0];expect(good.textRunSummary).toMatchObject({total:4,passed:4,failed:0,unresolved:0});
 expect(result.results.violations[0].nodes[0].any[0].textRunSummary.failed).toBe(1);
 expect(result.results.incomplete[0].nodes[0].any[0].textRunSummary.unresolved).toBe(1);
 expect(result.summary.second).toMatchObject({considered:3,passed:1,failed:1,unresolved:1});
 expect(result.after).toEqual(result.before);
});

test('nested direct text beyond its wide owner viewport is centered by text range',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.setContent('<div id="parent" style="width:2100px;white-space:nowrap;background:white;color:black;font:16px Arial"><span style="display:inline-block;width:1700px">Start</span>Tail text</div>');
 for(const file of [require.resolve('axe-core/axe.min.js'),...['workflow.js','features.js','contrast.js','contrast-background.js','export.js'].map(f=>path.resolve(f))])await page.addScriptTag({path:file});
 await page.exposeFunction('captureWideRuns',async()=> 'data:image/png;base64,'+(await page.screenshot()).toString('base64'));
 const result=await page.evaluate(async()=>{
 window.chrome={runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureWideRuns()}};
 const results={violations:[],passes:[],inapplicable:[],incomplete:[{id:'color-contrast',nodes:[{target:['#parent'],any:[{id:'color-contrast',data:{messageKey:'bgOverlap'}}],all:[],none:[]}]}]};
 await accessLensFeatures.secondPass(results);return {report:accessLensExport({results,inventory:{},scannedAt:new Date().toISOString()}),x:scrollX};
 });
 expect(result.x).toBe(0);expect(result.report.results.passes[0].nodes[0].any[0].textRunSummary).toMatchObject({total:2,passed:2,unresolved:0});
});
