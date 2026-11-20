// Bounded write-ahead queue of content-free reports. No raw scan results are accepted.
(() => {
  const locks = new Map();
  Object.assign(accessLensSettings, {
    async mutate(key, transform) {
      const db = await this.database();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('preferences', 'readwrite'), store = tx.objectStore('preferences');
          const request = store.get(key); let result, failure;
          request.onsuccess = () => {
            try { result = transform(request.result); result === undefined ? store.delete(key) : store.put(result, key); }
            catch (error) { failure = error; tx.abort(); }
          };
          tx.oncomplete = () => resolve(result);
          tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('Storage transaction failed.'));
        });
      } finally { db.close(); }
    },
    async pending() { return (await this.read('pending-saves')).entries || {}; },
    // Preserve distinct submissions independently of the mutable current queue.
    async retainedSnapshots() { return (await this.read('evidence-snapshots')).entries || {}; },
    async snapshotIdentity(report, filename) {
      if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '') || !['2.0', '2.1'].includes(report?.schemaVersion) || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode)) throw this.failure('INVALID_REPORT');
      const canonical = value => Array.isArray(value) ? value.map(canonical)
        : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
      const snapshot = JSON.parse(JSON.stringify(report));
      const serialized = JSON.stringify(canonical({ filename, report: snapshot }));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
      const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const bytes = new TextEncoder().encode(serialized).byteLength;
      return { snapshot, serialized, id, bytes };
    },
    async retainSnapshot(report, filename) {
      const { snapshot, id, bytes } = await this.snapshotIdentity(report, filename);
      await this.mutate('evidence-snapshots', previous => {
        const entries = previous?.entries || {};
        if (entries[id]) return { entries };
        if (Object.keys(entries).length >= 100 || Object.values(entries).reduce((sum, entry) => sum + entry.bytes, bytes) > 20 * 1024 * 1024) throw this.failure('HISTORY_FULL');
        entries[id] = { id, filename, report: snapshot, bytes, recordedAt: new Date().toISOString() };
        return { entries };
      });
      return id;
    },
    async archiveSnapshots() {
      // Web Locks serialize Settings tabs in this extension origin. They do not
      // lock another developer's browser or applications editing these files.
      return navigator.locks.request('access-lens-evidence-archive', async () => {
        const settings = await this.read();
        if (!settings.directory) throw this.failure('NO_FOLDER');
        if (await settings.directory.queryPermission({ mode: 'readwrite' }) !== 'granted') throw this.failure('FOLDER_PERMISSION');
        const directory = await settings.directory.getDirectoryHandle('access-lens-history', { create: true });
        let archived = 0;
        for (const [id, entry] of Object.entries(await this.retainedSnapshots())) {
          const identity = await this.snapshotIdentity(entry.report, entry.filename);
          if (identity.id !== id || entry.id !== id) throw this.failure('HISTORY_CONFLICT');
          const name = `snapshot-${id}.json`;
          const payload = { schemaVersion: '1.0', reportType: 'preserved-snapshot', id, filename: entry.filename, recordedAt: entry.recordedAt, report: entry.report };
          let file;
          try { file = await directory.getFileHandle(name); }
          catch (error) {
            if (error.name !== 'NotFoundError') throw error;
            file = await directory.getFileHandle(name, { create: true });
          }
          const verify = async () => {
            const existing = await file.getFile();
            if (!existing.size) return false; // Interrupted first writes can leave an empty file.
            if (existing.size > 25 * 1024 * 1024) throw this.failure('HISTORY_CONFLICT');
            let saved;
            try { saved = JSON.parse(await existing.text()); } catch { throw this.failure('HISTORY_CONFLICT'); }
            if (saved.schemaVersion !== '1.0' || saved.reportType !== 'preserved-snapshot' || saved.id !== id || saved.filename !== entry.filename || (await this.snapshotIdentity(saved.report, saved.filename)).id !== id) throw this.failure('HISTORY_CONFLICT');
            return true;
          };
          if (!await verify()) {
            const stream = await file.createWritable();
            try { await stream.write(JSON.stringify(payload)); await stream.close(); }
            catch (error) { await stream.abort().catch(() => {}); throw error; }
          }
          if (!await verify()) throw this.failure('HISTORY_CONFLICT');
          // Release only the local staging copy after read-back verification.
          // The immutable folder file is retained; this is not evidence cleanup.
          await this.mutate('evidence-snapshots', previous => {
            const entries = previous?.entries || {};
            if (JSON.stringify(entries[id]) === JSON.stringify(entry)) delete entries[id];
            return { entries };
          });
          archived++;
        }
        return { archived, remaining: Object.keys(await this.retainedSnapshots()).length };
      });
    },
    async deletePending(filename) {
      await this.mutate('pending-saves', queue => {
        const entries = queue?.entries || {};
        if (filename) delete entries[filename]; else return { entries: {} };
        return { entries };
      });
    },
    async enqueue(report, filename, metadata) {
      if (!['content-free', 'alternative-text-included'].includes(report?.privacy?.mode) || !['2.0', '2.1'].includes(report.schemaVersion)) throw this.failure('INVALID_REPORT');
      if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) throw this.failure('INVALID_FILENAME');
      await this.retainSnapshot(report, filename);
      const entry = { token: crypto.randomUUID(), report, metadata, at: new Date().toISOString(), bytes: JSON.stringify({ report, metadata }).length * 2 };
      await this.mutate('pending-saves', queue => {
        const entries = queue?.entries || {}, existing = entries[filename];
        if (existing && Date.parse(existing.report.scannedAt) > Date.parse(report.scannedAt)) return { entries };
        const bytes = Object.entries(entries).reduce((sum, [key, value]) => sum + (key === filename ? 0 : value.bytes), entry.bytes);
        if ((!existing && Object.keys(entries).length >= 100) || bytes > 20 * 1024 * 1024) throw this.failure('QUEUE_FULL');
        entries[filename] = entry;
        return { entries };
      });
    },
    async flushOne(filename) {
      const previous = locks.get(filename) || Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const entry = (await this.pending())[filename];
        if (!entry) return { saved: true };
        const policy = accessLensFeatures.policy(await this.read(), entry.report.pagePath);
        if (policy.excluded) return { queued: true, error: 'This queued page is now excluded. Delete its queued report or remove the exclusion before retrying.', code: 'EXCLUDED' };
        try {
          const lastSaved = await this.read('saved-at:' + filename);
          if (Date.parse(lastSaved) > Date.parse(entry.report.scannedAt)) {
            const hasNewDecisions = Object.values(entry.report.manualChecks || {}).some(check => Date.parse(check.checkedAt) >= Date.parse(lastSaved)) || Date.parse(entry.report.keyboardTest?.assessment?.checkedAt) >= Date.parse(lastSaved);
            if (hasNewDecisions) return { ...this.saveError(this.failure('NEWER_REPORT')), queued: true };
            await this.mutate('pending-saves', queue => {
              const entries = queue?.entries || {};
              if (entries[filename]?.token === entry.token) delete entries[filename];
              return { entries };
            });
            return { saved: true, superseded: true };
          }
          const previousReview = JSON.stringify([entry.report.manualChecks, entry.report.keyboardTest]);
          const result = await this.save(entry.report, false, filename);
          if (!result.saved) throw this.failure('NO_FOLDER');
          const mergedReview = previousReview !== JSON.stringify([entry.report.manualChecks, entry.report.keyboardTest]);
          if (entry.metadata?.site) {
            if (globalThis.accessLensWorkflow?.coverage && entry.report.results) {
              Object.assign(entry.metadata, await accessLensFeatures.scanMetadata(entry.report, policy.staleDays), {
                manualFailures: Object.values(entry.report.manualChecks || {}).filter(check => check.status === 'fail').length + (entry.report.keyboardTest?.assessment?.status === 'fail' ? 1 : 0)
              });
            }
            await this.sitemap(entry.metadata.site, { ...entry.metadata, status: 'saved' });
            await this.saveSitemap(entry.metadata.site);
          }
          await this.write(entry.report.scannedAt, 'saved-at:' + filename);
          await this.mutate('pending-saves', queue => {
            const entries = queue?.entries || {};
            if (entries[filename]?.token === entry.token) delete entries[filename];
            return { entries };
          });
          return { saved: true, ...(mergedReview ? { review: { checklist: entry.report.manualChecks || {}, keyboardTest: entry.report.keyboardTest } } : {}) };
        } catch (error) { return { ...this.saveError(error), queued: true }; }
      });
      locks.set(filename, operation);
      try { return await operation; } finally { if (locks.get(filename) === operation) locks.delete(filename); }
    },
    async saveRecoverable(report, automatic, filename, metadata, forceQueue = false) {
      const settings = await this.read();
      if (globalThis.accessLensWorkflow?.coverage) report.wcagCoverage = accessLensWorkflow.coverage(report, settings.staleDays);
      if (automatic && !settings.autoSave) return { skipped: true };
      if (!settings.directory && !automatic && !forceQueue) return { download: true };
      try {
        await this.enqueue(report, filename, metadata);
        return await this.flushOne(filename);
      } catch (error) { return { ...this.saveError(error), queued: false }; }
    },
    async flushQueue(explicit = false) {
      if (!explicit && (await this.read()).paused) return { paused: true };
      let saved = 0;
      for (const filename of Object.keys(await this.pending())) if ((await this.flushOne(filename)).saved) saved++;
      const remaining = Object.keys(await this.pending()).length;
      if (saved) await this.write({ ok: remaining === 0, code: remaining ? 'PENDING_SAVES' : undefined, at: new Date().toISOString() }, 'auto-status');
      return { saved, remaining };
    }
  });
})();
