# Contributing

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `test:`, `docs:`.

- Subject line: type prefix, imperative, **no issue numbers**.
- Body: explanation if needed, then `Closes #N` on its own line so the
  issue closes when the commit lands on `master`.

This is not just style — [release-please](https://github.com/googleapis/release-please)
parses these prefixes to decide version bumps and to write the changelog.
A mistyped prefix means a wrong or missing changelog entry.

Commits land directly on `master`; this repo does not use pull requests.

## Tests

Two layers:

| Command            | What                                    | When to run          |
|--------------------|-----------------------------------------|----------------------|
| `npm test`         | unit tests, node only, seconds          | before every commit  |
| `npm run test:e2e` | launches the real app, drives it, ~5 s  | before every push    |

The E2E suite needs a display (it opens the actual Electron window) and
uses a throwaway data directory — it never touches your real notes. See
`tests-e2e/README.md` for how seeding and the `STICKY_USER_DATA` hook work.

## Git hooks

The `.githooks/` directory carries these gates as hooks
(`pre-commit` → `npm test`, `pre-push` → `npm run test:e2e`).
They run locally, not on GitHub. Enable them once per clone:

```sh
git config core.hooksPath .githooks
```

Emergency bypass: `git commit --no-verify` / `git push --no-verify` —
use sparingly.

## Architecture ground rule

Zero runtime dependencies: the app loads plain scripts from `vendor/`
with no bundler. New libraries are vendored as single files (like React
and markdown-it), never added as npm runtime dependencies. `electron`
and `electron-builder` stay dev-only.
