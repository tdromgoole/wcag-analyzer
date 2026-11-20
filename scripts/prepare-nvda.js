const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

if (process.platform !== 'win32') throw new Error('The NVDA test lane requires Windows.');
const manifest = require('../node_modules/@guidepup/guidepup/manifest.json');
const asset = manifest.screenReaders.find(reader => reader.id === 'nvda').assets[0];
if (asset.version !== '0.2.1-2026.3') throw new Error('Review the loopback test profile before changing the NVDA asset version.');
const cache = path.resolve(process.env.GUIDEPUP_SCREEN_READERS_PATH || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'guidepup'));
const installation = path.resolve(cache, 'nvda', 'all', asset.version, 'extracted');
if (!installation.startsWith(cache + path.sep) || !fs.existsSync(path.join(installation, 'nvda.exe'))) throw new Error('Install the pinned NVDA assets with the Guidepup setup CLI first.');
const plugins = path.join(installation, 'userConfig', 'scratchpad', 'globalPlugins');
fs.mkdirSync(plugins, { recursive: true });
fs.copyFileSync(path.resolve(__dirname, '../screen-reader-tests/support/localRelay.py'), path.join(plugins, 'laboratoryLocalRelay.py'));
console.log('Prepared a loopback-only NVDA automation profile for the pinned asset.');
