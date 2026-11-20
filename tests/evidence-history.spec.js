const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

async function load(page) {
  await page.goto('http://127.0.0.1:4178');
  for (const file of ['save-settings.js', 'recovery.js']) await page.addScriptTag({ path: path.resolve(file) });
}

test('coalescing and deleting pending saves never loses earlier scan or review snapshots', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'a'.repeat(64)}.json`;
    const first = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z', manualChecks: {} };
    await accessLensSettings.enqueue(first, filename);
    const next = { ...first, scannedAt: '2026-11-19T13:00:00Z' };
    await accessLensSettings.enqueue(next, filename);
    next.manualChecks = { keyboard: { status: 'pass', checkedAt: '2026-11-19T13:01:00Z' } };
    await accessLensSettings.enqueue(next, filename);
    const reordered = Object.fromEntries(Object.entries(next).reverse());
    await accessLensSettings.enqueue(reordered, filename);
    const pending = await accessLensSettings.pending();
    await accessLensSettings.deletePending();
    return { pending, retained: await accessLensSettings.retainedSnapshots() };
  });
  expect(Object.keys(result.pending)).toHaveLength(1);
  expect(Object.keys(result.retained)).toHaveLength(3);
  expect(Object.values(result.retained).map(entry => entry.report.scannedAt)).toContain('2026-11-19T12:00:00Z');
  await page.reload();
  for (const file of ['save-settings.js', 'recovery.js']) await page.addScriptTag({ path: path.resolve(file) });
  expect(await page.evaluate(async () => Object.keys(await accessLensSettings.retainedSnapshots()).length)).toBe(3);
  expect(await page.evaluate(() => accessLensSettings.pending())).toEqual({});
});

test('history capacity failures preserve existing evidence and reject new pending writes visibly', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'b'.repeat(64)}.json`;
    const first = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z' };
    await accessLensSettings.enqueue(first, filename);
    const retained = await accessLensSettings.retainedSnapshots();
    const id = Object.keys(retained)[0];
    retained[id].bytes = 20 * 1024 * 1024;
    await accessLensSettings.write({ entries: retained }, 'evidence-snapshots');
    let failure;
    try { await accessLensSettings.enqueue({ ...first, scannedAt: '2026-11-19T13:00:00Z' }, filename); }
    catch (error) { failure = accessLensSettings.saveError(error); }
    return { failure, retained: await accessLensSettings.retainedSnapshots(), pending: await accessLensSettings.pending() };
  });
  expect(result.failure.code).toBe('HISTORY_FULL');
  expect(Object.keys(result.retained)).toHaveLength(1);
  expect(Object.values(result.pending)[0].report.scannedAt).toBe('2026-11-19T12:00:00Z');
});

