// Real-DOM markdown rendering: assertions run against the .md-body the app
// actually rendered for the seeded rich note (see RICH_BODY in harness.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, NOTE, pollUntil } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

const inRich = (selector) =>
  app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.rich}"] .md-body ${selector}')`);

test('### and #### render as h5/h6 (note-sized heading shift)', async () => {
  assert.equal(await inRich('h5'), true, '### should render as <h5>');
  assert.equal(await inRich('h6'), true, '#### should render as <h6>');
  const h5 = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body h5').textContent`);
  const h6 = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body h6').textContent`);
  assert.equal(h5, 'Alpha');
  assert.equal(h6, 'Beta');
});

test('ordered list renders as ol > li, with a nested ol for the indented item', async () => {
  assert.equal(await inRich('ol > li'), true, 'ordered list should render <ol><li>');
  assert.equal(await inRich('ol ol'), true, '"1. one\\n   1. sub" should nest an <ol> inside the <ol>');
  const sub = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body ol ol li').textContent`);
  assert.equal(sub, 'sub');
});

test('blockquote renders as a real <blockquote>', async () => {
  assert.equal(await inRich('blockquote'), true);
  const q = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body blockquote').textContent`);
  assert.match(q, /quoted/);
});

test('pipe table renders as a real <table>', async () => {
  assert.equal(await inRich('table'), true);
  assert.equal(await inRich('table th'), true, 'header row should render <th>');
  assert.equal(await inRich('table td'), true, 'body row should render <td>');
});

test('js fence renders as pre > code', async () => {
  assert.equal(await inRich('pre > code.language-js'), true, '```js fence should render <pre><code class="language-js">');
  const code = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body pre > code.language-js').textContent`);
  assert.match(code, /console\.log\('hi'\)/);
});

test('javascript: link stays inert text — no <a> with a javascript href anywhere', async () => {
  const evilAnchor = await app.evaljs(`[...document.querySelectorAll('a')].some(a => (a.getAttribute('href') || '').toLowerCase().startsWith('javascript'))`);
  assert.equal(evilAnchor, false, 'no anchor in the whole page may carry a javascript: href');
  const text = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body').textContent`);
  assert.match(text, /\[evil\]\(javascript:alert\(1\)\)/, 'the markdown link renders verbatim as text');
});

test('bare www.example.com is linkified into an <a>', async () => {
  const link = await app.evaljs(`(() => {
    const a = [...document.querySelectorAll('[data-note-id="${NOTE.rich}"] .md-body a')]
      .find(a => a.textContent === 'www.example.com');
    return a ? { href: a.getAttribute('href'), weblink: a.getAttribute('data-weblink') } : null;
  })()`);
  assert.ok(link, 'www.example.com should render as an anchor');
  assert.match(link.href, /^https?:\/\/www\.example\.com/);
  assert.ok(link.weblink, 'anchor should carry data-weblink so clicks route to the external-open delegate');
});

/* -------- importing a markdown file as a note (issue #44) --------
 * The desk context menu's "Import markdown file…" opens a native file
 * dialog, which no headless test can drive — so these exercise everything
 * AFTER it: the canvas's onImportMarkdown, handed the exact payload the
 * main process returns for the chosen files ({ name, content } each). The
 * dialog half, and reading the files behind it, is covered by
 * tests/storage.test.mjs (readMarkdownFile) plus a manual pass in the
 * flatpak — see "Verifying inside the flatpak" below in the README.
 */

// Deliberately hostile-ish contents: a BOM, CRLF endings and a trailing
// blank line, which the importer must normalise away.
const IMPORT_FILES = [
  { name: 'Sprint 42 — plan.md', content: '\uFEFF## Goals\r\n\r\n- ship the importer\r\n' },
  { name: 'second.markdown', content: 'plain body\n' },
];
const IMPORTED_TITLES = ['Sprint 42 — plan', 'second'];
const IMPORTED_BODIES = ['## Goals\n\n- ship the importer', 'plain body'];

const notesOnDisk = () =>
  JSON.parse(fs.readFileSync(path.join(app.userData, 'notes.json'), 'utf8')).notes;

// Reach the prop the "Import markdown file…" menu item calls. Called with
// no arguments it opens the picker; with files it skips only the dialog.
const importFiles = (files) => app.evaljs(`(() => {
  const desk = document.getElementById('desk');
  const key = Object.keys(desk).find(k => k.startsWith('__reactFiber$'));
  let fiber = desk[key];
  while (fiber && typeof (fiber.memoizedProps || {}).onImportMarkdown !== 'function') fiber = fiber.return;
  if (!fiber) throw new Error('the canvas has no onImportMarkdown prop');
  fiber.memoizedProps.onImportMarkdown(${JSON.stringify(files)});
  return true;
})()`);

