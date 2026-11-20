(() => {
  if (globalThis.__accessLensAutoScan) { globalThis.__accessLensAutoScan.rescan(); return; }
  let stopped = false, busy = false, due = Date.now() + 1500, requested = Date.now(), changed = Date.now(), address = location.href;
  let lastSignature = '', retries = 0;
  let attemptCache = null, announced = '', blocked = false;
  async function send(message) {
    try { return await accessLensFeatures.sendRuntime(message); }
    catch (error) {
      if (accessLensFeatures.contextInvalid(error)) stop();
      throw error;
    }
  }
  async function announce() {
    const check = await send({ type: 'access-lens-auto-check', address });
    if (!check?.enabled) { stop(); return check; }
    blocked = Boolean(check.paused || check.excluded);
    globalThis.accessLensIdentity = check.identity || {};
    const map = await accessLensWorkflow.sitemap(address, !blocked), state = blocked ? { key: '0'.repeat(64) } : await accessLensWorkflow.state();
    if (blocked) observer.disconnect(); else watch(document.documentElement);
    attemptCache = { site: map.site, nodes: map.nodes, page: map.current, state: state.key };
    await send({ type: 'access-lens-auto-attempt', address, sitemap: attemptCache, status: check.excluded ? 'excluded' : check.paused ? 'paused' : 'scanning' });
    announced = address;
    return check;
  }
  const schedule = () => { due = Date.now() + 1000; requested = Date.now(); };
  const stateSelector = 'dialog[open],[role="dialog"],[role="alertdialog"],[role="tab"][aria-selected="true"],[aria-expanded="true"],details[open]';
  const options = { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-expanded', 'open', 'hidden', 'aria-hidden', 'role'] };
  function watch(scope) {
    observer.observe(scope, options);
    for (const el of scope.querySelectorAll('*')) if (el.shadowRoot) watch(el.shadowRoot);
  }
  const observer = new MutationObserver(records => {
    changed = Date.now();
    let stateChanged = false;
    for (const record of records) {
      if (record.type === 'attributes' && (['aria-selected', 'aria-expanded', 'open'].includes(record.attributeName) || record.target.matches(stateSelector))) stateChanged = true;
      for (const node of [...record.addedNodes, ...record.removedNodes]) if (node.nodeType === 1) {
        if (node.matches(stateSelector) || node.querySelector(stateSelector)) stateChanged = true;
        if (node.isConnected) {
          if (node.shadowRoot) { watch(node.shadowRoot); if (node.shadowRoot.querySelector(stateSelector)) stateChanged = true; }
          for (const el of node.querySelectorAll('*')) if (el.shadowRoot) watch(el.shadowRoot);
        }
      }
    }
    if (stateChanged) schedule();
  });
  const rescan = () => { lastSignature = ''; retries = 0; schedule(); };
  const onShow = event => { if (event.persisted) rescan(); };
  addEventListener('pageshow', onShow);
  const onHide = () => {
    if (!stopped && !blocked && attemptCache && (busy || due)) send({ type: 'access-lens-auto-attempt', address, sitemap: attemptCache, status: 'interrupted' }).catch(() => {});
  };
  addEventListener('pagehide', onHide);
  const stop = () => {
    stopped = true; clearInterval(timer); observer.disconnect(); removeEventListener('pageshow', onShow); removeEventListener('pagehide', onHide);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* Context may already be gone. */ }
    delete globalThis.__accessLensAutoScan;
  };
  const onMessage = message => {
    if (message.type === 'access-lens-auto-stop') stop();
    if (message.type === 'access-lens-auto-retry') rescan();
  };
  chrome.runtime.onMessage.addListener(onMessage);
  async function tick() {
    if (stopped || busy) return;
    if (location.href !== address) { address = location.href; retries = 0; schedule(); }
    if (address !== announced) {
      busy = true;
      try { await announce(); } catch { due = Date.now() + 5000; } finally { busy = false; }
      if (stopped || address !== announced) return;
    }
    if (!due || Date.now() < due || document.readyState === 'loading') return;
    if (globalThis.__accessLens) { due = Date.now() + 1500; return; }
    if (globalThis.__accessLensScanLock) { due = Date.now() + 1000; return; }
    if (Date.now() - changed < 750 && Date.now() - requested < 6000) return;
    busy = true; due = 0;
    const scannedAddress = address;
    try {
      const enabled = await send({ type: 'access-lens-auto-check', address });
      if (!enabled?.enabled) { stop(); return; }
      globalThis.accessLensIdentity = enabled.identity || {};
      blocked = Boolean(enabled.paused || enabled.excluded);
      if (enabled.paused || enabled.excluded) {
        observer.disconnect();
        if (attemptCache) await send({ type: 'access-lens-auto-attempt', address, sitemap: attemptCache, status: enabled.excluded ? 'excluded' : 'paused' });
        due = enabled.paused ? Date.now() + 5000 : 0;
        return;
      }
      watch(document.documentElement);
      const state = await accessLensWorkflow.state();
      const map = await accessLensWorkflow.sitemap(scannedAddress);
      attemptCache = { site: map.site, nodes: map.nodes, page: map.current, state: state.key };
      const filename = await accessLensFilename(scannedAddress, state.key);
      const signature = scannedAddress + state.key;
      if (signature === lastSignature) return;
      await send({ type: 'access-lens-auto-progress' });
      await send({ type: 'access-lens-auto-attempt', address, sitemap: attemptCache, status: 'scanning' });
      globalThis.__accessLensScanLock = true;
      const scanStarted = Date.now(), settledBeforeScan = scanStarted - changed >= 750;
      let results;
      try {
        results = await accessLensFeatures.runAxe({ exclude: ['#access-lens-extension'] });
      } finally { globalThis.__accessLensScanLock = false; }
      if (stopped || location.href !== scannedAddress || (await accessLensWorkflow.state()).key !== state.key) {
        await send({ type: 'access-lens-auto-attempt', address: scannedAddress, sitemap: attemptCache, status: 'interrupted' }); schedule(); return;
      }
      const raw = {
        tool: { name: 'Access Lens', version: '1.12.0', engine: results.testEngine }, scannedAt: results.timestamp,
        scope: { description: 'Automatic browsing scan of the top-level document and supported open shadow roots.', limitations: ['Automated checks do not establish WCAG conformance.', 'Embedded frames and closed shadow roots are excluded.', 'Very brief visits and late-loading content may not be captured.'] },
        summary: Object.fromEntries(['violations','incomplete','passes','inapplicable'].map(key => [key, { rules: results[key].length, elements: results[key].reduce((sum, rule) => sum + rule.nodes.length, 0) }])),
        inventory: accessLensInventory(), results
      };
      raw.attribution = enabled.attribution || null;
      const report = accessLensExport(raw, scannedAddress); report.pageState = state;
      report.pageIdentity.pageKey = (await accessLensFilename(scannedAddress)).slice(12, -5);
      report.completeness.durationMs = Date.now() - scanStarted;
      report.completeness.domSettledBeforeScan = settledBeforeScan;
      report.completeness.domChangedDuringScan = changed > scanStarted;
      if (!settledBeforeScan || changed > scanStarted) report.completeness.status = 'limited';
      const response = await send({ type: 'access-lens-auto-result', report, filename,
        address: report.pagePath,
        sitemap: { site: map.site, nodes: map.nodes, page: map.current } });
      if (response?.saved || response?.queued) { lastSignature = signature; retries = 0; }
      else if (retries++ < 2) { due = Date.now() + 15000; }
    } catch {
      await send({ type: 'access-lens-auto-failed', address: scannedAddress, sitemap: attemptCache }).catch(() => {});
      if (retries++ < 2) due = Date.now() + 15000;
    } finally { busy = false; }
  }
  const timer = setInterval(tick, 500);
  globalThis.__accessLensAutoScan = { stop, rescan };
})();





