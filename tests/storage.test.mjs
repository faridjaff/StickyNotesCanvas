import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { load, save, readMarkdownFile } from '../storage.js';

function tmpPath() {
  return path.join(
    os.tmpdir(),
    `sticky-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
}

function cleanup(p) {
  for (const f of [p, p + '.tmp']) {
    try { fs.unlinkSync(f); } catch {}
  }
}

test('load returns {} when file does not exist', () => {
  const p = tmpPath();
  assert.deepEqual(load(p), {});
});

test('save then load round-trips the object', () => {
  const p = tmpPath();
  const data = { notes: [{ id: 'a', title: 'hello' }], tweaks: { theme: 'paper' } };
  save(p, data);
  assert.deepEqual(load(p), data);
  cleanup(p);
});

test('load returns {} on invalid JSON and warns', () => {
  const p = tmpPath();
  fs.writeFileSync(p, '{ not valid json');
  const origWarn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    assert.deepEqual(load(p), {});
    assert.ok(warned, 'expected console.warn to be called');
  } finally {
    console.warn = origWarn;
    cleanup(p);
  }
});

test('save creates the parent directory if missing', () => {
  const dir = path.join(os.tmpdir(), `sticky-dir-${Date.now()}`);
  const p = path.join(dir, 'nested', 'notes.json');
  try {
    save(p, { hi: 1 });
    assert.ok(fs.existsSync(p));
    assert.deepEqual(load(p), { hi: 1 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('save writes to .tmp first then renames', (t) => {
  const p = tmpPath();
  let tmpExistedAtRename = false;
  const origRename = fs.renameSync.bind(fs);
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (from === p + '.tmp' && to === p) {
      tmpExistedAtRename = fs.existsSync(p + '.tmp');
    }
    return origRename(from, to);
  });
  save(p, { hi: 1 });
  assert.ok(tmpExistedAtRename, 'tmp file should exist at moment of rename');
  cleanup(p);
});

test('save preserves original file if rename throws', (t) => {
  const p = tmpPath();
  save(p, { original: true });
  const m = t.mock.method(fs, 'renameSync', () => { throw new Error('simulated crash'); });
  assert.throws(() => save(p, { new: true }), /simulated crash/);
  m.mock.restore();
  assert.deepEqual(load(p), { original: true });
  cleanup(p);
});

/* ---------------- readMarkdownFile (issue #44) ----------------
 * The main process's half of "Import markdown file…": everything the
 * renderer never gets to see, because reading happens in main (the flatpak
 * file-chooser portal grants the chosen file to that process, not to the
 * sandboxed app). The pure half — filename → title, contents → body — lives
 * in tests/import-markdown.test.mjs.
 */

function mdDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-md-'));
}

test('readMarkdownFile returns the file name and its contents verbatim', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'Sprint 42.md');
    const raw = '\uFEFF## This sprint\r\n- dogfood search\r\n';
    fs.writeFileSync(p, raw, 'utf8');
    const res = readMarkdownFile(p);
    assert.equal(res.name, 'Sprint 42.md');
    assert.equal(res.content, raw, 'main hands over the raw text; utils.jsx normalises it');
    assert.equal(res.error, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile reads unicode as UTF-8', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'Café — 日本語.md');
    fs.writeFileSync(p, 'é 日本語 — ok\n', 'utf8');
    const res = readMarkdownFile(p);
    assert.equal(res.name, 'Café — 日本語.md');
    assert.equal(res.content, 'é 日本語 — ok\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile imports a multi-megabyte file — the importer is uncapped', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'huge.md');
    const size = 2 * 1024 * 1024;
    fs.writeFileSync(p, Buffer.alloc(size, 0x61));
    const res = readMarkdownFile(p);
    assert.equal(res.error, undefined, 'size alone is never a reason to refuse (see issue #39)');
    assert.equal(res.content.length, size);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile refuses binary content renamed .md', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'photo.md');
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a]));
    assert.deepEqual(readMarkdownFile(p), { name: 'photo.md', error: 'not a text file' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile refuses text that is not UTF-8', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'latin1.md');
    fs.writeFileSync(p, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));  // "café" in latin-1
    assert.deepEqual(readMarkdownFile(p), { name: 'latin1.md', error: 'not UTF-8 text' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile refuses a directory and reports a missing file', () => {
  const dir = mdDir();
  try {
    assert.deepEqual(readMarkdownFile(dir), { name: path.basename(dir), error: 'not a file' });
    const missing = readMarkdownFile(path.join(dir, 'nope.md'));
    assert.equal(missing.name, 'nope.md');
    assert.match(missing.error, /ENOENT/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('readMarkdownFile reads an empty file as empty content, not an error', () => {
  const dir = mdDir();
  try {
    const p = path.join(dir, 'empty.md');
    fs.writeFileSync(p, '');
    assert.deepEqual(readMarkdownFile(p), { name: 'empty.md', content: '' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
