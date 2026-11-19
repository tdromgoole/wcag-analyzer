globalThis.accessLensAutoMode = {
  files: ['vendor/axe.min.js', 'inspection.js', 'checks.js', 'export.js', 'workflow.js', 'features.js', 'contrast.js', 'auto-scan.js'],
  pattern(address) {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter an http or https website address.');
    return `${url.protocol}//${url.hostname}/*`;
  },
  async list() { return (await chrome.scripting.getRegisteredContentScripts()).filter(script => script.id.startsWith('access-lens-auto-')); },
  async enabled(address) {
    const pattern = this.pattern(address);
    return (await this.list()).some(script => script.matches.includes(pattern)) && await chrome.permissions.contains({ origins: [pattern] });
  },
  async remember(pattern, enabled) {
    await accessLensSettings.mutate('browsing-sites', value => {
      const sites = new Set(value?.sites || []);
      if (enabled) sites.add(pattern); else sites.delete(pattern);
      return { sites: [...sites] };
    });
  },
  async register(pattern) {
    const operation = (this.registration || Promise.resolve()).catch(() => {}).then(async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pattern));
      const id = 'access-lens-auto-' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (!(await this.list()).some(script => script.id === id)) await chrome.scripting.registerContentScripts([{
        id, matches: [pattern], js: this.files, runAt: 'document_idle', allFrames: false, persistAcrossSessions: true
      }]);
      else await chrome.scripting.updateContentScripts([{ id, js: this.files }]);
    });
    this.registration = operation;
    try { await operation; } finally { if (this.registration === operation) delete this.registration; }
  },
  async restore() {
    const saved = await accessLensSettings.read('browsing-sites');
    // Older versions kept the only copy in Chrome's script registry. Recover
    // their exact-site grants too, which this extension requests for browsing scans.
    if (!Array.isArray(saved.sites)) {
      const origins = (await chrome.permissions.getAll()).origins || [];
      const sites = new Set((await this.list()).flatMap(script => script.matches));
      for (const origin of origins) {
        try { if (this.pattern(origin) === origin && !origin.includes('*://') && !new URL(origin).hostname.includes('*')) sites.add(origin); } catch {}
      }
      await accessLensSettings.mutate('browsing-sites', value => ({ sites: [...new Set([...(value?.sites || []), ...sites])] }));
    }
    const failures = [];
    for (const pattern of (await accessLensSettings.read('browsing-sites')).sites || []) {
      try {
        if (!await chrome.permissions.contains({ origins: [pattern] })) throw new Error(`Site access needs to be restored for ${pattern}`);
        await this.register(pattern);
      } catch (error) { failures.push(error.message); }
    }
    if (failures.length) throw new Error(failures.join(' '));
  },
  async start(pattern) {
    const settings = await accessLensSettings.read();
    if (!settings.directory || await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Choose a save folder and restore its write access first.');
    if (!await chrome.permissions.contains({ origins: [pattern] })) throw new Error('Site access was not granted. Enable this site again to restore access.');
    await this.remember(pattern, true);
    await this.register(pattern);
    // Include matching pages that are already open, without displaying the inspector.
    for (const tab of await chrome.tabs.query({ url: [pattern] })) {
      if (tab.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: this.files }).catch(() => {});
    }
  },
  async stop(script) {
    for (const pattern of script.matches) await this.remember(pattern, false);
    await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
    const tabs = await chrome.tabs.query({ url: script.matches });
    for (const tab of tabs) {
      if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'access-lens-auto-stop' }).catch(() => {});
    }
    if (chrome.action) for (const tab of tabs) {
      if (tab.id) await chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {});
    }
    await chrome.permissions.remove({ origins: script.matches });
  },
  async retry() {
    await this.restore();
    for (const script of await this.list()) for (const tab of await chrome.tabs.query({ url: script.matches })) {
      if (tab.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: this.files }).catch(() => {});
    }
  }
};

