const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ---------- TWEAKABLE DEFAULTS ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "font": "Inter",
  "density": "cozy",
  "showLinks": true,
  "tilt": true,
  "hideNoteTitles": false
}/*EDITMODE-END*/;

/* ---------- COLOR PALETTES ---------- */
const NOTE_COLORS = [
  { id: "red",    name: "Red",     paper: "#f8a6a0", flat: "#ffc2bd", term: "#f8a6a0", ink: "#3a1410" },
  { id: "pink",   name: "Pink",    paper: "#f8c6d4", flat: "#ffd5e0", term: "#f8c6d4", ink: "#3a1220" },
  { id: "blue",   name: "Blue",    paper: "#b6dbf5", flat: "#cfe6f9", term: "#b6dbf5", ink: "#0f2b44" },
  { id: "green",  name: "Green",   paper: "#c7e7b8", flat: "#d5edc8", term: "#c7e7b8", ink: "#143318" },
  { id: "yellow", name: "Yellow",  paper: "#fde8a1", flat: "#fff4c2", term: "#fde8a1", ink: "#3a2f12" },
  { id: "peach",  name: "Peach",   paper: "#fbd0b5", flat: "#ffddc6", term: "#fbd0b5", ink: "#3a1a08" },
  { id: "lilac",  name: "Lilac",   paper: "#d9c6f0", flat: "#e1d2f5", term: "#d9c6f0", ink: "#2a174a" },
  { id: "white",  name: "Paper",   paper: "#fafaf4", flat: "#ffffff", term: "#fafaf4", ink: "#222" },
];

const FOLDER_HUES = ["#d97757","#5a82c9","#8a6fbf","#4c9e6b","#c4843a","#b84a6b","#3fa89a","#8a8f3d"];

/* ---------- SEED DATA ----------
 * Folder tree; each folder has its own notes with x/y positions.
 * "root" is the top-level folder.
 */
const SEED = {
  folders: {
    root:      { id: "root", name: "All notes", parent: null, hue: "#888" },
    workflow:  { id: "workflow", name: "Workflow", parent: "root", hue: FOLDER_HUES[1] },
    eng:       { id: "eng",      name: "Eng Design", parent: "root", hue: FOLDER_HUES[3] },
    home:      { id: "home",     name: "Home",       parent: "root", hue: FOLDER_HUES[0] },
    personal:  { id: "personal", name: "Personal",   parent: "root", hue: FOLDER_HUES[2] },
    sprints:   { id: "sprints",  name: "Sprints",    parent: "workflow", hue: FOLDER_HUES[4] },
    reviews:   { id: "reviews",  name: "Reviews",    parent: "workflow", hue: FOLDER_HUES[5] },
  },
  notes: [
    { id: "n1", folder: "home", title: "Groceries",
      body: "# Weekend run\n- **Sourdough** from Arnaud's\n- _olive oil_ — the green one\n- Tomatoes (vine)\n- Parmesan",
      color: "yellow", x: 60, y: 60, w: 280, h: 240, pinned: true },
    { id: "n2", folder: "home", title: "Dinner: friday",
      body: "Cacio e pepe, simple salad. Wine: the Gavi in the rack.\n\nNeed: parm, pepper, lemon.",
      color: "peach", x: 370, y: 120, w: 260, h: 180, pinned: false },
    { id: "n3", folder: "eng", title: "Kernel 6.9 notes",
      body: "## Build flags\n`CONFIG_PREEMPT_RT=y`\n\n- check scheduler patch\n- rerun `make menuconfig`\n- benchmark against 6.8",
      color: "blue", x: 60, y: 70, w: 300, h: 230, pinned: false },
    { id: "n4", folder: "workflow", title: "Standup",
      body: "**Yday:** fixed dnd bug\n**Today:** review PR #4412\n**Blockers:** waiting on infra",
      color: "green", x: 70, y: 60, w: 260, h: 180, pinned: true },
    { id: "n5", folder: "personal", title: "Reading list",
      body: "- The Pragmatic Programmer\n- Thinking in Systems — _Meadows_\n- Re-read: Unix Philosophy",
      color: "lilac", x: 80, y: 80, w: 270, h: 200, pinned: false },
    { id: "n6", folder: "home", title: "Router reboot",
      body: "ssh admin@10.0.0.1\n`reboot now`\n\nCheck DHCP lease table afterwards.",
      color: "pink", x: 660, y: 110, w: 260, h: 170, pinned: false },
    { id: "n7", folder: "sprints", title: "Sprint 42 scope",
      body: "## This sprint\n- onboarding polish\n- dnd quick fix\n- dogfood search",
      color: "yellow", x: 80, y: 60, w: 280, h: 200, pinned: false },
    { id: "n8", folder: "reviews", title: "PR checklist",
      body: "- tests pass\n- no new warnings\n- **a11y** audit\n- screenshot attached",
      color: "green", x: 90, y: 80, w: 260, h: 180, pinned: false },
    { id: "n9", folder: "eng", title: "Button variants",
      body: "primary / secondary / ghost / destructive\n\nfocus ring: 2px accent, 2px offset",
      color: "blue", x: 90, y: 70, w: 280, h: 170, pinned: false },
    { id: "n10", folder: "workflow", title: "Goals Q2",
      body: "## Goals\n1. Ship sync\n2. Offline mode\n3. 1k weekly actives",
      color: "peach", x: 360, y: 80, w: 260, h: 180, pinned: false },
  ],
  links: [
    { id: "l1", from: "n1", to: "n2" },
    { id: "l2", from: "n7", to: "n4" },
    { id: "l3", from: "n9", to: "n8" },
  ],
};

