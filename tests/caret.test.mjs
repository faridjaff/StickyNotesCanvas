import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* Issue #35 — "Start edit-mode cursor at the double-clicked position".
 *
 * Double-clicking a rendered note body opens the editor; the caret used to
 * land at offset 0 whatever was clicked. The mapping that fixes it is pure
 * and lives in utils.jsx, so it can be driven here without a DOM:
 *
 *   renderedWordAt(renderedText, offset)
 *       -> which word was clicked, which occurrence of it, which line.
 *   sourceOffsetForWord(source, word, occurrence, opts)
 *       -> where that occurrence sits in the RAW markdown.
 *   sourceCaretForPreviewClick(source, renderedText, offset)
 *       -> the whole ladder, always a usable offset (0 in the worst case).
 *
 * `renderedText` is what the browser would show: these tests build it from
 * the app's own mdToHtml output with the same line rules the DOM walk uses
 * (renderedTextOf below), so the mapping is checked against real markdown-it
 * renderings and not against a hand-written idea of them.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8'), sandbox);
const { mdToHtml, markdownVisibleText, renderedWordAt, sourceCaretForPreviewClick,
  sourceOffsetForWord } = sandbox.window;

/* ---------------- test-side stand-in for the DOM walk ----------------
 * flattenPreviewText walks real nodes; this walks mdToHtml's HTML with the
 * same rules (block tags open a line, <br> breaks one unless it closes its
 * block, a <pre>'s trailing newline is the fence terminator) so the fixtures
 * below are the actual rendered text of the actual renderer. */
const LINE_TAG = /^(?:p|h[1-6]|li|pre|td|th|hr|dt|dd|div)$/;
function renderedTextOf(md) {
  const toks = mdToHtml(md).split(/(<[^>]*>)/).filter(t => t !== '');
  let text = '', started = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t[0] === '<') {
      const m = /^<(\/?)([a-zA-Z0-9]+)/.exec(t);
      if (!m) continue;
      const tag = m[2].toLowerCase();
      if (tag === 'br') {
        const next = toks[i + 1];
        if (next && next[0] === '<' && next[1] === '/') continue;
        text += '\n'; started = true; continue;
      }
      if (m[1] === '/') {
        if (tag === 'pre' && text.endsWith('\n')) text = text.slice(0, -1);
        continue;
      }
      if (LINE_TAG.test(tag)) { if (started) text += '\n'; started = true; }
      continue;
    }
    const decoded = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    if (decoded) { text += decoded; started = true; }
  }
  return text;
}

// Double-click the `nth` occurrence of `word` in the rendered preview of
// `body`; returns the caret offset the editor would open at.
function clickWord(body, word, nth = 0) {
  const rendered = renderedTextOf(body);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu');
  let m, seen = 0;
  while ((m = re.exec(rendered))) {
    if (seen++ === nth) return sourceCaretForPreviewClick(body, rendered, m.index);
  }
  throw new Error(`"${word}" #${nth} is not in the rendered preview: ${JSON.stringify(rendered)}`);
}

// The caret should land exactly on the nth source occurrence of the word.
function assertAtSourceWord(body, word, nth = 0, srcNth = nth) {
  const at = clickWord(body, word, nth);
  let idx = -1;
  for (let i = 0; i <= srcNth; i++) idx = body.indexOf(word, idx + 1);
  assert.equal(at, idx, `caret for "${word}" #${nth} should be source offset ${idx}, got ${at}`);
  return at;
}

/* ---------------- renderedWordAt: word, occurrence, line ---------------- */

test('the clicked word is the one the offset sits in', () => {
  const hit = renderedWordAt('alpha bravo charlie', 6);
  assert.equal(hit.word, 'bravo');
  assert.equal(hit.occurrence, 0);
  assert.equal(hit.total, 1);
});

test('an offset in the middle of a word still resolves the whole word', () => {
  assert.equal(renderedWordAt('alpha bravo charlie', 8).word, 'bravo');
});

test('an offset just past a word counts as that word', () => {
  assert.equal(renderedWordAt('alpha bravo', 5).word, 'alpha');
});

