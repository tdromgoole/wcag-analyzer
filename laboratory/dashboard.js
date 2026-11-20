(async () => {
  const $ = selector => document.querySelector(selector);
  const labels = { fail: 'Fail', pass: 'Pass', manual: 'Needs Manual Review', 'not-applicable': 'Not Applicable' };
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  try {
    const [manifest, coverage] = await Promise.all(['manifest.json', 'coverage.json'].map(async url => { const response = await fetch(url); if (!response.ok) throw new Error(); return response.json(); }));
    let run = null;
    $('#caseCount').textContent = manifest.cases.length;
    $('#criterionCount').textContent = coverage.criteria.length;
    $('#gapCount').textContent = coverage.criteria.filter(item => item.disposition === 'not-yet-covered').length;
    for (const criterion of coverage.criteria) {
      const row = element('tr');
      for (const text of [`${criterion.id} ${criterion.title}`, criterion.disposition, String(criterion.caseIds.length)]) row.append(element('td', text));
      $('#coverage').append(row);
    }
    const render = () => {
      const filter = $('input[name="outcome"]:checked').value;
      const cases = manifest.cases.filter(item => filter === 'all' || item.expected.outcome === filter);
      $('#visibleCount').textContent = `${cases.length} of ${manifest.cases.length} scenarios`;
      $('#cases').replaceChildren();
      for (const item of cases) {
        const card = element('article', undefined, 'case');
        const description = element('div');
        const title = element('h3'); const link = element('a', item.title); link.href = item.fixture; title.append(link); description.append(title);
        const viewport = item.viewport || manifest.viewport;
        description.append(element('p', `${item.category} · ${item.criterionIds.join(', ')} · ${item.id} · ${viewport.width} × ${viewport.height}`, 'meta'));
        if (item.evaluatedFixture) description.append(element('p', `Run the process from its starting page; the evaluated state is ${item.evaluatedFixture}.`, 'meta'));
        description.append(element('p', item.manualInstructions));
        description.append(element('p', `Known fixture condition: ${item.knownCondition}. This is separate from the expected scanner response.`, 'meta'));
        description.append(element('p', item.expected.count === null ? 'Human evaluation required; no automatic violation count asserted.' : `${item.expected.ruleId}: ${item.expected.count} scoped element result(s) in ${item.expected.bucket}.`, 'meta'));
        const recorded = run?.results.find(result => result.caseId === item.id);
        description.append(element('p', recorded ? `Recorded comparison: ${recorded.comparison} · ${recorded.environmentMismatch ? 'recorded viewport differs from this case' : recorded.actualCount === null ? 'manual evaluation outstanding' : recorded.actualCount + ' scoped result(s)'}` : 'Not run — expected outcome only', 'actual'));
        card.append(description, element('div', labels[item.expected.outcome], `outcome ${item.expected.outcome}`));
        $('#cases').append(card);
      }
    };
    for (const input of document.querySelectorAll('input[name="outcome"]')) input.addEventListener('change', render);
    $('#runFile').addEventListener('change', async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 5 * 1024 * 1024) throw new Error();
        const candidate = JSON.parse(await file.text());
        if (candidate.schemaVersion !== '1.0' || candidate.reportType !== 'laboratory-run' || !Array.isArray(candidate.results) || !Number.isFinite(Date.parse(candidate.finishedAt)) || typeof candidate.scannerVersion !== 'string') throw new Error();
        const ids = new Set();
        for (const result of candidate.results) {
          const item = manifest.cases.find(item => item.id === result.caseId);
          const expected = item?.expected;
          if (!expected || ids.has(result.caseId) || result.method !== expected.method || !['matched','mismatch','manual-outstanding','error'].includes(result.comparison) || !(result.actualCount === null || Number.isSafeInteger(result.actualCount) && result.actualCount >= 0)) throw new Error();
          ids.add(result.caseId);
          const viewport = item.viewport || manifest.viewport;
          result.environmentMismatch = !result.viewport || result.viewport.width !== viewport.width || result.viewport.height !== viewport.height || Boolean(item.evaluatedFixture && result.evaluatedFixture !== item.evaluatedFixture);
          if (result.comparison !== 'error') result.comparison = result.environmentMismatch ? 'mismatch' : expected.method === 'manual' ? 'manual-outstanding'
            : result.hasRule === true && result.actualCount === expected.count ? 'matched' : 'mismatch';
        }
        run = candidate;
        $('#runStatus').textContent = `Recorded run ${candidate.finishedAt} · scanner ${candidate.scannerVersion}. ${candidate.manifestVersion !== manifest.manifestVersion || candidate.fixtureVersion !== manifest.fixtureVersion ? 'Version mismatch: results are stale.' : 'Historical evidence; freshness is not established. Rerun after scanner or fixture changes.'} Manual-outstanding results are not verified passes.`;
        render();
      } catch { run = null; $('#runStatus').textContent = 'Could not load this run. Use a supported laboratory-run JSON file. No actual results are shown.'; render(); }
    });
    render();
  } catch { $('#runStatus').textContent = 'Laboratory files could not be loaded. Start the local server and reload this page.'; }
})();
