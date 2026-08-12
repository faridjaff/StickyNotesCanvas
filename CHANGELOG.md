# Changelog

## [2.2.1](https://github.com/faridjaff/StickyNotesCanvas/compare/v2.2.0...v2.2.1) (2026-08-12)


### Bug Fixes

* make markdown headings clearly larger than body text ([7c8a88d](https://github.com/faridjaff/StickyNotesCanvas/commit/7c8a88df317be5cffbe94de5a87a6cf9a9599a39))

## [2.2.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v2.1.0...v2.2.0) (2026-08-12)


### Features

* hide the menu bar by default ([09699a7](https://github.com/faridjaff/StickyNotesCanvas/commit/09699a7dce81cb110576fbdc113073cde6a7558b)), closes [#42](https://github.com/faridjaff/StickyNotesCanvas/issues/42)
* import a markdown file as a note ([643bba6](https://github.com/faridjaff/StickyNotesCanvas/commit/643bba6c2769da6fc919fa1ec7c3c92cb807d7aa)), closes [#44](https://github.com/faridjaff/StickyNotesCanvas/issues/44)
* include images in backups and copied notes ([c9aadf9](https://github.com/faridjaff/StickyNotesCanvas/commit/c9aadf9e161169e7904c36cbf47db0de84fd4754)), closes [#38](https://github.com/faridjaff/StickyNotesCanvas/issues/38)
* open the editor at the double-clicked word ([f3021b7](https://github.com/faridjaff/StickyNotesCanvas/commit/f3021b7b0312542fd602e4afd7a4ab1a7aeab5ae)), closes [#35](https://github.com/faridjaff/StickyNotesCanvas/issues/35)
* zoom the canvas with keyboard shortcuts ([e195e63](https://github.com/faridjaff/StickyNotesCanvas/commit/e195e634f130bd076e0823733c30c2b64b3b7c6d)), closes [#45](https://github.com/faridjaff/StickyNotesCanvas/issues/45)


### Bug Fixes

* make hover states visible in every theme ([e8de445](https://github.com/faridjaff/StickyNotesCanvas/commit/e8de44538a0d69923ea27ad699794959a8779d7f)), closes [#49](https://github.com/faridjaff/StickyNotesCanvas/issues/49)

## [2.1.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v2.0.1...v2.1.0) (2026-08-11)


### Features

* add images from a file by drag and drop or the file picker ([0ba02e6](https://github.com/faridjaff/StickyNotesCanvas/commit/0ba02e62cce7eb07efe9e0d82f7214489bdfb35c))


### Bug Fixes

* give each editing session its own undo step ([e9a7dc7](https://github.com/faridjaff/StickyNotesCanvas/commit/e9a7dc7ef13968f78c81d6e8c56258091184a81b))
* read pasted images from the clipboard in the main process ([79b0272](https://github.com/faridjaff/StickyNotesCanvas/commit/79b02722c3dc357fc081c20ac5586dd9d9103626))

## [2.0.1](https://github.com/faridjaff/StickyNotesCanvas/compare/v2.0.0...v2.0.1) (2026-08-11)


### Bug Fixes

* show the what's new note to users upgrading from 1.8.0 ([20afb1b](https://github.com/faridjaff/StickyNotesCanvas/commit/20afb1b5810d02ababd51d8b794d3a1051ac6b07))
* tie the what's new note to the 2.0 announcement, not every version bump ([90ef1eb](https://github.com/faridjaff/StickyNotesCanvas/commit/90ef1eb903fed83c12e1d828b781fed2ca81eef4))

## [2.0.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.8.0...v2.0.0) (2026-08-11)


### Features

* add download item to note context menu ([a6a350c](https://github.com/faridjaff/StickyNotesCanvas/commit/a6a350c59a31fd4e733a5abb877cc7055ec7395a)), closes [#28](https://github.com/faridjaff/StickyNotesCanvas/issues/28)
* adopt markdown-it for full CommonMark support ([279d9fd](https://github.com/faridjaff/StickyNotesCanvas/commit/279d9fd23ac70391ca1358868783d3b429f0d722)), closes [#21](https://github.com/faridjaff/StickyNotesCanvas/issues/21) [#32](https://github.com/faridjaff/StickyNotesCanvas/issues/32)
* paste images into notes ([1c91b5f](https://github.com/faridjaff/StickyNotesCanvas/commit/1c91b5f7e730fe29e742445f51f91e4575d65d98)), closes [#25](https://github.com/faridjaff/StickyNotesCanvas/issues/25)
* paste plain text on the canvas as a new note ([cb3ac9a](https://github.com/faridjaff/StickyNotesCanvas/commit/cb3ac9a53042e2bfe305321fc2f3ba0a5a22c39e)), closes [#29](https://github.com/faridjaff/StickyNotesCanvas/issues/29)
* render Mermaid diagrams in code fences ([4070065](https://github.com/faridjaff/StickyNotesCanvas/commit/407006543018c0baa4d8233e60ac726457802e71)), closes [#31](https://github.com/faridjaff/StickyNotesCanvas/issues/31)
* select note text in preview without entering edit mode ([a808cbe](https://github.com/faridjaff/StickyNotesCanvas/commit/a808cbee19b79195d500d2aa3a35a59ec0e9789b)), closes [#30](https://github.com/faridjaff/StickyNotesCanvas/issues/30)
* show a one-time what's new note after updating ([3f63b3c](https://github.com/faridjaff/StickyNotesCanvas/commit/3f63b3c80f335c83f14978028e498404add5f1b1))
* support pinch-to-zoom gestures ([1a714bd](https://github.com/faridjaff/StickyNotesCanvas/commit/1a714bd9bbdc3d437ea120cd86e3a06b965be846)), closes [#17](https://github.com/faridjaff/StickyNotesCanvas/issues/17)


### Bug Fixes

* explain unsupported and web-demo image pastes with a toast ([fc41bbf](https://github.com/faridjaff/StickyNotesCanvas/commit/fc41bbf872becea3812e0391bef0c98c146f1da4))
* improve touch dragging for sticky notes ([4d71890](https://github.com/faridjaff/StickyNotesCanvas/commit/4d7189049bfa882a3ec911c49b6921b964acd39b)), closes [#18](https://github.com/faridjaff/StickyNotesCanvas/issues/18)
* keep reference lines and indented text rendering as plain text ([0bcc3b9](https://github.com/faridjaff/StickyNotesCanvas/commit/0bcc3b9c4faa8a16b201da1319f794b200afcda2))
* render preview whitespace identical to edit mode ([e840165](https://github.com/faridjaff/StickyNotesCanvas/commit/e8401659b486f7f08a62af5d0e2a9ca886a589a6)), closes [#26](https://github.com/faridjaff/StickyNotesCanvas/issues/26)


### Reverts

* paste-error toasts for unsupported and web-demo image pastes ([60edc8a](https://github.com/faridjaff/StickyNotesCanvas/commit/60edc8afa6efa4e8fbf21dd1c727eafa16e76278))


### Miscellaneous Chores

* cut the 2.0 major release ([45be2be](https://github.com/faridjaff/StickyNotesCanvas/commit/45be2be57a5eb6f4800b3ef3a863ea964aa065b3))

## [1.8.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.7.1...v1.8.0) (2026-07-12)


### Features

* add subfolder support for organizing notes ([5d13ccd](https://github.com/faridjaff/StickyNotesCanvas/commit/5d13ccd5ee6395396cd50dad32a4330c36b2751d)), closes [#14](https://github.com/faridjaff/StickyNotesCanvas/issues/14)
* support web links in notes with paste-to-link editing ([28c1797](https://github.com/faridjaff/StickyNotesCanvas/commit/28c1797c0412ccdf62e843d82b21d775927f86fb))


### Bug Fixes

* add bottom-bar drag handle so notes stay movable when the header is off-screen ([b451ac1](https://github.com/faridjaff/StickyNotesCanvas/commit/b451ac171350e0691bc848b011b30e4a79c45c82)), closes [#16](https://github.com/faridjaff/StickyNotesCanvas/issues/16)
* let note context menus extend past the note borders ([6abf72e](https://github.com/faridjaff/StickyNotesCanvas/commit/6abf72e3f915a4687b53e05c687da861e79ace7a)), closes [#13](https://github.com/faridjaff/StickyNotesCanvas/issues/13)
* make markdown emphasis respect code spans and word boundaries ([5ef9cfe](https://github.com/faridjaff/StickyNotesCanvas/commit/5ef9cfeef9a6324a6b9d8729a1528cbfac8e56b6)), closes [#12](https://github.com/faridjaff/StickyNotesCanvas/issues/12)
* warn before a backup restore replaces all existing data ([935ac0c](https://github.com/faridjaff/StickyNotesCanvas/commit/935ac0ce00e4d3a5863174d42ab07cebdd3d019c)), closes [#22](https://github.com/faridjaff/StickyNotesCanvas/issues/22)

## [1.7.1](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.7.0...v1.7.1) (2026-06-20)


### Bug Fixes

* scale up the Handwritten font so it matches the others ([7305a19](https://github.com/faridjaff/StickyNotesCanvas/commit/7305a19b62b509e9eed0bd9a2ab593051a7c0926))

## [1.7.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.6.2...v1.7.0) (2026-06-09)


### Features

* continue and indent markdown bullet lists in the note editor ([a34c563](https://github.com/faridjaff/StickyNotesCanvas/commit/a34c5633aaa515e894bd1722fc0c09cfd2c16f7d))


### Bug Fixes

* keep the canvas aligned after a note gets focus ([be63b94](https://github.com/faridjaff/StickyNotesCanvas/commit/be63b945f7d0071b0de471f4d9c5e1bda1be5d7d))

## [1.6.2](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.6.1...v1.6.2) (2026-05-09)


### Bug Fixes

* bundle fonts so the font picker works offline and on flathub ([98503ac](https://github.com/faridjaff/StickyNotesCanvas/commit/98503ac3ab0372cf551c932ae85f5bcc2996419f))

## [1.6.1](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.6.0...v1.6.1) (2026-05-09)


### Bug Fixes

* paste places notes inside the visible viewport ([bbe3c41](https://github.com/faridjaff/StickyNotesCanvas/commit/bbe3c414d847fe5017c37c44d3933212003ea2a1))

## [1.6.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.5.0...v1.6.0) (2026-05-09)


### Features

* add "Hide note titles" preference ([2ccfa9a](https://github.com/faridjaff/StickyNotesCanvas/commit/2ccfa9acd65742b25220ca4c1ac5a278e477c7cc))
* random colors for AI-pasted notes ([ed5e161](https://github.com/faridjaff/StickyNotesCanvas/commit/ed5e1612c2caf537a39ce055db6e1c4cc15c4356))
* save inline note edits with Ctrl/Cmd+Enter ([f0281d8](https://github.com/faridjaff/StickyNotesCanvas/commit/f0281d824ee87e5a5540f7d4dbc63fdb417e26b1))
* support RTL languages via dir=auto on all user-text elements ([497567f](https://github.com/faridjaff/StickyNotesCanvas/commit/497567fe0c912fc14413cf11abb29d22b08ec252))


### Bug Fixes

* terminal theme font applies to all chrome elements ([971978b](https://github.com/faridjaff/StickyNotesCanvas/commit/971978bd88aa35463b3522c711f3a08736093bc2))

## [1.5.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.4.0...v1.5.0) (2026-04-20)


### Features

* import notes from a photo via your AI ([5c5d67e](https://github.com/faridjaff/StickyNotesCanvas/commit/5c5d67eae23cf8d7b21afe25a0c87b4add52d38e))

## [1.4.0](https://github.com/faridjaff/StickyNotesCanvas/compare/v1.3.6...v1.4.0) (2026-04-20)


### Features

* flatpak-aware update banner ([47a6ff9](https://github.com/faridjaff/StickyNotesCanvas/commit/47a6ff94beb06ec1acaedf183c152e1f37cc772f))


### Bug Fixes

* drop ineffective ozone switches from main.js ([ed90c07](https://github.com/faridjaff/StickyNotesCanvas/commit/ed90c0757c049902791d5c1aaf32a808191b25cc))
* force Wayland ozone backend when WAYLAND_DISPLAY is set ([7ef1eb5](https://github.com/faridjaff/StickyNotesCanvas/commit/7ef1eb53ab81dfe18f9264fdb8a2ec679b7d961f))
* hide Check for Updates menu under snap/flatpak ([376cc86](https://github.com/faridjaff/StickyNotesCanvas/commit/376cc867af3e9098cecab9c3673ae1a21ba13302))
* include split jsx files in electron-builder file allowlist ([4a1be04](https://github.com/faridjaff/StickyNotesCanvas/commit/4a1be04b709c1276bd107d83bd8cda987e4ee0f0))
* prefer Wayland on Linux via ozone-platform-hint=auto ([753b285](https://github.com/faridjaff/StickyNotesCanvas/commit/753b285c9a7a9f1b50cb28380bb5755e6c44c46a))
* preserve cross-boundary links on cut/paste ([99d654f](https://github.com/faridjaff/StickyNotesCanvas/commit/99d654f77ca204595ba89c1b8faa62e95499bd8f))
