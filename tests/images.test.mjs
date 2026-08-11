import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { imageFileName, saveImage, sweepOrphanImages, IMAGE_FILE_RE } from '../storage.js';

// Same vm-sandbox loading pattern as markdown.test.mjs: the vendored
// markdown-it UMD build must be evaluated first, exactly like the <script>
// tag in index.html does in the browser.
const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
const { mdToHtml, openWebLink } = sandbox.window;

const REF = 'sticky-image://0123456789abcdef.png';

/* -------- mdToHtml: the app-private image scheme (issue #25) --------
 * validateLink accepts sticky-image://<16-hex>.<png|jpg|gif|webp> (exact
 * match) on top of markdown-it's http(s)-only rule. Every other
 * sticky-image-looking string fails validation, and markdown-it then drops
 * the whole image construct back to fully literal text.
 */

test('an app image reference renders as an img tag', () => {
  assert.equal(mdToHtml(`![](${REF})`),
    `<p dir="auto"><img src="${REF}" alt=""></p>`);
});

test('alt text is kept and HTML-escaped in the alt attribute', () => {
  assert.equal(mdToHtml(`![my "shot" <1>](${REF})`),
    `<p dir="auto"><img src="${REF}" alt="my &quot;shot&quot; &lt;1&gt;"></p>`);
});

test('http(s) image URLs render too (markdown-it swap, issue #21)', () => {
  assert.equal(mdToHtml('![alt](https://x.y/i.png)'),
    '<p dir="auto"><img src="https://x.y/i.png" alt="alt"></p>');
});

test('a traversal-shaped reference stays literal', () => {
  assert.equal(mdToHtml('![](sticky-image://../../etc/passwd)'),
    '<p dir="auto">![](sticky-image://../../etc/passwd)</p>');
  assert.equal(mdToHtml('![](sticky-image://../../etc/passwd.png)'),
    '<p dir="auto">![](sticky-image://../../etc/passwd.png)</p>');
});

test('a non-hash filename stays literal', () => {
  assert.equal(mdToHtml('![](sticky-image://evil.png)'),
    '<p dir="auto">![](sticky-image://evil.png)</p>');
});

test('an uppercase hash stays literal (the app only writes lowercase)', () => {
  assert.equal(mdToHtml('![](sticky-image://0123456789ABCDEF.png)'),
    '<p dir="auto">![](sticky-image://0123456789ABCDEF.png)</p>');
});

test('a disallowed extension stays literal', () => {
  assert.equal(mdToHtml('![](sticky-image://0123456789abcdef.svg)'),
    '<p dir="auto">![](sticky-image://0123456789abcdef.svg)</p>');
});

test('anything after the hash filename fails the exact match', () => {
  assert.equal(mdToHtml('![](sticky-image://0123456789abcdef.png/extra)'),
    '<p dir="auto">![](sticky-image://0123456789abcdef.png/extra)</p>');
  assert.equal(mdToHtml('![](sticky-image://0123456789abcdef.png?q=1)'),
    '<p dir="auto">![](sticky-image://0123456789abcdef.png?q=1)</p>');
});

test('an http(s) URL smuggled into the sticky-image scheme never becomes an img', () => {
  const out = mdToHtml('![](sticky-image://https://evil.com/x.png)');
  assert.ok(!out.includes('<img'), `no <img> expected, got: ${out}`);
  // The inner URL may still linkify as a plain web link (harmless: anchors
  // only ever open via openWebLink, which re-checks http(s)); the image
  // construct itself must stay literal text.
  assert.ok(out.startsWith('<p dir="auto">![](sticky-image://'), out);
});

test('javascript: image sources stay literal (XSS)', () => {
  assert.equal(mdToHtml('![bad](javascript:alert(1))'),
    '<p dir="auto">![bad](javascript:alert(1))</p>');
});

/* validateLink is shared by links and images, so a sticky-image LINK also
 * parses — deliberately inert: openWebLink (and the main process's
 * shell:open-external) only ever open http(s). */
test('a sticky-image link renders as an anchor that openWebLink ignores', () => {
  assert.equal(mdToHtml(`[click](${REF})`),
    `<p dir="auto"><a href="${REF}" data-weblink="${REF}">click</a></p>`);
  let opened = 0;
  sandbox.window.open = () => { opened++; };
  openWebLink(REF);
  assert.equal(opened, 0, 'openWebLink must ignore non-http(s) URLs');
});

test('an image reference inside a code span stays literal', () => {
  assert.equal(mdToHtml(`\`![](${REF})\``),
    `<p dir="auto"><code>![](${REF})</code></p>`);
});

test('an image renders inside a list item', () => {
  assert.equal(mdToHtml(`- shot: ![](${REF})`),
    `<ul dir="auto"><li dir="auto">shot: <img src="${REF}" alt=""></li></ul>`);
});

test('surrounding emphasis still renders and never eats the reference', () => {
  assert.equal(mdToHtml(`_a ![](${REF}) b_`),
    `<p dir="auto"><em>a <img src="${REF}" alt=""> b</em></p>`);
});

/* -------- storage: content-hash naming -------- */

