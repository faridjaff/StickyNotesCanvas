import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as selection.test.mjs / lists.test.mjs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { zoomActionForKey, zoomViewAt, ZOOM_MIN, ZOOM_MAX } = sandbox.window;

/* ==================================================================== */
/* zoomActionForKey — which canvas zoom a keydown asks for (issue #45)   */
/* ==================================================================== */

// Event stand-in. Defaults to a plain keydown on the document body with no
// modifiers; each test overrides only what it is about.
const ev = (o = {}) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, ...o });

const TEXT_FIELD = { tagName: 'TEXTAREA' };
const INPUT = { tagName: 'INPUT' };
const RICH = { tagName: 'DIV', isContentEditable: true };
const DESK = { tagName: 'DIV', isContentEditable: false };

test('Ctrl with the US "+" pair zooms in — both the shifted + and the bare =', () => {
  // A US keyboard sends '=' for the unshifted key and '+' when Shift is
  // held; the issue asks for both to mean "zoom in".
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '=', code: 'Equal' }), DESK), 'in');
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, shiftKey: true, key: '+', code: 'Equal' }), DESK), 'in');
});

test('Ctrl with "-" or the shifted "_" zooms out', () => {
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '-', code: 'Minus' }), DESK), 'out');
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, shiftKey: true, key: '_', code: 'Minus' }), DESK), 'out');
});

test('Ctrl+0 resets', () => {
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '0', code: 'Digit0' }), DESK), 'reset');
});

test('other Ctrl chords are left entirely alone', () => {
  for (const key of ['z', 'c', 'v', 'x', 'n', 'f', ',', '1', '9', 'a', 'Escape', 'ArrowUp']) {
    assert.equal(zoomActionForKey(ev({ ctrlKey: true, key, code: 'Key' + key.toUpperCase() }), DESK), null,
      `Ctrl+${key} must not be treated as a zoom`);
  }
});

test('the event target is checked too, so a field wins even if it never took focus', () => {
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '=', code: 'Equal', target: TEXT_FIELD }), DESK), null);
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '0', code: 'Digit0', target: RICH }), null), null);
  // ...and a non-field target with nothing focused still zooms.
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '=', code: 'Equal', target: DESK }), null), 'in');
});

test('missing event / missing activeElement are handled, not thrown on', () => {
  assert.equal(zoomActionForKey(null, DESK), null);
  assert.equal(zoomActionForKey(undefined, undefined), null);
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '=', code: 'Equal' }), null), 'in');
  assert.equal(zoomActionForKey(ev({ ctrlKey: true, key: '=', code: 'Equal' }), undefined), 'in');
});

/* ==================================================================== */
/* zoomViewAt — the anchored-zoom maths shared by every zoom path        */
/* ==================================================================== */

// World point under a given desk-relative screen point, for the given view.
const worldAt = (v, sx, sy) => ({ x: (sx - v.x) / v.z, y: (sy - v.y) / v.z });
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
// zoomViewAt builds its result inside the vm context, so the object carries
// that realm's Object.prototype and deepStrictEqual would reject it on the
// prototype alone. Re-home it before comparing shapes.
const plain = (o) => ({ ...o });

test('the world point under the anchor does not move', () => {
  const v = { x: -120, y: 65, z: 0.8 };
  for (const [ax, ay] of [[0, 0], [700, 450], [1399, 899], [-40, 12]]) {
    for (const factor of [1.2, 1 / 1.2, 2, 0.5]) {
      const before = worldAt(v, ax, ay);
      const after = worldAt(zoomViewAt(v, factor, ax, ay), ax, ay);
      assert.ok(close(before.x, after.x) && close(before.y, after.y),
        `anchor (${ax},${ay}) x${factor} moved the world point under it`);
    }
  }
});

test('the scale is multiplied by the factor', () => {
  assert.equal(zoomViewAt({ x: 0, y: 0, z: 1 }, 1.2, 500, 300).z, 1.2);
  assert.ok(close(zoomViewAt({ x: 0, y: 0, z: 1.2 }, 1 / 1.2, 500, 300).z, 1));
});

test('the clamp is the shared 0.25 .. 3 range, and it saturates instead of overshooting', () => {
  assert.equal(ZOOM_MIN, 0.25);
  assert.equal(ZOOM_MAX, 3);
  assert.equal(zoomViewAt({ x: 0, y: 0, z: 2.9 }, 4, 700, 450).z, ZOOM_MAX);
  assert.equal(zoomViewAt({ x: 0, y: 0, z: 0.3 }, 0.01, 700, 450).z, ZOOM_MIN);
});

test('at a clamp boundary the view is returned unchanged — no drift from repeated keypresses', () => {
  const ceil = { x: 33, y: -70, z: ZOOM_MAX };
  assert.deepEqual(plain(zoomViewAt(ceil, 1.2, 700, 450)), ceil);
  const floor = { x: 33, y: -70, z: ZOOM_MIN };
  assert.deepEqual(plain(zoomViewAt(floor, 1 / 1.2, 700, 450)), floor);
});

test('reset-to-100% is the same formula with factor 1/z: scale 1, anchor fixed', () => {
  // This is exactly what Ctrl+0 does, anchored at the viewport centre.
  const v = { x: -400, y: 220, z: 2.5 };
  const cx = 700, cy = 450;
  const out = zoomViewAt(v, 1 / v.z, cx, cy);
  assert.equal(out.z, 1);
  const before = worldAt(v, cx, cy);
  const after = worldAt(out, cx, cy);
  assert.ok(close(before.x, after.x) && close(before.y, after.y),
    'reset must keep the centre of the viewport looking at the same notes');
  // It resets the SCALE only — it does not send the pan home to the origin.
  assert.notDeepEqual({ x: out.x, y: out.y }, { x: 0, y: 0 });
});

test('anchoring at the origin degenerates to a plain scale of the offsets', () => {
  const out = zoomViewAt({ x: 100, y: 50, z: 1 }, 2, 0, 0);
  assert.deepEqual(plain(out), { x: 200, y: 100, z: 2 });
});

test('the input view object is not mutated', () => {
  const v = { x: 10, y: 20, z: 1 };
  zoomViewAt(v, 1.5, 300, 300);
  assert.deepEqual(v, { x: 10, y: 20, z: 1 });
});
