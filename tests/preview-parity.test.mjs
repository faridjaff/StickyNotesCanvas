import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* Issue #26 — "Make preview identical to note editing".
 *
 * The editing textarea renders the raw body with pre-wrap semantics: every
 * newline is a line, every blank line is an empty line, and runs of spaces
 * are preserved. The rendered preview (mdToHtml output + .md-body CSS) must
 * occupy the same lines. These tests pin down both halves of that contract:
 *
 *   1. mdToHtml keeps whitespace intact in its output text and emits an
 *      explicit empty paragraph for every blank source line.
 *   2. The .md-body CSS in app.jsx keeps pre-wrap + zero block margins so
 *      the browser neither collapses those spaces nor adds vertical rhythm
 *      the textarea doesn't have.
 *
 * If the markdown converter is ever swapped out (e.g. for markdown-it), the
 * replacement must keep this behavior for the preview to stay identical to
 * edit mode.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
// The converter is markdown-it now; evaluate the vendored UMD build first so
// the sandbox has the `markdownit` global, exactly like the <script> tag in
// index.html does in the browser (same pattern as markdown.test.mjs).
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(code, sandbox);
const { mdToHtml } = sandbox.window;

const BLANK = '<p dir="auto"><br></p>';

/* ---------------- mdToHtml: horizontal whitespace ---------------- */

test('runs of spaces inside a line survive conversion verbatim', () => {
  assert.equal(mdToHtml('a    b'), '<p dir="auto">a    b</p>');
});

test('leading spaces on a plain line survive conversion', () => {
  assert.equal(mdToHtml('  indented line'), '<p dir="auto">  indented line</p>');
});

test('trailing spaces on a line survive conversion', () => {
  assert.equal(mdToHtml('ends with spaces   '), '<p dir="auto">ends with spaces   </p>');
});

test('space runs survive inside emphasis and list items', () => {
  assert.equal(mdToHtml('- item  with   gaps'),
    '<ul dir="auto"><li dir="auto">item  with   gaps</li></ul>');
  assert.equal(mdToHtml('**bold  gap**'), '<p dir="auto"><strong>bold  gap</strong></p>');
});

/* ---------------- mdToHtml: vertical whitespace ---------------- */

test('adjacent lines stay adjacent lines (one line each)', () => {
  // Same user-visible lines as the old one-<p>-per-line renderer: with
  // .md-body p { margin: 0 } a <br> inside one paragraph and two stacked
  // paragraphs paint identically. markdown-it (breaks: true) uses the <br>
  // form — per-line paragraphs can't exist under a CommonMark parser without
  // breaking multi-line constructs (lists, tables, fences).
  assert.equal(mdToHtml('line one\nline two'),
    '<p dir="auto">line one<br>line two</p>');
});

test('a blank line renders as exactly one empty line', () => {
  assert.equal(mdToHtml('a\n\nb'), `<p dir="auto">a</p>${BLANK}<p dir="auto">b</p>`);
});

test('N consecutive blank lines render as N empty lines', () => {
  assert.equal(mdToHtml('a\n\n\n\nb'),
    `<p dir="auto">a</p>${BLANK.repeat(3)}<p dir="auto">b</p>`);
});

test('a whitespace-only line counts as a blank line', () => {
  assert.equal(mdToHtml('a\n   \nb'), `<p dir="auto">a</p>${BLANK}<p dir="auto">b</p>`);
});

test('leading blank lines are kept', () => {
  assert.equal(mdToHtml('\na'), `${BLANK}<p dir="auto">a</p>`);
});

test('a trailing newline yields a trailing empty line (the textarea shows one)', () => {
  assert.equal(mdToHtml('a\n'), `<p dir="auto">a</p>${BLANK}`);
});

test('an empty body renders a single empty line', () => {
  assert.equal(mdToHtml(''), BLANK);
});

test('a blank line between bullets splits the list and keeps the empty line', () => {
  assert.equal(mdToHtml('- a\n\n- b'),
    `<ul dir="auto"><li dir="auto">a</li></ul>${BLANK}<ul dir="auto"><li dir="auto">b</li></ul>`);
});

test('blank lines around a heading each keep their own line', () => {
  assert.equal(mdToHtml('# head\n\nbody'),
    `<h3 dir="auto">head</h3>${BLANK}<p dir="auto">body</p>`);
});

/* ------------- .md-body CSS / edit-mode style parity guards -------------
 * The converter half above is useless if the CSS collapses the whitespace
 * again (or if edit mode re-introduces the UA textarea padding), so pin the
 * load-bearing style facts too. String-level checks are deliberate: this is
 * a zero-bundler app, so the source text IS the shipped artifact.
 */

const appSrc = fs.readFileSync(path.join(dir, '..', 'app.jsx'), 'utf8');
const componentsSrc = fs.readFileSync(path.join(dir, '..', 'components.jsx'), 'utf8');

test('.md-body preserves whitespace like a textarea (white-space: pre-wrap)', () => {
  assert.match(appSrc, /\.md-body\s*\{[^}]*white-space:\s*pre-wrap/);
});

test('.md-body wraps long words like a textarea (overflow-wrap: break-word)', () => {
  assert.match(appSrc, /\.md-body\s*\{[^}]*overflow-wrap:\s*break-word/);
});

test('.md-body paragraphs stack at line-height only (margin: 0)', () => {
  assert.match(appSrc, /\.md-body p\s*\{\s*margin:\s*0;?\s*\}/);
});

test('.md-body headings and lists add no vertical margins of their own', () => {
  for (const sel of ['h3', 'h4', 'ul', 'li']) {
    const m = appSrc.match(new RegExp(`\\.md-body ${sel}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `.md-body ${sel} rule exists`);
    assert.match(m[1], /margin:\s*0(?:;|\s|$)/, `.md-body ${sel} has margin: 0`);
  }
});

test('the body-edit textarea resets the UA padding so text does not shift', () => {
  // The textarea style object is the only place in components.jsx that sets
  // resize:'none'; it must also zero out padding (Chromium UA default: 2px).
  const m = componentsSrc.match(/resize:'none'[\s\S]{0,400}?padding:0/);
  assert.ok(m, "body textarea style includes padding:0 alongside resize:'none'");
});
