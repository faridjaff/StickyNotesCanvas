# Sticky Notes

A spatial sticky-notes desktop app for **Linux** and **macOS**, also runnable in any **browser**. Each folder is its own canvas; notes drag, link, multi-select, zoom, and pan freely.

Built with Electron + React. Notes persist to a local JSON file (Electron) or the browser's `localStorage` (web). No account, no server, no telemetry.

---

## Install

### Pre-built downloads (recommended)

Grab the latest from [**Releases**](https://github.com/faridjaff/sticky-notes/releases/latest) and pick the file for your platform:

| Platform | File | How to install |
|---|---|---|
| **Ubuntu / Debian** | `sticky-notes_<ver>_amd64.deb` | `sudo dpkg -i sticky-notes_<ver>_amd64.deb` |
| **Linux (portable)** | `Sticky Notes-<ver>.AppImage` | `chmod +x` and double-click — no install needed |
| **macOS — Apple Silicon (M-series)** | `Sticky Notes-<ver>-arm64.dmg` | mount → drag to `/Applications` |
| **macOS — Intel** | `Sticky Notes-<ver>.dmg` | mount → drag to `/Applications` |

#### Note for macOS

The macOS builds are not code-signed. If your Mac refuses to open the downloaded app, build from source instead — instructions below.

### Web (no install)

Hosted version: <https://faridjaff.github.io/sticky-notes/>. Each visitor's notes live in their own browser's `localStorage` — separate from any other browser, separate from the desktop app. Survives refresh; cleared if you wipe site data.

---

## Build from source

### Prerequisites

- **Node.js 20+** and **npm**
- **macOS only:** Xcode Command Line Tools — `xcode-select --install`
- **Linux only:** nothing extra; `electron-builder` fetches `fpm` (for `.deb` packaging) on first build

### Clone and install

```bash
git clone git@github.com:faridjaff/sticky-notes.git
cd sticky-notes
npm install
```

### Build and install

#### Linux

```bash
npm run build:linux
sudo dpkg -i "dist/sticky-notes_$(node -p 'require(\"./package.json\").version')_amd64.deb"
```

The app appears in your Activities menu as **Sticky Notes**. To uninstall later: `sudo apt remove sticky-notes`.

#### macOS

```bash
npm run build:mac
cp -R "dist/mac-arm64/Sticky Notes.app" /Applications/
```

(Use `dist/mac/Sticky Notes.app` instead if you're on an Intel Mac.)

Launch from Spotlight (`Cmd+Space` → "Sticky Notes") or from Launchpad. To uninstall later, drag the app from `/Applications` to the Trash.

---

## Where your notes live

| | Path |
|---|---|
| Linux | `~/.config/sticky-notes/notes.json` |
| macOS | `~/Library/Application Support/sticky-notes/notes.json` |
| Browser | `localStorage` key `stickies.all` |

The JSON format is identical across all three — export from one, import into another. Use **Backup ▾ → Export Notes…** in the top chrome to download a portable JSON; **Import Notes…** to load one back.

---

## License

[MIT](LICENSE) — © 2026 faridjaff.
