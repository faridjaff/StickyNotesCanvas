const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ---------- TWEAKABLE DEFAULTS ---------- */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "font": "Inter",
  "density": "cozy",
  "showLinks": true,
  "tilt": true
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
    sprints:   { id: "sprints",  name: "Sprints",    parent: "root", hue: FOLDER_HUES[4] },
    reviews:   { id: "reviews",  name: "Reviews",    parent: "root", hue: FOLDER_HUES[5] },
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
  const lines = src.split('\n');
  let out = '', inList = false;
  const inline = s => {
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  };
  for (let ln of lines) {
    if (/^\s*#\s/.test(ln))      { if(inList){out+='</ul>';inList=false;} out += `<h3>${inline(ln.replace(/^\s*#\s/,''))}</h3>`; continue; }
    if (/^\s*##\s/.test(ln))     { if(inList){out+='</ul>';inList=false;} out += `<h4>${inline(ln.replace(/^\s*##\s/,''))}</h4>`; continue; }
    if (/^\s*[-*]\s/.test(ln))   { if(!inList){out+='<ul>';inList=true;} out += `<li>${inline(ln.replace(/^\s*[-*]\s/,''))}</li>`; continue; }
    if (ln.trim()==='')          { if(inList){out+='</ul>';inList=false;} out += ''; continue; }
    if(inList){out+='</ul>';inList=false;}
    out += `<p>${inline(ln)}</p>`;
  }
  if(inList) out+='</ul>';
  return out;
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
    folders: src.folders ?? SEED.folders,
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

Object.assign(window, { FOLDER_HUES, MOBILE_BANNER_DISMISSED_KEY, MOBILE_BANNER_MAX_WIDTH, NOTE_COLORS, SEED, STICKY_CLIPBOARD_MARKER, TWEAK_DEFAULTS, clipboardTextToNotes, cmpSemver, downloadJSON, downloadUrlForPlatform, hashRot, mdToHtml, notesToClipboardText, pickJSONFile, themeTokens, uid, withA, withDefaults });
