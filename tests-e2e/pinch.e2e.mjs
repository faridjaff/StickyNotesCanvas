// Pinch-to-zoom gesture arbitration (issue #17), driven with real CDP touch
// input (Input.dispatchTouchEvent — Blink turns them into pointer events with
// pointerType 'touch', same as a finger on a touchscreen). The spec, from
// real-iPhone testing:
//   - two fingers starting on EMPTY canvas → midpoint-anchored pinch-zoom;
//   - one finger per header on two DIFFERENT notes → both notes drag
//     simultaneously (#18's per-pointer drags), zoom untouched;
//   - a finger dragging a note + a second finger on empty canvas → the drag
//     ends IN PLACE (no snap-back to the pre-drag position) and no pinch
//     starts, because pinch only engages when BOTH touches began on the
//     desk background.
// No Emulation.setTouchEmulationEnabled here: dispatchTouchEvent delivers
// touch input on its own, and enabling emulation mid-session was observed
// to inject a spurious pointercancel into the next gesture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, NOTE } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

// One CDP touch event. touchPoints is the full set of fingers on the screen
// AFTER the event (active-set semantics): a new id is a finger down, a
// missing id is a finger up, a moved id is a finger move. touchEnd with []
// lifts every remaining finger.
const touch = (type, points) => app.cmd('Input.dispatchTouchEvent', {
  type,
  touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 2.5, radiusY: 2.5, force: 1 })),
});

// Current zoom, read straight off the desk transform the app renders.
const deskZoom = () => app.evaljs(`(() => {
  const m = /scale\\(([\\d.]+)\\)/.exec(document.getElementById('desk-inner').style.transform);
  return m ? Number(m[1]) : null;
})()`);

// World position straight off the note root's style — left/top ARE note.x/y,
// zoom-independent, so any change means the note actually moved.
const notePos = (id) => app.evaljs(`(() => {
  const el = document.querySelector('[data-note-id="${id}"]');
  return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
})()`);

// Viewport center of the note's header — the primary drag handle, always
// the first child of the note root.
const headerCenter = (id) => app.evaljs(`(() => {
  const r = document.querySelector('[data-note-id="${id}"]').firstElementChild.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
})()`);

// Selected notes render a solid outline; unselected notes have outline:none.
const selectedIdList = () => app.evaljs(`
  [...document.querySelectorAll('[data-note="1"]')]
    .filter(el => el.style.outlineStyle === 'solid')
    .map(el => el.getAttribute('data-note-id'))
    .sort()
`);

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

// Two fingers land at from[0]/from[1], glide linearly to to[0]/to[1] in
// `steps` touchMoves, then lift. The sleeps are input cadence only (the 60ms
// after touchStart gives React a commit to attach its {passive:false}
// touchmove listener) — every assertion below remains a bounded poll on an
// observable outcome, never a bare sleep.
const pinch = async (from, to, steps = 8) => {
  const at = (f) => from.map((p, i) => ({
    x: Math.round(p.x + (to[i].x - p.x) * f),
    y: Math.round(p.y + (to[i].y - p.y) * f),
    id: i + 1,
  }));
  await touch('touchStart', at(0));
  await app.sleep(60);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', at(i / steps));
    await app.sleep(24);
  }
  await touch('touchEnd', []);
};

// Runs first, while view is the seeded {x:0,y:0,z:1}, so finger deltas map
// 1:1 to world coordinates. The owner-tested favourite: one finger per
// header on two different notes drags BOTH notes at once. The pinch must
// not hijack the pair (its gate requires both touches to start on the desk
// background), so zoom stays put, and nothing weird gets selected.
test('one finger per note header drags both notes; no pinch engages', async () => {
  const z0 = await deskZoom();
  const pa0 = await notePos(NOTE.plain);
  const pb0 = await notePos(NOTE.other);
  const ca = await headerCenter(NOTE.plain);
  const cb = await headerCenter(NOTE.other);

  // Finger 1 grabs Plain's header, then finger 2 grabs Other's header.
  await touch('touchStart', [{ id: 1, x: ca.x, y: ca.y }]);
  await touch('touchStart', [{ id: 1, x: ca.x, y: ca.y }, { id: 2, x: cb.x, y: cb.y }]);
  // Move the fingers apart: finger 1 down-left, finger 2 down-right.
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [
      { id: 1, x: ca.x - i * 16, y: ca.y + i * 20 },
      { id: 2, x: cb.x + i * 20, y: cb.y + i * 14 },
    ]);
    await app.sleep(24); // give the rAF coalescer a frame between samples
  }
  await touch('touchEnd', []);

  // startPointerDrag flushes the last pending move on release, so at z=1
  // each note must land exactly one full finger-delta from where it began.
  await app.pollUntil(async () => {
    const pa = await notePos(NOTE.plain);
    const pb = await notePos(NOTE.other);
    return near(pa.x, pa0.x - 80) && near(pa.y, pa0.y + 100)
        && near(pb.x, pb0.x + 100) && near(pb.y, pb0.y + 70);
  }, { timeout: 3000, interval: 50, label: 'both notes to land a full finger-delta away' });

  assert.equal(await deskZoom(), z0, 'two fingers on note headers must not zoom the canvas');
  // Each header touch focuses its note in turn (normal single-note focus,
  // exactly as two sequential taps would); the last-touched note ends up
  // selected. Crucially: no multi-selection, no marquee, no stray note.
  assert.deepEqual(await selectedIdList(), [NOTE.other],
    'only the last-grabbed note may be selected after a two-note drag');
});

