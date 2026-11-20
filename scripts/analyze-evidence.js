// Read-only storage assessment. Output contains sizes/counts, never page paths,
// element content, selectors, findings, or full input filenames.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function analyze(text) {
  const report = JSON.parse(text);
  const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
  const fields = Object.fromEntries(Object.entries(report).map(([key, value]) => [key, bytes(value)]));
  const locators = new Map();
  let locatorOccurrences = 0, locatorBytes = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.target) && value.target.every(part => typeof part === 'string')) {
      const serialized = JSON.stringify(value.target);
      const hash = crypto.createHash('sha256').update(serialized).digest('hex');
      locators.set(hash, Buffer.byteLength(serialized, 'utf8'));
      locatorOccurrences++;
      locatorBytes += Buffer.byteLength(serialized, 'utf8');
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(report);
  const categories = Object.fromEntries(['violations', 'incomplete', 'passes', 'inapplicable'].map(bucket => {
    const rules = report.results?.[bucket] || [];
    return [bucket, { rules: rules.length, nodes: rules.reduce((count, rule) => count + (rule.nodes?.length || 0), 0), compactBytes: bytes(rules) }];
  }));
  return {
    storedBytes: Buffer.byteLength(text, 'utf8'), compactBytes: bytes(report),
    whitespaceBytes: Buffer.byteLength(text, 'utf8') - bytes(report),
    fields, categories,
    structuralTargets: { occurrences: locatorOccurrences, distinct: locators.size,
      serializedBytes: locatorBytes, repeatedBytes: locatorBytes - [...locators.values()].reduce((sum, size) => sum + size, 0) },
    limitations: ['Field sizes exclude enclosing property names and punctuation.', 'Repeated targets may describe distinct observations and are not safe to delete blindly.', 'Whitespace removal changes readability, not evidence content.']
  };
}

if (require.main === module) {
  try {
    const inputs = process.argv.slice(2);
    if (!inputs.length) throw new Error('Provide JSON files or directories.');
    const files = inputs.flatMap(input => fs.statSync(input).isDirectory()
      ? fs.readdirSync(input).filter(name => /^access-lens-[a-f0-9]{64}\.json$/.test(name)).map(name => path.join(input, name)) : [input]);
    console.log(JSON.stringify({ reports: files.map((file, index) => ({ sample: index + 1, ...analyze(fs.readFileSync(file, 'utf8')) })) }, null, 2));
  } catch {
    console.error('Evidence analysis failed. Supply readable, valid JSON reports. Input paths and contents are not logged.');
    process.exitCode = 1;
  }
}

module.exports = { analyze };