test('imageFileName is deterministic: 16 hex chars + mime extension', () => {
  const bytes = Buffer.from('fake-png-bytes');
  const name = imageFileName(bytes, 'image/png');
  assert.match(name, /^[0-9a-f]{16}\.png$/);
  assert.equal(imageFileName(bytes, 'image/png'), name);
  assert.ok(IMAGE_FILE_RE.test(name), 'generated names must pass the serve-side filter');
});

test('different bytes hash to different names', () => {
  assert.notEqual(
    imageFileName(Buffer.from('aaa'), 'image/png'),
    imageFileName(Buffer.from('bbb'), 'image/png'));
});

test('each supported mime maps to its extension', () => {
  const b = Buffer.from('x');
  assert.match(imageFileName(b, 'image/png'),  /\.png$/);
  assert.match(imageFileName(b, 'image/jpeg'), /\.jpg$/);
  assert.match(imageFileName(b, 'image/gif'),  /\.gif$/);
  assert.match(imageFileName(b, 'image/webp'), /\.webp$/);
});

test('unsupported mime types are rejected', () => {
  assert.equal(imageFileName(Buffer.from('x'), 'image/svg+xml'), null);
  assert.equal(imageFileName(Buffer.from('x'), 'text/html'), null);
  assert.equal(imageFileName(Buffer.from('x'), undefined), null);
  assert.throws(() => saveImage(os.tmpdir(), Buffer.from('x'), 'image/svg+xml'),
    /unsupported image type/);
});

/* -------- storage: save + orphan sweep -------- */

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-images-'));
}

test('saveImage writes the file once and dedups a repeat paste', () => {
  const d = tmpDir();
  try {
    const name = saveImage(d, Buffer.from('same-picture'), 'image/png');
    assert.equal(fs.readFileSync(path.join(d, name), 'utf8'), 'same-picture');
    assert.equal(saveImage(d, Buffer.from('same-picture'), 'image/png'), name);
    assert.equal(fs.readdirSync(d).length, 1);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('saveImage creates the images dir if missing', () => {
  const d = path.join(tmpDir(), 'nested', 'images');
  try {
    const name = saveImage(d, Buffer.from('pic'), 'image/webp');
    assert.ok(fs.existsSync(path.join(d, name)));
  } finally {
    fs.rmSync(path.dirname(path.dirname(d)), { recursive: true, force: true });
  }
});

test('sweepOrphanImages removes unreferenced images, keeps referenced and foreign files', () => {
  const d = tmpDir();
  const notesFile = path.join(d, 'notes.json');
  try {
    const kept   = saveImage(d, Buffer.from('kept'), 'image/png');
    const orphan = saveImage(d, Buffer.from('orphan'), 'image/jpeg');
    fs.writeFileSync(path.join(d, 'not-an-image.txt'), 'leave me');
    fs.writeFileSync(notesFile, JSON.stringify({
      notes: [{ id: 'n1', body: `look: ![](sticky-image://${kept})` }],
    }));
    const removed = sweepOrphanImages(d, notesFile);
    assert.deepEqual(removed, [orphan]);
    assert.ok(fs.existsSync(path.join(d, kept)), 'referenced image must survive');
    assert.ok(!fs.existsSync(path.join(d, orphan)), 'orphan image must be removed');
    assert.ok(fs.existsSync(path.join(d, 'not-an-image.txt')), 'foreign files are never touched');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('sweepOrphanImages is a no-op without an images dir, and treats a missing notes file as empty', () => {
  assert.deepEqual(sweepOrphanImages(path.join(os.tmpdir(), 'sticky-none-' + Date.now()), '/nope.json'), []);
  const d = tmpDir();
  try {
    const orphan = saveImage(d, Buffer.from('o'), 'image/gif');
    assert.deepEqual(sweepOrphanImages(d, path.join(d, 'missing.json')), [orphan]);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/* ---------------- imagePasteError ---------------- */

const { imagePasteError } = sandbox.window;

test('supported format on desktop pastes silently (no error)', () => {
  assert.equal(imagePasteError('image/png', true), null);
  assert.equal(imagePasteError('image/webp', true), null);
});

test('web demo gets the needs-desktop message for any image', () => {
  assert.match(imagePasteError('image/png', false), /desktop app/);
});

test('unsupported format on desktop names the format and the allowlist', () => {
  const msg = imagePasteError('image/tiff', true);
  assert.match(msg, /image\/tiff/);
  assert.match(msg, /PNG, JPG, GIF, or WebP/);
});

test('no mime means no image involved — no error', () => {
  assert.equal(imagePasteError('', true), null);
});

test('renderer allowlist mirrors storage.js IMAGE_EXT_BY_MIME', async () => {
  const { default: storagePath } = { default: new URL('../storage.js', import.meta.url) };
  const src = await import('node:fs').then(fs => fs.promises.readFile(storagePath, 'utf8'));
  const mimes = [...src.matchAll(/'(image\/[a-z]+)':/g)].map(m => m[1]).sort();
  for (const m of mimes) assert.equal(imagePasteError(m, true), null, m + ' should be accepted');
  assert.equal(mimes.length, 4);
});
