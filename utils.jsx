const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ---------- TWEAKABLE DEFAULTS ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "font": "Inter",
  "density": "cozy",
  "showLinks": true,
  "tilt": true,
  "hideNoteTitles": false
}/*EDITMODE-END*/;

/* ---------- COLOR PALETTES ---------- */
const NOTE_COLORS = [
  { id: "red",    name: "Red",     paper: "#f8a6a0", flat: "#ffc2bd", term: "#f8a6a0", ink: "#3a1410" },
  { id: "pink",   name: "Pink",    paper: "#f8c6d4", flat: "#ffd5e0", term: "#f8c6d4", ink: "#3a1220" },
  { id: "blue",   name: "Blue",    paper: "#b6dbf5", flat: "#cfe6f9", term: "#b6dbf5", ink: "#0f2b44" },
  { id: "green",  name: "Green",   paper: "#c7e7b8", flat: "#d5edc8", term: "#c7e7b8", ink: "#143318" },
  { id: "yellow", name: "Yellow",  paper: "#fde8a1", flat: "#fff4c2", term: "#fde8a1", ink: "#3a2f12" },
  { id: "peach",  name: "Peach",   paper: "#fbd0b5", flat: "#ffddc6", term: "#fbd0b5", ink: "#3a1a08" },
  { id: "lilac",  name: "Lilac",   paper: "#d9c6f0", flat: "#e1d2f5", term: "#d9c6f0", ink: "#2a174a" },
  { id: "white",  name: "Paper",   paper: "#fafaf4", flat: "#ffffff", term: "#fafaf4", ink: "#222" },
];

const FOLDER_HUES = ["#d97757","#5a82c9","#8a6fbf","#4c9e6b","#c4843a","#b84a6b","#3fa89a","#8a8f3d"];

/* ---------- SEED DATA ----------
 * Folder tree; each folder has its own notes with x/y positions.
 * "root" is the top-level folder.
 */
const SEED = {
  folders: {
    root:      { id: "root", name: "All notes", parent: null, hue: "#888" },
    workflow:  { id: "workflow", name: "Workflow", parent: "root", hue: FOLDER_HUES[1] },
    eng:       { id: "eng",      name: "Eng Design", parent: "root", hue: FOLDER_HUES[3] },
    home:      { id: "home",     name: "Home",       parent: "root", hue: FOLDER_HUES[0] },
    personal:  { id: "personal", name: "Personal",   parent: "root", hue: FOLDER_HUES[2] },
    sprints:   { id: "sprints",  name: "Sprints",    parent: "workflow", hue: FOLDER_HUES[4] },
    reviews:   { id: "reviews",  name: "Reviews",    parent: "workflow", hue: FOLDER_HUES[5] },
  },
  notes: [
    { id: "n1", folder: "home", title: "Groceries",
      body: "# Weekend run\n- **Sourdough** from Arnaud's\n- _olive oil_ — the green one\n- Tomatoes (vine)\n- Parmesan",
      color: "yellow", x: 60, y: 60, w: 280, h: 240, pinned: true },
    { id: "n2", folder: "home", title: "Dinner: friday",
      body: "Cacio e pepe, simple salad. Wine: the Gavi in the rack.\n\nNeed: parm, pepper, lemon.",
      color: "peach", x: 370, y: 120, w: 260, h: 180, pinned: false },
    { id: "n3", folder: "eng", title: "Kernel 6.9 notes",
      body: "## Build flags\n`CONFIG_PREEMPT_RT=y`\n\n- check scheduler patch\n- rerun `make menuconfig`\n- benchmark against 6.8",
      color: "blue", x: 60, y: 70, w: 300, h: 230, pinned: false },
    { id: "n4", folder: "workflow", title: "Standup",
      body: "**Yday:** fixed dnd bug\n**Today:** review PR #4412\n**Blockers:** waiting on infra",
      color: "green", x: 70, y: 60, w: 260, h: 180, pinned: true },
    { id: "n5", folder: "personal", title: "Reading list",
      body: "- The Pragmatic Programmer\n- Thinking in Systems — _Meadows_\n- Re-read: Unix Philosophy",
      color: "lilac", x: 80, y: 80, w: 270, h: 200, pinned: false },
    { id: "n6", folder: "home", title: "Router reboot",
      body: "ssh admin@10.0.0.1\n`reboot now`\n\nCheck DHCP lease table afterwards.",
      color: "pink", x: 660, y: 110, w: 260, h: 170, pinned: false },
    { id: "n7", folder: "sprints", title: "Sprint 42 scope",
      body: "## This sprint\n- onboarding polish\n- dnd quick fix\n- dogfood search",
      color: "yellow", x: 80, y: 60, w: 280, h: 200, pinned: false },
    { id: "n8", folder: "reviews", title: "PR checklist",
      body: "- tests pass\n- no new warnings\n- **a11y** audit\n- screenshot attached",
      color: "green", x: 90, y: 80, w: 260, h: 180, pinned: false },
    { id: "n9", folder: "eng", title: "Button variants",
      body: "primary / secondary / ghost / destructive\n\nfocus ring: 2px accent, 2px offset",
      color: "blue", x: 90, y: 70, w: 280, h: 170, pinned: false },
    { id: "n10", folder: "workflow", title: "Goals Q2",
      body: "## Goals\n1. Ship sync\n2. Offline mode\n3. 1k weekly actives",
      color: "peach", x: 360, y: 80, w: 260, h: 180, pinned: false },
  ],
  links: [
    { id: "l1", from: "n1", to: "n2" },
    { id: "l2", from: "n7", to: "n4" },
    { id: "l3", from: "n9", to: "n8" },
  ],
};

/* ---------- MARKDOWN ----------
 * Rendering is markdown-it (vendor/markdown-it.min.js, UMD global
 * `markdownit`, loaded from index.html like React), tuned for sticky notes:
 *   - html:false   — raw HTML in a note is always escaped, never parsed (XSS).
 *   - linkify:true — bare URLs become links.
 *   - breaks:true  — a single newline stays a visible line break, matching
 *                    how people write notes (the old renderer emitted one
 *                    block per line).
 *   - validateLink restricts link/image targets to http(s) — plus the app's
 *     own strict sticky-image:// references (IMAGE_REF_RE below) — so
 *     javascript:, data:, file: etc. can never become clickable/fetchable.
 *   - every block-level tag carries dir="auto" so RTL lines lay out right.
 *   - headings shift down two levels (# → h3, ## → h4, ### → h5, #### and
 *     deeper → h6) so they stay note-sized.
 *   - ```mermaid fences emit <pre class="mermaid-src"> which NoteCard swaps
 *     for the rendered diagram after mount (fails soft back to the code
 *     block); other fences render <pre><code class="language-x">.
 *   - anchors carry data-weblink, which the note-body click delegate
 *     dispatches on to open links outside the app (see NoteCard).
 * Preview <-> edit parity (issue #26) is preserved across the swap — the
 * rendered preview must occupy the same lines as the raw text in the
 * editing textarea (tests/preview-parity.test.mjs is the contract):
 *   - every blank/whitespace-only source line outside a code fence becomes
 *     an explicit empty paragraph (<p dir="auto"><br></p>), one per line —
 *     markdown-it alone would collapse the whole run into one separator
 *     (markBlankLines below marks them; the sentinel paragraphs are swapped
 *     for empty ones after rendering);
 *   - leading/trailing spaces on plain paragraph lines are restored from
 *     the source (a core rule below — markdown-it trims them);
 *   - the renderer emits no pretty-print newlines between tags: .md-body is
 *     white-space:pre-wrap, so a literal newline in the HTML would render
 *     as an extra line the textarea doesn't have.
 * The instance is created lazily so this file still loads in the node test
 * sandbox even when the markdown-it vendor script isn't evaluated first.
 */
