const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

test('settings opt in to keyboard testing, stop on disable, and delete the recovery transcript', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent(fs.readFileSync(path.resolve('options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, ''));
  await page.evaluate(() => {
    window.preferences = { autoSave: false, staleDays: 14 };
    window.storedTranscript = { run: { status: 'completed' } };
    window.messages = [];
    window.accessLensSettings = {
      read: async key => key === 'keyboard-last-run' ? storedTranscript : preferences,
      write: async (value, key) => { if (key === 'keyboard-last-run') storedTranscript = value; else preferences = value; }
    };
    window.chrome = { permissions: { contains: async () => true }, runtime: { sendMessage: async message => { messages.push(message.type); return { ok: true }; } } };
  });
  await page.addScriptTag({ path: path.resolve('options.js') });
  await expect(page.locator('#keyboardPermissionStatus')).toHaveText('Keyboard testing is disabled.');
  await page.locator('#enableKeyboard').click();
  await expect(page.locator('#keyboardPermissionStatus')).toContainText('is enabled');
  expect(await page.evaluate(() => preferences)).toMatchObject({ keyboardTestingEnabled: true, staleDays: 14 });
  await page.locator('#disableKeyboard').click();
  await expect(page.locator('#keyboardPermissionStatus')).toHaveText('Keyboard testing is disabled.');
  expect(await page.evaluate(() => messages)).toContain('access-lens-keyboard-disable');
  await page.locator('#deleteKeyboard').click();
  expect(await page.evaluate(() => storedTranscript)).toEqual({});
});

test('real keyboard traversal records forward/reverse focus, flags, and interrupted transcripts', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.setContent('<main><button id="PRIVATE_ID">PRIVATE_TEXT</button><input value="PRIVATE_VALUE"><a href="/">Link</a></main>');
  const driver = await page.context().newCDPSession(page);
  await page.exposeFunction('pressRealTab', async reverse => {
    const params = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: reverse ? 8 : 0 };
    await driver.send('Input.dispatchKeyEvent', { ...params, type: 'rawKeyDown' });
    await driver.send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
  });
  await page.addScriptTag({ path: path.resolve('keyboard.js') });
  const result = await page.evaluate(async () => {
    document.documentElement.tabIndex = -1; document.documentElement.focus();
    const run = { startedAt: new Date().toISOString() };
    await accessLensKeyboard.run({ run, steps: 2, delay: 0, signal: new AbortController().signal,
      press: pressRealTab, sample: () => accessLensKeyboard.sample(), checkpoint: async () => {} });
    const controller = new AbortController();
    const stopped = {};
    // The preceding reverse traversal can leave focus in browser chrome.
    // A new run explicitly focuses the document before its first sample.
    document.documentElement.focus();
    await accessLensKeyboard.run({ run: stopped, steps: 10, delay: 0, signal: controller.signal,
      press: pressRealTab, sample: () => accessLensKeyboard.sample(), checkpoint: async current => { if (current.entries.length === 2) controller.abort(); } });
    return { run, stopped };
  });
  expect(result.run.entries.map(entry => entry.key)).toEqual(['Start','Tab','Tab','Shift+Tab','Shift+Tab']);
  expect(result.run.entries[1].target[0]).toContain('button:nth-child(1)');
  expect(result.run.entries[2].target[0]).toContain('input:nth-child(2)');
  expect(result.run.entries[3].target).toEqual(result.run.entries[1].target);
  expect(result.run.reviewRequired).toBe(true);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  expect(result.stopped.status).toBe('interrupted');
  expect(result.stopped.reason).toBe('stopped-by-user');
  expect(result.stopped.entries).toHaveLength(2);
});

test('traversal stops at frame boundaries and repeated focus is evidence rather than an automatic failure', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('keyboard.js') });
  const runs = await page.evaluate(async () => {
    const options = { steps: 3, delay: 0, signal: new AbortController().signal, press: async () => {}, checkpoint: async () => {} };
    const repeated = {}, frame = {};
    await accessLensKeyboard.run({ ...options, run: repeated, sample: async () => ({ target: ['button:nth-child(1)'], documentFocused: true, flags: [] }) });
    await accessLensKeyboard.run({ ...options, run: frame, sample: async () => ({ target: ['iframe:nth-child(1)'], documentFocused: true, flags: ['frame-requires-separate-review'] }) });
    return { repeated, frame };
  });
  expect(runs.repeated.status).toBe('completed');
  expect(runs.repeated.repeatedFocus).toHaveLength(6);
  expect(runs.repeated.reviewRequired).toBe(true);
  expect(runs.frame.status).toBe('interrupted');
  expect(runs.frame.reason).toBe('frame-boundary');
});

