import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as lists.test.mjs / paste.test.mjs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { hasTextSelection } = sandbox.window;

/* hasTextSelection(sel) decides whether the user has real text highlighted
 * (issue #30 — selectable note bodies). It gates three behaviors:
 *   - global Ctrl+C: yield to the native copy instead of copying notes
 *   - global Ctrl+X: don't cut (delete) notes while text is highlighted
 *   - click on a note-body link: don't open it when the click is just the
 *     mouseup at the end of a selection drag
 * It receives the Selection object so these tests can drive it with plain
 * stand-ins. */

const sel = (isCollapsed, text) => ({ isCollapsed, toString: () => text });

test('null / undefined selection → false', () => {
  assert.equal(hasTextSelection(null), false);
  assert.equal(hasTextSelection(undefined), false);
});

test('collapsed selection (plain click leaves a caret) → false', () => {
  assert.equal(hasTextSelection(sel(true, '')), false);
  // Defensive: a collapsed selection never has text, but even if the DOM
  // reported some, collapsed still means "no highlight".
  assert.equal(hasTextSelection(sel(true, 'ghost')), false);
});

test('non-collapsed selection with text → true', () => {
  assert.equal(hasTextSelection(sel(false, 'rm -rf ./dist')), true);
});

test('non-collapsed but empty toString (element-boundary selection) → false', () => {
  assert.equal(hasTextSelection(sel(false, '')), false);
});

test('whitespace-only selection still counts as a selection', () => {
  // Selecting a space or newline is a deliberate act; native copy should
  // win over the app shortcut just as it would in any web page.
  assert.equal(hasTextSelection(sel(false, ' ')), true);
  assert.equal(hasTextSelection(sel(false, '\n')), true);
});
