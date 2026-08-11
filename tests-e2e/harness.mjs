// E2E harness: launches the real Electron app with an isolated userData dir,
// seeds notes.json before launch, connects over the Chrome DevTools Protocol
// (raw WebSocket — Node 22's built-in), and exposes small drivers for
// evaluate / mouse / keyboard. Every wait here is a bounded poll.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(APP_ROOT, 'node_modules', '.bin', 'electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll `fn` until it returns a truthy value; throw `label` on timeout.
// The single wait primitive for the suite — no bare sleeps as assertions.
export async function pollUntil(fn, { timeout = 5000, interval = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > deadline) throw new Error(`Timed out (${timeout}ms) waiting for ${label}`);
    await sleep(interval);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

/* ---------- deterministic seed ----------
 * notes.json is the whole persisted store (see withDefaults in utils.jsx):
 * { tweaks, folders, notes, links, cwd, view, drawer, folderOrder }.
 * Notes carry { id, folder, title, body, color, x, y, w, h, z, pinned } in
 * world coordinates; with view {x:0,y:0,z:1} and drawer closed, screen
 * position = world position + the desk's chrome offset (desk starts 54px
 * from the top of the web contents). All positions below stay inside a
 * 1400x900 window so every note box is fully in-viewport at launch.
 * tilt:false keeps notes unrotated so mouse-gesture geometry is exact.
 */
export const NOTE = {
  plain: 'e2e-plain',
  other: 'e2e-other',
  rich: 'e2e-rich',
  empty: 'e2e-empty',
  badMermaid: 'e2e-bad-mermaid',
};

export const PLAIN_BODY = 'alpha bravo charlie delta\necho foxtrot golf hotel\nindia juliet kilo lima';
export const OTHER_BODY = 'zulu yankee xray whiskey\nvictor uniform tango sierra';

export const RICH_BODY = [
  '### Alpha',
  '#### Beta',
  '',
  '1. one',
  '   1. sub',
  '2. two',
  '',
  '> quoted',
  '',
  '| a | b |',
  '| --- | --- |',
  '| c | d |',
  '',
  '```js',
  "console.log('hi')",
  '```',
  '',
  '```mermaid',
  'graph TD;',
  'A-->B;',
  '```',
  '',
  '[evil](javascript:alert(1))',
  'Visit www.example.com now',
].join('\n');

export const BAD_MERMAID_BODY = '```mermaid\nthis is !! not %% a diagram (((\n```';

function defaultSeed() {
  return {
    tweaks: { theme: 'paper', font: 'Inter', density: 'cozy', showLinks: true, tilt: false, hideNoteTitles: false },
    folders: {
      root: { id: 'root', name: 'All notes', parent: null, hue: '#888' },
      e2e: { id: 'e2e', name: 'E2E', parent: 'root', hue: '#5a82c9' },
    },
    notes: [
      { id: NOTE.plain, folder: 'e2e', title: 'Plain', body: PLAIN_BODY,
        color: 'yellow', x: 40, y: 40, w: 340, h: 200, z: 1, pinned: false },
      { id: NOTE.other, folder: 'e2e', title: 'Other', body: OTHER_BODY,
        color: 'blue', x: 520, y: 40, w: 260, h: 200, z: 2, pinned: false },
      { id: NOTE.badMermaid, folder: 'e2e', title: 'Bad mermaid', body: BAD_MERMAID_BODY,
        color: 'pink', x: 900, y: 40, w: 300, h: 230, z: 3, pinned: false },
      { id: NOTE.rich, folder: 'e2e', title: 'Rich', body: RICH_BODY,
        color: 'green', x: 40, y: 320, w: 380, h: 300, z: 4, pinned: false },
      { id: NOTE.empty, folder: 'e2e', title: 'Empty', body: '',
        color: 'peach', x: 520, y: 320, w: 260, h: 180, z: 5, pinned: false },
    ],
    links: [],
    cwd: 'root',
    view: { x: 0, y: 0, z: 1 },
    drawer: false,
    folderOrder: ['e2e'],
  };
}

/* ---------- launch ----------
 * `files` seeds extra files into the temp userData dir before the app
 * starts (relative path -> Buffer/string), e.g. images/<hash>.png for the
 * sticky-image:// protocol tests — anything the app expects to find on disk
 * at startup, alongside notes.json.
 */
export async function launch({ seed = defaultSeed(), files = {}, whatsNew = false } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-e2e-'));
  // seed:null leaves notes.json absent, which is how the app recognises a
  // genuine first install (see main.js app:first-run-sync).
  if (seed) fs.writeFileSync(path.join(userData, 'notes.json'), JSON.stringify(seed, null, 2));
  // Force a known window size so seeded positions are on-screen.
  fs.writeFileSync(path.join(userData, 'window.json'), JSON.stringify({ x: 0, y: 0, width: 1400, height: 900 }));
  for (const [rel, data] of Object.entries(files)) {
    const abs = path.join(userData, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
  }

  const port = await freePort();
  // detached:true puts Electron in its own process group so close() can kill
  // the whole tree (gpu/renderer children) via the tracked child PID only.
  const child = spawn(ELECTRON, ['.', `--remote-debugging-port=${port}`], {
    cwd: APP_ROOT,
    env: { ...process.env, STICKY_USER_DATA: userData },
    stdio: 'ignore',
    detached: true,
  });
  let exited = false;
  child.on('exit', () => { exited = true; });
  const killTree = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
  const emergency = () => killTree('SIGKILL');
  process.on('exit', emergency);

  let ws = null;
  const close = async () => {
    try { if (ws && ws.readyState === 1) ws.close(); } catch {}
    killTree('SIGTERM');
    try {
      await pollUntil(() => exited, { timeout: 3000, interval: 50, label: 'electron exit' });
    } catch {
      killTree('SIGKILL');
    }
    process.removeListener('exit', emergency);
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
  };

  try {
    // Wait for the DevTools endpoint, then for the page target.
    const page = await pollUntil(async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        return list.find((t) => t.type === 'page' && !/^devtools:/.test(t.url)) || null;
      } catch { return null; }
    }, { timeout: 15000, interval: 200, label: 'CDP page target' });

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('CDP WebSocket failed to connect'));
    });

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) reject(new Error(`CDP ${m.error.message || JSON.stringify(m.error)}`));
        else resolve(m.result);
      }
    };
    const cmd = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    await cmd('Runtime.enable');
    await cmd('Page.enable');

    const evaljs = async (expr) => {
      const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(`evaluate threw: ${r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)}`);
      }
      return r.result?.value;
    };

    /* ---------- input drivers (patterns from the CDP probe) ---------- */
    const click = async (x, y, { clickCount = 1 } = {}) => {
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount });
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount });
    };

    // Two press/release pairs with increasing clickCount — how Chromium
    // itself reports a double-click, and what makes React's onDoubleClick fire.
    const dblclick = async (x, y) => {
      await click(x, y, { clickCount: 1 });
      await sleep(60);
      await click(x, y, { clickCount: 2 });
      await sleep(60);
    };

    // Press at path[0], sweep through the rest, release at the end. The
    // 24ms cadence gives the app's rAF selection referee frames to run
    // between moves (matches the proven probe timing).
    const drag = async (pathPoints) => {
      const [start, ...rest] = pathPoints;
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(30);
      for (const p of rest) {
        await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 });
        await sleep(24);
      }
      const end = pathPoints.at(-1);
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(80);
    };

    const type = (text) => cmd('Input.insertText', { text });

    const KEYS = {
      Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    };
    const press = async (name) => {
      const k = KEYS[name];
      if (!k) throw new Error(`unknown key ${name}`);
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    };

    // Viewport rect of a note's rendered body (.md-body's padded container).
    const noteBodyRect = async (noteId) => {
      const r = await evaljs(`(() => {
        const body = document.querySelector('[data-note-id="${noteId}"] .md-body');
        if (!body) return null;
        const b = body.parentElement.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
      })()`);
      if (!r) throw new Error(`note ${noteId} has no rendered .md-body`);
      return r;
    };

    const screenshot = async (file) => {
      const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    };

    // App fully hydrated: React mounted, every seeded note rendered.
    const hydrated = () => pollUntil(
      () => evaljs(`document.querySelectorAll('[data-note-id] .md-body').length === ${(seed && seed.notes.length) || 0}`),
      { timeout: 20000, interval: 200, label: 'seeded notes to render' },
    );
    await hydrated();

    // A seeded profile looks like an upgrade, so the one-time what's-new
    // note opens over the canvas and would swallow every click and gesture.
    // Record the running version and reload so it stays shut — tests that
    // are ABOUT the note pass whatsNew:true and handle it themselves.
    if (!whatsNew) {
      await evaljs(`localStorage.setItem('stickies.whatsNewSeen', window.WHATS_NEW_ID), 1`);
      await cmd('Page.enable');
      await cmd('Page.reload');
      await hydrated();
    }

    return { cmd, evaljs, click, dblclick, drag, type, press, noteBodyRect, screenshot, pollUntil, sleep, userData, close };
  } catch (err) {
    await close();
    throw err;
  }
}
