// Persist preferences, the folder handle, and opt-in compact content-free history; never raw reports.
globalThis.accessLensSettings = {
  failure(code) { return Object.assign(new Error(code), { code }); },
  saveError(error) {
    // Never return native messages: they can include local file paths.
    const codes = {
      FOLDER_PERMISSION: 'Folder access needs to be restored. Open Settings, click Restore folder access, then retry saving.',
      NO_FOLDER: 'Choose a save folder in Settings before saving automatically or reading site reports.',
      INVALID_REPORT: 'The report format does not match this extension version. Replace the entire extension folder with the latest build, reload the extension, then refresh this webpage and scan again.',
      INVALID_FILENAME: 'The report filename is outdated. Reload the extension and webpage, then scan again.',
      QUEUE_FULL: 'The recovery queue is full (100 reports or 20 MB). Retry or delete queued reports in Settings. This report was not queued.',
      HISTORY_FULL: 'Local evidence preservation is full (100 snapshots or 20 MB). This report was not queued. Open Settings and archive preserved evidence to the selected folder, then retry the save.',
      HISTORY_CONFLICT: 'An evidence archive could not be verified or conflicts with its snapshot identifier. Local evidence was retained. Check the archive before retrying; conflicting files were not replaced.',
      HISTORY_UNAVAILABLE: 'Evidence preservation is unavailable. Reload the extension and webpage before saving; the existing report was not replaced.',
      PENDING_SAVES: 'Some reports remain queued. Restore folder access and check the recovery queue in Settings.',
      NotAllowedError: 'The browser denied folder access. Open Settings and restore access or choose the folder again.',
      SecurityError: 'The browser blocked folder access. Open Settings and choose an allowed folder.',
      NotFoundError: 'The selected folder or file is no longer available. Choose the folder again in Settings.',
      NoModificationAllowedError: 'The report file is locked or read-only. Close applications using it, or choose another folder.',
      QuotaExceededError: 'There is not enough storage available. Free disk space or choose another folder.',
      InvalidStateError: 'The file is busy or unavailable. Close other writers and retry saving.',
      AbortError: 'The save was interrupted. Retry saving.',
      NEWER_REPORT: 'A newer scan is already saved for this page. Scan the page again before saving; the newer file was not replaced.',
      REPORT_CONFLICT: 'The saved file belongs to a different page or state. Check the report file before retrying; it was not replaced.',
      INVALID_SAVED_REPORT: 'The saved JSON could not be read or validated. Repair the file or choose another folder before retrying; it was not replaced.'
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
    const settings = await this.read();
    const key = 'history:' + filename;
    const previous = settings.rememberHistory ? await this.read(key) : {};
    if (next) {
      if (settings.rememberHistory) await this.write(next, key);
      return { enabled: Boolean(settings.rememberHistory) };
    }
    const saved = await this.savedReview(filename, settings);
    const pending = this.pending ? (await this.pending())[filename]?.report : null;
    const queued = pending ? this.reviewChoices(pending) : {};
    const checklist = { ...saved.checklist };
    for (const [id, check] of [...Object.entries(previous.checklist || {}), ...Object.entries(queued.checklist || {})]) {
      if (!checklist[id] || Date.parse(check.checkedAt) > Date.parse(checklist[id].checkedAt)) checklist[id] = check;
    }
    const keyboardTest = queued.keyboardTest || saved.keyboardTest;
    return { enabled: Boolean(settings.rememberHistory || settings.directory), baseline: previous.baseline, checklist: Object.keys(checklist).length ? checklist : undefined, keyboardTest };
  },
  async savedReview(filename, settings) {
    if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) throw this.failure('INVALID_FILENAME');
    if (!settings.directory) return {};
    if (await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') throw this.failure('FOLDER_PERMISSION');
    let file;
    try { file = await (await settings.directory.getFileHandle(filename)).getFile(); }
    catch (error) { if (error.name === 'NotFoundError') return {}; throw error; }
    // A saved report is data, never executable content or a source of UI markup.
    if (file.size > 20 * 1024 * 1024) throw this.failure('INVALID_REPORT');
    const report = JSON.parse(await file.text());
    if (!['2.0', '2.1'].includes(report?.schemaVersion) || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode)) throw this.failure('INVALID_REPORT');
    return this.reviewChoices(report);
  },
  async loadSiteReport(address) {
    const site = new URL(address);
    if (!['http:', 'https:'].includes(site.protocol)) throw this.failure('INVALID_REPORT');
    const settings = await this.read();
    if (!settings.directory) throw this.failure('NO_FOLDER');
    if (await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') throw this.failure('FOLDER_PERMISSION');
    const sources = { matchingFiles: 0, includedFiles: 0, otherSites: 0, invalid: 0, unreadable: 0, oversized: 0, bytesRead: 0, limitReached: false };
    const records = [];
    // Sequential reads bound memory and avoid overwhelming the browser's file API.
    for await (const [filename, handle] of settings.directory.entries()) {
      if (handle.kind !== 'file' || !/^access-lens-[a-f0-9]{64}(?: \(\d+\))?\.json$/.test(filename)) continue;
      if (sources.matchingFiles >= 2000) { sources.limitReached = true; break; }
      sources.matchingFiles++;
      let file, text;
      try {
        file = await handle.getFile();
        if (file.size > 20 * 1024 * 1024) { sources.oversized++; continue; }
        if (sources.bytesRead + file.size > 100 * 1024 * 1024) { sources.limitReached = true; break; }
        sources.bytesRead += file.size;
        text = await file.text();
      } catch { sources.unreadable++; continue; }
      try {
        const raw = JSON.parse(text);
        if (new URL(raw.pagePath).origin !== site.origin) { sources.otherSites++; continue; }
        const evidence = accessLensFeatures.reportEvidence(raw, filename);
        records.push(evidence); sources.includedFiles++;
      } catch { sources.invalid++; }
    }
    const siteFilename = await accessLensFilename(site.origin + '/', '', {});
    const map = await this.sitemap(siteFilename.slice(12, -5));
    const result = accessLensFeatures.savedSiteReport(records, site.origin, map, settings.staleDays, sources);
    const pending = this.pending ? Object.values(await this.pending()) : [];
    result.sources.queuedReports = pending.filter(entry => {
      try { return new URL(entry.report.pagePath).origin === site.origin; } catch { return false; }
    }).length;
    if (result.sources.queuedReports) result.sources.partial = true;
    return result;
  },
  async mergeSavedReview(report, file, preservePrevious) {
    let previous;
    try {
      const snapshot = await file.getFile();
      // Empty files have no review evidence and can remain after a failed first
      // write. Allow the recovery queue to complete those initial saves.
      if (!snapshot.size) return report;
      if (snapshot.size > 20 * 1024 * 1024) throw new Error('Oversized saved report');
      previous = JSON.parse(await snapshot.text());
      if (!['2.0', '2.1'].includes(previous?.schemaVersion) || !['content-free','alternative-text-included'].includes(previous?.privacy?.mode) || !Number.isFinite(Date.parse(previous.scannedAt))) throw new Error('Invalid saved report');
    } catch (error) {
      if (error.name === 'NotFoundError') return report;
      throw this.failure('INVALID_SAVED_REPORT');
    }
    if (previous.pagePath !== report.pagePath || previous.pageState?.key !== report.pageState?.key ||
      previous.pageIdentity?.pageKey && report.pageIdentity?.pageKey && previous.pageIdentity.pageKey !== report.pageIdentity.pageKey) throw this.failure('REPORT_CONFLICT');
    if (Date.parse(previous.scannedAt) > Date.parse(report.scannedAt)) throw this.failure('NEWER_REPORT');
    // The file is reread immediately before writing, not only when the panel opens.
    // Require dated, known decisions so externally edited files remain reviewable.
    if (globalThis.accessLensWorkflow) {
      let disk, incoming;
      try {
        const validate = value => {
          for (const [id] of accessLensWorkflow.checklist) {
            const check = value.manualChecks?.[id];
            if (check && (!['not-tested','pass','fail','not-applicable'].includes(check.status) || !Number.isFinite(Date.parse(check.checkedAt)) || id.startsWith('scope-') && check.status === 'not-applicable')) throw new Error('Invalid decision');
          }
          return this.reviewChoices(value);
        };
        disk = validate(previous); incoming = validate(report);
      } catch { throw this.failure('INVALID_SAVED_REPORT'); }
      const checklist = { ...incoming.checklist };
      for (const [id, check] of Object.entries(disk.checklist)) if (!checklist[id] || Date.parse(check.checkedAt) >= Date.parse(checklist[id].checkedAt)) checklist[id] = check;
      report.manualChecks = checklist;
      if (disk.keyboardTest) {
        const current = report.keyboardTest;
        if (!current || Date.parse(disk.keyboardTest.startedAt) > Date.parse(current.startedAt) ||
          disk.keyboardTest.id === current.id && Date.parse(disk.keyboardTest.assessment.checkedAt) >= Date.parse(current.assessment?.checkedAt || 0)) report.keyboardTest = disk.keyboardTest;
      }
    }
    if (preservePrevious) await preservePrevious(previous);
    return report;
  },
  reviewChoices(report) {
    const checklist = {};
    for (const [id] of accessLensWorkflow.checklist) {
      const check = report.manualChecks?.[id];
      if (!check || !['not-tested', 'pass', 'fail', 'not-applicable'].includes(check.status) || !Number.isFinite(Date.parse(check.checkedAt))) continue;
      if (id.startsWith('scope-') && check.status === 'not-applicable') continue;
      checklist[id] = { status: check.status, checkedAt: new Date(check.checkedAt).toISOString() };
    }
    const run = report.keyboardTest;
    const keyboardTest = run && typeof run.id === 'string' && run.id.length <= 100 &&
      ['completed', 'interrupted'].includes(run.status) && Array.isArray(run.entries) && run.entries.length <= 201 &&
      ['not-reviewed', 'pass', 'fail'].includes(run.assessment?.status) && run.assessment.runId === run.id &&
      Number.isFinite(Date.parse(run.assessment.checkedAt)) && Number.isFinite(Date.parse(run.startedAt)) &&
      run.entries.every(entry => Array.isArray(entry.target) && entry.target.length <= 30 &&
        entry.target.every(part => typeof part === 'string' && part.length <= 4000 && /^(?:[a-z*]+:nth-child\(\d+\))(?: > [a-z*]+:nth-child\(\d+\))*$/.test(part)) &&
        Array.isArray(entry.flags) && entry.flags.every(flag => ['document-boundary', 'frame-requires-separate-review', 'not-visibly-rendered', 'outside-viewport', 'center-may-be-covered', 'repeated-focus', 'no-obvious-focus-indicator'].includes(flag)))
      ? { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: Number.isFinite(Date.parse(run.finishedAt)) ? run.finishedAt : undefined,
          scannedAt: Number.isFinite(Date.parse(run.scannedAt)) ? run.scannedAt : undefined,
          pageStateKey: /^[a-f0-9]{64}$/.test(run.pageStateKey || '') ? run.pageStateKey : undefined,
          mode: 'tab-traversal', stepsPerDirection: Number.isSafeInteger(run.stepsPerDirection) ? Math.min(100, Math.max(1, run.stepsPerDirection)) : 20,
          reason: ['step-limit-reached','stopped-by-user','frame-boundary','focus-left-document','driver-unavailable','driver-disconnected','debugger-canceled','page-navigated','browser-or-worker-restarted','time-limit','disabled-in-settings'].includes(run.reason) ? run.reason : 'driver-unavailable',
          reviewRequired: true, limitations: ['Earlier recorded traversal only. Revalidate against the current page; complete keyboard interaction still requires human review.'],
          repeatedFocus: (Array.isArray(run.repeatedFocus) ? run.repeatedFocus : []).filter(step => Number.isSafeInteger(step) && step >= 0 && step <= 200),
          assessment: { status: run.assessment.status, checkedAt: run.assessment.checkedAt, runId: run.id },
          entries: run.entries.map(entry => ({
            target: entry.target, flags: entry.flags,
            direction: ['forward', 'reverse', 'initial'].includes(entry.direction) ? entry.direction : 'initial',
            key: ['Tab', 'Shift+Tab', 'Start'].includes(entry.key) ? entry.key : 'Start',
            step: Number.isSafeInteger(entry.step) ? entry.step : 0,
            elapsedMs: Number.isFinite(entry.elapsedMs) ? entry.elapsedMs : 0,
            boundary: entry.boundary === true, documentFocused: entry.documentFocused === true,
            rectangle: entry.rectangle ? Object.fromEntries(['x','y','width','height'].map(key => [key, Number.isFinite(entry.rectangle[key]) ? entry.rectangle[key] : 0])) : null,
            indicator: entry.indicator ? { outlineStyle: ['none','solid','dotted','dashed','double','groove','ridge','inset','outset','auto'].includes(entry.indicator.outlineStyle) ? entry.indicator.outlineStyle : 'none', outlineWidth: Number.isFinite(entry.indicator.outlineWidth) ? entry.indicator.outlineWidth : 0, boxShadowPresent: entry.indicator.boxShadowPresent === true } : null
          })) } : undefined;
    return { checklist, keyboardTest };
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
    if (!['2.0', '2.1'].includes(report?.schemaVersion) || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode)) {
      throw this.failure('INVALID_REPORT');
    }
    // Only a hashed page identifier is accepted, never a caller-provided path.
    if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) {
      throw this.failure('INVALID_FILENAME');
    }
    let file;
    try { file = await settings.directory.getFileHandle(filename); }
    catch (error) {
      if (error.name !== 'NotFoundError') throw error;
      file = await settings.directory.getFileHandle(filename, { create: true });
    }
    if (!this.retainSnapshot) throw this.failure('HISTORY_UNAVAILABLE');
    await this.retainSnapshot(report, filename);
    await this.mergeSavedReview(report, file, previous => this.retainSnapshot(previous, filename));
    if (globalThis.accessLensWorkflow?.coverage) report.wcagCoverage = accessLensWorkflow.coverage(report, settings.staleDays);
    await this.retainSnapshot(report, filename);
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
