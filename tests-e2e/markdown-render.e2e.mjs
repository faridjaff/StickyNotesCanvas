// Real-DOM markdown rendering: assertions run against the .md-body the app
// actually rendered for the seeded rich note (see RICH_BODY in harness.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, NOTE } from './harness.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { if (app) await app.close(); });

const inRich = (selector) =>
  app.evaljs(`!!document.querySelector('[data-note-id="${NOTE.rich}"] .md-body ${selector}')`);

test('### and #### render as h5/h6 (note-sized heading shift)', async () => {
  assert.equal(await inRich('h5'), true, '### should render as <h5>');
  assert.equal(await inRich('h6'), true, '#### should render as <h6>');
  const h5 = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body h5').textContent`);
  const h6 = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body h6').textContent`);
  assert.equal(h5, 'Alpha');
  assert.equal(h6, 'Beta');
});

test('ordered list renders as ol > li, with a nested ol for the indented item', async () => {
  assert.equal(await inRich('ol > li'), true, 'ordered list should render <ol><li>');
  assert.equal(await inRich('ol ol'), true, '"1. one\\n   1. sub" should nest an <ol> inside the <ol>');
  const sub = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body ol ol li').textContent`);
  assert.equal(sub, 'sub');
});

test('blockquote renders as a real <blockquote>', async () => {
  assert.equal(await inRich('blockquote'), true);
  const q = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body blockquote').textContent`);
  assert.match(q, /quoted/);
});

test('pipe table renders as a real <table>', async () => {
  assert.equal(await inRich('table'), true);
  assert.equal(await inRich('table th'), true, 'header row should render <th>');
  assert.equal(await inRich('table td'), true, 'body row should render <td>');
});

test('js fence renders as pre > code', async () => {
  assert.equal(await inRich('pre > code.language-js'), true, '```js fence should render <pre><code class="language-js">');
  const code = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body pre > code.language-js').textContent`);
  assert.match(code, /console\.log\('hi'\)/);
});

test('javascript: link stays inert text — no <a> with a javascript href anywhere', async () => {
  const evilAnchor = await app.evaljs(`[...document.querySelectorAll('a')].some(a => (a.getAttribute('href') || '').toLowerCase().startsWith('javascript'))`);
  assert.equal(evilAnchor, false, 'no anchor in the whole page may carry a javascript: href');
  const text = await app.evaljs(`document.querySelector('[data-note-id="${NOTE.rich}"] .md-body').textContent`);
  assert.match(text, /\[evil\]\(javascript:alert\(1\)\)/, 'the markdown link renders verbatim as text');
});

test('bare www.example.com is linkified into an <a>', async () => {
  const link = await app.evaljs(`(() => {
    const a = [...document.querySelectorAll('[data-note-id="${NOTE.rich}"] .md-body a')]
      .find(a => a.textContent === 'www.example.com');
    return a ? { href: a.getAttribute('href'), weblink: a.getAttribute('data-weblink') } : null;
  })()`);
  assert.ok(link, 'www.example.com should render as an anchor');
  assert.match(link.href, /^https?:\/\/www\.example\.com/);
  assert.ok(link.weblink, 'anchor should carry data-weblink so clicks route to the external-open delegate');
});
