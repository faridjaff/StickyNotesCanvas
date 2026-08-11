// Pasted-image serving end to end (issue #25): a real PNG seeded into
// <userData>/images/ under its content-hash name, referenced from a note as
// ![](sticky-image://<hash>.png), must come back over the app-private
// sticky-image:// protocol and decode in the rendered .md-body — while a
// traversal-shaped reference must never produce an <img> at all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, pollUntil } from './harness.mjs';
import { imageFileName } from '../storage.js';

// A real 1x1 PNG (what the protocol handler will actually serve), stored
// under the same content-hash name storage.js would give it on paste.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const IMG_NAME = imageFileName(PNG_1X1, 'image/png'); // <16-hex>.png
const IMG_REF = `sticky-image://${IMG_NAME}`;
const EVIL_REF = 'sticky-image://../../etc/passwd.png';

// A different real PNG (1x1 red), living on disk OUTSIDE the app's userData
// — the file the drag-and-drop tests drop onto a note.
const PNG_DROP = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64');
const DROP_NAME = imageFileName(PNG_DROP, 'image/png');
const DROP_REF = `sticky-image://${DROP_NAME}`;

// A third real PNG (1x1 blue), never on this machine's disk — it arrives
// only as base64 inside a payload, the way a backup or a copied note
// carries a picture from another machine (issue #38).
const PNG_CARRIED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
  'base64');
const CARRIED_NAME = imageFileName(PNG_CARRIED, 'image/png');

const NOTE_IMG = 'e2e-image';
const NOTE_EVIL = 'e2e-image-evil';
const NOTE_DROP = 'e2e-image-drop';
const NOTE_DROP_EDIT = 'e2e-image-drop-edit';

const seed = {
  tweaks: { theme: 'paper', font: 'Inter', density: 'cozy', showLinks: true, tilt: false, hideNoteTitles: false },
  folders: {
    root: { id: 'root', name: 'All notes', parent: null, hue: '#888' },
    e2e: { id: 'e2e', name: 'E2E', parent: 'root', hue: '#5a82c9' },
  },
  notes: [
    { id: NOTE_IMG, folder: 'e2e', title: 'Image', body: `shot:\n![pasted](${IMG_REF})`,
      color: 'yellow', x: 40, y: 40, w: 340, h: 240, z: 1, pinned: false },
    { id: NOTE_EVIL, folder: 'e2e', title: 'Evil', body: `![](${EVIL_REF})`,
      color: 'pink', x: 520, y: 40, w: 340, h: 200, z: 2, pinned: false },
    { id: NOTE_DROP, folder: 'e2e', title: 'Drop', body: 'before',
      color: 'blue', x: 40, y: 340, w: 340, h: 220, z: 3, pinned: false },
    { id: NOTE_DROP_EDIT, folder: 'e2e', title: 'Drop while editing', body: '',
      color: 'green', x: 520, y: 340, w: 340, h: 220, z: 4, pinned: false },
  ],
  links: [],
  cwd: 'root',
  view: { x: 0, y: 0, z: 1 },
  drawer: false,
  folderOrder: ['e2e'],
};

let app;
let dropDir;      // holds the files the drag-and-drop tests drop
let dropPng;
let dropTxt;
before(async () => {
  dropDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-drop-'));
  dropPng = path.join(dropDir, 'holiday.png');
  dropTxt = path.join(dropDir, 'shopping-list.txt');
  fs.writeFileSync(dropPng, PNG_DROP);
  fs.writeFileSync(dropTxt, 'milk\neggs\n');
  app = await launch({ seed, files: { [`images/${IMG_NAME}`]: PNG_1X1 } });
});
after(async () => {
  if (app) await app.close();
  if (dropDir) fs.rmSync(dropDir, { recursive: true, force: true });
});

// A file-manager drop, the way Chromium itself delivers one: dragEnter,
// dragOver (the app must claim both or no drop event is ever fired), then
// drop, all carrying real paths on disk in DragData.files.
async function dropFiles(files, x, y) {
  const data = { items: [], files, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await app.cmd('Input.dispatchDragEvent', { type, x, y, data });
    await app.sleep(30);
  }
}

test('a seeded sticky-image reference renders an <img> the protocol actually serves', async () => {
  const src = await app.evaljs(`(() => {
    const img = document.querySelector('[data-note-id="${NOTE_IMG}"] .md-body img');
    return img ? img.getAttribute('src') : null;
  })()`);
  assert.equal(src, IMG_REF, 'the note body should render an <img> with the exact seeded reference');
  // naturalWidth only goes above 0 once the bytes came back over
  // protocol.handle AND decoded as a real image — 404s and error pages stay 0.
  await pollUntil(
    () => app.evaljs(`(document.querySelector('[data-note-id="${NOTE_IMG}"] .md-body img') || {}).naturalWidth > 0`),
    { timeout: 10000, interval: 200, label: 'sticky-image:// bytes to load and decode' },
  );
});

