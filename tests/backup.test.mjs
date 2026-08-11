// Carrying pictures with the notes (issue #38): a note body only references
// its images (sticky-image://<hash>.<ext>) while the bytes live in
// userData/images/, so a backup file and a copied note both used to arrive
// with empty pictures. Both now bundle the referenced images as base64.
//
// The two things these tests exist to hold down:
//   1. compatibility BOTH ways — an old backup/payload still restores and
//      pastes, and a new one is still readable by the frozen OLD build
//      (tests/fixtures/utils-pre-markdown-it.jsx, a real pre-2.0 utils.jsx);
//   2. the bundle is untrusted input — every name must match IMAGE_FILE_RE
//      and every blob must hash to the name it claims before it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  imageFileName, saveImage, referencedImageNames, imageBytesMatchName,
  readImages, collectImages, writeImages, CLIPBOARD_IMAGE_BUDGET,
} from '../storage.js';

// Same vm-sandbox loading pattern as paste.test.mjs: utils.jsx is a browser
// global script, and it loads fine without the markdown-it vendor build
// (the renderer creates that instance lazily).
const dir = path.dirname(fileURLToPath(import.meta.url));
function loadUtils(file) {
  const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window;
}
const now = loadUtils(path.join(dir, '..', 'utils.jsx'));
const old = loadUtils(path.join(dir, 'fixtures', 'utils-pre-markdown-it.jsx'));

/* ---------- fixtures ---------- */

const BYTES_A = Buffer.from('picture-alpha');
const BYTES_B = Buffer.from('picture-bravo');
const BYTES_C = Buffer.from('picture-charlie');
const A = imageFileName(BYTES_A, 'image/png');
const B = imageFileName(BYTES_B, 'image/jpeg');
const C = imageFileName(BYTES_C, 'image/gif');
const b64 = (buf) => buf.toString('base64');
// Values that come back out of a vm sandbox carry that realm's prototypes,
// which deepStrictEqual refuses to match — normalise before comparing.
const plain = (v) => JSON.parse(JSON.stringify(v));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-backup-'));
}

// A store shaped exactly like notes.json / a backup file.
function storeWith(...bodies) {
  return {
    tweaks: { theme: 'paper' },
    folders: { root: { id: 'root', name: 'All notes', parent: null, hue: '#888' } },
    notes: bodies.map((body, i) => ({
      id: `n${i}`, folder: 'root', title: `Note ${i}`, body,
      color: 'yellow', x: 10, y: 10, w: 260, h: 180, z: i + 1, pinned: false,
    })),
    links: [],
    cwd: 'root',
    view: { x: 0, y: 0, z: 1 },
    drawer: true,
    folderOrder: [],
  };
}

/* ==================== reference scanning ==================== */

test('referencedImageNames finds every reference in a store, once each', () => {
  const store = storeWith(
    `shot: ![](sticky-image://${A})`,
    `two of them: ![](sticky-image://${A}) and ![](sticky-image://${B})`,
  );
  assert.deepEqual([...referencedImageNames(store)].sort(), [A, B].sort());
});

test('referencedImageNames ignores everything that is not the exact reference shape', () => {
  const bad = [
    'sticky-image://../../etc/passwd.png',
    'sticky-image://0123456789ABCDEF.png',   // uppercase: the app only writes lowercase
    'sticky-image://0123456789abcdef.svg',
    'sticky-image://evil.png',
    'sticky-image://0123456789abcde.png',    // 15 hex chars
  ];
  assert.deepEqual([...referencedImageNames(storeWith(bad.map(r => `![](${r})`).join('\n')))], []);
});

test('referencedImageNames takes a raw string too (what the orphan sweep passes)', () => {
  assert.deepEqual([...referencedImageNames(`x sticky-image://${A} y`)], [A]);
  assert.deepEqual([...referencedImageNames(null)], []);
  assert.deepEqual([...referencedImageNames('')], []);
});

/* ==================== backup: collecting ==================== */

