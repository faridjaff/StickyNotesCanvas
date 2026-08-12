// Mouse-gesture outcomes on real notes: text-selection drags (ported from
// the CDP debugging probe) and, at the end of the file, the context menu's
// hover contrast.
//
// Selection behavior on current master: while a selection drag is outside
// the source note, an rAF referee snaps the selection end to the note's
// boundary (start for exits above/left, end for exits below/right), and
// body.sel-lock makes every other note unselectable (containment).
// Assertions are on OUTCOMES only (direction, containment, text), never on
// selection-write counts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, NOTE } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

// Snapshot the final selection: its text, direction, and whether the focus
// end landed inside the plain note's body.
const selectionState = () => app.evaljs(`(() => {
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) return { text: '', collapsed: true, backward: false, focusInPlain: false };
  const r = document.createRange();
  r.setStart(s.anchorNode, s.anchorOffset);
  r.setEnd(s.anchorNode, s.anchorOffset);
  const backward = r.comparePoint(s.focusNode, s.focusOffset) < 0;
  const plainBox = document.querySelector('[data-note-id="${NOTE.plain}"] .md-body').parentElement;
  return { text: s.toString(), collapsed: false, backward, focusInPlain: plainBox.contains(s.focusNode) };
})()`);

const clearSelection = () => app.evaljs('getSelection().removeAllRanges(); undefined');

test('drag right beyond the note: selection stays forward and ends within the note', async () => {
  await clearSelection();
  const r = await app.noteBodyRect(NOTE.plain);
  const y = r.top + 20;                     // first text line
  const path = [{ x: r.left + 20, y }];
  for (let x = r.left + 45; x < r.right + 100; x += 25) path.push({ x, y });
  await app.drag(path);
  const s = await selectionState();
  assert.equal(s.collapsed, false, 'a selection should exist');
  assert.equal(s.backward, false, 'selection must be forward');
  assert.equal(s.focusInPlain, true, 'selection must end inside the note it started in');
  assert.match(s.text, /lima/, 'exit-right snaps the selection to the end of the note text');
  assert.doesNotMatch(s.text, /zulu|victor/, 'nothing from any other note may be selected');
});

test('drag out below the bottom border: selection stays forward (boundary-snap regression guard)', async () => {
  await clearSelection();
  const r = await app.noteBodyRect(NOTE.plain);
  const y0 = r.top + 20;
  const midX = (r.left + r.right) / 2;
  // Rightward, then dip 1px below the bottom border, then further down —
  // this used to flip the selection backward before the rAF referee.
  const path = [
    { x: r.left + 20, y: y0 },
    { x: midX, y: y0 },
    { x: midX + 30, y: r.bottom + 1 },
    { x: midX + 60, y: r.bottom + 60 },
  ];
  await app.drag(path);
  const s = await selectionState();
  assert.equal(s.collapsed, false, 'a selection should exist');
  assert.equal(s.backward, false, 'dipping below the bottom border must NOT flip the selection backward');
  assert.equal(s.focusInPlain, true, 'selection must end inside the note');
  assert.match(s.text, /lima/, 'exit-below snaps the selection to the end of the note text');
});

test('drag left out of the note: selection goes backward to the line start', async () => {
  await clearSelection();
  const r = await app.noteBodyRect(NOTE.plain);
  const y = r.top + 20;                     // press on the FIRST line, a few words in
  const path = [{ x: r.left + 124, y }];
  for (let x = r.left + 94; x > Math.max(4, r.left - 100); x -= 30) path.push({ x, y });
  await app.drag(path);
  const s = await selectionState();
  assert.equal(s.collapsed, false, 'a selection should exist');
  assert.equal(s.backward, true, 'exit-left must produce a backward selection');
  assert.match(s.text, /^alpha/, 'selection reaches back to the start of the line');
  assert.doesNotMatch(s.text, /echo|india/, 'selection must not spill onto later lines');
});