/* ---------- MARKDOWN ---------- */
function mdToHtml(src) {
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const inline = s => {
    s = esc(s);
    // Pull code spans out FIRST so emphasis markers inside them stay literal
    // (issue #12: `CONFIG_PREEMPT_RT=y` must not italicize). The \x00/\x01
    // sentinels can't occur in note text (inputs strip control characters),
    // so they're safe stashes.
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(`<code>${code}</code>`);
      return `\x00${codes.length - 1}\x00`;
    });
    // Backslash-escaped markers render literally (CommonMark), but NOT inside
    // code spans — which is why this runs after the code stash above.
    const escapes = [];
    s = s.replace(/\\([*_`])/g, (_, ch) => {
      escapes.push(ch);
      return `\x01${escapes.length - 1}\x01`;
    });
    // Web links, http(s)-only by construction so javascript:/file:/data:
    // URLs can never become clickable. URLs are stashed like code spans
    // (their underscores must stay literal); link TEXT stays in the stream
    // between \x02/\x03 markers so emphasis inside it still renders.
    // data-weblink is what the note-body click delegate dispatches on.
    const attr = u => u.replace(/"/g, '&quot;');
    const links = [];
    // [text](url) — a leading ! is unsupported image syntax: stash the whole
    // match verbatim so it renders exactly as typed.
    s = s.replace(/(!?)\[([^\]]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/gi, (m, bang, text, url) => {
      if (bang) { codes.push(m); return `\x00${codes.length - 1}\x00`; }
      links.push(`<a href="${attr(url)}" data-weblink="${attr(url)}">`);
      return `\x02${links.length - 1}\x02${text}\x03`;
    });
    // Bare URLs auto-link (URL as text). One balanced (...) group may belong
    // to the URL (Wikipedia); trailing punctuation stays outside the link.
    // The &lt;/&gt; lookaheads stop at what was a real < or > before esc().
    s = s.replace(/(^|[\s(])(https?:\/\/(?:(?!&lt;|&gt;)[^\s()"])+(?:\((?:(?!&lt;|&gt;)[^\s()"])*\))?(?:(?!&lt;|&gt;)[^\s()"])*)/gi, (m, pre, url) => {
      const trail = (url.match(/[.,;:!?_*~]+$/) || [''])[0];
      if (trail) url = url.slice(0, -trail.length);
      if (!/^https?:\/\/./i.test(url)) return m;
      codes.push(`<a href="${attr(url)}" data-weblink="${attr(url)}">${url}</a>`);
      return `${pre}\x00${codes.length - 1}\x00${trail}`;
    });
    // Emphasis follows CommonMark's flanking rules, approximated: '*' works
    // intraword but not space-padded; '_' only at word edges, so snake_case
    // and CONFIG_PREEMPT_RT stay literal. A word edge is start/end of line,
    // whitespace, punctuation/symbols, or a stashed span (\x00-\x03).
    s = s.replace(/\*\*([^\s*](?:.*?[^\s*])?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s\p{P}\p{S}\x00-\x03])__([^\s_](?:.*?[^\s_])?)__(?=[\s\p{P}\p{S}\x00-\x03]|$)/gu, '$1<strong>$2</strong>');
    s = s.replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '<em>$1</em>');
    s = s.replace(/(^|[\s\p{P}\p{S}\x00-\x03])_([^\s_](?:.*?[^\s_])?)_(?=[\s\p{P}\p{S}\x00-\x03]|$)/gu, '$1<em>$2</em>');
    s = s.replace(/\x02(\d+)\x02/g, (_, i) => links[i]);
    s = s.replace(/\x03/g, '</a>');
    s = s.replace(/\x01(\d+)\x01/g, (_, i) => escapes[i]);
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => codes[i]);
    return s;
  };
  const lines = src.split('\n');
  let out = '';
  let items = null; // buffered bullet items [{depth, html}] while inside a list

  // Emit the buffered list as nested <ul>/<li>. A sub-list nests INSIDE the
  // preceding <li> (valid HTML, not <ul> directly in <ul>). Indentation maps
  // to depth at INDENT_UNIT (2) columns per level; a tab counts as 2 columns.
  // A flat list (every item at depth 0) renders identically to the old output.
  const flush = () => {
    if (!items) return;
    let prev = -1;       // normalized depth of the previous item
    let liOpen = false;  // is the current <li> still awaiting its </li>?
    for (const it of items) {
      // Clamp so depth never jumps more than one level past the previous item.
      const depth = prev < 0 ? 0 : Math.min(it.depth, prev + 1);
      if (prev < 0) {
        out += '<ul dir="auto">';
      } else if (depth > prev) {
        for (let k = prev; k < depth; k++) out += '<ul dir="auto">'; // nest inside the open <li>
        liOpen = false;
      } else if (depth < prev) {
        if (liOpen) { out += '</li>'; liOpen = false; }
        for (let k = prev; k > depth; k--) out += '</ul></li>';
      } else if (liOpen) {
        out += '</li>'; liOpen = false;
      }
      out += `<li dir="auto">${it.html}`;
      liOpen = true;
      prev = depth;
    }
    if (liOpen) out += '</li>';
    for (let k = prev; k > 0; k--) out += '</ul></li>';
    out += '</ul>';
    items = null;
  };

  for (let ln of lines) {
    if (/^\s*#\s/.test(ln))  { flush(); out += `<h3 dir="auto">${inline(ln.replace(/^\s*#\s/,''))}</h3>`; continue; }
    if (/^\s*##\s/.test(ln)) { flush(); out += `<h4 dir="auto">${inline(ln.replace(/^\s*##\s/,''))}</h4>`; continue; }
    const bm = ln.match(/^(\s*)[-*]\s+(.*)$/);
    if (bm) {
      const depth = Math.floor(bm[1].replace(/\t/g, '  ').length / 2);
      if (!items) items = [];
      items.push({ depth, html: inline(bm[2]) });
      continue;
    }
    if (ln.trim() === '') { flush(); continue; }
    flush();
    out += `<p dir="auto">${inline(ln)}</p>`;
  }
  flush();
  return out;
}

// One indent level for markdown bullet lists, in the note-body editor.
const LIST_INDENT = '  ';

// Pressing Enter inside the note body: continue / exit a markdown bullet list.
// Pure: takes the textarea value + collapsed caret, returns a minimal edit
// descriptor {start, end, text, caret} to apply (the handler runs it through
// execCommand so native undo survives), or null to let the default newline fire.
function editListOnEnter(value, selStart, selEnd, shiftKey) {
  if (shiftKey) return null;            // Shift+Enter = plain newline escape hatch
  if (selStart !== selEnd) return null; // a spanning selection -> default
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selStart);
  if (lineEnd === -1) lineEnd = value.length;
  const m = value.slice(lineStart, lineEnd).match(/^(\s*)([-*])(\s+)(.*)$/);
  if (!m) return null;                  // not a bullet line
  const [, indent, marker, spaces, content] = m;
  // Caret sitting in the indent/marker (not yet in the content) -> default.
  if (selStart < lineStart + indent.length + marker.length + spaces.length) return null;
  if (content.trim() === '') {
    // Empty item: drop the marker (and its indent) — this ends the list.
    return { start: lineStart, end: lineEnd, text: '', caret: lineStart };
  }
  // Non-empty item: open a fresh item with the same indent + marker.
  const text = `\n${indent}${marker} `;
  return { start: selStart, end: selStart, text, caret: selStart + text.length };
}

// Pressing Tab / Shift+Tab on a bullet line: indent / outdent one level.
// Same pure-edit-descriptor contract as editListOnEnter; null = default Tab.
function editListOnTab(value, selStart, selEnd, outdent) {
  if (value.slice(selStart, selEnd).includes('\n')) return null; // multi-line selection -> default
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selStart);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);
  if (!/^(\s*)[-*]\s+/.test(line)) return null; // only bullet lines indent
  if (!outdent) {
    return { start: lineStart, end: lineStart, text: LIST_INDENT, caret: selStart + LIST_INDENT.length };
  }
  const lead = line.match(/^[ \t]*/)[0];
  if (lead.length === 0) return null;           // nothing to outdent
  const remove = lead[0] === '\t' ? 1 : Math.min(LIST_INDENT.length, lead.length);
  return { start: lineStart, end: lineStart + remove, text: '', caret: Math.max(lineStart, selStart - remove) };
}
// Pasting over a selection in the note body: if the clipboard is a single
// http(s) URL, wrap the selection Slack-style as [selection](url) — or, when
// the selection is exactly one [word](url) link already, swap in the new URL
// and keep the word. Same pure edit-descriptor contract as editListOnEnter;
// null means "not a link paste" — let the browser's default paste run.
// Wrapping never fires when it would emit broken markdown (selection with
// brackets or newlines) or fight an obvious intent (selection is a URL).
function editLinkOnPaste(value, selStart, selEnd, pasted) {
  if (selStart === selEnd) return null;
  const url = (pasted || '').trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const sel = value.slice(selStart, selEnd);
  const link = sel.match(/^\[([^\]]+)\]\(https?:\/\/[^\s)]+\)$/i);
  let text;
  if (link) text = `[${link[1]}](${url})`;
  else if (/^https?:\/\//i.test(sel.trim()) || /[\n\[\]]/.test(sel)) return null;
  else text = `[${sel}](${url})`;
  return { start: selStart, end: selEnd, text, caret: selStart + text.length };
}

// Open a note's web link outside the app: default browser under Electron
// (http/https re-checked in the main process), new tab in the web demo.
function openWebLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.stickyAPI && window.stickyAPI.openExternal) window.stickyAPI.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
/* Returns 'rtl' if the first strong bidi character in text is RTL, else 'ltr'. */
function firstStrongDir(text = '') {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (
      // Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic Extended-A/B
      (cp >= 0x0590 && cp <= 0x08FF) ||
      // Hebrew/Arabic Presentation Forms
      (cp >= 0xFB1D && cp <= 0xFDFF) ||
      (cp >= 0xFE70 && cp <= 0xFEFF) ||
      // Hanifi Rohingya, Yezidi, Arabic Extended-C, Old Uyghur, Chorasmian, Elymaic
      (cp >= 0x10D00 && cp <= 0x10FFF) ||
      // Mende Kikakui, Adlam, Arabic Mathematical Alphabetic Symbols
      (cp >= 0x1E800 && cp <= 0x1EFFF)
    ) return 'rtl';
    // Any other Unicode letter (Latin, Greek, Cyrillic, Armenian, CJK, Devanagari, Thai, …)
    if (/\p{L}/u.test(ch)) return 'ltr';
  }
  return 'ltr';
}
/* ---------- Browser-side file helpers (used when window.stickyAPI is absent) ---------- */
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function pickJSONFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch { resolve(null); }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

