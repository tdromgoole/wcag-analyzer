// Transient local pixels for contrast measurement; screenshots are not exported
// or written to evidence storage. Caller/tab checks apply to every capture.
globalThis.accessLensContrastCapture = async (message, sender) => {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !Number.isInteger(sender.tab.windowId) || !/^https?:/.test(sender.url || '')) throw new Error('Open the inspector on a regular website.');
  const { rect, viewport } = message;
  if (!rect || !viewport || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.width > (message.automatic === true ? 4096 : 1200) || rect.height > (message.automatic === true ? 2160 : 600) || viewport.width <= 0 || viewport.height <= 0 || rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height) throw new Error('The complete element must fit in the viewport (up to 1200 × 600 CSS pixels).');
  const sameTab = async () => {
    const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    const tab = await chrome.tabs.get(sender.tab.id);
    if (active?.id !== sender.tab.id || tab.url !== sender.url || tab.pendingUrl && tab.pendingUrl !== sender.url) throw new Error('Keep the inspected page active without navigating while sampling.');
  };
  await sameTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
  await sameTab();
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const scaleX = bitmap.width / viewport.width, scaleY = bitmap.height / viewport.height;
    if (Math.abs(scaleX - scaleY) > .02 || scaleX < .5 || scaleX > 4) throw new Error('Screenshot dimensions changed. Retry without resizing or zooming.');
    const x = Math.floor(rect.x * scaleX), y = Math.floor(rect.y * scaleY);
    const width = Math.min(bitmap.width - x, Math.ceil((rect.x + rect.width) * scaleX) - x);
    const height = Math.min(bitmap.height - y, Math.ceil((rect.y + rect.height) * scaleY) - y);
    if (width * height > (message.automatic === true ? 16000000 : 4000000)) throw new Error('Element screenshot is too large. Reduce browser zoom and retry.');
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(bitmap, x, y, width, height, 0, 0, width, height);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    await sameTab();
    return { dataUrl: 'data:image/png;base64,' + btoa(binary), width, height };
  } finally { bitmap.close(); }
};
