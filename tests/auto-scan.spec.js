const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

async function inject(page, enabled = true) {
  await page.evaluate(on => {
    window.savedScans = [];
    window.autoListeners = [];
    window.chrome = { runtime: {
      sendMessage: async message => {
        if (message.type === 'access-lens-auto-check') return { enabled: on };
        if (message.type === 'access-lens-auto-result') { savedScans.push(message); return { saved: true }; }
        return { ok: true };
      }, onMessage: { addListener: listener => autoListeners.push(listener), removeListener: listener => { autoListeners = autoListeners.filter(item => item !== listener); } }
    } };
  }, enabled);
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js', 'checks.js', 'export.js', 'workflow.js', 'features.js', 'auto-scan.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
}

test('browsing scans save without a panel on page loads, SPA routes, and state changes', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await inject(page);
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(1);
  await expect(page.locator('#access-lens-extension')).toHaveCount(0);
  const initial = await page.evaluate(() => savedScans[0]);
  expect(initial.report.privacy.mode).toBe('alternative-text-included');
  expect(initial.report.supplementalChecks.checks).toHaveLength(7);
  expect(JSON.stringify(initial)).not.toContain('Test page');
  expect(initial.report.page).toBeUndefined();
  expect(initial.report.pagePath).toBe('http://127.0.0.1:4178/');
  expect(initial.sitemap.site).toMatch(/^[a-f0-9]{64}$/);
  await page.evaluate(() => history.pushState(null, '', '/next-page?SECRET_TOKEN'));
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(2);
  expect(await page.evaluate(() => savedScans[1].filename)).not.toBe(initial.filename);
  expect(await page.evaluate(() => savedScans[1].report.pagePath)).toBe('http://127.0.0.1:4178/next-page');
  await page.evaluate(() => {
    const button = document.querySelector('button'); button.setAttribute('aria-expanded', 'true');
  });
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(3);
  expect(await page.evaluate(() => savedScans[2].filename)).not.toBe(await page.evaluate(() => savedScans[1].filename));
  expect(JSON.stringify(await page.evaluate(() => savedScans))).not.toContain('SECRET_TOKEN');
  await page.evaluate(() => {
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.textContent = 'PRIVATE_DIALOG_CONTENT'; document.body.append(dialog);
  });
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(4);
  expect(await page.evaluate(() => savedScans[3].report.pageState.dialogs)).toBe(1);
  expect(JSON.stringify(await page.evaluate(() => savedScans[3]))).not.toContain('PRIVATE_DIALOG_CONTENT');
  await page.evaluate(() => autoListeners.forEach(listener => listener({ type: 'access-lens-auto-stop' })));
  expect(await page.evaluate(() => Boolean(window.__accessLensAutoScan))).toBe(false);
  await page.goto('http://127.0.0.1:4178/another-page');
  await inject(page);
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(1);
  expect(await page.evaluate(() => savedScans[0].filename)).not.toBe(initial.filename);
});

test('disabled browsing mode stops before scanning or sending a report', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178'); await inject(page, false);
  await expect.poll(() => page.evaluate(() => Boolean(window.__accessLensAutoScan))).toBe(false);
  expect(await page.evaluate(() => savedScans.length)).toBe(0);
});

test('browsing mode separates ARIA tab panels and native modal states and reports iframe gaps', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="tablist"><button role="tab" aria-selected="true">PRIVATE_TAB_A</button><button role="tab" aria-selected="false">PRIVATE_TAB_B</button></div><section role="tabpanel">PRIVATE_PANEL_A</section><section role="tabpanel" hidden>PRIVATE_PANEL_B</section><iframe title="PRIVATE_FRAME" srcdoc="PRIVATE_FRAME_CONTENT"></iframe><dialog aria-label="PRIVATE_DIALOG">PRIVATE_MODAL_CONTENT</dialog>');
  });
  await inject(page);
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(1);
  const initial = await page.evaluate(() => savedScans[0]);
  expect(initial.report.completeness).toMatchObject({ status: 'limited', excludedFrames: 1, hiddenTabPanels: 1 });
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role=tab]'), panels = document.querySelectorAll('[role=tabpanel]');
    tabs[0].setAttribute('aria-selected', 'false'); tabs[1].setAttribute('aria-selected', 'true');
    panels[0].hidden = true; panels[1].hidden = false;
  });
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(2);
  expect(await page.evaluate(() => savedScans[1].filename)).not.toBe(initial.filename);
  await page.locator('dialog').evaluate(dialog => dialog.showModal());
  await expect.poll(() => page.evaluate(() => savedScans.length)).toBe(3);
  expect(await page.evaluate(() => savedScans[2].report.pageState.dialogs)).toBe(1);
  expect(JSON.stringify(await page.evaluate(() => savedScans.map(scan => scan.report)))).not.toContain('PRIVATE_');
});