test('repeated words are counted, per note and per line', () => {
  const text = 'tea and tea\nmore tea';
  const second = renderedWordAt(text, 8);
  assert.equal(second.word, 'tea');
  assert.equal(second.occurrence, 1);
  assert.equal(second.total, 3);
  assert.equal(second.lineIndex, 0);
  assert.equal(second.lineOccurrence, 1);
  assert.equal(second.lineTotal, 2);
  const third = renderedWordAt(text, 17);
  assert.equal(third.occurrence, 2);
  assert.equal(third.lineIndex, 1);
  assert.equal(third.lineOccurrence, 0);
  assert.equal(third.lineTotal, 1);
  assert.equal(third.lineCount, 2);
});

test('a click on whitespace or an empty line resolves no word', () => {
  assert.equal(renderedWordAt('alpha bravo', 5 + 0).word, 'alpha'); // trailing edge
  assert.equal(renderedWordAt(' alpha', 0).word, '');
  assert.equal(renderedWordAt('a\n\nb', 2).word, '');
  assert.equal(renderedWordAt('', 0).word, '');
  assert.equal(renderedWordAt('a\n\nb', 2).lineIndex, 1);
});

test('a wildly out-of-range offset is clamped, not thrown on', () => {
  assert.equal(renderedWordAt('alpha', 999).word, 'alpha');
  assert.equal(renderedWordAt('alpha', -5).word, 'alpha');
  assert.equal(renderedWordAt(null, 3).word, '');
  assert.equal(renderedWordAt(undefined, undefined).word, '');
});

test('words are letters/digits/underscore in any script', () => {
  assert.equal(renderedWordAt('שלום עולם', 5).word, 'עולם');       // Hebrew
  assert.equal(renderedWordAt('مرحبا بالعالم', 6).word, 'بالعالم'); // Arabic
  assert.equal(renderedWordAt('snake_case here', 0).word, 'snake_case');
  assert.equal(renderedWordAt("don't", 0).word, 'don');            // apostrophe splits
});

/* ---------------- sourceOffsetForWord: the raw mapper ---------------- */

test('plain source: the Nth occurrence is found at the Nth position', () => {
  const src = 'tea and tea\nmore tea';
  assert.equal(sourceOffsetForWord(src, 'tea', 0), 0);
  assert.equal(sourceOffsetForWord(src, 'tea', 1), 8);
  assert.equal(sourceOffsetForWord(src, 'tea', 2), 17);
});

test('whole words only: a word inside a longer word is not a match', () => {
  assert.equal(sourceOffsetForWord('teapot and tea', 'tea', 0), 11);
  assert.equal(sourceOffsetForWord('teapot and tea', 'tea', 1), null);
});

test('markers are invisible to the search: the offset is inside them', () => {
  assert.equal(sourceOffsetForWord('**bold** here', 'bold', 0), 2);
  assert.equal(sourceOffsetForWord('`code` here', 'code', 0), 1);
  assert.equal(sourceOffsetForWord('_it_ and *that*', 'that', 0), 10);
  assert.equal(sourceOffsetForWord('### Heading', 'Heading', 0), 4);
  assert.equal(sourceOffsetForWord('- item one', 'item', 0), 2);
  assert.equal(sourceOffsetForWord('12. item one', 'item', 0), 4);
  assert.equal(sourceOffsetForWord('> quoted text', 'quoted', 0), 2);
});

test("a link's URL is not searchable text — only its label is", () => {
  const src = 'see [the docs](https://example.com/docs) here';
  assert.equal(sourceOffsetForWord(src, 'docs', 0), 9);   // the label, not the URL
  assert.equal(sourceOffsetForWord(src, 'docs', 1), null);
  assert.equal(sourceOffsetForWord(src, 'example', 0), null);
});

test('a link markdown-it refuses to make a link stays literal text', () => {
  // validateLink rejects javascript:, so the whole construct renders as text
  // and every part of it is clickable (mirrors mdToHtml, see markdown tests).
  const src = '[evil](javascript:alert(1))';
  assert.equal(sourceOffsetForWord(src, 'evil', 0), 1);
  assert.equal(sourceOffsetForWord(src, 'alert', 0), 18);
});

