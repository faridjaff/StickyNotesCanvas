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
const { mdToHtml } = sandbox.window;

/* ---------------- mdToHtml: inline code spans (issue #12) ---------------- */

test('underscores inside a code span are not italicized', () => {
  assert.equal(mdToHtml('`_code_expression`'),
    '<p dir="auto"><code>_code_expression</code></p>');
});

test('the seed-note build flag keeps its underscores verbatim', () => {
  assert.equal(mdToHtml('`CONFIG_PREEMPT_RT=y`'),
    '<p dir="auto"><code>CONFIG_PREEMPT_RT=y</code></p>');
});

test('asterisks inside a code span are not emphasized', () => {
  assert.equal(mdToHtml('`a * b * c`'),
    '<p dir="auto"><code>a * b * c</code></p>');
});

test('double asterisks inside a code span are not bolded', () => {
  assert.equal(mdToHtml('`x ** y ** z`'),
    '<p dir="auto"><code>x ** y ** z</code></p>');
});

test('emphasis still applies outside code spans on the same line', () => {
  assert.equal(mdToHtml('run `make_config` then _reboot_'),
    '<p dir="auto">run <code>make_config</code> then <em>reboot</em></p>');
});

test('bold and italic markers still work with no code span present', () => {
  assert.equal(mdToHtml('**bold** and _italic_ and *starred*'),
    '<p dir="auto"><strong>bold</strong> and <em>italic</em> and <em>starred</em></p>');
});

test('HTML inside a code span stays escaped', () => {
  assert.equal(mdToHtml('`<div>&</div>`'),
    '<p dir="auto"><code>&lt;div&gt;&amp;&lt;/div&gt;</code></p>');
});

test('code spans inside list items keep their underscores', () => {
  assert.equal(mdToHtml('- rerun `make menu_config`'),
    '<ul dir="auto"><li dir="auto">rerun <code>make menu_config</code></li></ul>');
});

/* ------------- emphasis flanking (CommonMark-aligned behavior) -------------
 * Expected outputs below were checked against the reference CommonMark
 * parser: intraword `_` is inert, space-padded `*`/`**` is inert.
 */

test('intraword underscores stay literal (snake_case)', () => {
  assert.equal(mdToHtml('snake_case_name'),
    '<p dir="auto">snake_case_name</p>');
});

test('bare identifier with underscores stays literal even without backticks', () => {
  assert.equal(mdToHtml('CONFIG_PREEMPT_RT=y'),
    '<p dir="auto">CONFIG_PREEMPT_RT=y</p>');
});

test('underscores in separate words do not pair up across the gap', () => {
  assert.equal(mdToHtml('foo_bar and baz_qux'),
    '<p dir="auto">foo_bar and baz_qux</p>');
});

test('word-edge underscore emphasis still works', () => {
  assert.equal(mdToHtml('say _hi_ now'),
    '<p dir="auto">say <em>hi</em> now</p>');
});

test('underscore emphasis works against punctuation boundaries', () => {
  assert.equal(mdToHtml('(_parenthesized_)'),
    '<p dir="auto">(<em>parenthesized</em>)</p>');
});

test('an intraword underscore is kept inside the emphasized span', () => {
  assert.equal(mdToHtml('_foo_bar_'),
    '<p dir="auto"><em>foo_bar</em></p>');
});

test('double-underscore renders strong', () => {
  assert.equal(mdToHtml('__bold underscore__'),
    '<p dir="auto"><strong>bold underscore</strong></p>');
});

test('intraword asterisk emphasis is allowed (per CommonMark)', () => {
  assert.equal(mdToHtml('foo*bar*baz'),
    '<p dir="auto">foo<em>bar</em>baz</p>');
});

test('space-padded single asterisks stay literal', () => {
  assert.equal(mdToHtml('a * b * c'),
    '<p dir="auto">a * b * c</p>');
});

test('space-padded double asterisks stay literal', () => {
  assert.equal(mdToHtml('x ** y ** z'),
    '<p dir="auto">x ** y ** z</p>');
});

test('multiplication in prose is not eaten as emphasis', () => {
  assert.equal(mdToHtml('2 * 3 = 6 and 4 * 5 = 20'),
    '<p dir="auto">2 * 3 = 6 and 4 * 5 = 20</p>');
});

test('em nested inside strong renders both', () => {
  assert.equal(mdToHtml('**bold *nested* phrase**'),
    '<p dir="auto"><strong>bold <em>nested</em> phrase</strong></p>');
});

