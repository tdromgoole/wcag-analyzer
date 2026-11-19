const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
fs.copyFileSync(require.resolve('axe-core/axe.min.js'), path.join(root, 'vendor/axe.min.js'));
fs.copyFileSync(require.resolve('axe-core/LICENSE'), path.join(root, 'vendor/AXE-LICENSE'));
const dest = path.join(root, 'dist/access-lens');
fs.mkdirSync(dest, { recursive: true });
for (const file of ['manifest.json', 'contrast.js', 'contrast-background.js', 'background.js', 'keyboard.js', 'keyboard-background.js', 'inspection.js', 'checks.js', 'export.js', 'workflow.js', 'features.js', 'recovery.js', 'content.js', 'save-settings.js', 'auto-mode.js', 'auto-scan.js', 'options.html', 'options.js', 'README.md']) {
  fs.copyFileSync(path.join(root, file), path.join(dest, file));
}
fs.cpSync(path.join(root, 'vendor'), path.join(dest, 'vendor'), { recursive: true });
console.log('Load dist/access-lens as an unpacked browser extension.');



