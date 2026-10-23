// glass-load.json says how a page links the kit's files. It names every file the kit ships, each one is in the package with its .min,
// and a "late" stylesheet (the first paint does not wait for it) sets custom properties only: whatever it sets then only paints what the
// blocking stylesheets laid out, so nothing moves when it comes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const { files } = JSON.parse(read('glass-load.json'));
const pkg = JSON.parse(read('package.json'));
const min = f => f.replace(/\.(css|js)$/, '.min.$1');

test('the manifest names every file of the kit, each one shipped with its .min', () => {
  const kit = fs.readdirSync(root).filter(f => /^glass-.*\.(css|js)$/.test(f) && !f.includes('.min.')).sort();
  assert.deepEqual(files.map(x => x.file).sort(), kit);
  for (const { file, load } of files) {
    assert.match(load, file.endsWith('.css') ? /^(block|late)$/ : /^defer$/, file);
    assert.ok(pkg.files.includes(file) && pkg.files.includes(min(file)), `${file} and its .min in package.json files`);
    assert.ok(fs.existsSync(path.join(root, min(file))), min(file));
  }
  assert.ok(pkg.files.includes('glass-load.json'));
});

test('a late stylesheet sets custom properties only', () => {
  for (const { file } of files.filter(x => x.load === 'late')) {
    for (const f of [file, min(file)]) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const props = [...css.matchAll(/\{([^{}]*)\}/g)].flatMap(m => m[1].split(/;(?![^(]*\))/)).map(d => d.trim()).filter(Boolean).map(d => d.slice(0, d.indexOf(':')).trim());
      assert.ok(props.length, f);
      assert.deepEqual(props.filter(p => !p.startsWith('--')), [], f);
    }
  }
});
