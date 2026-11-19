const {test,expect}=require('@playwright/test');const path=require('node:path');
test('special-case review codes can pass an independent measurement without becoming false failures',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.setContent('<p id="good" style="color:#333;background:white">Good contrast</p><p id="invisible" style="color:white;background:white">Special case</p><p id="other" style="color:#333;background:white">Other reason</p>');
 for(const file of [require.resolve('axe-core/axe.min.js'),...['workflow.js','features.js','contrast.js','contrast-background.js','export.js'].map(f=>path.resolve(f))])await page.addScriptTag({path:file});
 await page.exposeFunction('captureReviewCodes',async()=> 'data:image/png;base64,'+(await page.screenshot()).toString('base64'));
 const result=await page.evaluate(async()=>{
  window.chrome={runtime:{id:'test',sendMessage:async message=>({image:await accessLensContrastCapture(message,{id:'test',frameId:0,tab:{id:1,windowId:2},url:location.href})})},tabs:{query:async()=>[{id:1}],get:async()=>({url:location.href}),captureVisibleTab:()=>captureReviewCodes()}};
  const results={violations:[],passes:[],inapplicable:[],incomplete:[{id:'color-contrast',nodes:['good','invisible','other'].map(id=>({target:['#'+id],any:[{id:'color-contrast',data:{messageKey:id==='other'?'PRIVATE_REASON':'equalRatio'}}],all:[],none:[]}))}]};
  await accessLensFeatures.secondPass(results);return accessLensExport({results,inventory:{},scannedAt:new Date().toISOString()});
 });
 expect(result.results.passes[0].nodes).toHaveLength(2);expect(result.results.violations).toHaveLength(0);
 expect(result.results.incomplete[0].nodes[0].secondPass.reason).toBe('engine-exception');
 expect(result.results.passes[0].nodes[0].any[0].engineReviewCode).toBe('equalRatio');
 expect(result.results.passes[0].nodes[1].any[0].engineReviewCode).toBe('other');expect(JSON.stringify(result)).not.toContain('PRIVATE_REASON');
});

test('text ranges exclude surrounding whitespace while preserving internal word spacing',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.addScriptTag({path:path.resolve('contrast.js')});
 const value=await page.evaluate(()=>{const el=document.createElement('span');el.textContent='  words between spaces  ';document.body.append(el);const range=accessLensContrast.textRange(document.createRange(),el.firstChild);return {text:range.toString(),start:range.startOffset,end:range.endOffset};});
 expect(value).toEqual({text:'words between spaces',start:2,end:22});
});
