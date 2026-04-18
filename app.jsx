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
      color: "yellow", x: 60, y: 60, w: 280, h: 240, pinned: true, tags: ["errand"] },
    { id: "n2", folder: "home", title: "Dinner: friday",
      body: "Cacio e pepe, simple salad. Wine: the Gavi in the rack.\n\nNeed: parm, pepper, lemon.",
      color: "peach", x: 370, y: 120, w: 260, h: 180, pinned: false, tags: ["cooking"] },
    { id: "n3", folder: "eng", title: "Kernel 6.9 notes",
      body: "## Build flags\n`CONFIG_PREEMPT_RT=y`\n\n- check scheduler patch\n- rerun `make menuconfig`\n- benchmark against 6.8",
      color: "blue", x: 60, y: 70, w: 300, h: 230, pinned: false, tags: ["linux","kernel"] },
    { id: "n4", folder: "workflow", title: "Standup",
      body: "**Yday:** fixed dnd bug\n**Today:** review PR #4412\n**Blockers:** waiting on infra",
      color: "green", x: 70, y: 60, w: 260, h: 180, pinned: true, tags: ["meeting"] },
    { id: "n5", folder: "personal", title: "Reading list",
      body: "- The Pragmatic Programmer\n- Thinking in Systems — _Meadows_\n- Re-read: Unix Philosophy",
      color: "lilac", x: 80, y: 80, w: 270, h: 200, pinned: false, tags: ["books"] },
    { id: "n6", folder: "home", title: "Router reboot",
      body: "ssh admin@10.0.0.1\n`reboot now`\n\nCheck DHCP lease table afterwards.",
      color: "pink", x: 660, y: 110, w: 260, h: 170, pinned: false, tags: ["infra"] },
    { id: "n7", folder: "sprints", title: "Sprint 42 scope",
      body: "## This sprint\n- onboarding polish\n- dnd quick fix\n- dogfood search",
      color: "yellow", x: 80, y: 60, w: 280, h: 200, pinned: false, tags: ["planning"] },
    { id: "n8", folder: "reviews", title: "PR checklist",
      body: "- tests pass\n- no new warnings\n- **a11y** audit\n- screenshot attached",
      color: "green", x: 90, y: 80, w: 260, h: 180, pinned: false, tags: [] },
    { id: "n9", folder: "eng", title: "Button variants",
      body: "primary / secondary / ghost / destructive\n\nfocus ring: 2px accent, 2px offset",
      color: "blue", x: 90, y: 70, w: 280, h: 170, pinned: false, tags: ["design-system"] },
    { id: "n10", folder: "workflow", title: "Goals Q2",
      body: "## Goals\n1. Ship sync\n2. Offline mode\n3. 1k weekly actives",
      color: "peach", x: 360, y: 80, w: 260, h: 180, pinned: false, tags: [] },
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

/* ---------- HOOKS ---------- */
function usePersistedState(key, initial) {
  const [s, setS] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(s)); } catch {} }, [key, s]);
  return [s, setS];
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
  return {
    tweaks:  src.tweaks  ?? TWEAK_DEFAULTS,
    folders: src.folders ?? SEED.folders,
    notes:   src.notes   ?? SEED.notes,
    links:   src.links   ?? (SEED.links || []),
    cwd:     src.cwd     ?? 'root',
    view:    src.view    ?? { x: 0, y: 0, z: 1 },
    drawer:  typeof src.drawer === 'boolean' ? src.drawer : true,
    folderOrder: Array.isArray(src.folderOrder) ? src.folderOrder : [],
  };
}

