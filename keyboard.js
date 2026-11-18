// Real keyboard traversal is supplied by a browser driver, never dispatchEvent.
globalThis.accessLensKeyboard = {
  target(element) {
    const safe = new Set('html body main header footer nav section article aside div span p a button input select option textarea label img svg ul ol li table thead tbody tr th td h1 h2 h3 h4 h5 h6 form fieldset legend video audio iframe dialog details summary canvas'.split(' '));
    const parts = [];
    while (element?.nodeType === 1) {
      const tag = safe.has(element.localName) ? element.localName : '*';
      parts.unshift(`${tag}:nth-child(${[...element.parentNode.children].indexOf(element) + 1})`);
      if (element.parentElement) element = element.parentElement;
      else {
        const host = element.getRootNode().host;
        return host ? [...this.target(host), parts.join(' > ')] : [parts.join(' > ')];
      }
    }
    return [];
  },
  sample() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    const target = this.target(element);
    const boundary = !element || ['html','body'].includes(element.localName);
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    const flags = [];
    if (boundary) flags.push('document-boundary');
    if (element?.localName === 'iframe') flags.push('frame-requires-separate-review');
    if (!boundary && (!rect.width || !rect.height || style.visibility === 'hidden')) flags.push('not-visibly-rendered');
    if (!boundary && (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth)) flags.push('outside-viewport');
    if (!boundary && rect.width && rect.height) {
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight) {
        let hit = document.elementFromPoint(x, y);
        while (hit?.shadowRoot?.elementFromPoint(x, y) && hit.shadowRoot.elementFromPoint(x, y) !== hit) hit = hit.shadowRoot.elementFromPoint(x, y);
        if (hit && hit !== element && !element.contains(hit)) flags.push('center-may-be-covered');
      }
    }
    return { target, boundary, documentFocused: document.hasFocus(), flags,
      rectangle: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      indicator: style ? { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0, boxShadowPresent: style.boxShadow !== 'none' } : null };
  },
  async run({ press, sample, checkpoint, steps = 20, signal, delay = 100, run }) {
    steps = Math.max(1, Math.min(100, Math.floor(Number(steps) || 20)));
    run.stepsPerDirection = steps;
    run.entries = [];
    run.status = 'running';
    const start = performance.now();
    const record = async (key, direction) => {
      const observation = await sample();
      run.entries.push({ step: run.entries.length, elapsedMs: Math.round(performance.now() - start), key, direction, ...observation });
      await checkpoint(run);
      return observation;
    };
    try {
      const initial = await record('Start', 'initial');
      if (signal.aborted) throw new Error('stopped-by-user');
      if (!initial.documentFocused) throw new Error('focus-left-document');
      for (const direction of ['forward','reverse']) {
        for (let index = 0; index < steps; index++) {
          if (signal.aborted) throw new Error('stopped-by-user');
          await press(direction === 'reverse');
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          const observation = await record(direction === 'reverse' ? 'Shift+Tab' : 'Tab', direction);
          if (observation.flags.includes('frame-requires-separate-review')) throw new Error('frame-boundary');
          if (!observation.documentFocused) throw new Error('focus-left-document');
        }
      }
      run.status = 'completed'; run.reason = 'step-limit-reached';
    } catch (error) {
      run.status = 'interrupted';
      const reason = error.code || error.message;
      run.reason = ['stopped-by-user','frame-boundary','focus-left-document','debugger-canceled','driver-disconnected','page-navigated','time-limit','disabled-in-settings'].includes(reason) ? reason : 'driver-unavailable';
    }
    run.finishedAt = new Date().toISOString();
    run.reviewRequired = true;
    // Repeated focus is an observation, not proof of a keyboard trap.
    run.repeatedFocus = run.entries.slice(1).filter((entry, index) => !entry.boundary && JSON.stringify(entry.target) === JSON.stringify(run.entries[index].target)).map(entry => entry.step);
    await checkpoint(run);
    return run;
  }
};
