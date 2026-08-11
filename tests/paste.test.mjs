import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as lists.test.mjs / markdown.test.mjs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { editLinkOnPaste } = sandbox.window;

/* Pasting a URL over selected text wraps it Slack-style: [selection](url).
 * Every null below means "fall through to the browser's normal paste". */

test('pasting a URL over a selected word wraps it as a link', () => {
  const r = editLinkOnPaste('pick a word', 5, 6, 'https://x.y');
  // spread: the helper's object comes from the vm sandbox realm
  assert.deepEqual({ ...r }, { start: 5, end: 6, text: '[a](https://x.y)', caret: 5 + '[a](https://x.y)'.length });
});

test('clipboard whitespace is trimmed before the URL check', () => {
  const r = editLinkOnPaste('word', 0, 4, '  https://x.y\n');
  assert.equal(r.text, '[word](https://x.y)');
});

test('pasting a URL over a whole existing link swaps the URL, keeps the word', () => {
  const v = '[word](https://old.ex)';
  const r = editLinkOnPaste(v, 0, v.length, 'https://new.ex');
  assert.equal(r.text, '[word](https://new.ex)');
});

test('no selection returns null (normal paste; bare URL auto-links)', () => {
  assert.equal(editLinkOnPaste('abc', 2, 2, 'https://x.y'), null);
});

test('non-URL clipboard returns null (normal paste)', () => {
  assert.equal(editLinkOnPaste('abc', 0, 3, 'hello world'), null);
});

test('clipboard with two URLs returns null', () => {
  assert.equal(editLinkOnPaste('abc', 0, 3, 'https://a.b https://c.d'), null);
});

test('selection that is itself a URL returns null (clean URL swap)', () => {
  assert.equal(editLinkOnPaste('https://old.ex', 0, 14, 'https://new.ex'), null);
});

test('selection containing brackets (not a whole link) returns null', () => {
  assert.equal(editLinkOnPaste('foo] bar', 0, 8, 'https://x.y'), null);
});

test('partial selection of an existing link returns null', () => {
  assert.equal(editLinkOnPaste('[word](https://old.ex) tail', 0, 10, 'https://x.y'), null);
});

test('multi-line selection returns null', () => {
  assert.equal(editLinkOnPaste('a\nb', 0, 3, 'https://x.y'), null);
});

/* ---------------- canvasPasteAction (#29) ---------------- */

const { canvasPasteAction, notesToClipboardText, STICKY_CLIPBOARD_MARKER } = sandbox.window;

test('plain text on the canvas becomes a note', () => {
  assert.equal(canvasPasteAction('shopping: eggs, milk'), 'note');
  assert.equal(canvasPasteAction('# md heading\n- bullet'), 'note');
});

test('a real copied-notes payload still imports', () => {
  const payload = notesToClipboardText([{ id: 'n1', title: 'T', body: 'B', color: 'blue', w: 1, h: 1 }], []);
  assert.equal(canvasPasteAction(payload), 'payload');
});

test('marker present but JSON broken means error, not a garbage note', () => {
  assert.equal(canvasPasteAction('hi\n' + STICKY_CLIPBOARD_MARKER + '\n{oops'), 'error');
});

test('marker with an empty notes set means error', () => {
  assert.equal(canvasPasteAction(STICKY_CLIPBOARD_MARKER + '\n{"notes":[],"links":[]}'), 'error');
});

test('empty clipboard is ignored silently', () => {
  assert.equal(canvasPasteAction(''), 'ignore');
});

test('text that merely mentions sticky-notes formats still errors only with the real marker', () => {
  assert.equal(canvasPasteAction('the marker is <!-- sticky-notes/v1 --> fyi'), 'error');
  assert.equal(canvasPasteAction('the marker is sticky-notes/v1 fyi'), 'note');
});

/* ---------------- whatsNewInfo (2.0 announcement) ---------------- */

const { whatsNewInfo } = sandbox.window;

test('version change shows the note once', () => {
  const info = whatsNewInfo('2.0.0', '1.8.0');
  assert.match(info.title, /2\.0\.0/);
  assert.match(info.detail, /markdown|diagrams|Pinch/i);
});

test('same version shows nothing', () => {
  assert.equal(whatsNewInfo('2.0.0', '2.0.0'), null);
});

test('fresh install (no recorded version) shows nothing', () => {
  assert.equal(whatsNewInfo('2.0.0', null), null);
  assert.equal(whatsNewInfo('2.0.0', ''), null);
});

test('missing current version shows nothing', () => {
  assert.equal(whatsNewInfo(undefined, '1.8.0'), null);
});
