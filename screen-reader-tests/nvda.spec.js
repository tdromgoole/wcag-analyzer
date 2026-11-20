const { nvdaTest: test } = require('@guidepup/playwright');
const { expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');

// Session-only settings: the vendor image selects a OneCore voice that is not
// installed on every Windows machine. eSpeak ships with this portable NVDA.
test.use({ nvdaStartOptions: { capture: true, settings: {
  speech: { synth: 'espeak', espeak: { voice: 'en', rate: 50 } },
  general: { language: 'en', loggingLevel: 'INFO' },
  development: { enableScratchpadDir: true },
  speechViewer: { showSpeechViewerAtStartup: false },
  vision: { NVDAHighlighter: { enabled: false } }
} } });

test('real NVDA reads the local laboratory heading', async ({ page, nvda }, testInfo) => {
  await page.goto('http://127.0.0.1:4178/laboratory/fixtures/images/pass.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Image with a contextual alternative');
  await page.bringToFront();
  const bindings = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', '@(Get-NetTCPConnection -LocalPort 6837 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty LocalAddress) | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true }));
  expect([bindings].flat().every(address => ['127.0.0.1', '::1'].includes(address)), 'NVDA automation relay must bind only to loopback').toBe(true);
  await nvda.navigateToWebContent();
  await nvda.perform(nvda.keyboardCommands.reportTitle);
  const title = await nvda.lastSpokenPhrase();
  expect(title.includes('Image with a contextual alternative'), 'Keep the laboratory Chrome window in the foreground before NVDA navigation').toBe(true);
  await nvda.clearSpokenPhraseLog();
  let phrase = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    await nvda.nextHeading();
    phrase = await nvda.lastSpokenPhrase();
    if (/Image with a contextual alternative/i.test(phrase)) break;
  }
  expect(/Image with a contextual alternative/i.test(phrase), 'NVDA must report the synthetic fixture heading; unrelated desktop speech is not logged').toBe(true);
  await testInfo.attach('real-nvda-synthetic-heading', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ evidenceType: 'real-nvda-automation', nvdaVersion: nvda.version,
      browser: testInfo.project.name, matchedHeading: 'Image with a contextual alternative', observedAt: new Date().toISOString(), fixtureVersion: '2' }))
  });
});
