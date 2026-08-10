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
// mdToHtml needs the vendored markdown-it UMD build on the sandbox global,
// exactly like the <script> tag in index.html provides it in the browser.
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(code, sandbox);
const { editListOnEnter, editListOnTab, mdToHtml } = sandbox.window;

// Apply a {start,end,text,caret} edit descriptor to a string, the same way the
// textarea handler will via execCommand. Returns the resulting value + caret.
function applyEdit(value, edit) {
  return { value: value.slice(0, edit.start) + edit.text + value.slice(edit.end), caret: edit.caret };
}

/* ---------------- mdToHtml: nested lists ---------------- */

test('mdToHtml renders a flat bullet list', () => {
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

/* -------- editListOnEnter: ordered lists (editor parity with renderer) -------- */

test('Enter continues a "1." item and increments the number', () => {
  const v = '1. foo';
  const r = applyEdit(v, editListOnEnter(v, 6, 6, false));
  assert.equal(r.value, '1. foo\n2. ');
  assert.equal(r.caret, 10);
});

test('Enter continues a "1)" item with the same delimiter', () => {
  const v = '1) foo';
  const r = applyEdit(v, editListOnEnter(v, 6, 6, false));
  assert.equal(r.value, '1) foo\n2) ');
  assert.equal(r.caret, 10);
});

test('Enter after item 9 rolls to 10', () => {
  const v = '9. foo';
  const r = applyEdit(v, editListOnEnter(v, 6, 6, false));
  assert.equal(r.value, '9. foo\n10. ');
});

test('Enter preserves indentation when continuing a numbered sub-item', () => {
  const v = '  2. foo';
  const r = applyEdit(v, editListOnEnter(v, 8, 8, false));
  assert.equal(r.value, '  2. foo\n  3. ');
});

test('Enter on an empty numbered item removes the marker and exits the list', () => {
  const v = '2. ';
  const r = applyEdit(v, editListOnEnter(v, 3, 3, false));
  assert.equal(r.value, '');
  assert.equal(r.caret, 0);
});

test('Enter with caret inside a numbered marker returns null', () => {
  assert.equal(editListOnEnter('1. foo', 2, 2, false), null);
});

/* -------- editListOnEnter: blockquotes (editor parity with renderer) -------- */

test('Enter continues a "> " blockquote line', () => {
  const v = '> foo';
  const r = applyEdit(v, editListOnEnter(v, 5, 5, false));
  assert.equal(r.value, '> foo\n> ');
  assert.equal(r.caret, 8);
});

test('Enter on an empty blockquote line removes the marker and exits the quote', () => {
  const v = '> ';
  const r = applyEdit(v, editListOnEnter(v, 2, 2, false));
  assert.equal(r.value, '');
  assert.equal(r.caret, 0);
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

test('Tab indents a numbered item by 3 spaces and renumbers it to 1 (opens a sublist)', () => {
  const v = '1. one\n2. foo';
  const r = applyEdit(v, editListOnTab(v, 13, 13, false));
  assert.equal(r.value, '1. one\n   1. foo');
  assert.equal(r.caret, 16);
});

test('Tab keeps the typed number when the previous line already holds a sublist item', () => {
  const v = '1. one\n   1. sub\n3. next';
  const r = applyEdit(v, editListOnTab(v, 24, 24, false));
  assert.equal(r.value, '1. one\n   1. sub\n   3. next');
  assert.equal(r.caret, 27);
});

test('Shift+Tab outdents a numbered-list line by 3 spaces', () => {
  const v = '   1. foo';
  const r = applyEdit(v, editListOnTab(v, 9, 9, true));
  assert.equal(r.value, '1. foo');
  assert.equal(r.caret, 6);
});

test('a Tab-indented numbered item renders as a NESTED list, not a flat sibling', () => {
  const html = mdToHtml('1. one\n   1. sub\n3. two');
  assert.match(html, /<ol[^>]*>.*<ol[^>]*>.*sub.*<\/ol>.*<\/ol>/s);
});

test('Tab on a blockquote line returns null (4+ spaces would make it a code block)', () => {
  assert.equal(editListOnTab('> quote', 7, 7, false), null);
});

/* ---------------- editQuoteOnPaste ---------------- */

const { editQuoteOnPaste } = sandbox.window;

test('multi-line paste inside a quote line prefixes every pasted line with "> "', () => {
  const v = '> intro ';
  const r = applyEdit(v, editQuoteOnPaste(v, 8, 8, 'one\ntwo\nthree'));
  assert.equal(r.value, '> intro one\n> two\n> three');
});

test('quote paste keeps empty pasted lines quoted so the block stays unbroken', () => {
  const v = '> q';
  const r = applyEdit(v, editQuoteOnPaste(v, 3, 3, 'a\n\nb'));
  assert.equal(r.value, '> qa\n> \n> b');
});

test('nested quote prefix is preserved on paste', () => {
  const v = '> > deep ';
  const r = applyEdit(v, editQuoteOnPaste(v, 9, 9, 'x\ny'));
  assert.equal(r.value, '> > deep x\n> > y');
});

test('single-line paste in a quote returns null (default paste)', () => {
  assert.equal(editQuoteOnPaste('> q', 3, 3, 'word'), null);
});

test('multi-line paste on a normal line returns null', () => {
  assert.equal(editQuoteOnPaste('plain', 5, 5, 'a\nb'), null);
});
