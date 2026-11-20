// The download is constructed from an allowlist, never a copy of raw axe data.
globalThis.accessLensAttribution = value => {
  if (value == null) return null;
  const keys = ['auditorId', 'firstName', 'lastName', 'identityType', 'authenticated'];
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.auditorId || '') ||
      value.identityType !== 'self-declared' || value.authenticated !== false ||
      [value.firstName, value.lastName].some(name => typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('Invalid auditor attribution.');
  return { auditorId: value.auditorId, firstName: value.firstName.trim(), lastName: value.lastName.trim(), identityType: 'self-declared', authenticated: false };
};
globalThis.accessLensFilename = async (address, stateKey = '', configuration = globalThis.accessLensIdentity || {}) => {
  const url = new URL(address);
  // Ignore query strings and fragments, which often contain tokens or transient state.
  const parts = [url.protocol, url.host, url.pathname, stateKey];
  const keys = [...new Set(configuration.queryKeys || [])].sort();
  if (keys.length || configuration.hashRoutes) parts.push(keys.map(key => [key, url.searchParams.getAll(key)]), configuration.hashRoutes ? url.hash : '');
  const identity = JSON.stringify(parts);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `access-lens-${key}.json`;
};
globalThis.accessLensExport = (report, address = report.page?.url || location.href) => {
  const page = new URL(address);
  page.username = ''; page.password = ''; page.search = ''; page.hash = '';
  const completeness = globalThis.accessLensFeatures?.completeness();
  if (completeness) {
    const diagnostics = report.results.accessLensEngineDiagnostics || {};
    completeness.assetPreloadStatus = diagnostics.assetPreloadFailed ? 'failed' : 'no-failure-reported';
    completeness.mediaMetadataUnavailable = Boolean(diagnostics.mediaMetadataUnavailable);
    if (diagnostics.assetPreloadFailed || diagnostics.mediaMetadataUnavailable) {
      completeness.status = 'limited';
      completeness.limitations.push('Some stylesheet/media assets could not be preloaded. Related checks need review.');
    }
  }
  const catalog = new Map(axe.getRules().map(rule => [rule.ruleId, rule]));
  const safeTags = new Set('html head title body main header footer nav section article aside div span p a button input select option textarea label img svg path ul ol li dl dt dd table caption thead tbody tfoot tr th td h1 h2 h3 h4 h5 h6 form fieldset legend video audio source iframe dialog details summary br hr strong em b i canvas slot'.split(' '));
  // One synchronous export represents one DOM snapshot. Never reuse these caches across exports.
  const siblingIndexes = new WeakMap(), structuralTargets = new WeakMap(), elementEvidence = new WeakMap();
  function segment(el) {
    // Custom element names can themselves contain identifiers.
    const tag = safeTags.has(el.localName) ? el.localName : '*';
    const parent = el.parentNode;
    if (parent?.children && !siblingIndexes.has(parent)) {
      siblingIndexes.set(parent, new Map([...parent.children].map((child, index) => [child, index + 1])));
    }
    return tag + ':nth-child(' + (parent?.children ? siblingIndexes.get(parent).get(el) : 1) + ')';
  }
  function structural(el) {
    if (structuralTargets.has(el)) return structuralTargets.get(el);
    const original = el;
    const parts = [];
    while (el?.nodeType === 1) {
      parts.unshift(segment(el));
      if (el.parentElement) el = el.parentElement;
      else {
        const host = el.getRootNode().host;
        const target = host ? [...structural(host), parts.join(' > ')] : [parts.join(' > ')];
        structuralTargets.set(original, target);
        return target;
      }
    }
    return [];
  }
  function element(node) {
    let el;
    try {
      let scope = document;
      for (const selector of (node.target || []).flat(20)) {
        if (typeof selector !== 'string') throw new Error();
        el = scope.querySelector(selector);
        if (!el) break;
        scope = el.shadowRoot || el;
      }
    } catch { el = null; }
    if (!el) return { target: [], locatorAvailable: false };
    if (elementEvidence.has(el)) return elementEvidence.get(el);
    const roles = new Set('alert alertdialog application article banner button cell checkbox columnheader combobox complementary contentinfo definition dialog document feed figure form grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status switch tab table tablist tabpanel term textbox timer toolbar tooltip tree treegrid treeitem'.split(' '));
    const role = (el.getAttribute('role') || '').split(/\s+/).find(value => roles.has(value));
    function references(name) {
      const raw = el.getAttribute(name);
      const ids = raw?.trim().split(/\s+/).filter(Boolean) || [];
      const scope = el.getRootNode();
      const matched = ids.map(id => scope.getElementById?.(id));
      return { present: raw !== null, count: ids.length, valid: ids.length > 0 && matched.every(Boolean), targets: matched.filter(Boolean).map(structural) };
    }
    const style = getComputedStyle(el), box = el.getBoundingClientRect();
    const measurements = { width: box.width, height: box.height };
    for (const property of ['fontSize', 'fontWeight', 'lineHeight', 'outlineWidth']) {
      const number = Number.parseFloat(style[property]);
      if (Number.isFinite(number)) measurements[property] = number;
    }
    const states = {};
    for (const name of ['aria-hidden', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled', 'aria-required', 'aria-invalid', 'aria-busy', 'aria-pressed', 'aria-modal', 'aria-multiselectable', 'aria-readonly']) {
      const value = el.getAttribute(name);
      if (['true', 'false', 'mixed'].includes(value)) states[name] = value;
    }
    const evidence = {
      target: structural(el), locatorAvailable: true,
      elementType: safeTags.has(el.localName) ? el.localName : 'custom-or-other',
      labelPresent: el.hasAttribute('aria-label'),
      labelReferencePresent: el.hasAttribute('aria-labelledby'),
      descriptionReferencePresent: el.hasAttribute('aria-describedby'),
      altPresent: el.hasAttribute('alt'),
      states
      , role: role || null,
      relationships: { parent: el.parentElement ? structural(el.parentElement) : [],
        labels: [...(el.labels || [])].map(structural),
        labelledBy: references('aria-labelledby'), describedBy: references('aria-describedby'),
        controls: references('aria-controls'), owns: references('aria-owns') },
      measurements, focusable: el.tabIndex >= 0, disabled: Boolean(el.disabled)
    };
    elementEvidence.set(el, evidence);
    return evidence;
  }
  function check(c) {
    const data = {};
    if (c.id === 'link-in-text-block') {
      const raw=c.data?.linkDistinction, evidence={};
      if(raw && ['isolated-link-context','persistent-underline','unverified-link-cue'].includes(raw.method)) { evidence.method=raw.method; evidence.contextType=['li','p','nav','td','th','h1','h2','h3','h4','h5','h6'].includes(raw.contextType)?raw.contextType:'block'; evidence.staticTextStyles=Number.isInteger(raw.staticTextStyles)&&raw.staticTextStyles>=0?Math.min(raw.staticTextStyles,200):0; evidence.limited=raw.limited===true; evidence.hoverFocusVerified=false; if(typeof raw.minimumLinkToTextRatio==='number'&&Number.isFinite(raw.minimumLinkToTextRatio)) { evidence.minimumLinkToTextRatio=raw.minimumLinkToTextRatio; evidence.requiredLinkToTextRatio=3; } }
      return { id:c.id,impact:c.impact,measurements:{},...(evidence.method?{linkDistinction:evidence}:{}) };
    }
    // No arbitrary strings, nested objects, relatedNodes, or check messages.
    for (const key of ['contrastRatio', 'fontSize', 'fontWeight', 'expectedContrastRatio']) {
      if (typeof c.data?.[key] === 'number' && Number.isFinite(c.data[key])) data[key] = c.data[key];
    }
    if (c.id === 'color-contrast' && globalThis.accessLensFeatures?.contrastEvidence) {
      const evidence = accessLensFeatures.contrastEvidence(c);
      delete data.contrastRatio;
      delete data.expectedContrastRatio;
      Object.assign(data, evidence.measurements);
      const debug = accessLensFeatures.contrastDebug(c);
      const debugField = debug ? { contrastDebug: debug } : {};
      const reasonKeys = new Set(['bgImage','bgGradient','pseudoContent','bgOverlap','elmPartiallyObscuring','outsideViewport','equalRatio','emptyValue','elmPartiallyObscured','imgNode','fgOnShadowColor','shadowOnBgColor']);
      const originalCode = c.data?.originalReviewCode ?? c.data?.messageKey;
      if (reasonKeys.has(originalCode)) debugField.engineReviewCode = originalCode; else if (typeof originalCode === 'string') debugField.engineReviewCode = 'other';
      const occlusion=c.data?.occlusion;
      if (occlusion && Number.isInteger(occlusion.region) && occlusion.region >= 0 && ['none','descendant','ancestor','unrelated'].includes(occlusion.relation)) debugField.occlusion = { region:occlusion.region, relation:occlusion.relation, blockerTag:['div','span','a','p','section','header','footer','nav','iframe','button','img','body','html'].includes(occlusion.blockerTag) ? occlusion.blockerTag : 'other' };
      const runs = c.data?.textRunSummary;
      if (runs && ['total','passed','failed','unresolved'].every(key => Number.isInteger(runs[key]) && runs[key] >= 0 && runs[key] <= 80)) debugField.textRunSummary = { total:runs.total, passed:runs.passed, failed:runs.failed, unresolved:runs.unresolved, limited:runs.limited === true };
      if (debugField.textRunSummary && runs.unresolvedReasons) debugField.textRunSummary.unresolvedReasons = Object.fromEntries(Object.entries(runs.unresolvedReasons).filter(([reason,count]) => accessLensFeatures.secondPassReasons[reason] && Number.isInteger(count) && count >= 0 && count <= 80));
      const automatic = c.data?.automaticBackground;
      if (automatic?.method === 'rendered-background-with-text-temporarily-hidden' && ['minimumContrastRatio','maximumContrastRatio','sampledPixels'].every(key => typeof automatic[key] === 'number' && Number.isFinite(automatic[key]))) {
        return { id: c.id, impact: c.impact, measurements: data, ...debugField, automaticBackground: { method: automatic.method, minimumContrastRatio: automatic.minimumContrastRatio, maximumContrastRatio: automatic.maximumContrastRatio, sampledPixels: automatic.sampledPixels, ...(Number.isInteger(automatic.textRegions) && automatic.textRegions > 0 ? { textRegions: automatic.textRegions } : {}) } };
      }
      return { id: c.id, impact: c.impact, measurements: data, ...debugField, reviewReason: evidence.reason };
    }
    return { id: c.id, impact: c.impact, measurements: data };
  }
  const results = {};
  for (const category of ['violations', 'incomplete', 'passes', 'inapplicable']) {
    results[category] = report.results[category].map(rule => {
      const reference = catalog.get(rule.id);
      return {
        id: rule.id, impact: rule.impact,
        help: reference?.help, description: reference?.description, tags: reference?.tags,
        guidance: globalThis.accessLensWorkflow?.guidance(rule.id),
        nodes: rule.nodes.map(node => ({ ...element(node), impact: node.impact,
          ...(node.secondPass ? { secondPass: { engine: 'Access Lens', initialEngine: 'axe-core', initialStatus: 'incomplete', status: ['pass','fail'].includes(node.secondPass.status) ? node.secondPass.status : 'unresolved', attempted: node.secondPass.attempted === true, reason: globalThis.accessLensFeatures?.secondPassReasons[node.secondPass.reason] ? node.secondPass.reason : 'unsupported-check', explanation: globalThis.accessLensFeatures?.reviewReason(node.secondPass.reason) } } : {}),
          any: node.any.map(check), all: node.all.map(check), none: node.none.map(check) }))
      };
    });
  }
  const exported = {
    schemaVersion: '2.1', pagePath: page.href, scanId: crypto.randomUUID(), attribution: accessLensAttribution(report.attribution),
    privacy: { mode: 'content-free', alternativeTextIncluded: false, structuralLocatorsOnly: true, pagePathIncluded: true, queryAndFragmentIncluded: false },
    tool: report.tool, scannedAt: report.scannedAt, scope: report.scope, summary: report.summary,
    completeness,
    ...(report.results.accessLensContrastAnalysis ? { contrastAnalysis: { status: report.results.accessLensContrastAnalysis.status, candidates: report.results.accessLensContrastAnalysis.candidates, resolved: report.results.accessLensContrastAnalysis.resolved, viewports: report.results.accessLensContrastAnalysis.viewports || 0, pageSweep: report.results.accessLensContrastAnalysis.pageSweep, interrupted: report.results.accessLensContrastAnalysis.interrupted === true } } : {}),
    ...(report.results.accessLensScanPasses ? { scanPasses: structuredClone(report.results.accessLensScanPasses) } : {}),
    ...(globalThis.accessLensChecks ? { supplementalChecks: accessLensChecks.snapshot() } : {}),
    pageIdentity: { queryKeysUsed: (globalThis.accessLensIdentity?.queryKeys || []).length, hashRouteUsed: Boolean(globalThis.accessLensIdentity?.hashRoutes), routeValuesExported: false },
    inventory: Object.fromEntries(Object.entries(report.inventory).map(([category, groups]) => [category,
      groups.map(group => ({ id: group.id, help: group.help, nodes: group.nodes.map(element) }))])),
    results
  };
  if (globalThis.accessLensWorkflow?.coverage) exported.wcagCoverage = accessLensWorkflow.coverage(exported);
  return exported;
};
