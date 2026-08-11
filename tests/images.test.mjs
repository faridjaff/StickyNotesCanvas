import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  imageFileName, mimeForImageName, saveImage, saveImageFromFile,
  sweepOrphanImages, IMAGE_FILE_RE, MAX_IMAGE_BYTES,
} from '../storage.js';

// Same vm-sandbox loading pattern as markdown.test.mjs: the vendored
// markdown-it UMD build must be evaluated first, exactly like the <script>
// tag in index.html does in the browser.
const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
const { mdToHtml, openWebLink, imageMimeForFile } = sandbox.window;

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

/* -------- imageMimeForFile: the renderer's gate on a dropped/picked FILE --------
 * Pure helper (utils.jsx) behind both file routes into a note: drag-and-drop
 * and the "Insert image…" picker. Answers "is this a picture this app can
 * store?" with the canonical mime type to store it as, or null.
 */

test('a supported reported mime type is taken as-is', () => {
  assert.equal(imageMimeForFile('shot.png',  'image/png'),  'image/png');
  assert.equal(imageMimeForFile('shot.jpg',  'image/jpeg'), 'image/jpeg');
  assert.equal(imageMimeForFile('anim.gif',  'image/gif'),  'image/gif');
  assert.equal(imageMimeForFile('pic.webp',  'image/webp'), 'image/webp');
});

test('the mime type is matched case-insensitively and without its parameters', () => {
  assert.equal(imageMimeForFile('shot.png', 'IMAGE/PNG'), 'image/png');
  assert.equal(imageMimeForFile('shot.png', ' image/png; charset=binary '), 'image/png');
});

test('a supported mime is enough on its own — no extension needed', () => {
  // A Wayland/portal drop can hand over a name with no extension at all.
  assert.equal(imageMimeForFile('screenshot', 'image/png'), 'image/png');
  assert.equal(imageMimeForFile('', 'image/webp'), 'image/webp');
});

test('the extension decides when the reported type is missing or unsupported', () => {
  assert.equal(imageMimeForFile('shot.png', ''), 'image/png');
  assert.equal(imageMimeForFile('shot.png', undefined), 'image/png');
  assert.equal(imageMimeForFile('/run/user/1000/doc/ab12/photo.jpeg', ''), 'image/jpeg');
  assert.equal(imageMimeForFile('photo.jpg', 'application/octet-stream'), 'image/jpeg');
  assert.equal(imageMimeForFile('SHOT.PNG', ''), 'image/png');
  assert.equal(imageMimeForFile('a.b.c.webp', ''), 'image/webp');
});

test('.jpeg and .jpg both mean image/jpeg', () => {
  assert.equal(imageMimeForFile('a.jpeg', ''), 'image/jpeg');
  assert.equal(imageMimeForFile('a.jpg', ''), 'image/jpeg');
});

test('anything that is not a supported picture is null', () => {
  assert.equal(imageMimeForFile('drawing.svg', 'image/svg+xml'), null);
  assert.equal(imageMimeForFile('scan.tiff', 'image/tiff'), null);
  assert.equal(imageMimeForFile('paper.pdf', 'application/pdf'), null);
  assert.equal(imageMimeForFile('notes.txt', 'text/plain'), null);
  assert.equal(imageMimeForFile('shot.png.exe', ''), null);
  assert.equal(imageMimeForFile('Pictures', ''), null,   'a dropped folder has no extension');
  assert.equal(imageMimeForFile('archive.tar.gz', ''), null);
  assert.equal(imageMimeForFile('', ''), null);
  assert.equal(imageMimeForFile(null, null), null);
  assert.equal(imageMimeForFile(undefined, undefined), null);
});

test('imageMimeForFile agrees with storage.js on every supported type', () => {
  // The renderer helper mirrors storage.js's tables by hand (utils.jsx can't
  // require a node module) — this is the guard against the two drifting.
  const b = Buffer.from('x');
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    const ext = imageFileName(b, mime).split('.')[1];
    assert.equal(imageMimeForFile(`pic.${ext}`, ''), mime, `.${ext} should mean ${mime}`);
    assert.equal(mimeForImageName(`pic.${ext}`), mime, `storage disagrees about .${ext}`);
  }
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

/* -------- storage: reading a picture off disk (drop / "Insert image…") --------
 * saveImageFromFile is everything the images:save-file and images:pick IPC
 * handlers do once a path is in hand — the part of the picker flow that can
 * be tested without a human clicking through a portal dialog.
 */

test('saveImageFromFile stores a file by path exactly like the pasted bytes would', () => {
  const d = tmpDir();
  try {
    const src = path.join(d, 'holiday.PNG');
    fs.writeFileSync(src, 'picture-bytes');
    const name = saveImageFromFile(path.join(d, 'images'), src);
    assert.equal(name, imageFileName(Buffer.from('picture-bytes'), 'image/png'),
      'the stored name is the content hash, whatever the source file was called');
    assert.ok(IMAGE_FILE_RE.test(name));
    assert.equal(fs.readFileSync(path.join(d, 'images', name), 'utf8'), 'picture-bytes');
    // Same picture again (dropped twice, or dropped then picked): one file.
    assert.equal(saveImageFromFile(path.join(d, 'images'), src), name);
    assert.equal(fs.readdirSync(path.join(d, 'images')).length, 1);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('saveImageFromFile maps the extension to the stored type, .jpeg included', () => {
  const d = tmpDir();
  try {
    for (const [file, ext] of [['a.jpeg', 'jpg'], ['b.jpg', 'jpg'], ['c.gif', 'gif'], ['d.webp', 'webp']]) {
      fs.writeFileSync(path.join(d, file), file);
      assert.match(saveImageFromFile(path.join(d, 'images'), path.join(d, file)),
        new RegExp(`\\.${ext}$`));
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('saveImageFromFile refuses everything that is not a supported picture', () => {
  const d = tmpDir();
  const images = path.join(d, 'images');
  try {
    fs.writeFileSync(path.join(d, 'drawing.svg'), '<svg/>');
    fs.writeFileSync(path.join(d, 'noext'), 'x');
    fs.writeFileSync(path.join(d, 'empty.png'), '');
    fs.mkdirSync(path.join(d, 'folder.png'));
    assert.throws(() => saveImageFromFile(images, path.join(d, 'drawing.svg')), /unsupported image type/);
    assert.throws(() => saveImageFromFile(images, path.join(d, 'noext')),       /unsupported image type/);
    assert.throws(() => saveImageFromFile(images, path.join(d, 'empty.png')),   /empty/);
    assert.throws(() => saveImageFromFile(images, path.join(d, 'folder.png')),  /not a file/);
    assert.throws(() => saveImageFromFile(images, path.join(d, 'gone.png')),    /ENOENT/);
    assert.throws(() => saveImageFromFile(images, ''),                          /unsupported image type/);
    assert.ok(!fs.existsSync(images), 'a rejected file must not even create the images dir');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('saveImageFromFile refuses an absurdly large picture instead of reading it', () => {
  const d = tmpDir();
  try {
    const big = path.join(d, 'huge.png');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, MAX_IMAGE_BYTES + 1);   // sparse: no real disk used
    assert.throws(() => saveImageFromFile(path.join(d, 'images'), big), /too large/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
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