/* ---------- FOLDER TREE HELPERS ----------
 * Folders form a tree through each folder's `parent` field: 'root' is the
 * top level (it renders as "All notes" and is not a real folder row), any
 * other value is the id of the enclosing folder. Every helper here is
 * cycle-safe so a hand-edited or corrupt store can never hang the UI.
 */

// Repair folder parents on load: every non-root folder must point at an
// existing folder (unknown/missing/self parents fall back to 'root'), and
// parent cycles are broken by re-parenting the first offender to 'root'.
// Also guarantees the 'root' entry itself exists.
function sanitizeFolderParents(rawFolders) {
  const folders = { ...(rawFolders || {}) };
  if (!folders.root) folders.root = { id: 'root', name: 'All notes', parent: null, hue: '#888' };
  for (const f of Object.values(folders)) {
    if (f.id === 'root') continue;
    if (!f.parent || f.parent === f.id || !folders[f.parent]) {
      folders[f.id] = { ...f, parent: 'root' };
    }
  }
  for (const f of Object.values(folders)) {
    if (f.id === 'root') continue;
    const seen = new Set([f.id]);
    let cur = folders[f.id].parent;
    while (cur && cur !== 'root') {
      if (seen.has(cur)) { folders[f.id] = { ...folders[f.id], parent: 'root' }; break; }
      seen.add(cur);
      cur = folders[cur] ? folders[cur].parent : null;
    }
  }
  return folders;
}