test('a backup collects exactly the images its notes reference, never the whole dir', () => {
  const d = tmpDir();
  try {
    saveImage(d, BYTES_A, 'image/png');
    saveImage(d, BYTES_B, 'image/jpeg');
    saveImage(d, BYTES_C, 'image/gif');           // stored but unreferenced
    fs.writeFileSync(path.join(d, 'notes.txt'), 'not an image');
    const store = storeWith(`![](sticky-image://${A})`, `![](sticky-image://${B})`);
    const images = collectImages(d, store);
    assert.deepEqual(Object.keys(images).sort(), [A, B].sort());
    assert.equal(images[A], b64(BYTES_A));
    assert.equal(images[B], b64(BYTES_B));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a reference whose file is gone is simply left out', () => {
  const d = tmpDir();
  try {
    saveImage(d, BYTES_A, 'image/png');
    const images = collectImages(d, storeWith(`![](sticky-image://${A}) ![](sticky-image://${B})`));
    assert.deepEqual(Object.keys(images), [A]);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a store with no pictures collects nothing (the backup stays exactly as it was)', () => {
  const d = tmpDir();
  try {
    saveImage(d, BYTES_A, 'image/png');
    assert.deepEqual(collectImages(d, storeWith('just words')), {});
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('readImages refuses names that are not storable image names', () => {
  const d = tmpDir();
  try {
    fs.writeFileSync(path.join(d, 'notes.txt'), 'secret');
    assert.deepEqual(readImages(d, ['../notes.txt', '/etc/passwd', 'notes.txt', A, '']), {});
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('readImages gives up entirely when the set is over its budget', () => {
  const d = tmpDir();
  try {
    saveImage(d, BYTES_A, 'image/png');
    saveImage(d, BYTES_B, 'image/jpeg');
    assert.deepEqual(readImages(d, [A, B], 4), {}, 'all-or-nothing, never a half set');
    assert.deepEqual(Object.keys(readImages(d, [A, B], Infinity)).sort(), [A, B].sort());
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/* ==================== backup: restoring ==================== */

test('a backup round-trips: the pictures land byte-identical on a clean machine', () => {
  const src = tmpDir(), dest = tmpDir();
  try {
    saveImage(src, BYTES_A, 'image/png');
    saveImage(src, BYTES_B, 'image/jpeg');
    const store = storeWith(`![](sticky-image://${A})`, `![](sticky-image://${B})`);
    // Exactly what main.js writes to the backup file, through JSON and back.
    const file = JSON.stringify({ ...store, images: collectImages(src, store) }, null, 2);
    const parsed = JSON.parse(file);

    const { images, ...data } = parsed;
    assert.deepEqual(data, store, 'the store half of the file is untouched by bundling');
    const res = writeImages(path.join(dest, 'images'), images);
    assert.deepEqual(res.written.sort(), [A, B].sort());
    assert.deepEqual(res.rejected, []);
    assert.deepEqual(fs.readFileSync(path.join(dest, 'images', A)), BYTES_A);
    assert.deepEqual(fs.readFileSync(path.join(dest, 'images', B)), BYTES_B);
  } finally {
    for (const d of [src, dest]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('restoring a backup twice skips the files already there instead of rewriting them', (t) => {
  const d = tmpDir();
  try {
    const bundle = { [A]: b64(BYTES_A) };
    assert.deepEqual(writeImages(d, bundle).written, [A]);
    let writes = 0;
    t.mock.method(fs, 'writeFileSync', () => { writes++; });
    const second = writeImages(d, bundle);
    assert.deepEqual(second.skipped, [A], 'the name IS the hash, so the file there is identical');
    assert.deepEqual(second.written, []);
    assert.equal(writes, 0, 'an existing picture must not be rewritten');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('bytes that do not hash to the name they claim are refused and never written', () => {
  const d = tmpDir();
  try {
    // A hostile backup: a valid-looking name carrying somebody else's bytes.
    const res = writeImages(d, { [A]: b64(Buffer.from('<script>evil()</script>')) });
    assert.deepEqual(res.written, []);
    assert.equal(res.rejected.length, 1);
    assert.equal(res.rejected[0].name, A);
    assert.match(res.rejected[0].reason, /hash/);
    assert.ok(!fs.existsSync(path.join(d, A)), 'nothing may be written under a claimed name');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('hostile or malformed names are refused without touching the filesystem', () => {
  const parent = tmpDir();
  const d = path.join(parent, 'images');
  try {
    const names = [
      '../../etc/passwd.png',
      '/etc/passwd.png',
      'images/../../x.png',
      '0123456789ABCDEF.png',            // uppercase
      '0123456789abcdef.svg',            // disallowed extension
      '0123456789abcdef.png/extra',
      'evil.png',
      '.png',
      '',
    ];
    const bundle = {};
    for (const n of names) bundle[n] = b64(BYTES_A);
    const res = writeImages(d, bundle);
    assert.deepEqual(res.written, []);
    assert.deepEqual(res.skipped, []);
    assert.deepEqual(res.rejected.map(r => r.name).sort(), names.slice().sort());
    for (const r of res.rejected) assert.match(r.reason, /not a valid image name/);
    assert.ok(!fs.existsSync(d), 'a refused bundle must not even create the images dir');
    assert.deepEqual(fs.readdirSync(parent), []);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('unusable image data is refused, one entry at a time', () => {
  const d = tmpDir();
  try {
    const res = writeImages(d, {
      [A]: b64(BYTES_A),          // good
      [B]: '',                    // empty
      [C]: 12345,                 // not a string
    });
    assert.deepEqual(res.written, [A]);
    assert.deepEqual(res.rejected.map(r => r.name).sort(), [B, C].sort());
    assert.equal(fs.readdirSync(d).length, 1, 'the good picture still lands');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a picture that cannot be written is reported, never thrown at the caller', (t) => {
  const d = tmpDir();
  try {
    t.mock.method(fs, 'writeFileSync', () => { throw new Error('ENOSPC: no space left'); });
    const res = writeImages(d, { [A]: b64(BYTES_A) });
    assert.deepEqual(res.written, []);
    assert.equal(res.rejected.length, 1);
    assert.match(res.rejected[0].reason, /ENOSPC/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('writeImages tolerates every non-bundle shape a payload could hold', () => {
  const d = tmpDir();
  try {
    for (const junk of [undefined, null, 'nope', 42, [A], () => {}]) {
      assert.deepEqual(writeImages(d, junk), { written: [], skipped: [], rejected: [] });
    }
    assert.ok(!fs.existsSync(path.join(d, A)));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('imageBytesMatchName is the whole verification: same bytes, same name', () => {
  assert.ok(imageBytesMatchName(A, BYTES_A));
  assert.ok(!imageBytesMatchName(A, BYTES_B), 'other bytes can never claim this name');
  assert.ok(!imageBytesMatchName('../x.png', BYTES_A));
  assert.ok(!imageBytesMatchName(A, Buffer.alloc(0)));
  // The hash covers the bytes; the extension is only the label the app
  // serves them under. Re-labelling the same picture is therefore allowed —
  // it stores the same bytes under a different name, which is harmless: the
  // bytes can't be chosen to land on a name someone else's note references.
  assert.ok(imageBytesMatchName(imageFileName(BYTES_A, 'image/gif'), BYTES_A));
});

test('only images the restored notes reference are ever considered for writing', () => {
  // The rule main.js applies before writeImages: a backup can list extra
  // pictures, but nothing the notes do not reference gets stored.
  const store = storeWith(`![](sticky-image://${A})`);
  const bundle = { [A]: b64(BYTES_A), [C]: b64(BYTES_C) };
  const referenced = referencedImageNames(store);
  const wanted = Object.fromEntries(Object.entries(bundle).filter(([n]) => referenced.has(n)));
  assert.deepEqual(Object.keys(wanted), [A]);
});

/* ==================== backup: compatibility both ways ==================== */

test('an OLD backup (no images key) restores exactly as it does today', () => {
  const d = tmpDir();
  try {
    const store = storeWith(`![](sticky-image://${A})`);
    const parsed = JSON.parse(JSON.stringify(store));       // an old backup file
    assert.equal(parsed.images, undefined);
    // Nothing to restore, no error, no directory created.
    assert.deepEqual(writeImages(path.join(d, 'images'), parsed.images),
      { written: [], skipped: [], rejected: [] });
    assert.ok(!fs.existsSync(path.join(d, 'images')));
    // And it hydrates into the same store the app has always produced.
    assert.deepEqual(plain(now.withDefaults(parsed)), plain(now.withDefaults(store)));
    assert.deepEqual(plain(old.withDefaults(parsed)), plain(now.withDefaults(store)));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test('a NEW backup hydrates in an OLD build exactly like a plain one', () => {
  const store = storeWith(`![](sticky-image://${A})`);
  const bundled = { ...store, images: { [A]: b64(BYTES_A) } };
  // withDefaults keeps only the keys it knows, so the extra images key is
  // dropped on the way in — an old build shows the notes, without the
  // pictures, which is exactly what it does today.
  const hydrated = old.withDefaults(bundled);
  assert.deepEqual(plain(hydrated), plain(old.withDefaults(store)));
  assert.ok(!('images' in hydrated), 'base64 must never reach the store');
  assert.deepEqual(plain(now.withDefaults(bundled)), plain(now.withDefaults(store)));
});

test('the store half of a bundled backup is untouched, and the key comes last', () => {
  const store = storeWith(`![](sticky-image://${A})`);
  const bundled = { ...store, images: { [A]: b64(BYTES_A) } };
  const text = JSON.stringify(bundled, null, 2);
  const asBefore = JSON.stringify(store, null, 2);
  // Everything the old format had is still there, in the same order, and the
  // one new key is appended after it.
  assert.ok(text.startsWith(asBefore.slice(0, asBefore.length - 2)),
    'the existing shape must be preserved, not restructured');
  assert.equal(Object.keys(JSON.parse(text)).at(-1), 'images');
});

/* ==================== clipboard ==================== */

const IMG_NOTE = { id: 'n1', title: 'Shot', body: `see ![](sticky-image://${A})`, color: 'blue', w: 260, h: 180 };
const TEXT_NOTE = { id: 'n2', title: 'Words', body: 'no pictures here', color: 'yellow', w: 260, h: 180 };

function parsePayload(text) {
  return JSON.parse(text.slice(text.indexOf(now.STICKY_CLIPBOARD_MARKER) + now.STICKY_CLIPBOARD_MARKER.length));
}

test('the renderer and the main process agree on the clipboard budget', () => {
  assert.equal(now.CLIPBOARD_IMAGE_BYTES, CLIPBOARD_IMAGE_BUDGET);
});

test('imageRefsInNotes finds what a copy needs to fetch, and nothing else', () => {
  assert.deepEqual([...now.imageRefsInNotes([IMG_NOTE, TEXT_NOTE])], [A]);
  assert.deepEqual([...now.imageRefsInNotes([{ body: '![](sticky-image://../../etc/passwd.png)' }])], []);
  assert.deepEqual([...now.imageRefsInNotes([])], []);
  assert.deepEqual([...now.imageRefsInNotes(null)], []);
});

test('a copied note carries its pictures, and pasting gets them back', () => {
  const text = now.notesToClipboardText([IMG_NOTE], [], { [A]: b64(BYTES_A) });
  assert.deepEqual(parsePayload(text).images, { [A]: b64(BYTES_A) });
  const back = now.clipboardTextToNotes(text);
  assert.equal(back.notes.length, 1);
  assert.deepEqual({ ...back.images }, { [A]: b64(BYTES_A) });
  assert.equal(now.canvasPasteAction(text), 'payload');
});

test('only the pictures the copied notes reference are embedded', () => {
  const text = now.notesToClipboardText([IMG_NOTE], [], { [A]: b64(BYTES_A), [C]: b64(BYTES_C) });
  assert.deepEqual(Object.keys(parsePayload(text).images), [A]);
});

test('a copy with no pictures is byte-for-byte the payload the app always wrote', () => {
  const withArg = now.notesToClipboardText([TEXT_NOTE], [], { [A]: b64(BYTES_A) });
  assert.equal(withArg, now.notesToClipboardText([TEXT_NOTE], []));
  assert.equal(withArg, old.notesToClipboardText([TEXT_NOTE], []));
  assert.equal(parsePayload(withArg).images, undefined);
  // Same when the picture's bytes simply weren't available.
  assert.equal(now.notesToClipboardText([IMG_NOTE], [], null), now.notesToClipboardText([IMG_NOTE], []));
  assert.equal(now.notesToClipboardText([IMG_NOTE], [], {}), old.notesToClipboardText([IMG_NOTE], []));
});

test('the cap: a set that exactly fits travels, one byte more and none do', () => {
  const atCap = 'A'.repeat(CLIPBOARD_IMAGE_BUDGET);
  const overCap = atCap + 'A';
  assert.deepEqual({ ...now.clipboardImagesFor([IMG_NOTE], { [A]: atCap }) }, { [A]: atCap });
  assert.equal(now.clipboardImagesFor([IMG_NOTE], { [A]: overCap }), null);
  // The cap is on the TOTAL, and it is all-or-nothing: an over-budget set
  // drops every picture rather than carrying some of them.
  const two = { id: 'n3', title: 'Two', body: `![](sticky-image://${A}) ![](sticky-image://${B})` };
  const half = 'A'.repeat(CLIPBOARD_IMAGE_BUDGET / 2 + 1);
  assert.equal(now.clipboardImagesFor([two], { [A]: half, [B]: half }), null);
});

test('over the cap, the notes still copy exactly as they did before', () => {
  const overCap = 'A'.repeat(CLIPBOARD_IMAGE_BUDGET + 1);
  const text = now.notesToClipboardText([IMG_NOTE], [], { [A]: overCap });
  assert.equal(text, now.notesToClipboardText([IMG_NOTE], []), 'references intact, pictures missing');
  assert.equal(parsePayload(text).images, undefined);
});

test('the human-readable half is identical whether or not pictures ride along', () => {
  const human = (t) => t.slice(0, t.indexOf(now.STICKY_CLIPBOARD_MARKER));
  const bare = now.notesToClipboardText([IMG_NOTE, TEXT_NOTE], []);
  const bundled = now.notesToClipboardText([IMG_NOTE, TEXT_NOTE], [], { [A]: b64(BYTES_A) });
  assert.equal(human(bundled), human(bare));
  assert.ok(!human(bundled).includes(b64(BYTES_A)), 'no base64 in the part people paste into email');
});

test('clipboardImagesFor ignores every junk shape a payload could carry', () => {
  for (const junk of [undefined, null, 'nope', 42, () => {}]) {
    assert.equal(now.clipboardImagesFor([IMG_NOTE], junk), null);
  }
  assert.equal(now.clipboardImagesFor([IMG_NOTE], { [A]: 42 }), null);
  assert.equal(now.clipboardImagesFor([IMG_NOTE], { '../x.png': 'AAAA' }), null);
});

/* ---------- clipboard compatibility both ways ---------- */

test('an OLD clipboard payload still pastes, images simply absent', () => {
  const oldText = old.notesToClipboardText([IMG_NOTE, TEXT_NOTE], []);
  const back = now.clipboardTextToNotes(oldText);
  assert.equal(back.notes.length, 2);
  assert.deepEqual({ ...back.images }, {}, 'always an object, never undefined');
  assert.equal(now.canvasPasteAction(oldText), 'payload');
});

test('the legacy bare-array payload still pastes too', () => {
  const legacy = 'Shot\n\n' + now.STICKY_CLIPBOARD_MARKER + '\n' + JSON.stringify([IMG_NOTE]);
  const back = now.clipboardTextToNotes(legacy);
  assert.equal(back.notes.length, 1);
  assert.deepEqual({ ...back.links }, {});
  assert.deepEqual({ ...back.images }, {});
});

test('a NEW clipboard payload still pastes in an OLD build', () => {
  const links = [{ id: 'l1', from: 'n1', to: 'n2' }];
  const text = now.notesToClipboardText([IMG_NOTE, TEXT_NOTE], links, { [A]: b64(BYTES_A) });
  const back = old.clipboardTextToNotes(text);
  assert.equal(back.notes.length, 2);
  assert.deepEqual(back.links, [{ from: 'n1', to: 'n2' }]);
  assert.equal(back.notes[0].body, IMG_NOTE.body, 'the reference is untouched');
  assert.ok(!('images' in back), 'an old build simply ignores the new key');
});

test('a pasted payload is verified before anything is written, like a backup', () => {
  const d = tmpDir();
  try {
    const good = now.clipboardTextToNotes(now.notesToClipboardText([IMG_NOTE], [], { [A]: b64(BYTES_A) }));
    assert.deepEqual(writeImages(d, good.images).written, [A]);
    assert.deepEqual(fs.readFileSync(path.join(d, A)), BYTES_A);

    // Somebody edited the payload on its way through the clipboard.
    const tampered = now.notesToClipboardText([IMG_NOTE], [], { [A]: b64(Buffer.from('not the picture')) });
    const parsed = now.clipboardTextToNotes(tampered);
    const res = writeImages(path.join(d, 'fresh'), parsed.images);
    assert.deepEqual(res.written, []);
    assert.match(res.rejected[0].reason, /hash/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