// Sentinel for "this was a blank source line" (private-use codepoint, never
// meaningful in note text; stripped from input first so it can't be forged).
const BLANK_LINE = '\uE000';
const BLANK_LINE_P = '<p dir="auto"><br></p>';

// The only non-http(s) URL shape validateLink accepts \u2014 a picture the app
// itself stored on paste (#25): content-hash filename under userData/images/,
// served by main.js over the app-private sticky-image:// protocol, embedded
// in note markdown as ![](sticky-image://<hash>.<ext>). Exact match only:
// uppercase hex, other extensions, traversal shapes, or anything smuggled
// after the filename all fail, and markdown-it then drops the whole
// link/image construct back to literal text (same path as javascript:).
// main.js (protocol handler) and storage.js (IMAGE_FILE_RE) enforce the
// same shape on the serving side.
const IMAGE_REF_RE = /^sticky-image:\/\/[0-9a-f]{16}\.(?:png|jpg|gif|webp)$/;

// Pre-pass: replace each blank (or whitespace-only) source line outside a
// code fence with a sentinel paragraph of its own, padded with real blank
// lines so markdown-it parses every one as a separate block. This is what
// keeps "N blank lines in the textarea" = "N empty lines in the preview"
// (issue #26) — and, deliberately, what makes a blank line between bullets
// split the list instead of forming one loose list.
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
function markBlankLines(src) {
  const out = [];
  let fence = null;
  for (const ln of src.split('\n')) {
    const m = ln.match(FENCE_LINE);
    if (fence) {
      // Inside a fence blank lines are code, not vertical rhythm.
      out.push(ln);
      if (m && m[1][0] === fence.marker && m[1].length >= fence.len && m[2].trim() === '') fence = null;
      continue;
    }
    if (m) { fence = { marker: m[1][0], len: m[1].length }; out.push(ln); continue; }
    if (ln.trim() === '') { out.push('', BLANK_LINE, ''); continue; }
    out.push(ln);
  }
  return out.join('\n');
}

let _md = null;
function getMarkdownIt() {
  if (_md) return _md;
  const md = markdownit({ html: false, linkify: true, breaks: true });
  // Two CommonMark rules are deliberately off, per the old-vs-new compat
  // corpus (tests/compat.test.mjs): 'reference' made "[1]: url" definition
  // lines vanish from notes written before the markdown-it swap, and
  // 'code' turned any casually 4-space/tab-indented line into a code
  // block. Fenced ``` blocks and inline [text](url) links cover both
  // needs without the surprises.
  md.disable(['reference', 'code']);
  // http(s) for the web, plus the app's own pasted-image references. Note
  // validateLink is shared by links and images, so [text](sticky-image://…)
  // also parses as an anchor — inert by design: openWebLink and the main
  // process's shell:open-external both re-check http(s) before opening.
  md.validateLink = url => /^https?:\/\//i.test(url) || IMAGE_REF_RE.test(url);
  // Restore the leading/trailing spaces markdown-it trims off plain
  // paragraph lines (issue #26: the textarea shows them, so the preview
  // must too — .md-body's pre-wrap then renders them verbatim). Runs after
  // block parsing, before inline: the inline token still carries its source
  // line span, and only paragraphs whose content is exactly the trimmed
  // source (i.e. no marker/indent was consumed — not list items, quotes or
  // lazy continuations) are restored.
  md.core.ruler.after('block', 'sticky_preserve_ws', state => {
    const lines = state.src.split('\n');
    for (let i = 1; i < state.tokens.length; i++) {
      const tok = state.tokens[i];
      if (tok.type !== 'inline' || !tok.map || state.tokens[i - 1].type !== 'paragraph_open') continue;
      const orig = lines.slice(tok.map[0], tok.map[1]).join('\n');
      if (orig !== tok.content && orig.trim() === tok.content) tok.content = orig;
    }
  });
  md.core.ruler.push('sticky_note_blocks', state => {
    for (const tok of state.tokens) {
      // Note-sized headings: shift every level down by two, clamped at h6.
      if ((tok.type === 'heading_open' || tok.type === 'heading_close') && /^h[1-6]$/.test(tok.tag)) {
        tok.tag = 'h' + Math.min(6, Number(tok.tag[1]) + 2);
      }
      // dir="auto" on every block element so RTL text lays out per-block.
      if (tok.block && (tok.type.endsWith('_open') || tok.type === 'fence' || tok.type === 'code_block' || tok.type === 'hr')) {
        tok.attrSet('dir', 'auto');
      }
    }
  });
  // No pretty-print newlines anywhere in the output: under pre-wrap they
  // would render as extra lines. Newlines inside <pre><code> content are
  // real code content and stay (renderToken output is a single tag, so
  // stripping every \n from it is safe; fence/code_block below keep their
  // content verbatim and just drop the decorative trailing \n).
  const renderToken = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (...args) => renderToken(...args).replace(/\n/g, '');
  md.renderer.rules.hardbreak = () => '<br>';
  md.renderer.rules.softbreak = () => '<br>';
  md.renderer.rules.code_block = (tokens, idx, options, env, self) =>
    `<pre${self.renderAttrs(tokens[idx])}><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>`;
  const renderLinkOpen = md.renderer.rules.link_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href');
    if (href && tokens[idx].attrGet('data-weblink') === null) {
      tokens[idx].attrSet('data-weblink', href);
    }
    return renderLinkOpen(tokens, idx, options, env, self);
  };
  md.renderer.rules.fence = (tokens, idx) => {
    const tok = tokens[idx];
    const lang = (tok.info || '').trim().split(/\s+/)[0] || '';
    const code = md.utils.escapeHtml(tok.content);
    if (lang.toLowerCase() === 'mermaid') {
      return `<pre class="mermaid-src" dir="auto"><code>${code}</code></pre>`;
    }
    const cls = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : '';
    return `<pre dir="auto"><code${cls}>${code}</code></pre>`;
  };
  _md = md;
  return _md;
}

function mdToHtml(src) {
  const marked = markBlankLines((src || '').replace(/\uE000/g, ''));
  return getMarkdownIt().render(marked)
    .split(`<p dir="auto">${BLANK_LINE}</p>`).join(BLANK_LINE_P);
}

// Mermaid renders on demand (NoteCard swaps marked fences after mount),
// never on page load; 'strict' keeps diagram-label sanitizing on.
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
}

/* ---------- DOUBLE-CLICK IN THE PREVIEW -> CARET IN THE SOURCE (issue #35)
 *
 * Double-clicking a rendered note body opens the editor; the caret used to
 * land at offset 0 no matter which word was clicked. These helpers move it
 * to that word's position in the RAW markdown.
 *
 * Screen coordinates are NOT usable for this: under the desk's zoom/rotate
 * transforms document.caretRangeFromPoint collapses to the start of the
 * line (measured — every x across a line returns offset 0). What IS
 * reliable is the selection the browser has already made by the time the
 * dblclick event fires: it holds the clicked word, and its range start
 * gives an exact (text node, offset) pair regardless of transforms.
 *
 * The mapping is therefore textual, in three pure steps:
 *   1. flattenPreviewText  — the rendered DOM as plain text, one line per
 *      visual line, plus the offset of the clicked position in it;
 *   2. renderedWordAt      — which word that offset sits in, WHICH
 *      occurrence of it (markdown never reorders text, so the Nth
 *      occurrence in the preview is the Nth in the source), and the line
 *      it lives on;
 *   3. markdownVisibleText — the source projected down to just the text
 *      markdown-it would show, with a source offset kept for every
 *      character, so a hit in the projection maps straight back.
 *
 * The projection is an approximation of markdown-it, so every step is
 * guarded by a count check and degrades instead of guessing (see
 * sourceCaretForPreviewClick for the ladder).
 */

// A "word" for this purpose: letters, digits and underscore in ANY script —
// \p{L} covers Arabic, Hebrew and CJK, so RTL notes behave like ASCII ones.
const CARET_WORD_CHAR = /[\p{L}\p{N}_]/u;
const isCaretWordChar = (ch) => typeof ch === 'string' && CARET_WORD_CHAR.test(ch);

