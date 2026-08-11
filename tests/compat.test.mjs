// Freeze the old-vs-new markdown invariants: for every corpus case classed
// 'same', the current markdown-it pipeline must render EXACTLY what the old
// hand-rolled converter (tests/fixtures/utils-pre-markdown-it.jsx, frozen
// from e840165) rendered — these are the shapes existing users' notes rely
// on. 'intended' and 'collateral' cases carry no assertions yet: they are
// cataloged by tests/compat-report.mjs and await user decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corpus } from './fixtures/compat-corpus.mjs';
import { oldMdToHtml, newMdToHtml } from './fixtures/load-md-converters.mjs';

for (const c of corpus.filter(c => c.expect === 'same')) {
  test(`compat invariant: ${c.name}`, () => {
    assert.equal(newMdToHtml(c.input), oldMdToHtml(c.input),
      `old and new converters must agree on ${JSON.stringify(c.input)}`);
  });
}
