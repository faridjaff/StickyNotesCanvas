// Mermaid fences render asynchronously after mount: NoteCard swaps each
// <pre class="mermaid-src"> for an SVG, and fails soft (keeps the code
// block) when the diagram source doesn't parse.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, pollUntil, NOTE } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

test('a valid mermaid fence eventually becomes an SVG diagram', async () => {
  const ok = await pollUntil(
    () => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.rich}"] .md-body .mermaid-diagram svg')`),
    { timeout: 5000, interval: 150, label: 'mermaid svg in the rich note' },
  );
  assert.equal(ok, true);
  // The swapped fence is gone — the diagram replaced the code block.
  const srcLeft = await app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.rich}"] .md-body pre.mermaid-src')`);
  assert.equal(srcLeft, false, 'the rendered fence should have been replaced by the diagram');
});

test('a garbage mermaid fence fails soft: code block stays, no svg, app alive', async () => {
  // Give the good note's async render time to complete first — by then the
  // bad note's render attempt has settled too (both fire from the same
  // post-mount effect pass).
  await pollUntil(
    () => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.rich}"] .md-body .mermaid-diagram svg')`),
    { timeout: 5000, interval: 150, label: 'mermaid render pass to settle' },
  );
  const bad = await app.evaljs(`(() => {
    const body = document.querySelector('[data-note-id="${NOTE.badMermaid}"] .md-body');
    return {
      pre: !!body.querySelector('pre.mermaid-src code'),
      svg: !!body.querySelector('svg'),
      text: body.textContent,
    };
  })()`);
  assert.equal(bad.pre, true, 'the failed fence must stay visible as a code block');
  assert.equal(bad.svg, false, 'no svg may appear for an unparseable diagram');
  assert.match(bad.text, /not %% a diagram/, 'the raw diagram source is still readable');
  // App did not crash: the page still evaluates.
  assert.equal(await app.evaljs('1 + 1'), 2);
});

test('edit mode on the bad-mermaid note shows the raw fence and exits cleanly', async () => {
  const r = await app.noteBodyRect(NOTE.badMermaid);
  await app.dblclick((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  await pollUntil(
    () => app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.badMermaid}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'textarea to open on the bad-mermaid note' },
  );
  const value = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.badMermaid}"] textarea').value`);
  assert.match(value, /^```mermaid\n/, 'the textarea holds the raw fence source');
  await app.press('Escape');
  await pollUntil(
    () => app.evaljs(`!document.querySelector('[data-note-id="${NOTE.badMermaid}"] textarea')`),
    { timeout: 3000, interval: 100, label: 'textarea to close after Escape' },
  );
  // Still fail-soft after the edit-mode round trip.
  const pre = await app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.badMermaid}"] .md-body pre.mermaid-src code')`);
  assert.equal(pre, true);
});
