// One explicit, bounded keyboard session. No arbitrary protocol commands accepted.
globalThis.accessLensKeyboardDriver = {
  session: null,
  async end(reason) {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.lastEnd = { token: session.token, reason };
    clearTimeout(session.timer);
    if (session.run?.status === 'running') {
      session.run.status = 'interrupted'; session.run.reason = reason;
      session.run.finishedAt = new Date().toISOString();
      await accessLensSettings.write({ filename: session.filename, run: session.run }, 'keyboard-last-run');
    }
    await chrome.debugger.detach({ tabId: session.tabId }).catch(() => {});
  },
  async handle(message, sender) {
    if (!sender.tab?.id || sender.frameId !== 0) return { error: 'Keyboard testing requires the top-level page.' };
    if (!/^access-lens-[a-f0-9]{64}\.json$/.test(message.filename || '')) return { error: 'Scan the page again before keyboard testing.' };
    if (message.action === 'latest') {
      const stored = await accessLensSettings.read('keyboard-last-run');
      if (stored.run?.status === 'running' && (!this.session || this.session.filename !== stored.filename)) {
        stored.run.status = 'interrupted'; stored.run.reason = 'browser-or-worker-restarted';
        stored.run.finishedAt = new Date().toISOString();
        await accessLensSettings.write(stored, 'keyboard-last-run');
      }
      return { run: stored.filename === message.filename ? stored.run : null };
    }
    if (message.action === 'begin') {
      if (this.session) return { error: 'A keyboard test is already running. Stop it or wait for it to finish.' };
      if (!await chrome.permissions.contains({ permissions: ['debugger'] })) return { error: 'Open Settings and enable automated keyboard testing, then return here and start the test.' };
      const settings = await accessLensSettings.read();
      if (!settings.keyboardTestingEnabled) return { error: 'Open Settings and enable automated keyboard testing first.' };
      const policy = accessLensFeatures.policy(settings, sender.url);
      if (policy.excluded) return { error: 'This page is excluded in Settings.' };
      if (this.session) return { error: 'A keyboard test is already running. Stop it or wait for it to finish.' };
      // Reserve before awaiting attach, preventing overlapping start requests.
      const session = { tabId: sender.tab.id, documentId: sender.documentId, filename: message.filename, token: crypto.randomUUID() };
      this.session = session;
      try {
        await chrome.debugger.attach({ tabId: session.tabId }, '1.3');
        await chrome.debugger.sendCommand({ tabId: session.tabId }, 'Page.enable');
        session.timer = setTimeout(() => { if (this.session === session) this.end('time-limit').catch(() => {}); }, 90000);
        return { token: session.token };
      } catch {
        if (this.session === session) await this.end('driver-unavailable');
        return { error: 'Could not start keyboard testing. Close DevTools or another debugger and try again. The browser may restrict this page.' };
      }
    }
    if (message.action === 'assessment') {
      if (!['not-reviewed','pass','fail'].includes(message.status)) return { error: 'Invalid keyboard assessment.' };
      const stored = await accessLensSettings.read('keyboard-last-run');
      if (stored.filename !== message.filename || stored.run?.id !== message.runId || stored.run.status === 'running') return { error: 'This run is no longer the latest recovery transcript. Export JSON to retain its assessment.' };
      stored.run.assessment = { status: message.status, checkedAt: new Date().toISOString(), runId: stored.run.id,
        attribution: await accessLensSettings.auditor?.() || null };
      await accessLensSettings.write(stored, 'keyboard-last-run');
      return { assessment: stored.run.assessment };
    }
    const session = this.session;
    if (!session || session.tabId !== sender.tab.id || session.documentId !== sender.documentId || session.token !== message.token || session.filename !== message.filename) {
      const reason = this.lastEnd?.token === message.token ? this.lastEnd.reason : 'driver-unavailable';
      return { error: reason === 'debugger-canceled' ? 'Keyboard test canceled from the browser debugging banner. Start a new test and leave the banner open while testing.' : 'Keyboard session ended. Start a new test.', code: reason };
    }
    if (message.action === 'ready') return { ok: true };
    if (message.action === 'key') {
      const params = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: message.reverse === true ? 8 : 0 };
      try {
        await chrome.debugger.sendCommand({ tabId: session.tabId }, 'Input.dispatchKeyEvent', { ...params, type: 'rawKeyDown' });
        await chrome.debugger.sendCommand({ tabId: session.tabId }, 'Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
        return { ok: true };
      } catch {
        await this.end('driver-unavailable');
        const code = this.lastEnd?.token === session.token ? this.lastEnd.reason : 'driver-unavailable';
        return { error: code === 'debugger-canceled' ? 'Keyboard test canceled from the browser debugging banner. Leave the banner open during testing.' : 'Keyboard driver disconnected.', code };
      }
    }
    if (message.action === 'checkpoint') {
      if (!message.run || !Array.isArray(message.run.entries) || message.run.entries.length > 201 || JSON.stringify(message.run).length > 500000) return { error: 'Keyboard transcript exceeded its limit.' };
      session.run = message.run;
      await accessLensSettings.write({ filename: session.filename, run: session.run }, 'keyboard-last-run');
      return { ok: true };
    }
    if (message.action === 'end') { await this.end('stopped-by-user'); return { ok: true }; }
    return { error: 'Unsupported keyboard action.' };
  }
};
chrome.debugger?.onDetach.addListener((source, reason) => {
  if (accessLensKeyboardDriver.session?.tabId === source.tabId) accessLensKeyboardDriver.end(reason === 'canceled_by_user' ? 'debugger-canceled' : 'driver-disconnected').catch(() => {});
});
chrome.debugger?.onEvent.addListener((source, method, params) => {
  if (accessLensKeyboardDriver.session?.tabId === source.tabId &&
    ((method === 'Page.frameNavigated' && !params.frame.parentId) || method === 'Page.navigatedWithinDocument')) {
    accessLensKeyboardDriver.end('page-navigated').catch(() => {});
  }
});
