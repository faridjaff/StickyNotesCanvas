// Loads BOTH markdown converters side by side for the differential compat
// corpus (tests/fixtures/compat-corpus.mjs):
//   - oldMdToHtml — the hand-rolled converter from the last pre-markdown-it
//     master commit (e840165), frozen in utils-pre-markdown-it.jsx;
//   - newMdToHtml — the current markdown-it pipeline in utils.jsx.
// Each utils build is a browser-global script (no module exports) that only
// touches `React` and `window` at load time, so each one runs in its own vm
// sandbox with light shims — the exact pattern of tests/markdown.test.mjs.
// Only the new converter needs the vendored markdown-it UMD build evaluated
// first (it attaches the `markdownit` factory to the sandbox global, like
// the <script> tag in index.html does in the browser).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadSandbox(utilsPath, { withMarkdownIt }) {
  const sandbox = { React: {}, window: {}, document: {}, navigator: {}, console, Math, JSON, Date };
  vm.createContext(sandbox);
  if (withMarkdownIt) {
    vm.runInContext(fs.readFileSync(path.join(dir, '..', '..', 'vendor', 'markdown-it.min.js'), 'utf8'), sandbox);
  }
  vm.runInContext(fs.readFileSync(utilsPath, 'utf8'), sandbox);
  return sandbox.window;
}

export const oldMdToHtml = loadSandbox(
  path.join(dir, 'utils-pre-markdown-it.jsx'), { withMarkdownIt: false }).mdToHtml;

export const newMdToHtml = loadSandbox(
  path.join(dir, '..', '..', 'utils.jsx'), { withMarkdownIt: true }).mdToHtml;