test('Settings exports preserved evidence without deleting snapshots', async ({ page }) => {
  await load(page);
  await page.evaluate(() => accessLensSettings.enqueue({ schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z' }, `access-lens-${'c'.repeat(64)}.json`));
  await page.setContent(fs.readFileSync(path.resolve('options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
  await page.addScriptTag({ path: path.resolve('options.js') });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export preserved evidence JSON', exact: true }).click();
  const download = await pending;
  let text = '';
  for await (const chunk of await download.createReadStream()) text += chunk;
  const bundle = JSON.parse(text);
  expect(bundle.reportType).toBe('preserved-evidence');
  expect(bundle.snapshots).toHaveLength(1);
  expect(bundle.events).toHaveLength(1);
  expect(bundle.events[0].eventType).toBe('scan-evidence-preserved');
  expect(bundle.snapshots[0].report.scannedAt).toBe('2026-11-19T12:00:00Z');
  expect(await page.evaluate(async () => Object.keys(await accessLensSettings.retainedSnapshots()).length)).toBe(1);
  await expect(page.locator('#evidenceStatus')).toContainText('Local evidence was retained');
});

async function archiveHarness(page) {
  await load(page);
  await page.evaluate(() => {
    window.archiveFiles = {};
    window.archiveWrites = 0;
    window.archiveFailure = '';
    window.archiveAllowed = true;
    const read = accessLensSettings.read.bind(accessLensSettings);
    const directory = {
      getFileHandle: async (name, options) => {
        if (!(name in archiveFiles)) {
          if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
          archiveFiles[name] = '';
        }
        return {
          getFile: async () => new File([archiveFiles[name]], name),
          createWritable: async () => {
            let staged;
            return {
              write: async text => { if (archiveFailure === 'write') throw new DOMException('Private path', 'QuotaExceededError'); staged = text; },
              close: async () => {
                archiveFiles[name] = archiveFailure === 'corrupt' ? '{}' : staged;
                archiveWrites++;
                if (archiveFailure === 'close') throw new DOMException('Private path', 'AbortError');
              },
              abort: async () => {}
            };
          }
        };
      }
    };
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory: {
      queryPermission: async () => archiveAllowed ? 'granted' : 'prompt',
      getDirectoryHandle: async name => { if (name !== 'access-lens-history') throw new Error('Unexpected directory'); return directory; }
    } });
    window.historyFilename = `access-lens-${'d'.repeat(64)}.json`;
    window.historyReport = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z', results: { violations: [{ id: 'image-alt', nodes: [{ target: ['img:nth-child(1)'] }] }] } };
  });
}

test('verified immutable archival frees staging capacity and repeated archival does not rewrite evidence', async ({ page }) => {
  await archiveHarness(page);
  const result = await page.evaluate(async () => {
    await accessLensSettings.enqueue(historyReport, historyFilename);
    const first = await accessLensSettings.archiveSnapshots();
    await accessLensSettings.enqueue(historyReport, historyFilename);
    const second = await accessLensSettings.archiveSnapshots();
    return { first, second, writes: archiveWrites, files: archiveFiles, retained: await accessLensSettings.retainedSnapshots(), pending: await accessLensSettings.pending() };
  });
  expect(result.first).toEqual({ archived: 1, remaining: 0 });
  expect(result.second).toEqual({ archived: 1, remaining: 0 });
  expect(result.writes).toBe(1);
  expect(Object.keys(result.files)).toHaveLength(1);
  expect(JSON.parse(Object.values(result.files)[0]).report.results.violations[0].id).toBe('image-alt');
  expect(JSON.parse(Object.values(result.files)[0]).events[0].outcomes.violations).toBe(1);
  expect(result.retained).toEqual({});
  expect(Object.keys(result.pending)).toHaveLength(1);
});

for (const failure of ['write', 'close', 'corrupt']) {
  test(`archive ${failure} failure retains local evidence and never overwrites a conflicting archive`, async ({ page }) => {
    await archiveHarness(page);
    const result = await page.evaluate(async failure => {
      await accessLensSettings.enqueue(historyReport, historyFilename);
      archiveFailure = failure;
      let error;
      try { await accessLensSettings.archiveSnapshots(); } catch (caught) { error = accessLensSettings.saveError(caught); }
      const retainedAfterFailure = Object.keys(await accessLensSettings.retainedSnapshots()).length;
      archiveFailure = '';
      let retry;
      try { retry = await accessLensSettings.archiveSnapshots(); } catch (caught) { retry = accessLensSettings.saveError(caught); }
      return { error, retainedAfterFailure, retry, writes: archiveWrites, retained: Object.keys(await accessLensSettings.retainedSnapshots()).length };
    }, failure);
    expect(result.retainedAfterFailure).toBe(1);
    expect(JSON.stringify(result)).not.toContain('Private path');
    if (failure === 'corrupt') {
      expect(result.error.code).toBe('HISTORY_CONFLICT');
      expect(result.retry.code).toBe('HISTORY_CONFLICT');
      expect(result.retained).toBe(1);
      expect(result.writes).toBe(1);
    } else {
      expect(result.retry).toEqual({ archived: 1, remaining: 0 });
      expect(result.retained).toBe(0);
      expect(result.writes).toBe(1);
    }
  });
}

test('denied archival permission preserves all local snapshots', async ({ page }) => {
  await archiveHarness(page);
  const result = await page.evaluate(async () => {
    await accessLensSettings.enqueue(historyReport, historyFilename);
    archiveAllowed = false;
    let error;
    try { await accessLensSettings.archiveSnapshots(); } catch (caught) { error = accessLensSettings.saveError(caught); }
    return { error, count: Object.keys(await accessLensSettings.retainedSnapshots()).length, files: archiveFiles };
  });
  expect(result.error.code).toBe('FOLDER_PERMISSION');
  expect(result.count).toBe(1);
  expect(result.files).toEqual({});
});

test('archiving a full staging store restores capacity without removing archived evidence', async ({ page }) => {
  await archiveHarness(page);
  const result = await page.evaluate(async () => {
    await accessLensSettings.enqueue(historyReport, historyFilename);
    const entries = await accessLensSettings.retainedSnapshots();
    entries[Object.keys(entries)[0]].bytes = 20 * 1024 * 1024;
    await accessLensSettings.write({ entries }, 'evidence-snapshots');
    const next = { ...historyReport, scannedAt: '2026-11-19T13:00:00Z', results: { violations: [] } };
    let full;
    try { await accessLensSettings.enqueue(next, historyFilename); } catch (error) { full = error.code; }
    const archived = await accessLensSettings.archiveSnapshots();
    await accessLensSettings.enqueue(next, historyFilename);
    return { full, archived, files: archiveFiles, staged: await accessLensSettings.retainedSnapshots() };
  });
  expect(result.full).toBe('HISTORY_FULL');
  expect(result.archived).toEqual({ archived: 1, remaining: 0 });
  expect(Object.keys(result.staged)).toHaveLength(1);
  expect(JSON.parse(Object.values(result.files)[0]).report.results.violations).toHaveLength(1);
  expect(Object.values(result.staged)[0].report.results.violations).toEqual([]);
});

for (const failure of ['none', 'prior', 'merged']) {
  test(`rescan preserves original disk failures and merged reviews before replacement: ${failure}`, async ({ page }) => {
    await load(page);
    for (const file of ['workflow.js', 'features.js']) await page.addScriptTag({ path: path.resolve(file) });
    const result = await page.evaluate(async failure => {
      const filename = `access-lens-${'e'.repeat(64)}.json`;
      const original = {
        schemaVersion: '2.0', privacy: { mode: 'content-free' }, pagePath: location.origin + '/case',
        pageState: { key: '0'.repeat(64) }, scannedAt: '2026-11-19T12:00:00Z',
        completeness: { status: 'completed-for-scope' },
        manualChecks: { keyboard: { status: 'fail', checkedAt: '2026-11-19T14:00:00Z' } },
        results: { violations: [{ id: 'image-alt', tags: ['wcag111'], nodes: [{ target: ['img:nth-child(1)'] }] }], incomplete: [], passes: [], inapplicable: [] }
      };
      let disk = structuredClone(original), writes = 0;
      const incoming = { ...structuredClone(original), schemaVersion: '2.1', scannedAt: '2026-11-19T13:00:00Z',
        results: { violations: [], incomplete: [], passes: [], inapplicable: [] },
        manualChecks: { keyboard: { status: 'pass', checkedAt: '2026-11-19T13:30:00Z' } } };
      const read = accessLensSettings.read.bind(accessLensSettings);
      accessLensSettings.read = key => key ? read(key) : Promise.resolve({ directory: {
        queryPermission: async () => 'granted', getFileHandle: async () => ({
          getFile: async () => new File([JSON.stringify(disk)], filename),
          createWritable: async () => ({ write: async data => { disk = JSON.parse(data); writes++; }, close: async () => {}, abort: async () => {} })
        })
      } });
      const retain = accessLensSettings.retainSnapshot.bind(accessLensSettings);
      accessLensSettings.retainSnapshot = async (report, name) => {
        if (failure === 'prior' && report.scannedAt === original.scannedAt || failure === 'merged' && report.scannedAt === incoming.scannedAt && report.manualChecks.keyboard.status === 'fail') throw accessLensSettings.failure('HISTORY_FULL');
        return retain(report, name);
      };
      const save = await accessLensSettings.saveRecoverable(incoming, false, filename);
      return { save, disk, writes, snapshots: Object.values(await accessLensSettings.retainedSnapshots()).map(entry => entry.report), pending: await accessLensSettings.pending() };
    }, failure);
    if (failure === 'none') {
      expect(result.save.saved).toBe(true);
      expect(result.disk.results.violations).toEqual([]);
      expect(result.disk.manualChecks.keyboard.status).toBe('fail');
      expect(result.snapshots.some(report => report.results.violations.some(rule => rule.id === 'image-alt'))).toBe(true);
      expect(result.snapshots.some(report => report.scannedAt === '2026-11-19T13:00:00Z' && report.manualChecks.keyboard.status === 'fail')).toBe(true);
      expect(result.snapshots.some(report => report.manualChecks.keyboard.status === 'pass')).toBe(true);
      expect(result.writes).toBe(1);
    } else {
      expect(result.save).toMatchObject({ queued: true, code: 'HISTORY_FULL' });
      expect(result.disk.results.violations[0].id).toBe('image-alt');
      expect(result.disk.scannedAt).toBe('2026-11-19T12:00:00Z');
      expect(result.writes).toBe(0);
      expect(Object.keys(result.pending)).toHaveLength(1);
    }
  });
}

test('download-only scans, skipped auto saves and review changes retain replayable historical evidence', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'f'.repeat(64)}.json`;
    const first = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scanId: crypto.randomUUID(),
      scannedAt: '2026-11-19T12:00:00Z', results: { violations: [{ id: 'image-alt', nodes: [{ target: ['img:nth-child(1)'] }] }] }, manualChecks: {} };
    const automatic = await accessLensSettings.saveRecoverable(first, true, filename);
    const download = await accessLensSettings.saveRecoverable(first, false, filename);
    const reviewed = { ...first, manualChecks: { '1.1.1': { status: 'fail', checkedAt: '2026-11-19T12:01:00Z' } } };
    const decision = await accessLensSettings.saveRecoverable(reviewed, false, filename, undefined, false, true);
    const next = { ...first, scanId: crypto.randomUUID(), scannedAt: '2026-11-19T13:00:00Z', results: { violations: [] },
      manualChecks: { '1.1.1': { status: 'pass', checkedAt: '2026-11-19T13:01:00Z' } } };
    await accessLensSettings.saveRecoverable(next, true, filename);
    await accessLensSettings.saveRecoverable(next, false, filename);
    const bundle = await accessLensSettings.preservedEvidence();
    return { automatic, download, decision, bundle, pending: await accessLensSettings.pending() };
  });
  expect(result.automatic).toEqual({ skipped: true });
  expect(result.download).toEqual({ download: true });
  expect(result.decision).toEqual({ skipped: true });
  expect(result.pending).toEqual({});
  expect(result.bundle.snapshots).toHaveLength(3);
  expect(new Set(result.bundle.events.map(event => event.eventId)).size).toBe(result.bundle.events.length);
  const decisions = result.bundle.events.filter(event => event.eventType === 'manual-review-evidence-preserved');
  expect(decisions.map(event => event.status).sort()).toEqual(['fail', 'pass']);
  expect(new Set(result.bundle.events.map(event => event.scanId)).size).toBe(2);
  expect(result.bundle.events.some(event => event.outcomes?.violations === 1)).toBe(true);
  expect(result.bundle.events.some(event => event.outcomes?.violations === 0)).toBe(true);
  const ids = result.bundle.events.map(event => event.eventId).sort();
  await page.reload();
  for (const file of ['save-settings.js', 'recovery.js']) await page.addScriptTag({ path: path.resolve(file) });
  expect(await page.evaluate(async () => (await accessLensSettings.preservedEvidence()).events.map(event => event.eventId).sort())).toEqual(ids);
});

test('preservation failure prevents download authorization and leaves prior download history intact', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'a'.repeat(64)}.json`;
    const report = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z' };
    await accessLensSettings.saveRecoverable(report, false, filename);
    const entries = await accessLensSettings.retainedSnapshots();
    entries[Object.keys(entries)[0]].bytes = 20 * 1024 * 1024;
    await accessLensSettings.write({ entries }, 'evidence-snapshots');
    const response = await accessLensSettings.saveRecoverable({ ...report, scannedAt: '2026-11-19T13:00:00Z' }, false, filename);
    return { response, bundle: await accessLensSettings.preservedEvidence() };
  });
  expect(result.response.code).toBe('HISTORY_FULL');
  expect(result.response.download).toBeUndefined();
  expect(result.bundle.snapshots).toHaveLength(1);
  expect(result.bundle.snapshots[0].report.scannedAt).toBe('2026-11-19T12:00:00Z');
});

