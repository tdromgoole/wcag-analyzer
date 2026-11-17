// The download is constructed from an allowlist, never a copy of raw axe data.
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
  function segment(el) {
    // Custom element names can themselves contain identifiers.
    const tag = safeTags.has(el.localName) ? el.localName : '*';
    const siblings = el.parentNode?.children ? [...el.parentNode.children] : [el];
    return tag + ':nth-child(' + (siblings.indexOf(el) + 1) + ')';
  }
  function structural(el) {
    const parts = [];
    while (el?.nodeType === 1) {
      parts.unshift(segment(el));
      if (el.parentElement) el = el.parentElement;
      else {
        const host = el.getRootNode().host;
        return host ? [...structural(host), parts.join(' > ')] : [parts.join(' > ')];
      }
    }
    return [];
  }
  function element(node) {
    let el;
    try {
      let scope = document;
      for (const selector of node.target || []) {
        if (typeof selector !== 'string') throw new Error();
        el = scope.querySelector(selector);
        if (!el) break;
        scope = el.shadowRoot || el;
      }
    } catch { el = null; }
    if (!el) return { target: [], locatorAvailable: false };
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
    return {
      target: structural(el), locatorAvailable: true,
      elementType: safeTags.has(el.localName) ? el.localName : 'custom-or-other',
      labelPresent: el.hasAttribute('aria-label'),
      labelReferencePresent: el.hasAttribute('aria-labelledby'),
      descriptionReferencePresent: el.hasAttribute('aria-describedby'),
      altPresent: el.hasAttribute('alt'),
      ...(el.hasAttribute('alt') ? { alternativeText: el.getAttribute('alt') } : {}), states
      , role: role || null,
      relationships: { parent: el.parentElement ? structural(el.parentElement) : [],
        labels: [...(el.labels || [])].map(structural),
        labelledBy: references('aria-labelledby'), describedBy: references('aria-describedby'),
        controls: references('aria-controls'), owns: references('aria-owns') },
      measurements, focusable: el.tabIndex >= 0, disabled: Boolean(el.disabled)
    };
  }
  function check(c) {
    const data = {};
    // No arbitrary strings, nested objects, relatedNodes, or check messages.
    for (const key of ['contrastRatio', 'fontSize', 'fontWeight', 'expectedContrastRatio']) {
      if (typeof c.data?.[key] === 'number' && Number.isFinite(c.data[key])) data[key] = c.data[key];
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
          any: node.any.map(check), all: node.all.map(check), none: node.none.map(check) }))
      };
    });
  }
  const exported = {
    schemaVersion: '2.0', pagePath: page.href,
    privacy: { mode: 'alternative-text-included', alternativeTextIncluded: true, structuralLocatorsOnly: true, pagePathIncluded: true, queryAndFragmentIncluded: false },
    tool: report.tool, scannedAt: report.scannedAt, scope: report.scope, summary: report.summary,
    completeness,
    ...(globalThis.accessLensChecks ? { supplementalChecks: accessLensChecks.snapshot() } : {}),
    pageIdentity: { queryKeysUsed: (globalThis.accessLensIdentity?.queryKeys || []).length, hashRouteUsed: Boolean(globalThis.accessLensIdentity?.hashRoutes), routeValuesExported: false },
    inventory: Object.fromEntries(Object.entries(report.inventory).map(([category, groups]) => [category,
      groups.map(group => ({ id: group.id, help: group.help, nodes: group.nodes.map(element) }))])),
    results
  };
  if (globalThis.accessLensWorkflow?.coverage) exported.wcagCoverage = accessLensWorkflow.coverage(exported);
  return exported;
};
