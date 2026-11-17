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
    async deletePending(filename) {
      await this.mutate('pending-saves', queue => {
        const entries = queue?.entries || {};
        if (filename) delete entries[filename]; else return { entries: {} };
        return { entries };
      });
    },
    async enqueue(report, filename, metadata) {
      if (!['content-free', 'alternative-text-included'].includes(report?.privacy?.mode) || report.schemaVersion !== '2.0') throw this.failure('INVALID_REPORT');
      if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '')) throw this.failure('INVALID_FILENAME');
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
            await this.mutate('pending-saves', queue => {
              const entries = queue?.entries || {};
              if (entries[filename]?.token === entry.token) delete entries[filename];
              return { entries };
            });
            return { saved: true, superseded: true };
          }
          const result = await this.save(entry.report, false, filename);
          if (!result.saved) throw this.failure('NO_FOLDER');
          if (entry.metadata?.site) {
            await this.sitemap(entry.metadata.site, { ...entry.metadata, status: 'saved' });
            await this.saveSitemap(entry.metadata.site);
          }
          await this.write(entry.report.scannedAt, 'saved-at:' + filename);
          await this.mutate('pending-saves', queue => {
            const entries = queue?.entries || {};
            if (entries[filename]?.token === entry.token) delete entries[filename];
            return { entries };
          });
          return { saved: true };
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