function useStickyStore() {
  const [store, setStore] = useState(null);
  const saveRef = useRef(null);
  const storeRef = useRef(null);

  useEffect(() => { storeRef.current = store; }, [store]);

  const scheduleSave = useCallback((next) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      if (window.stickyAPI) {
        window.stickyAPI.save(next).catch(err => console.warn('[save]', err));
      } else {
        try { localStorage.setItem('stickies.all', JSON.stringify(next)); } catch {}
      }
    }, 500);
  }, []);

  // Initial load + hydrate. Always save once after hydrate so fresh installs
  // and corrupt-file fallbacks both end up with a valid notes.json on disk.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = {};
      try {
        if (window.stickyAPI) {
          loaded = await window.stickyAPI.load();
        } else {
          loaded = JSON.parse(localStorage.getItem('stickies.all') ?? '{}');
        }
      } catch (err) {
        console.warn('[useStickyStore] load failed:', err);
        loaded = {};
      }
      if (cancelled) return;
      const next = withDefaults(loaded);
      setStore(next);
      scheduleSave(next);
    })();
    return () => { cancelled = true; };
  }, [scheduleSave]);

  // Menu bar integration (Electron only): File → Export / Import.
  useEffect(() => {
    if (!window.stickyAPI) return;
    const onExport = () => {
      const current = storeRef.current;
      if (current) window.stickyAPI.exportFile(current).catch(err => console.warn('[export]', err));
    };
    const onImport = async () => {
      try {
        const res = await window.stickyAPI.importFile();
        if (res?.ok && res.data) {
          const next = withDefaults(res.data);
          setStore(next);
          scheduleSave(next);
        }
      } catch (err) { console.warn('[import]', err); }
    };
    const off1 = window.stickyAPI.onMenuExport(onExport);
    const off2 = window.stickyAPI.onMenuImport(onImport);
    return () => { off1 && off1(); off2 && off2(); };
  }, [scheduleSave]);

  const setKey = useCallback((key, value) => {
    setStore(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        [key]: typeof value === 'function' ? value(prev[key]) : value,
      };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // Imperative export / import surface used by Preferences buttons.
  // Same JSON shape as the Electron menu-bar flow, so files round-trip.
  const exportNow = useCallback(() => {
    const current = storeRef.current;
    if (!current) return;
    if (window.stickyAPI) {
      window.stickyAPI.exportFile(current).catch(err => console.warn('[export]', err));
    } else {
      downloadJSON('sticky-notes-export.json', current);
    }
  }, []);

  const importNow = useCallback(async () => {
    try {
      if (window.stickyAPI) {
        const res = await window.stickyAPI.importFile();
        if (res?.ok && res.data) {
          const next = withDefaults(res.data);
          setStore(next);
          scheduleSave(next);
        }
      } else {
        const data = await pickJSONFile();
        if (data) {
          const next = withDefaults(data);
          setStore(next);
          scheduleSave(next);
        }
      }
    } catch (err) { console.warn('[import]', err); }
  }, [scheduleSave]);

  return { store, setKey, exportNow, importNow };
}

function Loading() {
  return (
    <div style={{
      position:'fixed', inset:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'#14181d', color:'#8a9198',
      fontFamily:'Inter, system-ui, sans-serif', fontSize:14, letterSpacing:'.02em',
    }}>Loading…</div>
  );
}

function useTweakMode(setState) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    function onMsg(e) {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode') setActive(true);
      if (e.data.type === '__deactivate_edit_mode') setActive(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const update = (patch) => {
    setState(s => ({ ...s, ...patch }));
    window.parent.postMessage({type:'__edit_mode_set_keys', edits: patch}, '*');
  };
  return [active, update];
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

/* ==================================================================== */
/* APP                                                                  */
/* ==================================================================== */
function App() {
  const { store, setKey, exportNow, importNow } = useStickyStore();
  if (!store) return <Loading/>;
  return <AppInner store={store} setKey={setKey} exportNow={exportNow} importNow={importNow} />;
}

function AppInner({ store, setKey, exportNow, importNow }) {
  const tweaks   = store.tweaks;
  const folders  = store.folders;
  const notes    = store.notes;
  const links    = store.links;
  const currentFolder = store.cwd;

  const setTweaks  = (v) => setKey('tweaks',  v);
  const setFolders = (v) => setKey('folders', v);
  const setNotes   = (v) => setKey('notes',   v);
  const setLinks   = (v) => setKey('links',   v);
  const setCurrentFolder = (v) => setKey('cwd', v);

  const [tweakActive, updateTweak] = useTweakMode(setTweaks);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const zRef = useRef(10);

  // Ctrl/Cmd+, toggles the preferences (tweaks) panel. In Electron, the
  // accelerator is registered on the File → Preferences… menu item, which
  // handles the keystroke before it reaches the window. This window-level
  // handler is a fallback for the browser case (no stickyAPI).
  useEffect(() => {
    if (window.stickyAPI) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setPrefsOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Menu → Preferences… (from the native menu bar) toggles the panel.
  useEffect(() => {
    if (!window.stickyAPI?.onMenuPreferences) return;
    const off = window.stickyAPI.onMenuPreferences(() => setPrefsOpen(o => !o));
    return () => off && off();
  }, []);

  // Suppress the host browser's Ctrl/Cmd+wheel page zoom across the whole
  // app. We only preventDefault when a modifier is held so plain wheel
  // events on text bodies / drawer scroll still work naturally; the canvas
  // itself handles plain wheel = zoom in Desktop's onWheel.
  useEffect(() => {
    const guard = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener('wheel', guard, { passive: false });
    return () => window.removeEventListener('wheel', guard);
  }, []);

  const T = themeTokens(tweaks.theme);

  /* ----- derived ----- */
  const isAll = currentFolder==='root';

  // Notes visible on the canvas. In a specific folder, also surface any pinned
  // note from elsewhere — pinning means "follow me across folders".
  const folderNotes = useMemo(() =>
    isAll ? notes : notes.filter(n => n.folder === currentFolder || n.pinned),
    [notes, currentFolder, isAll]);

  const filteredNotes = useMemo(() => {
    if (!query.trim()) return folderNotes;
    const q = query.toLowerCase();
    return folderNotes.filter(n => (n.title+' '+n.body+' '+(n.tags||[]).join(' ')).toLowerCase().includes(q));
  }, [folderNotes, query]);

  /* ----- actions ----- */
  const bringToFront = (id) => { zRef.current+=1; const z=zRef.current; setNotes(ns => ns.map(n=>n.id===id?{...n,z}:n)); };
  const focusNote = (id) => { bringToFront(id); setSelectedIds(new Set([id])); };
  const updateNote = (id, patch) => setNotes(ns => ns.map(n => n.id===id ? {...n, ...patch} : n));
  const deleteNote = (id) => { setNotes(ns => ns.filter(n => n.id!==id)); setConfirmDel(null); };
  const updateFolder = (id, patch) => setFolders(fs => ({...fs, [id]: {...fs[id], ...patch}}));

  const createNote = (x, y) => {
    const id = uid('n');
    const colors = NOTE_COLORS.filter(c=>c.id!=='white');
    const color = colors[Math.floor(Math.random()*colors.length)].id;
    const targetFolder = isAll
      ? (Object.keys(folders).find(k => k!=='root') || 'root')
      : currentFolder;
    // Only use x/y if they're real numbers (buttons pass event objects)
    const nx = typeof x === 'number' ? x : (120 + Math.random()*240);
    const ny = typeof y === 'number' ? y : (100 + Math.random()*180);
    const n = { id, folder: targetFolder, title:'New note', body:'', color,
      x: nx, y: ny, w:260, h:180, pinned:false, tags:[] };
    setNotes(ns => [...ns, n]);
    setTimeout(()=>focusNote(id), 0);
  };

  const folderOrder = store.folderOrder;
  const setFolderOrder = (v) => setKey('folderOrder', v);

  const createFolder = () => {
    const id = uid('f');
    const hue = FOLDER_HUES[Object.keys(folders).length % FOLDER_HUES.length];
    setFolders(fs => ({...fs, [id]: { id, name:'New folder', parent: 'root', hue }}));
    setFolderOrder(order => [...(order || []), id]);
    setCurrentFolder(id);
    setRenamingFolder(id);
  };

  const deleteFolder = (id) => {
    setFolders(fs => { const next = {...fs}; delete next[id]; return next; });
    setNotes(ns => ns.filter(n => n.folder !== id));
    setFolderOrder(order => (order || []).filter(fid => fid !== id));
    if (currentFolder===id) setCurrentFolder('root');
    setConfirmDel(null);
  };

  const moveNoteToFolder = (noteId, folderId) => {
    setNotes(ns => ns.map(n => n.id===noteId ? {...n, folder: folderId, x: 80+Math.random()*100, y: 80+Math.random()*80} : n));
  };

  // Batch move for multi-selection drag. Preserves relative positions of
  // the moved cluster so dropping N notes on a folder lands them in the
  // same arrangement near the target folder's top-left.
  const moveNotesToFolder = (noteIds, folderId) => {
    if (!noteIds || !noteIds.length) return;
    const idSet = new Set(noteIds);
    setNotes(ns => {
      const targets = ns.filter(n => idSet.has(n.id));
      if (!targets.length) return ns;
      const minX = Math.min(...targets.map(n => n.x));
      const minY = Math.min(...targets.map(n => n.y));
      const baseX = 80 + Math.random() * 100;
      const baseY = 80 + Math.random() * 80;
      return ns.map(n => idSet.has(n.id)
        ? { ...n, folder: folderId, x: n.x - minX + baseX, y: n.y - minY + baseY }
        : n);
    });
    setSelectedIds(new Set());
  };

  /* ----- link operations ----- */
  const addLink = (fromId, toId) => {
    if (!fromId || !toId || fromId===toId) return;
    setLinks(ls => {
      // dedupe in either direction
      if (ls.some(l => (l.from===fromId && l.to===toId) || (l.from===toId && l.to===fromId))) return ls;
      return [...ls, { id: uid('l'), from: fromId, to: toId }];
    });
  };
  const removeLink = (id) => setLinks(ls => ls.filter(l => l.id!==id));
  const linksFor = (noteId) => links.filter(l => l.from===noteId || l.to===noteId);

  const jumpToNote = (id) => {
    const n = notes.find(x => x.id===id); if (!n) return;
    if (currentFolder !== 'root' && n.folder !== currentFolder) setCurrentFolder(n.folder);
    setTimeout(()=>focusNote(id), 50);
  };

  /* ----- link lines (computed in WORLD space from note positions) ----- */
  const noteRefs = useRef({});
  const linkLines = useMemo(() => {
    if (!tweaks.showLinks) return [];
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    const visible = new Set(filteredNotes.map(n => n.id));
    // clip a line (from cx,cy to tx,ty) to the edge of the rect around (cx,cy)
    const clipToRect = (cx, cy, w, h, tx, ty) => {
      const dx = tx - cx, dy = ty - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const hw = w/2, hh = h/2;
      const tX = dx === 0 ? Infinity : hw / Math.abs(dx);
      const tY = dy === 0 ? Infinity : hh / Math.abs(dy);
      const t = Math.min(tX, tY);
      return { x: cx + dx*t, y: cy + dy*t };
    };
    return links.map(l => {
      const a = byId[l.from], b = byId[l.to];
      if (!a || !b) return null;
      if (!visible.has(l.from) || !visible.has(l.to)) return null;
      const acx = a.x + a.w/2, acy = a.y + a.h/2;
      const bcx = b.x + b.w/2, bcy = b.y + b.h/2;
      const p1 = clipToRect(acx, acy, a.w, a.h, bcx, bcy);
      const p2 = clipToRect(bcx, bcy, b.w, b.h, acx, acy);
      return { id: l.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, fromId: l.from, toId: l.to };
    }).filter(Boolean);
  }, [links, notes, filteredNotes, tweaks.showLinks]);

  /* ----- keyboard ----- */
  useEffect(() => {
    const h = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key.toLowerCase()==='n') { e.preventDefault(); createNote(); }
      if (e.key.toLowerCase()==='f' && (e.metaKey||e.ctrlKey)) { e.preventDefault(); document.getElementById('qs')?.focus(); }
      if (e.key==='Escape') { setSelectedIds(new Set()); }
      if ((e.key==='Delete' || e.key==='Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        const ids = selectedIds;
        setNotes(ns => ns.filter(n => !ids.has(n.id)));
        setLinks(ls => ls.filter(l => !ids.has(l.from) && !ids.has(l.to)));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const currentFolderName = isAll ? 'All notes' : (folders[currentFolder]?.name || '');

  return (
    <div style={{height:'100%', background:T.wallpaper, color:T.panelText, position:'relative',
      fontFamily: tweaks.font+', system-ui, sans-serif'}}>

      <TopChrome T={T} tweaks={tweaks}
        currentFolderName={currentFolderName}
        query={query} setQuery={setQuery}
        onNewNote={createNote}
        onNewFolder={createFolder}
        onExport={exportNow}
        onImport={importNow}
      />

      <FoldersDrawer T={T} tweaks={tweaks}
        folders={folders} notes={notes}
        currentFolder={currentFolder} setCurrentFolder={setCurrentFolder}
        onCreateFolder={createFolder}
        onRenameFolder={(id, name)=>updateFolder(id,{name})}
        renamingFolder={renamingFolder} setRenamingFolder={setRenamingFolder}
        onDeleteFolder={(id)=>setConfirmDel({kind:'folder', id})}
        onDropNoteOnFolder={moveNoteToFolder}
        onDropNotesOnFolder={moveNotesToFolder}
        onCreateNote={createNote}
        open={store.drawer}
        setOpen={(v) => setKey('drawer', v)}
        folderOrder={folderOrder}
        setFolderOrder={setFolderOrder}
      />

      <Desktop T={T} tweaks={tweaks}
        currentFolder={currentFolder}
        folders={folders}
        notes={filteredNotes}
        allNotes={notes}
        noteRefs={noteRefs} linkLines={linkLines}
        links={links} addLink={addLink} removeLink={removeLink} linksFor={linksFor}
        updateNote={updateNote} bringToFront={bringToFront} focusNote={focusNote}
        onDeleteNote={(id)=>setConfirmDel({kind:'note', id})}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        setNotes={setNotes}
        jumpToNote={jumpToNote}
        moveNoteToFolder={moveNoteToFolder}
        moveNotesToFolder={moveNotesToFolder}
        onCreateNote={createNote}
        view={store.view}
        setView={(v) => setKey('view', v)}
        drawerOpen={store.drawer}
      />

      {confirmDel && (
        <ConfirmDialog T={T}
          title={confirmDel.kind==='folder'
            ? `Delete "${folders[confirmDel.id]?.name}"?`
            : `Delete "${notes.find(n=>n.id===confirmDel.id)?.title || 'note'}"?`}
          body={confirmDel.kind==='folder'
            ? 'All notes inside this folder will also be deleted.'
            : 'This note will be permanently removed.'}
          onCancel={()=>setConfirmDel(null)}
          onConfirm={()=>{
            if (confirmDel.kind==='note') deleteNote(confirmDel.id);
            else deleteFolder(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}

      {(tweakActive || prefsOpen) && <TweakPanel T={T} tweaks={tweaks} update={updateTweak} onClose={()=>setPrefsOpen(false)}/>}

      <StatusBar T={T} tweaks={tweaks}
        folderName={currentFolderName}
        noteCount={folderNotes.length}
        folderCount={Object.keys(folders).length-1}
      />
    </div>
  );
}

/* ==================================================================== */
/* TOP CHROME                                                            */
/* ==================================================================== */
function TopChrome({T, tweaks, currentFolderName, query, setQuery, onNewNote, onNewFolder, onExport, onImport}) {
  const isTerm = tweaks.theme==='terminal';
  const [backupOpen, setBackupOpen] = useState(false);

  useEffect(() => {
    if (!backupOpen) return;
    const close = (e) => {
      if (e.target.closest('[data-backup-menu]')) return;
      setBackupOpen(false);
    };
    const id = setTimeout(() => window.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(id); window.removeEventListener('mousedown', close); };
  }, [backupOpen]);

  return (
    <div style={{
      height:54, background:T.panelBg, borderBottom:`1px solid ${T.panelBorder}`,
      display:'flex', alignItems:'center', gap:12, padding:'0 14px', position:'relative', zIndex:20000,
      color:T.panelText,
    }}>
      <AppGlyph T={T} isTerm={isTerm}/>
      <div style={{fontWeight:600, fontSize:14, letterSpacing:isTerm?0.5:0}}>
        {isTerm ? 'stickies' : 'Sticky Notes'}
      </div>

      <div style={{width:1, height:22, background:T.panelBorder, margin:'0 8px'}}/>

      <div style={{fontSize:13, color:T.panelText, opacity:.85, fontWeight:500}}>
        {currentFolderName}
      </div>

      <div style={{flex:1}}/>

      <div style={{position:'relative'}}>
        <input id="qs"
          value={query} onChange={e=>setQuery(e.target.value)}
          placeholder={isTerm?'grep…':'Search notes'}
          style={{
            width:220, height:30, borderRadius: isTerm?2:8, border:`1px solid ${T.panelBorder}`,
            background: isTerm?'#0e1319':'rgba(0,0,0,.03)', color:T.panelText,
            padding:'0 12px 0 30px', fontSize:13, outline:'none',
            fontFamily: isTerm?T.bodyFont:'inherit',
          }}/>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{position:'absolute', left:10, top:8, opacity:.5}}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <div data-backup-menu style={{position:'relative'}}>
        <button onClick={()=>setBackupOpen(o=>!o)} title="Export or import notes" style={{
          height:30, padding:'0 12px', borderRadius: isTerm?2:8,
          background:'#000', color:'#fff', border:`1px solid ${T.panelBorder}`,
          fontWeight:500, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
        }}>
          {isTerm?'backup':'Backup'} <span style={{fontSize:9, opacity:.7, marginTop:1}}>▾</span>
        </button>
        {backupOpen && (
          <div data-backup-menu style={{
            position:'absolute', top:36, right:0, minWidth:160, zIndex:30000,
            background:T.panelBg, border:`1px solid ${T.panelBorder}`,
            borderRadius: isTerm?2:8, boxShadow:'0 8px 22px rgba(0,0,0,.15)',
            padding:4, fontFamily:'inherit',
          }}>
            <button onClick={()=>{setBackupOpen(false); onExport && onExport();}} style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'8px 10px', background:'transparent', border:'none',
              color:T.panelText, fontSize:13, cursor:'pointer', borderRadius: isTerm?2:6,
            }} onMouseEnter={e=>e.currentTarget.style.background=`${withA(T.panelText,.06)}`}
               onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              Export Notes…
            </button>
            <button onClick={()=>{setBackupOpen(false); onImport && onImport();}} style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'8px 10px', background:'transparent', border:'none',
              color:T.panelText, fontSize:13, cursor:'pointer', borderRadius: isTerm?2:6,
            }} onMouseEnter={e=>e.currentTarget.style.background=`${withA(T.panelText,.06)}`}
               onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              Import Notes…
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

function AppGlyph({T, isTerm}) {
  if (isTerm) return <div style={{width:22,height:22, background:'#0e1319', color:T.accent, border:`1px solid ${T.panelBorder}`,
    display:'grid', placeItems:'center', fontFamily:T.bodyFont, fontSize:12, fontWeight:700, marginLeft:4}}>_</div>;
  return <div style={{position:'relative', width:22, height:22, marginLeft:4}}>
    <div style={{position:'absolute', inset:0, background:'#fde8a1', borderRadius:4, transform:'rotate(-6deg)', boxShadow:'0 2px 4px rgba(0,0,0,.1)'}}/>
    <div style={{position:'absolute', inset:0, background:'#b6dbf5', borderRadius:4, transform:'rotate(5deg) translate(4px,1px)', boxShadow:'0 2px 4px rgba(0,0,0,.1)'}}/>
  </div>;
}

function FolderIcon({size=14, color="#000", open=false, fill=null}) {
  if (open) return (
    <svg width={size*1.2} height={size} viewBox="0 0 24 20" fill="none">
      <path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v2H2V5z" fill={fill||color} opacity={fill?1:.2} stroke={color} strokeWidth="1.5"/>
      <path d="M2 9h20l-2 9a2 2 0 0 1-2 1.5H4a2 2 0 0 1-2-1.5L2 9z" fill={fill||color} opacity={fill?.85:.35} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
  return (
    <svg width={size*1.2} height={size} viewBox="0 0 24 20" fill="none">
      <path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" fill={fill||color} opacity={fill?1:.2} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function HomeIcon({size=14, color="#000"}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M3 11l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V11z"/>
  </svg>;
}

/* ==================================================================== */
/* FOLDER TREE (sidebar)                                                 */
/* ==================================================================== */
function FolderTree({T, folders, notes, currentFolder, setCurrentFolder,
  onCreateFolder, onRename, onDelete, renamingFolder, setRenamingFolder, onDropNoteOnFolder}) {

  // Flat list: root first (as "All notes"), then all real folders alpha
  const flatList = useMemo(() => {
    const real = Object.values(folders).filter(f => f.id !== 'root').sort((a,b)=>a.name.localeCompare(b.name));
    return real;
  }, [folders]);

  const Row = ({f, isAll}) => {
    const isActive = currentFolder===f.id;
    const [over, setOver] = useState(false);
    const count = isAll ? notes.length : notes.filter(n=>n.folder===f.id).length;

    return (
      <div
        onDragOver={e=>{e.preventDefault(); setOver(true);}}
        onDragLeave={()=>setOver(false)}
        onDrop={(e)=>{
          setOver(false);
          const nid = e.dataTransfer.getData('note-id');
          if (nid && !isAll) onDropNoteOnFolder(nid, f.id);
        }}
        onClick={()=>setCurrentFolder(f.id)}
        onDoubleClick={()=>!isAll && setRenamingFolder(f.id)}
        style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'7px 10px',
          borderRadius:6,
          background: isActive ? withA(isAll?T.accent:f.hue, .18) : over ? withA(T.accent, .18) : 'transparent',
          color: T.panelText, fontSize:13, cursor:'pointer', marginBottom:2,
          outline: over ? `1px dashed ${T.accent}` : 'none',
        }}>
        {isAll
          ? <HomeIcon size={14} color={T.panelText}/>
          : <FolderIcon size={14} color={f.hue} fill={f.hue} open={isActive}/>}
        {(!isAll && renamingFolder===f.id) ? (
          <input autoFocus defaultValue={f.name}
            onClick={e=>e.stopPropagation()}
            onBlur={e=>{ onRename(f.id, e.target.value||f.name); setRenamingFolder(null); }}
            onKeyDown={e=>{ if(e.key==='Enter'){onRename(f.id, e.target.value||f.name); setRenamingFolder(null);} if(e.key==='Escape'){setRenamingFolder(null);}}}
            style={{flex:1, background:'transparent', border:'none', outline:'none', color:T.panelText, fontSize:13, font:'inherit', fontWeight: isActive?600:500}}
          />
        ) : (
          <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive?600:500}}>
            {isAll ? 'All notes' : f.name}
          </span>
        )}
        <span style={{fontSize:11, color:T.muted, fontVariantNumeric:'tabular-nums'}}>
          {count}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      position:'absolute', left:0, top:54, bottom:28, width:220,
      background:T.panelBg, borderRight:`1px solid ${T.panelBorder}`,
      padding:'12px 10px', zIndex:15000, overflow:'auto', color:T.panelText,
    }}>
      <Row f={{id:'root', name:'All notes'}} isAll/>

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'16px 10px 8px', display:'flex', alignItems:'center'}}>
        Folders <div style={{flex:1}}/>
        <button onClick={()=>onCreateFolder()} title="New folder" style={{
          background:'transparent', border:'none', cursor:'pointer', color:T.panelText, opacity:.6,
          fontSize:16, padding:0, lineHeight:1,
        }}>＋</button>
      </div>
      {flatList.map(f => <Row key={f.id} f={f}/>)}

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'18px 10px 8px'}}>Shortcuts</div>
      <KeyHint T={T} keys={['N']} label="New note"/>
      <KeyHint T={T} keys={['⌘','F']} label="Search"/>
      <KeyHint T={T} keys={['Esc']} label="Deselect"/>
      <KeyHint T={T} keys={['Drag']} label="Move note to folder"/>

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'18px 10px 8px'}}>Stats</div>
      <div style={{padding:'0 10px', fontSize:12, color:T.muted, lineHeight:1.7}}>
        <div>{notes.length} notes · {flatList.length} folders</div>
        <div>{notes.filter(n=>n.pinned).length} pinned</div>
      </div>
    </div>
  );
}

function KeyHint({T, keys, label}) {
  return <div style={{display:'flex', alignItems:'center', gap:8, padding:'5px 10px', fontSize:12, color:T.muted}}>
    <div style={{display:'flex', gap:3}}>
      {keys.map(k => <kbd key={k} style={{
        fontFamily:'ui-monospace, monospace', fontSize:10, padding:'2px 5px',
        background:'rgba(0,0,0,.05)', border:`1px solid ${T.panelBorder}`, borderRadius:3, color:T.panelText,
      }}>{k}</kbd>)}
    </div>
    <span>{label}</span>
  </div>;
}

/* ==================================================================== */
/* DESKTOP (canvas with folder tiles + sticky notes)                     */
/* ==================================================================== */
function Desktop({T, tweaks, currentFolder, folders, notes, allNotes, noteRefs, linkLines,
  links, addLink, removeLink, linksFor,
  updateNote, bringToFront, focusNote, onDeleteNote, selectedIds, setSelectedIds, setNotes,
  jumpToNote, moveNoteToFolder, moveNotesToFolder, onCreateNote,
  view, setView, drawerOpen}) {

  const [deskMenu, setDeskMenu] = useState(null);
  const [linkMenu, setLinkMenu] = useState(null);
  const [linkingFrom, setLinkingFrom] = useState(null); // note id when drawing a new link
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState(null); // {startX, startY, curX, curY, shift} in world coords
  const panRef = useRef(null);
  const deskRef = useRef(null);

  // space bar toggles pan mode
  useEffect(() => {
    const down = (e) => {
      if (e.code==='Space' && !e.repeat && !e.target.matches('input, textarea, [contenteditable]')) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e) => { if (e.code==='Space') setSpaceHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // convert screen coords (relative to desk) → world coords
  const toWorld = (sx, sy) => ({
    x: (sx - view.x) / view.z,
    y: (sy - view.y) / view.z,
  });

  const onWheel = (e) => {
    if (e.target.matches('textarea, input, [contenteditable="true"]')) return;
    // Plain wheel = zoom toward cursor (Figma-style default). No modifier
    // required — and we don't honor Ctrl/Cmd specially because the host
    // browser hijacks Ctrl+wheel for page zoom in the web build.
    e.preventDefault();
    const rect = deskRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.01);
    setView(v => {
      const nz = Math.max(0.25, Math.min(3, v.z * factor));
      const ratio = nz / v.z;
      return { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, z: nz };
    });
  };

  const onMouseDown = (e) => {
    // Space+drag OR middle mouse = pan
    if (spaceHeld || e.button===1) {
      e.preventDefault();
      setPanning(true);
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    // Plain left-drag on empty canvas = marquee selection
    if (e.button === 0 && (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid')) {
      e.preventDefault();
      const rect = deskRef.current.getBoundingClientRect();
      const wx = (e.clientX - rect.left - view.x) / view.z;
      const wy = (e.clientY - rect.top  - view.y) / view.z;
      setMarquee({ startX: wx, startY: wy, curX: wx, curY: wy, additive: e.ctrlKey || e.metaKey });
    }
  };

  useEffect(() => {
    if (!panning) return;
    const move = (e) => {
      const p = panRef.current; if (!p) return;
      setView(v => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }));
    };
    const up = () => { setPanning(false); panRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [panning]);

  // Marquee drag: while active, track pointer in world coords; on release, resolve selection.
  useEffect(() => {
    if (!marquee) return;
    const rect = deskRef.current.getBoundingClientRect();
    const move = (e) => {
      const wx = (e.clientX - rect.left - view.x) / view.z;
      const wy = (e.clientY - rect.top  - view.y) / view.z;
      setMarquee(m => m ? { ...m, curX: wx, curY: wy } : m);
    };
    const up = () => {
      setMarquee(m => {
        if (!m) return null;
        const dragged = Math.hypot(m.curX - m.startX, m.curY - m.startY) > 3;
        if (!dragged) {
          // Treat as plain click on empty canvas: clear selection (unless Ctrl/Cmd).
          if (!m.additive) setSelectedIds(new Set());
          return null;
        }
        const x1 = Math.min(m.startX, m.curX);
        const y1 = Math.min(m.startY, m.curY);
        const x2 = Math.max(m.startX, m.curX);
        const y2 = Math.max(m.startY, m.curY);
        const base = m.additive ? new Set(selectedIds) : new Set();
        notes.forEach(n => {
          if (n.x < x2 && n.x + n.w > x1 && n.y < y2 && n.y + n.h > y1) {
            if (m.additive && base.has(n.id)) base.delete(n.id); else base.add(n.id);
          }
        });
        setSelectedIds(base);
        return null;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [marquee, view.x, view.y, view.z, notes, selectedIds, setSelectedIds]);

  const resetView = () => setView({x:0, y:0, z:1});
  const zoomTo = (factor) => {
    const rect = deskRef.current.getBoundingClientRect();
    const mx = rect.width/2, my = rect.height/2;
    setView(v => {
      const nz = Math.max(0.25, Math.min(3, v.z * factor));
      const ratio = nz / v.z;
      return { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, z: nz };
    });
  };
  const fitToNotes = () => {
    if (!notes.length) { resetView(); return; }
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    notes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    const rect = deskRef.current.getBoundingClientRect();
    // Reserve space for the folders drawer (if open) so notes don't end up under it
    // Reserve space for the folders drawer (if open) so notes don't end up
    // under it. drawerOpen comes from the hoisted store state in the parent.
    const rightReserve = drawerOpen ? 320 : 0; // 300 width + 10 margin + gap
    const pad = 80;
    const availW = rect.width - rightReserve - pad*2;
    const availH = rect.height - pad*2;
    const bw = maxX - minX, bh = maxY - minY;
    const sx = availW / bw;
    const sy = availH / bh;
    const nz = Math.max(0.25, Math.min(1.5, Math.min(sx, sy)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Center within the available (non-drawer) area
    const availCenterX = (rect.width - rightReserve) / 2;
    const availCenterY = rect.height / 2;
    setView({
      x: availCenterX - cx*nz,
      y: availCenterY - cy*nz,
      z: nz,
    });
  };

  // Escape cancels link-drawing. Kept in its own effect so the listener
  // isn't torn down on every mousemove (which replaces linkingFrom).
  useEffect(() => {
    if (!linkingFrom) return;
    const onKey = (e) => { if (e.key === 'Escape') setLinkingFrom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!linkingFrom]);

  // While in "linking" mode, track cursor and click-to-connect.
  useEffect(() => {
    if (!linkingFrom) return;
    // Ignore clicks that happen within the same tick as starting the mode
    // (so the button-click that initiated linking doesn't immediately cancel it)
    let armed = false;
    const armTimer = setTimeout(() => { armed = true; }, 50);
    const onMove = (e) => {
      const rect = deskRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const world = { x:(sx-view.x)/view.z, y:(sy-view.y)/view.z };
      setLinkingFrom(lf => lf ? { ...lf, x:world.x, y:world.y } : lf);
    };
    const onClick = (e) => {
      if (!armed) return;
      const noteEl = e.target.closest('[data-note-id]');
      if (noteEl) {
        const toId = noteEl.getAttribute('data-note-id');
        if (toId && toId !== linkingFrom.id) { addLink(linkingFrom.id, toId); }
      }
      setLinkingFrom(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick, true);
    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick, true);
    };
  }, [linkingFrom, view.x, view.y, view.z, addLink]);

  const cursor = panning ? 'grabbing' : (spaceHeld ? 'grab' : (linkingFrom ? 'crosshair' : 'default'));

  return (
    <>
    {linkingFrom && (
      <div style={{
        position:'absolute', top:64, left:'50%', transform:'translateX(-50%)',
        background:T.panelBg, color:T.panelText, padding:'8px 16px',
        borderRadius:8, border:`1px solid ${T.panelBorder}`,
        fontSize:12, fontWeight:500, zIndex:25000,
        boxShadow:'0 4px 16px rgba(0,0,0,.18)',
        userSelect:'none', pointerEvents:'none',
        display:'flex', alignItems:'center', gap:10,
      }}>
        <span>Click another note to link</span>
        <span style={{opacity:.5}}>·</span>
        <kbd style={{
          fontFamily:'ui-monospace, monospace', fontSize:11, padding:'2px 6px',
          background:'rgba(0,0,0,.06)', border:`1px solid ${T.panelBorder}`, borderRadius:4,
        }}>Esc</kbd>
        <span>to cancel</span>
      </div>
    )}
    <div id="desk" ref={deskRef}
      onContextMenu={(e)=>{ if (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid') { e.preventDefault(); setDeskMenu({x:e.clientX, y:e.clientY}); }}}
      onClick={(e)=>{ if (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid') setDeskMenu(null); }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      style={{position:'absolute', left:0, right:0, top:54, bottom:28, overflow:'hidden', cursor, userSelect: panning?'none':'auto'}}>

      {/* faint grid — lives in screen space, scales with zoom */}
      <div id="desk-grid" style={{
        position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:`radial-gradient(${withA(T.panelText,.07)} 1px, transparent 1px)`,
        backgroundSize:`${24*view.z}px ${24*view.z}px`,
        backgroundPosition:`${view.x}px ${view.y}px`,
        opacity: tweaks.theme==='terminal'?.3:.5,
      }}/>

      <div id="desk-inner" style={{
        position:'absolute', inset:0,
        transform:`translate(${view.x}px, ${view.y}px) scale(${view.z})`,
        transformOrigin:'0 0',
        pointerEvents: panning ? 'none' : 'auto',
      }}>

          {/* Link layer */}
          {tweaks.showLinks && (
            <svg style={{position:'absolute', left:0, top:0, pointerEvents:'none', width:4000, height:4000, overflow:'visible', zIndex:1}}>
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={T.accent}/>
                </marker>
              </defs>
              {linkLines.map(l => {
                const x1 = l.x1, y1 = l.y1, x2 = l.x2, y2 = l.y2;
                const mx = (x1+x2)/2, my = (y1+y2)/2;
                return (
                  <g key={l.id} style={{pointerEvents:'auto', cursor:'pointer'}}
                    onClick={(e)=>{ e.stopPropagation(); setLinkMenu({id:l.id, fromId:l.fromId, toId:l.toId, sx:e.clientX, sy:e.clientY}); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"/>
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={T.accent} strokeOpacity=".65" strokeWidth="1.75" strokeDasharray="5 4" markerEnd="url(#arr)"/>
                    <circle cx={mx} cy={my} r="5" fill={T.panelBg} stroke={T.accent} strokeWidth="1.5"/>
                  </g>
                );
              })}
              {linkingFrom && (() => {
                const src = allNotes.find(n => n.id===linkingFrom.id);
                if (!src) return null;
                return (
                  <line x1={src.x+src.w/2} y1={src.y+src.h/2}
                    x2={linkingFrom.x} y2={linkingFrom.y}
                    stroke={T.accent} strokeOpacity=".8" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#arr)"/>
                );
              })()}
            </svg>
          )}

        {/* Marquee selection rectangle (world coords) */}
        {marquee && Math.hypot(marquee.curX - marquee.startX, marquee.curY - marquee.startY) > 3 && (
          <div style={{
            position:'absolute', pointerEvents:'none', zIndex:5000,
            left:   Math.min(marquee.startX, marquee.curX),
            top:    Math.min(marquee.startY, marquee.curY),
            width:  Math.abs(marquee.curX - marquee.startX),
            height: Math.abs(marquee.curY - marquee.startY),
            background: withA(T.accent, 0.10),
            border: `1px solid ${T.accent}`,
            borderRadius: 2,
          }}/>
        )}

        {/* Sticky notes */}
        {notes.map(n => (
          <StickyNote key={n.id} note={n} T={T} tweaks={tweaks} folder={folders[n.folder]}
            refCb={(el)=>{ noteRefs.current[n.id] = el; }}
            selected={selectedIds.has(n.id)}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            setNotes={setNotes}
            onFocus={(e)=>{
              if (e && (e.ctrlKey || e.metaKey)) {
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                  return next;
                });
                bringToFront(n.id);
              } else if (!selectedIds.has(n.id)) {
                focusNote(n.id);
              } else {
                bringToFront(n.id); // already part of selection — don't collapse it
              }
            }}
            onChange={(patch)=>updateNote(n.id, patch)}
            onDelete={()=>onDeleteNote(n.id)}
            onLinkClick={jumpToNote}
            childFolders={Object.values(folders).filter(f=>f.id!==n.folder && f.id!=='root')}
            onMoveToFolder={(fid)=>moveNoteToFolder(n.id, fid)}
            zoom={view.z}
            allNotes={allNotes}
            linksFor={linksFor}
            onMoveNotesToFolder={moveNotesToFolder}
            onAddLink={(toId)=>addLink(n.id, toId)}
            onStartLink={()=>setLinkingFrom({id:n.id, x:n.x+n.w/2, y:n.y+n.h/2})}
            onJumpToNote={jumpToNote}
          />
        ))}
      </div>

      {/* Empty state — in screen space, not transformed */}
      {notes.length===0 && (
        <EmptyState T={T} folderName={folders[currentFolder]?.name || 'All notes'} isRoot={currentFolder==='root'}/>
      )}

      {/* zoom controls */}
      <div style={{
        position:'absolute', left:16, bottom:16, display:'flex', alignItems:'center', gap:2,
        background:T.panelBg, border:`1px solid ${T.panelBorder}`,
        borderRadius: tweaks.theme==='terminal'?2:8, padding:3,
        boxShadow:'0 2px 8px rgba(0,0,0,.08)', zIndex:500,
        fontFamily: tweaks.font+', system-ui, sans-serif',
      }}>
        <button onClick={()=>zoomTo(1/1.2)} title="Zoom out" style={zBtn(T)}>−</button>
        <button onClick={resetView} title="Reset view (press 0)" style={{
          ...zBtn(T), width:'auto', padding:'0 10px', fontSize:11, fontVariantNumeric:'tabular-nums', fontWeight:600,
        }}>{Math.round(view.z*100)}%</button>
        <button onClick={()=>zoomTo(1.2)} title="Zoom in" style={zBtn(T)}>+</button>
        <div style={{width:1, height:20, background:T.hairline, margin:'0 3px'}}/>
        <button onClick={fitToNotes} title="Fit all notes to view" style={{...zBtn(T), width:'auto', padding:'0 8px', fontSize:11}}>fit</button>
      </div>

      {/* space-held indicator */}
      {spaceHeld && !panning && (
        <div style={{
          position:'absolute', left:'50%', bottom:16, transform:'translateX(-50%)',
          background:T.panelText, color:T.panelBg, padding:'6px 14px',
          borderRadius: tweaks.theme==='terminal'?2:999, fontSize:12, fontWeight:600, letterSpacing:.3,
          boxShadow:'0 4px 12px rgba(0,0,0,.2)', pointerEvents:'none', zIndex:500,
          fontFamily: tweaks.font+', system-ui, sans-serif',
        }}>✋ drag to pan</div>
      )}

      {deskMenu && (() => {
        const rect = deskRef.current.getBoundingClientRect();
        const sx = deskMenu.x - rect.left;
        const sy = deskMenu.y - rect.top;
        const world = toWorld(sx, sy);
        return (
          <ContextMenu T={T} x={sx} y={sy} onClose={()=>setDeskMenu(null)}
            items={[
              {label:'New note here', onClick:()=>{ onCreateNote(world.x, world.y); setDeskMenu(null); }},
              {label:'Reset view', onClick:()=>{ resetView(); setDeskMenu(null); }},
            ]}/>
        );
      })()}

      {linkMenu && (() => {
        const rect = deskRef.current.getBoundingClientRect();
        const from = allNotes.find(n=>n.id===linkMenu.fromId);
        const to = allNotes.find(n=>n.id===linkMenu.toId);
        return (
          <ContextMenu T={T} x={linkMenu.sx-rect.left} y={linkMenu.sy-rect.top}
            onClose={()=>setLinkMenu(null)}
            items={[
              {label: `→ Jump to "${to?.title || 'target'}"`, onClick:()=>{ jumpToNote(linkMenu.toId); setLinkMenu(null); }},
              {label: `← Jump to "${from?.title || 'source'}"`, onClick:()=>{ jumpToNote(linkMenu.fromId); setLinkMenu(null); }},
              {separator:true, divider:true},
              {label: 'Delete link', destructive:true, onClick:()=>{ removeLink(linkMenu.id); setLinkMenu(null); }},
            ]}/>
        );
      })()}

      {/* linking banner */}
      {linkingFrom && (
        <div style={{
          position:'absolute', left:'50%', top:16, transform:'translateX(-50%)',
          background:T.accent, color: tweaks.theme==='terminal'?'#0a0c10':'#fff', padding:'7px 14px',
          borderRadius: tweaks.theme==='terminal'?2:999, fontSize:12, fontWeight:700, letterSpacing:.3,
          boxShadow:'0 4px 12px rgba(0,0,0,.2)', pointerEvents:'none', zIndex:500,
          fontFamily: tweaks.font+', system-ui, sans-serif',
        }}>🔗 click a note to link · esc to cancel</div>
      )}
    </div>
    </>
  );
}

const zBtn = (T) => ({
  width:28, height:28, display:'grid', placeItems:'center',
  background:'transparent', color:T.panelText, border:'none', cursor:'pointer',
  fontSize:16, lineHeight:1, padding:0, borderRadius:4,
});

function EmptyState({T, folderName, isRoot}) {
  return (
    <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', pointerEvents:'none'}}>
      <div style={{textAlign:'center', color:T.muted, maxWidth:340}}>
        <div style={{fontSize:48, marginBottom:12, opacity:.6}}>
          {isRoot ? '🏠' : '📂'}
        </div>
        <div style={{fontSize:15, fontWeight:600, color:T.panelText, marginBottom:6}}>
          {isRoot ? 'Your desktop is empty' : `"${folderName}" is empty`}
        </div>
        <div style={{fontSize:13, lineHeight:1.55}}>
          Press <kbd style={kbdS(T)}>N</kbd> to add a sticky note, or use <b>New folder</b> to organize by topic.
        </div>
      </div>
    </div>
  );
}
function kbdS(T) { return {fontFamily:'ui-monospace, monospace', fontSize:11, padding:'2px 6px', background:'rgba(0,0,0,.06)', border:`1px solid ${T.panelBorder}`, borderRadius:3}; }

/* ==================================================================== */
/* FOLDER TILE (draggable on desktop)                                    */
/* ==================================================================== */
/* STICKY NOTE                                                           */
/* ==================================================================== */
function StickyNote({note, T, tweaks, folder, refCb, selected, selectedIds, setSelectedIds, setNotes,
  onFocus, onChange, onDelete, onLinkClick, childFolders, onMoveToFolder, onMoveNotesToFolder, zoom=1,
  allNotes=[], linksFor, onAddLink, onStartLink, onJumpToNote}) {
  const zRef = useRef(zoom); zRef.current = zoom;
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [menu, setMenu] = useState(null);
  const el = useRef(null);

  useEffect(() => { refCb(el.current); return ()=>refCb(null); }, [refCb]);

  const col = NOTE_COLORS.find(c => c.id===note.color) || NOTE_COLORS[0];
  const bg = tweaks.theme==='paper' ? col.paper : tweaks.theme==='flat' ? col.flat : col.term;
  const ink = col.ink;

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const onHeaderDown = (e) => {
    if (editingTitle || e.button!==0) return;
    e.stopPropagation();
    e.preventDefault();
    onFocus(e);
    draggingRef.current = true;
    setDragging(true);
    const sX = e.clientX, sY = e.clientY;
    const z = zRef.current;

    // Returns a folder id (≠ 'root') if the pointer is currently over a folder
    // row, else null. Lets header pointer-drag also act as drag-to-folder.
    const folderIdUnder = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el && el.closest && el.closest('[data-folder-id]');
      const fid = row && row.getAttribute('data-folder-id');
      return (fid && fid !== 'root') ? fid : null;
    };

    // Group drag: if this note was already part of a multi-selection, move all selected notes together.
    const isGroupDrag = !(e.ctrlKey || e.metaKey) && selected && selectedIds && selectedIds.size > 1 && typeof setNotes === 'function';
    if (isGroupDrag) {
      const starts = new Map();
      allNotes.forEach(n => { if (selectedIds.has(n.id)) starts.set(n.id, { x: n.x, y: n.y }); });
      const move = (ev) => {
        const dx = (ev.clientX - sX) / z;
        const dy = (ev.clientY - sY) / z;
        setNotes(ns => ns.map(n => {
          const s = starts.get(n.id);
          return s ? { ...n, x: s.x + dx, y: s.y + dy } : n;
        }));
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        draggingRef.current = false;
        setDragging(false);
        const targetFolder = folderIdUnder(ev);
        if (targetFolder && onMoveNotesToFolder) {
          onMoveNotesToFolder([...selectedIds], targetFolder);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return;
    }

    // Single drag.
    const { x:nx, y:ny } = note;
    const move = (ev) => onChange({ x: nx+(ev.clientX-sX)/z, y: ny+(ev.clientY-sY)/z });
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      draggingRef.current = false;
      setDragging(false);
      const targetFolder = folderIdUnder(ev);
      if (targetFolder && targetFolder !== note.folder && onMoveToFolder) {
        onMoveToFolder(targetFolder);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const sX = e.clientX, sY = e.clientY;
    const { w, h } = note;
    const move = (ev) => onChange({ w: Math.max(180, w+(ev.clientX-sX)/zRef.current), h: Math.max(120, h+(ev.clientY-sY)/zRef.current) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const rot = tweaks.theme==='paper' && tweaks.tilt !== false ? hashRot(note.id) : 0;

  return (
    <div ref={el} data-note="1" data-note-id={note.id}
      draggable={!dragging && !editingTitle && !editing}
      onDragStart={e=>{
        if (draggingRef.current) { e.preventDefault(); return; }
        // If this note is part of a multi-selection, carry every selected
        // id so a drop on a folder moves the whole group at once.
        const ids = (selected && selectedIds && selectedIds.size > 1)
          ? [...selectedIds].join(',')
          : note.id;
        e.dataTransfer.setData('note-ids', ids);
        e.dataTransfer.effectAllowed='move';
      }}
      onMouseDown={onFocus}
      onContextMenu={e=>{e.preventDefault(); e.stopPropagation(); setMenu({x:e.clientX, y:e.clientY});}}
      style={{
        position:'absolute', left:note.x, top:note.y, width:note.w, height:note.h,
        background: bg, color: ink, zIndex: 10 + (note.z||0),
        borderRadius:T.noteRadius, boxShadow:T.noteShadow, transform:`rotate(${rot}deg)`,
        outline: selected ? `2px solid ${T.accent}` : 'none', outlineOffset:1,
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
      <div onPointerDown={onHeaderDown} onDoubleClick={()=>setEditingTitle(true)}
        style={{
          display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
          background: tweaks.theme==='terminal' ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.05)',
          borderBottom: tweaks.theme==='terminal' ? `1px solid ${T.panelBorder}` : '1px solid rgba(0,0,0,.04)',
          cursor:'grab', userSelect:'none', flex:'none',
          fontFamily: tweaks.theme==='terminal' ? T.bodyFont : tweaks.font+', system-ui, sans-serif',
        }}>
        <button onClick={e=>{e.stopPropagation(); onChange({pinned:!note.pinned});}}
          title={note.pinned ? 'Pinned (visible in every folder) · click to unpin' : 'Pin to keep visible in every folder'}
          style={{...btnS(ink), padding:2}}>
          {note.pinned ? (
            <img src="./assets/pin-filled.png" width="16" height="16" alt="Pinned"
                 style={{display:'block'}} draggable={false}/>
          ) : (
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none" stroke={ink} strokeWidth="4" strokeLinejoin="round">
              <g transform="translate(50 50) rotate(-25)">
                <polygon points="-5,0 5,0 1.4,42 -1.4,42"/>
                <polygon points="-10,-6 10,-6 7,2 -7,2"/>
                <circle cx="0" cy="-22" r="22"/>
              </g>
            </svg>
          )}
        </button>
        {folder && <span title={folder.name} style={{width:6, height:6, background:folder.hue, borderRadius:'50%', flex:'none'}}/>}
        {editingTitle ? (
          <input autoFocus value={note.title}
            onChange={e=>onChange({title:e.target.value})}
            onBlur={()=>setEditingTitle(false)}
            onKeyDown={e=>{ if(e.key==='Enter') setEditingTitle(false); }}
            style={{flex:1, background:'transparent', border:'none', outline:'none', font:'inherit', color:'inherit', fontWeight:600, fontSize:12}}
          />
        ) : (
          <div style={{flex:1, fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {note.title || <span style={{opacity:.4}}>Untitled</span>}
          </div>
        )}
        {(() => {
          // Badge count reflects all links on this note, including ones whose
          // other endpoint lives in another folder (pinned notes follow the
          // user across folders, so cross-folder links are worth surfacing).
          const myLinks = linksFor ? linksFor(note.id) : [];
          return (
            <button onClick={e=>{e.stopPropagation(); onStartLink && onStartLink();}}
              title={myLinks.length ? `${myLinks.length} link${myLinks.length>1?'s':''} · click to add another` : 'Link to another note'}
              style={{...btnS(ink), opacity: myLinks.length ? 0.95 : 0.65, position:'relative'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round">
                <path d="M10 13a5 5 0 007 0l3-3a5 5 0 10-7-7l-1 1"/>
                <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 107 7l1-1"/>
              </svg>
              {myLinks.length > 0 && (
                <span style={{
                  position:'absolute', top:-2, right:-2, background:T.accent, color:'#fff',
                  fontSize:8, minWidth:12, height:12, borderRadius:6, padding:'0 3px',
                  display:'grid', placeItems:'center', fontWeight:700, lineHeight:1,
                }}>{myLinks.length}</span>
              )}
            </button>
          );
        })()}
        <button onClick={e=>{e.stopPropagation(); onDelete();}} title="Delete" style={btnS(ink)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button>
      </div>

      <div onDoubleClick={()=>setEditing(true)}
        style={{
          flex:1, padding:'10px 14px', overflow:'auto',
          fontFamily: tweaks.theme==='terminal' ? T.bodyFont : tweaks.font+', system-ui, sans-serif',
          fontSize: tweaks.theme==='paper' ? 18 : 13.5,
          lineHeight: tweaks.theme==='paper' ? 1.35 : 1.5,
          color:ink,
        }}>
        {editing ? (
          <textarea autoFocus value={note.body}
            onChange={e=>onChange({body:e.target.value})}
            onBlur={()=>setEditing(false)}
            style={{width:'100%', height:'100%', resize:'none', border:'none', outline:'none',
              background:'transparent', color:'inherit', font:'inherit', lineHeight:'inherit'}}
          />
        ) : (
          <div className="md-body" dangerouslySetInnerHTML={{__html: mdToHtml(note.body)}}
            onClick={(e)=>{
              const a = e.target.closest('[data-link]');
              if (a) { e.preventDefault(); onLinkClick(a.dataset.link); }
            }}
          />
        )}
      </div>

      <div style={{
        padding:'5px 10px', display:'flex', alignItems:'center', gap:6, flex:'none',
        borderTop: tweaks.theme==='terminal' ? `1px solid ${T.panelBorder}` : '1px solid rgba(0,0,0,.05)',
        background: tweaks.theme==='terminal' ? 'rgba(0,0,0,.2)' : 'transparent',
        fontSize:10, color:ink, opacity:.75,
      }}>
        <div style={{flex:1}}/>
        <ColorDots current={note.color} onPick={c=>onChange({color:c})} ink={ink}/>
      </div>

      <div onPointerDown={onResize}
        style={{position:'absolute', right:0, bottom:0, width:14, height:14, cursor:'nwse-resize',
          background: `linear-gradient(135deg, transparent 40%, ${withA(ink,0.25)} 40%, ${withA(ink,0.25)} 50%, transparent 50%, transparent 60%, ${withA(ink,0.25)} 60%, ${withA(ink,0.25)} 70%, transparent 70%)`,
        }}/>

      {menu && (() => {
        const myLinks = linksFor ? linksFor(note.id) : [];
        const notesById = Object.fromEntries(allNotes.map(x=>[x.id,x]));
        const linkSubmenu = myLinks.length ? myLinks.map(l => {
          const otherId = l.from===note.id ? l.to : l.from;
          const other = notesById[otherId];
          const arrow = l.from===note.id ? '→' : '←';
          return { label: `${arrow} ${other?.title || '(missing)'}`, onClick: () => onJumpToNote && onJumpToNote(otherId) };
        }) : [{label:'(no links yet)', onClick:()=>{}}];
        const candidates = allNotes.filter(n => n.id !== note.id).slice(0, 20);
        return (
          <ContextMenu T={T} x={menu.x-note.x} y={menu.y-note.y} onClose={()=>setMenu(null)} items={[
            {label:'Edit title', onClick:()=>setEditingTitle(true)},
            {label:'Edit body', onClick:()=>setEditing(true)},
            {label: note.pinned?'Unpin':'Pin to top', onClick:()=>onChange({pinned:!note.pinned})},
            {divider:true},
            {label:'Link to note ▶', submenu: candidates.map(n => ({
              label: n.title || 'Untitled', dot: (NOTE_COLORS.find(c=>c.id===n.color)||{}).paper,
              onClick: () => onAddLink && onAddLink(n.id),
            }))},
            {label:'Draw link…', onClick: () => onStartLink && onStartLink()},
            myLinks.length ? {label:`Linked notes (${myLinks.length}) ▶`, submenu: linkSubmenu} : null,
            {divider:true},
            {label:'Change color ▶', submenu: NOTE_COLORS.map(c=>({label:c.name, dot:c.paper, onClick:()=>onChange({color:c.id})}))},
            childFolders.length ? {label:'Move to folder ▶', submenu: childFolders.map(f=>({label:f.name, dot:f.hue, onClick:()=>onMoveToFolder(f.id)}))} : null,
            {label:'Add tag…', onClick:()=>{ const t = prompt('Tag:'); if(t) onChange({tags:[...(note.tags||[]), t]}); }},
            {divider:true},
            {label:'Delete…', destructive:true, onClick:onDelete},
          ].filter(Boolean)}/>
        );
      })()}
    </div>
  );
}

function btnS(ink) { return {background:'transparent', border:'none', cursor:'pointer', padding:4, borderRadius:4, display:'grid', placeItems:'center', color:ink, opacity:.65}; }
function ColorDots({current, onPick, ink}) {
  return <div style={{display:'flex', gap:4}}>
    {NOTE_COLORS.slice(0,6).map(c => (
      <button key={c.id} onClick={()=>onPick(c.id)} title={c.name} style={{
        width:10, height:10, borderRadius:'50%',
        border: current===c.id ? `1.5px solid ${ink}` : '1px solid rgba(0,0,0,.15)',
        background:c.paper, cursor:'pointer', padding:0,
      }}/>
    ))}
  </div>;
}

/* ==================================================================== */
/* CONTEXT MENU                                                          */
/* ==================================================================== */
function ContextMenu({T, x, y, items, onClose}) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (!ref.current || !ref.current.contains(e.target)) onClose(); };
    setTimeout(()=>window.addEventListener('mousedown', h), 0);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{
      position:'absolute', left:x, top:y, minWidth:180, zIndex:99999,
      background:T.panelBg, border:`1px solid ${T.panelBorder}`, borderRadius:8,
      boxShadow:'0 8px 32px rgba(0,0,0,.15)', padding:4, color:T.panelText,
    }}>
      {items.map((it,i) => it.divider ? <div key={i} style={{height:1, background:T.hairline, margin:'4px 0'}}/> :
        <div key={i} style={{position:'relative'}} className="ctx-row"
          onMouseEnter={e=>e.currentTarget.classList.add('hover')}
          onMouseLeave={e=>e.currentTarget.classList.remove('hover')}>
          <button onClick={()=>{ it.onClick?.(); if(!it.submenu) onClose(); }} style={{
            width:'100%', textAlign:'left', background:'transparent', border:'none',
            padding:'7px 10px', borderRadius:4, cursor:'pointer', fontSize:13,
            color: it.destructive ? '#c33' : T.panelText,
          }}>{it.label}</button>
          {it.submenu && <div className="ctx-sub" style={{
            position:'absolute', left:'100%', top:-4, minWidth:160,
            background:T.panelBg, border:`1px solid ${T.panelBorder}`, borderRadius:8, padding:4,
            boxShadow:'0 8px 32px rgba(0,0,0,.15)', display:'none',
          }}>
            {it.submenu.map((s,j)=>
              <button key={j} onClick={()=>{s.onClick?.(); onClose();}} style={{
                width:'100%', display:'flex', alignItems:'center', gap:8, textAlign:'left',
                background:'transparent', border:'none', padding:'6px 10px', borderRadius:4, cursor:'pointer',
                fontSize:13, color:T.panelText,
              }}>
                {s.dot && <span style={{width:10, height:10, borderRadius:3, background:s.dot, border:'1px solid rgba(0,0,0,.1)'}}/>}
                {s.label}
              </button>
            )}
          </div>}
        </div>
      )}
      <style>{`.ctx-row.hover > button { background: rgba(0,0,0,.05); } .ctx-row.hover .ctx-sub { display: block; }`}</style>
    </div>
  );
}

/* ==================================================================== */
/* CONFIRM                                                               */
/* ==================================================================== */
function ConfirmDialog({T, title, body, onCancel, onConfirm}) {
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(10,14,20,.35)', zIndex:100000, display:'grid', placeItems:'center'}}>
      <div style={{background:T.panelBg, color:T.panelText, borderRadius:12, border:`1px solid ${T.panelBorder}`, width:400, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <div style={{fontWeight:700, fontSize:16, marginBottom:6}}>{title}</div>
        <div style={{fontSize:13, color:T.muted, lineHeight:1.5}}>{body}</div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:18}}>
          <button onClick={onCancel} style={{padding:'8px 14px', background:'transparent', border:`1px solid ${T.panelBorder}`, borderRadius:8, fontSize:13, cursor:'pointer', color:T.panelText}}>Cancel</button>
          <button onClick={onConfirm} style={{padding:'8px 14px', background:'#c33b3b', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer'}}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* FOLDERS DRAWER (right side — list of folders)                         */
/* ==================================================================== */
function FoldersDrawer({T, tweaks, folders, notes, currentFolder, setCurrentFolder,
  onCreateFolder, onRenameFolder, renamingFolder, setRenamingFolder, onDeleteFolder,
  onDropNoteOnFolder, onDropNotesOnFolder, onCreateNote,
  open, setOpen,
  folderOrder, setFolderOrder}) {

  const isTerm = tweaks.theme==='terminal';
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  // Right-click context menu on a folder row. Shape: {x, y, folderId} | null.
  const [folderMenu, setFolderMenu] = useState(null);

  // Close the folder context menu on Escape (outside-click is handled by
  // the shared ContextMenu component itself).
  useEffect(() => {
    if (!folderMenu) return;
    const onKey = (e) => { if (e.key === 'Escape') setFolderMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [folderMenu]);

  // Ordered folders = user-defined order first (if saved), then any brand-new
  // folders not yet in the order appended alphabetically. Stale IDs are dropped.
  const realFolders = useMemo(() => {
    const allIds = Object.values(folders).filter(f => f.id !== 'root').map(f => f.id);
    const fromOrder = (folderOrder || []).filter(id => folders[id] && id !== 'root');
    const missing = allIds.filter(id => !fromOrder.includes(id))
      .sort((a,b) => folders[a].name.localeCompare(folders[b].name));
    return [...fromOrder, ...missing].map(id => folders[id]);
  }, [folders, folderOrder]);

  const moveFolder = (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const currentOrder = realFolders.map(f => f.id);
    const without = currentOrder.filter(id => id !== draggedId);
    const targetIdx = without.indexOf(targetId);
    if (targetIdx < 0) return;
    without.splice(targetIdx, 0, draggedId);
    setFolderOrder(without);
  };

  const renderRow = (f, isAll) => {
    const isActive = currentFolder===f.id;
    const count = isAll ? notes.length : notes.filter(n=>n.folder===f.id).length;
    const swatch = isAll ? T.accent : f.hue;
    const idleBg = tweaks.theme==='terminal'?'#0e1319':'rgba(0,0,0,.02)';
    const hoverBg = tweaks.theme==='terminal'?'#131a23':'rgba(0,0,0,.05)';

    const isDropTarget = dragOverFolderId === f.id;
    return (
      <div key={f.id}
        data-folder-id={f.id}
        draggable={!isAll && renamingFolder !== f.id}
        onDragStart={e => {
          if (isAll) return;
          e.dataTransfer.setData('folder-id', f.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={e=>{
          if (isAll) return;
          // Accept either a note drop (move note(s) into folder) or a folder drop (reorder)
          const hasNotes = e.dataTransfer.types.includes('note-ids');
          const hasFolder = e.dataTransfer.types.includes('folder-id');
          if (!hasNotes && !hasFolder) return;
          e.preventDefault();
          if (hasFolder) setDragOverFolderId(f.id);
          else { e.currentTarget.style.outline=`1px dashed ${T.accent}`; e.currentTarget.style.background = withA(T.accent,.2); }
        }}
        onDragLeave={e=>{
          e.currentTarget.style.outline='none';
          e.currentTarget.style.background = isActive ? withA(swatch,.16) : idleBg;
          if (dragOverFolderId === f.id) setDragOverFolderId(null);
        }}
        onDrop={(e)=>{
          e.currentTarget.style.outline='none';
          e.currentTarget.style.background = isActive ? withA(swatch,.16) : idleBg;
          setDragOverFolderId(null);
          const folderId = e.dataTransfer.getData('folder-id');
          if (folderId && !isAll) { moveFolder(folderId, f.id); return; }
          const raw = e.dataTransfer.getData('note-ids');
          if (raw && !isAll) {
            const ids = raw.split(',').filter(Boolean);
            if (ids.length > 1 && onDropNotesOnFolder) onDropNotesOnFolder(ids, f.id);
            else if (ids.length === 1) onDropNoteOnFolder(ids[0], f.id);
          }
        }}
        onClick={()=>setCurrentFolder(f.id)}
        onDoubleClick={()=>!isAll && setRenamingFolder(f.id)}
        onContextMenu={e=>{
          // Skip the All notes root row — it's not a real folder.
          if (isAll) return;
          e.preventDefault();
          e.stopPropagation();
          // ContextMenu uses position:absolute relative to its nearest
          // positioned ancestor (the drawer wrapper). Translate viewport
          // coords to coords inside that wrapper. Walk up to find it.
          let host = e.currentTarget.parentElement;
          while (host && getComputedStyle(host).position === 'static') host = host.parentElement;
          const rect = host ? host.getBoundingClientRect() : {left:0, top:0};
          setFolderMenu({x: e.clientX - rect.left, y: e.clientY - rect.top, folderId: f.id});
        }}
        style={{
          position:'relative', display:'flex', gap:10, padding:'11px 12px', marginBottom:6,
          borderRadius: isTerm?2:8,
          background: isActive ? withA(swatch,.16) : idleBg,
          border: `1px solid ${isActive ? withA(swatch,.5) : T.hairline}`,
          ...(isDropTarget && { borderTop: `2px solid ${T.accent}` }),
          cursor: isAll ? 'pointer' : 'grab',
          transition:'background .1s, border-color .1s',
        }}
        onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background = idleBg; }}
      >
        <div style={{width:4, borderRadius:2, background:swatch, flex:'none'}}/>
        <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10}}>
          {isAll
            ? <HomeIcon size={16} color={T.panelText}/>
            : <FolderIcon size={16} color={f.hue} fill={f.hue} open={isActive}/>}
          <div style={{flex:1, minWidth:0}}>
            {(!isAll && renamingFolder===f.id) ? (
              <input autoFocus defaultValue={f.name}
                onClick={e=>e.stopPropagation()}
                onBlur={e=>{ onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null); }}
                onKeyDown={e=>{ if(e.key==='Enter'){onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null);} if(e.key==='Escape'){setRenamingFolder(null);}}}
                style={{width:'100%', background:'transparent', border:'none', outline:'none', color:T.panelText, fontSize:13, fontWeight:700, font:'inherit'}}
              />
            ) : (
              <div style={{fontSize:13, fontWeight:700, color:T.panelText,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                fontFamily: isTerm?T.bodyFont:'inherit'}}>
                {isAll ? 'All notes' : f.name}
              </div>
            )}
            <div style={{fontSize:11, color:T.muted, marginTop:2, fontFamily: isTerm?T.bodyFont:'inherit'}}>
              {count} {count===1?'note':'notes'}
            </div>
          </div>
          {!isAll && isActive && (
            <button onClick={(e)=>{e.stopPropagation(); onDeleteFolder(f.id);}} title="Delete folder"
              style={{width:22, height:22, display:'grid', placeItems:'center',
                background:'transparent', border:'none', cursor:'pointer', color:T.muted,
                borderRadius:4, fontSize:14, lineHeight:1, padding:0,
              }}>×</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {!open && (
        <button onClick={()=>setOpen(true)} style={{
          position:'absolute', right:0, top:72, zIndex:19000,
          width:32, height:96, background:T.panelBg, color:T.panelText,
          border:`1px solid ${T.panelBorder}`, borderRight:'none',
          borderRadius:'10px 0 0 10px', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, fontWeight:700, letterSpacing:1.5, boxShadow:'0 4px 14px rgba(0,0,0,.08)',
        }}>
          <span style={{writingMode:'vertical-rl', transform:'rotate(180deg)'}}>FOLDERS · {realFolders.length}</span>
        </button>
      )}

      {open && (
        <div style={{
          position:'absolute', right:0, top:62, bottom:36, width:300,
          background:T.panelBg, border:`1px solid ${T.panelBorder}`,
          borderRadius: isTerm?2:10, margin:'0 10px 0 0',
          display:'flex', flexDirection:'column', overflow:'hidden', zIndex:18000,
          boxShadow:'0 10px 30px rgba(0,0,0,.12)',
          fontFamily: tweaks.font+', system-ui, sans-serif',
        }}>
          <div style={{padding:'10px 12px', display:'flex', alignItems:'center', gap:8,
            borderBottom:`1px solid ${T.hairline}`}}>
            <div style={{fontSize:14, fontWeight:700, color:T.panelText, flex:1, letterSpacing:isTerm?0.5:0}}>
              {isTerm ? '// folders' : 'Folders'}
            </div>
            <button onClick={onCreateFolder} title="New folder" style={{
              height:26, padding:'0 10px', borderRadius: isTerm?2:6,
              background:'transparent', color:T.panelText, border:`1px solid ${T.panelBorder}`,
              fontWeight:600, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5,
            }}>
              <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span> folder
            </button>
            <button onClick={()=>setOpen(false)} title="Hide" style={{
              width:24, height:24, background:'transparent', border:'none', cursor:'pointer',
              color:T.muted, fontSize:16, lineHeight:1, padding:0, borderRadius:4,
            }}>›</button>
          </div>

          <div style={{flex:1, overflow:'auto', padding:'8px'}}>
            {renderRow({id:'root', name:'All notes'}, true)}
            {realFolders.length>0 && (
              <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1.5, opacity:.5,
                padding:'12px 12px 6px', color:T.panelText}}>
                Your folders
              </div>
            )}
            {realFolders.map(f => renderRow(f, false))}
            {/* Faint full-width affordance to create a folder, sitting in the
                empty space below the last folder row. The original "+ folder"
                button in the header still works. */}
            <button onClick={()=>onCreateFolder()} title="Create folder" style={{
              width:'100%', height:30, marginTop: realFolders.length>0 ? 4 : 12,
              padding:'0 10px', borderRadius: isTerm?2:6,
              background:'transparent', color:T.muted,
              border:`1px dashed ${T.panelBorder}`,
              fontSize:12, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              transition:'background .12s, color .12s, transform .12s',
              fontFamily: isTerm?T.bodyFont:'inherit',
            }}
              onMouseEnter={e=>{
                e.currentTarget.style.background = isTerm?'#131a23':'rgba(0,0,0,.04)';
                e.currentTarget.style.color = T.panelText;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = T.muted;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span> Create folder
            </button>
          </div>

          {folderMenu && (
            <ContextMenu T={T} x={folderMenu.x} y={folderMenu.y}
              onClose={()=>setFolderMenu(null)}
              items={[
                {label:'Rename', onClick:()=>setRenamingFolder(folderMenu.folderId)},
                {label:'Delete folder', destructive:true, onClick:()=>onDeleteFolder(folderMenu.folderId)},
              ]}
            />
          )}

          <div style={{
            padding:'8px 12px', borderTop:`1px solid ${T.hairline}`, background: tweaks.theme==='terminal'?'#0a0c10':'rgba(0,0,0,.02)',
            fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:8,
          }}>
            <button onClick={onCreateNote} style={{
              flex:1, height:28, padding:'0 10px', borderRadius: isTerm?2:6,
              background:T.accent, color: isTerm?'#0a0c10':'#fff', border:'none',
              fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            }}>
              <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span>
              new sticky
              <kbd style={{fontFamily:'ui-monospace, monospace', fontSize:9, background:'rgba(0,0,0,.18)', padding:'1px 4px', borderRadius:3, marginLeft:2}}>N</kbd>
            </button>
          </div>
        </div>
      )}
    </>
  );
}


/* ==================================================================== */
/* TWEAK PANEL                                                           */
/* ==================================================================== */
function TweakPanel({T, tweaks, update, onClose}) {
  return (
    <div style={{
      position:'fixed', right:16, bottom:44, width:280, zIndex:90000,
      background:T.panelBg, color:T.panelText, borderRadius:12,
      border:`1px solid ${T.panelBorder}`, boxShadow:'0 20px 60px rgba(0,0,0,.25)',
      padding:14, fontFamily:'Inter, system-ui, sans-serif',
    }}>
      <div style={{fontWeight:700, fontSize:13, marginBottom:12, display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:8, height:8, borderRadius:'50%', background:T.accent}}/>Preferences
        {onClose && (
          <button onClick={onClose} aria-label="Close preferences" style={{
            marginLeft:'auto', background:'none', border:'none', cursor:'pointer',
            fontSize:16, lineHeight:1, color:T.panelText, opacity:.6, padding:2,
          }}>×</button>
        )}
      </div>
      <Label>Visual style</Label>
      <Segmented T={T} value={tweaks.theme} onChange={v=>update({theme:v})} options={[
        {id:'paper',label:'Paper'},{id:'flat',label:'Flat'},{id:'terminal',label:'Terminal'}
      ]}/>
      <Label>Font</Label>
      <Segmented T={T} value={tweaks.font} onChange={v=>update({font:v})} options={[
        {id:'Inter',label:'Inter'},{id:'Source Serif 4',label:'Serif'},{id:'IBM Plex Mono',label:'Mono'},{id:'Caveat',label:'Handwritten'}
      ]}/>
      <Label>Density</Label>
      <Segmented T={T} value={tweaks.density} onChange={v=>update({density:v})} options={[
        {id:'compact',label:'Compact'},{id:'cozy',label:'Cozy'},{id:'spacious',label:'Spacious'}
      ]}/>
      <Label>Link overlay</Label>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <input type="checkbox" checked={tweaks.showLinks} onChange={e=>update({showLinks:e.target.checked})}/>
        <span style={{fontSize:12}}>Show [[wiki links]] as arrows</span>
      </div>
      <Label>Note rotation (paper theme)</Label>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <input type="checkbox" checked={tweaks.tilt !== false} onChange={e=>update({tilt:e.target.checked})}/>
        <span style={{fontSize:12}}>Tilt notes at a slight angle</span>
      </div>
    </div>
  );
}
function Label({children}) {
  return <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.6, margin:'12px 0 6px'}}>{children}</div>;
}
function Segmented({T, value, onChange, options}) {
  return (
    <div style={{display:'flex', background:'rgba(0,0,0,.04)', padding:2, borderRadius:8, border:`1px solid ${T.panelBorder}`, gap:2}}>
      {options.map(o => (
        <button key={o.id} onClick={()=>onChange(o.id)} style={{
          flex:1, border:'none', padding:'6px 8px', fontSize:12, borderRadius:6,
          background: value===o.id ? T.panelBg : 'transparent',
          boxShadow: value===o.id ? `0 1px 2px rgba(0,0,0,.08), 0 0 0 1px ${T.panelBorder}` : 'none',
          color:T.panelText, fontWeight: value===o.id?600:500, cursor:'pointer',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

/* ==================================================================== */
/* STATUS BAR                                                            */
/* ==================================================================== */
function StatusBar({T, tweaks, folderName, noteCount, folderCount}) {
  return (
    <div style={{
      position:'absolute', left:0, right:0, bottom:0, height:28,
      background:T.panelBg, borderTop:`1px solid ${T.panelBorder}`,
      display:'flex', alignItems:'center', padding:'0 14px', gap:16,
      fontSize:11, color:T.muted, zIndex:20000,
      fontFamily: tweaks.theme==='terminal' ? T.bodyFont : 'inherit',
    }}>
      <span>in: {folderName}</span>
      <span style={{opacity:.4}}>·</span>
      <span>{noteCount} note{noteCount===1?'':'s'}</span>
      <span style={{opacity:.4}}>·</span>
      <span>{folderCount} subfolder{folderCount===1?'':'s'}</span>
      <div style={{flex:1}}/>
      <span>auto-saved</span>
      <span style={{opacity:.4}}>·</span>
      <span style={{color:T.accent}}>●</span>
      <span>synced</span>
    </div>
  );
}

/* ==================================================================== */
/* GLOBAL CSS                                                            */
/* ==================================================================== */
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  .md-body h3 { font-size: 1.05em; margin: 0 0 4px; font-weight: 700; }
  .md-body h4 { font-size: 1em; margin: 8px 0 2px; font-weight: 700; opacity: .85; }
  .md-body p { margin: 0 0 6px; }
  .md-body ul { margin: 0 0 6px; padding-left: 18px; }
  .md-body li { margin: 1px 0; }
  .md-body code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .88em; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 3px; }
  .md-body a.note-link { color: inherit; text-decoration: underline dotted; cursor: pointer; background: rgba(0,0,0,.05); padding: 0 3px; border-radius: 2px; }
  .md-body a.note-link:hover { background: rgba(0,0,0,.12); }
  kbd { font-family: ui-monospace, monospace; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
`;
document.head.appendChild(globalStyle);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