test('worker binds driver sessions to the initiating document and preserves partial runs on navigation', async () => {
  let granted = false, enabled = false, stored, detached = 0, navigated, onDetach;
  const commands = [];
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
    accessLensFeatures: { policy: () => ({}) },
    accessLensSettings: { read: async key => key ? stored || {} : { keyboardTestingEnabled: enabled }, write: async value => { stored = value; } },
    chrome: { permissions: { contains: async () => granted }, debugger: {
      attach: async () => {}, detach: async () => { detached++; }, sendCommand: async (...args) => commands.push(args),
      onDetach: { addListener(callback) { onDetach = callback; } }, onEvent: { addListener(callback) { navigated = callback; } }
    } }
  });
  vm.runInContext(fs.readFileSync(path.resolve('keyboard-background.js'), 'utf8'), context);
  const keyboard = context.accessLensKeyboardDriver;
  const sender = { tab: { id: 7 }, frameId: 0, documentId: 'doc1', url: 'https://example.com/' };
  const filename = 'access-lens-' + 'a'.repeat(64) + '.json';
  const message = { filename, action: 'begin' };
  expect((await keyboard.handle(message, sender)).error).toContain('Settings');
  granted = true;
  expect((await keyboard.handle(message, sender)).error).toContain('Settings');
  enabled = true;
  const { token } = await keyboard.handle(message, sender);
  try {
    expect((await keyboard.handle({ ...message, action: 'key', token }, { ...sender, documentId: 'doc2' })).error).toContain('ended');
    await keyboard.handle({ ...message, action: 'key', token, reverse: true }, sender);
    expect(commands.slice(1).map(command => command[1])).toEqual(['Input.dispatchKeyEvent','Input.dispatchKeyEvent']);
    expect(commands[1][2]).toMatchObject({ key: 'Tab', modifiers: 8, type: 'rawKeyDown' });
    await keyboard.handle({ ...message, action: 'checkpoint', token, run: { id: 'recorded-run', status: 'running', entries: [{ key: 'Tab', target: ['button:nth-child(1)'] }] } }, sender);
    navigated({ tabId: 7 }, 'Page.frameNavigated', { frame: {} });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(stored.run.status).toBe('interrupted');
    expect(stored.run.reason).toBe('page-navigated');
    expect(detached).toBe(1);
    expect((await keyboard.handle({ ...message, action: 'latest' }, sender)).run.entries).toHaveLength(1);
    expect((await keyboard.handle({ ...message, action: 'assessment', runId: 'old-run', status: 'pass' }, sender)).error).toContain('no longer');
    await keyboard.handle({ ...message, action: 'assessment', runId: 'recorded-run', status: 'fail' }, sender);
    expect((await keyboard.handle({ ...message, action: 'latest' }, sender)).run.assessment.status).toBe('fail');
  } finally { await keyboard.end('test-finished'); }
  // A browser/worker restart must not make a saved partial run look active.
  stored.run.status = 'running';
  expect((await keyboard.handle({ ...message, action: 'latest' }, sender)).run.reason).toBe('browser-or-worker-restarted');
  const next = await keyboard.handle(message, sender);
  await keyboard.handle({ ...message, action: 'checkpoint', token: next.token, run: { status: 'running', entries: [] } }, sender);
  onDetach({ tabId: 7 }, 'canceled_by_user');
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(stored.run.reason).toBe('debugger-canceled');
  const canceled = await keyboard.handle({ ...message, action: 'ready', token: next.token }, sender);
  expect(canceled.code).toBe('debugger-canceled');
  expect(canceled.error).toContain('banner');
});

test('unfocused startup sends no keys and preserves debugger cancellation as its stop reason', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.addScriptTag({ path: path.resolve('keyboard.js') });
  const result = await page.evaluate(async () => {
    let presses = 0;
    const options = { steps: 3, delay: 0, signal: new AbortController().signal, checkpoint: async () => {},
      press: async () => { presses++; }, sample: async () => ({ target: [], flags: [], documentFocused: false }) };
    const unfocused = {};
    await accessLensKeyboard.run({ ...options, run: unfocused });
    const canceled = {};
    await accessLensKeyboard.run({ ...options, run: canceled, sample: async () => ({ target: [], flags: [], documentFocused: true }),
      press: async () => { throw Object.assign(new Error('Disconnected'), { code: 'debugger-canceled' }); } });
    return { presses, unfocused, canceled };
  });
  expect(result.presses).toBe(0);
  expect(result.unfocused.reason).toBe('focus-left-document');
  expect(result.unfocused.entries).toHaveLength(1);
  expect(result.canceled.reason).toBe('debugger-canceled');
});

