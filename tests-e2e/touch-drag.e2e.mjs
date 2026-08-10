// Touch dragging (issue #18), driven with real CDP touch events
// (Input.dispatchTouchEvent — Blink turns them into pointer events with
// pointerType 'touch', same as a finger on a touchscreen). Verifies the
// startPointerDrag session: a single finger on the HEADER moves the note,
// a finger on the BODY never does (the body is a text-selection surface
// since #30), and a second finger landing mid-drag ends the drag where it
// stands — no chasing finger 1, no teleport to finger 2.
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

// World position straight off the note root's style — left/top ARE note.x/y
// (the seed pins the view at {x:0, y:0, z:1}, so no transform math needed).
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

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

test('single-finger touch drag on the header moves the note', async () => {
  const p0 = await notePos(NOTE.plain);
  const c = await headerCenter(NOTE.plain);
  await touch('touchStart', [{ id: 1, x: c.x, y: c.y }]);
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ id: 1, x: c.x + i * 24, y: c.y + i * 18 }]);
    await app.sleep(24); // give the rAF coalescer a frame between samples
  }
  await touch('touchEnd', []);
  // startPointerDrag flushes the last pending move on release, so at z=1
  // the note must land exactly one full finger-delta from where it began.
  await app.pollUntil(async () => {
    const p = await notePos(NOTE.plain);
    return near(p.x, p0.x + 120) && near(p.y, p0.y + 90);
  }, { timeout: 3000, interval: 50, label: 'note to land a full finger-delta away' });
});

test('single-finger touch drag on the body does not move the note', async () => {
  const p0 = await notePos(NOTE.plain);
  const b = await app.noteBodyRect(NOTE.plain);
  const x = (b.left + b.right) / 2;
  const y = (b.top + b.bottom) / 2;
  await touch('touchStart', [{ id: 1, x, y }]);
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ id: 1, x: x + i * 24, y: y + i * 18 }]);
    await app.sleep(24);
  }
  await touch('touchEnd', []);
  // Negative assertion: no state change to poll for, so give any (buggy)
  // drag rAF a generous window to apply, then require stillness.
  await app.sleep(200);
  assert.deepEqual(await notePos(NOTE.plain), p0,
    'a touch drag starting on the body must not move the note');
});

test('a second finger landing mid-drag ends the drag without a jump', async () => {
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

  // Finger 2 lands on empty desk (pinch-zoom intent) while finger 1 keeps
  // sweeping — a drag still alive would chase finger 1 across the canvas.
  await touch('touchStart', [{ id: 1, x: c.x + 60, y: c.y + 30 }, { id: 2, x: 1200, y: 800 }]);
  for (let i = 4; i <= 7; i++) {
    await touch('touchMove', [{ id: 1, x: c.x + i * 40, y: c.y + i * 30 }, { id: 2, x: 1200, y: 800 }]);
    await app.sleep(24);
  }
  await app.sleep(200); // negative assertion — window for any wrong move to apply
  assert.deepEqual(await notePos(NOTE.plain), mid,
    'the second finger must end the drag where it stood — no chasing finger 1');

  await touch('touchEnd', []);
  await app.sleep(150);
  assert.deepEqual(await notePos(NOTE.plain), mid,
    'lifting the fingers must not move the note either');
});
