globalThis.accessLensFeatures = {
  async sendRuntime(message) {
    // An async boundary also catches synchronous "Extension context invalidated" throws.
    return await chrome.runtime.sendMessage(message);
  },
  contextInvalid(error) { return /Extension context invalidated|EXTENSION_CONTEXT_UNAVAILABLE/i.test(error?.message || ''); },
  scanOptions() {
    // Select only rules mapped to active WCAG 2.2 A/AA criteria. Some legacy
    // engine rules still carry the removed 4.1.1 tag; tags alone are insufficient.
    const levels = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
    const criteria = new Set(accessLensWorkflow.criteria.map(criterion => 'wcag' + criterion.id.replaceAll('.', '')));
    const rules = axe.getRules(levels).filter(rule => rule.tags.some(tag => criteria.has(tag)));
    return { runOnly: { type: 'rule', values: rules.map(rule => rule.ruleId) }, iframes: false };
  },
  async runAxe(context, options = {}) {
    // Excluding our DOM from axe does not exclude it from browser hit testing.
    // Remove the fixed inspector and all shadow overlays from rendering while
    // axe measures the page, including when markers are enabled during a rescan.
    const inspector = document.getElementById('access-lens-extension');
    const wasMeasuring = globalThis.__accessLensMeasuring;
    globalThis.__accessLensMeasuring = true;
    const overlay = inspector?.shadowRoot?.querySelector('#overlay');
    const annotations = document.createDocumentFragment();
    if (overlay) while (overlay.firstChild) annotations.append(overlay.firstChild);
    const display = inspector?.style.getPropertyValue('display');
    const priority = inspector?.style.getPropertyPriority('display');
    inspector?.style.setProperty('display', 'none', 'important');
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
      const results = await axe.run(context, { ...options, ...this.scanOptions() });
      await this.secondPass(results);
      results.accessLensEngineDiagnostics = diagnostics;
      return results;
    } finally {
      if (inspector?.style.getPropertyValue('display') === 'none' && inspector.style.getPropertyPriority('display') === 'important') {
        if (display) inspector.style.setProperty('display', display, priority);
        else inspector.style.removeProperty('display');
      }
      if (overlay) overlay.append(annotations);
      if (wasMeasuring === undefined) delete globalThis.__accessLensMeasuring; else globalThis.__accessLensMeasuring = wasMeasuring;
      active = false;
      if (console.warn === capture) console.warn = original;
    }
  },
  async resolveLinks(results) {
    const rule = results.incomplete.find(rule => rule.id === 'link-in-text-block');
    if (!rule) return;
    const block = el => ['block','list-item','flex','grid','inline-block'].includes(getComputedStyle(el).display) || getComputedStyle(el).display.startsWith('table');
    for (const node of [...rule.nodes]) {
      const check = [...node.any,...node.all,...node.none].find(check => check.id === 'link-in-text-block');
      if (!check) continue;
      if (node.secondPass) Object.assign(node.secondPass,{attempted:true,reason:'link-context-unsupported'});
      try {
        let scope=document, link;
        for (const selector of node.target.flat(20)) { link=scope.querySelector(selector); scope=link?.shadowRoot || link; }
        if (!link || link.localName !== 'a' || !link.getClientRects().length || getComputedStyle(link).visibility !== 'visible') continue;
        let context=link.parentElement;
        while(context && !['li','p','nav','td','th','h1','h2','h3','h4','h5','h6'].includes(context.localName) && !block(context)) context=context.parentElement;
        if (!context) continue;
        const staticOwners=new Set(), walker=document.createTreeWalker(context,NodeFilter.SHOW_TEXT);
        let text, count=0, limited=false;
        while((text=walker.nextNode())) {
          if (++count>200) { limited=true; break; }
          const owner=text.parentElement;
          if (!text.textContent.trim() || owner.closest('a,script,style,noscript,template') || !owner.getClientRects().length || getComputedStyle(owner).visibility !== 'visible') continue;
          const range=document.createRange(); range.selectNodeContents(text);
          if ([...range.getClientRects()].some(rect=>rect.width && rect.height)) staticOwners.add(owner);
        }
        // Generated prose must not be mistaken for an isolated label.
        let generated=false;
        for(const element of [context,...context.querySelectorAll('*')].slice(0,201)) for(const pseudo of ['::before','::after']) {
          const content=getComputedStyle(element,pseudo).content;
          if(!['none','normal'].includes(content) && content.slice(1,-1).trim()) generated=true;
        }
        const style=getComputedStyle(link), parentStyle=getComputedStyle(context);
        let ancestorUnderlined=false;
        for(let ancestor=link.parentElement;ancestor;ancestor=ancestor.parentElement || ancestor.getRootNode().host) if(getComputedStyle(ancestor).textDecorationLine.includes('underline')) ancestorUnderlined=true;
        const readabilityPassed=results.passes.some(rule=>rule.id==='color-contrast'&&rule.nodes.some(item=>JSON.stringify(item.target)===JSON.stringify(node.target)));
        const underline=readabilityPassed && !link.matches(':hover,:focus,:focus-visible') && style.textDecorationLine.includes('underline') && !ancestorUnderlined && style.textDecorationStyle !== 'none' && style.textDecorationThickness !== '0px' && style.textDecorationColor === style.color && Number(style.opacity)===1;
        limited ||= context.querySelectorAll('*').length>200;
        const isolated=!limited && !generated && !staticOwners.size;
        const evidence={method:isolated?'isolated-link-context':underline?'persistent-underline':'unverified-link-cue',contextType:['li','p','nav','td','th','h1','h2','h3','h4','h5','h6'].includes(context.localName)?context.localName:'block',staticTextStyles:staticOwners.size,limited,hoverFocusVerified:false};
        if(globalThis.accessLensContrast) try {
          const foreground=accessLensContrast.foreground(link,{allowTextShadow:true}).fgColor;
          const ratios=[...staticOwners].map(owner=>accessLensContrast.ratio(foreground,accessLensContrast.foreground(owner,{allowTextShadow:true}).fgColor));
          if(ratios.length) { evidence.minimumLinkToTextRatio=Math.min(...ratios); evidence.requiredLinkToTextRatio=3; }
        } catch { /* The context/underline checks do not depend on a guessed color. */ }
        check.data={...check.data,linkDistinction:evidence};
        if(!isolated && !underline) { if(node.secondPass) node.secondPass.reason='link-cue-unverified'; continue; }
        let destination=results.passes.find(result=>result.id===rule.id);
        if(!destination){destination={...rule,nodes:[]};results.passes.push(destination);}
        destination.nodes.push(node);rule.nodes=rule.nodes.filter(item=>item!==node);
      } catch { /* Keep original review if its context cannot be inspected. */ }
    }
    results.incomplete=results.incomplete.filter(rule=>rule.nodes.length);
  },
  async finishScan(results) {
    const started = performance.now();
    for (let batch = 0; batch < 6 && performance.now() - started < 90000; batch++) {
      const pending = () => results.incomplete.filter(rule => rule.id === 'color-contrast').flatMap(rule => rule.nodes).filter(node => ['off-screen','limit-reached'].includes(node.secondPass?.reason)).length;
      if (!pending()) break;
      const before = results.accessLensScanPasses?.second?.unresolved;
      await this.continueScan(results);
      if (results.accessLensContrastAnalysis?.interrupted || results.accessLensScanPasses?.second?.unresolved >= before) break;
    }
  },
  async continueScan(results) {
    if (globalThis.__accessLensScanLock) throw new Error('A scan is already running.');
    const inspector = document.getElementById('access-lens-extension'), overlay = inspector?.shadowRoot?.querySelector('#overlay');
    const annotations = document.createDocumentFragment();
    const display = inspector?.style.getPropertyValue('display'), priority = inspector?.style.getPropertyPriority('display'), measuring = globalThis.__accessLensMeasuring;
    const previous = results.accessLensScanPasses ? structuredClone(results.accessLensScanPasses) : null;
    globalThis.__accessLensScanLock = true; globalThis.__accessLensMeasuring = true;
    if (overlay) while (overlay.firstChild) annotations.append(overlay.firstChild);
    inspector?.style.setProperty('display','none','important');
    try {
      await this.secondPass(results);
      if (previous) {
        const nodes = ['violations','passes','incomplete'].flatMap(bucket => results[bucket].flatMap(rule => rule.nodes)).filter(node => node.secondPass);
        results.accessLensScanPasses.first = previous.first;
        const second = results.accessLensScanPasses.second;
        second.considered = previous.second.considered; second.attempted = nodes.filter(node => node.secondPass.attempted).length;
        second.passed = nodes.filter(node => node.secondPass.status === 'pass').length; second.failed = nodes.filter(node => node.secondPass.status === 'fail').length;
        second.unresolved = second.considered - second.passed - second.failed; second.handlerFailures += previous.second.handlerFailures;
        second.continuations = (previous.second.continuations || 0) + 1;
      }
    } finally {
      if (display) inspector.style.setProperty('display',display,priority); else inspector?.style.removeProperty('display');
      if (overlay) overlay.append(annotations);
      if (measuring === undefined) delete globalThis.__accessLensMeasuring; else globalThis.__accessLensMeasuring = measuring;
      globalThis.__accessLensScanLock = false;
    }
  },
  secondPassReasons: {
    'link-context-unsupported': 'The surrounding link context could not be assessed automatically.',
    'link-cue-unverified': 'This is a link-identification check, not text/background contrast. A persistent non-color cue or appropriate hover/focus behavior still needs verification.',
    'no-handler': 'No reliable automatic resolver exists for this rule; human evaluation is required.',
    'module-unavailable': 'The automatic measurement module is unavailable. Reload the extension and page.',
    'capture-unavailable': 'Screenshot capture was unavailable or failed. Keep the tab active and invoke the extension toolbar button.',
    'page-unavailable': 'This measurement requires an active visible page without pinch zoom.',
    'engine-exception': 'The sampled background does not establish a pass, but axe returned a special-case review. A failure was not inferred from that exception.',
    'unsupported-check': 'This contrast case is not supported by the rendered-background measurement.',
    'text-run-limit': 'The nested parent exceeds the supported number of text runs. Split the inspection into smaller regions.',
    'unsupported-element': 'This element has nested or unsupported text rendering.',
    'generated-text': 'The selected text element itself contains generated text that cannot be hidden independently for this measurement.',
    'animated-content': 'An animation or transition is currently running on the text or its ancestor. Rescan after it stops.',
    'input-geometry': 'The native input text has unsupported spacing, alignment, or dimensions for automatic measurement.',
    'unsupported-css': 'CSS effects, generated content, animation, or font settings prevent a reliable measurement.',
    'insufficient-sample-area': 'A text region is too small to contain a complete screenshot pixel. It cannot be measured reliably.',
    'off-screen': 'Some text is outside the current viewport. Scroll it fully into view and rescan.',
    'obscured': 'Another element covers part of this text.',
    'limit-reached': 'The automatic measurement limit was reached. Unmeasured items remain unresolved.',
    'element-removed': 'The text element was removed during capture.',
    'inline-style-changed': 'Page scripts changed the element inline styles during capture.',
    'computed-style-changed': 'Computed CSS or animation state changed during capture. The background measurement was discarded.',
    'text-hide-blocked': 'The browser did not hide the text fill as requested, so the background could not be measured separately.',
    'text-layout-changed': 'The text position, size, or line wrapping changed during capture.',
    'changed-during-scan': 'The element or page changed during measurement. Rescan the stable page.',
    'mixed-background': 'The background includes both passing and failing color pairs; a reliable whole-text decision was not established.',
    'shadow-dependent': 'Text may depend on a shadow for contrast, so a background-only failure cannot be confirmed.',
    'handler-failed': 'The second-pass resolver failed. The original axe review was preserved.',
    'resolved': 'Access Lens resolved the original axe review using additional automatic measurement.'
  },
  reviewReason(code) { return this.secondPassReasons[code] || this.secondPassReasons['unsupported-check']; },
  async secondPass(results) {
    const buckets = ['violations','incomplete','passes','inapplicable'];
    if (!buckets.every(bucket => Array.isArray(results[bucket]))) return;
    const count = bucket => results[bucket].reduce((sum, rule) => sum + rule.nodes.length, 0);
    const first = Object.fromEntries(buckets.map(bucket => [bucket, count(bucket)]));
    const summary = results.accessLensScanPasses = { first: { engine: 'axe-core', elements: first },
      second: { engine: 'Access Lens', considered: first.incomplete, attempted: 0, passed: 0, failed: 0, unresolved: first.incomplete, unsupported: 0, handlerFailures: 0 },
      limitations: ['The second pass considers axe incomplete results only. Missing automated coverage still requires criterion review.', 'A rule or element pass is not a full WCAG criterion pass.'] };
    let next = Math.max(0, ...buckets.flatMap(bucket => results[bucket].flatMap(rule => rule.nodes.map(node => Number.isInteger(node.secondPass?.id) ? node.secondPass.id : 0))));
    const originals = [];
    for (const rule of results.incomplete) for (const node of rule.nodes) {
      node.secondPass = { id: ++next, engine: 'Access Lens', initialEngine: 'axe-core', initialStatus: 'incomplete', status: 'unresolved', attempted: false,
        reason: rule.id === 'color-contrast' ? 'module-unavailable' : 'no-handler' };
      originals.push({ rule, node });
    }
    // Providers receive copies. Only original incomplete nodes may change buckets;
    // confirmed axe failures, passes, and inapplicable results stay intact.
    const handlers = [{ rule: 'color-contrast', run: globalThis.accessLensContrast?.automatic?.bind(globalThis.accessLensContrast) }, { rule:'link-in-text-block', run:this.resolveLinks.bind(this) }];
    for (const handler of handlers) {
      const group = originals.filter(item => item.rule.id === handler.rule);
      if (!group.length || !handler.run) continue;
      const working = Object.fromEntries(buckets.map(bucket => [bucket, structuredClone(results[bucket])]));
      try {
        await handler.run(working);
        const found = new Map();
        for (const bucket of buckets) for (const rule of working[bucket]) if (rule.id === handler.rule) for (const node of rule.nodes) {
          if (!node.secondPass?.id) continue;
          if (found.has(node.secondPass.id)) throw new Error('Ambiguous second-pass result');
          found.set(node.secondPass.id, { bucket, node });
        }
        const updates = group.map(item => { const update = found.get(item.node.secondPass.id); if (!update || !['violations','incomplete','passes'].includes(update.bucket)) throw new Error('Missing second-pass result'); return { ...item, ...update, initial: item.node }; });
        for (const item of updates) {
          const { rule, node, bucket } = item;
          const initial = item.initial;
          node.secondPass.status = bucket === 'incomplete' ? 'unresolved' : bucket === 'passes' ? 'pass' : 'fail';
          if (bucket !== 'incomplete') { node.secondPass.attempted = true; node.secondPass.reason = 'resolved'; summary.second[bucket === 'passes' ? 'passed' : 'failed']++; }
          Object.assign(initial, node);
          if (bucket !== 'incomplete') {
            rule.nodes = rule.nodes.filter(current => current !== initial);
            let destination = results[bucket].find(current => current.id === rule.id);
            if (!destination) { destination = { ...rule, nodes: [] }; results[bucket].push(destination); }
            destination.nodes.push(initial);
          }
        }
        if (working.accessLensContrastAnalysis) results.accessLensContrastAnalysis = working.accessLensContrastAnalysis;
      } catch {
        summary.second.handlerFailures++;
        for (const { node } of group) { node.secondPass.reason = 'handler-failed'; node.secondPass.attempted = true; }
      }
    }
    results.incomplete = results.incomplete.filter(rule => rule.nodes.length);
    for (const { node } of originals) {
      if (node.secondPass.attempted) summary.second.attempted++;
      if (['no-handler','module-unavailable','unsupported-check','unsupported-element','unsupported-css','generated-text','input-geometry'].includes(node.secondPass.reason)) summary.second.unsupported++;
    }
    summary.second.unresolved = summary.second.considered - summary.second.passed - summary.second.failed;
  },
  contrastDebug(check) {
    const raw = check?.data?.contrastDebug;
    if (!raw || raw.schemaVersion !== 1 || raw.method !== 'css-text-against-hidden-text-background-regions') return null;
    const debug = { schemaVersion: 1, method: raw.method, foregroundSource: 'computed-css', ...(raw.samplingBounds === 'fully-contained-device-pixels' ? { samplingBounds: raw.samplingBounds } : {}), textShadowSuppressed: raw.textShadowSuppressed === true };
    const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    if (color(raw.fgColor)) debug.fgColor = raw.fgColor;
    const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    for (const key of ['expectedContrastRatio','minimumContrastRatio','maximumContrastRatio','sampledPixels','belowThresholdPixels','edgeBandBelowThresholdPixels','interiorBelowThresholdPixels','minimumInteriorRatio','edgeBandCssPixels','screenshotScaleX','screenshotScaleY']) if (number(raw[key])) debug[key] = raw[key];
    const safeRows = (rows, keys, limit) => (Array.isArray(rows) ? rows : []).slice(0,limit).map(row => Object.fromEntries(keys.filter(key => number(row?.[key]) || key === 'color' && color(row?.color) || key === 'nearRegionEdge' && typeof row?.nearRegionEdge === 'boolean').map(key => [key,row[key]])));
    debug.regions = safeRows(raw.regions, ['index','width','height','pixelWidth','pixelHeight','leftInsetCss','topInsetCss','rightInsetCss','bottomInsetCss'],30);
    debug.histogram = safeRows(raw.histogram, ['color','count','ratio'],8);
    debug.worstSamples = safeRows(raw.worstSamples, ['region','x','y','color','ratio','nearRegionEdge'],8);
    return debug;
  },
  contrastEvidence(check) {
    const source = check?.data || {}, measurements = {};
    if (typeof source.contrastRatio === 'number' && Number.isFinite(source.contrastRatio) && source.contrastRatio >= 1) measurements.contrastRatio = source.contrastRatio;
    const threshold = source.expectedContrastRatio;
    const ratio = typeof threshold === 'number' ? threshold : typeof threshold === 'string' && /^(?:3|4\.5|7):1$/.test(threshold) ? Number.parseFloat(threshold) : null;
    if ([3, 4.5, 7].includes(ratio)) measurements.expectedContrastRatio = ratio;
    for (const name of ['fgColor', 'bgColor']) if (typeof source[name] === 'string' && /^#[0-9a-f]{6}$/i.test(source[name])) measurements[name] = source[name];
    const reasons = {
      equalRatio: 'The engine measured identical foreground/background colors; verify whether the text is intended to be visible.',
      emptyValue: 'The input is empty. Check placeholder styling separately and retest entered text.',
      bgGradient: 'A gradient prevents a reliable automatic background measurement.',
      bgImage: 'A background image prevents a reliable automatic background measurement.'
    };
    return { measurements, reason: reasons[source.messageKey] || null };
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
  // Reduce disk inputs to evidence needed for reporting; never forward page
  // content, alternative text, arbitrary HTML, or cached coverage claims.
  reportEvidence(report, filename) {
    const match = /^(access-lens-([a-f0-9]{64}))(?: \(\d+\))?\.json$/.exec(filename);
    if (!match || !['2.0', '2.1'].includes(report?.schemaVersion) || !['content-free', 'alternative-text-included'].includes(report?.privacy?.mode) || !Number.isFinite(Date.parse(report.scannedAt))) throw new Error('Invalid saved report');
    const address = new URL(report.pagePath);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) throw new Error('Invalid page address');
    address.search = ''; address.hash = '';
    const results = {};
    for (const bucket of ['violations', 'incomplete', 'passes', 'inapplicable']) {
      if (!Array.isArray(report.results?.[bucket]) || report.results[bucket].length > 2000) throw new Error('Invalid scan results');
      results[bucket] = report.results[bucket].map(rule => {
        if (typeof rule.id !== 'string' || !/^[a-z][a-z0-9-]{0,100}$/.test(rule.id) || !Array.isArray(rule.nodes) || rule.nodes.length > 20000 || ['violations','incomplete'].includes(bucket) && !rule.nodes.length) throw new Error('Invalid rule');
        return { id: rule.id, tags: (Array.isArray(rule.tags) ? rule.tags : []).filter(tag => typeof tag === 'string' && /^wcag[0-9a-z]+$/.test(tag)),
          nodes: rule.nodes.map(node => ({ target: (Array.isArray(node.target) ? node.target : []).filter(part => typeof part === 'string' && part.length <= 4000).slice(0, 30) })) };
      });
    }
    const manualChecks = {};
    for (const [id] of accessLensWorkflow.checklist) {
      const check = report.manualChecks?.[id];
      if (!check) continue;
      if (!['not-tested','pass','fail','not-applicable'].includes(check.status) || !Number.isFinite(Date.parse(check.checkedAt)) || (id.startsWith('scope-') && check.status === 'not-applicable')) throw new Error('Invalid manual decision');
      manualChecks[id] = { status: check.status, checkedAt: new Date(check.checkedAt).toISOString() };
    }
    const checks = (Array.isArray(report.supplementalChecks?.checks) ? report.supplementalChecks.checks : []).slice(0, 50).map(check => ({
      id: typeof check.id === 'string' ? check.id.slice(0, 100) : 'additional-check',
      criteria: (Array.isArray(check.criteria) ? check.criteria : []).filter(id => accessLensWorkflow.criteria.some(criterion => criterion.id === id)),
      observations: Array.isArray(check.observations) ? check.observations.slice(0, 100).map(() => ({})) : []
    }));
    const keyboard = report.keyboardTest;
    const keyboardTest = keyboard && { id: typeof keyboard.id === 'string' ? keyboard.id.slice(0, 100) : 'unknown',
      status: ['completed','interrupted'].includes(keyboard.status) ? keyboard.status : 'interrupted',
      scannedAt: keyboard.scannedAt, startedAt: keyboard.startedAt, finishedAt: keyboard.finishedAt,
      entries: Array.isArray(keyboard.entries) ? keyboard.entries.slice(0, 201).map(() => ({})) : [],
      assessment: ['not-reviewed','pass','fail'].includes(keyboard.assessment?.status) && keyboard.assessment.runId === keyboard.id
        ? { status: keyboard.assessment.status, checkedAt: keyboard.assessment.checkedAt, runId: keyboard.id } : { status: 'not-reviewed' } };
    const pageKey = /^[a-f0-9]{64}$/.test(report.pageIdentity?.pageKey || '') ? report.pageIdentity.pageKey : null;
    const evidence = { schemaVersion: '2.0', pagePath: address.href, scannedAt: new Date(report.scannedAt).toISOString(), results, manualChecks,
      completeness: { status: report.completeness?.status === 'completed-for-scope' ? 'completed-for-scope' : 'limited' },
      supplementalChecks: { recordedAt: report.supplementalChecks?.recordedAt, checks },
      ...(keyboardTest ? { keyboardTest } : {}),
      comparison: report.comparison ? Object.fromEntries(['new','remaining','noLongerDetected'].map(key => [key, Array.isArray(report.comparison[key]) ? report.comparison[key].length : 0])) : null
    };
    if (report.textSpacingTest) evidence.textSpacingTest = { criteria: ['1.4.12'], finishedAt: report.textSpacingTest.finishedAt,
      observations: Array.isArray(report.textSpacingTest.observations) ? report.textSpacingTest.observations.slice(0, 100).map(() => ({})) : [] };
    return { filename: match[1] + '.json', sourceFile: filename, pageKey: pageKey || address.href, explicitPageKey: Boolean(pageKey), pagePath: address.href, origin: address.origin, report: evidence };
  },
  savedSiteReport(records, origin, knownMap = { nodes: {} }, days = 7, sources = {}) {
    const latest = new Map(), decisions = new Map(), identities = new Map();
    let duplicates = 0;
    for (const item of records) {
      if (item.origin !== origin) continue;
      const previous = latest.get(item.filename);
      if (previous) duplicates++;
      // Copies with inconsistent page identity cannot silently share a state.
      const identity = identities.get(item.filename);
      if (identity && (identity.pagePath !== item.pagePath || identity.explicitPageKey && item.explicitPageKey && identity.pageKey !== item.pageKey)) throw new Error('Conflicting page identities in saved reports');
      if (!identity || item.explicitPageKey) identities.set(item.filename, { pagePath: item.pagePath, pageKey: item.pageKey, explicitPageKey: item.explicitPageKey });
      if (!previous || Date.parse(item.report.scannedAt) > Date.parse(previous.report.scannedAt)) latest.set(item.filename, item);
      const merged = decisions.get(item.filename) || {};
      for (const [id, check] of Object.entries(item.report.manualChecks)) if (!merged[id] || Date.parse(check.checkedAt) > Date.parse(merged[id].checkedAt)) merged[id] = check;
      decisions.set(item.filename, merged);
    }
    const pages = new Map(), rules = new Map(), patterns = new Map();
    const criteria = accessLensWorkflow.criteria.map(criterion => ({ id: criterion.id, name: criterion.title, counts: {} }));
    for (const selected of latest.values()) {
      const item = { ...selected, pageKey: identities.get(selected.filename).pageKey };
      const report = { ...item.report, manualChecks: decisions.get(item.filename) };
      // A reviewed earlier run remains earlier evidence, never a pass on a new scan.
      const reviewedRuns = records.filter(record => record.filename === item.filename && record.report.keyboardTest)
        .map(record => record.report.keyboardTest).sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0) || (Date.parse(b.assessment.checkedAt) || 0) - (Date.parse(a.assessment.checkedAt) || 0));
      if (reviewedRuns.length) report.keyboardTest = reviewedRuns[0];
      const wcag = accessLensWorkflow.coverage(report, days);
      const manual = { pass: 0, fail: 0, notApplicable: 0, notTested: 0, needsRevalidation: 0 }, manualReview = {};
      for (const [id] of accessLensWorkflow.checklist) {
        const check = report.manualChecks[id];
        const criterion = wcag.criteria.find(criterion => criterion.id === id);
        const needsRevalidation = check && check.status !== 'not-tested' &&
          (this.stale(check.checkedAt, days) || Date.parse(check.checkedAt) < Date.parse(report.scannedAt) || criterion?.status === 'needs-revalidation');
        if (needsRevalidation) manual.needsRevalidation++;
        manualReview[id] = { status: criterion?.status || (needsRevalidation ? 'needs-revalidation' : check?.status || 'not-tested'), needsRevalidation: Boolean(needsRevalidation) };
        const key = { pass: 'pass', fail: 'fail', 'not-applicable': 'notApplicable', 'not-tested': 'notTested' }[check?.status] || 'notTested';
        manual[key]++;
      }
      for (const criterion of wcag.criteria) {
        const aggregate = criteria.find(row => row.id === criterion.id);
        aggregate.counts[criterion.status] = (aggregate.counts[criterion.status] || 0) + 1;
      }
      const count = bucket => report.results[bucket].reduce((sum, rule) => sum + rule.nodes.length, 0);
      const testedRules = ['violations','incomplete','passes'].reduce((sum, bucket) => sum + report.results[bucket].length, 0);
      const automated = { violations: count('violations'), needsReview: count('incomplete'), passedRules: report.results.passes.length, testedRules,
        status: count('violations') ? 'issues-found' : count('incomplete') ? 'needs-review' : !testedRules ? 'not-tested' : 'no-detected-violations' };
      const limited = report.completeness.status !== 'completed-for-scope', stale = this.stale(report.scannedAt, days);
      const status = automated.violations || manual.fail || wcag.keyboardEvidence?.assessment.status === 'fail' ? 'issues-found'
        : !testedRules || automated.needsReview || manual.notTested || manual.needsRevalidation || !wcag.reviewComplete || limited || stale ? 'needs-review' : 'recorded-review-complete';
      const state = { filename: item.filename, sourceFile: item.sourceFile, scannedAt: report.scannedAt, automated, manual, status, stale, limited,
        keyboard: wcag.keyboardEvidence, criteria: wcag.criteria.map(c => ({ id: c.id, status: c.status, manual: c.manual })),
        manualChecks: report.manualChecks, manualReview, comparison: report.comparison };
      const page = pages.get(item.pageKey) || { id: item.pageKey, pagePath: item.pagePath, states: [] };
      page.states.push(state); pages.set(item.pageKey, page);
      for (const rule of report.results.violations) {
        const group = rules.get(rule.id) || { id: rule.id, occurrences: 0, pages: new Set(), states: 0 };
        group.occurrences += rule.nodes.length; group.pages.add(item.pageKey); group.states++; rules.set(rule.id, group);
        for (const node of rule.nodes) {
          if (!node.target.length) continue;
          const key = JSON.stringify([rule.id, node.target]);
          const pattern = patterns.get(key) || { rule: rule.id, pages: new Set() };
          pattern.pages.add(item.pageKey); patterns.set(key, pattern);
        }
      }
    }
    const pageList = [...pages.values()].sort((a, b) => a.pagePath.localeCompare(b.pagePath));
    for (const page of pageList) page.status = page.states.some(state => state.status === 'issues-found') ? 'issues-found' : page.states.every(state => state.status === 'recorded-review-complete') ? 'recorded-review-complete' : 'needs-review';
    const knownPages = Object.values(knownMap.nodes || {}).filter(node => node.linked);
    // Legacy reports lack a hashed page identity. Only those use a path fallback;
    // matching one configured route must not mark every route at that path scanned.
    const legacyPaths = new Set(pageList.filter(page => page.id === page.pagePath).map(page => new URL(page.pagePath).pathname));
    const unscanned = knownPages.filter(node => !pages.has(node.id) && (!node.path || !legacyPaths.has(node.path)));
    const states = pageList.flatMap(page => page.states);
    const summary = { pages: pageList.length, states: states.length,
      pagesWithAutomatedIssues: pageList.filter(page => page.states.some(state => state.automated.violations)).length,
      pagesWithNoDetectedViolations: pageList.filter(page => page.states.every(state => state.automated.status === 'no-detected-violations')).length,
      statesWithoutAutomatedChecks: states.filter(state => !state.automated.testedRules).length,
      pagesWithManualFailures: pageList.filter(page => page.states.some(state => state.manual.fail || state.keyboard?.assessment.status === 'fail')).length,
      pagesNeedingReview: pageList.filter(page => page.status === 'needs-review').length,
      pagesWithReviewGaps: pageList.filter(page => page.states.some(state => !state.automated.testedRules || state.manual.notTested || state.manual.needsRevalidation || state.automated.needsReview || state.limited || state.stale || state.keyboard && state.keyboard.reviewStatus !== 'pass')).length,
      recordedReviewComplete: pageList.filter(page => page.status === 'recorded-review-complete').length,
      staleStates: states.filter(state => state.stale).length, limitedStates: states.filter(state => state.limited).length,
      knownUnscannedPages: unscanned.length,
      noLongerDetected: states.reduce((sum, state) => sum + (state.comparison?.noLongerDetected || 0), 0) };
    const partial = Boolean(sources.invalid || sources.unreadable || sources.oversized || sources.limitReached);
    return { schemaVersion: '2.0', reportType: 'site-review', sitePath: origin, generatedAt: new Date().toISOString(), conformanceEstablished: false,
      sources: { ...sources, selectedStates: states.length, duplicateSnapshots: duplicates, partial }, summary, pages: pageList, criteria,
      knownUnscannedPages: unscanned.map(node => ({ id: node.id, path: node.path || null })),
      recordedCoverage: this.summary(knownMap, days),
      rules: [...rules.values()].map(group => ({ ...group, pages: [...group.pages] })).sort((a, b) => b.pages.length - a.pages.length || b.occurrences - a.occurrences),
      possibleSharedFixes: [...patterns.values()].filter(group => group.pages.size > 1).map(group => ({ rule: group.rule, pages: [...group.pages] })),
      limitations: ['This report describes recorded accessibility evidence, not a compliance percentage or conformance certification.',
        'Only saved pages and states are included. Known unscanned pages come from the local sitemap; other unvisited pages and hidden states are unknown.',
        'Automated passes apply only to tested rules. Manual decisions are self-reported and require revalidation after new scans or evidence.',
        'No longer detected is not proof of a fix. Repeated structural patterns suggest possible shared fixes, not a shared source component.',
        'Unreadable, invalid, oversized, or unprocessed files make this a partial report. Exports include page paths and review metadata, but omit page content and alternative text.'] };
  },
  siteReportHTML(report) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const summary = report.summary;
    const pages = report.pages.map(page => `<section><h2>${escape(page.pagePath)}</h2><p>${escape(page.status)}</p>${page.states.map(state => `<h3>State ${escape(state.filename.slice(12, 24))}</h3><p>Scanned ${escape(state.scannedAt)} · ${state.stale ? 'Stale' : 'Recent'} · ${state.limited ? 'Limited scope' : 'Completed automated scope'}</p><p>Automated: ${state.automated.violations} issue occurrences; ${state.automated.needsReview} checks needing review. Manual: ${state.manual.pass} pass; ${state.manual.fail} fail; ${state.manual.notApplicable} not applicable; ${state.manual.notTested} not tested; ${state.manual.needsRevalidation} need revalidation.</p>${state.keyboard ? `<p>Keyboard assessment: ${escape(state.keyboard.reviewStatus)}</p>` : ''}<details><summary>Manual decisions and review dates</summary><table><thead><tr><th scope="col">Check</th><th scope="col">Decision</th><th scope="col">Reviewed</th></tr></thead><tbody>${accessLensWorkflow.checklist.map(([id, name]) => `<tr><th scope="row">${escape(name)}</th><td>${escape(state.manualChecks[id]?.status || 'not-tested')}</td><td>${escape(state.manualChecks[id]?.checkedAt || '—')}</td></tr>`).join('')}</tbody></table></details>`).join('')}</section>`).join('');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Access Lens site review</title><style>body{font:16px/1.6 system-ui;color:#172b48;background:#fff;max-width:1050px;margin:auto;padding:24px}section{border-top:1px solid #aaa;margin-top:24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border:1px solid #aaa;overflow-wrap:anywhere}h2,p{overflow-wrap:anywhere}summary{cursor:pointer} .notice{padding:16px;background:#fff3cd;color:#382900}</style><main><h1>Site accessibility review</h1><p>${escape(report.sitePath)} · Generated ${escape(report.generatedAt)}</p><p class="notice">${report.sources.partial ? 'Partial report: some files could not be included. ' : ''}Recorded evidence only. This report does not establish WCAG conformance.</p><h2>Coverage and results</h2><p>${summary.pages} saved pages; ${summary.states} page states; ${summary.knownUnscannedPages} known pages without saved reports. ${summary.staleStates} stale states; ${summary.limitedStates} limited states.</p><p>${summary.pagesWithAutomatedIssues} pages with automated issues; ${summary.pagesWithNoDetectedViolations} pages with no detected automated violations or incomplete checks; ${summary.pagesWithManualFailures} pages with manual failures; ${summary.pagesWithReviewGaps} pages with review gaps. ${summary.recordedReviewComplete} pages with recorded review complete.</p><p>${summary.noLongerDetected} previous issue occurrences no longer detected in the latest comparisons; verify fixes manually.</p><details><summary>File coverage</summary><pre>${escape(JSON.stringify(report.sources, null, 2))}</pre></details><h2>Recurring automated issues</h2><ul>${report.rules.map(rule => `<li>${escape(rule.id)}: ${rule.pages.length} pages, ${rule.occurrences} occurrences. ${escape(accessLensWorkflow.guidance(rule.id).fix)}</li>`).join('') || '<li>No automated violations in included reports.</li>'}</ul><h2>Known pages without saved reports</h2><ul>${report.knownUnscannedPages.map(page => `<li>${escape(page.path || page.id)}</li>`).join('') || '<li>None recorded; unvisited pages and states remain unknown.</li>'}</ul>${pages}<h2>Limits</h2><ul>${report.limitations.map(text => `<li>${escape(text)}</li>`).join('')}</ul></main></html>`;
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
