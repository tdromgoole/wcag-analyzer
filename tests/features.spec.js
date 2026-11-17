const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
async function scripts(page, names) { for (const name of names) await page.addScriptTag({ path: path.resolve(name) }); }

test('failed content-free saves survive reload, coalesce to latest, and recover', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await scripts(page, ['save-settings.js', 'features.js', 'recovery.js']);
  const filename = 'access-lens-' + 'c'.repeat(64) + '.json';
  const queued = await page.evaluate(async filename => {
    const read = accessLensSettings.read.bind(accessLensSettings);
    accessLensSettings.read = key => key ? read(key) : Promise.resolve({ autoSave: true, directory: {} });
    accessLensSettings.save = async () => { throw new DOMException('PRIVATE_LOCAL_PATH', 'NotAllowedError'); };
    const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, pagePath: 'https://example.com/a', scannedAt: '2026-01-01T00:00:00Z' };
    const first = await accessLensSettings.saveRecoverable(report, true, filename);
    report.scannedAt = '2026-01-02T00:00:00Z';
    await accessLensSettings.saveRecoverable(report, true, filename);
    return { first, entries: Object.values(await accessLensSettings.pending()) };
  }, filename);
  expect(queued.first).toMatchObject({ queued: true, code: 'NotAllowedError' });
  expect(JSON.stringify(queued)).not.toContain('PRIVATE_LOCAL_PATH');
  expect(queued.entries).toHaveLength(1);
  expect(queued.entries[0].report.scannedAt).toBe('2026-01-02T00:00:00Z');
  await page.reload(); await scripts(page, ['save-settings.js', 'features.js', 'recovery.js']);
  const result = await page.evaluate(async () => {
    window.writes = [];
    accessLensSettings.save = async report => { writes.push(report.scannedAt); return { saved: true }; };
    const flushed = await accessLensSettings.flushQueue(true);
    const filename = 'access-lens-' + 'c'.repeat(64) + '.json';
    await accessLensSettings.enqueue({ schemaVersion: '2.0', privacy: { mode: 'content-free' }, pagePath: 'https://example.com/a', scannedAt: '2026-01-01T00:00:00Z' }, filename);
    const suppressed = await accessLensSettings.flushOne(filename);
    return { flushed, suppressed, writes, pending: await accessLensSettings.pending() };
  });
  expect(result.flushed).toMatchObject({ saved: 1, remaining: 0 });
  expect(result.writes).toEqual(['2026-01-02T00:00:00Z']);
  expect(result.pending).toEqual({});
  expect(result.suppressed.superseded).toBe(true);
});

test('queue bounds, deletion, exclusions, pause, and concurrent updates preserve reports', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await scripts(page, ['save-settings.js', 'features.js', 'recovery.js']);
  const result = await page.evaluate(async () => {
    const filename = 'access-lens-' + 'd'.repeat(64) + '.json';
    const report = { schemaVersion: '2.0', privacy: { mode: 'content-free' }, pagePath: 'https://example.com/private/a', scannedAt: '2026-01-01T00:00:00Z' };
    await accessLensSettings.enqueue(report, filename);
    await accessLensSettings.write({ exclusions: ['/private/*'], paused: true });
    const paused = await accessLensSettings.flushQueue();
    const excluded = await accessLensSettings.flushOne(filename);
    await accessLensSettings.write({});
    let finish, started;
    const waiting = new Promise(resolve => { started = resolve; });
    accessLensSettings.save = async () => { started(); await new Promise(resolve => { finish = resolve; }); return { saved: true }; };
    const inFlight = accessLensSettings.flushOne(filename); await waiting;
    await accessLensSettings.enqueue({ ...report, scannedAt: '2026-01-02T00:00:00Z' }, filename);
    finish(); await inFlight;
    const remaining = (await accessLensSettings.pending())[filename].report.scannedAt;
    const entries = {};
    for (let i = 0; i < 100; i++) entries[`access-lens-${i.toString(16).padStart(64, '0')}.json`] = { bytes: 1 };
    await accessLensSettings.write({ entries }, 'pending-saves');
    let full;
    try { await accessLensSettings.enqueue(report, filename); } catch (error) { full = error.code; }
    const count = Object.keys(await accessLensSettings.pending()).length;
    await accessLensSettings.deletePending();
    const empty = await accessLensSettings.pending();
    // Browsing-mode saves must queue even if the selected folder was removed.
    accessLensSettings.save = async () => ({ download: true });
    const missingFolder = await accessLensSettings.saveRecoverable(report, false, filename, undefined, true);
    return { paused, excluded, remaining, full, count, empty, missingFolder };
  });
  expect(result.paused).toEqual({ paused: true });
  expect(result.excluded).toMatchObject({ queued: true, code: 'EXCLUDED' });
  expect(result.remaining).toBe('2026-01-02T00:00:00Z');
  expect(result).toMatchObject({ full: 'QUEUE_FULL', count: 100, empty: {} });
  expect(result.missingFolder).toMatchObject({ queued: true, code: 'NO_FOLDER' });
});