test('site registration uses only the granted host and disabling stops existing scripts', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => {
    window.registrations = []; window.injected = []; window.stopped = [];
    window.sitePreferences = {};
    window.accessLensSettings = {
      read: async key => key ? sitePreferences[key] || {} : ({ directory: { queryPermission: async () => 'granted' } }),
      mutate: async (key, transform) => { sitePreferences[key] = transform(sitePreferences[key]); }
    };
    window.chrome = {
      scripting: {
        getRegisteredContentScripts: async () => registrations,
        registerContentScripts: async scripts => registrations.push(...scripts),
        updateContentScripts: async () => {},
        unregisterContentScripts: async ({ ids }) => { registrations = registrations.filter(script => !ids.includes(script.id)); },
        executeScript: async options => injected.push(options)
      },
      permissions: { contains: async () => true, getAll: async () => ({ origins: [] }), remove: async () => true },
      tabs: { query: async () => [{ id: 1 }], sendMessage: async (tab, message) => stopped.push(message) }
    };
  });
  await page.addScriptTag({ path: path.resolve('auto-mode.js') });
  const result = await page.evaluate(async () => {
    const pattern = accessLensAutoMode.pattern('https://example.com/private/path?SECRET');
    await accessLensAutoMode.start(pattern); await accessLensAutoMode.start(pattern);
    const scripts = await accessLensAutoMode.list();
    const enabled = await accessLensAutoMode.enabled('https://example.com/other');
    const other = await accessLensAutoMode.enabled('https://other.example.com/');
    // Chrome can lose dynamic registrations on an unpacked extension reload.
    registrations = [];
    await accessLensAutoMode.restore();
    const restored = await accessLensAutoMode.enabled('https://example.com/other');
    await accessLensAutoMode.stop(scripts[0]);
    await accessLensAutoMode.restore();
    return { scripts, enabled, other, restored, injected, stopped, remaining: await accessLensAutoMode.list(), preferences: sitePreferences };
  });
  expect(result.scripts).toHaveLength(1);
  expect(result.scripts[0].matches).toEqual(['https://example.com/*']);
  expect(result.scripts[0].js).not.toContain('content.js');
  expect(result).toMatchObject({ enabled: true, other: false, restored: true, remaining: [], preferences: { 'browsing-sites': { sites: [] } } });
  expect(result.stopped[0].type).toBe('access-lens-auto-stop');
  expect(JSON.stringify(result)).not.toContain('SECRET');
});

test('reload restores legacy site grants without Settings and respects disabled or revoked access', async () => {
  const preferences = {}, source = fs.readFileSync(path.resolve('auto-mode.js'), 'utf8');
  let registrations = [], allowed = true, injections = 0;
  function worker() {
    const context = vm.createContext({
      URL, TextEncoder, crypto: require('node:crypto').webcrypto,
      accessLensSettings: {
        read: async key => structuredClone(preferences[key] || {}),
        mutate: async (key, transform) => { preferences[key] = structuredClone(transform(preferences[key])); }
      },
      chrome: {
        permissions: { getAll: async () => ({ origins: ['https://example.com/*', 'https://*.other.com/*'] }), contains: async () => allowed, remove: async () => true },
        scripting: {
          getRegisteredContentScripts: async () => registrations,
          registerContentScripts: async scripts => { registrations.push(...scripts); },
          updateContentScripts: async () => {},
          unregisterContentScripts: async ({ ids }) => { registrations = registrations.filter(script => !ids.includes(script.id)); },
          executeScript: async () => { injections++; }
        },
        tabs: { query: async () => [{ id: 1 }], sendMessage: async () => {} }
      }
    });
    vm.runInContext(source, context);
    return context.accessLensAutoMode;
  }
  let mode = worker();
  await mode.retry();
  expect(registrations.map(script => script.matches[0])).toEqual(['https://example.com/*']);
  expect(injections).toBe(1);
  registrations = [];
  mode = worker();
  await mode.restore();
  expect(registrations).toHaveLength(1);
  allowed = false; registrations = [];
  const failure = await mode.restore().then(() => '', error => error.message);
  expect(failure).toContain('Site access needs to be restored');
  expect(registrations).toHaveLength(0);
  allowed = true;
  await mode.restore();
  await mode.stop(registrations[0]);
  mode = worker();
  await mode.restore();
  expect(registrations).toHaveLength(0);
  expect(preferences['browsing-sites'].sites).toEqual([]);
});

test('background saves content-free scans, updates sitemap, and reports queued folder failures', async () => {
  let folder = true; const saves = [], badges = [], maps = [];
  const context = vm.createContext({
    URL,
    importScripts() {},
    accessLensAutoMode: { enabled: async () => true, restore: async () => {} },
    accessLensWorkflow: { baseline: () => ({ issues: [] }), compare: () => null },
    accessLensFeatures: { policy: () => ({}), scanMetadata: async () => ({}) },
    accessLensSettings: {
      read: async () => ({ directory: folder }), history: async () => ({}),
      saveRecoverable: async report => { saves.push(report); return folder ? { saved: true } : { queued: true, code: 'NO_FOLDER' }; },
      sitemap: async (site, update) => maps.push(update), write: async () => {},
      failure: code => ({ code }), saveError: error => ({ error: error.code, code: error.code })
    },
    chrome: { runtime: { onMessage: { addListener() {} } }, action: {
      onClicked: { addListener() {} }, setBadgeText: async value => badges.push(value.text), setTitle: async () => {}, setBadgeBackgroundColor: async () => {}
    } }
  });
  vm.runInContext(fs.readFileSync(path.resolve('background.js'), 'utf8'), context);
  const message = { type: 'access-lens-auto-result', filename: 'test', report: { pageState: { key: 'state' }, results: { incomplete: [] }, privacy: { mode: 'content-free' } }, sitemap: { site: 'site', page: 'page', nodes: [] } };
  const sender = { url: 'https://example.com/', frameId: 0, tab: { id: 1 } };
  expect(await context.handleAuto(message, sender)).toMatchObject({ saved: true });
  expect(saves).toHaveLength(1); expect(maps).toHaveLength(1); expect(badges).toContain('OK');
  folder = false;
  expect(await context.handleAuto(message, sender)).toMatchObject({ code: 'NO_FOLDER' });
  expect(saves).toHaveLength(2); expect(badges).toContain('Q');
});

