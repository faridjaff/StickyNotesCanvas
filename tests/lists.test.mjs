import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// utils.jsx is a browser-global script (no module exports). It only touches
// `React` (top-level destructure) and `window` (final Object.assign) at load
// time, so we can load it in a vm sandbox with light shims and read the pure
// helpers back off the shimmed `window`.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { editListOnEnter, editListOnTab, mdToHtml } = sandbox.window;

// Apply a {start,end,text,caret} edit descriptor to a string, the same way the
// textarea handler will via execCommand. Returns the resulting value + caret.
function applyEdit(value, edit) {
  return { value: value.slice(0, edit.start) + edit.text + value.slice(edit.end), caret: edit.caret };
}

/* ---------------- mdToHtml: nested lists ---------------- */

test('mdToHtml renders a flat bullet list (unchanged)', () => {
  assert.equal(mdToHtml('- a\n- b'),
    '<ul dir="auto"><li dir="auto">a</li><li dir="auto">b</li></ul>');
});

test('mdToHtml nests a sub-bullet (2 spaces) inside its parent <li>', () => {
  assert.equal(mdToHtml('- a\n  - b'),
    '<ul dir="auto"><li dir="auto">a<ul dir="auto"><li dir="auto">b</li></ul></li></ul>');
});

test('mdToHtml closes the nested list when indentation returns', () => {
  assert.equal(mdToHtml('- a\n  - b\n- c'),
    '<ul dir="auto"><li dir="auto">a<ul dir="auto"><li dir="auto">b</li></ul></li><li dir="auto">c</li></ul>');
});

test('mdToHtml still continues to render * bullets', () => {
  assert.equal(mdToHtml('* a\n* b'),
    '<ul dir="auto"><li dir="auto">a</li><li dir="auto">b</li></ul>');
});

/* ---------------- editListOnEnter ---------------- */

test('Enter continues a "-" bullet with content', () => {
  const v = '- foo';
  const r = applyEdit(v, editListOnEnter(v, 5, 5, false));
  assert.equal(r.value, '- foo\n- ');
  assert.equal(r.caret, 8);
});

test('Enter continues a "*" bullet', () => {
  const v = '* foo';
  const r = applyEdit(v, editListOnEnter(v, 5, 5, false));
  assert.equal(r.value, '* foo\n* ');
  assert.equal(r.caret, 8);
});

test('Enter preserves indentation when continuing a sub-bullet', () => {
  const v = '  - foo';
  const r = applyEdit(v, editListOnEnter(v, 7, 7, false));
  assert.equal(r.value, '  - foo\n  - ');
  assert.equal(r.caret, 12);
});

test('Enter on an empty bullet removes the marker and exits the list', () => {
  const v = '- ';
  const r = applyEdit(v, editListOnEnter(v, 2, 2, false));
  assert.equal(r.value, '');
  assert.equal(r.caret, 0);
});

test('Enter on an empty bullet mid-document drops to a blank line', () => {
  const v = 'a\n- ';
  const r = applyEdit(v, editListOnEnter(v, 4, 4, false));
  assert.equal(r.value, 'a\n');
  assert.equal(r.caret, 2);
});

test('Enter on a non-bullet line returns null (default newline)', () => {
  assert.equal(editListOnEnter('hello', 5, 5, false), null);
});

test('Shift+Enter on a bullet returns null (plain newline escape hatch)', () => {
  assert.equal(editListOnEnter('- foo', 5, 5, true), null);
});

test('Enter with caret inside the marker returns null', () => {
  assert.equal(editListOnEnter('- foo', 0, 0, false), null);
});

test('Enter with a spanning selection returns null', () => {
  assert.equal(editListOnEnter('- foo', 1, 4, false), null);
});

/* ---------------- editListOnTab ---------------- */

test('Tab indents a bullet line by one level (2 spaces)', () => {
  const v = '- foo';
  const r = applyEdit(v, editListOnTab(v, 5, 5, false));
  assert.equal(r.value, '  - foo');
  assert.equal(r.caret, 7);
});

test('Tab keeps the caret at the same spot within the text', () => {
  const v = '- foo';
  const r = applyEdit(v, editListOnTab(v, 2, 2, false));
  assert.equal(r.value, '  - foo');
  assert.equal(r.caret, 4);
});

test('Shift+Tab outdents a bullet line by one level', () => {
  const v = '  - foo';
  const r = applyEdit(v, editListOnTab(v, 7, 7, true));
  assert.equal(r.value, '- foo');
  assert.equal(r.caret, 5);
});

test('Shift+Tab on a non-indented bullet returns null', () => {
  assert.equal(editListOnTab('- foo', 5, 5, true), null);
});

test('Tab on a non-bullet line returns null (default tab behavior)', () => {
  assert.equal(editListOnTab('hello', 5, 5, false), null);
});
