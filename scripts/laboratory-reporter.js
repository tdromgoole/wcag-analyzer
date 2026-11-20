const fs = require('node:fs');
const path = require('node:path');
class LaboratoryReporter {
  constructor() { this.results = []; }
  onTestEnd(test, result) {
    for (const attachment of result.attachments.filter(item => item.name === 'laboratory-result' && item.body)) {
      const record = JSON.parse(attachment.body.toString());
      this.results = this.results.filter(item => item.caseId !== record.caseId);
      this.results.push({ ...record, testStatus: result.status });
    }
  }
  onEnd(result) {
    if (!this.results.length) return;
    const manifest = require('../laboratory/manifest.json');
    const packageInfo = require('../package.json');
    const report = { schemaVersion: '1.0', reportType: 'laboratory-run', runId: require('node:crypto').randomUUID(),
      manifestVersion: manifest.manifestVersion, fixtureVersion: manifest.fixtureVersion, scannerVersion: packageInfo.version,
      axeVersion: require('axe-core').version, finishedAt: new Date().toISOString(), suiteStatus: result.status,
      viewport: manifest.viewport, manualEnvironment: manifest.manualEnvironment || null,
      results: this.results.sort((a, b) => a.caseId.localeCompare(b.caseId)) };
    fs.mkdirSync(path.resolve('test-results'), { recursive: true });
    fs.writeFileSync(path.resolve('test-results/laboratory-run.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
module.exports = LaboratoryReporter;
