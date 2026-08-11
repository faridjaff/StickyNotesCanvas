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

// Undo used to reach past an editing session: typing recorded no snapshot,
// so Ctrl+Z rewound to the last create/delete and took unrelated notes with
// it. Each session is now its own step.
test('undo after typing reverts only that typing, leaving other notes alone', async () => {
  const before = await app.evaljs(`document.querySelectorAll('[data-note-id]').length`);
  const box = await app.noteBodyRect(NOTE.plain);
  await app.dblclick(box.left + 20, box.top + 12);
  await app.pollUntil(() => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.plain}"] textarea')`),
    { timeout: 5000, label: 'editor to open' });
  await app.type(' EXTRA');
  await app.pollUntil(() => app.evaljs(`(document.querySelector('[data-note-id="${NOTE.plain}"] textarea')||{}).value?.includes('EXTRA')`),
    { timeout: 5000, label: 'typed text' });

  // Leave the editor so the app-level undo handler runs (a focused textarea
  // deliberately keeps native undo instead).
  await app.click(5, 5);
  await app.pollUntil(() => app.evaljs(`!document.querySelector('[data-note-id="${NOTE.plain}"] textarea')`),
    { timeout: 5000, label: 'editor to close' });
  await app.cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
  await app.cmd('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });

  await app.pollUntil(async () => {
    const html = await app.evaljs(`(document.querySelector('[data-note-id="${NOTE.plain}"] .md-body')||{}).textContent || ''`);
    return html.includes('EXTRA') ? null : true;
  }, { timeout: 5000, label: 'the typing to be undone' });

  const after = await app.evaljs(`document.querySelectorAll('[data-note-id]').length`);
  assert.equal(after, before, 'undo must not remove other notes');
});

/* ---------------- the hidden menu bar (#42) ----------------
 * The application menu is still SET — it carries the accelerators and the
 * Edit roles — but its bar no longer occupies the window. These tests pin
 * down both halves of that: gone from the window, alive on the keyboard.
 * They run last in this file because the last one leaves a panel over the
 * bottom-right corner mid-test.
 */

test('no menu bar occupies the window: the web contents fill it top to bottom', async () => {
  // Electron draws the menu bar INSIDE the window on Linux/Windows, above the
  // web contents, so a visible one shows up as a gap between the window's
  // height and the viewport's (~29px on GTK — this was 871 vs 900 before the
  // bar was hidden). No gap, no bar. macOS has no in-window bar to measure.
  const g = await app.evaljs('({inner: innerHeight, outer: outerHeight})');
  assert.equal(g.outer - g.inner, 0,
    `the window's ${g.outer}px hold only ${g.inner}px of page — ${g.outer - g.inner}px of menu bar is still showing`);
});

// NOT tested here: Alt summoning the bar back. It works (900px of window →
// 871px of page while the bar is up, and back again), but driving it over
// CDP is a coin flip — a synthetic Alt sometimes lands in the menu bar's own
// key handling and takes the window's keyboard focus with it, failing
// whatever runs next. Verified by hand instead.

test('Ctrl+A / C / V / X still edit note text — the Edit menu roles survive too', async () => {
  // THE regression to fear when a menu goes away: in Electron the clipboard
  // chords inside a text field are wired by the Edit menu's roles. Honest
  // caveat — on Linux Chromium's own editing commands cover these as well
  // (they survive even Menu.setApplicationMenu(null) here), so this asserts
  // what the user feels rather than which layer served it; the Ctrl+, test
  // below is the one that proves the menu itself is still registered. Note
  // this writes to the real system clipboard for a moment — there is no way
  // to exercise a copy that doesn't.
  const box = await app.noteBodyRect(NOTE.empty);
  await app.dblclick((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await app.pollUntil(() => app.evaljs(`document.activeElement === document.querySelector('[data-note-id="${NOTE.empty}"] textarea')`),
    { timeout: 5000, label: 'the empty note editor to open and focus' });

  // selectAll, then type over it: landing on exactly 'clip' proves Ctrl+A
  // selected the whole body (the note holds several lines by now).
  await app.press('a', { ctrl: true });
  await app.type('clip');
  await app.pollUntil(async () => (await value()) === 'clip',
    { timeout: 5000, interval: 150, label: 'Ctrl+A to select the body so typing replaces it' });

  await app.press('a', { ctrl: true });
  await app.press('c', { ctrl: true });
  await app.type(' X');
  await app.pollUntil(async () => (await value()) === ' X',
    { timeout: 5000, interval: 150, label: 'the body to be replaced by " X"' });
  await app.press('v', { ctrl: true });
  await app.pollUntil(async () => (await value()) === ' Xclip',
    { timeout: 5000, interval: 150, label: 'Ctrl+V to paste the copied text back' });

  await app.press('a', { ctrl: true });
  await app.press('x', { ctrl: true });
  await app.pollUntil(async () => (await value()) === '',
    { timeout: 5000, interval: 150, label: 'Ctrl+X to cut the whole body away' });
});

test('Ctrl+, still opens Preferences — the menu accelerator survives the hidden bar', async () => {
  // The renderer's own Ctrl+, handler is disabled under Electron (see the
  // `if (window.stickyAPI) return` guard in AppInner), so nothing but the
  // menu item's accelerator can open this panel: with the menu gone —
  // Menu.setApplicationMenu(null) instead of a hidden bar — this goes red.
  //
  // Both halves re-press while polling. Unlike the clipboard chords above,
  // which the renderer serves on its own, an accelerator is dispatched by
  // the BROWSER process to whichever window the desktop considers active, so
  // an individual keystroke can be dropped while that settles (eight app
  // windows launch at once when the whole suite runs). Each round re-checks
  // BEFORE pressing, so a landed press is never toggled straight back.
  const prefsOpen = () => app.evaljs(`document.body.textContent.includes('Visual style')`);
  const pressUntil = (want, label) => app.pollUntil(async () => {
    if ((await prefsOpen()) === want) return true;
    await app.focusWindow();
    await app.press('Comma', { ctrl: true });
    return false;
  }, { timeout: 15000, interval: 250, label });

  assert.equal(await prefsOpen(), false, 'preferences must start closed');
  await pressUntil(true, 'Ctrl+, to open Preferences');
  // …and it toggles back off, leaving the canvas clear for anything after.
  await pressUntil(false, 'Ctrl+, to close Preferences again');
});
