import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Same vm-sandbox loading pattern as lists.test.mjs / markdown.test.mjs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { editLinkOnPaste } = sandbox.window;

/* Pasting a URL over selected text wraps it Slack-style: [selection](url).
 * Every null below means "fall through to the browser's normal paste". */

test('pasting a URL over a selected word wraps it as a link', () => {
  const r = editLinkOnPaste('pick a word', 5, 6, 'https://x.y');
  // spread: the helper's object comes from the vm sandbox realm
  assert.deepEqual({ ...r }, { start: 5, end: 6, text: '[a](https://x.y)', caret: 5 + '[a](https://x.y)'.length });
});

test('clipboard whitespace is trimmed before the URL check', () => {
  const r = editLinkOnPaste('word', 0, 4, '  https://x.y\n');
  assert.equal(r.text, '[word](https://x.y)');
});

test('pasting a URL over a whole existing link swaps the URL, keeps the word', () => {
  const v = '[word](https://old.ex)';
  const r = editLinkOnPaste(v, 0, v.length, 'https://new.ex');
  assert.equal(r.text, '[word](https://new.ex)');
});

test('no selection returns null (normal paste; bare URL auto-links)', () => {
  assert.equal(editLinkOnPaste('abc', 2, 2, 'https://x.y'), null);
});

test('non-URL clipboard returns null (normal paste)', () => {
  assert.equal(editLinkOnPaste('abc', 0, 3, 'hello world'), null);
});

test('clipboard with two URLs returns null', () => {
  assert.equal(editLinkOnPaste('abc', 0, 3, 'https://a.b https://c.d'), null);
});

test('selection that is itself a URL returns null (clean URL swap)', () => {
  assert.equal(editLinkOnPaste('https://old.ex', 0, 14, 'https://new.ex'), null);
});

test('selection containing brackets (not a whole link) returns null', () => {
  assert.equal(editLinkOnPaste('foo] bar', 0, 8, 'https://x.y'), null);
});

test('partial selection of an existing link returns null', () => {
  assert.equal(editLinkOnPaste('[word](https://old.ex) tail', 0, 10, 'https://x.y'), null);
});

test('multi-line selection returns null', () => {
  assert.equal(editLinkOnPaste('a\nb', 0, 3, 'https://x.y'), null);
});