/* -------- dropping an image file on a note --------
 * The renderer never sees the bytes here: webUtils.getPathForFile resolves
 * the dropped File to a path and the main process reads it (images:save-file)
 * — the same route that works inside the flatpak sandbox, where the path has
 * been rewritten by the document portal.
 */

test('dropping an image file on a note stores it and appends the reference on its own line', async () => {
  const r = await app.noteBodyRect(NOTE_DROP);
  await dropFiles([dropPng], Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));

  const src = await pollUntil(
    () => app.evaljs(`(() => {
      const img = document.querySelector('[data-note-id="${NOTE_DROP}"] .md-body img');
      return img ? img.getAttribute('src') : null;
    })()`),
    { timeout: 5000, interval: 100, label: 'the dropped image to land in the note' },
  );
  assert.equal(src, DROP_REF, 'the body should reference the dropped file by content hash');

  // Appended after the existing text, on a line of its own (breaks:true
  // renders that newline as the <br> before the <img>).
  const html = await app.evaljs(
    `document.querySelector('[data-note-id="${NOTE_DROP}"] .md-body').innerHTML`);
  assert.match(html, /before<br><img /, `expected "before" then a line break, got: ${html}`);

  // The bytes really were stored, under the content-hash name.
  const stored = path.join(app.userData, 'images', DROP_NAME);
  assert.ok(fs.existsSync(stored), `expected ${stored} to exist`);
  assert.deepEqual(fs.readFileSync(stored), PNG_DROP);
});

test('dropping a non-image file changes nothing', async () => {
  const r = await app.noteBodyRect(NOTE_DROP);
  const before = await app.evaljs(
    `document.querySelector('[data-note-id="${NOTE_DROP}"] .md-body').innerHTML`);
  await dropFiles([dropTxt], Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  await app.sleep(250);
  const after = await app.evaljs(
    `document.querySelector('[data-note-id="${NOTE_DROP}"] .md-body').innerHTML`);
  assert.equal(after, before, 'a .txt drop must be ignored, not inserted or crash the note');
  assert.equal(fs.readdirSync(path.join(app.userData, 'images')).length, 2,
    'only the seeded image and the dropped PNG should be stored');
});

test('dropping onto an open editor inserts at the caret', async () => {
  const r = await app.noteBodyRect(NOTE_DROP_EDIT);
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  await app.dblclick(cx, cy);
  await pollUntil(
    () => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE_DROP_EDIT}"] textarea')`),
    { timeout: 5000, interval: 100, label: 'the editor to open' },
  );
  await dropFiles([dropPng], cx, cy);
  const value = await pollUntil(
    () => app.evaljs(`(() => {
      const ta = document.querySelector('[data-note-id="${NOTE_DROP_EDIT}"] textarea');
      return ta && ta.value ? ta.value : null;
    })()`),
    { timeout: 5000, interval: 100, label: 'the reference to be typed into the editor' },
  );
  assert.equal(value, `![](${DROP_REF})`, 'the raw markdown goes in at the caret');
});

/* -------- carrying pictures between machines (issue #38) --------
 * A backup file and a copied note both bundle the referenced pictures as
 * base64 so they survive the trip. The two dialogs at the ends of the
 * backup flow (Save backup… / Restore backup…) are native and cannot be
 * driven headlessly, so what is exercised here is everything underneath
 * them: the images:read / images:write IPC the renderer actually calls, the
 * hash verification, and the protocol serving a picture that arrived as
 * base64 rather than as a paste. The dialogs themselves are on the manual
 * checklist in this directory's README.
 */

test('readImages hands back the bytes behind a note reference, and nothing else', async () => {
  const res = await app.evaljs(`window.stickyAPI.readImages(${JSON.stringify([
    IMG_NAME, '../../etc/passwd.png', 'evil.png', '0123456789abcdef.png',
  ])})`);
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.images), [IMG_NAME],
    'traversal/invalid names and unstored hashes all come back empty');
  assert.equal(res.images[IMG_NAME], PNG_1X1.toString('base64'));
});

test('a copied note carries its picture, and the human-readable half stays clean', async () => {
  const body = `shot:\n![pasted](${IMG_REF})`;
  const out = await app.evaljs(`(async () => {
    const note = { id: 'n1', title: 'Image', body: ${JSON.stringify(body)}, color: 'yellow', w: 260, h: 180 };
    const names = window.imageRefsInNotes([note]);
    const res = await window.stickyAPI.readImages(names);
    const text = window.notesToClipboardText([note], [], res.images);
    const back = window.clipboardTextToNotes(text);
    return {
      names, carried: back.images[names[0]] || null,
      human: text.slice(0, text.indexOf(window.STICKY_CLIPBOARD_MARKER)),
    };
  })()`);
  assert.deepEqual(out.names, [IMG_NAME]);
  assert.equal(out.carried, PNG_1X1.toString('base64'), 'the payload round-trips the bytes');
  assert.equal(out.human.trim(), `Image\n\n${body}`, 'the part people paste into an email is untouched');
});