// Every offset in `text` where `word` stands as a whole word. Rendered text
// and source projection are both counted with this one function, so "the
// Nth occurrence" means exactly the same thing on both sides.
function caretWordHits(text, word) {
  const out = [];
  if (!word) return out;
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    if (!isCaretWordChar(text[i - 1]) && !isCaretWordChar(text[i + word.length])) out.push(i);
  }
  return out;
}

// Tags that open a visual line of their own in the rendered preview.
// Containers that only frame other blocks (ul/ol/blockquote/table/thead/
// tbody/tr) are deliberately absent — their children open the lines.
const PREVIEW_LINE_TAG = /^(?:P|H[1-6]|LI|PRE|TD|TH|HR|DT|DD|DIV)$/;

// The rendered preview as plain text (one line per visual line), plus where
// the DOM position (node, nodeOffset) lands in it — or offset:-1 when that
// position isn't in the walked text (e.g. inside a mermaid diagram).
// Mirrors the browser: <br> is a line break, block elements start a line,
// an empty paragraph (a blank source line, issue #26) still costs a line.
function flattenPreviewText(root, node, nodeOffset) {
  let text = '';
  let started = false;        // has any line been opened yet
  let offset = -1;
  const walk = (parent) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        const data = child.data || '';
        if (child === node) {
          offset = text.length + Math.max(0, Math.min(Number(nodeOffset) || 0, data.length));
        }
        if (data) { text += data; started = true; }
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = (child.tagName || '').toUpperCase();
      // A rendered mermaid diagram carries none of the note's own text: its
      // labels come from the SVG, not from anything the user can point at
      // in the source. Skip the subtree entirely.
      if (tag === 'SVG' || (child.classList && child.classList.contains('mermaid-diagram'))) continue;
      if (tag === 'BR') {
        // A <br> that closes its block is layout (that's how a blank source
        // line renders: <p><br></p>), not a line of its own.
        if (child.nextSibling) { text += '\n'; started = true; }
        continue;
      }
      const opensLine = PREVIEW_LINE_TAG.test(tag);
      if (opensLine && started) text += '\n';
      if (child === node) offset = text.length;
      const before = text.length;
      walk(child);
      // <pre><code> content ends with the fence's own newline; that is the
      // block terminator, not an empty line the user could have clicked.
      if (tag === 'PRE' && text.length > before && text.endsWith('\n')) text = text.slice(0, -1);
      if (opensLine) started = true;
    }
  };
  if (root) walk(root);
  return { text, offset };
}

// Which word of the rendered text `offset` sits in, and everything needed to
// find it again in the source: its occurrence index over the whole preview,
// its occurrence index within its own line, and both totals (the totals are
// what let the source side notice it disagrees and refuse to guess).
// word:'' means the click didn't land on a word (whitespace, a blank line).
function renderedWordAt(text, offset) {
  const src = typeof text === 'string' ? text : '';
  let at = Math.max(0, Math.min(Number(offset) || 0, src.length));
  const lineStart = src.lastIndexOf('\n', at - 1) + 1;
  let lineEnd = src.indexOf('\n', at);
  if (lineEnd === -1) lineEnd = src.length;
  let lineIndex = 0;
  for (let i = src.indexOf('\n'); i !== -1 && i < lineStart; i = src.indexOf('\n', i + 1)) lineIndex++;
  let lineCount = 1;
  for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) lineCount++;
  const line = src.slice(lineStart, lineEnd);
  const hit = { word: '', occurrence: -1, total: 0,
    line, lineIndex, lineCount, lineOccurrence: -1, lineTotal: 0 };
  // A double-click anchors on the first character of the word it selected;
  // a caret resting just past a word counts as that word too.
  if (!isCaretWordChar(src[at]) && isCaretWordChar(src[at - 1])) at--;
  if (!isCaretWordChar(src[at])) return hit;
  let s = at, e = at;
  while (s > lineStart && isCaretWordChar(src[s - 1])) s--;
  while (e < lineEnd && isCaretWordChar(src[e])) e++;
  hit.word = src.slice(s, e);
  const all = caretWordHits(src, hit.word);
  hit.total = all.length;
  hit.occurrence = all.indexOf(s);
  const inLine = caretWordHits(line, hit.word);
  hit.lineTotal = inLine.length;
  hit.lineOccurrence = inLine.indexOf(s - lineStart);
  return hit;
}