test('inspector runs real traversal and includes the transcript in exported JSON without passing manual checks', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => { document.querySelector('main').insertAdjacentHTML('beforeend', '<button>Second control</button>'); });
  const driver = await page.context().newCDPSession(page);
  let stored;
  await page.exposeFunction('keyboardBridge', async message => {
    if (message.action === 'begin') return { token: 'test-session' };
    if (message.action === 'latest') return { run: stored || null };
    if (message.action === 'checkpoint') { stored = message.run; return { ok: true }; }
    if (message.action === 'assessment') {
      stored.assessment = { status: message.status, checkedAt: new Date().toISOString(), runId: message.runId };
      return { assessment: stored.assessment };
    }
    if (message.action === 'key') {
      const params = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: message.reverse ? 8 : 0 };
      await driver.send('Input.dispatchKeyEvent', { ...params, type: 'rawKeyDown' });
      await driver.send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
    }
    return { ok: true };
  });
  await page.evaluate(() => {
    window.keyboardSavedReports = [];
    window.chrome = { runtime: { id: 'test', sendMessage: async message => {
      if (message.type === 'access-lens-keyboard') return keyboardBridge(message);
      if (message.type === 'access-lens-history') return { enabled: false };
      if (message.type === 'access-lens-policy') return {};
      if (message.type === 'access-lens-save') { keyboardSavedReports.push(structuredClone(message)); return message.automatic ? { skipped: true } : { download: true }; }
      return {};
    } } };
  });
  for (const file of [require.resolve('axe-core/axe.min.js'), ...['inspection.js','export.js','workflow.js','features.js','keyboard.js','content.js'].map(name => path.resolve(name))]) await page.addScriptTag({ path: file });
  const ui = page.locator('#access-lens-extension');
  await expect(ui.locator('#export')).toBeEnabled();
  await ui.locator('#viewSelect').selectOption('Keyboard test');
  await ui.locator('#keyboardSteps').fill('2');
  await ui.locator('#runKeyboard').click();
  await expect(ui.locator('#keyboardReady')).toContainText('Leave it open');
  await expect(ui.locator('#keyboardTranscript li')).toHaveCount(0);
  await ui.locator('#beginKeyboardTraversal').click();
  await expect(ui.locator('#keyboardSummary')).toContainText('focus moved outside the webpage');
  await expect(ui.locator('#keyboardTranscript li')).toHaveCount(5);
  await expect(ui.locator('.keyboard-step')).toHaveCount(2);
  await expect(ui.locator('.keyboard-segment')).toHaveCount(1);
  await expect(ui.locator('.keyboard-step').first()).toHaveText('1');
  await ui.locator('.keyboard-step[data-step="2"]').click();
  await expect(ui.locator('[data-keyboard-step="2"]')).toBeFocused();
  await expect(ui.locator('.highlight')).toHaveCount(1);
  const oldLine = await ui.locator('.keyboard-segment').getAttribute('y1');
  await page.locator('main').evaluate(el => el.style.paddingTop = '40px');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(() => ui.locator('.keyboard-segment').getAttribute('y1')).not.toBe(oldLine);
  await ui.locator('#keyboardPathDirection').selectOption('reverse');
  await expect(ui.locator('.keyboard-segment[stroke-dasharray]')).toHaveCount(1);
  await ui.locator('#keyboardPath').uncheck();
  await expect(ui.locator('.keyboard-step')).toHaveCount(0);
  await ui.locator('#keyboardPath').check();
  await ui.locator('#keyboardPathDirection').selectOption('forward');
  await ui.locator('#keyboardAssessment').selectOption('fail');
  await expect(ui.locator('#keyboardAssessmentStatus')).toContainText('Assessment: fail');
  expect(await page.evaluate(() => keyboardSavedReports.at(-1).metadata.manualFailures)).toBe(1);
  await page.screenshot({ path: 'test-results/keyboard-test.png' });
  await expect(ui.locator('#scan')).toBeEnabled();
  const pending = page.waitForEvent('download'); await ui.locator('#export').click();
  let data = ''; for await (const chunk of await (await pending).createReadStream()) data += chunk;
  const report = JSON.parse(data);
  expect(report.keyboardTest.entries[1].target[0]).toContain('button:nth-child(3)');
  expect(report.keyboardTest.reviewRequired).toBe(true);
  expect(report.keyboardTest.assessment.status).toBe('fail');
  expect(report.wcagCoverage.keyboardEvidence.reviewStatus).toBe('fail');
  expect(report.wcagCoverage.keyboardEvidence.recordedSteps).toBe(4);
  expect(report.manualChecks).toEqual({});
  await ui.locator('#scan').click(); await expect(ui.locator('#scan')).toBeEnabled();
  await expect(ui.locator('#keyboardSummary')).toContainText('Earlier scan');
  await expect(ui.locator('#keyboardAssessment')).toHaveValue('fail');
  await ui.locator('#keyboardAssessment').selectOption('pass');
  await expect(ui.locator('#keyboardAssessmentStatus')).toContainText('Assessment: pass');
  await ui.locator('#keyboardSteps').fill('2');
  await ui.locator('#runKeyboard').click();
  await expect(ui.locator('#stopKeyboard')).toBeVisible();
  await ui.locator('#beginKeyboardTraversal').click();
  await expect(ui.locator('#stopKeyboard')).toHaveCount(0);
  await expect(ui.locator('#keyboardAssessment')).toHaveValue('not-reviewed');
});
