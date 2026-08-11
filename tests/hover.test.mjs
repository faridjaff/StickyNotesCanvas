// Hover affordance colour maths (issue #49). The bug was a single
// hard-coded rgba(0,0,0,.05) hover shared by every menu and row: it darkens
// a light panel by a barely-visible amount and does nothing at all on the
// dark terminal panel, where a hover has to get LIGHTER. These tests pin the
// property that actually matters — the hover must land a clearly perceptible
// distance away from the surface it sits on, in EVERY theme — rather than
// any particular colour value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { themeTokens, hoverBg, hoverInk, isDarkSurface, mixHex, normHex, withA, HOVER_ALPHA } = sandbox.window;

const THEMES = ['paper', 'flat', 'terminal'];

/* ---------------- colour plumbing ---------------- */

const channels = (hex) => {
  const h = normHex(hex);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
// Parse the "rgba(r,g,b,a)" strings hoverBg returns.
const parseRgba = (s) => {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(s);
  assert.ok(m, `not an rgba() string: ${s}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
};
// Composite a translucent overlay onto an opaque background.
const composite = (rgba, bgHex) => {
  const bg = channels(bgHex);
  return [rgba.r, rgba.g, rgba.b].map((v, i) => rgba.a * v + (1 - rgba.a) * bg[i]);
};
// Straight RGB distance: crude, but it is exactly the "can you see it?"
// question this bug is about, and it needs no colour-science dependency.
const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

test('normHex expands shorthand and tolerates a missing #', () => {
  assert.equal(normHex('#222'), '222222');
  assert.equal(normHex('222'), '222222');
  assert.equal(normHex('#a1b2c3'), 'a1b2c3');
});

test('withA survives shorthand hex (note ink is "#222")', () => {
  // The old withA sliced blindly and produced rgba(34,2,NaN,…) here, which
  // browsers drop on the floor — the affected colour simply never painted.
  assert.equal(withA('#222', 0.5), 'rgba(34,34,34,0.5)');
  assert.equal(withA('#b8621b', 0.2), 'rgba(184,98,27,0.2)');
});

test('mixHex interpolates and clamps to whole channels', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#222', '#ffffff', 0), '#222222');
});

test('isDarkSurface separates the light panels from the terminal one', () => {
  assert.equal(isDarkSurface(themeTokens('paper').panelBg), false);
  assert.equal(isDarkSurface(themeTokens('flat').panelBg), false);
  assert.equal(isDarkSurface(themeTokens('terminal').panelBg), true);
});

/* ---------------- the property that fixes the issue ---------------- */

for (const theme of THEMES) {
  test(`hover on the ${theme} panel is clearly visible against the resting panel`, () => {
    const T = themeTokens(theme);
    const rest = channels(T.panelBg);
    const hover = composite(parseRgba(hoverBg(T)), T.panelBg);
    // The old shared rgba(0,0,0,.05) scored 2 on terminal and ~22 on the
    // light themes; 45 is comfortably above "did something just change?"
    // while staying far from a garish inversion.
    assert.ok(distance(rest, hover) > 45,
      `${theme}: hover ${hover.map(Math.round)} is only ${distance(rest, hover).toFixed(1)} away from ${rest}`);
  });

  test(`hover on the ${theme} panel moves away from the panel, not into it`, () => {
    const T = themeTokens(theme);
    const rest = luma(channels(T.panelBg));
    const hover = luma(composite(parseRgba(hoverBg(T)), T.panelBg));
    // Dark panel → lighter hover; light panel → darker hover. Getting this
    // backwards is what made the terminal hover invisible.
    if (isDarkSurface(T.panelBg)) assert.ok(hover > rest + 0.05, `terminal hover must be lighter (${hover} vs ${rest})`);
    else assert.ok(hover < rest - 0.05, `${theme} hover must be darker (${hover} vs ${rest})`);
  });

  test(`hover on ${theme} keeps the theme's own accent character`, () => {
    const T = themeTokens(theme);
    // The overlay ink is the accent pulled halfway to black/white, so it
    // must not be a neutral grey: the channel spread survives the mix.
    const ink = channels(hoverInk(T));
    const spread = Math.max(...ink) - Math.min(...ink);
    assert.ok(spread > 12, `${theme}: hover ink ${hoverInk(T)} lost the accent hue`);
  });

  test(`hover on ${theme} stays translucent so it composites over any surface`, () => {
    const { a } = parseRgba(hoverBg(themeTokens(theme)));
    assert.equal(a, HOVER_ALPHA);
    assert.ok(a > 0 && a < 1);
  });
}

test('hoverBg takes a caller-supplied alpha', () => {
  const T = themeTokens('flat');
  assert.equal(parseRgba(hoverBg(T, 0.07)).a, 0.07);
  // Same ink, weaker paint — used for recessed tracks (the Segmented control).
  const strong = parseRgba(hoverBg(T));
  const weak = parseRgba(hoverBg(T, 0.07));
  assert.deepEqual([strong.r, strong.g, strong.b], [weak.r, weak.g, weak.b]);
});