const CARET_ESCAPABLE = /[\\`*_{}[\]()#+\-.!>~|]/;
const CARET_HR_LINE = /^[ \t]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const CARET_TABLE_ROW = /^[ \t]{0,3}\|.*\|[ \t]*$/;

// An inline [text](url) / ![alt](url) starting at `line[i] === '['`, with
// both the label and the target found by balanced scanning (the seed's
// "[evil](javascript:alert(1))" needs the nested parens). null = literal '['.
function caretInlineLink(line, i) {
  let depth = 0, j = i;
  for (; j < line.length; j++) {
    const ch = line[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) break; }
  }
  if (j >= line.length || line[j + 1] !== '(') return null;
  let k = j + 2, open = 1;
  for (; k < line.length; k++) {
    const ch = line[k];
    if (ch === '\\') { k++; continue; }
    if (ch === '(') open++;
    else if (ch === ')') { open--; if (!open) break; }
  }
  if (k >= line.length) return null;
  const url = line.slice(j + 2, k).trim().split(/\s+/)[0] || '';
  // Same test as md.validateLink: a rejected target is rendered as literal
  // text, brackets and URL included, so the projection must keep it too.
  const renderable = /^https?:\/\//i.test(url) || IMAGE_REF_RE.test(url);
  return renderable ? { textStart: i + 1, textEnd: j, end: k + 1 } : null;
}

// One line of inline markdown -> the characters markdown-it will actually
// show, with the source offset of each one. Markers (emphasis, code ticks,
// link syntax) drop out; their content stays where it is in the source.
function caretInlineVisible(line, base) {
  let out = '';
  const offs = [];
  const emit = (i) => { out += line[i]; offs.push(base + i); };
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\' && CARET_ESCAPABLE.test(line[i + 1] || '')) { i++; emit(i); i++; continue; }
    if (c === '`') {
      const ticks = /^`+/.exec(line.slice(i))[0];
      const close = line.indexOf(ticks, i + ticks.length);
      if (close !== -1) {
        for (let k = i + ticks.length; k < close; k++) emit(k);
        i = close + ticks.length;
        continue;
      }
      emit(i); i++; continue;                       // unmatched tick: literal
    }
    if (c === '[' || (c === '!' && line[i + 1] === '[')) {
      const link = caretInlineLink(line, c === '[' ? i : i + 1);
      if (link) {
        if (c === '!') { i = link.end; continue; }  // an image shows no text
        const inner = caretInlineVisible(line.slice(link.textStart, link.textEnd), base + link.textStart);
        out += inner.text;
        for (const o of inner.offs) offs.push(o);
        i = link.end; continue;
      }
    }
    if (c === '*') { i += /^\*+/.exec(line.slice(i))[0].length; continue; }
    if (c === '~' && line[i + 1] === '~') { i += /^~+/.exec(line.slice(i))[0].length; continue; }
    if (c === '_') {
      const run = /^_+/.exec(line.slice(i))[0];
      // markdown-it leaves intraword underscores alone (snake_case stays).
      if (isCaretWordChar(line[i - 1]) && isCaretWordChar(line[i + run.length])) {
        for (let k = 0; k < run.length; k++) emit(i + k);
      }
      i += run.length; continue;
    }
    emit(i); i++;
  }
  return { text: out, offs };
}

// The cells of a table row, as {s,e} index pairs into the line with the
// surrounding whitespace and the outer pipes already stripped.
function caretTableCells(line) {
  const cells = [];
  let s = 0;
  for (let k = 0; k <= line.length; k++) {
    if (k < line.length && !(line[k] === '|' && line[k - 1] !== '\\')) continue;
    let a = s, b = k;
    while (a < b && /[ \t]/.test(line[a])) a++;
    while (b > a && /[ \t]/.test(line[b - 1])) b--;
    cells.push({ s: a, e: b });
    s = k + 1;
  }
  if (cells.length && cells[0].s === cells[0].e) cells.shift();
  if (cells.length && cells[cells.length - 1].s === cells[cells.length - 1].e) cells.pop();
  return cells;
}

// The source projected down to the text the preview shows: `text` holds one
// visible line per rendered line, `map[i]` is the source offset of text[i]
// (-1 for the joining newlines), and `lines[]` records each visible line's
// span plus the source offset its line starts at (the fallback caret).
// Deliberately approximate — it exists to be CHECKED against the rendered
// text, not trusted blindly.
function markdownVisibleText(src) {
  const source = typeof src === 'string' ? src : '';
  let text = '';
  const map = [];
  const lines = [];
  const unit = (chunk, offs, srcStart) => {
    if (lines.length) { text += '\n'; map.push(-1); }
    const start = text.length;
    text += chunk;
    for (const o of offs) map.push(o);
    lines.push({ start, end: text.length, src: srcStart });
  };
  let at = 0;
  let fence = null;
  for (const line of source.split('\n')) {
    const base = at;
    at += line.length + 1;
    const fm = line.match(FENCE_LINE);
    if (fence) {
      // Inside a fence every line is code, shown verbatim; the closing
      // marker line itself shows nothing.
      if (fm && fm[1][0] === fence.marker && fm[1].length >= fence.len && fm[2].trim() === '') { fence = null; continue; }
      const offs = [];
      for (let k = 0; k < line.length; k++) offs.push(base + k);
      unit(line, offs, base);
      continue;
    }
    if (fm) { fence = { marker: fm[1][0], len: fm[1].length }; continue; }
    // A blank source line is an empty rendered line (issue #26), and a rule
    // is a line with no text — both keep the line numbering honest.
    if (line.trim() === '' || CARET_HR_LINE.test(line)) { unit('', [], base); continue; }
    if (CARET_TABLE_ROW.test(line)) {
      // The |---|---| delimiter row is syntax; every other row shows one
      // rendered line per cell (that is how the DOM walk sees td/th too).
      if (line.includes('-') && /^[ \t]*\|[ \t:|-]*\|[ \t]*$/.test(line)) continue;
      for (const cell of caretTableCells(line)) {
        const v = caretInlineVisible(line.slice(cell.s, cell.e), base + cell.s);
        unit(v.text, v.offs, base);
      }
      continue;
    }
    // Block markers show nothing: quote arrows, list bullets/numbers
    // (rendered from CSS counters), heading hashes.
    let rest = line, off = 0;
    const mq = /^[ \t]*(?:>[ \t]?)+/.exec(rest);
    if (mq) { off += mq[0].length; rest = rest.slice(mq[0].length); }
    const ml = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/.exec(rest);
    if (ml) { off += ml[0].length; rest = rest.slice(ml[0].length); }
    const mh = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/.exec(rest);
    if (mh) {
      off += mh[0].length;
      rest = rest.slice(mh[0].length).replace(/[ \t]+#+[ \t]*$/, '');
    }
    const v = caretInlineVisible(rest, base + off);
    unit(v.text, v.offs, base);
  }
  return { text, map, lines };
}

// Which projected line the clicked rendered line is. By text first (an exact
// match is proof, and ties break on the line number); by line number alone
// only when both sides agree on how many lines there are, which means the
// structure lines up even though this one line's text doesn't.
function caretResolveLine(proj, lineText, lineIndex, lineCount) {
  const want = (lineText || '').trim();
  const hits = [];
  for (let i = 0; i < proj.lines.length; i++) {
    const l = proj.lines[i];
    if (proj.text.slice(l.start, l.end).trim() === want) hits.push(i);
  }
  const idx = typeof lineIndex === 'number' ? lineIndex : -1;
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    if (idx < 0) return -1;
    return hits.reduce((best, i) => (Math.abs(i - idx) < Math.abs(best - idx) ? i : best), hits[0]);
  }
  if (idx >= 0 && idx < proj.lines.length && lineCount === proj.lines.length) return idx;
  return -1;
}

// Rungs 1 and 2 of the ladder, against an already-built projection.
function caretPlaceWord(proj, word, occurrence, opts) {
  if (!word || !(occurrence >= 0)) return null;
  // 1. Occurrence index over the whole note. Markdown never reorders text,
  //    so the Nth occurrence in the preview is the Nth in the source — as
  //    long as both sides count the same number of them.
  const all = caretWordHits(proj.text, word);
  if (occurrence < all.length && (typeof opts.total !== 'number' || opts.total === all.length)) {
    return proj.map[all[occurrence]];
  }
  // 2. The same question scoped to the clicked line. This survives a
  //    projection that is wrong SOMEWHERE ELSE in the note (a mermaid
  //    diagram, an exotic construct) as long as this line is right.
  const li = caretResolveLine(proj, opts.line, opts.lineIndex, opts.lineCount);
  if (li < 0 || !(opts.lineOccurrence >= 0)) return null;
  const l = proj.lines[li];
  const inLine = caretWordHits(proj.text.slice(l.start, l.end), word);
  if (opts.lineOccurrence < inLine.length
      && (typeof opts.lineTotal !== 'number' || opts.lineTotal === inLine.length)) {
    return proj.map[l.start + inLine[opts.lineOccurrence]];
  }
  return null;
}

// PURE. Where the `occurrence`-th whole-word `word` sits in `source`,
// counting only the text the preview actually shows — null when it can't be
// placed. `opts` carries the preview's own tallies, which act as guards:
// { total, line, lineIndex, lineCount, lineOccurrence, lineTotal }. Omit
// them and this is simply "the Nth occurrence of the word in the source".
function sourceOffsetForWord(source, word, occurrence, opts = {}) {
  const at = caretPlaceWord(markdownVisibleText(source), word, occurrence, opts || {});
  return typeof at === 'number' && at >= 0 ? at : null;
}

// PURE. The source offset a double-click at `renderedOffset` in the
// preview's flattened `renderedText` should put the caret at. The ladder,
// each rung checked before it is taken:
//   1. the word, by occurrence index over the whole note;
//   2. the word, by occurrence index within the clicked line;
//   3. the start of the clicked line's source line;
//   4. 0 — exactly what happened before this feature existed.
function sourceCaretForPreviewClick(source, renderedText, renderedOffset) {
  const src = typeof source === 'string' ? source : '';
  if (!src) return 0;
  const proj = markdownVisibleText(src);
  const hit = renderedWordAt(renderedText, renderedOffset);
  const at = caretPlaceWord(proj, hit.word, hit.occurrence, hit);
  if (typeof at === 'number' && at >= 0) return Math.min(at, src.length);
  const li = caretResolveLine(proj, hit.line, hit.lineIndex, hit.lineCount);
  if (li >= 0) return Math.min(proj.lines[li].src, src.length);
  return 0;
}

// One indent level for markdown bullet lists, in the note-body editor.
const LIST_INDENT = '  ';
const ORDERED_LIST_INDENT = '   ';

// Pressing Enter inside the note body: continue / exit a markdown bullet
// list ("-" / "*"), ordered list ("1." / "1)" — the next item increments),
// or blockquote ("> "). Pure: takes the textarea value + collapsed caret,
// returns a minimal edit descriptor {start, end, text, caret} to apply (the
// handler runs it through execCommand so native undo survives), or null to
// let the default newline fire.
function editListOnEnter(value, selStart, selEnd, shiftKey) {
  if (shiftKey) return null;            // Shift+Enter = plain newline escape hatch
  if (selStart !== selEnd) return null; // a spanning selection -> default
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selStart);
  if (lineEnd === -1) lineEnd = value.length;
  const m = value.slice(lineStart, lineEnd).match(/^(\s*)([-*]|\d{1,9}[.)]|>)(\s+)(.*)$/);
  if (!m) return null;                  // not a list / blockquote line
  const [, indent, marker, spaces, content] = m;
  // Caret sitting in the indent/marker (not yet in the content) -> default.
  if (selStart < lineStart + indent.length + marker.length + spaces.length) return null;
  if (content.trim() === '') {
    // Empty item: drop the marker (and its indent) — this ends the list.
    return { start: lineStart, end: lineEnd, text: '', caret: lineStart };
  }
  // Non-empty item: open a fresh item with the same indent + marker
  // (ordered markers increment: "3." continues as "4.").
  const num = marker.match(/^(\d+)([.)])$/);
  const next = num ? (Number(num[1]) + 1) + num[2] : marker;
  const text = `\n${indent}${next} `;
  return { start: selStart, end: selStart, text, caret: selStart + text.length };
}

// Pressing Tab / Shift+Tab on a bullet or ordered-list line: indent / outdent
// one level. Blockquote lines are deliberately excluded — 4+ leading spaces
// would turn "> x" into an indented code block.
// Indent width differs by marker: CommonMark nests a child list only when it
// reaches the parent item's text column — 2 for "- ", 3 for "1. " — so a
// 2-space step on an ordered line would render flat (same list, no nesting).
// Same pure-edit-descriptor contract as editListOnEnter; null = default Tab.
function editListOnTab(value, selStart, selEnd, outdent) {
  if (value.slice(selStart, selEnd).includes('\n')) return null; // multi-line selection -> default
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selStart);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);
  if (!/^\s*(?:[-*]|\d{1,9}[.)])\s+/.test(line)) return null; // only list lines indent
  const ordered = line.match(/^(\s*)(\d{1,9})([.)])\s+/);
  const step = ordered ? ORDERED_LIST_INDENT : LIST_INDENT;
  if (!outdent) {
    // Indenting an ordered item that OPENS a new sublist must also renumber
    // it to 1: a list interrupting a paragraph only counts when it starts
    // with 1. (CommonMark), so an indented "2." would render as flat text.
    // When the previous line already holds a sublist item at the target
    // indent, the typed number is kept — ordered lists renumber themselves.
    if (ordered) {
      const [, lead, num] = ordered;
      const prevEnd = lineStart - 1;
      const prevStart = prevEnd < 0 ? 0 : value.lastIndexOf('\n', prevEnd - 1) + 1;
      const prev = prevEnd < 0 ? '' : value.slice(prevStart, prevEnd);
      const sibling = new RegExp('^' + lead + step + '\\d{1,9}[.)]\\s').test(prev);
      if (!sibling) {
        const end = lineStart + lead.length + num.length;
        return { start: lineStart, end, text: lead + step + '1',
          caret: Math.max(lineStart, selStart + step.length + 1 - num.length) };
      }
    }
    return { start: lineStart, end: lineStart, text: step, caret: selStart + step.length };
  }
  const lead = line.match(/^[ \t]*/)[0];
  if (lead.length === 0) return null;           // nothing to outdent
  const remove = lead[0] === '\t' ? 1 : Math.min(step.length, lead.length);
  return { start: lineStart, end: lineStart + remove, text: '', caret: Math.max(lineStart, selStart - remove) };
}
// Pasting multi-line text while the caret sits inside a blockquote line:
// markdown quotes only lines that carry their own "> ", so a plain paste
// would silently drop every pasted line after the first out of the quote.
// Prefix each continuation line with the current line's quote prefix
// (nested "> > " included). Single-line pastes and non-quote lines return
// null — default paste. Same pure edit-descriptor contract as the others.
function editQuoteOnPaste(value, selStart, selEnd, pasted) {
  if (!pasted || !pasted.includes('\n')) return null;
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  const m = value.slice(lineStart, selStart).match(/^((?:\s*>)+ ?)/);
  if (!m) return null;
  const prefix = m[1];
  const text = pasted.replace(/\r\n?/g, '\n').split('\n')
    .map((l, i) => i === 0 ? l : prefix + l).join('\n');
  return { start: selStart, end: selEnd, text, caret: selStart + text.length };
}
// Pasting over a selection in the note body: if the clipboard is a single
// http(s) URL, wrap the selection Slack-style as [selection](url) — or, when
// the selection is exactly one [word](url) link already, swap in the new URL
// and keep the word. Same pure edit-descriptor contract as editListOnEnter;
// null means "not a link paste" — let the browser's default paste run.
// Wrapping never fires when it would emit broken markdown (selection with
// brackets or newlines) or fight an obvious intent (selection is a URL).
function editLinkOnPaste(value, selStart, selEnd, pasted) {
  if (selStart === selEnd) return null;
  const url = (pasted || '').trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const sel = value.slice(selStart, selEnd);
  const link = sel.match(/^\[([^\]]+)\]\(https?:\/\/[^\s)]+\)$/i);
  let text;
  if (link) text = `[${link[1]}](${url})`;
  else if (/^https?:\/\//i.test(sel.trim()) || /[\n\[\]]/.test(sel)) return null;
  else text = `[${sel}](${url})`;
  return { start: selStart, end: selEnd, text, caret: selStart + text.length };
}

// Open a note's web link outside the app: default browser under Electron
// (http/https re-checked in the main process), new tab in the web demo.
function openWebLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.stickyAPI && window.stickyAPI.openExternal) window.stickyAPI.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
/* Returns 'rtl' if the first strong bidi character in text is RTL, else 'ltr'. */
function firstStrongDir(text = '') {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (
      // Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic Extended-A/B
      (cp >= 0x0590 && cp <= 0x08FF) ||
      // Hebrew/Arabic Presentation Forms
      (cp >= 0xFB1D && cp <= 0xFDFF) ||
      (cp >= 0xFE70 && cp <= 0xFEFF) ||
      // Hanifi Rohingya, Yezidi, Arabic Extended-C, Old Uyghur, Chorasmian, Elymaic
      (cp >= 0x10D00 && cp <= 0x10FFF) ||
      // Mende Kikakui, Adlam, Arabic Mathematical Alphabetic Symbols
      (cp >= 0x1E800 && cp <= 0x1EFFF)
    ) return 'rtl';
    // Any other Unicode letter (Latin, Greek, Cyrillic, Armenian, CJK, Devanagari, Thai, …)
    if (/\p{L}/u.test(ch)) return 'ltr';
  }
  return 'ltr';
}
/* ---------- Pictures that arrive as a FILE (drag-and-drop, "Insert image…") ----------
 * Pasting hands the app bytes plus a mime type; a dropped or picked file
 * hands it a name that may or may not come with one. This is the renderer's
 * gate on such a file — is it a picture this app can store and render? The
 * extensions mirror storage.js's IMAGE_EXT_BY_MIME (the main process's own
 * gate, which also decides the stored file's extension); ".jpeg" is the one
 * extra spelling and stores as image/jpeg exactly like ".jpg". Keep the two
 * lists in step.
 */
const IMAGE_MIME_BY_EXT = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
};

// Canonical mime type to store `name` as, or null when it isn't a supported
// picture (an svg, a pdf, a folder, a bare name with no extension…). Pure.
// `name` may be a filename or a full path; `mime` is whatever the drop or
// the File object reported — often empty (a folder, some Wayland drops) or
// oddly cased, so a supported reported type wins and the extension is the
// fallback, never the other way round.
function imageMimeForFile(name, mime) {
  const reported = String(mime == null ? '' : mime).toLowerCase().split(';')[0].trim();
  for (const known of Object.values(IMAGE_MIME_BY_EXT)) {
    if (reported === known) return known;
  }
  const m = /\.([a-z0-9]+)$/i.exec(String(name == null ? '' : name).trim());
  return (m && IMAGE_MIME_BY_EXT[m[1].toLowerCase()]) || null;
}

/* ---------- Browser-side file helpers (used when window.stickyAPI is absent) ---------- */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function downloadJSON(filename, obj) {
  downloadBlob(filename, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
}

/* ---------- Download a note as markdown (context-menu "Download") ---------- */

// Filesystem-safe .md filename for a note: the title, or (when the title is
// blank or sanitizes away to nothing) the first non-empty body line with any
// leading heading/bullet marker dropped, or "note" as the last resort.
// Pure so it's unit-testable.
function noteDownloadFilename(note) {
  const clean = (s) => (s || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')  // fs-hostile chars (Windows superset)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/^\.+/, '')     // no dotfiles
    .replace(/[. ]+$/, '');  // Windows forbids trailing dots/spaces
  const firstLine = ((note && note.body) || '')
    .split('\n').map(l => l.trim()).find(l => l !== '') || '';
  const base = clean((note && note.title) || '')
    || clean(firstLine.replace(/^(?:#{1,6}|[-*])\s+/, ''))
    || 'note';
  return base + '.md';
}

// Markdown file content for a note: the body verbatim — note bodies ARE
// markdown. The title lives in the filename only, so pasting the file's
// contents into a new note reproduces the body exactly. Always ends in
// exactly one newline.
function noteToMarkdown(note) {
  const body = ((note && note.body) || '').replace(/\s+$/, '');
  return body + '\n';
}

// Save a single note as a .md file: native save dialog under Electron (the
// notes:export-markdown IPC), Blob anchor download in the web demo — same
// degradation pattern as openWebLink / the JSON backup helpers above.
function downloadNoteAsMarkdown(note) {
  const filename = noteDownloadFilename(note);
  const content  = noteToMarkdown(note);
  if (window.stickyAPI && window.stickyAPI.exportMarkdown) {
    window.stickyAPI.exportMarkdown({ filename, content }).catch(err => console.warn('[download]', err));
  } else {
    downloadBlob(filename, new Blob([content], { type: 'text/markdown' }));
  }
}

/* ---------- Import a markdown FILE as a note (desk menu "Import markdown file…") ----------
 * The exact inverse of the Download above, so the round trip is lossless:
 * the file's contents become the note BODY verbatim and its FILENAME becomes
 * the TITLE — which is the only place noteToMarkdown/noteDownloadFilename
 * put the title. Everything here is pure and unit-tested; the picker itself
 * lives in the main process (see notes:import-markdown), which is also where
 * the file is read and where the byte-level guards are enforced.
 */

// Filename extensions the importer strips off a title. Mirrors the picker's
// filter list in main.js — every name the dialog can return ends in one of
// these, and an unknown suffix is left alone rather than guessed at.
const MARKDOWN_FILE_EXT_RE = /\.(?:md|markdown|mdown|mkd|txt)$/i;

// Note title for an imported file: its name with the markdown extension
// dropped. Any directory part goes too, unicode is kept as-is (a title is
// not a filesystem path), whitespace runs collapse the way
// noteDownloadFilename collapses them on the way out, and a name that
// leaves nothing behind (".md", "", a path ending in a slash) falls back to
// "note" — the same last resort the download filename uses.
function markdownFileTitle(name) {
  const base = String(name == null ? '' : name).split(/[\\/]/).pop();
  return base.replace(MARKDOWN_FILE_EXT_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim() || 'note';
}

// Note body for an imported file's contents: a leading UTF-8 BOM dropped
// (Notepad and friends add one), CRLF / lone CR normalised to \n so the
// body matches what the editor produces, and trailing whitespace trimmed —
// exactly what noteToMarkdown does on the way out, which is what makes the
// download → import round trip byte-exact.
function markdownFileBody(content) {
  return String(content == null ? '' : content)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '');
}

// One picked file → { name, title, body } to make a note from, or
// { name, error } explaining why not (the app surfaces those in the paste
// error toast). `file` is { name, content } as read by the main process —
// or already { name, error } when main couldn't read it, which passes
// straight through.
function markdownFileToNote(file) {
  const f = file || {};
  const name = (typeof f.name === 'string' && f.name.trim()) ? f.name : 'file';
  if (f.error) return { name, error: String(f.error) };
  if (typeof f.content !== 'string') return { name, error: 'nothing to read' };
  if (f.content.indexOf('\u0000') !== -1) return { name, error: 'not a text file' };
  return { name, title: markdownFileTitle(name), body: markdownFileBody(f.content) };
}

// Browser fallback for the import (the web demo has no main process to open
// a native dialog): the same hidden <input type="file"> trick as
// pickJSONFile below, resolving to the shape the Electron IPC returns.
function pickMarkdownFiles() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (!files.length) { resolve([]); return; }
      Promise.all(files.map(f => f.text().then(
        content => ({ name: f.name, content }),
        err => ({ name: f.name, error: (err && err.message) || 'unreadable' }),
      ))).then(resolve, () => resolve([]));
    };
    input.click();
  });
}

function pickJSONFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch { resolve(null); }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

/* ---------- FOLDER TREE HELPERS ----------
 * Folders form a tree through each folder's `parent` field: 'root' is the
 * top level (it renders as "All notes" and is not a real folder row), any
 * other value is the id of the enclosing folder. Every helper here is
 * cycle-safe so a hand-edited or corrupt store can never hang the UI.
 */

// Repair folder parents on load: every non-root folder must point at an
// existing folder (unknown/missing/self parents fall back to 'root'), and
// parent cycles are broken by re-parenting the first offender to 'root'.
// Also guarantees the 'root' entry itself exists.
function sanitizeFolderParents(rawFolders) {
  const folders = { ...(rawFolders || {}) };
  if (!folders.root) folders.root = { id: 'root', name: 'All notes', parent: null, hue: '#888' };
  for (const f of Object.values(folders)) {
    if (f.id === 'root') continue;
    if (!f.parent || f.parent === f.id || !folders[f.parent]) {
      folders[f.id] = { ...f, parent: 'root' };
    }
  }
  for (const f of Object.values(folders)) {
    if (f.id === 'root') continue;
    const seen = new Set([f.id]);
    let cur = folders[f.id].parent;
    while (cur && cur !== 'root') {
      if (seen.has(cur)) { folders[f.id] = { ...folders[f.id], parent: 'root' }; break; }
      seen.add(cur);
      cur = folders[cur] ? folders[cur].parent : null;
    }
  }
  return folders;
}

// Every folder id in the subtree rooted at `id`, including `id` itself.
function folderSubtreeIds(folders, id) {
  const out = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const f of Object.values(folders)) {
      if (f.id !== 'root' && f.parent === cur && !out.has(f.id)) {
        out.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return out;
}

// True if folder `id` may be re-parented under `newParent` without creating
// a cycle (a folder can't move into itself or its own subtree).
function canMoveFolder(folders, id, newParent) {
  if (!newParent || id === 'root' || !folders[id]) return false;
  if (newParent !== 'root' && !folders[newParent]) return false;
  return !folderSubtreeIds(folders, id).has(newParent);
}

// Folder names from the top level down to `id`, e.g. ['Work', 'Sprints'].
// Used for breadcrumb display. Empty array for 'root' / unknown ids.
function folderPath(folders, id) {
  const names = [];
  const seen = new Set();
  let cur = id;
  while (cur && cur !== 'root' && folders[cur] && !seen.has(cur)) {
    seen.add(cur);
    names.unshift(folders[cur].name);
    cur = folders[cur].parent;
  }
  return names;
}

// DFS-flattened folder tree for list rendering: [{id, depth, hasChildren}].
// Sibling order follows `folderOrder` (stale ids ignored), with folders not
// yet in the order sorted after them alphabetically — the same contract the
// flat drawer list used before nesting existed.
function flattenFolderTree(folders, folderOrder) {
  const rank = new Map((folderOrder || []).map((id, i) => [id, i]));
  const childrenOf = (pid) => Object.values(folders)
    .filter(f => f.id !== 'root' && f.parent === pid)
    .sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  const out = [];
  const walk = (pid, depth, seen) => {
    for (const f of childrenOf(pid)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, depth, hasChildren: childrenOf(f.id).length > 0 });
      walk(f.id, depth + 1, seen);
    }
  };
  walk('root', 0, new Set());
  return out;
}

/* ---------- Persisted store (Electron-aware) ---------- */
function withDefaults(raw) {
  const src = raw || {};
  // First-paint default for the folders drawer. On mobile (narrow viewport,
  // no Electron bridge), default closed so the canvas is visible on load;
  // on desktop, default open. Once the user toggles it, that choice is
  // persisted as a boolean and this branch never re-runs for that user.
  // Matches the viewport threshold used by MobileDemoBanner.
  const defaultDrawer = (typeof window !== 'undefined'
    && !window.stickyAPI
    && window.innerWidth <= MOBILE_BANNER_MAX_WIDTH) ? false : true;
  return {
    tweaks:  src.tweaks  ?? TWEAK_DEFAULTS,
    // Sanitize on every load so pre-subfolder stores (and imported backups
    // with broken parent links) always hydrate into a valid folder tree.
    folders: sanitizeFolderParents(src.folders ?? SEED.folders),
    notes:   src.notes   ?? SEED.notes,
    links:   src.links   ?? (SEED.links || []),
    cwd:     src.cwd     ?? 'root',
    view:    src.view    ?? { x: 0, y: 0, z: 1 },
    drawer:  typeof src.drawer === 'boolean' ? src.drawer : defaultDrawer,
    folderOrder: Array.isArray(src.folderOrder) ? src.folderOrder : [],
  };
}
/* ---------- THEME TOKENS ---------- */
function themeTokens(theme) {
  if (theme === 'terminal') {
    return {
      wallpaper: 'radial-gradient(1200px 800px at 20% 10%, #1b2028 0%, #0e1116 60%, #0a0c10 100%)',
      panelBg: '#141a22', panelBorder: '#2a3340', panelText: '#cfe0d4',
      accent: '#8fd27a', muted: '#7b8a9a', hairline: '#1d2530',
      noteShadow: '0 0 0 1px #2a3340, 0 8px 22px rgba(0,0,0,.5)',
      noteRadius: '4px',
      bodyFont: '"JetBrains Mono", "IBM Plex Mono", monospace',
      folderBg: '#1a2230', folderBorder: '#2f3b4c',
    };
  }
  if (theme === 'flat') {
    return {
      wallpaper: 'linear-gradient(135deg,#e9edf2 0%, #dde3eb 100%)',
      panelBg: '#ffffff', panelBorder: '#d6dce4', panelText: '#1f2430',
      accent: '#3584e4', muted: '#6a7383', hairline: '#eaeef3',
      noteShadow: '0 1px 2px rgba(20,30,50,.06), 0 6px 20px rgba(20,30,50,.08)',
      noteRadius: '10px',
      bodyFont: 'Inter, system-ui, sans-serif',
      folderBg: '#f3f5f9', folderBorder: '#d6dce4',
    };
  }
  return {
    wallpaper: "linear-gradient(180deg,#efe8dc 0%, #e5dbc8 100%)",
    panelBg: '#fbf7ef', panelBorder: '#d8cfbc', panelText: '#2a241a',
    accent: '#b8621b', muted: '#7a6f5b', hairline: '#e6dfce',
    noteShadow: '0 2px 0 rgba(60,40,20,.05), 0 10px 28px rgba(60,40,20,.14), inset 0 0 0 1px rgba(0,0,0,.04)',
    noteRadius: '2px',
    bodyFont: 'Caveat, "Segoe Script", cursive',
    folderBg: '#f3ead7', folderBorder: '#d8cfbc',
  };
}

function uid(pre='id') { return pre + '_' + Math.random().toString(36).slice(2,8); }
function hashRot(id) { let h=0; for (let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))|0; return ((h%7)-3)*0.4; }
// True when the user has actual text highlighted (e.g. drag-selected in a
// note's preview body — issue #30). Used to keep the app from hijacking a
// selection: the global Ctrl+C/Ctrl+X note shortcuts must yield to the
// native clipboard action, and the click that ends a selection drag must
// not open the link it happens to land on. Takes the Selection object
// (window.getSelection()) as an argument so it stays pure and testable.
// A collapsed selection is just a caret from a plain click — not a
// selection. An empty toString() (e.g. a selection spanning only element
// boundaries) carries no copyable text, so it doesn't count either.
function hasTextSelection(sel) {
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}
// '#abc' / 'abc' / '#aabbcc' → 'aabbcc'. Shorthand hex has to be expanded or
// every colour helper below yields a NaN channel — note ink is '#222' for the
// white note colour, which is exactly where that used to bite.
function normHex(hex) {
  const h = String(hex).replace('#','').trim();
  return h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h;
}
function hexChannels(hex) {
  const h = normHex(hex);
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function withA(hex, a) {
  const [r,g,b] = hexChannels(hex);
  return `rgba(${r},${g},${b},${a})`;
}


/* ---------- CANVAS ZOOM ----------
 * One clamp and one anchored-zoom formula shared by every zoom path on the
 * desk: Ctrl+wheel, trackpad/touch pinch, the on-screen +/− buttons and the
 * keyboard shortcuts (issue #45). Pure, so the maths is unit-testable
 * without a DOM.
 */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

// Scale `view` by `factor` about the anchor point (ax, ay), given in
// desk-relative SCREEN coordinates. The world point currently under the
// anchor stays under the anchor, so zooming feels like it happens at the
// cursor / pinch midpoint / viewport centre rather than at the origin.
// Derivation: screen = world * z + offset, so holding
// (ax - x) / z constant across the change gives x' = ax - (ax - x) * z'/z.
// The new scale is clamped to [ZOOM_MIN, ZOOM_MAX]; at a clamp boundary the
// ratio becomes 1 and the view is returned unchanged.
function zoomViewAt(view, factor, ax, ay) {
  const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.z * factor));
  const ratio = nz / view.z;
  return { x: ax - (ax - view.x) * ratio, y: ay - (ay - view.y) * ratio, z: nz };
}

// Is this element a text-entry surface that owns its own keystrokes?
// Mirrors the activeElement gate on the global Ctrl+Z handler in app.jsx.
function isTextEntryElement(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

// Which canvas zoom does this keydown ask for — 'in', 'out', 'reset', or
// null for "not a zoom chord, leave the event alone"? (issue #45)
//
//   Ctrl/Cmd and '+' or '='   → in      (US layouts report '=' unshifted and
//                                        '+' when Shift is held; both mean
//                                        "zoom in" to everyone)
//   Ctrl/Cmd and '-' or '_'   → out
//   Ctrl/Cmd and '0'          → reset
//
// Held Alt disqualifies the chord — Ctrl+Alt is AltGr on Windows/Linux
// layouts, where it types characters rather than invoking shortcuts.
//
// `activeElement` (pass document.activeElement) and the event's own target
// are both checked: while the user is typing in a note editor, the search
// box or any other field, Ctrl+0 / Ctrl+- / Ctrl++ belong to that field.
function zoomActionForKey(e, activeElement) {
  if (!e) return null;
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (e.altKey) return null;
  if (isTextEntryElement(activeElement) || isTextEntryElement(e.target)) return null;
  switch (e.key) {
    case '+': case '=': return 'in';
    case '-': case '_': return 'out';
    case '0':           return 'reset';
    default:            return null;
  }
}

/* ---------- HOVER AFFORDANCE (issue #49) ---------- */
// Every menu, row and button used to share one hard-coded rgba(0,0,0,.05)
// hover. That darkens a light panel by a barely-there 5% and does nothing at
// all on the dark terminal panel (#141a22 → #131920: a 2/255 step, which is
// what the issue's screenshot shows — hovered and unhovered items identical).
// A hover has to move AWAY from the surface it sits on: darker on a light
// panel, lighter on a dark one. So the overlay ink is derived from the theme
// — the accent pulled halfway to black or to white depending on the panel —
// and laid over the surface at a fixed alpha. Each theme keeps its own
// character (warm on paper, blue on flat, green on terminal) and every theme
// gets a step of ~60+ in RGB distance instead of 2.
// Translucent on purpose: hover backgrounds land on note paper, the drawer's
// grain texture and panels alike, and must composite over all of them.
function isDarkSurface(hex) {
  const [r,g,b] = hexChannels(hex);
  return (0.2126*r + 0.7152*g + 0.0722*b) / 255 < 0.5;
}
function mixHex(a, b, t) {
  const A = hexChannels(a), B = hexChannels(b);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + A.map((v,i) => clamp(v + (B[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
const HOVER_ALPHA = 0.2;
// Hover background for a control sitting on a themed panel (menus, drawer
// rows, toolbar buttons). `T` is a themeTokens() object.
function hoverBg(T, alpha = HOVER_ALPHA) {
  return withA(hoverInk(T), alpha);
}
function hoverInk(T) {
  return mixHex(T.accent, isDarkSurface(T.panelBg) ? '#ffffff' : '#000000', 0.5);
}

const STICKY_CLIPBOARD_MARKER = '<!-- sticky-notes/v1 -->';

function notesToClipboardText(notes, links) {
  const human = notes.map(n => (n.title || 'Untitled') + (n.body ? '\n\n' + n.body : '')).join('\n\n---\n\n');
  // Carry any link with at least one endpoint inside the copied set.
  // Internal links (both endpoints inside) are remapped to the new ids on
  // paste; cross-boundary links carry the outside endpoint's ORIGINAL id so
  // paste can re-attach if that note still exists in the destination store.
  const ids = new Set(notes.map(n => n.id));
  const subLinks = (links || []).filter(l => ids.has(l.from) || ids.has(l.to));
  const payload = {
    notes: notes.map(n => ({
      id: n.id,  // preserved only for in-payload link endpoint mapping; remapped on paste
      title: n.title, body: n.body, color: n.color,
      w: n.w, h: n.h, pinned: !!n.pinned,
    })),
    links: subLinks.map(l => ({ from: l.from, to: l.to })),
  };
  return human + '\n\n' + STICKY_CLIPBOARD_MARKER + '\n' + JSON.stringify(payload);
}

function clipboardTextToNotes(text) {
  const i = text.indexOf(STICKY_CLIPBOARD_MARKER);
  if (i === -1) return null;
  const json = text.slice(i + STICKY_CLIPBOARD_MARKER.length).trim();
  try {
    const parsed = JSON.parse(json);
    // Bare-array form is the legacy v1 payload; wrap so callers can treat both
    // shapes the same. New form is { notes: [...], links: [...] }.
    if (Array.isArray(parsed)) return { notes: parsed, links: [] };
    if (parsed && Array.isArray(parsed.notes)) {
      return { notes: parsed.notes, links: Array.isArray(parsed.links) ? parsed.links : [] };
    }
    return null;
  } catch { return null; }
}
// Identifies WHICH announcement this text is, not which version is running:
// the note is tied to the 2.0 markdown overhaul, so it shows once and stays
// gone through 2.0.2, 2.1.0 and everything after. A future announcement
// means new text and a new id here — never a silent repeat of this one.
const WHATS_NEW_ID = '2.0-markdown';

// One-time "what's new" note: returns the InfoDialog payload the first time
// a user who already had notes lands on 2.x, null otherwise.
// An UNSEEN announcement id covers users upgrading from 1.8.0 (which
// recorded nothing) and from the 2.0.0 build whose note never fired. Only
// isFirstRun (no notes.json before launch, reported by the main process)
// marks a genuine new install, which stays quiet — as does every later
// release, since the id is already recorded by then. The web demo has no
// version identity (no stickyAPI), so callers never invoke it there.
function whatsNewInfo(current, seenId, isFirstRun) {
  if (!current || isFirstRun || seenId === WHATS_NEW_ID) return null;
  return {
    title: 'What’s new',
    message: 'Your notes now speak full markdown',
    detail: [
      '• Numbered lists, quotes, tables, and code blocks render for real',
      '• Mermaid diagrams: a ```mermaid code fence becomes a flowchart',
      '• Paste screenshots and pictures straight into a note',
      '• Select and copy note text without entering edit mode',
      '• Paste any text onto the canvas to make a note of it',
      '• Download any note as a markdown file',
      '• Pinch-zoom and smoother touch dragging everywhere',
      '',
      'Your existing notes are untouched — some may simply render richer than before.',
    ].join('\n'),
  };
}

