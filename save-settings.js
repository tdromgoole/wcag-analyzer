// Persist preferences, the folder handle, and opt-in compact content-free history; never raw reports.
globalThis.accessLensSettings = {
  failure(code) { return Object.assign(new Error(code), { code }); },
  saveError(error) {
    // Never return native messages: they can include local file paths.
    const codes = {
      FOLDER_PERMISSION: 'Folder access needs to be restored. Open Settings, click Restore folder access, then retry saving.',
      NO_FOLDER: 'Choose a save folder in Settings before using auto save.',
      INVALID_REPORT: 'The report format does not match this extension version. Replace the entire extension folder with the latest build, reload the extension, then refresh this webpage and scan again.',
      INVALID_FILENAME: 'The report filename is outdated. Reload the extension and webpage, then scan again.',
      QUEUE_FULL: 'The recovery queue is full (100 reports or 20 MB). Retry or delete queued reports in Settings. This report was not queued.',
      PENDING_SAVES: 'Some reports remain queued. Restore folder access and check the recovery queue in Settings.',
      NotAllowedError: 'The browser denied folder access. Open Settings and restore access or choose the folder again.',
      SecurityError: 'The browser blocked folder access. Open Settings and choose an allowed folder.',
      NotFoundError: 'The selected folder or file is no longer available. Choose the folder again in Settings.',
      NoModificationAllowedError: 'The report file is locked or read-only. Close applications using it, or choose another folder.',
      QuotaExceededError: 'There is not enough storage available. Free disk space or choose another folder.',
      InvalidStateError: 'The file is busy or unavailable. Close other writers and retry saving.',
      AbortError: 'The save was interrupted. Retry saving.'
    };
    const code = Object.hasOwn(codes, error?.code) ? error.code : Object.hasOwn(codes, error?.name) ? error.name : 'SAVE_FAILED';
    return { error: codes[code] || 'Could not save JSON. Restore folder access in Settings, then retry. If it still fails, choose another folder.', code };
  },
  async database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('access-lens-settings', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('preferences');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async read(key = 'save') {
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('preferences').objectStore('preferences').get(key);
        request.onsuccess = () => resolve(request.result || { autoSave: false });
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  },
  async write(settings, key = 'save') {
    const db = await this.database();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('preferences', 'readwrite');
        transaction.objectStore('preferences').put(settings, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Settings were not saved.'));
      });
    } finally { db.close(); }
  },
  async history(filename, next) {
    if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) throw new Error('Invalid history key.');
    if (!(await this.read()).rememberHistory) return { enabled: false };
    const key = 'history:' + filename;
    const previous = await this.read(key);
    if (next) await this.write(next, key);
    return { enabled: true, baseline: previous.baseline, checklist: previous.checklist };
  },
  async sitemap(site, update, clear = false) {
    const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    if (!hash(site)) throw new Error('Invalid site key.');
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('preferences', 'readwrite');
        const store = tx.objectStore('preferences'), key = 'sitemap:' + site;
        const request = store.get(key);
        let result;
        request.onsuccess = () => {
          result = clear ? { nodes: {} } : request.result || { nodes: {} };
          for (const node of (update?.nodes || []).slice(0, 1000)) {
            if (!hash(node.id) || (node.parent !== null && !hash(node.parent))) continue;
            if (!result.nodes[node.id] && Object.keys(result.nodes).length >= 2000) continue;
            const existing = result.nodes[node.id] || { states: {} };
            result.nodes[node.id] = { ...existing, id: node.id, parent: node.parent, linked: existing.linked || node.linked === true,
              dateAdded: existing.dateAdded || new Date().toISOString() };
            // Retain readable paths for exports across visits, without query or
            // fragment values, credentials, titles, or link text.
            if (typeof node.path === 'string' && node.path.startsWith('/') && !node.path.startsWith('//')) {
              try { result.nodes[node.id].path = new URL(node.path, 'https://sitemap.invalid').pathname; } catch {}
            }
          }
          if (hash(update?.page) && hash(update?.state) && result.nodes[update.page]) {
            const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
            const node = result.nodes[update.page];
            const previousScan = Date.parse(node.states[update.state]?.scannedAt);
            if (Number.isFinite(Date.parse(update.scannedAt)) && Date.parse(update.scannedAt) < previousScan) {
              store.put(result, key); return;
            }
            node.attempts ||= {};
            if (update.status === 'scanning') for (const [key, attempt] of Object.entries(node.attempts)) {
              if (['excluded', 'paused'].includes(attempt.status)) delete node.attempts[key];
            }
            const statuses = ['scanning', 'failed', 'queued', 'saved', 'interrupted', 'excluded', 'scanned', 'paused'];
            const status = statuses.includes(update.status) ? update.status : 'scanned';
            node.attempts[update.state] = { status, at: new Date().toISOString() };
            if (typeof update.violations === 'number') node.states[update.state] = {
              violations: count(update.violations), review: count(update.review), manualFailures: count(update.manualFailures),
              scannedAt: Number.isFinite(Date.parse(update.scannedAt)) ? new Date(update.scannedAt).toISOString() : new Date().toISOString(),
              limited: Boolean(update.limited),
              manualStale: count(update.manualStale),
              wcagPending: Number.isSafeInteger(update.wcagPending) ? count(update.wcagPending) : 60,
              rules: Object.fromEntries(Object.entries(update.rules || {}).filter(([id]) => /^[a-z][a-z0-9-]{0,100}$/.test(id)).map(([id, value]) => [id, count(value)])),
              patterns: (update.patterns || []).filter(pattern => hash(pattern.key) && /^[a-z][a-z0-9-]{0,100}$/.test(pattern.rule)).slice(0, 1000)
            };
          }
          const page = result.nodes[update?.page];
          if (page && typeof update?.violations === 'number') {
            const states = Object.values(page.states || {});
            if (states.length && states.every(state => !state.violations && !state.manualFailures && !state.review && !state.manualStale && !(state.wcagPending ?? 60) && !state.limited)) {
              page.complianceAt = states.map(state => state.scannedAt).sort().at(-1);
            }
          }
          store.put(result, key);
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Sitemap update failed.'));
      });
    } finally { db.close(); }
  },
  async clearHistory() {
    const db = await this.database();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('preferences', 'readwrite');
        const cursor = transaction.objectStore('preferences').openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          if (String(entry.key).startsWith('history:')) entry.delete();
          entry.continue();
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { db.close(); }
  },
  async saveSitemap(site) {
    // All sites share one filename. Serialize writes and read the latest map
    // inside the lock so overlapping scan completions cannot write stale data.
    const operation = (this.sitemapSave || Promise.resolve()).catch(() => {}).then(() => this.writeSitemap(site));
    this.sitemapSave = operation;
    try { return await operation; }
    finally { if (this.sitemapSave === operation) delete this.sitemapSave; }
  },
  async writeSitemap(site) {
    const settings = await this.read();
    if (!settings.directory) return { download: true };
    if (await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') throw this.failure('FOLDER_PERMISSION');
    const report = accessLensFeatures.sitemapExport(await this.sitemap(site), settings.staleDays);
    const file = await settings.directory.getFileHandle('sitemap.json', { create: true });
    const stream = await file.createWritable();
    try {
      await stream.write(JSON.stringify(report, null, 2));
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    return { saved: true };
  },
  async save(report, automatic = false, filename) {
    const settings = await this.read();
    if (automatic && !settings.autoSave) return { skipped: true };
    if (!settings.directory) {
      if (automatic) throw this.failure('NO_FOLDER');
      return { download: true };
    }
    if (await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      throw this.failure('FOLDER_PERMISSION');
    }
    if (report?.schemaVersion !== '2.0' || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode)) {
      throw this.failure('INVALID_REPORT');
    }
    // Only a hashed page identifier is accepted, never a caller-provided path.
    if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) {
      throw this.failure('INVALID_FILENAME');
    }
    const file = await settings.directory.getFileHandle(filename, { create: true });
    const stream = await file.createWritable();
    try {
      await stream.write(JSON.stringify(report, null, 2));
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    return { saved: true };
  }
};
