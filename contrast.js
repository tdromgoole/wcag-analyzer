// Automatic background measurements plus an optional manual color sampler.
globalThis.accessLensContrast = {
  textRange(range, node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent, start = value.length - value.trimStart().length, end = value.trimEnd().length;
      range.setStart(node, Math.min(start,end)); range.setEnd(node,end);
    } else if (node.childNodes.length === 1 && node.firstChild.nodeType === Node.TEXT_NODE) return this.textRange(range,node.firstChild);
    else range.selectNodeContents(node);
    return range;
  },
  pixelBounds(rect, scaleX, scaleY) {
    // Include only device pixels wholly inside the CSS text rectangle. Outward
    // rounding mixes adjacent content into the last column/row at fractional edges.
    const epsilon = 1e-7;
    const x = Math.ceil(rect.x * scaleX - epsilon), y = Math.ceil(rect.y * scaleY - epsilon);
    const right = Math.floor((rect.x + rect.width) * scaleX + epsilon), bottom = Math.floor((rect.y + rect.height) * scaleY + epsilon);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  },
  async automatic(results) {
    const rule = results.incomplete?.find(rule => rule.id === 'color-contrast');
    if (!rule) return;
    const initialNodes = [...rule.nodes];
    const groups = [];
    for (const parent of [...rule.nodes]) {
      let scope = document, element;
      try { for (const selector of parent.target.flat(20)) { element = scope.querySelector(selector); scope = element?.shadowRoot || element; } } catch { continue; }
      if (!(element instanceof HTMLElement) || !element.children.length) continue;
      const runs = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text, limited = false;
      while ((text = walker.nextNode())) {
        const owner = text.parentElement;
        if (!text.textContent.trim() || owner.closest('script,style,noscript,template') || !owner.getClientRects().length || getComputedStyle(owner).visibility !== 'visible') continue;
        const range = document.createRange(); this.textRange(range,text);
        if (![...range.getClientRects()].some(rect => rect.width && rect.height)) continue;
        if (runs.length === 80) { limited = true; break; }
        const run = { ...parent, target: parent.target, any: structuredClone(parent.any), all: structuredClone(parent.all), none: structuredClone(parent.none),
          secondPass: { ...parent.secondPass, attempted: false, reason: 'unsupported-css' }, accessLensTextNode: text, accessLensTextOwner: owner };
        for (const check of [...run.any,...run.all,...run.none]) { if (check.data) { delete check.data.contrastDebug; delete check.data.automaticBackground; delete check.data.textRunSummary; } delete check.accessLensDebugPreview; }
        runs.push(run);
      }
      if (!runs.length) continue;
      groups.push({ parent, runs, limited });
      rule.nodes.splice(rule.nodes.indexOf(parent), 1, ...runs);
    }
    try { await this.scanRegions(results); }
    finally {
      for (const { parent, runs, limited } of groups) {
        const items = runs.map(run => ({ run, bucket: ['violations','passes','incomplete'].find(bucket => results[bucket].some(rule => rule.id === 'color-contrast' && rule.nodes.includes(run))) || 'incomplete' }));
        const failed = items.filter(item => item.bucket === 'violations'), passed = items.filter(item => item.bucket === 'passes');
        const bucket = failed.length ? 'violations' : passed.length === runs.length && !limited ? 'passes' : 'incomplete';
        const representative = (failed[0] || items.find(item => item.bucket === 'incomplete' && item.run.secondPass?.attempted) || items.find(item => item.bucket === 'incomplete') || passed[0])?.run;
        if (representative) {
          parent.any = representative.any; parent.all = representative.all; parent.none = representative.none;
          parent.failureSummary = representative.failureSummary;
          parent.secondPass = { ...representative.secondPass, id: parent.secondPass?.id, attempted: runs.some(run => run.secondPass?.attempted), reason: limited ? 'text-run-limit' : representative.secondPass?.reason };
          for (const check of [...parent.any,...parent.all,...parent.none].filter(check => check.id === 'color-contrast')) check.data = { ...check.data, textRunSummary: { unresolvedReasons: items.filter(item => item.bucket === 'incomplete').reduce((counts,item) => { const reason = item.run.secondPass?.reason || 'unsupported-check'; counts[reason] = (counts[reason] || 0) + 1; return counts; }, {}), total: runs.length, passed: passed.length, failed: failed.length, unresolved: runs.length - passed.length - failed.length, limited } };
        }
        for (const resultBucket of ['violations','passes','incomplete']) for (const resultRule of results[resultBucket]) if (resultRule.id === 'color-contrast') resultRule.nodes = resultRule.nodes.filter(node => !runs.includes(node));
        let destination = results[bucket].find(rule => rule.id === 'color-contrast');
        if (!destination) { destination = { ...rule, nodes: [] }; results[bucket].push(destination); }
        destination.nodes.push(parent);
      }
      for (const bucket of ['violations','passes','incomplete']) results[bucket] = results[bucket].filter(rule => rule.nodes.length || rule.id !== 'color-contrast');
      if (results.accessLensContrastAnalysis) { results.accessLensContrastAnalysis.candidates = initialNodes.filter(node => node.secondPass?.attempted).length; results.accessLensContrastAnalysis.resolved = initialNodes.filter(node => ['passes','violations'].some(bucket => results[bucket].some(rule => rule.id === 'color-contrast' && rule.nodes.includes(node)))).length; }
    }
  },
  async scanRegions(results) {
    const originalRule = results.incomplete?.find(rule => rule.id === 'color-contrast');
    if (!originalRule) return;
    const originalNodes = [...originalRule.nodes];
    const browsing = Boolean(globalThis.__accessLensAutoScan && !globalThis.__accessLens);
    const position = { x: scrollX, y: scrollY }, address = location.href, containers = new Map(), visited = new Set();
    const started = performance.now();
    let interrupted = false, viewports = 0;
    const interrupt = event => { if (event.isTrusted) interrupted = true; };
    for (const event of ['wheel','touchstart','keydown','pointerdown']) addEventListener(event, interrupt, true);
    try {
      await this.measureViewport(results); viewports++;
      // Browsing mode never scrolls pages unexpectedly. An explicit inspector scan
      // visits unresolved off-screen text while all extension overlays are absent.
      while (!browsing && !interrupted && location.href === address && document.visibilityState === 'visible' && viewports < 12 && performance.now() - started < 15000 && ['completed','no-supported-candidates'].includes(results.accessLensContrastAnalysis?.status)) {
        const remaining = results.incomplete.find(rule => rule.id === 'color-contrast');
        const node = remaining?.nodes.find(node => !visited.has(node) && ['off-screen','limit-reached'].includes(node.secondPass?.reason));
        if (!node) break;
        visited.add(node);
        let scope = document, el;
        try { if (node.accessLensTextOwner) el = node.accessLensTextOwner; else for (const selector of node.target.flat(20)) { el = scope.querySelector(selector); scope = el?.shadowRoot || el; } } catch { continue; }
        if (!el?.isConnected) continue;
        for (let parent = el.parentElement; parent; parent = parent.parentElement || parent.getRootNode().host) {
          if (!containers.has(parent)) containers.set(parent, { x: parent.scrollLeft, y: parent.scrollTop });
        }
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        // A parent can be fully visible while a later inline run is not. Center
        // the actual text range rather than repeatedly centering its owner box.
        const range = this.textRange(document.createRange(), node.accessLensTextNode || el);
        const textBox = range.getBoundingClientRect();
        if (textBox.width < innerWidth && textBox.height < innerHeight) scrollTo({ left: scrollX + textBox.x + textBox.width / 2 - innerWidth / 2, top: scrollY + textBox.y + textBox.height / 2 - innerHeight / 2, behavior: 'instant' });
        await new Promise(resolve => setTimeout(resolve, 600));
        if (interrupted || location.href !== address || document.visibilityState !== 'visible') break;
        await this.measureViewport(results); viewports++;
      }
    } finally {
      for (const event of ['wheel','touchstart','keydown','pointerdown']) removeEventListener(event, interrupt, true);
      if (!interrupted && location.href === address) {
        for (const [container, saved] of containers) if (container.isConnected && container !== document.scrollingElement) container.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
        scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
      }
      const resolved = originalNodes.filter(node => ['violations','passes'].some(bucket => results[bucket].some(rule => rule.id === 'color-contrast' && rule.nodes.includes(node)))).length;
      const considered = originalNodes.filter(node => node.secondPass?.attempted).length;
      results.accessLensContrastAnalysis = { ...results.accessLensContrastAnalysis, candidates: considered, resolved, viewports, interrupted,
        pageSweep: browsing ? 'not-run-in-browsing-mode' : interrupted ? 'interrupted' : viewports >= 12 || performance.now() - started >= 15000 ? 'limited' : 'completed' };
    }
  },
  async measureViewport(results, { retry = false } = {}) {
    const rule = results.incomplete?.find(rule => rule.id === 'color-contrast');
    if (!rule) return;
    const review = (node, reason, attempted = false) => { if (!attempted && node.secondPass?.attempted) return; if (node.secondPass) Object.assign(node.secondPass, { reason, attempted }); };
    if (!globalThis.chrome?.runtime?.id || document.visibilityState !== 'visible' || globalThis.visualViewport?.scale !== 1) rule.nodes.forEach(node => review(node, 'page-unavailable')); 
    const analysis = results.accessLensContrastAnalysis = { status: 'unavailable', candidates: 0, resolved: 0 };
    if (!globalThis.chrome?.runtime?.id || document.visibilityState !== 'visible' || globalThis.visualViewport?.scale !== 1) return;
    const signature = el => { const values = []; for (let current = el; current; current = current.parentElement || current.getRootNode().host) { const style = getComputedStyle(current); for (const pseudo of ['::before','::after']) { const generated = getComputedStyle(current, pseudo); if (current === el && !['none','normal'].includes(generated.content) && generated.content.slice(1, -1).trim()) throw Object.assign(new Error('Generated text needs separate review'), { code: 'generated-text' }); values.push(['content','backgroundImage','backgroundColor','opacity','filter','transform','mixBlendMode'].map(key => generated[key]).join('|')); } values.push(['color','font','backgroundImage','backgroundColor','backgroundPosition','backgroundSize','opacity','filter','mixBlendMode','transform','scale','rotate'].map(key => style[key]).join('|')); if (current.getAnimations().some(animation => animation.playState === 'running')) throw Object.assign(new Error('Animated styles need review'), { code: 'animated-content' }); } return values.join(';'); };
    const candidates = [], address = location.href, viewport = { width: innerWidth, height: innerHeight };
    for (const node of rule.nodes) {
      if (candidates.length >= 30) { review(node, 'limit-reached'); continue; }
      review(node, 'unsupported-css');
      const check = [...node.any, ...node.all, ...node.none].find(check => check.id === 'color-contrast');
      if (!check) { review(node, 'unsupported-check'); continue; }
      if (check.data && check.data.originalReviewCode === undefined) check.data.originalReviewCode = check.data.messageKey;
      try {
        let scope = document, el;
        if (node.accessLensTextOwner) el = node.accessLensTextOwner; else for (const selector of node.target.flat(20)) { el = scope.querySelector(selector); scope = el?.shadowRoot || el; }
        if (!(el instanceof HTMLElement) || ['textarea','select','canvas','video','audio'].includes(el.localName) || el.children.length && !node.accessLensTextNode || !el.getClientRects().length) { review(node, 'unsupported-element'); continue; }
        const foreground = this.foreground(el, { allowTextShadow: true }), style = getComputedStyle(el);
        let rect, rects;
        if (el.localName === 'input') {
          review(node, 'input-geometry');
          if (!['submit','button','reset'].includes(el.type) || style.writingMode !== 'horizontal-tb' || style.direction !== 'ltr' || Number.parseFloat(style.letterSpacing) || Number.parseFloat(style.textIndent)) continue;
          const box = el.getBoundingClientRect(), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
          ctx.font = style.font;
          const text = style.textTransform === 'uppercase' ? el.value.toUpperCase() : style.textTransform === 'lowercase' ? el.value.toLowerCase() : style.textTransform === 'none' ? el.value : null;
          if (!text) continue;
          const width = ctx.measureText(text).width;
          const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
          if (!width || width > right - left || foreground.fontSize > box.height) continue;
          const x = style.textAlign === 'center' ? (left + right - width) / 2 : ['right','end'].includes(style.textAlign) ? right - width : left;
          rect = { x, y: box.top + (box.height - foreground.fontSize) / 2, width, height: foreground.fontSize };
        } else {
          const range = document.createRange(); this.textRange(range,node.accessLensTextNode || el);
          const boxes = [...range.getClientRects()];
          if (!boxes.length || boxes.length > 30 || !el.textContent.trim()) continue;
          rects = boxes.filter(box => box.width > 0 && box.height > 0).map(box => ({ x: box.x, y: box.y, width: box.width, height: box.height }));
        }
        rects ||= [rect];
        if (!rects.length || rects.some(box => box.x < 0 || box.y < 0 || box.width < 1 || box.height < 1 || box.x + box.width > innerWidth || box.y + box.height > innerHeight)) { review(node, 'off-screen'); continue; }
        let blocked = null;
        for (const [region,box] of rects.entries()) for (const x of [.1,.5,.9]) for (const y of [.2,.5,.8]) {
          const hit = document.elementFromPoint(box.x + box.width * x, box.y + box.height * y);
          if (hit !== el && !blocked) blocked = { region, relation: !hit ? 'none' : el.contains(hit) ? 'descendant' : hit.contains(el) ? 'ancestor' : 'unrelated', blockerTag: ['div','span','a','p','section','header','footer','nav','iframe','button','img','body','html'].includes(hit?.localName) ? hit.localName : 'other' };
        }
        if (blocked) { check.data = { ...check.data, occlusion: blocked }; review(node, 'obscured'); continue; }
        const geometryBox = el.localName === 'input' ? el.getBoundingClientRect() : (() => { const range = document.createRange(); this.textRange(range,node.accessLensTextNode || el); return range.getBoundingClientRect(); })();
        const geometry = { x: geometryBox.x, y: geometryBox.y, width: geometryBox.width, height: geometryBox.height };
        candidates.push({ el, node, check, foreground, rects, geometry, signature: signature(el), original: el.getAttribute('style') });
      } catch (error) { review(node, ['generated-text','animated-content'].includes(error.code) ? error.code : 'unsupported-css'); }
    }
    analysis.candidates = candidates.length;
    analysis.status = candidates.length ? 'capture-unavailable' : 'no-supported-candidates';
    if (!candidates.length) return;
    for (const candidate of candidates) review(candidate.node, 'capture-unavailable', true);
    const changed = [];
    let image;
    try {
      const changedElements = new Map();
      for (const candidate of candidates) {
        if (changedElements.has(candidate.el)) { candidate.applied = changedElements.get(candidate.el).applied; continue; }
        candidate.el.style.setProperty('transition-property', 'none', 'important');
        candidate.el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        candidate.el.style.setProperty('text-shadow', 'none', 'important');
        candidate.applied = candidate.el.getAttribute('style'); changed.push(candidate); changedElements.set(candidate.el, candidate);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      let timeout;
      let response;
      try { response = await Promise.race([accessLensFeatures.sendRuntime({ type: 'access-lens-contrast-capture', automatic: true, viewport, rect: { x: 0, y: 0, width: innerWidth, height: innerHeight } }), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Capture timed out')), 3000); })]); } finally { clearTimeout(timeout); }
      if (response?.error || !response?.image) return;
      image = response.image;
      if (location.href !== address || innerWidth !== viewport.width || innerHeight !== viewport.height) return;
      const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
      try {
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
        const sx = bitmap.width / viewport.width, sy = bitmap.height / viewport.height;
        for (const candidate of candidates) {
          const { el, rects, foreground, check, node } = candidate;
          review(node, 'changed-during-scan', true);
          if (!el.isConnected) { review(node, 'element-removed', true); continue; }
          if (el.getAttribute('style') !== candidate.applied) { review(node, 'inline-style-changed', true); continue; }
          if ((() => { try { return signature(el); } catch { return null; } })() !== candidate.signature) { review(node, 'computed-style-changed', true); continue; }
          if (getComputedStyle(el).webkitTextFillColor !== 'rgba(0, 0, 0, 0)') { review(node, 'text-hide-blocked', true); continue; }
          // Recheck text geometry after capture. Layout shifts invalidate the measurement.
          let now;
          if (el.localName === 'input') { const b = el.getBoundingClientRect(); now = { x: b.x, y: b.y, width: b.width, height: b.height }; }
          else { const range = document.createRange(); this.textRange(range,node.accessLensTextNode || el); const lines = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0); if (lines.length !== rects.length || lines.some((box, index) => ['x','y','width','height'].some(key => Math.abs(box[key] - rects[index][key]) > .5))) { review(node, 'text-layout-changed', true); continue; } const b = range.getBoundingClientRect(); now = { x: b.x, y: b.y, width: b.width, height: b.height }; }
          const baseline = candidate.geometry;
          if (!baseline || Object.keys(now).some(key => Math.abs(now[key] - baseline[key]) > .5)) { review(node, 'text-layout-changed', true); continue; }
          let minimum = Infinity, maximum = 0, worstColor, sampledPixels = 0, belowThresholdPixels = 0, edgeBandBelowThresholdPixels = 0, minimumInteriorRatio = Infinity;
          const worstSamples = [], regions = [];
          const cache = new Map();
          const sampleRegions = rects.map(rect => this.pixelBounds(rect, sx, sy));
          if (sampleRegions.some(region => !region)) { review(node, 'insufficient-sample-area', true); continue; }
          for (const [regionIndex, rect] of rects.entries()) {
            const bounds = sampleRegions[regionIndex];
            const pixelWidth = bounds.width, pixelHeight = bounds.height;
            regions.push({ index: regionIndex, width: rect.width, height: rect.height, pixelWidth, pixelHeight, leftInsetCss: bounds.x / sx - rect.x, topInsetCss: bounds.y / sy - rect.y, rightInsetCss: rect.x + rect.width - (bounds.x + bounds.width) / sx, bottomInsetCss: rect.y + rect.height - (bounds.y + bounds.height) / sy });
            const pixels = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height).data;
            sampledPixels += pixels.length / 4;
            for (let i = 0; i < pixels.length; i += 4) {
              // Keep every pixel, but allocate a hex string only for a new RGB color.
              const colorKey = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
              let entry = cache.get(colorKey);
              if (!entry) {
                const color = '#' + colorKey.toString(16).padStart(6, '0');
                entry = { color, ratio: this.ratio(foreground.fgColor, color), count: 0 }; cache.set(colorKey, entry);
              }
              const color = entry.color;
              entry.count++; const ratio = entry.ratio;
              const px = (i / 4) % pixelWidth, py = Math.floor(i / 4 / pixelWidth);
              const nearRegionEdge = (bounds.x + px) / sx - rect.x < 2 || (bounds.y + py) / sy - rect.y < 2 || rect.x + rect.width - (bounds.x + px + 1) / sx < 2 || rect.y + rect.height - (bounds.y + py + 1) / sy < 2;
              if (!nearRegionEdge) minimumInteriorRatio = Math.min(minimumInteriorRatio, ratio);
              if (ratio < foreground.expectedContrastRatio) { belowThresholdPixels++; if (nearRegionEdge) edgeBandBelowThresholdPixels++; }
              if (entry.count === 1 && (worstSamples.length < 8 || ratio < worstSamples[worstSamples.length - 1].ratio)) {
                worstSamples.push({ region: regionIndex, x: px, y: py, color, ratio, nearRegionEdge }); worstSamples.sort((a,b) => a.ratio - b.ratio); if (worstSamples.length > 8) worstSamples.pop();
              }
              if (ratio < minimum) { minimum = ratio; worstColor = color; } maximum = Math.max(maximum, ratio);
            }
          }
          const histogram = [...cache.values()].map(entry => ({ color: entry.color, count: entry.count, ratio: entry.ratio })).sort((a,b) => b.count - a.count).slice(0,8);
          check.data = { ...check.data, contrastDebug: { schemaVersion: 1, method: 'css-text-against-hidden-text-background-regions', foregroundSource: 'computed-css', samplingBounds: 'fully-contained-device-pixels', fgColor: foreground.fgColor,
            expectedContrastRatio: foreground.expectedContrastRatio, minimumContrastRatio: minimum, maximumContrastRatio: maximum, sampledPixels, belowThresholdPixels,
            edgeBandBelowThresholdPixels, interiorBelowThresholdPixels: belowThresholdPixels - edgeBandBelowThresholdPixels, minimumInteriorRatio: Number.isFinite(minimumInteriorRatio) ? minimumInteriorRatio : null,
            edgeBandCssPixels: 2, screenshotScaleX: sx, screenshotScaleY: sy, textShadowSuppressed: foreground.hasTextShadow, regions, histogram, worstSamples } };
          // A bounded transient preview is for local inspection only; the exporter
          // never copies this image or arbitrary raw check fields.
          const previewRegion = worstSamples[0]?.region ?? 0, sourceRect = rects[previewRegion], sourceSize = regions[previewRegion];
          if (sourceRect && sourceSize) {
            const factor = Math.min(1, 500 / sourceSize.pixelWidth, 160 / sourceSize.pixelHeight);
            const preview = document.createElement('canvas'); preview.width = Math.max(1,Math.round(sourceSize.pixelWidth * factor)); preview.height = Math.max(1,Math.round(sourceSize.pixelHeight * factor));
            const painter = preview.getContext('2d'); painter.drawImage(canvas, sampleRegions[previewRegion].x, sampleRegions[previewRegion].y, sourceSize.pixelWidth, sourceSize.pixelHeight, 0,0,preview.width,preview.height);
            painter.strokeStyle = '#ff00ff'; painter.lineWidth = 1;
            for (const point of worstSamples.filter(point => point.region === previewRegion)) painter.strokeRect(point.x * factor - 3, point.y * factor - 3, 6,6);
            check.accessLensDebugPreview = preview.toDataURL('image/png');
          }
          const failureSupported = ['bgImage','bgGradient','pseudoContent','bgOverlap','elmPartiallyObscuring','outsideViewport'].includes(check.data?.messageKey);
          const bucket = minimum >= foreground.expectedContrastRatio ? 'passes' : maximum < foreground.expectedContrastRatio && !foreground.hasTextShadow && failureSupported ? 'violations' : null;
          if (!bucket) { review(node, !failureSupported && maximum < foreground.expectedContrastRatio ? 'engine-exception' : foreground.hasTextShadow ? 'shadow-dependent' : 'mixed-background', true); continue; }
          check.data = { ...check.data, fgColor: foreground.fgColor, bgColor: worstColor, contrastRatio: minimum, expectedContrastRatio: foreground.expectedContrastRatio,
            messageKey: null, automaticBackground: { method: 'rendered-background-with-text-temporarily-hidden', minimumContrastRatio: minimum, maximumContrastRatio: maximum, sampledPixels, textRegions: rects.length } };
          check.message = 'Automatic rendered-background measurement: minimum ' + minimum.toFixed(3) + ':1; required ' + foreground.expectedContrastRatio + ':1.';
          node.failureSummary = bucket === 'violations' ? check.message : undefined;
          let destination = results[bucket].find(result => result.id === rule.id);
          if (!destination) { destination = { ...rule, nodes: [] }; results[bucket].push(destination); }
          analysis.resolved++;
          destination.nodes.push(node); rule.nodes = rule.nodes.filter(item => item !== node);
        }
        analysis.status = 'completed';
        if (!rule.nodes.length) results.incomplete = results.incomplete.filter(item => item !== rule);
      } finally { bitmap.close(); }
    } catch { /* Capture denial, decoding failures, or changed pages retain reviews. */ }
    finally {
      for (const { el, original, applied, foreground } of changed) {
        if (el.getAttribute('style') === applied) { el.style.setProperty('-webkit-text-fill-color', foreground.fgColor, 'important'); getComputedStyle(el).webkitTextFillColor; if (original === null) el.removeAttribute('style'); else el.setAttribute('style', original); }
        else if (el.style.getPropertyValue('-webkit-text-fill-color') === 'transparent') {
          const probe = document.createElement('span'); if (original) probe.setAttribute('style', original);
          const value = probe.style.getPropertyValue('-webkit-text-fill-color');
          if (value) el.style.setProperty('-webkit-text-fill-color', value, probe.style.getPropertyPriority('-webkit-text-fill-color')); else el.style.removeProperty('-webkit-text-fill-color');
          if (el.style.getPropertyValue('text-shadow') === 'none' && el.style.getPropertyPriority('text-shadow') === 'important') { const shadow = probe.style.getPropertyValue('text-shadow'); if (shadow) el.style.setProperty('text-shadow', shadow, probe.style.getPropertyPriority('text-shadow')); else el.style.removeProperty('text-shadow'); }
          if (el.style.getPropertyValue('transition-property') === 'none' && el.style.getPropertyPriority('transition-property') === 'important') { const transition = probe.style.getPropertyValue('transition-property'); if (transition) el.style.setProperty('transition-property', transition, probe.style.getPropertyPriority('transition-property')); else el.style.removeProperty('transition-property'); }
        }
      }
    }
    if (!retry && results.incomplete.some(rule => rule.id === 'color-contrast' && rule.nodes.some(node => ['changed-during-scan','inline-style-changed','computed-style-changed','text-layout-changed'].includes(node.secondPass?.reason)))) {
      await new Promise(resolve => setTimeout(resolve, 600));
      await this.measureViewport(results, { retry: true });
      if (results.accessLensContrastAnalysis !== analysis) {
        results.accessLensContrastAnalysis.resolved += analysis.resolved;
        results.accessLensContrastAnalysis.candidates = Math.max(analysis.candidates, results.accessLensContrastAnalysis.candidates);
        results.accessLensContrastAnalysis.retried = true;
      }
    }
  },
  rgb(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Use a six-digit hexadecimal color.');
    return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  },
  ratio(foreground, background) {
    const luminance = hex => this.rgb(hex).map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  },
  foreground(element, { allowTextShadow = false } = {}) {
    if (['input', 'textarea'].includes(element.localName) && !element.value) throw new Error('Enter visible text before sampling. Placeholder colors require a separate assessment.');
    if (element.disabled || element.closest('[inert]') || element.getAttribute('aria-disabled') === 'true') throw new Error('Review inactive-control exceptions separately.');
    const style = getComputedStyle(element);
    const color = style.webkitTextFillColor || style.color;
    const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(color);
    if (!match || match[4] !== undefined && Number(match[4]) !== 1 || match.slice(1, 4).some(channel => Number(channel) > 255)) throw new Error('Transparent or unsupported text color. Use a separate manual color assessment.');
    for (let el = element; el; el = el.parentElement || el.getRootNode().host) {
      const current = getComputedStyle(el);
      const location = el === element ? 'the selected element' : 'an ancestor (' + el.localName + ')';
      if (Number(current.opacity) !== 1) throw new Error('Sampling stopped: opacity ' + current.opacity + ' on ' + location + ' changes the rendered text color.');
      if (current.filter !== 'none') throw new Error('Sampling stopped: a CSS filter on ' + location + ' may change the rendered text color.');
      if (current.mixBlendMode !== 'normal') throw new Error('Sampling stopped: mix-blend-mode on ' + location + ' changes the rendered text color.');
      if (current.backdropFilter && current.backdropFilter !== 'none') throw new Error('Sampling stopped: backdrop-filter on ' + location + ' requires a separate assessment.');
      if (current.transform !== 'none') {
        // Translations position content without changing its color or text size.
        const matrix = new DOMMatrixReadOnly(current.transform);
        const identity = { m11: 1, m12: 0, m13: 0, m14: 0, m21: 0, m22: 1, m23: 0, m24: 0, m31: 0, m32: 0, m33: 1, m34: 0, m44: 1 };
        if (Object.entries(identity).some(([key, value]) => Math.abs(matrix[key] - value) > 1e-8)) throw new Error('Sampling stopped: a scaling, rotation, or perspective transform on ' + location + ' can change text geometry. Position-only transforms are supported.');
      }
      if (current.scale && current.scale !== 'none' || current.rotate && current.rotate !== 'none' || current.perspective && current.perspective !== 'none') throw new Error('Sampling stopped: CSS scale, rotate, or perspective on ' + location + ' can change text geometry.');
    }
    if (style.textShadow !== 'none' && !allowTextShadow || Number.parseFloat(style.webkitTextStrokeWidth) > 0) throw new Error('Text shadows or strokes require a separate manual color assessment.');
    const fontSize = Number.parseFloat(style.fontSize), fontWeight = Number.parseInt(style.fontWeight, 10);
    if (!Number.isFinite(fontSize) || !Number.isFinite(fontWeight)) throw new Error('Font measurements are unavailable.');
    return { ...(allowTextShadow ? { hasTextShadow: style.textShadow !== 'none' } : {}), fgColor: '#' + match.slice(1, 4).map(value => Number(value).toString(16).padStart(2, '0')).join(''),
      fontSize, fontWeight, expectedContrastRatio: fontSize >= 24 || fontSize >= 14 * 96 / 72 && fontWeight >= 700 ? 3 : 4.5 };
  },
  sample(foreground, background) {
    const ratio = this.ratio(foreground.fgColor, background);
    return { method: 'css-foreground-and-user-selected-screenshot-pixel', fgColor: foreground.fgColor, bgColor: background.toLowerCase(),
      contrastRatio: ratio, expectedContrastRatio: foreground.expectedContrastRatio, fontSize: foreground.fontSize, fontWeight: foreground.fontWeight,
      sampledAt: new Date().toISOString(), reviewRequired: true };
  },
  async show(container, capture, record) {
    container.replaceChildren();
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Capturing the visible element…'; container.append(status);
    try {
      const { image, foreground } = await capture();
      if (!container.isConnected) return;
      const note = document.createElement('p'); note.textContent = 'Select a background pixel beside the text, avoiding letters, icons, edges, and shadows. The text color comes from CSS to avoid antialiasing errors. Test multiple points over images/gradients. This sample does not clear the review or establish conformance.';
      const canvas = document.createElement('canvas'); canvas.className = 'contrast-sample-image'; canvas.width = image.width; canvas.height = image.height;
      canvas.style.cssText = 'width:100%;height:auto;image-rendering:pixelated;cursor:crosshair;display:block'; canvas.setAttribute('aria-label', 'Captured element. Select a background pixel, or enter its color below.');
      const bitmap = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0); bitmap.close();
      const label = document.createElement('label'); label.textContent = 'Background color (hex): ';
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = '#ffffff'; input.maxLength = 7; input.setAttribute('aria-label', 'Sampled background color'); label.append(input);
      const measure = document.createElement('button'); measure.type = 'button'; measure.textContent = 'Measure color pair';
      const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear sample';
      const calculate = async () => {
        try {
          const result = accessLensContrast.sample(foreground, input.value);
          status.textContent = 'Sampled ratio ' + result.contrastRatio.toFixed(3) + ':1; required ' + result.expectedContrastRatio + ':1. Foreground ' + result.fgColor + '; background ' + result.bgColor + '. ' + (result.contrastRatio >= result.expectedContrastRatio ? 'This sampled color pair meets the threshold.' : 'This sampled color pair is below the threshold.') + ' Manual review still required.';
          await record(result);
        } catch (error) { status.textContent = error.message; }
      };
      canvas.onclick = event => {
        const box = canvas.getBoundingClientRect();
        const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((event.clientX - box.left) * canvas.width / box.width)));
        const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((event.clientY - box.top) * canvas.height / box.height)));
        const pixel = context.getImageData(x, y, 1, 1).data;
        input.value = '#' + [...pixel.slice(0, 3)].map(value => value.toString(16).padStart(2, '0')).join(''); calculate();
      };
      measure.onclick = calculate;
      clear.onclick = async () => { await record(null); container.replaceChildren(); };
      status.textContent = 'Choose a background pixel or enter a background color.';
      container.prepend(note, canvas, label, measure, clear);
    } catch (error) { if (container.isConnected) status.textContent = error.message || 'Could not capture this element. Keep the page active and retry.'; }
  }
};
