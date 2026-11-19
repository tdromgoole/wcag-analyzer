const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  for (const file of ['workflow.js','features.js','export.js','save-settings.js','recovery.js']) await page.addScriptTag({ path: path.resolve(file) });
  await page.evaluate(() => {
    window.makeSavedReport = (path, issues = []) => ({
      schemaVersion: '2.0', privacy: { mode: 'alternative-text-included' }, pagePath: location.origin + path,
      scannedAt: new Date().toISOString(), pageState: { key: '0'.repeat(64) },
      completeness: { status: 'completed-for-scope' }, manualChecks: {},
      results: { violations: issues.map(id => ({ id, tags: ['wcag111'], nodes: [{ target: ['main > img'], alternativeText: 'PRIVATE_ALT' }] })), incomplete: [], passes: [{ id: 'document-title', tags: ['wcag242'], nodes: [] }], inapplicable: [] },
      wcagCoverage: { reviewComplete: true, conformanceEstablished: true }
    });
  });
});

test('folder aggregation selects latest scans, merges dated decisions, reports gaps, and excludes other sites and content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const name = (character, suffix = '') => `access-lens-${character.repeat(64)}${suffix}.json`;
    const old = makeSavedReport('/a', ['image-alt']); old.scannedAt = new Date(Date.now() - 86400000).toISOString();
    old.manualChecks.keyboard = { status: 'fail', checkedAt: new Date(Date.now() + 1000).toISOString() };
    const latest = makeSavedReport('/a'); latest.comparison = { new: [], remaining: [], noLongerDetected: [{}] };
    const b = makeSavedReport('/b?SECRET#PRIVATE', ['image-alt']);
    const c = makeSavedReport('/c', ['image-alt']);
    const foreign = makeSavedReport('/other'); foreign.pagePath = 'https://another.example/';
    const entries = [[name('a'), latest], [name('a',' (1)'), old], [name('b'), b], [name('c'), c], [name('d'), foreign], [name('e'), 'INVALID_JSON']];
    const handles = entries.map(([filename, report]) => [filename, { kind: 'file', getFile: async () => new File([typeof report === 'string' ? report : JSON.stringify(report)], filename) }]);
    handles.push([name('f'), { kind: 'file', getFile: async () => { throw new Error('PRIVATE_PATH'); } }]);
    handles.push([name('1'), { kind: 'file', getFile: async () => ({ size: 21 * 1024 * 1024 }) }]);
    handles.push(['sitemap.json', { kind: 'file', getFile: async () => { throw new Error('Must not read unrelated JSON'); } }]);
    accessLensSettings.read = async () => ({ directory: { queryPermission: async () => 'granted', entries: async function* () { yield* handles; } } });
    accessLensSettings.pending = async () => ({ queued: { report: latest } });
    accessLensSettings.sitemap = async () => ({ nodes: { unscanned: { id: 'unscanned', linked: true, path: '/not-visited', states: {} }, a: { id: 'a', linked: true, path: '/a', states: {} } } });
    return accessLensSettings.loadSiteReport(location.origin);
  });
  expect(result.summary).toMatchObject({ pages: 3, states: 3, pagesWithAutomatedIssues: 2, pagesWithNoDetectedViolations: 1, pagesWithManualFailures: 1, knownUnscannedPages: 1, noLongerDetected: 1, recordedReviewComplete: 0 });
  expect(result.sources).toMatchObject({ includedFiles: 4, otherSites: 1, invalid: 1, unreadable: 1, oversized: 1, duplicateSnapshots: 1, partial: true, queuedReports: 1 });
  expect(result.rules[0]).toMatchObject({ id: 'image-alt', occurrences: 2 });
  expect(result.possibleSharedFixes).toHaveLength(1);
  expect(result.pages[0].states[0].manualChecks.keyboard.status).toBe('fail');
  expect(result.conformanceEstablished).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET|alternativeText|another\.example/);
});

test('saved evidence recalculates stale and limited review status and separates state files', async ({ page }) => {
  const result = await page.evaluate(() => {
    const report = makeSavedReport('/a'); report.scannedAt = new Date(Date.now() - 9 * 86400000).toISOString(); report.completeness.status = 'limited';
    for (const [id] of accessLensWorkflow.checklist) report.manualChecks[id] = { status: 'pass', checkedAt: new Date(Date.now() - 10 * 86400000).toISOString() };
    const first = accessLensFeatures.reportEvidence(report, `access-lens-${'a'.repeat(64)}.json`);
    const second = accessLensFeatures.reportEvidence({ ...report, scannedAt: new Date().toISOString(), manualChecks: {} }, `access-lens-${'b'.repeat(64)}.json`);
    return accessLensFeatures.savedSiteReport([first, second], location.origin);
  });
  expect(result.summary).toMatchObject({ pages: 1, states: 2, staleStates: 1, limitedStates: 2, recordedReviewComplete: 0 });
  expect(result.pages[0].states[0].manual.needsRevalidation).toBeGreaterThan(0);
  expect(result.criteria.find(row => row.id === '1.1.1').counts['needs-revalidation']).toBe(1);
});

