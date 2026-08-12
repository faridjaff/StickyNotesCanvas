# Contributing

This app is written with AI assistance, end to end. Reading it by hand is
possible but slow; most contributors will be driving an agent. This file is
written for both — everything here is a rule an agent should follow, with the
reason attached, because a rule without a reason gets optimised away.

## Architecture: the one thing that surprises everyone

There is **no build step and no bundler**. `index.html` loads plain `<script>`
tags; JSX is compiled in the browser by a vendored Babel. Libraries live as
single files in `vendor/` (React, markdown-it, mermaid) and are loaded the same
way.

So:

- **Never add a runtime npm dependency.** `electron` and `electron-builder` are
  dev-only. A new library gets vendored into `vendor/` and script-tagged.
- There is nothing to compile. Edit a `.jsx` file, restart the app, done.
- Syntax errors won't be caught by a bundler — run the tests.

Files, in the order they matter:

| File | What lives there |
|---|---|
| `main.js` | Electron main process: window, menu, IPC, the `sticky-image://` protocol |
| `preload.js` | the entire renderer↔main bridge (`window.stickyAPI`) |
| `app.jsx` | top-level app state, keyboard shortcuts, global CSS |
| `components.jsx` | the canvas, notes, menus, panels — most of the UI |
| `utils.jsx` | pure functions: markdown, clipboard payloads, zoom maths, caret mapping |
| `hooks.jsx` | persistence, undo/redo, update check |
| `storage.js` | disk I/O for notes and images (main process only) |

## Where user data lives

Two things hold user data, and only two:

- `notes.json` — the whole store: notes, folders, links, preferences, view state
- `images/` — pasted pictures, named by the hash of their contents

Everything else in the app's data directory is Chromium profile state. Saves are
atomic (temp file + rename). The app reads `notes.json` at startup and does not
watch it for outside changes.

`STICKY_USER_DATA=<dir>` relocates the whole data directory. It exists for the
E2E tests, which use it to run against a throwaway profile — that's why the
suite can never touch your real notes.

## Tests

| Command | What | When |
|---|---|---|
| `npm test` | unit tests, node only, under a second | before every commit |
| `npm run test:e2e` | launches the real app and drives it over the DevTools Protocol | before every push |

The E2E suite needs a display. `tests-e2e/README.md` explains the harness,
seeding, and how to verify things inside a flatpak build — do read it before
adding a test.

### The E2E suite is flaky, and it isn't your fault

Roughly **one full run in three fails somewhere**, and the failure moves around:
half a dozen different tests have been seen timing out, always on a machine
under load, and the same test file passes repeatedly when run on its own. The
cause is in the harness or the environment — synthetic input being dropped or
mistimed — not in the app. It has not been fixed.

What to do about it:

- Run the failing file on its own: `node --test tests-e2e/<file>.e2e.mjs`. If it
  passes there, you have almost certainly hit the flake.
- **Read the failure before deciding that.** Test name and error text, every
  time. "It's just the flaky suite" is a fine conclusion and a terrible
  assumption — the point of the suite is to catch the one failure that is real.
- **Never filter test output.** Piping a run through `grep` to keep it short is
  exactly how a real failure becomes invisible.
- A re-run that goes green explains nothing about the run that went red.

`.githooks/` enforces both gates locally (`git config core.hooksPath .githooks`).
`--no-verify` exists for when the flake blocks a push; use it knowing what you
skipped.

## Contracts that are easy to break

These are load-bearing and have tests guarding them. If a test in this list
fails, the change is wrong — not the test.

- **Preview and editor must lay text out identically.** Space runs, blank lines
  and leading indentation all survive into the rendered preview.
  (`tests/preview-parity.test.mjs`)
- **Markdown rendering must not change for existing notes.** The old
  hand-rolled renderer is frozen in `tests/fixtures/` and every corpus case is
  rendered through both. (`tests/compat.test.mjs`)
- **Link and image targets are restricted.** `http(s)` plus the app's own
  `sticky-image://<hash>.<ext>` shape, nothing else — `javascript:`, `data:`
  and traversal shapes must stay inert text.
- **Image files are content-addressed.** The filename *is* the hash; anything
  arriving from a backup or the clipboard is re-hashed before it is written.

## The flatpak sandbox

Most bug reports that only reproduce "sometimes" are really "only in the
flatpak". It has **no filesystem access and no network access**:

- Files reach the app through the file-chooser portal (a picker the user drove),
  not through paths. A path from a drag-and-drop, or copied in a file manager,
  usually can't be read.
- Remote images in note bodies won't load there.
- Anything touching files, dialogs or the clipboard should be verified in a real
  flatpak build before it's called done. The recipe is at the end of
  `tests-e2e/README.md`.

## Commits and releases

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`chore:`, `test:`, `docs:`. [release-please](https://github.com/googleapis/release-please)
parses these to decide the version and write the changelog, so a wrong prefix
produces a wrong release.

- **Subject line only.** No body paragraphs. The diff shows what changed; the
  subject says why. The exception is `Closes #N`, which goes on its own line so
  the issue closes when the commit lands.
- **Rebase only.** No merge commits, no squashing — squashing destroys the
  per-commit prefixes release-please needs. The repository is configured to
  allow nothing else.
- The maintainer commits to `master` directly. Outside contributions come as
  pull requests, rebased on current `master`.

## Before you open a pull request

- `npm test` green, and `npm run test:e2e` green or failing only on the flake
  (say which test, and that it passes in isolation)
- new behaviour has a test; a bug fix has a test that fails without the fix
- no new npm runtime dependency
- if it touches files, dialogs, the clipboard or rendering: verified in a
  flatpak build, and say so in the pull request
