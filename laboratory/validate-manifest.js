const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function validateManifest(manifest = require('./manifest.json'), coverage = require('./coverage.json')) {
  const context = {}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../workflow.js'), 'utf8'), context);
  const catalog = new Map(context.accessLensWorkflow.criteria.map(item => [item.id, item]));
  const rules = new Set(require('axe-core').getRules().map(item => item.ruleId));
  const fail = message => { throw new Error(`Laboratory manifest: ${message}`); };
  if (manifest.manifestVersion !== '1.0' || typeof manifest.fixtureVersion !== 'string' || !Array.isArray(manifest.cases) || !manifest.cases.length) fail('unsupported version or missing cases');
  if (![manifest.viewport?.width, manifest.viewport?.height].every(value => Number.isSafeInteger(value) && value > 0)) fail('invalid viewport');
  if (manifest.manualEnvironment && (manifest.manualEnvironment.screenReader !== 'NVDA' || manifest.manualEnvironment.verified !== false || !Array.isArray(manifest.manualEnvironment.browsers) || manifest.manualEnvironment.browsers.some(browser => !['Chrome','Edge'].includes(browser)) || manifest.manualEnvironment.protocol !== 'manual-nvda.html')) fail('invalid manual environment declaration');
  const ids = new Set();
  for (const item of manifest.cases) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.id) || ids.has(item.id)) fail('invalid or duplicate case ID');
    ids.add(item.id);
    if (item.viewport && ![item.viewport.width, item.viewport.height].every(value => Number.isSafeInteger(value) && value > 0)) fail(`invalid case viewport: ${item.id}`);
    if (!item.title || !item.category || !item.manualInstructions || !Array.isArray(item.criterionIds) || !item.criterionIds.length || item.criterionIds.some(id => !catalog.has(id))) fail(`invalid case metadata: ${item.id}`);
    if (!/^fixtures\/[a-z-]+\/[a-z-]+\.html$/.test(item.fixture) || !fs.existsSync(path.join(__dirname, item.fixture))) fail(`missing/unsafe fixture: ${item.id}`);
    if (item.evaluatedFixture && (!/^fixtures\/[a-z-]+\/[a-z-]+\.html$/.test(item.evaluatedFixture) || !fs.existsSync(path.join(__dirname, item.evaluatedFixture)))) fail(`missing/unsafe evaluated fixture: ${item.id}`);
    if (!['fail','pass-example','not-applicable','requires-manual-judgment'].includes(item.knownCondition)) fail(`unknown condition: ${item.id}`);
    const expected = item.expected;
    if (!expected || !['fail','pass','manual','not-applicable'].includes(expected.outcome) || !['axe','inventory','supplemental','spacing','manual'].includes(expected.method)) fail(`invalid expected result: ${item.id}`);
    if (!Array.isArray(item.steps) || item.steps.some(step => !/^#[a-z][a-z0-9-]*$/.test(step.target) || (step.action === 'click' ? step.key !== undefined : step.action !== 'press' || !['Tab', 'Shift+Tab', 'Enter', 'Escape', 'Space'].includes(step.key)))) fail(`invalid interaction steps: ${item.id}`);
    if (expected.method === 'manual') {
      if (expected.outcome !== 'manual' || expected.count !== null || expected.ruleId !== null || expected.bucket !== null) fail(`manual case cannot assert automation: ${item.id}`);
    } else {
      if (!Number.isSafeInteger(expected.count) || expected.count < 0) fail(`invalid scoped count: ${item.id}`);
      if (expected.method === 'axe' && (!rules.has(expected.ruleId) || !['violations','passes','incomplete','inapplicable'].includes(expected.bucket))) fail(`invalid axe expectation: ${item.id}`);
      if (expected.method === 'inventory' && (expected.ruleId !== 'alt-suspicious' || expected.bucket !== 'alerts' || expected.outcome !== 'manual')) fail(`invalid inventory expectation: ${item.id}`);
      if (expected.method === 'spacing' && (expected.ruleId !== 'text-spacing' || expected.bucket !== 'observations' || expected.outcome !== 'manual')) fail(`invalid spacing expectation: ${item.id}`);
      if (expected.method === 'supplemental' && (expected.ruleId !== 'video-captions' || expected.bucket !== 'observations' || expected.outcome !== 'manual')) fail(`invalid supplemental expectation: ${item.id}`);
      if (expected.outcome === 'not-applicable' ? expected.target !== null || expected.bucket !== 'inapplicable' || expected.count !== 0 : !/^#[a-z][a-z0-9-]*$/.test(expected.target)) fail(`invalid target scope: ${item.id}`);
    }
  }
  if (coverage.schemaVersion !== '1.0' || !Array.isArray(coverage.criteria) || coverage.criteria.length !== catalog.size) fail('coverage must account for all 55 criteria');
  const seen = new Set();
  for (const criterion of coverage.criteria) {
    if (!catalog.has(criterion.id) || seen.has(criterion.id) || criterion.title !== catalog.get(criterion.id).title || !criterion.reason) fail('invalid criterion disposition');
    seen.add(criterion.id);
    const linked = manifest.cases.filter(item => item.criterionIds.includes(criterion.id));
    const expected = !linked.length ? 'not-yet-covered' : linked.every(item => item.expected.method === 'manual') ? 'manual-only' : 'partial';
    if (criterion.disposition !== expected || JSON.stringify(criterion.caseIds) !== JSON.stringify(linked.map(item => item.id))) fail(`inaccurate coverage: ${criterion.id}`);
  }
  return { cases: manifest.cases.length, criteria: seen.size };
}
if (require.main === module) console.log(JSON.stringify(validateManifest()));
module.exports = { validateManifest };
