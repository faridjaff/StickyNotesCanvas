// "Import markdown file…" (issue #44) — the pure half of the importer: the
// filename → title derivation, the contents → body normalisation, and the
// guards that keep a non-note out of a note. The file picker itself lives in
// the main process (notes:import-markdown) and its reader is covered by
// tests/storage.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// utils.jsx is a browser-global script (no module exports). Same loading
// trick as download.test.mjs: run it in a vm sandbox with light shims and
// read the pure helpers back off the shimmed `window`.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const {
  markdownFileTitle, markdownFileBody, markdownFileToNote,
  noteDownloadFilename, noteToMarkdown,
} = sandbox.window;

/* ---------------- markdownFileTitle ---------------- */

test('title is the filename with the .md extension dropped', () => {
  assert.equal(markdownFileTitle('Groceries.md'), 'Groceries');
});

test('title drops the other markdown extensions the picker offers', () => {
  assert.equal(markdownFileTitle('plan.markdown'), 'plan');
  assert.equal(markdownFileTitle('plan.mdown'), 'plan');
  assert.equal(markdownFileTitle('plan.mkd'), 'plan');
  assert.equal(markdownFileTitle('plan.txt'), 'plan');
  assert.equal(markdownFileTitle('PLAN.MD'), 'PLAN', 'extension match is case-insensitive');
});

test('title keeps an unknown suffix instead of guessing it is an extension', () => {
  assert.equal(markdownFileTitle('release-2.1.md'), 'release-2.1');
  assert.equal(markdownFileTitle('notes.v2'), 'notes.v2');
});

test('title keeps unicode exactly as the filename spells it', () => {
  assert.equal(markdownFileTitle('Café über — 日本語.md'), 'Café über — 日本語');
  assert.equal(markdownFileTitle('التخطيط.md'), 'التخطيط');
});

test('title drops any directory part of the name', () => {
  assert.equal(markdownFileTitle('/home/farid/Notes/Sprint 42.md'), 'Sprint 42');
  assert.equal(markdownFileTitle('C:\\Users\\farid\\Sprint 42.md'), 'Sprint 42');
});

test('title collapses whitespace runs, like the download filename does', () => {
  assert.equal(markdownFileTitle('  Sprint   42   scope .md'), 'Sprint 42 scope');
});

test('title falls back to "note" when the name leaves nothing behind', () => {
  assert.equal(markdownFileTitle('.md'), 'note', 'a dotfile named only for its extension');
  assert.equal(markdownFileTitle('   .md'), 'note');
  assert.equal(markdownFileTitle(''), 'note');
  assert.equal(markdownFileTitle(undefined), 'note');
  assert.equal(markdownFileTitle('/tmp/notes/'), 'note', 'a path with no file part');
});

test('title keeps a real dotfile stem', () => {
  assert.equal(markdownFileTitle('.bashrc.md'), '.bashrc');
});

test('title is capped so an absurd filename cannot become an absurd title', () => {
  assert.equal(markdownFileTitle('x'.repeat(400) + '.md').length, 120);
});

/* ---------------- markdownFileBody ---------------- */

test('body keeps the file contents verbatim', () => {
  const md = '## Goals\n\n- ship #44\n- **bold** and `code`';
  assert.equal(markdownFileBody(md), md);
});

test('body strips a leading UTF-8 BOM', () => {
  assert.equal(markdownFileBody('\uFEFF# Title\ntext'), '# Title\ntext');
  assert.equal(markdownFileBody('text\uFEFFmore'), 'text\uFEFFmore', 'only a LEADING BOM goes');
});

test('body normalises CRLF and lone CR line endings to \\n', () => {
  assert.equal(markdownFileBody('a\r\nb\rc\nd'), 'a\nb\nc\nd');
});

test('body trims trailing whitespace, exactly as noteToMarkdown wrote it', () => {
  assert.equal(markdownFileBody('line\n\n\n  '), 'line');
  assert.equal(markdownFileBody('line\r\n'), 'line');
});

test('body of an empty file is an empty string', () => {
  assert.equal(markdownFileBody(''), '');
  assert.equal(markdownFileBody(undefined), '');
});

/* ---------------- markdownFileToNote ---------------- */

// The helpers run inside the vm realm, so their return values carry that
// realm's Object.prototype — deepStrictEqual would reject them on identity
// alone. Compare the fields.
const sameNote = (actual, expected, msg) => {
  for (const k of ['name', 'title', 'body', 'error']) {
    assert.equal(actual[k], expected[k], `${msg || ''} ${k}`.trim());
  }
};

test('a read file becomes a titled note', () => {
  sameNote(
    markdownFileToNote({ name: 'Sprint 42.md', content: '## This sprint\r\n- dogfood search\r\n' }),
    { name: 'Sprint 42.md', title: 'Sprint 42', body: '## This sprint\n- dogfood search' });
});

test("main's per-file error passes straight through", () => {
  sameNote(
    markdownFileToNote({ name: 'photo.md', error: 'not a text file' }),
    { name: 'photo.md', error: 'not a text file' });
});

test('a file with no contents is an error, not an empty note', () => {
  sameNote(markdownFileToNote({ name: 'x.md' }), { name: 'x.md', error: 'nothing to read' });
  sameNote(markdownFileToNote(undefined), { name: 'file', error: 'nothing to read' });
});

test('a huge file still imports — no size cap on the importer (issue #39)', () => {
  const big = 'x'.repeat(2 * 1024 * 1024);
  const res = markdownFileToNote({ name: 'huge.md', content: big });
  assert.equal(res.error, undefined);
  assert.equal(res.body.length, big.length);
});

test('binary content that slipped through is refused', () => {
  sameNote(
    markdownFileToNote({ name: 'thing.md', content: 'PK\u0003\u0004\u0000\u0000gibberish' }),
    { name: 'thing.md', error: 'not a text file' });
});

/* ---------------- the round trip with "Download" ---------------- */

test('download → import returns the note it started from', () => {
  for (const note of [
    { title: 'Groceries', body: '# Weekend run\n- **Sourdough**\n- _olive oil_' },
    { title: 'Sprint 42 scope', body: '## This sprint\n\n- onboarding polish' },
    { title: 'Café über — 日本語', body: 'unicode body — é 日本語' },
    { title: 'Ideas', body: '' },
  ]) {
    const file = { name: noteDownloadFilename(note), content: noteToMarkdown(note) };
    const back = markdownFileToNote(file);
    assert.equal(back.title, note.title, `title round trip for ${note.title}`);
    assert.equal(back.body, note.body, `body round trip for ${note.title}`);
  }
});

test('download → import of a titleless note titles it from its first line', () => {
  // noteDownloadFilename falls back to the first body line, so the round
  // trip gives the note the title the file was named after — the file has
  // nowhere else to carry one.
  const note = { title: '', body: '- Sourdough\n- olive oil' };
  const back = markdownFileToNote({ name: noteDownloadFilename(note), content: noteToMarkdown(note) });
  assert.equal(back.title, 'Sourdough');
  assert.equal(back.body, note.body);
});