test('download-only review decisions restore after reload without opt-in comparison history', async ({ page }) => {
  await load(page);
  await page.addScriptTag({ path: path.resolve('workflow.js') });
  const filename = `access-lens-${'b'.repeat(64)}.json`;
  await page.evaluate(async filename => {
    const report = { schemaVersion: '2.1', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z',
      manualChecks: { keyboard: { status: 'fail', checkedAt: '2026-11-19T12:01:00Z' } } };
    await accessLensSettings.saveRecoverable(report, false, filename, undefined, false, true);
    report.manualChecks.keyboard = { status: 'pass', checkedAt: '2026-11-19T12:02:00Z' };
    await accessLensSettings.saveRecoverable(report, false, filename, undefined, false, true);
  }, filename);
  await page.reload();
  for (const file of ['workflow.js', 'save-settings.js', 'recovery.js']) await page.addScriptTag({ path: path.resolve(file) });
  const restored = await page.evaluate(filename => accessLensSettings.history(filename), filename);
  expect(restored.checklist.keyboard).toEqual({ status: 'pass', checkedAt: '2026-11-19T12:02:00.000Z' });
  expect(restored.baseline).toBeUndefined();
  expect(await page.evaluate(async () => Object.keys(await accessLensSettings.retainedSnapshots()).length)).toBe(2);
});

