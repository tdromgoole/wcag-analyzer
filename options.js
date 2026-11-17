(() => {
  const $ = selector => document.querySelector(selector);
  let settings;
  async function keyboardPermission() {
    const allowed = await globalThis.chrome?.permissions?.contains({ permissions: ['debugger'] });
    const enabled = (await accessLensSettings.read()).keyboardTestingEnabled;
    $('#keyboardPermissionStatus').textContent = !allowed ? 'Install or reload the current extension build and accept its debugger permission to use keyboard testing.' : enabled ? 'Keyboard testing is enabled. Start a run from View > Keyboard test in the inspector.' : 'Keyboard testing is disabled.';
  }
  $('#enableKeyboard').onclick = async () => {
    try {
      if (!await chrome.permissions.contains({ permissions: ['debugger'] })) throw new Error();
      settings = { ...(await accessLensSettings.read()), keyboardTestingEnabled: true };
      await accessLensSettings.write(settings);
      await keyboardPermission();
    } catch { $('#keyboardPermissionStatus').textContent = 'Keyboard testing could not be enabled. Install or reload the current build and accept its debugger permission.'; }
  };
  $('#disableKeyboard').onclick = async () => {
    try {
      settings = { ...(await accessLensSettings.read()), keyboardTestingEnabled: false };
      await accessLensSettings.write(settings);
      if (globalThis.chrome?.runtime?.sendMessage) await chrome.runtime.sendMessage({ type: 'access-lens-keyboard-disable' });
      await keyboardPermission();
    }
    catch { $('#keyboardPermissionStatus').textContent = 'Could not change keyboard permission.'; }
  };
  $('#deleteKeyboard').onclick = async () => {
    try {
      await accessLensSettings.write({}, 'keyboard-last-run');
      $('#keyboardPermissionStatus').textContent = 'Last transcript deleted. Existing exported files and an active run are unchanged.';
    } catch { $('#keyboardPermissionStatus').textContent = 'Could not delete the transcript.'; }
  };
  keyboardPermission().catch(() => {});
  function render() {
    $('#folder').textContent = settings.directory ? `Selected folder: ${settings.directory.name}` : 'Browser default download location';
    $('#autoSave').checked = Boolean(settings.autoSave);
    $('#autoSave').disabled = !settings.directory;
    $('#rememberHistory').checked = Boolean(settings.rememberHistory);
    $('#restore').disabled = !settings.directory;
    $('#enableBrowsing').disabled = !settings.directory || !globalThis.chrome?.scripting;
    $('#paused').checked = Boolean(settings.paused);
    $('#queryKeys').value = (settings.queryKeys || []).join(', ');
    $('#hashRoutes').checked = Boolean(settings.hashRoutes);
    $('#exclusions').value = (settings.exclusions || []).join('\n');
    $('#staleDays').value = settings.staleDays || 7;
    if (!settings.directory) $('#permission').textContent = '';
    else settings.directory.queryPermission({ mode: 'readwrite' }).then(permission => {
      $('#permission').textContent = permission === 'granted' ? 'Folder write access is granted.' : 'Folder write access needs to be restored before saving.';
    }).catch(() => { $('#permission').textContent = 'Could not check folder access. Choose the folder again.'; });
  }
  async function queueList() {
    if (!accessLensSettings.pending) return;
    const entries = Object.entries(await accessLensSettings.pending());
    $('#queueStatus').textContent = `${entries.length} queued report(s).`;
    $('#queueList').replaceChildren();
    for (const [filename, entry] of entries) {
      const li = document.createElement('li'); li.textContent = `${entry.report.pagePath} · ${new Date(entry.at).toLocaleString()} `;
      const button = document.createElement('button'); button.textContent = 'Delete queued report';
      button.onclick = async () => { await accessLensSettings.deletePending(filename); await queueList(); };
      li.append(button); $('#queueList').append(li);
    }
  }
  async function retryQueue() {
    if (globalThis.chrome?.runtime?.sendMessage) await chrome.runtime.sendMessage({ type: 'access-lens-queue-retry' });
    await queueList();
  }
  $('#retryQueue').onclick = () => retryQueue().catch(() => { $('#queueStatus').textContent = 'Could not retry queued reports. Restore folder access and retry.'; });
  $('#deleteQueue').onclick = async () => { await accessLensSettings.deletePending(); await queueList(); };
  $('#savePolicy').onclick = async () => {
    try {
      const queryKeys = $('#queryKeys').value.split(',').map(value => value.trim()).filter(Boolean);
      const exclusions = $('#exclusions').value.split('\n').map(value => value.trim()).filter(Boolean);
      if (queryKeys.length > 20 || queryKeys.some(key => !/^[\w.-]{1,64}$/.test(key))) throw new Error('Use up to 20 query parameter names containing letters, numbers, underscores, dots, or hyphens.');
      if (exclusions.length > 100 || exclusions.some(path => !path.startsWith('/') || /[?#]/.test(path) || path.slice(0, -1).includes('*'))) throw new Error('Use up to 100 paths beginning with /, with an optional * only at the end.');
      await update({ ...settings, paused: $('#paused').checked, queryKeys, hashRoutes: $('#hashRoutes').checked, exclusions, staleDays: Math.max(1, Math.min(365, Number($('#staleDays').value) || 7)) });
      if (globalThis.chrome?.runtime?.sendMessage) await chrome.runtime.sendMessage({ type: 'access-lens-policy-changed' });
      if (globalThis.chrome?.scripting) await accessLensAutoMode.retry();
    } catch (error) { $('#status').textContent = error.message; }
  };
  async function browsingSites() {
    if (!globalThis.chrome?.scripting) return;
    let restoreError;
    try { await accessLensAutoMode.restore(); } catch (error) { restoreError = error.message; }
    const list = $('#browsingSites'); list.replaceChildren();
    for (const script of await accessLensAutoMode.list()) {
      const li = document.createElement('li'); li.append(document.createTextNode(script.matches.join(', ') + ' '));
      const stop = document.createElement('button'); stop.textContent = 'Disable';
      stop.onclick = async () => {
        try { await accessLensAutoMode.stop(script); await browsingSites(); $('#browsingStatus').textContent = 'Browsing scans disabled for this site.'; }
        catch { $('#browsingStatus').textContent = 'Could not disable this site. Try again.'; }
      };
      li.append(stop); list.append(li);
    }
    const latest = await accessLensSettings.read('auto-status');
    if (latest.at) $('#browsingStatus').textContent = `Last browsing scan ${new Date(latest.at).toLocaleString()}: ${latest.ok ? 'JSON saved.' : accessLensSettings.saveError({ code: latest.code, name: latest.code }).error}`;
    if (restoreError) $('#browsingStatus').textContent = `Could not restore browsing scans. ${restoreError}`;
  }
  $('#enableBrowsing').onclick = async () => {
    try {
      const pattern = accessLensAutoMode.pattern($('#autoSite').value);
      // Request site permission directly from this user gesture, before any awaits.
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) { $('#browsingStatus').textContent = 'Site access was not granted. Browsing scans remain off.'; return; }
      await accessLensAutoMode.start(pattern);
      await browsingSites();
      $('#browsingStatus').textContent = 'Browsing scans enabled. Browse this site normally; the panel will stay closed.';
    } catch (error) { $('#browsingStatus').textContent = error.message || 'Could not enable browsing scans.'; }
  };
  async function update(next) {
    await accessLensSettings.write(next);
    settings = next;
    render();
    $('#status').textContent = 'Settings saved.';
  }
  $('#choose').onclick = async () => {
    try {
      const directory = await showDirectoryPicker({ mode: 'readwrite', id: 'access-lens-reports' });
      await update({ ...settings, directory });
      if (globalThis.chrome?.scripting) await accessLensAutoMode.retry();
      await retryQueue();
    } catch (error) {
      if (error.name !== 'AbortError') $('#status').textContent = `Could not select folder: ${error.message}`;
    }
  };
  $('#restore').onclick = async () => {
    try {
      // Called directly from the click while the browser's user activation is available.
      const permission = await settings.directory.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted' && globalThis.chrome?.scripting) await accessLensAutoMode.retry();
      if (permission === 'granted') await retryQueue();
      render();
      $('#status').textContent = permission === 'granted'
        ? 'Folder access restored. Return to the page and click Retry save. Keep Settings open if access expires when this tab closes.'
        : 'Folder access was not granted. Choose another folder or use browser downloads.';
    } catch { $('#status').textContent = 'Could not restore access. Choose the folder again.'; }
  };
  $('#reset').onclick = () => update({ ...settings, directory: undefined, autoSave: false }).catch(error => { $('#status').textContent = error.message; });
  $('#rememberHistory').onchange = async () => {
    try {
      const enabled = $('#rememberHistory').checked;
      if (!enabled) await accessLensSettings.clearHistory();
      await update({ ...settings, rememberHistory: enabled });
    } catch (error) { render(); $('#status').textContent = error.message; }
  };
  $('#clearHistory').onclick = async () => {
    try { await accessLensSettings.clearHistory(); $('#status').textContent = 'Saved comparison history and checklists cleared. Reopen inspectors to clear their in-memory history.'; }
    catch { $('#status').textContent = 'Could not clear history. Try again.'; }
  };
  $('#autoSave').onchange = async () => {
    try { await update({ ...settings, autoSave: $('#autoSave').checked }); }
    catch (error) { render(); $('#status').textContent = error.message; }
  };
  accessLensSettings.read().then(async value => { settings = value; render(); await browsingSites(); await queueList(); }).catch(error => {
    $('#status').textContent = `Could not load settings: ${error.message}`;
    $('#choose').disabled = $('#reset').disabled = true;
  });
})();
