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
    async pending() {
      // Normalize supported legacy queued copies in the same IDB transaction.
      const queue = await this.mutate('pending-saves', previous => {
        const entries = previous?.entries || {};
        for (const entry of Object.values(entries)) {
          entry.report = this.normalizeEvidence(entry.report);
          entry.bytes = JSON.stringify({ report: entry.report, metadata: entry.metadata }).length * 2;
        }
        return { entries };
      });
      return queue.entries;
    },
    // Preserve distinct submissions independently of the mutable current queue.
    normalizeEvidence(report) {
      // Supported legacy exports differ by verbatim image alternatives. Remove
      // those from the new copy; reject raw/unknown report formats rather than
      // pretending that an arbitrary input's privacy label is trustworthy.
      const roots = new Set(['schemaVersion','pagePath','scanId','privacy','tool','scannedAt','scope','summary','completeness','contrastAnalysis','scanPasses','supplementalChecks','pageIdentity','inventory','results','wcagCoverage','pageState','manualChecks','keyboardTest','comparison','textSpacingTest']);
      if (!report || Object.keys(report).some(key => !roots.has(key))) throw this.failure('UNSAFE_EVIDENCE');
      const copy = JSON.parse(JSON.stringify(report));
      const forbidden = new Set(['html','text','attributes','value','failureSummary','message','relatedNodes','rawHTML','dataUrl','screenshot','credentials','sourceMetadata','applicationBuild','commitHash']);
      let removed = false;
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
          if (key === 'alternativeText') { delete value[key]; removed = true; continue; }
          if (forbidden.has(key)) throw this.failure('UNSAFE_EVIDENCE');
          if (key === 'target' && Array.isArray(value[key])) {
            const tags = new Set('html head title body main header footer nav section article aside div span p a button input select option textarea label img svg path ul ol li dl dt dd table caption thead tbody tfoot tr th td h1 h2 h3 h4 h5 h6 form fieldset legend video audio source iframe dialog details summary br hr strong em b i canvas slot *'.split(' '));
            for (const selector of value[key]) {
              if (typeof selector !== 'string' || !selector.split(' > ').every(segment => {
                const match = /^([a-z*][a-z0-9-]*)(?::nth-child\([1-9]\d*\))?$/.exec(segment);
                return match && tags.has(match[1]);
              })) throw this.failure('UNSAFE_EVIDENCE');
            }
          }
          visit(value[key]);
        }
      };
      visit(copy);
      if (copy.pagePath) {
        const address = new URL(copy.pagePath);
        if (!['http:', 'https:'].includes(address.protocol)) throw this.failure('UNSAFE_EVIDENCE');
        address.username = ''; address.password = ''; address.search = ''; address.hash = '';
        copy.pagePath = address.href;
      }
      if (copy.privacy?.mode === 'alternative-text-included' || removed) copy.privacy = { ...copy.privacy, mode: 'content-free', alternativeTextIncluded: false, legacyAlternativeTextRemoved: true };
      return copy;
    },
    async retainedSnapshots() {
      // Migrate staging copies atomically before exposing them to export/archive.
      // Original disk reports and already-written archives are never rewritten.
      for (let attempt = 0; attempt < 4; attempt++) {
        const previous = (await this.read('evidence-snapshots')).entries || {};
        const normalized = {};
        let changed = false;
        for (const [oldId, entry] of Object.entries(previous)) {
          const identity = await this.snapshotIdentity(entry.report, entry.filename);
          const differs = JSON.stringify(entry.report) !== JSON.stringify(identity.snapshot);
          if (!differs && identity.id !== oldId) throw this.failure('HISTORY_CONFLICT');
          const next = differs ? { ...entry, id: identity.id, report: identity.snapshot, bytes: identity.bytes,
            sourceSnapshotIds: [...new Set([...(entry.sourceSnapshotIds || []), oldId])] } : entry;
          const existing = normalized[next.id];
          normalized[next.id] = existing ? { ...existing, sourceSnapshotIds: [...new Set([...(existing.sourceSnapshotIds || []), ...(next.sourceSnapshotIds || [])])] } : next;
          changed ||= differs || Boolean(existing);
        }
        if (!changed) return previous;
        let committed = false;
        await this.mutate('evidence-snapshots', current => {
          if (JSON.stringify(current?.entries || {}) !== JSON.stringify(previous)) return current;
          committed = true;
          return { entries: normalized };
        });
        if (committed) return normalized;
      }
      throw this.failure('HISTORY_CONFLICT');
    },
    snapshotEvents(entry) {
      const report = entry.report;
      const timestamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
      const base = { schemaVersion: '1.0', snapshotId: entry.id, filename: entry.filename,
        scanId: report.scanId || `legacy:${entry.filename}:${report.scannedAt || 'unknown'}`, recordedAt: entry.recordedAt,
        attribution: null };
      const outcomes = Object.fromEntries(['violations', 'incomplete', 'passes', 'inapplicable'].map(bucket => [bucket,
        (report.results?.[bucket] || []).reduce((total, rule) => total + (rule.nodes?.length || 0), 0)]));
      const events = [{ ...base, eventId: `${entry.id}:snapshot`, eventType: 'scan-evidence-preserved', occurredAt: timestamp(report.scannedAt), outcomes }];
      for (const [checkId, review] of Object.entries(report.manualChecks || {})) {
        if (!/^(?:[1-4]\.\d{1,2}\.\d{1,2}|keyboard|focus|dialogs|zoom|reader|content|scope-(?:pages|processes|support|interference|set))$/.test(checkId) ||
          !['pass', 'fail', 'not-applicable', 'not-tested'].includes(review?.status) || !timestamp(review.checkedAt)) continue;
        events.push({ ...base, eventId: `${entry.id}:review:${checkId}`, eventType: 'manual-review-evidence-preserved',
          occurredAt: timestamp(review.checkedAt), checkId, status: review.status });
      }
      const review = report.keyboardTest?.assessment;
      if (['pass', 'fail', 'not-reviewed'].includes(review?.status) && timestamp(review.checkedAt)) events.push({ ...base,
        eventId: `${entry.id}:keyboard-review`, eventType: 'keyboard-review-evidence-preserved', occurredAt: timestamp(review.checkedAt), status: review.status });
      return events;
    },
    async preservedEvidence() {
      const snapshots = Object.values(await this.retainedSnapshots());
      return { schemaVersion: '1.0', reportType: 'preserved-evidence', generatedAt: new Date().toISOString(),
        snapshots, events: snapshots.flatMap(entry => this.snapshotEvents(entry)) };
    },
    async snapshotIdentity(report, filename) {
      if (!/^access-lens-[a-f0-9]{64}\.json$/.test(filename || '') || !['2.0', '2.1'].includes(report?.schemaVersion) || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode)) throw this.failure('INVALID_REPORT');
      const canonical = value => Array.isArray(value) ? value.map(canonical)
        : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
      const snapshot = this.normalizeEvidence(report);
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
          const payload = { schemaVersion: '1.0', reportType: 'preserved-snapshot', id, filename: entry.filename, recordedAt: entry.recordedAt, report: entry.report, events: this.snapshotEvents(entry), ...(entry.sourceSnapshotIds ? { sourceSnapshotIds: entry.sourceSnapshotIds } : {}) };
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
            // Older archives predate explicit event summaries. They remain
            // interpretable from the original snapshot; new summaries must agree.
            if (saved.events && JSON.stringify(saved.events) !== JSON.stringify(this.snapshotEvents({ ...entry, recordedAt: saved.recordedAt }))) throw this.failure('HISTORY_CONFLICT');
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
      report = this.normalizeEvidence(report);
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
    async saveRecoverable(report, automatic, filename, metadata, forceQueue = false, reviewOnly = false) {
      const settings = await this.read();
      if (globalThis.accessLensWorkflow?.coverage) report.wcagCoverage = accessLensWorkflow.coverage(report, settings.staleDays);
      try {
        report = this.normalizeEvidence(report);
        // Complete preservation before authorizing a download or skipping disk
        // auto-save. A canceled/overwritten browser download cannot erase it.
        await this.retainSnapshot(report, filename);
        if (automatic && !settings.autoSave || reviewOnly && !settings.directory) return { skipped: true };
        if (!settings.directory && !automatic && !forceQueue) return { download: true };
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