test('saving rereads external decisions, protects newer scans, and queues malformed file conflicts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'a'.repeat(64)}.json`;
    const incoming = makeSavedReport('/a');
    incoming.manualChecks.keyboard = { status: 'pass', checkedAt: new Date(Date.now() - 1000).toISOString() };
    let disk = structuredClone(incoming), writes = 0;
    disk.manualChecks.keyboard = { status: 'fail', checkedAt: new Date().toISOString() };
    disk.manualChecks['1.1.1'] = { status: 'pass', checkedAt: new Date().toISOString() };
    const read = accessLensSettings.read.bind(accessLensSettings);
    const settings = { autoSave: true, directory: { queryPermission: async () => 'granted', getFileHandle: async () => ({
      getFile: async () => new File([typeof disk === 'string' ? disk : JSON.stringify(disk)], filename),
      createWritable: async () => ({ write: async data => { disk = JSON.parse(data); writes++; }, close: async () => {} })
    }) } };
    accessLensSettings.read = key => key ? read(key) : Promise.resolve(settings);
    const saved = await accessLensSettings.saveRecoverable(incoming, false, filename);
    const merged = structuredClone(disk);
    disk.scannedAt = new Date(Date.now() + 5000).toISOString();
    const newer = await accessLensSettings.saveRecoverable(incoming, false, filename);
    disk = 'broken JSON';
    const invalid = await accessLensSettings.flushOne(filename);
    await accessLensSettings.write(new Date(Date.now() + 500).toISOString(), 'saved-at:' + filename);
    incoming.manualChecks.keyboard.checkedAt = new Date(Date.now() + 2000).toISOString();
    await accessLensSettings.enqueue(incoming, filename);
    const oldInspector = await accessLensSettings.flushOne(filename);
    return { saved, merged, newer, invalid, oldInspector, writes, pending: Object.keys(await accessLensSettings.pending()).length };
  });
  expect(result.saved).toMatchObject({ saved: true, review: { checklist: { keyboard: { status: 'fail' } } } });
  expect(result.merged.manualChecks['1.1.1'].status).toBe('pass');
  expect(result.merged.wcagCoverage.conformanceEstablished).toBe(false);
  expect(result.newer).toMatchObject({ queued: true, code: 'NEWER_REPORT' });
  expect(result.invalid).toMatchObject({ queued: true, code: 'INVALID_SAVED_REPORT' });
  expect(result.oldInspector).toMatchObject({ queued: true, code: 'NEWER_REPORT' });
  expect(result.writes).toBe(1); expect(result.pending).toBe(1);
});

test('readable HTML escapes file data and shows manual evidence and coverage without scripts', async ({ page }) => {
  const html = await page.evaluate(() => {
    const evidence = accessLensFeatures.reportEvidence(makeSavedReport('/a'), `access-lens-${'a'.repeat(64)}.json`);
    const report = accessLensFeatures.savedSiteReport([evidence], location.origin);
    report.sitePath = '<script>window.injected=true</script>';
    return accessLensFeatures.siteReportHTML(report);
  });
  await page.setContent(html);
  await expect(page.getByRole('heading', { name: 'Site accessibility review' })).toBeVisible();
  await expect(page.getByText('Recorded evidence only.', { exact: false })).toBeVisible();
  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('<script>window.injected=true</script>');
  await page.getByText('Manual decisions and review dates', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('a failed initial write can retry the empty file it created', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const report = makeSavedReport('/new'), filename = `access-lens-${'a'.repeat(64)}.json`;
    let disk = '', fail = true;
    const read = accessLensSettings.read.bind(accessLensSettings);
    const directory = { queryPermission: async () => 'granted', getFileHandle: async () => ({
      getFile: async () => new File([disk], filename),
      createWritable: async () => ({ write: async data => { if (fail) throw new Error('Write interrupted'); disk = data; }, close: async () => {}, abort: async () => {} })
    }) };
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory });
    const first = await accessLensSettings.saveRecoverable(report, false, filename);
    fail = false;
    const retried = await accessLensSettings.flushQueue(true);
    return { first, retried, report: JSON.parse(disk) };
  });
  expect(result.first.queued).toBe(true);
  expect(result.retried).toEqual({ saved: 1, remaining: 0 });
  expect(result.report.pagePath).toContain('/new');
});

