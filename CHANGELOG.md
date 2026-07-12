# Changelog

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
