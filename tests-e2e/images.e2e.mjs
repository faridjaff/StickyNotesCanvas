// Pasted-image serving end to end (issue #25): a real PNG seeded into
// <userData>/images/ under its content-hash name, referenced from a note as
// ![](sticky-image://<hash>.png), must come back over the app-private
// sticky-image:// protocol and decode in the rendered .md-body — while a
// traversal-shaped reference must never produce an <img> at all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

const NOTE_IMG = 'e2e-image';
const NOTE_EVIL = 'e2e-image-evil';

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
  ],
  links: [],
  cwd: 'root',
  view: { x: 0, y: 0, z: 1 },
  drawer: false,
  folderOrder: ['e2e'],
};

let app;
before(async () => {
  app = await launch({ seed, files: { [`images/${IMG_NAME}`]: PNG_1X1 } });
});
after(async () => { if (app) await app.close(); });

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
