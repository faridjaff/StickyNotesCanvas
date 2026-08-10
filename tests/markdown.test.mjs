import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// utils.jsx is a browser-global script (no module exports). It only touches
// `React` (top-level destructure) and `window` (final Object.assign) at load
// time, so we can load it in a vm sandbox with light shims and read the pure
// helpers back off the shimmed `window`. The renderer needs the vendored
// markdown-it UMD build evaluated first — it attaches the `markdownit`
// factory to the sandbox global, exactly like the <script> tag in index.html
// does in the browser.
const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
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

/* ------------- emphasis flanking (CommonMark behavior) -------------
 * markdown-it is a full CommonMark parser, so intraword `_` is inert and
 * space-padded `*`/`**` is inert — same expectations as before the swap.
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

test('bare URLs auto-link with the URL as text (linkify)', () => {
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

test('a scheme-less www URL linkifies with http:// prefixed', () => {
  assert.equal(mdToHtml('www.example.com'),
    '<p dir="auto"><a href="http://www.example.com" data-weblink="http://www.example.com">www.example.com</a></p>');
});

test('a double quote in a link URL is encoded, never a live attribute quote', () => {
  assert.equal(mdToHtml('[x](https://x.y/a"b)'),
    '<p dir="auto"><a href="https://x.y/a%22b" data-weblink="https://x.y/a%22b">x</a></p>');
});

test('link syntax inside a code span stays literal', () => {
  assert.equal(mdToHtml('`[x](https://x.y)`'),
    '<p dir="auto"><code>[x](https://x.y)</code></p>');
});

test('two links on one line both render', () => {
  assert.equal(mdToHtml('[a](https://x.a) and [b](https://x.b)'),
    '<p dir="auto"><a href="https://x.a" data-weblink="https://x.a">a</a> and <a href="https://x.b" data-weblink="https://x.b">b</a></p>');
});

test('a bare URL inside emphasis stays a working link', () => {
  assert.equal(mdToHtml('_see https://x.y_'),
    '<p dir="auto"><em>see <a href="https://x.y" data-weblink="https://x.y">https://x.y</a></em></p>');
});

/* -------- href restriction: only http(s) may become clickable -------- */

test('javascript: URLs never become links', () => {
  assert.equal(mdToHtml('[x](javascript:alert(1))'),
    '<p dir="auto">[x](javascript:alert(1))</p>');
});

test('data: URLs never become links', () => {
  assert.equal(mdToHtml('[d](data:text/html,<script>alert(1)</script>)'),
    '<p dir="auto">[d](data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;)</p>');
});

test('mailto: URLs never become links (http/https only)', () => {
  assert.equal(mdToHtml('[m](mailto:a@b.c)'),
    '<p dir="auto">[m](mailto:a@b.c)</p>');
});

test('ftp: URLs never become links (http/https only)', () => {
  assert.equal(mdToHtml('[f](ftp://x.y/f)'),
    '<p dir="auto">[f](ftp://x.y/f)</p>');
});

/* ---------------- XSS: raw HTML is always escaped ---------------- */

test('a script tag in a note renders as escaped text', () => {
  assert.equal(mdToHtml('<script>alert(1)</script>'),
    '<p dir="auto">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('an inline HTML img with an event handler renders as escaped text', () => {
  assert.equal(mdToHtml('<img src=x onerror=alert(1)>'),
    '<p dir="auto">&lt;img src=x onerror=alert(1)&gt;</p>');
});

/* ---------------- images ---------------- */

test('image syntax renders an <img> for http(s) sources', () => {
  assert.equal(mdToHtml('![alt](https://x.y/i.png)'),
    '<p dir="auto"><img src="https://x.y/i.png" alt="alt"></p>');
});

test('image with a javascript: source stays literal text', () => {
  assert.equal(mdToHtml('![bad](javascript:alert(1))'),
    '<p dir="auto">![bad](javascript:alert(1))</p>');
});

/* -------- headings: note-sized scale, # → h3 … #### and deeper → h6 -------- */

test('# renders h3 (note-sized top heading)', () => {
  assert.equal(mdToHtml('# One'), '<h3 dir="auto">One</h3>');
});

test('## renders h4', () => {
  assert.equal(mdToHtml('## Two'), '<h4 dir="auto">Two</h4>');
});

test('### renders h5 (issue #32)', () => {
  assert.equal(mdToHtml('### Three'), '<h5 dir="auto">Three</h5>');
});

test('#### renders h6', () => {
  assert.equal(mdToHtml('#### Four'), '<h6 dir="auto">Four</h6>');
});

test('##### and ###### clamp at h6', () => {
  assert.equal(mdToHtml('##### Five'), '<h6 dir="auto">Five</h6>');
  assert.equal(mdToHtml('###### Six'), '<h6 dir="auto">Six</h6>');
});

/* ---------------- ordered lists ---------------- */

test('a numbered list renders <ol>', () => {
  assert.equal(mdToHtml('1. a\n2. b'),
    '<ol dir="auto"><li dir="auto">a</li><li dir="auto">b</li></ol>');
});

test('a numbered list starting past 1 keeps its start number', () => {
  assert.equal(mdToHtml('3. a\n4. b'),
    '<ol start="3" dir="auto"><li dir="auto">a</li><li dir="auto">b</li></ol>');
});

/* ---------------- blockquotes ---------------- */

test('a > line renders a blockquote with dir on every block', () => {
  assert.equal(mdToHtml('> quoted _line_'),
    '<blockquote dir="auto"><p dir="auto">quoted <em>line</em></p></blockquote>');
});

/* ---------------- fenced code ---------------- */

test('a fenced block renders <pre><code> with the language as a class', () => {
  assert.equal(mdToHtml('```js\nconst x = 1;\n```'),
    '<pre dir="auto"><code class="language-js">const x = 1;\n</code></pre>');
});

test('a fenced block with no language renders a plain <pre><code>', () => {
  assert.equal(mdToHtml('```\nplain\n```'),
    '<pre dir="auto"><code>plain\n</code></pre>');
});

test('emphasis markers inside a fence stay literal', () => {
  assert.equal(mdToHtml('```\n_a_ and **b**\n```'),
    '<pre dir="auto"><code>_a_ and **b**\n</code></pre>');
});

/* ---------------- tables ---------------- */

test('a pipe table renders with dir="auto" on every block element', () => {
  assert.equal(mdToHtml('| a | b |\n| - | - |\n| 1 | 2 |'),
    '<table dir="auto"><thead dir="auto"><tr dir="auto"><th dir="auto">a</th><th dir="auto">b</th></tr></thead>' +
    '<tbody dir="auto"><tr dir="auto"><td dir="auto">1</td><td dir="auto">2</td></tr></tbody></table>');
});

/* ---------------- RTL / paragraph shape ---------------- */

test('an RTL line still gets dir="auto" so the browser right-aligns it', () => {
  assert.equal(mdToHtml('שלום עולם'), '<p dir="auto">שלום עולם</p>');
});

test('a single newline stays a visible line break (breaks: true)', () => {
  assert.equal(mdToHtml('line one\nline two'),
    '<p dir="auto">line one<br>line two</p>');
});

test('a blank line separates paragraphs and keeps its own empty line (#26)', () => {
  assert.equal(mdToHtml('para one\n\npara two'),
    '<p dir="auto">para one</p><p dir="auto"><br></p><p dir="auto">para two</p>');
});

test('empty / missing input renders one empty line, like the empty textarea', () => {
  assert.equal(mdToHtml(''), '<p dir="auto"><br></p>');
  assert.equal(mdToHtml(undefined), '<p dir="auto"><br></p>');
});