test('legacy staging and pending copies normalize without losing failures, decisions or source ID linkage', async ({ page }) => {
  await load(page);
  const result = await page.evaluate(async () => {
    const filename = `access-lens-${'c'.repeat(64)}.json`;
    const report = { schemaVersion: '2.0', privacy: { mode: 'alternative-text-included', alternativeTextIncluded: true },
      pagePath: 'https://PRIVATE_USER:PRIVATE_PASSWORD@example.test/cases/123?token=PRIVATE_QUERY#PRIVATE_FRAGMENT', scannedAt: '2026-11-19T12:00:00Z',
      results: { violations: [{ id: 'image-alt', nodes: [{ target: ['img:nth-child(1)'], alternativeText: 'PRIVATE_ALT' }] }] },
      manualChecks: { '1.1.1': { status: 'fail', checkedAt: '2026-11-19T12:01:00Z' } } };
    const original = JSON.stringify(report);
    const oldId = 'd'.repeat(64);
    await accessLensSettings.write({ entries: { [oldId]: { id: oldId, filename, report, bytes: original.length * 2, recordedAt: '2026-11-19T12:02:00Z' } } }, 'evidence-snapshots');
    await accessLensSettings.write({ entries: { [filename]: { token: 'legacy', report, bytes: original.length * 2 } } }, 'pending-saves');
    const bundle = await accessLensSettings.preservedEvidence();
    const pending = await accessLensSettings.pending();
    return { bundle, pending, storedSnapshots: await accessLensSettings.read('evidence-snapshots'), oldId, originalUnchanged: JSON.stringify(report) === original };
  });
  expect(result.originalUnchanged).toBe(true);
  const snapshot = result.bundle.snapshots[0];
  expect(snapshot.sourceSnapshotIds).toContain(result.oldId);
  expect(snapshot.report.schemaVersion).toBe('2.0');
  expect(snapshot.report.privacy.legacyAlternativeTextRemoved).toBe(true);
  expect(snapshot.report.results.violations[0].id).toBe('image-alt');
  expect(snapshot.report.manualChecks['1.1.1'].status).toBe('fail');
  expect(snapshot.report.scannedAt).toBe('2026-11-19T12:00:00Z');
  expect(snapshot.report.pagePath).toBe('https://example.test/cases/123');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

for (const field of ['html', 'text', 'sourceMetadata']) {
  test(`raw legacy ${field} is rejected without modifying its existing staging record`, async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async field => {
      const filename = `access-lens-${'e'.repeat(64)}.json`;
      const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, scannedAt: '2026-11-19T12:00:00Z', results: { violations: [{ id: 'image-alt', nodes: [{ target: ['img:nth-child(1)'], [field]: 'PRIVATE_RAW' }] }] } };
      const original = { entries: { legacy: { id: 'legacy', filename, report, bytes: 1 } } };
      await accessLensSettings.write(original, 'evidence-snapshots');
      let error;
      try { await accessLensSettings.preservedEvidence(); } catch (caught) { error = accessLensSettings.saveError(caught); }
      return { error, unchanged: JSON.stringify(await accessLensSettings.read('evidence-snapshots')) === JSON.stringify(original) };
    }, field);
    expect(result.error.code).toBe('UNSAFE_EVIDENCE');
    expect(result.unchanged).toBe(true);
    expect(JSON.stringify(result.error)).not.toContain('PRIVATE_RAW');
  });
}