test('folder permissions and file-count limits fail visibly or mark partial results', async ({ page }) => {
  const result = await page.evaluate(async () => {
    accessLensSettings.read = async () => ({});
    let missing; try { await accessLensSettings.loadSiteReport(location.origin); } catch (error) { missing = error.code; }
    const directory = { queryPermission: async () => 'denied' };
    accessLensSettings.read = async () => ({ directory });
    let denied; try { await accessLensSettings.loadSiteReport(location.origin); } catch (error) { denied = error.code; }
    directory.queryPermission = async () => 'granted';
    directory.entries = async function* () { for (let index = 0; index < 2001; index++) yield [`access-lens-${index.toString(16).padStart(64, '0')}.json`, { kind: 'file', getFile: async () => ({ size: 21 * 1024 * 1024 }) }]; };
    accessLensSettings.sitemap = async () => ({ nodes: {} }); accessLensSettings.pending = async () => ({});
    const report = await accessLensSettings.loadSiteReport(location.origin);
    return { missing, denied, sources: report.sources };
  });
  expect(result.missing).toBe('NO_FOLDER'); expect(result.denied).toBe('FOLDER_PERMISSION');
  expect(result.sources).toMatchObject({ matchingFiles: 2000, limitReached: true, partial: true });
});

test('upgraded report identity accepts legacy copies and keeps configured routes separate', async ({ page }) => {
  const result = await page.evaluate(() => {
    const report = makeSavedReport('/app');
    const name = `access-lens-${'a'.repeat(64)}.json`;
    const legacy = accessLensFeatures.reportEvidence(report, name);
    const current = accessLensFeatures.reportEvidence({ ...report, pageIdentity: { pageKey: 'b'.repeat(64) } }, name.replace('.json', ' (1).json'));
    const route = accessLensFeatures.reportEvidence({ ...report, pageIdentity: { pageKey: 'c'.repeat(64) } }, `access-lens-${'d'.repeat(64)}.json`);
    return accessLensFeatures.savedSiteReport([legacy, current, route], location.origin);
  });
  expect(result.summary).toMatchObject({ pages: 2, states: 2 });
  expect(result.sources.duplicateSnapshots).toBe(1);
});

test('site report panel reads the folder, refreshes external edits, and exports JSON and readable HTML', async ({ page }) => {
  await page.evaluate(() => {
    window.folderSnapshot = makeSavedReport('/reviewed');
    folderSnapshot.manualChecks.keyboard = { status: 'fail', checkedAt: new Date().toISOString() };
    const filename = `access-lens-${'a'.repeat(64)}.json`;
    const settings = { directory: { queryPermission: async () => 'granted', entries: async function* () {
      yield [filename, { kind: 'file', getFile: async () => new File([JSON.stringify(folderSnapshot)], filename) }];
    } } };
    accessLensSettings.read = async () => settings;
    accessLensSettings.sitemap = async () => ({ nodes: {} });
    window.chrome = { runtime: { id: 'test-extension', sendMessage: async message => {
      if (message.type === 'access-lens-site-report') return accessLensSettings.loadSiteReport(message.address);
      if (message.type === 'access-lens-history') return { enabled: false };
      if (message.type === 'access-lens-sitemap') return { nodes: {} };
      return { skipped: true };
    } } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#scan')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Site report');
  await expect(ui.locator('#savedSiteReportSummary')).toContainText('1 saved pages');
  await expect(ui.locator('.results')).toContainText('Manual: 1 pages with failures');
  const downloadReport = async (label) => {
    const pending = page.waitForEvent('download'); await ui.getByText(label, { exact: true }).click();
    let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
    return data;
  };
  const json = JSON.parse(await downloadReport('Export site report JSON'));
  expect(json.reportType).toBe('site-review');
  expect(json.pages[0].states[0].manualChecks.keyboard.status).toBe('fail');
  const html = await downloadReport('Export site report HTML');
  expect(html).toContain('Manual decisions and review dates');
  await page.evaluate(() => { folderSnapshot.manualChecks.keyboard = { status: 'pass', checkedAt: new Date().toISOString() }; });
  await ui.locator('#refreshSiteReport').click();
  await expect(ui.locator('.results')).toContainText('Manual: 0 pages with failures');
  const exported = await page.context().newPage();
  await exported.setContent(html);
  await expect(exported.getByRole('heading', { name: 'Site accessibility review' })).toBeVisible();
  await exported.screenshot({ path: 'test-results/site-report-html.png', fullPage: true });
  await exported.close();
});
