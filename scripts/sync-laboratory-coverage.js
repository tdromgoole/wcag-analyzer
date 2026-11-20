// Regenerate coverage bookkeeping only; never infer that a criterion passes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'laboratory/manifest.json'), 'utf8'));
const context = {}; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'workflow.js'), 'utf8'), context);
const criteria = context.accessLensWorkflow.criteria.map(criterion => {
  const linked = manifest.cases.filter(item => item.criterionIds.includes(criterion.id));
  return { id: criterion.id, title: criterion.title, level: criterion.level, reference: criterion.url,
    disposition: !linked.length ? 'not-yet-covered' : linked.every(item => item.expected.method === 'manual') ? 'manual-only' : 'partial',
    caseIds: linked.map(item => item.id), reason: !linked.length ? 'No dedicated laboratory case yet; existing scanner tests may cover individual behaviors.' : 'Examples cover only the stated fixture conditions, not all criterion requirements.' };
});
fs.writeFileSync(path.join(root, 'laboratory/coverage.json'), JSON.stringify({ schemaVersion: '1.0', criteria }, null, 2) + '\n');
console.log(JSON.stringify(require('../laboratory/validate-manifest').validateManifest(manifest, { schemaVersion: '1.0', criteria })));