// Every folder id in the subtree rooted at `id`, including `id` itself.
function folderSubtreeIds(folders, id) {
  const out = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const f of Object.values(folders)) {
      if (f.id !== 'root' && f.parent === cur && !out.has(f.id)) {
        out.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return out;
}

// True if folder `id` may be re-parented under `newParent` without creating
// a cycle (a folder can't move into itself or its own subtree).
function canMoveFolder(folders, id, newParent) {
  if (!newParent || id === 'root' || !folders[id]) return false;
  if (newParent !== 'root' && !folders[newParent]) return false;
  return !folderSubtreeIds(folders, id).has(newParent);
}

// Folder names from the top level down to `id`, e.g. ['Work', 'Sprints'].
// Used for breadcrumb display. Empty array for 'root' / unknown ids.
function folderPath(folders, id) {
  const names = [];
  const seen = new Set();
  let cur = id;
  while (cur && cur !== 'root' && folders[cur] && !seen.has(cur)) {
    seen.add(cur);
    names.unshift(folders[cur].name);
    cur = folders[cur].parent;
  }
  return names;
}

// DFS-flattened folder tree for list rendering: [{id, depth, hasChildren}].
// Sibling order follows `folderOrder` (stale ids ignored), with folders not
// yet in the order sorted after them alphabetically — the same contract the
// flat drawer list used before nesting existed.
function flattenFolderTree(folders, folderOrder) {
  const rank = new Map((folderOrder || []).map((id, i) => [id, i]));
  const childrenOf = (pid) => Object.values(folders)
    .filter(f => f.id !== 'root' && f.parent === pid)
    .sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  const out = [];
  const walk = (pid, depth, seen) => {
    for (const f of childrenOf(pid)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, depth, hasChildren: childrenOf(f.id).length > 0 });
      walk(f.id, depth + 1, seen);
    }
  };
  walk('root', 0, new Set());
  return out;
}