test('an image contributes no text at all', () => {
  const src = '![alt words](sticky-image://0123456789abcdef.png) caption';
  assert.equal(sourceOffsetForWord(src, 'alt', 0), null);
  assert.equal(sourceOffsetForWord(src, 'caption', 0), 50);
});

test('intraword underscores are literal, like markdown-it treats them', () => {
  assert.equal(sourceOffsetForWord('the snake_case name', 'snake_case', 0), 4);
});

test('a fenced block is searchable; its fence lines are not', () => {
  const src = 'before\n```js\nconst answer = 42\n```\nafter';
  assert.equal(sourceOffsetForWord(src, 'answer', 0), 19);
  assert.equal(sourceOffsetForWord(src, 'js', 0), null);
});

test('an escaped marker is a literal character, and shifts nothing', () => {
  const src = 'a \\*not emphasis\\* here';
  assert.equal(sourceOffsetForWord(src, 'not', 0), 4);
  assert.equal(sourceOffsetForWord(src, 'here', 0), 19);
});

test('table cells are text; the delimiter row is not', () => {
  const src = '| head | other |\n| --- | --- |\n| cell | last |';
  assert.equal(sourceOffsetForWord(src, 'head', 0), 2);
  assert.equal(sourceOffsetForWord(src, 'cell', 0), 33);
});

test('unicode and RTL words map like any other', () => {
  const src = 'שלום **עולם**\nעולם שוב';
  assert.equal(sourceOffsetForWord(src, 'עולם', 0), 7);
  assert.equal(sourceOffsetForWord(src, 'עולם', 1), 14);
  const emoji = 'wave 👋 hello 👋 hello';
  assert.equal(sourceOffsetForWord(emoji, 'hello', 1), 17);
});

test('no word, no source, no occurrence: null, never a throw', () => {
  assert.equal(sourceOffsetForWord('', 'x', 0), null);
  assert.equal(sourceOffsetForWord('some text', '', 0), null);
  assert.equal(sourceOffsetForWord('some text', 'text', 9), null);
  assert.equal(sourceOffsetForWord('some text', 'nope', 0), null);
  assert.equal(sourceOffsetForWord('some text', 'text', -1), null);
});

test('the total-count guard refuses a match the preview disagrees with', () => {
  // The preview says it shows "tea" three times; the source only explains
  // two. Something is being rendered that this projection cannot see, so
  // the Nth-occurrence argument no longer holds — refuse rather than guess.
  const src = 'tea and tea';
  assert.equal(sourceOffsetForWord(src, 'tea', 1, { total: 2 }), 8);
  assert.equal(sourceOffsetForWord(src, 'tea', 1, { total: 3 }), null);
});

test('a disagreeing note still resolves the word inside the clicked line', () => {
  // total is wrong (a mermaid diagram elsewhere adds a "tea" the source has
  // no offset for), but the clicked line itself is intact.
  const src = 'first tea line\nsecond tea line';
  const at = sourceOffsetForWord(src, 'tea', 9, {
    total: 99, line: 'second tea line', lineIndex: 1, lineCount: 2,
    lineOccurrence: 0, lineTotal: 1,
  });
  assert.equal(at, 22);
});

/* ---------------- sourceCaretForPreviewClick: end to end ---------------- */

test('a word in the middle of a plain note', () => {
  const body = 'alpha bravo charlie delta\necho foxtrot golf hotel\nindia juliet kilo lima';
  assertAtSourceWord(body, 'kilo');
  assertAtSourceWord(body, 'echo');
  assert.equal(clickWord(body, 'alpha'), 0);   // the first word still means 0
});

test('the same word several times maps to the matching occurrence', () => {
  const body = 'tea and tea\nmore tea please';
  assert.equal(clickWord(body, 'tea', 0), 0);
  assert.equal(clickWord(body, 'tea', 1), 8);
  assert.equal(clickWord(body, 'tea', 2), 17);
});

