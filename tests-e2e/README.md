# End-to-end tests

Real-DOM tests that launch the actual Electron app and drive it over the
Chrome DevTools Protocol (raw WebSocket, no test framework dependencies).

## Run

```sh
npm ci          # once; electron is the only real dependency
npm run test:e2e
```

Plain `npm test` stays fast and node-only — the e2e suite is deliberately
not wired into it or into CI: it needs a display to launch the Electron GUI
(a headless CI runner would need Xvfb plus a GPU-less Chromium config, which
isn't worth the flake risk for this project).

## How it works

`harness.mjs` per test file:

1. creates a fresh temp dir under `os.tmpdir()` and writes a seeded
   `notes.json` (the app's whole persisted store: `{ tweaks, folders, notes,
   links, cwd, view, drawer, folderOrder }`; notes carry
   `id/folder/title/body/color/x/y/w/h/z/pinned` in world coordinates), a
   `window.json` forcing a known 1400x900 window, and any extra `files`
   the test seeds (e.g. `images/<hash>.png` for the sticky-image tests);
2. launches `./node_modules/.bin/electron . --remote-debugging-port=<free port>`
   with `STICKY_USER_DATA` pointing at that temp dir;
3. polls `http://127.0.0.1:<port>/json` until the page target appears,
   connects a WebSocket CDP client, and waits until every seeded note has
   rendered;
4. returns drivers: `evaljs` (Runtime.evaluate), `click`/`dblclick`/`drag`
   (Input.dispatchMouseEvent), `type` (Input.insertText), `press`
   (Input.dispatchKeyEvent), `noteBodyRect`, `screenshot`, and `close`.

`close()` runs in an `after` hook even on failure: it kills only the
Electron process group it spawned (tracked child PID — never a pkill) and
removes the temp dir. Every wait in the suite is a bounded poll
(`pollUntil`), never a bare sleep used as an assertion.

## The STICKY_USER_DATA contract

`main.js` contains one tiny test hook, guarded and run before app-ready:

```js
if (process.env.STICKY_USER_DATA) {
  app.setPath('userData', process.env.STICKY_USER_DATA);
}
```

When set, ALL app data (notes.json, window.json, Chromium profile) lives
under that directory, so tests can seed known notes at known positions and
can never touch real user notes. Unset, the app behaves exactly as before.

## Scenarios

- `markdown-render.e2e.mjs` — rendered `.md-body` DOM: heading shift
  (###→h5, ####→h6), `ol > li` + nested ol, blockquote, table, `pre > code`
  fences, `javascript:` links stay inert text, bare `www.` URLs linkify.
- `mermaid.e2e.mjs` — a valid mermaid fence becomes an SVG (async, polled);
  a garbage fence fails soft (code block stays, no svg, app still alive),
  including across an edit-mode round trip.
- `selection.e2e.mjs` — text-selection drags with boundary-snap outcomes:
  exit right/below stays forward to note end (the below-bottom flip is the
  guarded regression), exit left goes backward to line start, dragging onto
  another note selects nothing from it, double-click opens the editor and
  Escape closes it.
- `images.e2e.mjs` — a PNG seeded into `<userData>/images/` under its
  content-hash name loads through the `sticky-image://` protocol (the
  rendered `<img>`'s naturalWidth goes above 0); a traversal-shaped
  reference renders no `<img>` and stays literal text.
- `editing.e2e.mjs` — editor keystrokes against the real textarea: Enter
  continues ordered lists ("1. x" → "2. "), Tab renumbers-to-1 while
  nesting ("2. y" → "   1. y"), Enter continues blockquotes ("> q" → "> "),
  and the typed body renders correctly after leaving edit mode.