test('route identity uses only selected values and keeps them out of report paths', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await scripts(page, ['export.js', 'workflow.js', 'features.js']);
  const result = await page.evaluate(async () => {
    accessLensIdentity = { queryKeys: ['view'], hashRoutes: true };
    const names = await Promise.all([
      'https://example.com/app?view=PRIVATE_A&token=SECRET#route-a',
      'https://example.com/app?token=DIFFERENT&view=PRIVATE_A#route-a',
      'https://example.com/app?view=PRIVATE_B#route-a',
      'https://example.com/app?view=PRIVATE_A#route-b'
    ].map(address => accessLensFilename(address)));
    const map = await accessLensWorkflow.sitemap('http://127.0.0.1:4178/app?view=PRIVATE_A#route-a', false);
    return { names, map: { site: map.site, nodes: map.nodes, current: map.current }, policy: accessLensFeatures.policy({ exclusions: ['/private/*'] }, 'https://example.com/private/a') };
  });
  expect(result.names[0]).toBe(result.names[1]);
  expect(new Set(result.names).size).toBe(3);
  expect(JSON.stringify(result.map)).not.toMatch(/PRIVATE|route-a/);
  expect(result.policy.excluded).toBe(true);
});

test('coverage and site-wide aggregation flag stale, limited, failed, and repeated issues', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await scripts(page, ['features.js']);
  const result = await page.evaluate(() => {
    const old = new Date(Date.now() - 8 * 86400000).toISOString(), now = new Date().toISOString();
    const state = { scannedAt: old, limited: true, rules: { 'button-name': 2 }, patterns: [{ rule: 'button-name', key: 'a'.repeat(64) }] };
    const map = { nodes: {
      a: { id: 'a', linked: true, states: { first: state }, attempts: { first: { status: 'queued', at: now } } },
      b: { id: 'b', linked: true, states: { first: { ...state, scannedAt: now, limited: false } }, attempts: { first: { status: 'failed', at: now } } },
      c: { id: 'c', linked: true, states: {}, attempts: { first: { status: 'scanning', at: old } } }
    } };
    return accessLensFeatures.siteReport(map, 7);
  });
  expect(result.coverage).toMatchObject({ discovered: 3, scanned: 2, unscanned: 1, failed: 1, queued: 1, interrupted: 1, stale: 1, limited: 1 });
  expect(result.rules[0]).toMatchObject({ id: 'button-name', occurrences: 4, pages: ['a', 'b'] });
  expect(result.possibleSharedFixes).toHaveLength(1);
});

test('completeness identifies excluded frames and hidden tab panels without their content', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="tabpanel" hidden>PRIVATE_PANEL</div><iframe srcdoc="PRIVATE_FRAME"></iframe><iframe sandbox srcdoc="PRIVATE_SANDBOX"></iframe>');
    const host = document.createElement('div'); host.attachShadow({ mode: 'closed' }).innerHTML = '<p>PRIVATE_SHADOW</p>'; document.body.append(host);
  });
  await scripts(page, ['features.js']);
  const result = await page.evaluate(() => accessLensFeatures.completeness());
  expect(result).toMatchObject({ status: 'limited', excludedFrames: 2, hiddenTabPanels: 1, closedShadowRoots: 'not-detectable' });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

test('settings save pause, route identity, exclusions, and staleness controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(fs.readFileSync(path.resolve('options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
  await page.evaluate(() => {
    window.preferences = {};
    window.accessLensSettings = { read: async () => preferences, write: async value => { preferences = value; } };
  });
  await scripts(page, ['options.js']);
  await page.locator('#paused').check(); await page.locator('#queryKeys').fill('view, tab');
  await page.locator('#hashRoutes').check(); await page.locator('#exclusions').fill('/private/*\n/logout'); await page.locator('#staleDays').fill('3');
  await page.locator('#savePolicy').click();
  await expect(page.locator('#status')).toHaveText('Settings saved.');
  expect(await page.evaluate(() => preferences)).toMatchObject({ paused: true, queryKeys: ['view', 'tab'], hashRoutes: true, exclusions: ['/private/*', '/logout'], staleDays: 3 });
});