test('a repeated word that is emphasised in only some places', () => {
  const body = 'note **note** `note` [note](https://n.example)';
  assert.equal(clickWord(body, 'note', 0), 0);
  assert.equal(clickWord(body, 'note', 1), 7);    // inside **…**
  assert.equal(clickWord(body, 'note', 2), 15);   // inside `…`
  assert.equal(clickWord(body, 'note', 3), 22);   // the link label
});

test('words inside bold, code and links', () => {
  assertAtSourceWord('he said **hello** loudly', 'hello');
  assertAtSourceWord('run `npm test` now', 'test');
  assertAtSourceWord('see [the docs](https://example.com/docs) here', 'docs');
  assertAtSourceWord('***very*** important', 'very');
  assertAtSourceWord('a ~~struck~~ word', 'struck');
});

test('headings and list items', () => {
  const body = '### Alpha\n#### Beta\n\n1. one\n   1. sub\n2. two\n\n- bullet here';
  assertAtSourceWord(body, 'Alpha');
  assertAtSourceWord(body, 'Beta');
  assertAtSourceWord(body, 'sub');
  assertAtSourceWord(body, 'two');
  assertAtSourceWord(body, 'bullet');
});

test('blockquotes, tables and fenced code', () => {
  const body = '> quoted words\n\n| a | bee |\n| --- | --- |\n| cee | dee |\n\n```js\nconst answer = 42\n```';
  assertAtSourceWord(body, 'quoted');
  assertAtSourceWord(body, 'bee');
  assertAtSourceWord(body, 'dee');
  assertAtSourceWord(body, 'answer');
});

test('blank lines and indentation do not shift the mapping', () => {
  const body = 'first\n\n\n    deeply indented\n\n  two spaces\n\nlast';
  assertAtSourceWord(body, 'indented');
  assertAtSourceWord(body, 'two');
  assertAtSourceWord(body, 'last');
});

test('RTL and mixed-direction bodies', () => {
  const body = 'שלום עולם\n\n**מה** שלומך עולם\n- פריט ראשון';
  assertAtSourceWord(body, 'עולם', 0);
  assertAtSourceWord(body, 'עולם', 1);
  assertAtSourceWord(body, 'מה');
  assertAtSourceWord(body, 'ראשון');
  const mixed = 'הערה about **React** hooks\nעוד hooks כאן';
  assertAtSourceWord(mixed, 'React');
  assertAtSourceWord(mixed, 'hooks', 1);
});

test('a bare URL that only linkify turns into a link', () => {
  const body = 'Visit www.example.com now\nand example again';
  // linkify wraps it in an <a>, but the visible text is the source text.
  assertAtSourceWord(body, 'www');
  assertAtSourceWord(body, 'now');
  assertAtSourceWord(body, 'again');
});

test('the empty note never throws and always gives 0', () => {
  assert.equal(sourceCaretForPreviewClick('', '', 0), 0);
  assert.equal(sourceCaretForPreviewClick('', 'stale', 3), 0);
  assert.equal(sourceCaretForPreviewClick(null, null, null), 0);
  assert.equal(sourceCaretForPreviewClick(undefined, undefined, 5), 0);
  assert.equal(sourceCaretForPreviewClick('  ', '  ', 1), 0);
});

test('a click on a blank line lands on that blank line, not on 0', () => {
  const body = 'first line\n\nthird line';
  const rendered = renderedTextOf(body);
  assert.equal(rendered, 'first line\n\nthird line');
  assert.equal(sourceCaretForPreviewClick(body, rendered, 11), 11);
});

/* ---------------- the fallback ladder ---------------- */

test('a word only the RENDERER knows falls back to the clicked line', () => {
  // The rendered text carries a word the markdown cannot explain (a mermaid
  // diagram's labels are the real case: the fence is replaced by an SVG).
  // The line still lines up, so the caret goes to the start of that line —
  // never to some plausible-looking wrong word.
  const body = 'alpha bravo\ncharlie delta';
  const rendered = 'alpha bravo\ncharlie GHOST';
  assert.equal(sourceCaretForPreviewClick(body, rendered, 20), 12);
});

