// Build the release zip (base64-decoder-v<version>.zip) and check that every file the extension loads is inside it.
// Usage: node scripts/package.js [outDir]   (outDir defaults to the repository root)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const outDir = path.resolve(process.argv[2] || root);
const zipPath = path.join(outDir, `base64-decoder-v${manifest.version}.zip`);

// Runtime files plus the READMEs; test/ and scripts/ stay out of the release
const INCLUDE = ['manifest.json', 'README.md', 'README_CN.md', '_locales', 'background', 'content', 'icons', 'popup', 'shared'];

fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zipPath, ...INCLUDE, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });

// Files referenced by manifest.json, the locale bundles, and the popup's src/href attributes
function referencedFiles() {
  const files = new Set(Object.values(manifest.icons || {}));
  const action = manifest.action || {};
  Object.values(action.default_icon || {}).forEach((f) => files.add(f));
  if (manifest.background && manifest.background.service_worker) files.add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) {
    [...(cs.js || []), ...(cs.css || [])].forEach((f) => files.add(f));
  }
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    files.add(`_locales/${locale}/messages.json`);
  }
  if (action.default_popup) {
    files.add(action.default_popup);
    const html = fs.readFileSync(path.join(root, action.default_popup), 'utf8');
    const dir = path.posix.dirname(action.default_popup);
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^[a-z]+:/i.test(ref) || ref.startsWith('#')) continue;
      files.add(path.posix.normalize(path.posix.join(dir, ref)));
    }
  }
  return [...files];
}

const zipped = new Set(execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean));
const referenced = referencedFiles();
const missing = referenced.filter((f) => !zipped.has(f));
if (missing.length > 0) {
  console.error(`❌ ${path.basename(zipPath)} is missing files the extension loads:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ ${zipPath}: ${zipped.size} entries, all ${referenced.length} referenced files present`);
