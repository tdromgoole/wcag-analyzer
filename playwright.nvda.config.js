const { withGuidepup } = require('@guidepup/playwright');

module.exports = withGuidepup({
  testDir: './screen-reader-tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/nvda-run.json' }]],
  outputDir: 'test-results/nvda',
  use: { viewport: { width: 1280, height: 800 }, launchOptions: { args: ['--force-renderer-accessibility'] } },
  projects: [{ name: 'nvda-chrome', use: { browserName: 'chromium', channel: 'chrome' } }],
  webServer: { command: 'node tests/server.js', port: 4178, reuseExistingServer: !process.env.CI }
});
