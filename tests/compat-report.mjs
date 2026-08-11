// Differential compatibility report: old hand-rolled converter (e840165)
// vs the current markdown-it pipeline (279d9fd+). NOT a test — run it with
//   node tests/compat-report.mjs
// It renders every corpus case through both converters and catalogs the
// differences so no behavior change ships unnoticed. The 'same' class is
// frozen as assertions in tests/compat.test.mjs; 'intended'/'collateral'
// await user decisions, driven by the full outputs printed at the end.
import { corpus } from './fixtures/compat-corpus.mjs';
import { oldMdToHtml, newMdToHtml } from './fixtures/load-md-converters.mjs';

const clip = (s, n = 120) => (s.length <= n ? s : s.slice(0, n) + '…');

const counts = { same: 0, intended: 0, collateral: 0 };
const collateral = [];
let surprises = 0;

console.log('=== old vs new markdown differential catalog ===\n');
for (const c of corpus) {
  counts[c.expect]++;
  const oldOut = oldMdToHtml(c.input);
  const newOut = newMdToHtml(c.input);
  const identical = oldOut === newOut;

  let verdict, detail, surprise = false;
  if (identical) {
    verdict = 'SAME';
    detail = 'SAME';
    if (c.expect !== 'same') {
      surprise = true;
      detail += ` (expected a difference under '${c.expect}' — none found)`;
    }
  } else {
    verdict = c.expect.toUpperCase();
    detail = `${clip(oldOut)} → ${clip(newOut)}`;
    if (c.expect === 'same') {
      surprise = true;
      verdict = 'DIFF-BUT-EXPECTED-SAME';
    }
  }
  if (surprise) surprises++;
  console.log(`${surprise ? '⚠ ' : ''}${c.name} | ${verdict} | ${detail}`);
  if (c.note) console.log(`    note: ${c.note}`);
  if (c.expect === 'collateral') collateral.push({ ...c, oldOut, newOut, identical });
}

// The mermaid marker is what NoteCard swaps for the rendered diagram — the
// whole point of the mermaid fence class. Surface it explicitly.
const mermaid = corpus.find(c => c.name === 'mermaid fence');
const mermaidOk = newMdToHtml(mermaid.input).includes('<pre class="mermaid-src"');
console.log(`\nmermaid marker check: <pre class="mermaid-src"> ${mermaidOk ? 'present in new output ✓' : 'MISSING FROM NEW OUTPUT ⚠'}`);

console.log('\n=== counts ===');
console.log(`same:       ${counts.same}`);
console.log(`intended:   ${counts.intended}`);
console.log(`collateral: ${counts.collateral}`);
console.log(`surprises:  ${surprises} (⚠-marked above)`);

console.log('\n=== collateral cases in full (these drive user decisions) ===');
for (const c of collateral) {
  console.log(`\n--- ${c.name} ---`);
  console.log(`input: ${JSON.stringify(c.input)}`);
  if (c.identical) {
    console.log(`outputs IDENTICAL: ${c.oldOut}`);
  } else {
    console.log(`old: ${c.oldOut}`);
    console.log(`new: ${c.newOut}`);
  }
  if (c.note) console.log(`note: ${c.note}`);
}
