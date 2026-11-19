const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('features.js') });
});

test('second pass accounts for every review and preserves confirmed axe results', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const node = target => ({ target: [target], any: [], all: [], none: [] });
    const confirmed = node('#original-failure'), passed = node('#original-pass');
    const results = { violations: [{ id: 'color-contrast', nodes: [confirmed] }], passes: [{ id: 'color-contrast', nodes: [passed] }], inapplicable: [], incomplete: [
      { id: 'color-contrast', nodes: [node('#resolved-pass'), node('#resolved-fail'), node('#offscreen')] },
      { id: 'link-name', nodes: [node('#meaning')] }
    ] };
    window.accessLensContrast = { automatic: async working => {
      // A broken resolver must not discard or rewrite confirmed axe findings.
      working.violations = []; working.passes[0].nodes[0].target = ['#corrupted'];
      const rule = working.incomplete[0];
      working.passes.push({ ...rule, nodes: [rule.nodes[0]] });
      working.violations.push({ ...rule, nodes: [rule.nodes[1]] });
      Object.assign(rule.nodes[2].secondPass, { reason: 'off-screen', attempted: false });
      rule.nodes = [rule.nodes[2]];
    } };
    await accessLensFeatures.secondPass(results);
    return results;
  });
  expect(result.accessLensScanPasses.first.elements).toEqual({ violations: 1, incomplete: 4, passes: 1, inapplicable: 0 });
  expect(result.accessLensScanPasses.second).toMatchObject({ considered: 4, attempted: 2, passed: 1, failed: 1, unresolved: 2, unsupported: 1 });
  expect(result.violations[0].nodes.map(node => node.target[0])).toEqual(['#original-failure','#resolved-fail']);
  expect(result.passes[0].nodes.map(node => node.target[0])).toEqual(['#original-pass','#resolved-pass']);
  expect(result.passes[0].nodes[1].secondPass).toMatchObject({ initialEngine: 'axe-core', initialStatus: 'incomplete', status: 'pass', reason: 'resolved' });
  expect(result.incomplete.find(rule => rule.id === 'color-contrast').nodes[0].secondPass.reason).toBe('off-screen');
  expect(result.incomplete.find(rule => rule.id === 'link-name').nodes[0].secondPass.reason).toBe('no-handler');
});

test('failed resolver rolls back partial changes and retains the original review', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const results = { violations: [], passes: [], inapplicable: [], incomplete: [{ id: 'color-contrast', nodes: [{ target: ['#original'], any: [], all: [], none: [] }] }] };
    window.accessLensContrast = { automatic: async working => { working.incomplete[0].nodes[0].target = ['#mutated']; working.incomplete = []; throw new Error('PRIVATE_ERROR'); } };
    await accessLensFeatures.secondPass(results);
    return results;
  });
  expect(result.incomplete[0].nodes[0].target).toEqual(['#original']);
  expect(result.incomplete[0].nodes[0].secondPass.reason).toBe('handler-failed');
  expect(result.accessLensScanPasses.second).toMatchObject({ handlerFailures: 1, unresolved: 1, passed: 0, failed: 0 });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR');
});

test('missing handlers and missing modules remain explicit unresolved results', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const results = { violations: [], passes: [], inapplicable: [], incomplete: ['color-contrast','video-caption'].map(id => ({ id, nodes: [{ target: [], any: [], all: [], none: [] }] })) };
    await accessLensFeatures.secondPass(results);
    return results;
  });
  expect(result.accessLensScanPasses.second).toMatchObject({ considered: 2, attempted: 0, unresolved: 2, unsupported: 2 });
  expect(result.incomplete.map(rule => rule.nodes[0].secondPass.reason)).toEqual(['module-unavailable','no-handler']);
});

test('panel and JSON explain both passes without exporting raw selectors in second-pass metadata', async ({ page }) => {
  await page.evaluate(() => { const el = document.createElement('p'); el.id = 'PRIVATE_SELECTOR'; el.textContent = 'Text'; el.style.cssText = 'color:white;background:linear-gradient(black,white)'; document.body.append(el); });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','workflow.js','export.js','contrast.js','content.js'].map(file => path.resolve(file))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await expect(ui.locator('#scanPassSummary')).toContainText('Pass 1 — axe');
  await expect(ui.locator('#scanPassSummary')).toContainText('Pass 2 — Access Lens');
  const pending = page.waitForEvent('download'); await ui.locator('#export').click();
  let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
  const report = JSON.parse(data);
  const review = report.results.incomplete.find(rule => rule.id === 'color-contrast').nodes[0].secondPass;
  expect(review).toMatchObject({ initialEngine: 'axe-core', initialStatus: 'incomplete', status: 'unresolved', engine: 'Access Lens', reason: 'page-unavailable' });
  expect(review.explanation).toContain('active visible page');
  expect(JSON.stringify(review)).not.toContain('PRIVATE_SELECTOR');
  expect(review.id).toBeUndefined();
  expect(report.scanPasses.first.engine).toBe('axe-core');
  expect(report.scanPasses.second.engine).toBe('Access Lens');
  expect(report.scanPasses.second.considered).toBe(report.scanPasses.second.passed + report.scanPasses.second.failed + report.scanPasses.second.unresolved);
});

test('continuation preserves first-pass counts and completed results without duplicate second-pass IDs', async ({ page }) => {
 const result=await page.evaluate(async()=>{
  const node=target=>({target:[target],any:[],all:[],none:[]});
  const results={violations:[{id:'image-alt',nodes:[node('#original-failure')]}],passes:[],inapplicable:[],incomplete:[{id:'color-contrast',nodes:[node('#first'),node('#later')]}]};
  let calls=0;
  window.accessLensContrast={automatic:async working=>{
   calls++;const rule=working.incomplete.find(rule=>rule.id==='color-contrast');const selected=calls===1?[rule.nodes[0]]:[...rule.nodes];
   for(const item of selected){let dest=working.passes.find(rule=>rule.id==='color-contrast');if(!dest){dest={...rule,nodes:[]};working.passes.push(dest);}dest.nodes.push(item);rule.nodes=rule.nodes.filter(node=>node!==item);}
   for(const item of rule.nodes)Object.assign(item.secondPass,{reason:'off-screen',attempted:false});
  }};
  await accessLensFeatures.secondPass(results);const first=structuredClone(results.accessLensScanPasses.first);
  await accessLensFeatures.continueScan(results);
  return {results,first,locked:globalThis.__accessLensScanLock,measuring:Boolean(globalThis.__accessLensMeasuring)};
 });
 expect(result.results.accessLensScanPasses.first).toEqual(result.first);
 expect(result.results.accessLensScanPasses.second).toMatchObject({considered:2,attempted:2,passed:2,failed:0,unresolved:0,continuations:1});
 expect(result.results.passes[0].nodes.map(node=>node.target[0])).toEqual(['#first','#later']);
 expect(new Set(result.results.passes[0].nodes.map(node=>node.secondPass.id)).size).toBe(2);
 expect(result.results.violations[0].nodes[0].target).toEqual(['#original-failure']);
 expect(result.locked||result.measuring).toBe(false);
});
