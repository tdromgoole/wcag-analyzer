(() => {
  if (globalThis.__accessLens) { globalThis.__accessLens(); return; }
  const extensionContext = Boolean(globalThis.chrome?.runtime?.id);
  const host = document.createElement('div');
  host.id = 'access-lens-extension';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{color-scheme:light} *{box-sizing:border-box} button,input{font:inherit} button{cursor:pointer} button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #146cce;outline-offset:3px}
    aside{pointer-events:auto;position:absolute;inset:0 auto 0 0;width:380px;max-width:100vw;background:#f3f5f8;color:#1b293e;font:14px/1.5 system-ui,sans-serif;box-shadow:5px 0 30px #101e3433;display:flex;flex-direction:column;border-right:1px solid #cbd3df}
    header{background:#172b48;color:white;padding:22px} .brand{font-size:24px;font-weight:750;letter-spacing:-1px} .eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#a8c8ee} .top{display:flex;align-items:center;justify-content:space-between} .close{border:0;background:transparent;color:white;font-size:25px} header p{margin:6px 0 0;color:#c8d7eb;font-size:12px}
    .actions{display:flex;gap:8px;padding:16px 18px 10px} button.primary{background:#255caa;color:white;border:0} .actions button{padding:9px 12px;border:1px solid #c7d0df;border-radius:7px;background:white;color:#233b5d;font-weight:650} button:disabled{opacity:.5;cursor:wait}
    .meta{padding:0 20px 12px;font-size:11px;color:#53647b;overflow-wrap:anywhere} .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 18px 14px} .stat{border:1px solid #d9e0e9;border-radius:8px;background:white;text-align:left;padding:10px;color:#31435d} .stat strong{font-size:25px;display:block} .stat[aria-pressed=true]{outline:2px solid #255caa} .stat[data-kind=violations] strong{color:#b42335}.stat[data-kind=incomplete] strong{color:#956100}.stat[data-kind=passes] strong{color:#257253}
    .toolbar{display:flex;justify-content:space-between;padding:12px 20px;border-block:1px solid #dce2eb;background:white} .toolbar label{display:flex;align-items:center;gap:7px} .results{overflow:auto;flex:1;padding:16px 18px} .rule{background:white;border:1px solid #dae1eb;border-radius:8px;margin-bottom:10px;padding:12px} summary{cursor:pointer;font-weight:650} .tag{display:inline-block;font-size:10px;padding:2px 6px;background:#edf1f7;border-radius:4px;margin:7px 4px 4px 0} .rule p{font-size:12px;color:#53647b} a{color:#19549e} .node{width:100%;text-align:left;border:1px solid #dce2eb;background:#f8faff;border-radius:5px;padding:8px;margin-top:6px;color:#243b5a;overflow-wrap:anywhere;font-size:12px} .node.selected{outline:2px solid #255caa} code{display:block;white-space:pre-wrap;font:11px/1.5 monospace;max-height:80px;overflow:auto;margin-top:6px} footer{padding:12px 18px;background:white;border-top:1px solid #dae1eb;font-size:11px;color:#596b82}.status{padding:16px;background:white;border-radius:8px} .marker{pointer-events:auto;position:absolute;width:27px;height:27px;border:2px solid white;border-radius:7px;background:#b42335;color:white;box-shadow:0 1px 6px #0006;font:bold 12px system-ui;transform:translate(-50%,-50%)} .marker.review{background:#946100}.highlight{position:absolute;border:3px solid #2465bd;background:#2465bd19;pointer-events:none;border-radius:3px}
  </style><aside aria-label="Access Lens accessibility analyzer"><header><div class="top"><div><div class="eyebrow">Accessibility inspector</div><div class="brand">◉ Access Lens <span id="buildVersion" style="font-size:10px;font-weight:400">v1.12.0</span></div></div><button class="close" aria-label="Close analyzer">×</button></div><p>A clearer view of a more accessible web.</p></header><div class="actions"><button class="primary" id="scan">Scan page</button><button id="export" disabled>↓ Export JSON</button></div><div class="meta" id="meta"></div><div class="stats"></div><div class="toolbar"><strong id="viewTitle">Findings</strong><label><input id="markers" type="checkbox" checked> Page markers</label></div><div class="results" aria-live="polite"></div><footer>Automated checks are a starting point. Manual testing is required to evaluate WCAG conformance.</footer></aside><div id="overlay"></div>`;
  document.documentElement.append(host);
  const $ = (s) => root.querySelector(s);
  const collapse = document.createElement('button'); collapse.className = 'close'; collapse.textContent = '-'; collapse.setAttribute('aria-label', 'Collapse sidebar'); collapse.setAttribute('aria-expanded', 'true');
  $('.close').before(collapse);
  const expand = document.createElement('button'); expand.textContent = 'Access Lens'; expand.hidden = true;
  expand.style.cssText = 'pointer-events:auto;position:absolute;top:12px;left:12px;padding:10px;background:#172b48;color:white;border:0;border-radius:6px';
  expand.setAttribute('aria-label', 'Expand sidebar'); root.append(expand);
  collapse.onclick = () => { $('aside').style.display = 'none'; expand.hidden = false; collapse.setAttribute('aria-expanded', 'false'); expand.focus(); position(); };
  expand.onclick = () => { $('aside').style.display = ''; expand.hidden = true; collapse.setAttribute('aria-expanded', 'true'); collapse.focus(); position(); };
  const settingsButton = document.createElement('button');
  settingsButton.textContent = 'Settings';
  settingsButton.id = 'settings';
  $('.actions').append(settingsButton);
  const pauseButton = document.createElement('button'); pauseButton.id = 'pauseBrowsing'; pauseButton.textContent = 'Pause browsing scans';
  pauseButton.onclick = async () => {
    try {
      const result = await accessLensFeatures.sendRuntime({ type: 'access-lens-pause-toggle' });
      if (result.error) throw new Error();
      pauseButton.textContent = result.paused ? 'Resume browsing scans' : 'Pause browsing scans';
    } catch { saveStatus.textContent = 'Open Settings to pause or resume browsing scans.'; }
  };
  $('.actions').append(pauseButton);
  const saveStatus = document.createElement('div');
  saveStatus.className = 'meta';
  saveStatus.id = 'saveStatus';
  saveStatus.setAttribute('role', 'status');
  $('.meta').after(saveStatus);
  const saveDetail = document.createElement('div'); saveDetail.className = 'meta';
  const retry = document.createElement('button'); retry.textContent = 'Retry save'; retry.hidden = true;
  retry.style.cssText = 'align-self:flex-start;margin:0 20px 12px;padding:7px 12px;border:1px solid #c7d0df;border-radius:6px;background:white;color:#233b5d';
  retry.onclick = () => saveReport();
  saveStatus.after(saveDetail, retry);
  const stateLabel = document.createElement('label'); stateLabel.className = 'meta'; stateLabel.textContent = 'Page state slot ';
  const stateSlot = document.createElement('select'); stateSlot.id = 'stateSlot';
  for (let i = 0; i < 10; i++) { const option = document.createElement('option'); option.value = i; option.textContent = i === 0 ? 'Automatic' : `State ${i}`; stateSlot.append(option); }
  stateLabel.append(stateSlot); $('.stats').before(stateLabel);
  stateSlot.onchange = () => scan();
  const workflowStatus = document.createElement('div'); workflowStatus.className = 'meta'; stateLabel.after(workflowStatus);
  const scanDetails = document.createElement('details'); scanDetails.id = 'scanDetails';
  const scanSummary = document.createElement('summary');
  const scanStatus = document.createElement('span'); scanStatus.setAttribute('role', 'status');
  scanSummary.append(scanStatus, document.createTextNode('Scan & save details'));
  scanDetails.append(scanSummary);
  $('.stats').before(scanDetails);
  scanDetails.append($('#meta'), saveStatus, saveDetail, stateLabel, workflowStatus, pauseButton);
  retry.style.cssText = 'margin:0 12px 6px;padding:5px 9px;align-self:flex-start;border:1px solid #c7d0df;border-radius:5px;background:white;color:#233b5d;font-size:12px';
  scanDetails.after(retry);
  const statusObserver = new MutationObserver(() => {
    const message = saveStatus.textContent;
    scanStatus.textContent = /Could not/.test(message) ? 'Save failed · ' : /queued/i.test(message) ? 'Queued · ' : /saved/i.test(message) ? 'Saved · ' : /download/i.test(message) ? 'Download requested · ' : '';
    scanSummary.title = message;
    scanDetails.dataset.attention = String(/Could not|queued/i.test(message));
  });
  statusObserver.observe(saveStatus, { childList: true, subtree: true, characterData: true });
  $('.eyebrow').remove(); $('header p').remove();
  $('footer').textContent = 'Automated checks still need manual review.';
  const sessions = new Map();
  let scanPolicy = { staleDays: 7 }, manualAttempt;
  let sitemapContext, sitemapData = { nodes: {} }, sitemapError = '';
  let savedSiteReportResult = null, siteReportLoading = false, siteReportError = '';
  async function loadSavedSiteReport() {
    siteReportLoading = true; siteReportError = ''; savedSiteReportResult = null;
    if (!disposed && view === 'Site report') render();
    try {
      if (!extensionContext) throw new Error('Choose a save folder in the installed extension’s Settings to read site reports.');
      const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-site-report', address: location.origin });
      if (response?.error) throw new Error(response.error);
      if (response?.reportType !== 'site-review' || response.sitePath !== location.origin) throw new Error('Folder report unavailable. Choose a save folder in Settings, then refresh the report.');
      savedSiteReportResult = response;
    } catch (error) { siteReportError = error.message; }
    finally { siteReportLoading = false; if (!disposed && view === 'Site report') render(); }
  }
  async function refreshSitemap(record = false, clear = false) {
    try {
      sitemapContext = await accessLensWorkflow.sitemap();
      const update = { nodes: sitemapContext.nodes };
      if (record && exportReport) Object.assign(update, {
        page: sitemapContext.current, state: exportReport.pageState.key,
        violations: exportReport.results.violations.reduce((sum, rule) => sum + rule.nodes.length, 0),
        review: exportReport.results.incomplete.reduce((sum, rule) => sum + rule.nodes.length, 0),
        manualFailures: Object.values(activeSession?.checklist || {}).filter(check => check.status === 'fail').length + (exportReport.keyboardTest?.assessment?.status === 'fail' ? 1 : 0),
        ...(await accessLensFeatures.scanMetadata(exportReport, scanPolicy.staleDays))
      });
      if (globalThis.chrome?.runtime?.id) {
        const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-sitemap', site: sitemapContext.site, update, clear });
        if (!response?.nodes || response.error) throw new Error();
        sitemapData = response;
      } else {
        if (clear) sitemapData = { nodes: {} };
        for (const node of update.nodes) sitemapData.nodes[node.id] = { ...node, dateAdded: sitemapData.nodes[node.id]?.dateAdded || new Date().toISOString(), states: sitemapData.nodes[node.id]?.states || {} };
        if (record) sitemapData.nodes[update.page].states[update.state] = { violations: update.violations, review: update.review, manualFailures: update.manualFailures, scannedAt: exportReport.scannedAt, rules: update.rules, patterns: update.patterns, limited: update.limited, manualStale: update.manualStale, wcagPending: update.wcagPending };
      }
      const page = sitemapData.nodes[update.page];
      if (record && page && Object.values(page.states).every(state => !state.violations && !state.review && !state.manualFailures && !state.manualStale && !(state.wcagPending ?? 60) && !state.limited)) page.complianceAt = exportReport.scannedAt;
      sitemapError = '';
    } catch { sitemapError = 'Could not load or update the sitemap. Retry Refresh sitemap.'; }
  }
  let activeSession, comparison = null, currentBaseline;
  async function remember() {
    if (!activeSession || !exportReport) return;
    activeSession.baseline = currentBaseline;
    sessions.set(exportFilename, activeSession);
    if (globalThis.chrome?.runtime?.id) {
      const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-history', filename: exportFilename,
        next: { baseline: currentBaseline, checklist: activeSession.checklist } });
      if (response?.error) throw new Error('History unavailable');
    }
  }
  settingsButton.onclick = async () => {
    try { await accessLensFeatures.sendRuntime({ type: 'access-lens-settings' }); }
    catch { saveStatus.textContent = 'Could not open Settings. Reload the extension and page.'; }
  };
  let exportReport = null;
  let exportFilename = null;
  let report = null, category = 'violations', selected = null, disposed = false, frame, view = 'Details';
  const hiddenGroups = new Set();
  const labels = { violations: 'Issues', incomplete: 'Needs review', passes: 'Passed checks', inapplicable: 'Not applicable' };
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extraStyle=document.createElement('style');
  extraStyle.textContent=`.stats{grid-template-columns:repeat(4,1fr);gap:5px}.stat{font-size:11px;padding:7px}.stat strong{font-size:23px}.tabs{display:flex;margin:0 18px;border-bottom:1px solid #ccd5e2}.tabs button{flex:1;border:0;background:transparent;padding:10px 2px;color:#455774;font-size:11px}.tabs button[aria-pressed=true]{background:white;color:#184d96;border-bottom:3px solid #255caa}.icons{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.icon{width:27px;height:27px;border:2px solid white;outline:1px solid #c9d2df;border-radius:6px;background:#275b9a;color:white;font:bold 11px system-ui;cursor:pointer}.icon.selected{outline:3px solid #111}.features .icon{background:#356c49}.aria .icon{background:#68488c}.rule h3{font-size:14px;margin:0}.inspection-note{font-size:12px;color:#52657d;margin-bottom:12px}.element-detail{overflow-wrap:anywhere;background:#edf2f8;border-radius:6px;padding:10px;margin:10px 0}.group-toggle{display:inline-flex;gap:7px;align-items:center}.marker.features{background:#356c49}.marker.structure{background:#275b9a}.marker.aria{background:#68488c}`;
  root.append(extraStyle);
  const tabs=document.createElement('div'); tabs.className='tabs'; tabs.setAttribute('aria-label','Inspection views');
  const viewLabel = document.createElement('label'); viewLabel.textContent = 'View'; viewLabel.htmlFor = 'viewSelect';
  const viewSelect = document.createElement('select'); viewSelect.id = 'viewSelect';
  for(const name of ['Details','Reference','Order','Structure','Contrast','Changes','Manual','Keyboard test','Additional checks','Sitemap','Site report']) {
    const option = document.createElement('option'); option.value = name; option.textContent = name === 'Manual' ? 'WCAG coverage & manual' : name; viewSelect.append(option);
  }
  viewSelect.onchange = async () => { view=viewSelect.value; selected=null; if(['Sitemap','Site report'].includes(view)) await refreshSitemap(); if(!disposed) { if (view === 'Site report') await loadSavedSiteReport(); else render(); } };
  tabs.append(viewLabel, viewSelect);
  extraStyle.textContent += '.tabs{flex-wrap:wrap}.tabs button{flex:1 0 23%}.actions{flex-wrap:wrap}.manual-item{display:block;margin-bottom:16px}.manual-item select{display:block;margin:6px 0}';
  extraStyle.textContent += 'aside{overflow-y:auto}aside>*{flex-shrink:0}.results{flex:1 0 240px}.meta:empty{display:none}';
  extraStyle.textContent += '.manual-item{padding:12px;border:1px solid #dce2eb;border-radius:6px;background:white}.criterion-evidence{font-size:11px;color:#52657d} #wcagCoverageSummary{font-weight:650} .sitemap{padding-left:12px;overflow-wrap:anywhere}.sitemap ul{padding-left:16px}.sitemap li{margin:12px 0;list-style:none}.sitemap small{display:block;color:#52657d;font-size:11px}.sitemap details{font-size:11px}.sitemap-status{display:inline-block;text-align:center;min-width:20px;font-weight:800}.sitemap-status.issues{color:#b42335}.sitemap-status.clean{color:#257253}.sitemap-status.review{color:#956100}.sitemap-status.unknown{color:#53647b}';
  extraStyle.textContent += `header{padding:7px 12px}.brand{font-size:18px}.close{font-size:23px;line-height:24px}.actions{padding:8px 12px 6px;gap:6px;flex-wrap:nowrap}.actions button{padding:6px 9px;font-size:12px}.stats{gap:4px;padding:6px 12px 8px}.stat{padding:4px 7px;font-size:11px;white-space:nowrap}.stat strong{font-size:17px;display:inline;margin-right:5px}.tabs{margin:0;padding:6px 12px;gap:8px;align-items:center;flex-wrap:nowrap;border-top:1px solid #dce2eb}.tabs label{font-size:12px}.tabs select{flex:1;min-width:0;padding:5px;font:12px system-ui;border:1px solid #c7d0df;border-radius:5px;background:white;color:#233b5d}.toolbar{padding:6px 12px;font-size:12px}.results{flex:1 1 0;min-height:120px;padding:10px 12px}footer{padding:5px 12px;font-size:10px}#scanDetails{margin:0 12px;font-size:11px;max-height:30vh;overflow:auto}#scanDetails>summary{padding:4px 0;color:#53647b}#scanDetails[data-attention=true]>summary{color:#956100}#scanDetails .meta{padding:5px 0;font-size:11px}#scanDetails #pauseBrowsing{font-size:12px;padding:5px 8px;margin:4px 0 8px;border:1px solid #c7d0df;border-radius:5px;background:white;color:#233b5d}.view-help{font-size:11px;margin:0 0 8px;color:#53647b}.view-help summary{font-weight:500}.view-help p{margin:6px 0}.rule{margin-bottom:8px;padding:10px}`;
  $('.toolbar').before(tabs);
  function currentRules() {
    if (['Changes', 'Manual', 'Keyboard test', 'Additional checks', 'Sitemap', 'Site report'].includes(view)) return [];
    if(view==='Order') return report.inventory.order;
    if(view==='Structure') return report.inventory.structure;
    if(view==='Contrast') return [...report.results.violations,...report.results.incomplete].filter(r=>r.id==='color-contrast');
    return report.inventory[category] || report.results[category] || [];
  }
  function numberedItems() {
    return currentRules().flatMap(r => r.nodes.map(n => ({ r, n }))).map((item, i) => ({ ...item, number: i + 1 }));
  }
  function revealIssue(node) {
    if (!expand.hidden) expand.onclick();
    inspect(node);
    const button = [...root.querySelectorAll('.node,.icon')].find(b => b._node === node);
    if (button) {
      const card = button.closest('details');
      if (card) card.open = true;
      button.scrollIntoView({ block: 'nearest' });
      button.focus({ preventScroll: true });
    }
  }
  function resolve(target) {
    try { let scope = document, el; for (const selector of target) { if (typeof selector !== 'string') return null; el = scope.querySelector(selector); if (!el) return null; scope = el.shadowRoot || el; } return el; } catch { return null; }
  }
  function position() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const overlay = $('#overlay'); overlay.replaceChildren();
      if (globalThis.__accessLensMeasuring || !report || !$('#markers').checked || keyboardController) return;
      if (view === 'Keyboard test' && keyboardPathVisible) drawKeyboardPath(overlay);
      const items = numberedItems().filter(({r}) => !hiddenGroups.has(r.id));
      const occupied = new Map();
      items.forEach(({r,n,number}) => {
        const el = resolve(n.target); if (!el) return;
        const b = el.getBoundingClientRect(); if (!b.width || !b.height || b.bottom < 0 || b.top > innerHeight) return;
        const cell=`${Math.round(b.left/30)}:${Math.round(b.top/30)}`, offset=occupied.get(cell)||0; occupied.set(cell,offset+1);
        const markerCategory = view === 'Contrast' ? (report.results.incomplete.includes(r) ? 'incomplete' : 'violations') : category;
        const marker = document.createElement('button'); marker.className = 'marker '+markerCategory+(markerCategory === 'incomplete' ? ' review' : ''); marker.textContent = r.icon || number; marker.title = r.help; marker.setAttribute('aria-label', `${number}: ${r.help}`); marker.style.left = `${Math.min(innerWidth - 16, Math.max(expand.hidden ? 395 : 16, b.left)+offset*29)}px`; marker.style.top = `${Math.max(16,b.top)}px`; marker.onclick = () => revealIssue(n); overlay.append(marker);
      });
      if (selected) { const el = resolve(selected.target); if(el) { const b=el.getBoundingClientRect(), box=document.createElement('div'); box.className='highlight'; Object.assign(box.style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'}); overlay.prepend(box); } }
    });
  }
  function inspect(node) { selected = node; const el = resolve(node.target); el?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); root.querySelectorAll('.node,.icon').forEach(b => b.classList.toggle('selected', b._node === node)); root.querySelector('.element-detail')?.remove(); const detail=document.createElement('div');detail.className='element-detail';detail.innerHTML=`<strong>Selected element</strong><p>${escape(node.text || node.target.join(' → '))}</p><code>${escape(node.html)}</code>`;$('.results').prepend(detail);position(); }
  let keyboardController = null, keyboardError = '', keyboardToken, spacingController = null, checksError = '';
  let keyboardPathVisible = true, keyboardPathDirection = 'forward';
  function drawKeyboardPath(overlay) {
    const run = exportReport?.keyboardTest;
    if (!run) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('keyboard-route'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    const arrow = document.createElementNS(svg.namespaceURI, 'marker');
    arrow.id = 'keyboard-route-arrow'; arrow.setAttribute('viewBox', '0 0 10 10'); arrow.setAttribute('refX', '9'); arrow.setAttribute('refY', '5'); arrow.setAttribute('markerWidth', '7'); arrow.setAttribute('markerHeight', '7'); arrow.setAttribute('orient', 'auto-start-reverse');
    const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); shape.setAttribute('fill', '#19549e'); arrow.append(shape); defs.append(arrow); svg.append(defs); overlay.append(svg);
    const occupied = new Map(); let previous = null;
    for (const [index,entry] of run.entries.entries()) {
      const reverseStart = keyboardPathDirection === 'reverse' && entry.direction === 'forward' && run.entries[index + 1]?.direction === 'reverse';
      if (entry.boundary || entry.direction === 'initial' || (keyboardPathDirection !== 'all' && entry.direction !== keyboardPathDirection && !reverseStart)) { previous = null; continue; }
      const element = resolve(entry.target), rect = element?.getBoundingClientRect();
      if (!rect?.width || !rect.height || getComputedStyle(element).visibility === 'hidden') { previous = null; continue; }
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      if (previous) {
        const line = document.createElementNS(svg.namespaceURI, 'line');
        line.classList.add('keyboard-segment'); line.dataset.from = previous.step; line.dataset.to = entry.step;
        for (const [name,value] of Object.entries({ x1: previous.x, y1: previous.y, x2: point.x, y2: point.y, stroke: '#19549e', 'stroke-width': '3', 'marker-end': 'url(#keyboard-route-arrow)' })) line.setAttribute(name, value);
        if (entry.direction === 'reverse') line.setAttribute('stroke-dasharray', '7 4');
        svg.append(line);
      }
      previous = { ...point, step: entry.step };
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
      const identity = JSON.stringify(entry.target), offset = occupied.get(identity) || 0; occupied.set(identity, offset + 1);
      const marker = document.createElement('button'); marker.className = 'marker keyboard-step'; marker.dataset.step = entry.step;
      marker.textContent = entry.step; marker.title = `Step ${entry.step}: ${entry.key}`; marker.setAttribute('aria-label', `Keyboard step ${entry.step}: ${entry.key}`);
      marker.style.background = entry.direction === 'reverse' ? '#68488c' : '#19549e';
      marker.style.left = `${Math.max(16, Math.min(innerWidth - 16, point.x + offset * 29))}px`;
      marker.style.top = `${Math.max(16, Math.min(innerHeight - 16, rect.top))}px`;
      marker.onclick = () => {
        const button = root.querySelector(`[data-keyboard-step="${entry.step}"]`);
        if (button) revealIssue(button._node);
      };
      overlay.append(marker);
    }
  }
  async function keyboardMessage(action, payload = {}, filename = exportFilename) {
    const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-keyboard', action, filename, ...payload });
    if (!response || response.error) throw Object.assign(new Error(response?.error || 'Keyboard driver unavailable. Reload the extension and page.'), { code: response?.code });
    return response;
  }
  async function runKeyboard(steps) {
    if (keyboardController || spacingController || !exportReport) return;
    const snapshot = exportReport, filename = exportFilename;
    keyboardError = '';
    let token, stop, ready;
    const controller = new AbortController(); keyboardController = controller;
    const originalFocus = root.activeElement || document.activeElement;
    const originalHtmlTabIndex = document.documentElement.getAttribute('tabindex');
    const asideVisibility = $('aside').style.visibility;
    const onEscape = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); controller.abort(); }
    };
    try {
      if (!globalThis.accessLensKeyboard || !globalThis.chrome?.runtime?.id) throw new Error('Keyboard testing requires the installed extension. Reload it and refresh the webpage.');
      ({ token } = await keyboardMessage('begin', {}, filename));
      keyboardToken = token;
      if (!token) throw new Error('Keyboard driver unavailable. Enable keyboard testing in Settings.');
      $('#scan').disabled = true; $('#export').disabled = true; viewSelect.disabled = true;
      $('aside').inert = true; $('aside').style.visibility = 'hidden';
      $('#overlay').replaceChildren();
      expand.inert = true; $('#overlay').inert = true;
      stop = document.createElement('button'); stop.id = 'stopKeyboard'; stop.tabIndex = -1;
      stop.style.cssText = 'pointer-events:auto;position:fixed;right:12px;top:12px;padding:12px;border:2px solid white;border-radius:6px;background:#172b48;color:white;font:14px system-ui';
      stop.textContent = 'Stop keyboard test (or press Escape)'; stop.onclick = () => controller.abort(); root.append(stop);
      document.addEventListener('keydown', onEscape, true);
      ready = document.createElement('div'); ready.id = 'keyboardReady';
      ready.style.cssText = 'pointer-events:auto;position:fixed;top:70px;right:12px;max-width:340px;padding:16px;border:2px solid white;border-radius:6px;background:#172b48;color:white;font:14px system-ui';
      const instructions = document.createElement('p');
      instructions.textContent = 'The browser debugging banner is expected. Leave it open; Cancel ends the test. When ready, begin traversal here to return focus to the webpage. Keep this tab active and do not type during the run.';
      const begin = document.createElement('button'); begin.id = 'beginKeyboardTraversal'; begin.textContent = 'Begin traversal';
      ready.append(instructions, begin); root.append(ready); begin.focus();
      const proceed = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); begin.onclick = null; reject(new Error('Keyboard test preparation timed out. Start a new test, leave the debugging banner open, then click Begin traversal.')); }, 90000);
        const abort = () => { clearTimeout(timer); begin.onclick = null; resolve(false); };
        begin.onclick = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); resolve(true); };
        if (controller.signal.aborted) abort(); else controller.signal.addEventListener('abort', abort, { once: true });
      });
      if (!proceed || disposed) return;
      // Verify the driver is still attached before starting a new transcript.
      await keyboardMessage('ready', { token }, filename);
      ready.remove(); ready = null;
      document.documentElement.setAttribute('tabindex', '-1'); document.documentElement.focus({ preventScroll: true });
      const run = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), scannedAt: snapshot.scannedAt,
        pageStateKey: snapshot.pageState.key, mode: 'tab-traversal', status: 'running', reviewRequired: true,
        limitations: ['Only bounded forward/reverse tab traversal; controls were not activated.', 'Flags and repeated focus require human interpretation; no keyboard criterion is automatically passed.', 'Frames stop the run and require separate review. Closed shadow roots are not inspected.', 'Focus indicator styles are evidence only; visual clarity and logical order need human review.'] };
      snapshot.keyboardTest = run;
      await accessLensKeyboard.run({ steps, signal: controller.signal, run,
        press: reverse => keyboardMessage('key', { token, reverse }, filename),
        sample: () => {
          // Exclude the inspector's stop overlay from occlusion observations.
          const visibility = host.style.visibility; host.style.visibility = 'hidden';
          try { return accessLensKeyboard.sample(); } finally { host.style.visibility = visibility; }
        },
        checkpoint: async current => {
          stop.textContent = `Stop keyboard test - ${Math.max(0, current.entries.length - 1)} steps (Escape)`;
          await keyboardMessage('checkpoint', { token, run: current }, filename);
        }
      });
    } catch (error) {
      if (snapshot.keyboardTest?.status === 'running') {
        snapshot.keyboardTest.status = 'interrupted'; snapshot.keyboardTest.reason = 'driver-unavailable'; snapshot.keyboardTest.finishedAt = new Date().toISOString();
      }
      keyboardError = error.message;
      if (!disposed) workflowStatus.textContent = error.message;
    } finally {
      document.removeEventListener('keydown', onEscape, true);
      if (token) await keyboardMessage('end', { token }, filename).catch(() => {});
      if (originalHtmlTabIndex === null) document.documentElement.removeAttribute('tabindex');
      else document.documentElement.setAttribute('tabindex', originalHtmlTabIndex);
      $('aside').inert = false; $('aside').style.visibility = asideVisibility; expand.inert = false; $('#overlay').inert = false;
      ready?.remove(); stop?.remove(); keyboardController = null; keyboardToken = null;
      if (!disposed) {
        $('#scan').disabled = false; $('#export').disabled = false; viewSelect.disabled = false;
        originalFocus?.focus?.({ preventScroll: true });
        render();
        root.querySelector('#runKeyboard')?.focus({ preventScroll: true });
        if (snapshot.keyboardTest) { saveStatus.textContent = 'Keyboard transcript recorded. Export JSON for review.'; await saveReport(true); }
      }
    }
  }
  function renderKeyboard(results) {
    const help = document.createElement('details'); help.className = 'view-help'; help.open = !exportReport.keyboardTest;
    const helpTitle = document.createElement('summary'); helpTitle.textContent = 'How to run and review the keyboard test'; help.append(helpTitle);
    const note = document.createElement('p');
    note.textContent = 'Run real Tab and Shift+Tab presses and record where focus goes for human review. No controls are activated. Keep this tab active and avoid typing during the run. Press Escape or click Stop to interrupt. Open a dialog or other state yourself, scan it, then run a separate test.';
    help.append(note); results.append(help);
    if (keyboardError) { const error = document.createElement('p'); error.id = 'keyboardError'; error.setAttribute('role', 'alert'); error.textContent = keyboardError; results.append(error); }
    const label = document.createElement('label'); label.textContent = 'Steps in each direction ';
    const steps = document.createElement('input'); steps.id = 'keyboardSteps'; steps.type = 'number'; steps.min = '1'; steps.max = '100'; steps.value = '20'; steps.style.width = '70px'; label.append(steps); results.append(label);
    const start = document.createElement('button'); start.id = 'runKeyboard'; start.textContent = 'Run keyboard test';
    start.onclick = () => runKeyboard(steps.value); results.append(start);
    const setup = document.createElement('ol');
    for (const instruction of [
      'Open Settings → Automated keyboard testing and click Enable keyboard testing. It is off by default; check that the status says testing is enabled.',
      'If the browser disabled Access Lens after an update, review its requested permissions on the browser Extensions page and re-enable it. Keyboard testing requires the debugger permission included with installation.',
      'Close DevTools and other debuggers. Return to this webpage and refresh it if the extension was updated or reloaded, then open Access Lens → View → Keyboard test.',
      'Choose the steps and click Run keyboard test. Wait for the debugging banner, leave it open, then click Begin traversal in the webpage. Canceling the banner stops the test. Keep this tab active and avoid typing during the run.'
    ]) { const item = document.createElement('li'); item.textContent = instruction; setup.append(item); }
    // Setup must remain visible even when an earlier transcript exists.
    const setupTitle = document.createElement('p'); setupTitle.textContent = 'Set up and start keyboard testing:';
    results.insertBefore(setupTitle, help); results.insertBefore(setup, help);
    const run = exportReport.keyboardTest;
    if (!run) { const empty = document.createElement('p'); empty.textContent = 'No keyboard transcript for this page state yet.'; results.append(empty); return; }
    const summary = document.createElement('p'); summary.id = 'keyboardSummary';
    const reasons = { 'focus-left-document': 'focus moved outside the webpage; keep this tab active and begin traversal from the webpage', 'frame-boundary': 'reached an embedded frame', 'step-limit-reached': 'reached the selected step limit', 'stopped-by-user': 'stopped by the user', 'driver-unavailable': 'keyboard driver disconnected', 'driver-disconnected': 'browser debugger disconnected', 'debugger-canceled': 'canceled from the browser debugging banner; leave the banner open during testing', 'time-limit': 'reached the test time limit', 'disabled-in-settings': 'keyboard testing disabled in Settings', 'page-navigated': 'page navigated', 'browser-or-worker-restarted': 'browser or extension restarted' };
    summary.textContent = `${run.status}: ${reasons[run.reason] || run.reason || 'recording'} - ${Math.max(0, run.entries.length - 1)} key presses. ${run.startedAt}. Human review required. This does not pass WCAG keyboard checks.`;
    if (run.scannedAt !== exportReport.scannedAt) summary.textContent += ' Earlier scan: run again to test the current page.';
    results.append(summary);
    const pathLabel = document.createElement('label'); pathLabel.style.display = 'block';
    const pathToggle = document.createElement('input'); pathToggle.id = 'keyboardPath'; pathToggle.type = 'checkbox'; pathToggle.checked = keyboardPathVisible;
    pathToggle.onchange = () => { keyboardPathVisible = pathToggle.checked; position(); }; pathLabel.append(pathToggle, document.createTextNode(' Show numbered keyboard path')); results.append(pathLabel);
    const direction = document.createElement('select'); direction.id = 'keyboardPathDirection'; direction.style.margin = '6px 0'; direction.setAttribute('aria-label', 'Keyboard path direction');
    for (const [value,label] of [['forward','Forward Tab'],['reverse','Reverse Shift+Tab'],['all','Both directions']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; direction.append(option); }
    direction.value = keyboardPathDirection; direction.onchange = () => { keyboardPathDirection = direction.value; position(); }; results.append(direction);
    const legend = document.createElement('p'); legend.textContent = 'Numbers match the recorded step numbers below. Solid blue arrows: Tab; dashed arrows and purple numbers: Shift+Tab. Positions follow the current page; missing elements break the path. Collapse the sidebar to see elements beneath it.'; help.append(legend);
    const assessmentLabel = document.createElement('label'); assessmentLabel.style.display = 'block'; assessmentLabel.textContent = 'Human assessment of this keyboard run ';
    const assessment = document.createElement('select'); assessment.id = 'keyboardAssessment';
    for (const [value,label] of [['not-reviewed','Not reviewed'],['pass','Pass'],['fail','Fail']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; assessment.append(option); }
    assessment.value = run.assessment?.status || 'not-reviewed'; assessmentLabel.append(assessment); results.append(assessmentLabel);
    const assessmentStatus = document.createElement('p'); assessmentStatus.id = 'keyboardAssessmentStatus'; assessmentStatus.setAttribute('role', 'status');
    assessmentStatus.textContent = run.assessment?.checkedAt ? `Assessment: ${run.assessment.status}, recorded ${run.assessment.checkedAt}. Applies to this run only.` : 'Review the recorded steps, then mark Pass or Fail. This does not fill in the WCAG criterion checklist.'; results.append(assessmentStatus);
    assessment.onchange = async () => {
      run.assessment = { status: assessment.value, checkedAt: new Date().toISOString(), runId: run.id };
      assessment.disabled = true;
      let recoveryError = false;
      if (globalThis.chrome?.runtime?.id) {
        try { const saved = await keyboardMessage('assessment', { runId: run.id, status: assessment.value }); run.assessment = saved.assessment || run.assessment; }
        catch { recoveryError = true; }
      }
      exportReport.wcagCoverage = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays);
      await refreshSitemap(true); await saveReport(true, true);
      assessment.disabled = false;
      assessmentStatus.textContent = `Assessment: ${run.assessment.status}, recorded ${run.assessment.checkedAt}. Included in this report's JSON.${recoveryError ? ' The local recovery copy could not be updated; export JSON to retain this assessment.' : ''}`;
    };
    const transcript = document.createElement('ol'); transcript.id = 'keyboardTranscript'; transcript.style.paddingLeft = '0'; transcript.style.listStyle = 'none';
    for (const entry of run.entries) {
      const item = document.createElement('li');
      const locate = document.createElement('button'); locate.className = 'node'; locate.dataset.keyboardStep = entry.step; locate._node = { target: entry.target, html: '', text: '' };
      locate.textContent = `${entry.step ? '#' + entry.step + ' ' : ''}${entry.key} (${entry.elapsedMs} ms): ${entry.target.join(' -> ') || 'No page focus'}`;
      locate.onclick = () => inspect(locate._node); item.append(locate);
      const detail = document.createElement('p');
      detail.textContent = `${entry.flags.join(', ') || 'No visibility flag'}${run.repeatedFocus?.includes(entry.step) ? '; repeated focus (review, not proof of a trap)' : ''}. Outline: ${entry.indicator?.outlineWidth || 0}px ${entry.indicator?.outlineStyle || 'unknown'}; shadow: ${entry.indicator?.boxShadowPresent ? 'present' : 'absent'}. Indicator appearance needs visual review.`;
      item.append(detail); transcript.append(item);
    }
    results.append(transcript);
    const limitations = document.createElement('p'); limitations.textContent = run.limitations.join(' '); results.append(limitations);
  }
  async function runSpacing() {
    if (!exportReport || spacingController || keyboardController) return;
    if (globalThis.__accessLensScanLock) { checksError = 'Another scan is running. Wait for it to finish, then retry.'; render(); return; }
    const snapshot = exportReport;
    spacingController = new AbortController(); checksError = '';
    globalThis.__accessLensScanLock = true;
    $('#scan').disabled = true; $('#export').disabled = true; viewSelect.disabled = true;
    $('#runTextSpacing').disabled = true;
    try { snapshot.textSpacingTest = await accessLensChecks.textSpacing({ signal: spacingController.signal }); }
    catch { checksError = 'Text-spacing test was interrupted. Review the page and try again.'; }
    finally {
      globalThis.__accessLensScanLock = false; spacingController = null;
      if (!disposed) {
        $('#scan').disabled = false; $('#export').disabled = false; viewSelect.disabled = false;
        render(); root.querySelector('#runTextSpacing')?.focus({ preventScroll: true });
        if (snapshot.textSpacingTest) { await refreshSitemap(true); await saveReport(true); }
      }
    }
  }
  function renderAdditional(results) {
    const help = document.createElement('details'); help.className = 'view-help';
    const helpTitle = document.createElement('summary'); helpTitle.textContent = 'About these automated checks'; help.append(helpTitle); results.append(help);
    const note = document.createElement('p'); note.textContent = 'Additional automated evidence for human review. Candidates are not confirmed WCAG failures; no detected indicators is not a pass. Findings cover the current viewport and page state.'; help.append(note);
    if (!globalThis.accessLensChecks) { const unavailable = document.createElement('p'); unavailable.textContent = 'Reload the latest extension and refresh this page to enable these checks.'; results.append(unavailable); return; }
    const spacing = document.createElement('button'); spacing.id = 'runTextSpacing'; spacing.textContent = 'Run text-spacing stress test'; spacing.onclick = runSpacing; results.append(spacing);
    const description = document.createElement('p'); description.textContent = 'Temporarily applies WCAG text-spacing values, measures new/worse clipping, and restores the original styles. The page may briefly reflow. Related manual assessments need revalidation after new evidence.'; help.append(description);
    if (checksError) { const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = checksError; results.append(error); }
    const snapshot = exportReport.supplementalChecks;
    const summary = document.createElement('p'); summary.id = 'additionalSummary';
    summary.textContent = snapshot ? `${snapshot.checks.length} evidence checks recorded at ${snapshot.recordedAt}. Viewport: ${snapshot.viewport.width} x ${snapshot.viewport.height} CSS pixels; document width: ${snapshot.viewport.documentWidth}. ${snapshot.truncated ? 'Element limit reached; scope is limited.' : ''}` : 'No supplemental evidence was recorded. Scan again.';
    results.append(summary);
    const records = [...(exportReport.textSpacingTest ? [exportReport.textSpacingTest] : []), ...(snapshot?.checks || [])];
    for (const check of records) {
      const card = document.createElement('details'); card.className = 'rule supplemental'; card.dataset.check = check.id;
      const heading = document.createElement('summary'); heading.textContent = `${check.name}: ${check.observations.length}${check.truncated ? '+' : ''} review candidate(s)`; card.append(heading);
      const scope = document.createElement('p'); scope.textContent = `${check.status}. Related criteria: ${check.criteria.join(', ')}. Human review required.`; card.append(scope);
      if (check.id === 'text-spacing') {
        const timing = document.createElement('p'); timing.textContent = `Tested ${check.finishedAt}. ${check.overrideProblems.length} element(s) did not match all requested spacing values. Styles restored. ${check.limitations.join(' ')}`; card.append(timing);
      }
      for (const observation of [...check.observations, ...(check.overrideProblems || [])]) {
        const button = document.createElement('button'); button.className = 'node'; button._node = { target: observation.target, html: '', text: '' };
        button.textContent = observation.target.join(' -> '); button.onclick = () => inspect(button._node); card.append(button);
        if (observation.measurements) { const code = document.createElement('code'); code.textContent = JSON.stringify(observation.measurements, null, 2); card.append(code); }
      }
      if (!check.observations.length) { const empty = document.createElement('p'); empty.textContent = 'No indicators found by this check. Complete the criterion review, including its exceptions and untested content.'; card.append(empty); }
      results.append(card);
    }
    if (snapshot) { const limitations = document.createElement('p'); limitations.textContent = snapshot.limitations.join(' '); help.append(limitations); }
  }
  async function continueContrastScan() {
    if ($('#scan').disabled || contrastSampling || keyboardController || spacingController) return;
    const controls = [$('#scan'),$('#export'),viewSelect,stateSlot], disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try {
      const continuedAddress = location.href;
      if (continuedAddress !== report.page.url) throw new Error('The page changed. Run Scan page before continuing.');
      await accessLensFeatures.finishScan(report.results);
      if (disposed || location.href !== continuedAddress) throw new Error('The page changed during continuation. Run Scan page again.');
      report.summary = Object.fromEntries(Object.keys(labels).map(key => [key,{rules:report.results[key].length,elements:report.results[key].reduce((sum,rule)=>sum+rule.nodes.length,0)}]));
      const refreshed = accessLensExport(report, location.href);
      Object.assign(exportReport, { results:refreshed.results, summary:report.summary, scanPasses:refreshed.scanPasses, contrastAnalysis:refreshed.contrastAnalysis });
      exportReport.wcagCoverage = accessLensWorkflow.coverage(exportReport,scanPolicy.staleDays);
      currentBaseline = accessLensWorkflow.baseline(exportReport);
      comparison = accessLensWorkflow.compare(activeSession?.baseline,currentBaseline); exportReport.comparison = comparison;
      await refreshSitemap(true); await saveReport(true);
    } catch(error) { workflowStatus.textContent = error.message || 'Could not continue contrast measurements.'; }
    finally { controls.forEach((control,index) => { control.disabled = disabled[index]; }); if (!disposed) render(); }
  }
  let contrastSampling = false;
  async function captureContrastElement(node) {
    if (contrastSampling || $('#scan').disabled || keyboardController || spacingController) throw new Error('Wait for the current scan or test to finish.');
    if (!globalThis.chrome?.runtime?.id) throw new Error('Open the installed extension to capture the page.');
    const el = resolve(node.target);
    if (!el?.isConnected || document.visibilityState !== 'visible' || visualViewport && visualViewport.scale !== 1) throw new Error('Keep the element visible without pinch zoom.');
    const foreground = accessLensContrast.foreground(el);
    contrastSampling = true;
    const display = host.style.getPropertyValue('display'), priority = host.style.getPropertyPriority('display');
    const address = location.href;
    const controls = [$('#scan'), $('#export'), viewSelect, stateSlot];
    const disabled = controls.map(control => control.disabled);
    try {
      controls.forEach(control => { control.disabled = true; });
      host.style.setProperty('display', 'none', 'important');
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 150));
      if (disposed || !el.isConnected || document.visibilityState !== 'visible') throw new Error('The page changed. Reopen the inspector and retry.');
      const box = el.getBoundingClientRect(), viewport = { width: innerWidth, height: innerHeight };
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > innerWidth || rect.y + rect.height > innerHeight || !rect.width || !rect.height) throw new Error('The complete element must be visible. Scroll it into view and retry.');
      const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-contrast-capture', rect, viewport });
      const after = el.getBoundingClientRect();
      if (disposed || !el.isConnected || location.href !== address || innerWidth !== viewport.width || innerHeight !== viewport.height || ['x', 'y', 'width', 'height'].some(key => Math.abs(after[key] - rect[key]) > .5) || JSON.stringify(accessLensContrast.foreground(el)) !== JSON.stringify(foreground)) throw new Error('The page moved or changed during capture. Retry.');
      if (response?.error || !response?.image) throw new Error(response?.error || 'Screenshot capture unavailable. Click the extension toolbar button and retry.');
      return { image: response.image, foreground };
    } finally {
      contrastSampling = false;
      if (display) host.style.setProperty('display', display, priority); else host.style.removeProperty('display');
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
    }
  }
  function render() {
    if (!report) return;
    const categories={violations:'Issues',incomplete:'Needs review',features:'Features',alerts:'Alerts',structure:'Structure',aria:'ARIA',passes:'Passed checks'};
    $('.stats').innerHTML = Object.entries(categories).map(([key,label]) => `<button class="stat" data-kind="${key}" aria-pressed="${key===category}"><strong>${report.inventory[key] ? report.inventory[key].reduce((s,r)=>s+r.nodes.length,0) : report.results[key].length}</strong>${label}</button>`).join('');
    root.querySelectorAll('.stat').forEach(b => b.onclick = () => { category=b.dataset.kind; view='Details';selected=null; render(); });
    viewSelect.value = view;
    $('#viewTitle').textContent = view==='Details' ? categories[category] : view;
    const results = $('.results'); results.replaceChildren();
    if (['Details','Contrast','Reference'].includes(view) && report.results.accessLensScanPasses) {
      const passes = report.results.accessLensScanPasses;
      const summary = document.createElement('p'); summary.id = 'scanPassSummary'; summary.className = 'inspection-note';
      summary.textContent = 'Pass 1 — axe: ' + passes.first.elements.incomplete + ' inconclusive element check(s). Pass 2 — Access Lens: ' + passes.second.passed + ' passed; ' + passes.second.failed + ' failed; ' + passes.second.unresolved + ' unresolved (' + passes.second.unsupported + ' without a supported automatic measurement). Missing automated coverage still requires criterion review.'; results.append(summary);
      if (report.results.incomplete.some(rule => rule.id === 'color-contrast' && rule.nodes.some(node => ['off-screen','limit-reached'].includes(node.secondPass?.reason)))) { const button=document.createElement('button'); button.id='continueContrast'; button.textContent='Continue contrast measurements'; button.onclick=continueContrastScan; results.append(button); }
    }
    if (view === 'Keyboard test') { renderKeyboard(results); position(); return; }
    if (view === 'Additional checks') { renderAdditional(results); position(); return; }
    if (view === 'Site report') {
      const folderNote = document.createElement('p'); folderNote.textContent = 'Choose your scan folder in Settings. This report reads saved JSON for the current site. Refresh after AI fixes, rescans, or manual edits to the files.'; results.append(folderNote);
      const refresh = document.createElement('button'); refresh.id = 'refreshSiteReport'; refresh.textContent = siteReportLoading ? 'Reading saved reports…' : 'Refresh report from folder'; refresh.disabled = siteReportLoading;
      refresh.onclick = loadSavedSiteReport; results.append(refresh);
      if (siteReportError) { const error = document.createElement('p'); error.id = 'siteReportError'; error.setAttribute('role', 'status'); error.textContent = siteReportError; results.append(error); }
      if (savedSiteReportResult) {
        const saved = savedSiteReportResult, summary = saved.summary;
        const notice = document.createElement('p'); notice.id = 'savedSiteReportSummary'; notice.setAttribute('role', 'status');
        notice.textContent = `${saved.sources.partial ? 'Partial report. ' : ''}${summary.pages} saved pages · ${summary.states} states · ${summary.knownUnscannedPages} known pages without saved reports. Recorded evidence only; this does not establish WCAG conformance.`; results.append(notice);
        const evidence = document.createElement('p'); evidence.textContent = `Automated: ${summary.pagesWithAutomatedIssues} pages with issues; ${summary.pagesWithNoDetectedViolations} with no detected violations or incomplete checks. Manual: ${summary.pagesWithManualFailures} pages with failures. ${summary.pagesWithReviewGaps} pages have review gaps; ${summary.recordedReviewComplete} have recorded review complete. ${summary.staleStates} stale states; ${summary.limitedStates} limited states.`; results.append(evidence);
        const files = document.createElement('p'); files.textContent = `Files: ${saved.sources.includedFiles} included; ${saved.sources.duplicateSnapshots} older/duplicate snapshots; ${saved.sources.otherSites} for other sites; ${saved.sources.invalid} invalid; ${saved.sources.unreadable} unreadable; ${saved.sources.oversized} oversized. ${saved.sources.queuedReports || 0} reports queued locally and not included from the queue.${saved.sources.limitReached ? ' Read limit reached; some files were not processed.' : ''}`; results.append(files);
        const changes = document.createElement('p'); changes.textContent = `${summary.noLongerDetected} previous issue occurrences no longer detected in the latest comparisons. Verify fixes; disappearance is not proof of a fix.`; results.append(changes);
        for (const [label, type, extension, data] of [
          ['Export site report JSON', 'application/json', 'json', () => JSON.stringify(saved, null, 2)],
          ['Export site report HTML', 'text/html', 'html', () => accessLensFeatures.siteReportHTML(saved)]
        ]) {
          const button = document.createElement('button'); button.textContent = label;
          button.onclick = () => { const url = URL.createObjectURL(new Blob([data()], { type })); const link = document.createElement('a'); link.href = url; link.download = `access-lens-site-${sitemapContext.site}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
          results.append(button);
        }
        for (const rule of saved.rules) {
          const card = document.createElement('section'); card.className = 'rule';
          const title = document.createElement('h3'); title.textContent = `${rule.id}: ${rule.pages.length} page(s), ${rule.occurrences} occurrence(s)`;
          const fix = document.createElement('p'); fix.textContent = accessLensWorkflow.guidance(rule.id).fix; card.append(title, fix); results.append(card);
        }
        const shared = document.createElement('p'); shared.textContent = `${saved.possibleSharedFixes.length} repeated rule/locator pattern(s) suggest possible shared fixes.`; results.append(shared);
        for (const page of saved.pages) {
          const card = document.createElement('details'); card.className = 'rule';
          const title = document.createElement('summary'); title.textContent = `${new URL(page.pagePath).pathname} · ${page.status} · ${page.states.length} state(s)`; card.append(title);
          for (const state of page.states) {
            const p = document.createElement('p'); p.textContent = `State ${state.filename.slice(12, 24)} · ${state.scannedAt}: ${state.automated.violations} automated issues, ${state.automated.needsReview} checks needing review. Manual: ${state.manual.pass} pass, ${state.manual.fail} fail, ${state.manual.notApplicable} not applicable, ${state.manual.notTested} not tested, ${state.manual.needsRevalidation} need revalidation.${state.keyboard ? ' Keyboard assessment: ' + state.keyboard.reviewStatus + '.' : ''}${state.stale ? ' Stale scan.' : ''}${state.limited ? ' Limited scope.' : ''}`; card.append(p);
            const decisions = document.createElement('ul');
            for (const [id, check] of Object.entries(state.manualChecks)) { const item = document.createElement('li'); item.textContent = `${id}: ${check.status} · reviewed ${check.checkedAt}${state.manualReview[id]?.needsRevalidation ? ' · needs revalidation' : ''}`; decisions.append(item); } card.append(decisions);
          }
          results.append(card);
        }
        if (saved.knownUnscannedPages.length) { const heading = document.createElement('p'); heading.textContent = 'Known pages without saved reports:'; const list = document.createElement('ul'); for (const page of saved.knownUnscannedPages) { const item = document.createElement('li'); item.textContent = page.path || page.id; list.append(item); } results.append(heading, list); }
        position(); return;
      }
      const localHistory = document.createElement('p'); localHistory.textContent = 'Local scan history only: the folder report has not been loaded. The summary and JSON below use browser history.'; results.append(localHistory);
      const summary = accessLensFeatures.siteReport(sitemapData, scanPolicy.staleDays);
      const p = document.createElement('p'); p.textContent = 'Local scan history only; the folder report has not been loaded. Recorded pages and states only. Repeated structural patterns suggest possible shared fixes; they do not prove a shared component.';
      const help = document.createElement('details'); help.className = 'view-help'; const helpTitle = document.createElement('summary'); helpTitle.textContent = 'About this report'; help.append(helpTitle, p); results.append(help);
      const coverage = document.createElement('p'); coverage.textContent = `${summary.coverage.scanned} of ${summary.coverage.discovered} discovered pages scanned; ${summary.coverage.failed} failed, ${summary.coverage.queued} queued, ${summary.coverage.stale} stale, ${summary.coverage.limited} with limited scope.`; results.append(coverage);
      const exportButton = document.createElement('button'); exportButton.textContent = 'Export site report JSON';
      exportButton.onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ sitePath: location.origin, ...summary }, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `access-lens-site-${sitemapContext.site}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      }; results.append(exportButton);
      for (const rule of summary.rules) {
        const card = document.createElement('section'); card.className = 'rule';
        const h = document.createElement('h3'); h.textContent = `${rule.id}: ${rule.pages.length} page(s), ${rule.occurrences} occurrence(s)`; card.append(h);
        const p = document.createElement('p'); p.textContent = accessLensWorkflow.guidance(rule.id).fix; card.append(p); results.append(card);
      }
      const shared = document.createElement('p'); shared.textContent = `${summary.possibleSharedFixes.length} repeated rule/locator pattern(s) across pages. See the exported report for hashed page references.`; results.append(shared);
      if (sitemapError) { const error = document.createElement('p'); error.textContent = sitemapError; results.append(error); }
      position(); return;
    }
    if (view === 'Sitemap') {
      const coverage = accessLensFeatures.summary(sitemapData, scanPolicy.staleDays);
      const coverageText = document.createElement('p'); coverageText.id = 'coverageSummary';
      coverageText.textContent = `Coverage: ${coverage.discovered} discovered · ${coverage.scanned} scanned · ${coverage.unscanned} unscanned · ${coverage.failed} failed · ${coverage.interrupted} interrupted · ${coverage.queued} queued · ${coverage.excluded} excluded · ${coverage.stale} stale · ${coverage.limited} limited. Last scan: ${coverage.lastScan ? new Date(coverage.lastScan).toLocaleString() : 'none'}.`;
      results.append(coverageText);
      const note = document.createElement('p'); note.className = 'inspection-note';
      note.textContent = 'Discovered same-site links and scanned pages, not a complete crawl. × Issues found · ✓ No detected issues · ! Needs review · ? Not scanned. Green does not establish accessibility conformance. All scanned states contribute to each page’s status.';
      const privacy = document.createElement('p'); privacy.className = 'inspection-note';
      privacy.textContent = 'Page paths, hashed relationships, diagnostic counts, and rule/structural fingerprints are stored. Query strings, fragments, page titles, and link text are excluded. Older entries show a hash until rediscovered. Configure query/hash route identity in Settings for application screens.';
      const help = document.createElement('details'); help.className = 'view-help'; const helpTitle = document.createElement('summary'); helpTitle.textContent = 'Legend and scope'; help.append(helpTitle, note, privacy); results.append(help);
      for (const [title, clear] of [['Refresh sitemap', false], ['Clear sitemap', true]]) {
        const button = document.createElement('button'); button.textContent = title;
        button.onclick = async () => { button.disabled = true; await refreshSitemap(false, clear); if (!disposed) render(); }; results.append(button);
      }
      const exportMap = document.createElement('button'); exportMap.textContent = 'Export sitemap JSON';
      exportMap.onclick = async () => {
        exportMap.disabled = true;
        try {
          if (extensionContext) {
            const response = await accessLensFeatures.sendRuntime({ type: 'access-lens-save-sitemap', site: sitemapContext.site });
            if (response?.saved) { saveStatus.textContent = 'sitemap.json saved to your selected folder.'; return; }
            if (!response?.download) throw new Error(response?.error || 'Could not save sitemap.json. Reload the extension and refresh this page.');
          }
        const data = accessLensFeatures.sitemapExport(sitemapData, scanPolicy.staleDays);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'sitemap.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        saveStatus.textContent = 'sitemap.json download requested.';
        } catch (error) { saveStatus.textContent = `Could not save sitemap.json. ${error.message}`; }
        finally { exportMap.disabled = false; }
      }; results.append(exportMap);
      if (sitemapError) { const error = document.createElement('p'); error.setAttribute('role', 'status'); error.textContent = sitemapError; results.append(error); }
      const nodes = Object.values(sitemapData.nodes);
      const tree = document.createElement('ul'); tree.className = 'sitemap'; tree.setAttribute('aria-label', 'Page scan status');
      const visited = new Set();
      function append(parent, list, depth = 0) {
        if (depth > 30) return;
        const children = nodes.filter(node => node.parent === parent || (parent === null && !sitemapData.nodes[node.parent]));
        children.sort((a, b) => (sitemapContext?.labels.get(a.id)?.path || a.path || a.id).localeCompare(sitemapContext?.labels.get(b.id)?.path || b.path || b.id));
        for (const node of children) {
          if (visited.has(node.id)) continue;
          visited.add(node.id);
          const states = Object.values(node.states || {});
          const violations = states.reduce((sum, state) => sum + state.violations + state.manualFailures, 0);
          const review = states.reduce((sum, state) => sum + state.review, 0);
          const stale = states.some(state => accessLensFeatures.stale(state.scannedAt, scanPolicy.staleDays));
          const limited = states.some(state => state.limited || state.limited === undefined);
          const wcagPending = states.some(state => (state.wcagPending ?? 60) > 0);
          const manualStale = states.some(state => state.manualStale > 0);
          const attemptGap = Object.values(node.attempts || {}).some(attempt => ['failed', 'interrupted', 'queued', 'scanning'].includes(attempt.status));
          const status = violations ? 'issues' : !states.length ? 'unknown' : review || stale || limited || attemptGap || manualStale || wcagPending ? 'review' : 'clean';
          const statuses = { issues: ['×', 'Issues found'], clean: ['✓', 'No detected issues'], review: ['!', 'Needs review'], unknown: ['?', 'Not scanned'] };
          const li = document.createElement('li'); li.dataset.page = node.id; li.dataset.status = status;
          const badge = document.createElement('span'); badge.className = 'sitemap-status ' + status; badge.textContent = statuses[status][0]; badge.setAttribute('aria-label', statuses[status][1]);
          li.append(badge, document.createTextNode(' '));
          const known = sitemapContext?.labels.get(node.id) || (node.path ? { path: node.path, href: location.origin + node.path } : null);
          if (known && node.linked) { const link = document.createElement('a'); link.href = known.href; link.textContent = known.path; li.append(link); }
          else li.append(document.createTextNode(known?.path || `Page ${node.id.slice(0, 12)}…`));
          if (node.id === sitemapContext?.current) li.append(document.createTextNode(' (current)'));
          const detail = document.createElement('small'); detail.textContent = states.length ? ` ${states.length} scanned state(s), ${violations} issue occurrence(s), ${review} needing review` : node.linked ? ' Not scanned' : ' Path group; not scanned'; li.append(detail);
          if (stale || limited || attemptGap) detail.textContent += `${stale ? ' · Stale: revalidate' : ''}${limited ? ' · Limited scan scope' : ''}${attemptGap ? ' · Scan/save gap: see coverage' : ''}`;
          if (wcagPending) detail.textContent += ' · WCAG review incomplete';
          if (manualStale) detail.textContent += ' · Revalidate manual checks';
          if (states.length) {
            const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'State scan details'; details.append(summary);
            for (const [key, state] of Object.entries(node.states)) { const p = document.createElement('p'); p.textContent = `State ${key.slice(0, 8)}: ${state.violations} violations, ${state.manualFailures} manual failures, ${state.review} needing review. Last updated ${new Date(state.scannedAt).toLocaleString()}.`; details.append(p); }
            li.append(details);
          }
          const nested = document.createElement('ul'); append(node.id, nested, depth + 1); if (nested.children.length) li.append(nested);
          list.append(li);
        }
      }
      append(null, tree); results.append(tree);
      if (!nodes.length) { const p = document.createElement('p'); p.textContent = 'No sitemap entries yet. Scan a page or refresh the sitemap.'; results.append(p); }
      position(); return;
    }
    if (view === 'Changes') {
      const note = document.createElement('p'); note.className = 'inspection-note';
      note.textContent = 'Comparison uses rule IDs and structural locators within this page state. DOM moves may appear as new and no longer detected. A missing issue is not proof of a fix; verify manually. Only detected violations are compared.';
      results.append(note);
      if (!comparison) { const p = document.createElement('p'); p.textContent = 'First scan of this page state. Rescan to compare.'; results.append(p); }
      else for (const [key, label] of [['new', 'New'], ['remaining', 'Still present'], ['noLongerDetected', 'No longer detected (verify fix)']]) {
        const section = document.createElement('section'); section.className = 'rule';
        const heading = document.createElement('h3'); heading.textContent = `${label}: ${comparison[key].length}`; section.append(heading);
        for (const issue of comparison[key]) {
          const p = document.createElement('p'); p.textContent = `${issue.rule}: ${issue.target.join(' → ') || 'Locator unavailable'}`; section.append(p);
        }
        results.append(section);
      }
      position(); return;
    }
    if (view === 'Manual') {
      const p = document.createElement('p'); p.className = 'inspection-note'; p.textContent = 'Record human testing for this page state. Results are self-reported and do not establish WCAG conformance. Recheck after changes; prior results may be stale.'; results.append(p);
      const coverage = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays);
      const summary = document.createElement('p'); summary.id = 'wcagCoverageSummary';
      const updateSummary = () => {
        const latest = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays);
        summary.textContent = `WCAG 2.2 AA: ${latest.total} criteria. ${Object.entries(latest.counts).map(([status,count]) => `${count} ${status}`).join(' · ')}. ${latest.reviewComplete ? 'Recorded review complete' : 'Review incomplete'}. Full-page, page-set, and complete-process review required; this is not a conformance certification.`;
      };
      updateSummary(); results.append(summary);
      const scopeNote = document.createElement('p'); scopeNote.textContent = coverage.scope + ' Every criterion requires human review. Automated passes cover individual rules only. Mark Not applicable only after checking the criterion and its exceptions. The six general checks supplement the criterion checklist.'; results.append(scopeNote);
      for (const [id, title, instruction] of accessLensWorkflow.checklist) {
        const label = document.createElement('label'); label.className = 'manual-item'; label.append(document.createTextNode(title));
        const select = document.createElement('select'); select.dataset.check = id;
        for (const [value, text] of [['not-tested', 'Not tested'], ['pass', 'Pass'], ['fail', 'Fail'], ['not-applicable', 'Not applicable']]) {
          const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
        }
        select.value = activeSession.checklist[id]?.status || 'not-tested';
        if (id.startsWith('scope-')) select.querySelector('[value="not-applicable"]').remove();
        const criterion = coverage.criteria.find(c => c.id === id);
        let evidence;
        if (criterion) {
          const reference = document.createElement('a'); reference.href = criterion.reference; reference.target = '_blank'; reference.rel = 'noopener noreferrer'; reference.textContent = 'WCAG requirement and exceptions';
          label.append(document.createTextNode(' '), reference);
          evidence = document.createElement('p'); evidence.className = 'criterion-evidence'; evidence.dataset.criterion = id;
          label.append(evidence);
        }
        const updateEvidence = () => {
          if (!evidence) return;
          const current = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays).criteria.find(c => c.id === id);
          evidence.textContent = `${current.status} · ${current.method === 'automated-and-manual' ? 'Automated evidence + human review required' : 'Human review required; no mapped automated result'}. ${Object.entries(current.rules).map(([bucket,ids]) => `${bucket}: ${ids.join(', ') || 'none'}`).join(' · ')}${current.supplemental.length ? '. Additional evidence: ' + current.supplemental.map(check => `${check.check}: ${check.candidates} candidate(s)`).join(', ') : ''}`;
        };
        updateEvidence();
        const prior = activeSession.checklist[id];
        const revalidate = prior && (criterion?.status === 'needs-revalidation' || accessLensFeatures.stale(prior.checkedAt, scanPolicy.staleDays) || Date.parse(prior.checkedAt) < Date.parse(exportReport.scannedAt));
        if (revalidate) label.append(document.createTextNode(' — Revalidate: this result is old or predates the latest scan.'));
        const recordCheck = async () => {
          activeSession.checklist[id] = { status: select.value, checkedAt: new Date().toISOString() };
          exportReport.manualChecks = activeSession.checklist;
          exportReport.wcagCoverage = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays);
          updateSummary(); updateEvidence();
          saveStatus.textContent = 'Checklist changed; export to update your saved JSON.';
          try { await remember(); await refreshSitemap(true); await saveReport(true, true); }
          catch { workflowStatus.textContent = 'Checklist is available in this inspector, but could not be remembered across sessions.'; }
        };
        select.onchange = recordCheck;
        label.append(select, document.createTextNode(instruction)); results.append(label);
        if (revalidate) {
          const confirm = document.createElement('button'); confirm.textContent = `Revalidate ${title}`;
          confirm.onclick = async () => { confirm.disabled = true; await recordCheck(); if (!disposed) render(); };
          results.append(confirm);
        }
      }
      position(); return;
    }
    if(['features','structure','aria'].includes(category) || ['Order','Structure'].includes(view)) { const note=document.createElement('p');note.className='inspection-note';note.textContent=view==='Order'?'Estimated sequential keyboard order (positive tabindex first, then document order). Shadow DOM, browser behavior, and custom widgets require manual verification.':'Informational element inventory. Counts describe page elements, not passed accessibility checks.';results.append(note); }
    if (view === 'Contrast') {
      const count = bucket => report.results[bucket].filter(rule => rule.id === 'color-contrast').reduce((sum, rule) => sum + rule.nodes.length, 0);
      const summary = document.createElement('p'); summary.id = 'contrastSummary';
      summary.textContent = count('violations') + ' text contrast failure(s); ' + count('incomplete') + ' need manual review; ' + count('passes') + ' passed text check(s). These are element checks, not complete contrast coverage. Normal text requires 4.5:1; qualifying large text requires 3:1. Review gradients/images, placeholders, hover/focus states, and non-text contrast (1.4.11) separately. No detected failures does not mean all contrast passes.';
      const automatic = report.results.accessLensContrastAnalysis;
      if (automatic) summary.textContent += ' Automatic background analysis: ' + automatic.status + '; ' + automatic.resolved + ' resolved from ' + automatic.candidates + ' supported candidate(s). Page traversal: ' + (automatic.pageSweep || 'not recorded') + '; ' + (automatic.viewports || 0) + ' viewport(s). Keep this tab active and invoke the extension toolbar button if capture is unavailable.';
      results.append(summary);
    }
    const numbers = new Map(numberedItems().map(({n,number}) => [n,number]));
    for(const rule of currentRules()) {
      if(rule.icon && view!=='Reference') {
        const card=document.createElement('section');card.className='rule '+category;
        const label=document.createElement('label');label.className='group-toggle';const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!hiddenGroups.has(rule.id);toggle.onchange=()=>{toggle.checked?hiddenGroups.delete(rule.id):hiddenGroups.add(rule.id);position();};label.append(toggle,document.createTextNode(`${rule.nodes.length} ${rule.help}`));card.append(label);
        const icons=document.createElement('div');icons.className='icons';rule.nodes.forEach((node,i)=>{const b=document.createElement('button');b.className='icon';b._node=node;b.textContent=view==='Order'?i+1:rule.icon;b.title=`${rule.help}: ${node.text || node.target.join(' → ')}`;b.setAttribute('aria-label',`${rule.help}, element ${i+1}: ${node.text || node.target.join(' → ')}`);b.onclick=()=>inspect(node);icons.append(b);});card.append(icons);results.append(card);continue;
      }
      const needsReview = report.results.incomplete.includes(rule);
      const reviewContrast = needsReview && rule.id === 'color-contrast';
      const reviewTitle = reviewContrast ? 'Contrast measurement gaps — no failure confirmed' : needsReview && rule.id==='link-in-text-block' ? 'Link identification review — no failure confirmed' : rule.help;
      const card = document.createElement('details'); card.className='rule';
      card.innerHTML=`<summary>${escape(reviewTitle)} <span>(${rule.nodes.length})</span></summary><span class="tag">${escape(rule.impact || 'info')}</span>${rule.tags.filter(t=>t.startsWith('wcag')).map(t=>`<span class="tag">${escape(t)}</span>`).join('')}<p>${escape(rule.description)}</p>${rule.helpUrl ? `<a href="${escape(rule.helpUrl)}" target="_blank" rel="noopener noreferrer">Rule reference ↗</a>` : ""}`;
      if (view === 'Contrast' || needsReview) {
        const status = document.createElement('strong'); status.className = 'contrast-status';
        status.textContent = needsReview ? 'Measurement incomplete — no failure confirmed' : 'Detected failure';
        card.prepend(status); if (view === 'Contrast') card.open = true;
      }
      if (!rule.icon) {
        const guidance = accessLensWorkflow.guidance(rule.id);
        const help = document.createElement('section'); help.className = 'fix-guidance';
        const title = document.createElement('strong'); title.textContent = needsReview ? 'Review guidance and verification' : 'Suggested fix and verification'; help.append(title);
        const fix = document.createElement('p'); fix.textContent = reviewContrast ? 'This entry is a measurement gap, not a detected contrast failure. Continue unfinished measurements or inspect the specific second-pass reason below.' : guidance.fix; help.append(fix);
        if (guidance.example && !reviewContrast) { const code = document.createElement('code'); code.textContent = guidance.example; help.append(code); }
        const verify = document.createElement('p'); verify.textContent = reviewContrast ? 'Unsupported effects or text regions remain unresolved; they are not automatically failed or passed.' : guidance.verify; help.append(verify); card.append(help);
      }
      for(const node of rule.nodes) {
        const explanation = needsReview ? [...node.any, ...node.all, ...node.none].map(check => accessLensFeatures.contrastEvidence(check).reason || check.message).filter(Boolean).join(' ') : node.failureSummary;
        const button=document.createElement('button'); button.className='node'; button._node=node; button.innerHTML=`<strong class="issue-number">#${numbers.get(node)}</strong> ${escape(node.target.join(' → '))}<code>${escape(node.html)}</code>${explanation ? `<p>${escape(explanation)}</p>` : ''}`; button.onclick=()=>inspect(node); card.append(button);
        if (rule.id === 'color-contrast') {
          const debugPanel = document.createElement('details'); debugPanel.className = 'contrast-debug';
          const title = document.createElement('summary'); title.textContent = 'Contrast debug'; debugPanel.append(title);
          const note = document.createElement('p'); note.textContent = 'CSS text color is used, so glyph antialiasing is not sampled as foreground. DOM text is hidden during background capture; text baked into images remains. Regions cover line rectangles, not exact glyph shapes. Region-edge proximity does not prove antialiasing. Only fully contained device pixels are sampled. Genuine pixels inside the region are not ignored; thresholds are unchanged.'; debugPanel.append(note);
          for (const check of [...node.any, ...node.all, ...node.none].filter(check => check.id === 'color-contrast')) {
            const debug = accessLensFeatures.contrastDebug(check);
            const data = debug || { source: 'axe-core', measurements: accessLensFeatures.contrastEvidence(check).measurements, secondPass: node.secondPass?.reason || 'not-required', pixelDiagnostics: 'No Access Lens background pixels were measured for this result.' };
            const code = document.createElement('pre'); code.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px'; code.textContent = JSON.stringify(data,null,2); debugPanel.append(code);
            if (debug && check.accessLensDebugPreview?.startsWith('data:image/png;base64,')) { const preview = document.createElement('img'); preview.className = 'contrast-debug-preview'; preview.src = check.accessLensDebugPreview; preview.alt = 'Background-only capture with worst sampled colors marked in magenta; CSS text was hidden.'; preview.style.cssText = 'max-width:100%;height:auto;image-rendering:pixelated'; debugPanel.append(preview); }
            if (debug) { const stats = document.createElement('p'); stats.textContent = debug.belowThresholdPixels + ' / ' + debug.sampledPixels + ' pixels below threshold (' + (debug.sampledPixels ? 100 * debug.belowThresholdPixels / debug.sampledPixels : 0).toFixed(3) + '%). ' + debug.edgeBandBelowThresholdPixels + ' in the 2 CSS px region-edge band; ' + debug.interiorBelowThresholdPixels + ' in the interior.'; title.after(stats); }
          }
          card.append(debugPanel);
        }
        const textRuns = [...node.any,...node.all,...node.none].find(check=>check.data?.textRunSummary)?.data.textRunSummary;
        if (textRuns) { const runs=document.createElement('p'); runs.className='text-run-summary'; runs.textContent='Nested text: '+textRuns.passed+' passed, '+textRuns.failed+' failed, '+textRuns.unresolved+' unresolved across '+textRuns.total+' run(s). Pixel diagnostics describe a representative run.'; card.append(runs); }
        const linkEvidence=[...node.any,...node.all,...node.none].find(check=>check.data?.linkDistinction)?.data.linkDistinction;
        if(linkEvidence){const evidence=document.createElement('p');evidence.className='link-distinction';evidence.textContent='Link identification: '+linkEvidence.method+'. '+linkEvidence.staticTextStyles+' surrounding non-link text style(s).'+(linkEvidence.minimumLinkToTextRatio!==undefined?' Link versus surrounding text: '+linkEvidence.minimumLinkToTextRatio.toFixed(3)+':1 (color-only technique uses 3:1; hover/focus cues remain unverified).':'')+' This result does not pass the separate text/background contrast criterion.';card.append(evidence);}
        if (node.secondPass) {
          const provenance = document.createElement('p'); provenance.className = 'second-pass-result';
          provenance.textContent = 'Pass 1: axe inconclusive. Pass 2: Access Lens — ' + node.secondPass.status + '. ' + accessLensFeatures.reviewReason(node.secondPass.reason); card.append(provenance);
        }
        if (needsReview && rule.id === 'color-contrast' && globalThis.accessLensContrast) {
          const sampleButton = document.createElement('button'); sampleButton.type = 'button'; sampleButton.className = 'sample-contrast'; sampleButton.textContent = 'Sample rendered background';
          const samplePanel = document.createElement('section'); samplePanel.className = 'contrast-sampler';
          const previous = [...node.any, ...node.all, ...node.none].find(check => check.renderedSample)?.renderedSample;
          if (previous) { const result = document.createElement('p'); result.textContent = 'Previous sampled ratio ' + previous.contrastRatio.toFixed(3) + ':1; required ' + previous.expectedContrastRatio + ':1. Manual review still required.'; samplePanel.append(result); }
          sampleButton.onclick = async () => {
            sampleButton.disabled = true;
            const scanSnapshot = exportReport;
            await accessLensContrast.show(samplePanel, () => captureContrastElement(node), async sample => {
              if (disposed || exportReport !== scanSnapshot) throw new Error('This scan changed. Sample the current result again.');
              for (const check of [...node.any, ...node.all, ...node.none].filter(check => check.id === 'color-contrast')) { if (sample) check.renderedSample = sample; else delete check.renderedSample; }
              const exportedNode = exportReport.results.incomplete.find(result => result.id === rule.id)?.nodes[rule.nodes.indexOf(node)];
              if (exportedNode) for (const check of [...exportedNode.any, ...exportedNode.all, ...exportedNode.none].filter(check => check.id === 'color-contrast')) { if (sample) check.renderedSample = sample; else delete check.renderedSample; }
              saveStatus.textContent = 'Contrast sample updated; export JSON to retain it. Manual review remains required.';
              await saveReport(true, true);
            });
            if (!disposed) sampleButton.disabled = false;
          };
          card.append(sampleButton, samplePanel);
        }
        if (view === 'Contrast') for (const check of [...node.any, ...node.all, ...node.none].filter(check => check.id === 'color-contrast')) {
          const evidence = accessLensFeatures.contrastEvidence(check), measured = evidence.measurements;
          const details = document.createElement('p'); details.className = 'contrast-measurement';
          details.textContent = (measured.contrastRatio ? 'Measured ' + measured.contrastRatio + ':1. ' : 'Contrast ratio unavailable. ') + (measured.expectedContrastRatio ? 'Required ' + measured.expectedContrastRatio + ':1. ' : '') + (measured.fgColor ? 'Foreground ' + measured.fgColor + '. ' : '') + (measured.bgColor ? 'Background ' + measured.bgColor + '. ' : '') + (evidence.reason || check.message || '');
          card.append(details);
        }
      }
      results.append(card);
    }
    if(!results.children.length) results.innerHTML='<div class="status">No checks in this category.</div>';
    position();
  }
  async function scan() {
    if ($('#scan').disabled) return;
    stateSlot.disabled = true;
    const scannedAddress = location.href;
    $('#scan').disabled=true; $('#export').disabled=true; selected=null; report=null; exportReport=null; $('#overlay').replaceChildren(); $('.stats').replaceChildren(); $('.results').innerHTML='<div class="status">Analyzing the current page…</div>';
    try {
      scanPolicy = accessLensFeatures.policy({}, scannedAddress);
      if (extensionContext && !globalThis.chrome?.runtime?.id) throw new Error('EXTENSION_CONTEXT_UNAVAILABLE');
      if (globalThis.chrome?.runtime?.id) {
        const configured = await accessLensFeatures.sendRuntime({ type: 'access-lens-policy', address: scannedAddress });
        if (configured?.error) throw new Error('Could not load scan controls. Reload the extension and page.');
        if (configured?.identity) scanPolicy = configured;
      }
      globalThis.accessLensIdentity = scanPolicy.identity || {};
      pauseButton.textContent = scanPolicy.paused ? 'Resume browsing scans' : 'Pause browsing scans';
      const map = await accessLensWorkflow.sitemap(scannedAddress, !scanPolicy.excluded), state = scanPolicy.excluded ? { key: '0'.repeat(64) } : await accessLensWorkflow.state(stateSlot.value);
      manualAttempt = { site: map.site, nodes: map.nodes, page: map.current, state: state.key };
      if (globalThis.chrome?.runtime?.id) await accessLensFeatures.sendRuntime({ type: 'access-lens-sitemap', site: map.site, update: { ...manualAttempt, status: scanPolicy.excluded ? 'excluded' : 'scanning' } });
      if (scanPolicy.excluded) throw new Error('This path is excluded in Settings. Remove the exclusion before scanning.');
      while (globalThis.__accessLensScanLock && !disposed) await new Promise(resolve => setTimeout(resolve, 100));
      if (disposed) return;
      globalThis.__accessLensScanLock = true;
      const scanStarted = Date.now();
      let results;
      try { results=await accessLensFeatures.runAxe({exclude:[host]}); }
      finally { globalThis.__accessLensScanLock = false; }
      if (location.href !== scannedAddress) throw new Error('The page changed during scanning. Scan the current page again.');
      if(disposed) return;
      report={schemaVersion:'1.1',tool:{name:'Access Lens',version: '1.12.0',engine:results.testEngine},page:{url:location.href,title:document.title},scannedAt:results.timestamp,scope:{description:'Rendered top-level document, including supported open shadow roots. Embedded frames excluded. Informational inventories also include hidden elements; keyboard order is estimated.',standard:'WCAG 2.2 Level A/AA',limitations:['Automated checks do not establish WCAG conformance.','Scan again after changing page content.','Embedded frames and closed shadow roots are not analyzed.']},summary:Object.fromEntries(Object.keys(labels).map(k=>[k,{rules:results[k].length,elements:results[k].reduce((s,r)=>s+r.nodes.length,0)}])),inventory:globalThis.accessLensInventory(),results};
      exportReport=globalThis.accessLensExport(report, scannedAddress);
      exportReport.completeness.durationMs = Date.now() - scanStarted;
      exportReport.pageState = await accessLensWorkflow.state(stateSlot.value);
      manualAttempt.state = exportReport.pageState.key;
      exportFilename=await globalThis.accessLensFilename(scannedAddress, exportReport.pageState.key);
      exportReport.pageIdentity.pageKey = (await accessLensFilename(scannedAddress)).slice(12, -5);
      currentBaseline = accessLensWorkflow.baseline(exportReport);
      activeSession = sessions.get(exportFilename);
      workflowStatus.textContent = '';
      if (!activeSession && globalThis.chrome?.runtime?.id) {
        try {
          const previous = await accessLensFeatures.sendRuntime({ type: 'access-lens-history', filename: exportFilename });
          if (previous?.error) throw new Error();
          activeSession = { baseline: previous.baseline, checklist: previous.checklist || {} };
          if (previous.keyboardTest) exportReport.keyboardTest = previous.keyboardTest;
        } catch { throw new Error('Previous decisions could not be read. Restore folder access in Settings or check the saved JSON, then scan again. The saved report has not been replaced.'); }
      }
      comparison = accessLensWorkflow.compare(activeSession?.baseline, currentBaseline);
      activeSession ||= { checklist: {} };
      exportReport.manualChecks = activeSession.checklist;
      if (globalThis.accessLensKeyboard && globalThis.chrome?.runtime?.id) {
        try {
          const previousKeyboard = await keyboardMessage('latest');
          if (previousKeyboard.run && (!exportReport.keyboardTest || Date.parse(previousKeyboard.run.startedAt) >= Date.parse(exportReport.keyboardTest.startedAt))) exportReport.keyboardTest = previousKeyboard.run;
        } catch { /* Scanning is available even if keyboard recovery is unavailable. */ }
      }
      exportReport.comparison = comparison;
      const stateInfo = exportReport.pageState;
      workflowStatus.textContent += ` State ${stateSlot.value}: ${stateInfo.dialogs} dialogs, ${stateInfo.selectedTabs} selected tabs, ${stateInfo.expandedControls} expanded controls. ` + (comparison ? `${comparison.new.length} new, ${comparison.remaining.length} still present, ${comparison.noLongerDetected.length} no longer detected.` : 'First scan of this state.');
      if (exportReport.completeness.status === 'limited') workflowStatus.textContent += ` Limited scope: ${exportReport.completeness.excludedFrames} excluded frames; ${exportReport.completeness.hiddenTabPanels} hidden tab panels need separate scans.`;
      if (exportReport.completeness.assetPreloadStatus === 'failed' || exportReport.completeness.mediaMetadataUnavailable) workflowStatus.textContent += ' Some stylesheet/media assets could not be preloaded; related checks need review.';
      try { await remember(); } catch { workflowStatus.textContent += ' Could not remember history across sessions.'; }
      await refreshSitemap(true);
      if (disposed) return;
      $('#meta').textContent=`${location.hostname || 'Local page'} · ${new Date(results.timestamp).toLocaleTimeString()} · ${results.testEngine.name} ${results.testEngine.version}`; render(); $('#export').disabled=false;
      await saveReport(true);
    } catch(error) {
      if (manualAttempt && globalThis.chrome?.runtime?.id) await accessLensFeatures.sendRuntime({ type: 'access-lens-sitemap', site: manualAttempt.site, update: { ...manualAttempt, status: scanPolicy.excluded ? 'excluded' : 'failed' } }).catch(() => {});
      if(!disposed) $('.results').textContent = accessLensFeatures.contextInvalid(error)
        ? 'The extension was reloaded. Refresh this webpage to reconnect the inspector.'
        : `Scan failed: ${error.message}. Try reloading the page.`;
    }
    finally { if(!disposed) { $('#scan').disabled=false; stateSlot.disabled=false; } }
  }
  $('#scan').onclick=scan;
  $('#markers').onchange=position;
  async function saveReport(automatic = false, decisionsChanged = false) {
    if (!exportReport) return;
    exportReport.wcagCoverage = accessLensWorkflow.coverage(exportReport, scanPolicy.staleDays);
    const snapshot = exportReport;
    const filename = exportFilename;
    retry.hidden = true;
    try {
      if (extensionContext && !globalThis.chrome?.runtime?.id) throw new Error('EXTENSION_CONTEXT_UNAVAILABLE');
      const metadata = { ...manualAttempt, ...(await accessLensFeatures.scanMetadata(snapshot, scanPolicy.staleDays)),
        state: snapshot.pageState.key,
        violations: snapshot.results.violations.reduce((sum, rule) => sum + rule.nodes.length, 0),
        review: snapshot.results.incomplete.reduce((sum, rule) => sum + rule.nodes.length, 0),
        manualFailures: Object.values(snapshot.manualChecks || {}).filter(check => check.status === 'fail').length + (snapshot.keyboardTest?.assessment?.status === 'fail' ? 1 : 0) };
      // Direct script injection is used by the browser tests; installed extensions use the worker.
      const response = globalThis.chrome?.runtime?.id
        ? await accessLensFeatures.sendRuntime({ type: 'access-lens-save', report: snapshot, filename, automatic, decisionsChanged, metadata })
        : automatic ? { skipped: true } : { download: true };
      if (disposed) return;
      if (!response) throw new Error();
      if (response.review && snapshot === exportReport && filename === exportFilename) {
        for (const [id, check] of Object.entries(response.review.checklist || {})) if (!activeSession.checklist[id] || Date.parse(check.checkedAt) >= Date.parse(activeSession.checklist[id].checkedAt)) activeSession.checklist[id] = check;
        snapshot.manualChecks = activeSession.checklist;
        if (response.review.keyboardTest && (!snapshot.keyboardTest || Date.parse(response.review.keyboardTest.startedAt) >= Date.parse(snapshot.keyboardTest.startedAt))) snapshot.keyboardTest = response.review.keyboardTest;
        snapshot.wcagCoverage = accessLensWorkflow.coverage(snapshot, scanPolicy.staleDays);
        if (view === 'Manual' || view === 'Keyboard test') render();
      }
      if (response.queued) {
        saveStatus.textContent = `JSON queued locally for retry. ${response.error || 'Restore folder access in Settings.'}`;
        retry.hidden = false;
        await refreshSitemap();
        return;
      }
      if (response.error) {
        saveStatus.textContent = `Could not save JSON. ${response.error}`;
        retry.hidden = false;
        return;
      }
      if (response.skipped && decisionsChanged) saveStatus.textContent = 'Choices updated. Choose a save folder in Settings to save them automatically, or Export JSON.';
      if (response?.saved) {
        saveStatus.textContent = automatic ? 'JSON auto saved to your selected folder.' : 'JSON saved to your selected folder.';
        saveDetail.textContent = `Last successful save: ${new Date().toLocaleString()} · ${filename}`;
      }
      else if (response?.download) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url;
        link.download = filename;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        saveStatus.textContent = 'JSON sent to browser downloads.';
        saveDetail.textContent = `Last download requested: ${new Date().toLocaleString()} · ${filename}. Check browser downloads for completion.`;
      }
    } catch (error) {
      if (!disposed) {
        saveStatus.textContent = accessLensFeatures.contextInvalid(error)
          ? 'Could not save JSON. The extension was reloaded. Refresh this webpage to reconnect.'
          : 'Could not save JSON. Check folder access and available disk space in Settings, then retry.';
        retry.hidden = false;
      }
    }
  }
  $('#export').onclick=()=>saveReport();
  function close() { spacingController?.abort(); keyboardController?.abort(); if (keyboardToken) keyboardMessage('end', { token: keyboardToken }).catch(() => {}); disposed=true; statusObserver.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll',position,true); window.removeEventListener('resize',position); window.removeEventListener('pagehide',onPageHide); host.remove(); delete globalThis.__accessLens; }
  $('[aria-label="Close analyzer"]').onclick=close; globalThis.__accessLens=close;
  window.addEventListener('scroll',position,true); window.addEventListener('resize',position);
  const onPageHide = async () => {
    spacingController?.abort();
    keyboardController?.abort();
    if (keyboardToken) keyboardMessage('end', { token: keyboardToken }).catch(() => {});
    try {
      if (manualAttempt && $('#scan').disabled && globalThis.chrome?.runtime?.id) await accessLensFeatures.sendRuntime({ type: 'access-lens-sitemap', site: manualAttempt.site, update: { ...manualAttempt, status: 'interrupted' } });
    } catch { /* Reloaded extensions cannot receive final page messages. */ }
  };
  window.addEventListener('pagehide', onPageHide);
  scan();
})();










