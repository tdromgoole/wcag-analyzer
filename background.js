importScripts('contrast-background.js', 'save-settings.js', 'export.js', 'auto-mode.js', 'workflow.js', 'features.js', 'recovery.js', 'keyboard-background.js');
async function autoBadge(tabId, text, title, color) {
  if (!tabId) return;
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text }), chrome.action.setTitle({ tabId, title }),
    chrome.action.setBadgeBackgroundColor({ tabId, color })
  ]);
}
async function handleAuto(message, sender) {
  await browsingReady;
  if (!sender.tab?.id || sender.frameId !== 0 || !await accessLensAutoMode.enabled(sender.url)) return { enabled: false };
  let address = message.address || sender.url;
  if (new URL(address).origin !== new URL(sender.url).origin) return { enabled: false };
  const policy = accessLensFeatures.policy(await accessLensSettings.read(), address);
  if (message.type === 'access-lens-auto-check') {
    if (policy.paused || policy.excluded) await autoBadge(sender.tab.id, policy.paused ? 'P' : 'SKIP', policy.paused ? 'Access Lens: background scans paused' : 'Access Lens: this path is excluded', '#53647b');
    return { enabled: true, ...policy };
  }
  if (message.type === 'access-lens-auto-attempt' || message.type === 'access-lens-auto-failed') {
    if (message.sitemap) await accessLensSettings.sitemap(message.sitemap.site, { ...message.sitemap, status: message.status || 'failed' });
    if (message.type === 'access-lens-auto-failed') await autoBadge(sender.tab.id, '!', 'Access Lens: scan failed or was interrupted. Revisit this page to retry.', '#b42335');
    return { ok: true };
  }
  if (policy.paused || policy.excluded) return { skipped: true };
  if (message.type === 'access-lens-auto-progress') {
    await autoBadge(sender.tab.id, 'SCAN', 'Access Lens: scanning this page in browsing mode', '#255caa');
    return { ok: true };
  }
  try {
    if (message.type !== 'access-lens-auto-result') throw new Error();
    const previous = await accessLensSettings.history(message.filename);
    const baseline = accessLensWorkflow.baseline(message.report);
    message.report.manualChecks = previous.checklist || {};
    if (previous.keyboardTest) message.report.keyboardTest = previous.keyboardTest;
    const previousKeyboard = await accessLensSettings.read('keyboard-last-run');
    if (previousKeyboard.filename === message.filename && previousKeyboard.run && (!message.report.keyboardTest || Date.parse(previousKeyboard.run.startedAt) >= Date.parse(message.report.keyboardTest.startedAt))) message.report.keyboardTest = previousKeyboard.run;
    message.report.comparison = accessLensWorkflow.compare(previous.baseline, baseline);
    const metadata = { ...message.sitemap, ...(await accessLensFeatures.scanMetadata(message.report, policy.staleDays)),
      state: message.report.pageState.key,
      violations: baseline.issues.length,
      review: message.report.results.incomplete.reduce((sum, rule) => sum + rule.nodes.length, 0),
      manualFailures: Object.values(message.report.manualChecks).filter(check => check.status === 'fail').length + (message.report.keyboardTest?.assessment?.status === 'fail' ? 1 : 0)
    };
    // Record completed scans separately from file-save success.
    await accessLensSettings.history(message.filename, { baseline, checklist: message.report.manualChecks });
    const saved = await accessLensSettings.saveRecoverable(message.report, false, message.filename, metadata, true);
    await accessLensSettings.sitemap(metadata.site, { ...metadata, status: saved.saved ? 'saved' : saved.queued ? 'queued' : 'failed' });
    await accessLensSettings.write({ ok: Boolean(saved.saved), code: saved.code, at: new Date().toISOString() }, 'auto-status');
    await autoBadge(sender.tab.id, saved.saved ? 'OK' : saved.queued ? 'Q' : '!', saved.saved ? 'Access Lens: content-free JSON saved. Click to inspect findings.' : saved.queued ? 'Access Lens: report queued locally. Restore folder access in Settings; saving will retry.' : `Access Lens: ${saved.error}`, saved.saved ? '#257253' : '#956100');
    return saved;
  } catch (error) {
    const response = accessLensSettings.saveError(error);
    await accessLensSettings.write({ ok: false, code: response.code, at: new Date().toISOString() }, 'auto-status').catch(() => {});
    await autoBadge(sender.tab.id, '!', `Access Lens: ${response.error}`, '#b42335');
    return response;
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'access-lens-contrast-capture') {
    accessLensContrastCapture(message, sender).then(image => respond({ image }), () => respond({ error: 'Could not capture this element. Keep this page active, click the extension toolbar button to restore site access, and retry.' }));
  } else if (message.type === 'access-lens-keyboard-disable') {
    accessLensKeyboardDriver.end('disabled-in-settings').then(() => respond({ ok: true }), () => respond({ error: true }));
  } else if (message.type === 'access-lens-keyboard') {
    accessLensKeyboardDriver.handle(message, sender).then(respond, () => respond({ error: 'Keyboard testing was interrupted. Check Settings and try again.' }));
  } else if (message.type.startsWith('access-lens-auto-')) {
    handleAuto(message, sender).then(respond, () => respond({ error: 'Automatic scanning is unavailable. Reload this page or check Settings.' }));
  } else if (message.type === 'access-lens-policy') {
    accessLensSettings.read().then(settings => respond(accessLensFeatures.policy(settings, message.address || sender.url)), () => respond({ error: true }));
  } else if (message.type === 'access-lens-policy-changed') {
    refreshMenu().then(() => respond({ ok: true }), () => respond({ error: true }));
  } else if (message.type === 'access-lens-pause-toggle') {
    (async () => {
      const settings = await accessLensSettings.read(), paused = !settings.paused;
      await accessLensSettings.write({ ...settings, paused });
      await refreshMenu(); await accessLensAutoMode.retry();
      return { paused };
    })().then(respond, () => respond({ error: true }));
  } else if (message.type === 'access-lens-queue-retry') {
    recoverQueue(true).then(respond, () => respond({ error: true }));
  } else if (message.type === 'access-lens-site-report') {
    accessLensSettings.loadSiteReport(message.address || sender.url).then(respond, error => respond(accessLensSettings.saveError(error)));
  } else if (message.type === 'access-lens-save-sitemap') {
    accessLensSettings.saveSitemap(message.site).then(respond, error => respond(accessLensSettings.saveError(error)));
  } else if (message.type === 'access-lens-sitemap') {
    accessLensSettings.sitemap(message.site, message.update, message.clear === true).then(respond, () => respond({ error: true }));
  } else if (message.type === 'access-lens-history') {
    accessLensSettings.history(message.filename, message.next).then(respond, () => respond({ error: true }));
  } else if (message.type === 'access-lens-settings') {
    chrome.runtime.openOptionsPage().then(() => respond({ ok: true }), () => respond({ error: 'Could not open Settings.' }));
  } else if (message.type === 'access-lens-save') {
    (async () => {
      const policy = accessLensFeatures.policy(await accessLensSettings.read(), message.report.pagePath);
      if (policy.excluded) return { error: 'This page is excluded in Settings. Remove its exclusion before saving.' };
      const response = await accessLensSettings.saveRecoverable(message.report, message.decisionsChanged ? false : message.automatic === true, message.filename, message.metadata, false, message.decisionsChanged === true);
      if (!response.skipped && !response.download && message.metadata?.site) await accessLensSettings.sitemap(message.metadata.site, { ...message.metadata, status: response.saved ? 'saved' : response.queued ? 'queued' : 'failed' });
      return response;
    })()
      .then(respond, error => respond(accessLensSettings.saveError(error)));
  } else return;
  return true;
});
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['vendor/axe.min.js', 'inspection.js', 'checks.js', 'export.js', 'workflow.js', 'features.js', 'contrast.js', 'keyboard.js', 'content.js'] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (error) {
    console.warn('Access Lens could not open on this page.');
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b42335' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Cannot analyze this page. Open a regular website; browser settings and store pages are restricted.' });
  }
});
let menuRefresh = Promise.resolve();
function refreshMenu() {
  menuRefresh = menuRefresh.catch(() => {}).then(async () => {
    if (!chrome.contextMenus) return;
    await chrome.contextMenus.removeAll();
    const checked = Boolean((await accessLensSettings.read()).paused);
    await new Promise((resolve, reject) => {
      chrome.contextMenus.create({ id: 'access-lens-pause', title: 'Pause background scans', contexts: ['action'], type: 'checkbox', checked }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message)); else resolve();
      });
    });
  });
  return menuRefresh;
}
async function ensureRecoveryAlarm() {
  if (chrome.alarms && !await chrome.alarms.get('access-lens-recovery')) await chrome.alarms.create('access-lens-recovery', { periodInMinutes: 1 });
}
async function recoverQueue(explicit = false) {
  const result = await accessLensSettings.flushQueue(explicit);
  if (result.saved) await accessLensAutoMode.retry();
  return result;
}
chrome.alarms?.onAlarm.addListener(alarm => { if (alarm.name === 'access-lens-recovery') recoverQueue().catch(() => {}); });
chrome.contextMenus?.onClicked.addListener(async info => {
  if (info.menuItemId !== 'access-lens-pause') return;
  const settings = await accessLensSettings.read();
  await accessLensSettings.write({ ...settings, paused: info.checked });
  await accessLensAutoMode.retry();
});
chrome.runtime.onInstalled?.addListener(async () => {
  await ensureRecoveryAlarm(); await refreshMenu();
  await restoreBrowsing(true);
});
async function restoreBrowsing(retry = false) {
  try { await (retry ? accessLensAutoMode.retry() : accessLensAutoMode.restore()); }
  catch { console.warn('Access Lens could not restore browsing scans.'); }
}
chrome.runtime.onStartup?.addListener(() => { ensureRecoveryAlarm().catch(() => {}); restoreBrowsing(true); });
const browsingReady = restoreBrowsing();
ensureRecoveryAlarm().catch(() => {});
refreshMenu().catch(() => {});



