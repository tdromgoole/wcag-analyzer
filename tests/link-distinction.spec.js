const {test,expect}=require('@playwright/test');const path=require('node:path');
test('isolated metadata links resolve but prose links are not cleared by background contrast or color difference alone',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.setContent('<style>body{background:white;color:#333;font:16px Arial}a{color:#02599c;text-decoration:none}.metadata li{display:inline;background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E")}#under{text-decoration:underline}#generated::before{content:"Read "}</style><ul class="metadata"><li><a id="author">Author name</a></li><li>November 18</li></ul><p>Read this <a id="prose">inline link</a> in prose.</p><p>Read this <a id="under">underlined link</a> in prose.</p><p id="generated"><a id="generated-link">Generated context</a></p>');
 for(const file of [require.resolve('axe-core/axe.min.js'),...['workflow.js','features.js','contrast.js','export.js'].map(f=>path.resolve(f))])await page.addScriptTag({path:file});
 const result=await page.evaluate(async()=>{
 const node=id=>({target:['#'+id],any:[{id:'link-in-text-block',data:{messageKey:'bgOverlap'}}],all:[],none:[]});
 const results={violations:[],passes:[{id:'color-contrast',nodes:[{target:['#prose'],any:[],all:[],none:[]},{target:['#under'],any:[],all:[],none:[]}]}],inapplicable:[],incomplete:[{id:'link-in-text-block',nodes:['author','prose','under','generated-link'].map(node)}]};
 await accessLensFeatures.secondPass(results);return {raw:Object.fromEntries(['passes','incomplete'].map(bucket=>[bucket,results[bucket].filter(rule=>rule.id==='link-in-text-block').flatMap(rule=>rule.nodes.map(node=>node.target[0]))])),report:accessLensExport({results,inventory:{},scannedAt:new Date().toISOString()})};
 });
 expect(result.raw.passes).toEqual(['#author','#under']);expect(result.raw.incomplete).toEqual(['#prose','#generated-link']);
 const checks=result.report.results.passes.find(rule=>rule.id==='link-in-text-block').nodes.map(node=>node.any[0].linkDistinction);
 expect(checks.map(check=>check.method)).toEqual(['isolated-link-context','persistent-underline']);
 const review=result.report.results.incomplete[0].nodes[0];expect(review.secondPass.reason).toBe('link-cue-unverified');expect(review.any[0].linkDistinction.requiredLinkToTextRatio).toBe(3);
 expect(result.report.scanPasses.second).toMatchObject({considered:4,passed:2,failed:0,unresolved:2});
});

test('a 3:1 link-to-text color pair alone never resolves hover/focus review',async({page})=>{
 await page.goto('http://127.0.0.1:4178');await page.setContent('<p style="color:black;background:white">Text <a id="link" style="color:#777;text-decoration:none">Link</a> more text</p>');
 for(const file of ['features.js','contrast.js'])await page.addScriptTag({path:path.resolve(file)});
 const result=await page.evaluate(async()=>{const results={violations:[],passes:[],inapplicable:[],incomplete:[{id:'link-in-text-block',nodes:[{target:['#link'],any:[{id:'link-in-text-block',data:{}}],all:[],none:[]}]}]};await accessLensFeatures.secondPass(results);return results;});
 expect(result.incomplete[0].nodes[0].any[0].data.linkDistinction.minimumLinkToTextRatio).toBeGreaterThan(3);
 expect(result.incomplete[0].nodes[0].secondPass.reason).toBe('link-cue-unverified');expect(result.passes).toHaveLength(0);expect(result.violations).toHaveLength(0);
});