let importedIds = [];
let noteCountBeforeImport = 0;

test('the desk context menu offers the markdown import next to "New note here"', async () => {
  // Right-click empty canvas, well clear of every seeded note.
  for (const type of ['mousePressed', 'mouseReleased']) {
    await app.cmd('Input.dispatchMouseEvent', { type, x: 1250, y: 750, button: 'right', buttons: 2, clickCount: 1 });
  }
  const labels = await pollUntil(
    () => app.evaljs(`(() => {
      const items = [...document.querySelectorAll('button')].map(b => b.textContent);
      return items.includes('New note here') ? JSON.stringify(items.filter(t => /New note here|Import markdown|Reset view/.test(t))) : null;
    })()`),
    { timeout: 5000, interval: 100, label: 'the desk context menu' },
  );
  assert.deepEqual(JSON.parse(labels), ['New note here', 'Import markdown file…', 'Reset view'],
    'the import sits with note creation, not in a single note\'s menu');
  // Close it WITHOUT clicking the item — that would open a real dialog.
  await app.click(1250, 750);
  await pollUntil(
    () => app.evaljs(`![...document.querySelectorAll('button')].some(b => b.textContent === 'Import markdown file…')`),
    { timeout: 5000, interval: 100, label: 'the desk context menu to close' },
  );
});

test('importing markdown files makes one note per file, titled from the filename', async () => {
  const before = notesOnDisk();
  noteCountBeforeImport = before.length;
  const beforeIds = new Set(before.map(n => n.id));

  await importFiles(IMPORT_FILES);

  const fresh = await pollUntil(async () => {
    const ns = notesOnDisk().filter(n => !beforeIds.has(n.id));
    return ns.length === IMPORT_FILES.length ? ns : null;
  }, { timeout: 5000, interval: 100, label: 'the imported notes to be stored' });
  importedIds = fresh.map(n => n.id);

  assert.deepEqual(fresh.map(n => n.title), IMPORTED_TITLES, 'the filename becomes the title');
  assert.deepEqual(fresh.map(n => n.body), IMPORTED_BODIES,
    'the contents become the body: BOM dropped, CRLF normalised, trailing blank line trimmed');
  // Placement, colour and size follow the canvas paste.
  assert.deepEqual(fresh.map(n => [n.w, n.h]), [[260, 180], [260, 180]]);
  assert.ok(fresh.every(n => n.color !== 'white'), 'imported notes never get the white paper colour');
  assert.equal(Math.round(fresh[1].x - fresh[0].x), 24, 'several files cascade instead of stacking');
  assert.equal(Math.round(fresh[1].y - fresh[0].y), 24);
});

test('an imported note renders its markdown like any other note', async () => {
  const rendered = await pollUntil(
    () => app.evaljs(`(() => {
      const body = document.querySelector('[data-note-id="${importedIds[0]}"] .md-body');
      if (!body) return null;
      const h = body.querySelector('h4');
      const li = body.querySelector('ul > li');
      return JSON.stringify({ h: h && h.textContent, li: li && li.textContent, cr: body.textContent.includes('\\r') });
    })()`),
    { timeout: 5000, interval: 100, label: 'the imported note to render' },
  );
  const r = JSON.parse(rendered);
  assert.equal(r.h, 'Goals', '## from the file renders as the note-sized <h4>');
  assert.equal(r.li, 'ship the importer', 'the list from the file renders as a real <li>');
  assert.equal(r.cr, false, 'no stray carriage returns survived into the note');
});

test('one Ctrl+Z takes the whole import back out', async () => {
  const key = { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 };
  await app.cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
  await app.cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...key });

  // Asserted on the canvas rather than on notes.json: the store's save is
  // debounced, and waiting it out again would keep this app alive (and the
  // machine busier) while the other e2e files are driving their own.
  const left = await pollUntil(
    () => app.evaljs(`(() => {
      const gone = ${JSON.stringify(importedIds)}.every(id => !document.querySelector('[data-note-id="' + id + '"]'));
      return gone ? document.querySelectorAll('[data-note-id]').length : null;
    })()`),
    { timeout: 5000, interval: 100, label: 'the import to be undone' },
  );
  assert.equal(left, noteCountBeforeImport,
    'a single undo removes every note the import created, and nothing else');
});
