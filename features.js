globalThis.accessLensFeatures = {
  async sendRuntime(message) {
    // An async boundary also catches synchronous "Extension context invalidated" throws.
    return await chrome.runtime.sendMessage(message);
  },
  contextInvalid(error) { return /Extension context invalidated|EXTENSION_CONTEXT_UNAVAILABLE/i.test(error?.message || ''); },
  async runAxe(context, options) {
    const original = console.warn;
    const diagnostics = { assetPreloadFailed: false, mediaMetadataUnavailable: false };
    let active = true;
    // Axe logs nonfatal preload failures instead of returning them. Preserve them as
    // explicit scan diagnostics, without copying native events or asset URLs.
    const capture = function (...args) {
      if (active && typeof args[0] === 'string') {
        if (args[0].startsWith("Couldn't load preload assets:")) { diagnostics.assetPreloadFailed = true; return; }
        if (args[0] === 'axe.utils.preloadMedia did not load metadata') { diagnostics.mediaMetadataUnavailable = true; return; }
      }
      return Reflect.apply(original, console, args);
    };
    console.warn = capture;
    try {
      const results = await axe.run(context, options);
      results.accessLensEngineDiagnostics = diagnostics;
      return results;
    } finally {
      active = false;
      if (console.warn === capture) console.warn = original;
    }
  },
  policy(settings = {}, address) {
    const url = new URL(address);
    const exclusions = Array.isArray(settings.exclusions) ? settings.exclusions : [];
    const paths = [url.pathname];
    try { paths.push(decodeURIComponent(url.pathname)); } catch { /* Keep malformed encodings literal. */ }
    return {
      paused: Boolean(settings.paused),
      excluded: exclusions.some(path => typeof path === 'string' && path.startsWith('/') && paths.some(candidate => path.endsWith('*') ? candidate.startsWith(path.slice(0, -1)) : candidate === path)),
      identity: { queryKeys: (settings.queryKeys || []).filter(key => typeof key === 'string').slice(0, 20), hashRoutes: Boolean(settings.hashRoutes) },
      staleDays: Math.max(1, Math.min(365, Number(settings.staleDays) || 7))
    };
  },
  stale(at, days = 7, now = Date.now()) { return !Number.isFinite(Date.parse(at)) || now - Date.parse(at) > days * 86400000; },
  completeness() {
    let frames = 0, sameOriginFrames = 0, hiddenTabPanels = 0, openShadowRoots = 0;
    function walk(scope) {
      for (const el of scope.querySelectorAll('*')) {
        if (el.id === 'access-lens-extension') continue;
        if (el.shadowRoot) { openShadowRoots++; walk(el.shadowRoot); }
        if (['iframe', 'frame'].includes(el.localName)) {
          frames++;
          try { if (el.contentDocument?.documentElement) sameOriginFrames++; } catch { /* Cross-origin or sandboxed frame. */ }
        }
        if (el.getAttribute('role') === 'tabpanel' && (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.hidden || el.getAttribute('aria-hidden') === 'true')) hiddenTabPanels++;
      }
    }
    walk(document);
    return { status: frames || hiddenTabPanels ? 'limited' : 'completed-for-scope', scanCompleted: true,
      excludedFrames: frames, sameOriginFrames, hiddenTabPanels, openShadowRoots,
      closedShadowRoots: 'not-detectable', manualInteractionTestingRequired: true,
      limitations: ['Embedded frames are excluded, including same-origin frames.', 'Hidden tab panels must be opened and scanned separately.', 'Closed shadow roots cannot be detected or inspected.', 'Automated checks do not evaluate full keyboard or screen-reader usability.'] };
  },
  summary(map, days = 7) {
    const pages = Object.values(map?.nodes || {}).filter(node => node.linked || Object.keys(node.states || {}).length);
    const result = { discovered: pages.length, scanned: 0, unscanned: 0, failed: 0, queued: 0, interrupted: 0, excluded: 0, stale: 0, limited: 0, lastScan: null };
    for (const page of pages) {
      const states = Object.values(page.states || {});
      if (states.length) result.scanned++; else result.unscanned++;
      const attempts = Object.values(page.attempts || {});
      for (const key of ['failed', 'queued', 'interrupted', 'excluded']) if (attempts.some(attempt => attempt.status === key || (key === 'interrupted' && attempt.status === 'scanning' && Date.now() - Date.parse(attempt.at) > 120000))) result[key]++;
      if (states.some(state => this.stale(state.scannedAt, days))) result.stale++;
      if (states.some(state => state.limited)) result.limited++;
      for (const state of states) if (!result.lastScan || state.scannedAt > result.lastScan) result.lastScan = state.scannedAt;
    }
    return result;
  },
  complianceAt(page, days = 7) {
    if (page.complianceAt) return page.complianceAt;
    const states = Object.values(page.states || {});
    if (!states.length || states.some(state => state.violations || state.review || state.manualFailures || (state.wcagPending ?? 60) || state.manualStale || state.limited !== false || this.stale(state.scannedAt, days))) return null;
    if (Object.values(page.attempts || {}).some(attempt => ['failed', 'interrupted', 'queued', 'scanning'].includes(attempt.status))) return null;
    return states.map(state => state.scannedAt).sort().at(-1);
  },
  sitemapExport(map, days = 7) {
    return { schemaVersion: '1.0', generatedAt: new Date().toISOString(), coverage: this.summary(map, days),
      nodes: Object.values(map.nodes || {}).map(page => ({ ...page, path: page.path || null, dateAdded: page.dateAdded || null, complianceAt: this.complianceAt(page, days) })),
      limitations: ['complianceAt retains the last recorded scan time when all recorded states had no detected issues or pending review, even after later issues. It does not establish WCAG conformance.', 'Page identifiers are hashes; coverage includes recorded pages only.'] };
  },
  siteReport(map, days = 7) {
    const rules = new Map(), patterns = new Map();
    const pages = Object.values(map?.nodes || {}).filter(node => node.linked || Object.keys(node.states || {}).length);
    for (const page of pages) for (const [stateId, state] of Object.entries(page.states || {})) {
      for (const [id, count] of Object.entries(state.rules || {})) {
        const group = rules.get(id) || { id, occurrences: 0, pages: new Set(), states: 0 };
        group.occurrences += count; group.pages.add(page.id); group.states++; rules.set(id, group);
      }
      for (const pattern of state.patterns || []) {
        const group = patterns.get(pattern.key) || { rule: pattern.rule, key: pattern.key, pages: new Set(), states: new Set() };
        group.pages.add(page.id); group.states.add(page.id + stateId); patterns.set(pattern.key, group);
      }
    }
    return { schemaVersion: '1.0', generatedAt: new Date().toISOString(), coverage: this.summary(map, days),
      rules: [...rules.values()].map(group => ({ ...group, pages: [...group.pages] })).sort((a, b) => b.pages.length - a.pages.length || b.occurrences - a.occurrences),
      possibleSharedFixes: [...patterns.values()].filter(group => group.pages.size > 1).map(group => ({ ...group, pages: [...group.pages], states: group.states.size })),
      pages: pages.map(page => ({ id: page.id, complianceAt: this.complianceAt(page, days), states: page.states, attempts: page.attempts || {} })),
      limitations: ['Repeated rule/structural patterns are candidates for a shared fix, not proof of a shared source component.', 'Counts cover recorded states, not a complete site crawl. Page identifiers are hashes.'] };
  },
  async scanMetadata(report, days = 7) {
    const rules = {}, patterns = [];
    for (const rule of report.results.violations) {
      rules[rule.id] = rule.nodes.length;
      for (const node of rule.nodes) {
        if (patterns.length >= 1000) break;
        if (!node.target.length) continue;
        const source = JSON.stringify([rule.id, node.target]);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
        const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        patterns.push({ rule: rule.id, key });
      }
    }
    const manualStale = Object.values(report.manualChecks || {}).filter(check => check.status !== 'not-tested' && (!Number.isFinite(Date.parse(check.checkedAt)) || Date.parse(check.checkedAt) < Date.parse(report.scannedAt))).length;
    const wcagCoverage = globalThis.accessLensWorkflow?.coverage?.(report, days);
    if (wcagCoverage) report.wcagCoverage = wcagCoverage;
    const wcagPending = wcagCoverage ? wcagCoverage.criteria.filter(c => !['pass','not-applicable'].includes(c.status)).length + wcagCoverage.scopeChecks.filter(c => c.status !== 'pass').length + (wcagCoverage.keyboardEvidence && wcagCoverage.keyboardEvidence.reviewStatus !== 'pass' ? 1 : 0) : 60;
    return { rules, patterns, manualStale, wcagPending, limited: report.completeness?.status === 'limited', scannedAt: report.scannedAt };
  }
};