/* ---------- Persisted store (Electron-aware) ---------- */
function withDefaults(raw) {
  const src = raw || {};
  // First-paint default for the folders drawer. On mobile (narrow viewport,
  // no Electron bridge), default closed so the canvas is visible on load;
  // on desktop, default open. Once the user toggles it, that choice is
  // persisted as a boolean and this branch never re-runs for that user.
  // Matches the viewport threshold used by MobileDemoBanner.
  const defaultDrawer = (typeof window !== 'undefined'
    && !window.stickyAPI
    && window.innerWidth <= MOBILE_BANNER_MAX_WIDTH) ? false : true;
  return {
    tweaks:  src.tweaks  ?? TWEAK_DEFAULTS,
    // Sanitize on every load so pre-subfolder stores (and imported backups
    // with broken parent links) always hydrate into a valid folder tree.
    folders: sanitizeFolderParents(src.folders ?? SEED.folders),
    notes:   src.notes   ?? SEED.notes,
    links:   src.links   ?? (SEED.links || []),
    cwd:     src.cwd     ?? 'root',
    view:    src.view    ?? { x: 0, y: 0, z: 1 },
    drawer:  typeof src.drawer === 'boolean' ? src.drawer : defaultDrawer,
    folderOrder: Array.isArray(src.folderOrder) ? src.folderOrder : [],
  };
}
/* ---------- THEME TOKENS ---------- */
function themeTokens(theme) {
  if (theme === 'terminal') {
    return {
      wallpaper: 'radial-gradient(1200px 800px at 20% 10%, #1b2028 0%, #0e1116 60%, #0a0c10 100%)',
      panelBg: '#141a22', panelBorder: '#2a3340', panelText: '#cfe0d4',
      accent: '#8fd27a', muted: '#7b8a9a', hairline: '#1d2530',
      noteShadow: '0 0 0 1px #2a3340, 0 8px 22px rgba(0,0,0,.5)',
      noteRadius: '4px',
      bodyFont: '"JetBrains Mono", "IBM Plex Mono", monospace',
      folderBg: '#1a2230', folderBorder: '#2f3b4c',
    };
  }
  if (theme === 'flat') {
    return {
      wallpaper: 'linear-gradient(135deg,#e9edf2 0%, #dde3eb 100%)',
      panelBg: '#ffffff', panelBorder: '#d6dce4', panelText: '#1f2430',
      accent: '#3584e4', muted: '#6a7383', hairline: '#eaeef3',
      noteShadow: '0 1px 2px rgba(20,30,50,.06), 0 6px 20px rgba(20,30,50,.08)',
      noteRadius: '10px',
      bodyFont: 'Inter, system-ui, sans-serif',
      folderBg: '#f3f5f9', folderBorder: '#d6dce4',
    };
  }
  return {
    wallpaper: "linear-gradient(180deg,#efe8dc 0%, #e5dbc8 100%)",
    panelBg: '#fbf7ef', panelBorder: '#d8cfbc', panelText: '#2a241a',
    accent: '#b8621b', muted: '#7a6f5b', hairline: '#e6dfce',
    noteShadow: '0 2px 0 rgba(60,40,20,.05), 0 10px 28px rgba(60,40,20,.14), inset 0 0 0 1px rgba(0,0,0,.04)',
    noteRadius: '2px',
    bodyFont: 'Caveat, "Segoe Script", cursive',
    folderBg: '#f3ead7', folderBorder: '#d8cfbc',
  };
}

