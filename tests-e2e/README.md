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
   (Input.dispatchKeyEvent, `press('a', {ctrl:true})` for chords),
   `focusWindow` (Page.bringToFront + wait for `document.hasFocus()` —
   required before any menu accelerator, which the browser process only
   dispatches to the active window), `noteBodyRect`, `screenshot`, and
   `close`.

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
  reference renders no `<img>` and stays literal text. Then drag-and-drop
  (`Input.dispatchDragEvent` carrying a real file path in `data.files`,
  which is how Chromium itself delivers a file-manager drop): dropping a
  PNG on a note stores it under `<userData>/images/` and appends the
  reference on its own line, dropping a `.txt` changes nothing, and
  dropping onto an open editor inserts at the caret.
- `editing.e2e.mjs` — editor keystrokes against the real textarea: Enter
  continues ordered lists ("1. x" → "2. "), Tab renumbers-to-1 while
  nesting ("2. y" → "   1. y"), Enter continues blockquotes ("> q" → "> "),
  and the typed body renders correctly after leaving edit mode. Then the
  hidden menu bar (#42): the window carries no menu chrome
  (`innerHeight === outerHeight` — a visible bar costs ~29px), Ctrl+A/C/V/X
  still edit note text, and Ctrl+, still opens Preferences, which only the
  menu's accelerator can do in the Electron build. Alt-summons-the-bar is
  left to manual checking: a synthetic Alt over CDP lands in the menu bar's
  own key handling about a third of the time and steals the keyboard.

## Verifying inside the flatpak (pre-release)

Some failures only exist in the flatpak sandbox and cannot be reproduced by
this suite, which drives plain Electron. Image pasting was one: the `File`
object a paste event carries is backed by a Chromium temp file the renderer
cannot read there, so `arrayBuffer()` rejected with `NotFoundError` and the
paste silently did nothing, while every test here passed. (Fixed by reading
the image in the main process — `images:save-clipboard`.)

Recipe, run before publishing a release that touches clipboard, files, or
dialogs:

```sh
# 1. build from the working tree: copy the Flathub manifest, replace the
#    git source with `- type: dir` / `path: /home/farid/open_source/sticky-notes`
flatpak-builder --user --force-clean --install --disable-rofiles-fuse \
  build-dir io.github.faridjaff.StickyNotesCanvas.yaml

# 2. run it on a throwaway profile, with CDP reachable
#    (--share=network is needed for the debug port; --disable-gpu avoids a
#    GPU init crash under that flag; STICKY_USER_DATA keeps real notes safe)
V=~/.var/app/io.github.faridjaff.StickyNotesCanvas/config/verify
flatpak run --user --share=network --env=STICKY_USER_DATA=$V \
  io.github.faridjaff.StickyNotesCanvas --remote-debugging-port=9229 --disable-gpu

# 3. drive it over CDP exactly like harness.mjs does, then
flatpak uninstall --user -y io.github.faridjaff.StickyNotesCanvas && rm -rf $V
```

Note that a real `Ctrl+V` (`Input.dispatchKeyEvent` with `modifiers: 2`) is
the only way to test a paste: synthetic paste events cannot carry files.

What to check there for the two file routes into a note:

- **drag-and-drop** — the app has no filesystem permission (`finish-args`
  is ipc + wayland/x11 + dri, nothing else), so a dropped file is only
  readable when the drop hands over a document-portal path
  (`/run/user/<uid>/doc/…`) instead of a raw host path. Both the path
  route (`webUtils.getPathForFile` → `images:save-file`, read in main) and
  the renderer-bytes fallback fail on a raw host path — there is nothing
  the app can do about that one, so this is the thing to confirm with a
  real drag out of the file manager. `Input.dispatchDragEvent` with
  `data.files` set to a path from `flatpak document-export --app=<id>
  --allow-read <file>` exercises the portal case over CDP.
- **"Insert image…"** — goes through the file-chooser portal, which needs a
  human; the dialog itself cannot be driven headlessly. Everything after it
  is `stickyAPI.saveImageFile(path)`, which can be called straight from CDP.
