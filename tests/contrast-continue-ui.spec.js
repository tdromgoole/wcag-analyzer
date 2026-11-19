const {test,expect}=require('@playwright/test');const path=require('node:path');
test('Continue contrast measurements updates the panel and exported report without rerunning axe',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.setContent('<main><p id="first">First</p><p id="later">Later</p><p id="last">Last</p></main>');
 for(const file of [require.resolve('axe-core/axe.min.js'),...['inspection.js','workflow.js','features.js','export.js'].map(f=>path.resolve(f))])await page.addScriptTag({path:file});
 await page.evaluate(()=>{
  window.axeCalls=0;window.resolverCalls=0;
  const node=id=>({target:['#'+id],html:'<p></p>',any:[{id:'color-contrast',data:{messageKey:'bgImage'}}],all:[],none:[]});
  axe.run=async()=>{axeCalls++;return {timestamp:new Date().toISOString(),testEngine:{name:'axe-core',version:'test'},violations:[],passes:[],inapplicable:[],incomplete:[{id:'color-contrast',help:'Elements must meet minimum color contrast ratio thresholds',description:'Text contrast',tags:['wcag2aa','wcag143'],nodes:[node('first'),node('later'),node('last')]}]};};
  window.accessLensContrast={automatic:async results=>{resolverCalls++;const rule=results.incomplete[0];const selected=[rule.nodes[0]];let dest=results.passes.find(rule=>rule.id==='color-contrast');if(!dest){dest={...rule,nodes:[]};results.passes.push(dest);}dest.nodes.push(...selected);rule.nodes=rule.nodes.filter(node=>!selected.includes(node));for(const node of rule.nodes)Object.assign(node.secondPass,{attempted:false,reason:'off-screen'});}};
 });
 await page.addScriptTag({path:path.resolve('content.js')});const ui=page.locator('#access-lens-extension');await expect(ui.locator('#export')).toBeEnabled();
 await expect(ui.locator('#scanPassSummary')).toContainText('1 passed; 0 failed; 2 unresolved');
 await ui.locator('#continueContrast').click();
 await expect(ui.locator('#scanPassSummary')).toContainText('3 passed; 0 failed; 0 unresolved');
 await expect(ui.locator('#continueContrast')).toHaveCount(0);await expect(ui.locator('#export')).toBeEnabled();
 expect(await page.evaluate(()=>({axe:axeCalls,resolver:resolverCalls}))).toEqual({axe:1,resolver:3});
 const pending=page.waitForEvent('download');await ui.locator('#export').click();let data='';for await(const chunk of await(await pending).createReadStream())data+=chunk;
 const report=JSON.parse(data);expect(report.scanPasses.first.elements.incomplete).toBe(3);expect(report.scanPasses.second).toMatchObject({passed:3,unresolved:0,continuations:2});
});
