// Supplementary measurements for human review; these are not axe violations.
globalThis.accessLensChecks = {
  target(element) {
    const safe = new Set('html body main header footer nav section article aside div span p a button input select option textarea label img svg ul ol li table thead tbody tr th td h1 h2 h3 h4 h5 h6 form fieldset legend video audio iframe dialog details summary canvas'.split(' '));
    const parts = [];
    while (element?.nodeType === 1) {
      const tag = safe.has(element.localName) ? element.localName : '*';
      parts.unshift(`${tag}:nth-child(${[...element.parentNode.children].indexOf(element) + 1})`);
      if (element.parentElement) element = element.parentElement;
      else return element.getRootNode().host ? [...this.target(element.getRootNode().host), parts.join(' > ')] : [parts.join(' > ')];
    }
    return [];
  },
  elements(limit = 5000) {
    const elements = []; let truncated = false;
    function walk(scope) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT, { acceptNode: el =>
        el.id === 'access-lens-extension' || ['head','script','style','noscript','template'].includes(el.localName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let element;
      while ((element = walker.nextNode())) {
        if (elements.length === limit) { truncated = true; return; }
        elements.push(element);
        if (element.shadowRoot) walk(element.shadowRoot);
        if (truncated) return;
      }
    }
    walk(document);
    return { elements, truncated };
  },
  textElement(el) { return ['input','textarea','select'].includes(el.localName) || [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()); },
  clipping(el) {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    const x = Math.max(0, el.scrollWidth - el.clientWidth), y = Math.max(0, el.scrollHeight - el.clientHeight);
    return { rendered: Boolean(rect.width && rect.height && style.visibility !== 'hidden'),
      horizontal: ['hidden','clip'].includes(style.overflowX) && x > 1,
      vertical: ['hidden','clip'].includes(style.overflowY) && y > 1, excessX: x, excessY: y };
  },
  snapshot() {
    const sampled = this.elements();
    const definitions = [
      ['horizontal-overflow','Content outside the viewport',['1.4.10']],
      ['text-clipping','Text in clipping containers',['1.4.4','1.4.10']],
      ['positive-tabindex','Positive tab order values',['2.4.3']],
      ['video-captions','Video without a caption/subtitle track',['1.2.2']],
      ['autoplay-media','Autoplay media without native controls',['1.4.2','2.2.2']],
      ['input-purpose','Email/telephone fields without purpose metadata',['1.3.5']],
      ['long-animation','Long-running CSS animations',['2.2.2']]
    ];
    const checks = definitions.map(([id,name,criteria]) => ({ id, name, criteria, reviewRequired: true, observations: [], truncated: false }));
    const add = (id, el, measurements) => {
      const check = checks.find(check => check.id === id);
      if (check.observations.length < 100) check.observations.push({ target: this.target(el), measurements }); else check.truncated = true;
    };
    const viewport = { width: document.documentElement.clientWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth };
    for (const el of sampled.elements) {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      const rendered = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      if (['video','audio'].includes(el.localName) && el.autoplay && !el.controls) add('autoplay-media', el, { muted: el.muted, paused: el.paused, loop: el.loop, durationSeconds: Number.isFinite(el.duration) ? el.duration : null });
      if (!rendered) continue;
      const text = this.textElement(el);
      if ((text || ['img','video','iframe','button'].includes(el.localName)) && (rect.right > viewport.width + 1 || rect.left < -1)) add('horizontal-overflow', el, { left: rect.left, right: rect.right, viewportWidth: viewport.width });
      {
        const clip = this.clipping(el);
        if ((clip.horizontal || clip.vertical) && (text || el.textContent.trim())) add('text-clipping', el, { horizontal: clip.horizontal, vertical: clip.vertical, excessX: clip.excessX, excessY: clip.excessY });
      }
      if (el.tabIndex > 0 && !el.disabled && !el.closest('[inert]')) add('positive-tabindex', el, { tabIndex: el.tabIndex });
      if (el.localName === 'video' && ![...el.querySelectorAll('track')].some(track => ['captions','subtitles'].includes(track.kind))) add('video-captions', el, { nativeControls: el.controls, muted: el.muted });
      if (el.localName === 'input' && ['email','tel'].includes(el.type)) {
        const tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
        const hasPurpose = tokens.some(token => el.type === 'email' ? token === 'email' : /^tel(?:-(?:country-code|national|area-code|local|local-prefix|local-suffix|extension))?$/.test(token));
        if (!hasPurpose) add('input-purpose', el, { emailField: el.type === 'email', telephoneField: el.type === 'tel' });
      }
      const names = style.animationName.split(',');
      const durations = style.animationDuration.split(',').map(value => Number.parseFloat(value) * 1000);
      const iterations = style.animationIterationCount.split(',').map(value => value.trim() === 'infinite' ? Infinity : Number(value));
      const states = style.animationPlayState.split(',').map(value => value.trim());
      names.forEach((name,index) => {
        const durationMs = durations[index % durations.length], count = iterations[index % iterations.length];
        if (name.trim() !== 'none' && states[index % states.length] === 'running' && durationMs > 0 && durationMs * count > 5000) add('long-animation', el, { durationMs, iterations: Number.isFinite(count) ? count : null, infinite: count === Infinity });
      });
    }
    for (const check of checks) check.status = check.observations.length ? 'needs-review' : 'no-indicators-detected';
    return { recordedAt: new Date().toISOString(), status: sampled.truncated ? 'limited' : 'completed-for-scope', sampledElements: sampled.elements.length, truncated: sampled.truncated, viewport, checks,
      limitations: ['Evidence only, not a criterion pass/fail. Exceptions and equivalent controls require human review.', 'Current viewport and rendered state only; overflow is not a 320 CSS pixel reflow test.', 'Captions may be external or unnecessary; autoplay may be blocked, muted, short, or have custom controls.', 'Email/telephone fields may collect someone else\'s information; animation duration alone does not establish moving content.', 'Embedded frames and closed shadow roots are excluded. Up to 5000 elements and 100 observations per check.'] };
  },
  async textSpacing({ settle = () => new Promise(resolve => setTimeout(resolve, 100)), signal } = {}) {
    const sampled = this.elements(), originals = [], findings = [], overrides = [];
    const startedAt = new Date().toISOString();
    const scroll = { x: scrollX, y: scrollY };
    let status = 'completed-for-scope';
    try {
      for (const el of sampled.elements) {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const before = this.clipping(el), original = el.getAttribute('style');
        const properties = { 'line-height': '1.5', 'letter-spacing': '0.12em', 'word-spacing': '0.16em', ...(el.localName === 'p' ? { 'margin-block-end': '2em' } : {}) };
        const previous = Object.fromEntries(Object.keys(properties).map(name => [name, { value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) }]));
        const entry = { el, before, original, previous, properties, applied: null }; originals.push(entry);
      }
      for (const entry of originals) {
        const { el, properties } = entry;
        for (const [name,value] of Object.entries(properties)) el.style.setProperty(name, value, 'important');
        entry.applied = el.getAttribute('style');
      }
      await settle();
      if (signal?.aborted) throw new Error('interrupted');
      for (const { el, before } of originals) {
        if (!el.isConnected) { status = 'limited'; continue; }
        const after = this.clipping(el);
        if (after.rendered && ((after.horizontal && (!before.horizontal || after.excessX > before.excessX + 1)) || (after.vertical && (!before.vertical || after.excessY > before.excessY + 1))) && (this.textElement(el) || el.textContent.trim())) {
          if (findings.length < 100) findings.push({ target: this.target(el), measurements: { beforeExcessX: before.excessX, beforeExcessY: before.excessY, afterExcessX: after.excessX, afterExcessY: after.excessY } });
          else status = 'limited';
        }
        const computed = getComputedStyle(el), font = Number.parseFloat(computed.fontSize);
        if (font && [[computed.lineHeight, 1.5], [computed.letterSpacing, .12], [computed.wordSpacing, .16], ...(el.localName === 'p' ? [[computed.marginBlockEnd, 2]] : [])].some(([value,ratio]) => !Number.isFinite(Number.parseFloat(value)) || Math.abs(Number.parseFloat(value) - font * ratio) > 1)) {
          if (overrides.length < 100) overrides.push({ target: this.target(el) });
          status = 'limited';
        }
      }
    } catch { status = 'interrupted'; }
    finally {
      for (const { el, original, previous, properties, applied } of originals) {
        if (el.getAttribute('style') === applied) {
          if (original === null) el.removeAttribute('style'); else el.setAttribute('style', original);
        } else {
          // Preserve unrelated live updates made by page scripts during the test.
          for (const [name,value] of Object.entries(properties)) {
            const probe = document.createElement('span'); probe.style.setProperty(name, value, 'important');
            if (el.style.getPropertyValue(name) !== probe.style.getPropertyValue(name) || el.style.getPropertyPriority(name) !== 'important') continue;
            const prior = previous[name];
            if (prior.value) el.style.setProperty(name, prior.value, prior.priority); else el.style.removeProperty(name);
          }
          if (original === null && !el.style.length) el.removeAttribute('style');
        }
      }
      scrollTo(scroll.x, scroll.y);
    }
    return { id: 'text-spacing', name: 'Text-spacing stress test', criteria: ['1.4.12'], startedAt, finishedAt: new Date().toISOString(), status: sampled.truncated && status !== 'interrupted' ? 'limited' : status,
      reviewRequired: true, sampledElements: originals.length, truncated: sampled.truncated, observations: findings, overrideProblems: overrides,
      settings: { lineHeight: 1.5, paragraphSpacingEm: 2, letterSpacingEm: .12, wordSpacingEm: .16 },
      limitations: ['Styles were temporarily changed and restored. Only geometric clipping increases are detected.', 'Overlap, meaning, usability, language exceptions, hidden states, and text inside frames/closed roots require human review.', 'No detected clipping is not a WCAG pass. CSS transitions or live page changes can limit this test.'] };
  }
};