test('drag across onto another note: selection contains nothing from the second note', async () => {
  await clearSelection();
  const rA = await app.noteBodyRect(NOTE.plain);
  const rB = await app.noteBodyRect(NOTE.other);
  const y = rA.top + 20;
  const targetX = (rB.left + rB.right) / 2;   // sweep well into note B
  const path = [{ x: rA.left + 20, y }];
  for (let x = rA.left + 50; x < targetX; x += 30) path.push({ x, y });
  path.push({ x: targetX, y: (rB.top + rB.bottom) / 2 });
  await app.drag(path);
  const s = await selectionState();
  assert.equal(s.collapsed, false, 'a selection should exist');
  assert.equal(s.backward, false, 'selection stays forward');
  assert.equal(s.focusInPlain, true, 'selection is contained to the source note');
  assert.doesNotMatch(s.text, /zulu|yankee|victor|tango/, 'no text from the second note may be selected');
  assert.match(s.text, /lima/, 'selection snapped to the end of the source note');
});

test('double-click enters edit mode; Escape leaves it', async () => {
  await clearSelection();
  const r = await app.noteBodyRect(NOTE.plain);
  await app.dblclick((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  await app.pollUntil(
    () => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.plain}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'textarea after double-click' },
  );
  await app.press('Escape');
  await app.pollUntil(
    () => app.evaljs(`!document.querySelector('[data-note-id="${NOTE.plain}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'textarea to close after Escape' },
  );
  // Back in preview mode with the body unchanged.
  const text = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.plain}"] .md-body').textContent`);
  assert.match(text, /alpha bravo charlie delta/);
});

/* ---------------- context-menu hover contrast (issue #49) ----------------
 * The report: "there is no real difference between the currently selected
 * and unselected option" — the hovered row of the note's context menu
 * looked identical to its neighbours, worst of all on the dark terminal
 * theme where the old rgba(0,0,0,.05) overlay moved the row by 2/255.
 * Colour choices are a matter of taste and not worth asserting, but the
 * complaint itself is measurable: the row under the cursor must be a
 * clearly different colour from a row that is not, in every theme.
 */

// Effective (composited) paint of every top-level menu row: the row button's
// background is translucent, so it is flattened onto the menu panel here,
// exactly as the eye sees it.
const menuRows = () => app.evaljs(`(() => {
  const btns = [...document.querySelectorAll('.ctx-row > button')];
  if (!btns.length) return null;
  const px = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const panel = px(getComputedStyle(btns[0].closest('.ctx-row').parentElement).backgroundColor);
  const flat = (c) => { const a = c.length > 3 ? c[3] : 1; return [0,1,2].map(i => a*c[i] + (1-a)*panel[i]); };
  return btns.map(b => ({
    label: b.textContent.trim(),
    rgb: flat(px(getComputedStyle(b).backgroundColor)),
    accent: getComputedStyle(b).boxShadow !== 'none',
    cursor: getComputedStyle(b).cursor,
    disabled: b.disabled,
    hovered: b.parentElement.classList.contains('hover'),
    subOpen: !!b.parentElement.querySelector('.ctx-sub') &&
      getComputedStyle(b.parentElement.querySelector('.ctx-sub')).display !== 'none',
  }));
})()`);

const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

// Centre of the first element matching `sel` whose trimmed text is `text`.
const centreOf = (sel, text) => app.evaljs(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
    .find(e => e.textContent.trim() === ${JSON.stringify(text)});
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
})()`);

const rightClick = async (x, y) => {
  await app.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await app.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 2, clickCount: 1 });
};

const openNoteMenu = async () => {
  const at = await app.evaljs(`(() => {
    const b = document.querySelector('[data-note-id="${NOTE.plain}"]').getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + 8) };
  })()`);
  await rightClick(at.x, at.y);
  await app.pollUntil(async () => (await menuRows() || []).length > 2,
    { timeout: 3000, interval: 50, label: 'note context menu to open' });
};

// Move the pointer onto a row and return the settled paint of the whole
// menu. Two moves, because a single hop straight from the right-click point
// onto the menu that has just appeared under the cursor does not always make
// Chromium re-run its hover hit test. Then poll until the row is both marked
// hovered AND has stopped changing colour: the highlight fades in over .1s
// and a snapshot taken mid-transition still reads as transparent.
const hoverRow = async (label) => {
  const at = await centreOf('.ctx-row > button', label);
  assert.ok(at, `no menu row labelled ${label}`);
  await app.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x - 4, y: at.y });
  await app.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  let previous = null;
  return app.pollUntil(async () => {
    const rows = await menuRows();
    const hot = rows && rows.find(r => r.label === label && r.hovered);
    if (!hot) { previous = null; return null; }
    const paint = hot.rgb.join(',');
    const settled = previous === paint;
    previous = paint;
    return settled ? rows : null;
  }, { timeout: 3000, interval: 60, label: `row "${label}" to take hover` });
};

// Click far from the menu to dismiss it (ContextMenu closes on an outside
// mousedown; it has no Escape handler).
const closeMenu = async () => {
  await app.click(1200, 760);
  await app.pollUntil(async () => !(await menuRows()),
    { timeout: 3000, interval: 50, label: 'context menu to close' });
};

// Switch themes through the real UI: status bar "preferences" opens the
// panel, the Visual style segment switches, "preferences" closes it again.
// --sticky-accent is written from the live theme tokens, so it is the
// app's own signal that the new theme has landed.
const onTheme = (accent) =>
  app.evaljs(`document.documentElement.style.getPropertyValue('--sticky-accent') === '${accent}'`);

const setTheme = async (label, accent) => {
  if (await onTheme(accent)) return;          // already there — the seeded default
  const prefs = await centreOf('button', 'preferences');
  await app.click(prefs.x, prefs.y);
  const seg = await app.pollUntil(() => centreOf('button', label),
    { timeout: 3000, interval: 50, label: `${label} theme button` });
  await app.click(seg.x, seg.y);
  await app.pollUntil(() => onTheme(accent),
    { timeout: 3000, interval: 50, label: `${label} theme to apply` });
  const again = await centreOf('button', 'preferences');
  await app.click(again.x, again.y);
  await app.pollUntil(async () => !(await centreOf('button', label)),
    { timeout: 3000, interval: 50, label: 'preferences panel to close' });
};

// The seeded default plus the dark theme the report was worst on. Every
// theme's hover MATHS is covered without a GUI in tests/hover.test.mjs; what
// needs a real window is that the maths is actually wired to the menu, and
// that it survives a light→dark switch. Flat is left to the unit test to
// keep this suite fast.
const THEMES = [
  { label: 'Paper', accent: '#b8621b' },
  { label: 'Terminal', accent: '#8fd27a' },
];

test('hovering an inert menu row does not make it look clickable', async () => {
  // The folder drawer's "Move to…" menu has nowhere to move the only seeded
  // folder, so it renders its one inert line. A highlight there would
  // promise an action that does not exist.
  const tab = await app.pollUntil(() => centreOf('button', 'FOLDERS · 1'),
    { timeout: 3000, interval: 50, label: 'folders tab' });
  await app.click(tab.x, tab.y);
  const row = await app.pollUntil(() => app.evaljs(`(() => {
    const el = document.querySelector('[data-folder-id="e2e"]');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`), { timeout: 3000, interval: 50, label: 'folder row in the open drawer' });

  await rightClick(row.x, row.y);
  const moveTo = await app.pollUntil(() => centreOf('.ctx-row > button', 'Move to…'),
    { timeout: 3000, interval: 50, label: 'folder context menu' });
  await app.click(moveTo.x, moveTo.y);

  const label = 'No other folder to move into';
  const before = await app.pollUntil(async () => {
    const rows = await menuRows();
    return rows && rows.some(r => r.label === label) ? rows : null;
  }, { timeout: 3000, interval: 50, label: 'the empty "move to" menu' });

  const after = await hoverRow(label);
  const inert = after.find(r => r.label === label);
  assert.equal(inert.disabled, true, 'an unavailable option must not be an active button');
  assert.deepEqual(inert.rgb, before.find(r => r.label === label).rgb,
    'hovering an inert row must not paint a highlight on it');
  assert.equal(inert.accent, false, 'no accent edge on an inert row either');
  assert.equal(inert.cursor, 'default', 'and no pointer cursor promising a click');

  await closeMenu();
  const hide = await centreOf('button', '›');
  await app.click(hide.x, hide.y);   // restore the closed drawer
});