test('a preview the source cannot explain at all falls back to 0', () => {
  const body = 'alpha bravo\ncharlie delta';
  const rendered = 'alpha bravo\ncharlie delta\nGHOST line';
  assert.equal(sourceCaretForPreviewClick(body, rendered, 26), 0);
});

test('a mermaid diagram elsewhere in the note does not break the rest', () => {
  const body = ['intro words', '', '```mermaid', 'graph TD;', 'A-->B;', '```', '', 'closing words'].join('\n');
  // What the DOM really holds once mermaid has swapped the fence for an SVG:
  // the diagram's subtree is skipped, so those source lines have no rendered
  // line at all and every line index below them is off by three.
  const rendered = 'intro words\n\n\nclosing words';
  assert.equal(sourceCaretForPreviewClick(body, rendered, 6), body.indexOf('words'));
  assert.equal(sourceCaretForPreviewClick(body, rendered, 22), body.indexOf('words', 20));
});

test('the caret is never past the end of the body', () => {
  const body = 'short';
  assert.ok(sourceCaretForPreviewClick(body, 'short', 0) <= body.length);
  assert.ok(sourceCaretForPreviewClick(body, 'short text that is longer', 12) <= body.length);
});

/* ---------------- the projection itself ---------------- */

test('the projection reproduces the rendered text of real notes', () => {
  // If these ever drift apart the occurrence counts stop agreeing and the
  // feature quietly degrades to the line fallback, so pin them together.
  const bodies = [
    'alpha bravo charlie delta\necho foxtrot golf hotel\nindia juliet kilo lima',
    '### Alpha\n#### Beta\n\n1. one\n   1. sub\n2. two\n\n> quoted\n\n| a | b |\n| --- | --- |\n| c | d |',
    "# Weekend run\n- **Sourdough** from Arnaud's\n- _olive oil_ — the green one\n- Tomatoes (vine)",
    '## Build flags\n`CONFIG_PREEMPT_RT=y`\n\n- check scheduler patch\n- rerun `make menuconfig`',
    '**Yday:** fixed dnd bug\n**Today:** review PR #4412\n**Blockers:** waiting on infra',
    'a \\*escaped\\* thing\n\n---\n\nafter the rule',
    '![](sticky-image://0123456789abcdef.png)\ncaption word',
    '[evil](javascript:alert(1))\nVisit www.example.com now',
  ];
  for (const body of bodies) {
    assert.equal(markdownVisibleText(body).text, renderedTextOf(body),
      `projection drifted from the render for: ${JSON.stringify(body)}`);
  }
});

test('every character of the projection maps back into the source', () => {
  const body = '### Head\n- **bold** `code` [label](https://x.example)\n\n> quote\n\n```\nfenced\n```';
  const { text, map } = markdownVisibleText(body);
  assert.equal(text.length, map.length);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { assert.equal(map[i], -1); continue; }
    assert.equal(body[map[i]], text[i], `projection char ${i} (${text[i]}) points at ${map[i]}`);
  }
});

test('every rendered word of a rich note round-trips to its own source text', () => {
  const body = ['### Alpha', '#### Beta', '', '1. one', '   1. sub', '2. two', '',
    '> quoted', '', '| a | b |', '| --- | --- |', '| c | d |', '', '```js',
    "console.log('hi')", '```', '', '[evil](javascript:alert(1))',
    'Visit www.example.com now'].join('\n');
  const rendered = renderedTextOf(body);
  const words = /[\p{L}\p{N}_]+/gu;
  let m, checked = 0;
  while ((m = words.exec(rendered))) {
    const at = sourceCaretForPreviewClick(body, rendered, m.index);
    assert.equal(body.slice(at, at + m[0].length), m[0],
      `clicking "${m[0]}" landed on ${JSON.stringify(body.slice(at, at + 12))}`);
    checked++;
  }
  assert.ok(checked > 20, `expected to check the whole note, only saw ${checked} words`);
});
