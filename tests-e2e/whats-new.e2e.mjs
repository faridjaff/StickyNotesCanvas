// The one-time "what's new" note after an update.
//
// Regression guard for the 2.0.0 miss: the note keyed off a stored version
// number that only started being written IN 2.0.0, so every user upgrading
// from an earlier release looked like a fresh install and saw nothing —
// exactly the audience it was written for. These tests exercise the real
// launch states rather than a hand-planted localStorage value, which is what
// hid the bug the first time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

const dialogText = (app) => app.evaljs(`
  (() => {
    const hit = [...document.querySelectorAll('div')]
      .find(d => /What.s new/.test(d.textContent) && d.textContent.length < 1200);
    return hit ? hit.textContent : '';
  })()
`);

test('an upgrader with no recorded version sees the note', async () => {
  // Seeded notes.json + a fresh Chromium profile = someone who has been
  // using the app but never had a version recorded: the 1.8.0 -> 2.x path.
  const app = await launch({ whatsNew: true });
  try {
    const text = await dialogText(app);
    assert.match(text, /What.s new/, 'the note must be on screen after an upgrade');
    assert.match(text, /markdown/i);
  } finally {
    await app.close();
  }
});

test('it shows only once — a reload after dismissal stays quiet', async () => {
  const app = await launch({ whatsNew: true });
  try {
    assert.match(await dialogText(app), /What.s new/);
    await app.cmd('Page.enable');
    await app.cmd('Page.reload');
    await app.evaljs('1'); // wait for the new document to answer
    for (let i = 0; i < 20 && (await dialogText(app)); i++) await new Promise(r => setTimeout(r, 100));
    assert.equal(await dialogText(app), '', 'the note must not return on the next launch');
  } finally {
    await app.close();
  }
});

test('a genuine first install stays quiet', async () => {
  const app = await launch({ seed: null, whatsNew: true });
  try {
    for (let i = 0; i < 10 && !(await app.evaljs('!!document.querySelector("#root")')); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(await dialogText(app), '', 'new users have nothing to be updated about');
  } finally {
    await app.close();
  }
});
