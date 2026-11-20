const base = require('./playwright.config');
module.exports = { ...base, testDir: './laboratory-stress-tests', outputDir: 'test-results/stress', reporter: [['list']] };
