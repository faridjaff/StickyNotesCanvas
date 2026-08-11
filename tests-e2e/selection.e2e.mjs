// Text-selection gestures on rendered note bodies, ported from the CDP
// debugging probe. Current master behavior: while a selection drag is
// outside the source note, an rAF referee snaps the selection end to the
// note's boundary (start for exits above/left, end for exits below/right),
// and body.sel-lock makes every other note unselectable (containment).
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
