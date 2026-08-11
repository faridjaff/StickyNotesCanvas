// Editor keystroke contracts (editListOnEnter / editListOnTab in utils.jsx),
// driven through the real textarea with CDP Input.insertText + key events.
// The empty seeded note is used so the caret starts at 0 and every keystroke
// is accounted for.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, NOTE } from './harness.mjs';

let app;
before(async () => {
  app = await launch();
  // Enter edit mode on the empty note once; all tests type into this textarea.
  const r = await app.noteBodyRect(NOTE.empty);
  await app.dblclick((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  await app.pollUntil(
    () => app.evaljs(`document.activeElement === document.querySelector('[data-note-id="${NOTE.empty}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'empty note textarea to open and focus' },
  );
});
after(async () => { if (app) await app.close(); });

const value = () => app.evaljs(`document.querySelector('[data-note-id="${NOTE.empty}"] textarea').value`);

test('Enter on a "1. x" line auto-inserts the next ordered marker "2. "', async () => {
  await app.type('1. x');
  await app.press('Enter');
  assert.equal(await value(), '1. x\n2. ');
});

test('Tab on a "2. y" line rewrites it to "   1. y" (renumber-to-1 nesting)', async () => {
  await app.type('y');
  assert.equal(await value(), '1. x\n2. y');
  await app.press('Tab');
  assert.equal(await value(), '1. x\n   1. y');
  // Tab was consumed by the list edit — focus never left the textarea.
  const focused = await app.evaljs(`document.activeElement === document.querySelector('[data-note-id="${NOTE.empty}"] textarea')`);
  assert.equal(focused, true, 'Tab must indent the list line, not move focus');
});

test('Enter on a "> q" line inserts a "> " continuation', async () => {
  // Continue the nested list ("   2. "), then Enter on the empty item to
  // close the list (editListOnEnter drops the empty marker) — leaves the
  // caret on a fresh empty line for the blockquote.
  await app.press('Enter');
  assert.equal(await value(), '1. x\n   1. y\n   2. ');
  await app.press('Enter');
  assert.equal(await value(), '1. x\n   1. y\n');
  await app.type('> q');
  await app.press('Enter');
  assert.equal(await value(), '1. x\n   1. y\n> q\n> ');
});

test('the typed body survives leaving edit mode: preview renders a nested ol and blockquote', async () => {
  // Click outside the note to commit (blur exits edit mode, keeping edits).
  await app.click(20, 700);
  await app.pollUntil(
    () => app.evaljs(`!document.querySelector('[data-note-id="${NOTE.empty}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'edit mode to close on outside click' },
  );
  const dom = await app.evaljs(`(() => {
    const body = document.querySelector('[data-note-id="${NOTE.empty}"] .md-body');
    return {
      nestedOl: !!body.querySelector('ol ol'),
      blockquote: !!body.querySelector('blockquote'),
    };
  })()`);
  assert.equal(dom.nestedOl, true, 'the renumber-to-1 indented item renders as a nested <ol>');
  assert.equal(dom.blockquote, true, 'the "> " lines render as a <blockquote>');
});
