// Each .min file is its source minified, as the CI makes it (.github/workflows/minify.yml: esbuild 0.24.2 --minify). A site serves
// the .min files: one built from another source (an older copy, an edit never committed) puts another UI on it - sanstv.ru,
// 17.10.2026, the table measure and the form grid of 3cf345f went back out of glass-ui.min.css/js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = fs.readdirSync(root).filter(f => /^glass-.*\.(css|js)$/.test(f) && !f.includes('.min.'));

for (const src of sources) {
  const min = src.replace(/\.(css|js)$/, '.min.$1');
  test(`${min} is ${src} minified`, () => {
    assert.ok(fs.existsSync(path.join(root, min)), `${min} is missing`);
    const built = execFileSync('npx', ['--yes', 'esbuild@0.24.2', path.join(root, src), '--minify', '--log-level=error'], { encoding: 'utf8' });
    assert.ok(built === fs.readFileSync(path.join(root, min), 'utf8'), `${min} is not ${src} minified: npx esbuild@0.24.2 ${src} --minify --outfile=${min}`);
  });
}