function uid(pre='id') { return pre + '_' + Math.random().toString(36).slice(2,8); }
function hashRot(id) { let h=0; for (let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))|0; return ((h%7)-3)*0.4; }
function withA(hex, a) {
  const h = hex.replace('#',''); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
const STICKY_CLIPBOARD_MARKER = '<!-- sticky-notes/v1 -->';

function notesToClipboardText(notes, links) {
  const human = notes.map(n => (n.title || 'Untitled') + (n.body ? '\n\n' + n.body : '')).join('\n\n---\n\n');
  // Carry any link with at least one endpoint inside the copied set.
  // Internal links (both endpoints inside) are remapped to the new ids on
  // paste; cross-boundary links carry the outside endpoint's ORIGINAL id so
  // paste can re-attach if that note still exists in the destination store.
  const ids = new Set(notes.map(n => n.id));
  const subLinks = (links || []).filter(l => ids.has(l.from) || ids.has(l.to));
  const payload = {
    notes: notes.map(n => ({
      id: n.id,  // preserved only for in-payload link endpoint mapping; remapped on paste
      title: n.title, body: n.body, color: n.color,
      w: n.w, h: n.h, pinned: !!n.pinned,
    })),
    links: subLinks.map(l => ({ from: l.from, to: l.to })),
  };
  return human + '\n\n' + STICKY_CLIPBOARD_MARKER + '\n' + JSON.stringify(payload);
}

function clipboardTextToNotes(text) {
  const i = text.indexOf(STICKY_CLIPBOARD_MARKER);
  if (i === -1) return null;
  const json = text.slice(i + STICKY_CLIPBOARD_MARKER.length).trim();
  try {
    const parsed = JSON.parse(json);
    // Bare-array form is the legacy v1 payload; wrap so callers can treat both
    // shapes the same. New form is { notes: [...], links: [...] }.
    if (Array.isArray(parsed)) return { notes: parsed, links: [] };
    if (parsed && Array.isArray(parsed.notes)) {
      return { notes: parsed.notes, links: Array.isArray(parsed.links) ? parsed.links : [] };
    }
    return null;
  } catch { return null; }
}
function cmpSemver(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function downloadUrlForPlatform(version) {
  const p = (navigator.platform || '').toLowerCase();
  if (p.includes('linux')) {
    // The .deb filename matches package.json's "name" field, which became
    // sticky-notes-canvas in v1.3.0 (renamed to align with the Snap Store
    // identifier). Older versions used "sticky-notes" but the update check
    // only ever targets a newer release, so this URL is always for the
    // current naming scheme.
    return `https://github.com/faridjaff/StickyNotesCanvas/releases/download/v${version}/sticky-notes-canvas_${version}_amd64.deb`;
  }
  // Mac (and anything else): point at the release page so the user picks
  // arm64 vs Intel themselves.
  return `https://github.com/faridjaff/StickyNotesCanvas/releases/tag/v${version}`;
}
const MOBILE_BANNER_DISMISSED_KEY = 'stickies.mobileBannerDismissed';
const MOBILE_BANNER_MAX_WIDTH = 640;

Object.assign(window, { FOLDER_HUES, MOBILE_BANNER_DISMISSED_KEY, MOBILE_BANNER_MAX_WIDTH, NOTE_COLORS, SEED, STICKY_CLIPBOARD_MARKER, TWEAK_DEFAULTS, canMoveFolder, clipboardTextToNotes, cmpSemver, downloadJSON, downloadUrlForPlatform, editLinkOnPaste, editListOnEnter, editListOnTab, flattenFolderTree, folderPath, folderSubtreeIds, hashRot, mdToHtml, notesToClipboardText, openWebLink, pickJSONFile, sanitizeFolderParents, themeTokens, uid, withA, withDefaults });