test('a carried picture is written under its hash name and served by the protocol', async () => {
  const res = await app.evaljs(`window.stickyAPI.writeImages({ ${JSON.stringify(CARRIED_NAME)}: ${JSON.stringify(PNG_CARRIED.toString('base64'))} })`);
  assert.equal(res.ok, true);
  assert.deepEqual(res.written, [CARRIED_NAME]);
  assert.deepEqual(res.rejected, []);
  const stored = path.join(app.userData, 'images', CARRIED_NAME);
  assert.deepEqual(fs.readFileSync(stored), PNG_CARRIED, 'byte-identical to what the payload carried');

  // And it is a real picture as far as the app is concerned: fetched back
  // over sticky-image:// and decoded (naturalWidth stays 0 on a 404).
  const width = await app.evaljs(`new Promise(r => {
    const im = new Image();
    im.onload = () => r(im.naturalWidth);
    im.onerror = () => r(0);
    im.src = 'sticky-image://${CARRIED_NAME}';
  })`);
  assert.equal(width, 1, 'the freshly written picture must load through the protocol');

  // Writing the same payload again is a no-op: the name IS the content hash.
  const again = await app.evaljs(`window.stickyAPI.writeImages({ ${JSON.stringify(CARRIED_NAME)}: ${JSON.stringify(PNG_CARRIED.toString('base64'))} })`);
  assert.deepEqual(again.skipped, [CARRIED_NAME]);
  assert.deepEqual(again.written, []);
});

test('a payload cannot plant content under a name it chooses', async () => {
  const before = fs.readdirSync(path.join(app.userData, 'images')).sort();
  const res = await app.evaljs(`window.stickyAPI.writeImages({
    '0000000000000000.png': ${JSON.stringify(PNG_CARRIED.toString('base64'))},
    '../../evil.png': 'AAAA',
    'evil.png': 'AAAA'
  })`);
  assert.equal(res.ok, true);
  assert.deepEqual(res.written, [], 'nothing may be written');
  assert.deepEqual(res.rejected.map(r => r.name).sort(),
    ['../../evil.png', '0000000000000000.png', 'evil.png']);
  assert.match(res.rejected.find(r => r.name === '0000000000000000.png').reason, /hash/);
  assert.deepEqual(fs.readdirSync(path.join(app.userData, 'images')).sort(), before,
    'the images dir is untouched by a refused payload');
  assert.ok(!fs.existsSync(path.join(app.userData, 'evil.png')));
});

test('a traversal-shaped reference renders no <img> anywhere in its note', async () => {
  const evil = await app.evaljs(`(() => {
    const body = document.querySelector('[data-note-id="${NOTE_EVIL}"] .md-body');
    return body ? { imgs: body.querySelectorAll('img').length, text: body.textContent } : null;
  })()`);
  assert.ok(evil, 'the evil note should have rendered');
  assert.equal(evil.imgs, 0, 'a traversal ref must never become an <img>');
  assert.match(evil.text, /!\[\]\(sticky-image:\/\/\.\.\/\.\.\/etc\/passwd\.png\)/,
    'the reference stays verbatim literal text');
});

// Ctrl+C then Ctrl+V through the real app, with the picture deleted off disk
// in between — the "pasted on another machine" case, minus the machine.
// Uses the SYSTEM clipboard (there is no other way to test this path), so it
// replaces whatever was on it; it also deletes the seeded picture, which is
// why it runs last in this file.
test('copying a note and pasting it back restores its picture from the payload', async () => {
  const stored = path.join(app.userData, 'images', IMG_NAME);
  const ctrl = async (letter) => {
    const k = {
      modifiers: 2, key: letter, code: `Key${letter.toUpperCase()}`,
      windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
    };
    await app.cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
    await app.cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
  };

  // Select the note that holds the picture, then copy it.
  const r = await app.noteBodyRect(NOTE_IMG);
  await app.click(Math.round(r.left + r.width / 2), Math.round(r.top + 8));
  await ctrl('c');
  const carried = await pollUntil(async () => {
    const text = await app.evaljs('navigator.clipboard.readText()');
    return text && text.includes(PNG_1X1.toString('base64')) ? text : null;
  }, { timeout: 5000, interval: 100, label: 'the copied payload to carry the picture' });
  assert.ok(carried.includes(IMG_REF), 'the note reference travels with it');

  // Now the picture is gone from this machine: only the payload has it.
  fs.rmSync(stored);
  const before = await app.evaljs('document.querySelectorAll("[data-note-id]").length');

  await app.click(1200, 780);          // empty desk, so the paste is a canvas paste
  await ctrl('v');
  await pollUntil(
    () => app.evaljs(`document.querySelectorAll("[data-note-id]").length === ${before + 1}`),
    { timeout: 5000, interval: 100, label: 'the pasted note to appear' },
  );

  assert.ok(fs.existsSync(stored), 'the paste must put the picture back on disk');
  assert.deepEqual(fs.readFileSync(stored), PNG_1X1, 'byte-identical to the original');
  const imgs = await app.evaljs(
    `document.querySelectorAll('[data-note-id] .md-body img[src="${IMG_REF}"]').length`);
  assert.equal(imgs, 2, 'the pasted copy renders the same picture as the original');
});