// Canvas-level paste dispatch (issue #29): what should Ctrl+V over the desk
// do with this clipboard text?
//   'payload' — parseable sticky-notes payload with notes: import them
//   'error'   — the marker is there but the payload is unusable (broken or
//               empty JSON): tell the user, a garbage note would be worse
//   'note'    — any other non-empty text: create a note from it
//   'ignore'  — empty clipboard, no intent
function canvasPasteAction(text) {
  if (!text) return 'ignore';
  const payload = clipboardTextToNotes(text);
  if (payload) return payload.notes.length ? 'payload' : 'error';
  return text.includes(STICKY_CLIPBOARD_MARKER) ? 'error' : 'note';
}

function cmpSemver(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function downloadUrlForPlatform(version) {
  const p = (navigator.platform || '').toLowerCase();
  if (p.includes('linux')) {
    // The .deb filename matches package.json's "name" field, which became
    // sticky-notes-canvas in v1.3.0 (renamed to align with the Snap Store
    // identifier). Older versions used "sticky-notes" but the update check
    // only ever targets a newer release, so this URL is always for the
    // current naming scheme.
    return `https://github.com/faridjaff/StickyNotesCanvas/releases/download/v${version}/sticky-notes-canvas_${version}_amd64.deb`;
  }
  // Mac (and anything else): point at the release page so the user picks
  // arm64 vs Intel themselves.
  return `https://github.com/faridjaff/StickyNotesCanvas/releases/tag/v${version}`;
}
const MOBILE_BANNER_DISMISSED_KEY = 'stickies.mobileBannerDismissed';
const MOBILE_BANNER_MAX_WIDTH = 640;

Object.assign(window, { FOLDER_HUES, HOVER_ALPHA, MOBILE_BANNER_DISMISSED_KEY, MOBILE_BANNER_MAX_WIDTH, NOTE_COLORS, SEED, STICKY_CLIPBOARD_MARKER, TWEAK_DEFAULTS, WHATS_NEW_ID, ZOOM_MAX, ZOOM_MIN, canMoveFolder, canvasPasteAction, clipboardTextToNotes, cmpSemver, downloadJSON, downloadNoteAsMarkdown, downloadUrlForPlatform, editLinkOnPaste, editListOnEnter, editListOnTab, editQuoteOnPaste, flattenFolderTree, flattenPreviewText, folderPath, folderSubtreeIds, hashRot, hasTextSelection, hexChannels, hoverBg, hoverInk, imageMimeForFile, isDarkSurface, markdownFileBody, markdownFileTitle, markdownFileToNote, markdownVisibleText, mdToHtml, mixHex, normHex, noteDownloadFilename, notesToClipboardText, noteToMarkdown, openWebLink, pickJSONFile, pickMarkdownFiles, renderedWordAt, sanitizeFolderParents, sourceCaretForPreviewClick, sourceOffsetForWord, themeTokens, uid, whatsNewInfo, withA, withDefaults, zoomActionForKey, zoomViewAt });