// A second finger landing on EMPTY canvas mid-drag ends the drag where it
// stands: the note keeps its current dragged position (no snap-back to its
// pre-drag origin — the abort+restore approach was rejected on-device), it
// does not chase finger 1, and no pinch starts because finger 1's touch
// began on a note header, not on the desk background.
test('second finger on empty canvas ends a note drag in place, without zooming', async () => {
  const z0 = await deskZoom();
  const p0 = await notePos(NOTE.plain);
  const c = await headerCenter(NOTE.plain);

  await touch('touchStart', [{ id: 1, x: c.x, y: c.y }]);
  for (let i = 1; i <= 3; i++) {
    await touch('touchMove', [{ id: 1, x: c.x + i * 20, y: c.y + i * 10 }]);
    await app.sleep(24);
  }
  // Let finger 1's rAF-coalesced moves land before the second finger does.
  await app.pollUntil(async () => {
    const p = await notePos(NOTE.plain);
    return near(p.x, p0.x + 60) && near(p.y, p0.y + 30);
  }, { timeout: 3000, interval: 50, label: 'drag to reach finger 1 before finger 2 lands' });
  const mid = await notePos(NOTE.plain);

  // Finger 2 lands on empty desk while finger 1 keeps sweeping. The finger
  // gap changes every move, so a wrongly-engaged pinch would show up as a
  // zoom change, and a drag still alive would chase finger 1.
  await touch('touchStart', [{ id: 1, x: c.x + 60, y: c.y + 30 }, { id: 2, x: 1200, y: 800 }]);
  for (let i = 4; i <= 7; i++) {
    await touch('touchMove', [{ id: 1, x: c.x + i * 40, y: c.y + i * 30 }, { id: 2, x: 1200, y: 800 }]);
    await app.sleep(24);
  }
  await app.sleep(200); // negative assertion — window for any wrong move to apply
  assert.deepEqual(await notePos(NOTE.plain), mid,
    'the second finger must end the drag where it stood — no chasing finger 1, no snap-back');
  assert.equal(await deskZoom(), z0, 'a drag + canvas finger pair must not start a pinch');

  await touch('touchEnd', []);
  await app.sleep(150);
  assert.deepEqual(await notePos(NOTE.plain), mid,
    'lifting the fingers must not move the note either');
  assert.equal(await deskZoom(), z0, 'zoom must still be untouched after release');
});

// Background pinches must zoom and do nothing else: geometry and selection
// are captured before the first pinch and re-asserted after the last.
let geomBeforePinches;
let selectionBeforePinches;
const allNoteGeom = () => app.evaljs(`(() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-note="1"]')) {
    out[el.getAttribute('data-note-id')] = el.style.left + ' ' + el.style.top;
  }
  return out;
})()`);

test('spreading two fingers on empty canvas increases the zoom', async () => {
  geomBeforePinches = await allNoteGeom();
  selectionBeforePinches = await selectedIdList();
  const z0 = await deskZoom();
  await pinch(
    [{ x: 1025, y: 750 }, { x: 1175, y: 750 }],
    [{ x: 950,  y: 750 }, { x: 1250, y: 750 }],
  );
  await app.pollUntil(async () => (await deskZoom()) > z0 * 1.5,
    { timeout: 3000, interval: 100, label: 'zoom to increase on spread' });
});

test('pinching two fingers together decreases the zoom', async () => {
  const z0 = await deskZoom();
  await pinch(
    [{ x: 950,  y: 750 }, { x: 1250, y: 750 }],
    [{ x: 1040, y: 750 }, { x: 1160, y: 750 }],
  );
  await app.pollUntil(async () => (await deskZoom()) < z0 * 0.7,
    { timeout: 3000, interval: 100, label: 'zoom to decrease on pinch-together' });
  // Tie-off: the two background pinches changed zoom and nothing else —
  // every note still holds its (post-drag-test) position and the selection
  // is exactly what it was before the pinches.
  assert.deepEqual(await allNoteGeom(), geomBeforePinches,
    'notes must be untouched by background pinches');
  assert.deepEqual(await selectedIdList(), selectionBeforePinches,
    'selection must be untouched by background pinches');
});
