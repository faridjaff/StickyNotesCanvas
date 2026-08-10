import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// utils.jsx is a browser-global script (no module exports). Same loading
// trick as folders.test.mjs: run it in a vm sandbox with light shims and
// read the pure helpers back off the shimmed `window`.
const dir = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(dir, '..', 'utils.jsx'), 'utf8');
const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { noteDownloadFilename, noteToMarkdown } = sandbox.window;

/* ---------------- noteDownloadFilename ---------------- */

test('filename comes from the note title', () => {
  assert.equal(noteDownloadFilename({ title: 'Groceries', body: 'x' }), 'Groceries.md');
});

test('filename strips filesystem-hostile characters', () => {
  assert.equal(
    noteDownloadFilename({ title: 'a/b\\c:d*e?f"g<h>i|j', body: '' }),
    'a b c d e f g h i j.md');
});

test('filename strips control characters', () => {
  assert.equal(noteDownloadFilename({ title: 'plan\u0000A\tB', body: '' }), 'plan A B.md');
});

test('filename collapses runs of whitespace and trims', () => {
  assert.equal(noteDownloadFilename({ title: '  Sprint   42   scope ', body: '' }), 'Sprint 42 scope.md');
});

test('blank title falls back to the first non-empty body line', () => {
  assert.equal(
    noteDownloadFilename({ title: '  ', body: '\n\nRouter reboot\nssh admin@10.0.0.1' }),
    'Router reboot.md');
});

test('body-line fallback drops a leading heading marker', () => {
  assert.equal(noteDownloadFilename({ title: '', body: '## Build flags\nstuff' }), 'Build flags.md');
});

test('body-line fallback drops a leading bullet marker', () => {
  assert.equal(noteDownloadFilename({ title: '', body: '- Sourdough\n- olive oil' }), 'Sourdough.md');
});

test('title that sanitizes away to nothing falls back to the body', () => {
  assert.equal(noteDownloadFilename({ title: '///', body: 'Dinner: friday' }), 'Dinner friday.md');
});

test('empty note falls back to note.md', () => {
  assert.equal(noteDownloadFilename({ title: '', body: '' }), 'note.md');
  assert.equal(noteDownloadFilename({}), 'note.md');
  assert.equal(noteDownloadFilename(undefined), 'note.md');
});

test('filename base is capped at 60 characters', () => {
  const name = noteDownloadFilename({ title: 'x'.repeat(200), body: '' });
  assert.equal(name, 'x'.repeat(60) + '.md');
});

test('no trailing dots or spaces survive (Windows-safe)', () => {
  assert.equal(noteDownloadFilename({ title: 'notes...', body: '' }), 'notes.md');
  // Truncation at the cap must not leave a trailing space either.
  const name = noteDownloadFilename({ title: 'y'.repeat(59) + ' zzzz', body: '' });
  assert.equal(name, 'y'.repeat(59) + '.md');
});

test('no dotfile names: leading dots are stripped', () => {
  assert.equal(noteDownloadFilename({ title: '.bashrc notes', body: '' }), 'bashrc notes.md');
});

/* ---------------- noteToMarkdown ---------------- */

test('title stays out of the file — body only, round-trip safe', () => {
  assert.equal(
    noteToMarkdown({ title: 'Standup', body: '**Yday:** fixed dnd bug' }),
    '**Yday:** fixed dnd bug\n');
});

test('untitled note exports the body alone', () => {
  assert.equal(noteToMarkdown({ title: '', body: 'just the body' }), 'just the body\n');
});

test('empty body exports a single newline', () => {
  assert.equal(noteToMarkdown({ title: 'Ideas', body: '' }), '\n');
});

test('trailing whitespace collapses to exactly one final newline', () => {
  assert.equal(noteToMarkdown({ title: '', body: 'line\n\n\n  ' }), 'line\n');
});

test('body markdown is preserved verbatim', () => {
  const body = '## This sprint\n- onboarding polish\n- dnd quick fix';
  assert.equal(noteToMarkdown({ title: 'Sprint 42', body }), body + '\n');
});