test('triple asterisks render em+strong', () => {
  assert.equal(mdToHtml('***both***'),
    '<p dir="auto"><em><strong>both</strong></em></p>');
});

test('backslash escapes a formatting marker', () => {
  assert.equal(mdToHtml('escaped \\_underscore\\_'),
    '<p dir="auto">escaped _underscore_</p>');
});

test('backslash inside a code span stays literal (no escape processing)', () => {
  assert.equal(mdToHtml('`\\_`'),
    '<p dir="auto"><code>\\_</code></p>');
});

test('code spans, intraword underscores, and real emphasis coexist', () => {
  assert.equal(mdToHtml('compare `a_b` with c_d and _real_'),
    '<p dir="auto">compare <code>a_b</code> with c_d and <em>real</em></p>');
});

/* ---------------- web links ---------------- */

test('[text](url) renders an anchor with data-weblink', () => {
  assert.equal(mdToHtml('[docs](https://example.com/guide)'),
    '<p dir="auto"><a href="https://example.com/guide" data-weblink="https://example.com/guide">docs</a></p>');
});

test('emphasis inside link text still renders', () => {
  assert.equal(mdToHtml('[_word_](https://x.y)'),
    '<p dir="auto"><a href="https://x.y" data-weblink="https://x.y"><em>word</em></a></p>');
});

test('underscores in a link URL are never italicized', () => {
  assert.equal(mdToHtml('[k](https://x.y/a_b_c)'),
    '<p dir="auto"><a href="https://x.y/a_b_c" data-weblink="https://x.y/a_b_c">k</a></p>');
});

test('bare URLs auto-link with the URL as text', () => {
  assert.equal(mdToHtml('see https://x.y/p'),
    '<p dir="auto">see <a href="https://x.y/p" data-weblink="https://x.y/p">https://x.y/p</a></p>');
});

test('trailing punctuation stays outside a bare link', () => {
  assert.equal(mdToHtml('go to https://x.y/p.'),
    '<p dir="auto">go to <a href="https://x.y/p" data-weblink="https://x.y/p">https://x.y/p</a>.</p>');
});

test('balanced parens stay inside a bare URL, wrapping paren stays out', () => {
  assert.equal(mdToHtml('(https://en.wikipedia.org/wiki/Foo_(bar))'),
    '<p dir="auto">(<a href="https://en.wikipedia.org/wiki/Foo_(bar)" data-weblink="https://en.wikipedia.org/wiki/Foo_(bar)">https://en.wikipedia.org/wiki/Foo_(bar)</a>)</p>');
});

test('query-string ampersands survive escaping in href and text', () => {
  assert.equal(mdToHtml('https://x.y?a=1&b=2'),
    '<p dir="auto"><a href="https://x.y?a=1&amp;b=2" data-weblink="https://x.y?a=1&amp;b=2">https://x.y?a=1&amp;b=2</a></p>');
});

test('javascript: URLs never become links', () => {
  assert.equal(mdToHtml('[x](javascript:alert(1))'),
    '<p dir="auto">[x](javascript:alert(1))</p>');
});

test('a double quote in a link URL is attribute-escaped', () => {
  assert.equal(mdToHtml('[x](https://x.y/a"b)'),
    '<p dir="auto"><a href="https://x.y/a&quot;b" data-weblink="https://x.y/a&quot;b">x</a></p>');
});

test('link syntax inside a code span stays literal', () => {
  assert.equal(mdToHtml('`[x](https://x.y)`'),
    '<p dir="auto"><code>[x](https://x.y)</code></p>');
});

test('image syntax stays fully literal (unsupported)', () => {
  assert.equal(mdToHtml('![alt](https://x.y/i.png)'),
    '<p dir="auto">![alt](https://x.y/i.png)</p>');
});

test('two links on one line both render', () => {
  assert.equal(mdToHtml('[a](https://x.a) and [b](https://x.b)'),
    '<p dir="auto"><a href="https://x.a" data-weblink="https://x.a">a</a> and <a href="https://x.b" data-weblink="https://x.b">b</a></p>');
});

test('a bare URL inside emphasis stays a working link', () => {
  assert.equal(mdToHtml('_see https://x.y_'),
    '<p dir="auto"><em>see <a href="https://x.y" data-weblink="https://x.y">https://x.y</a></em></p>');
});
